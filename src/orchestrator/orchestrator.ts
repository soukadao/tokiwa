import {
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
  RuntimeError,
  StateError,
} from "../core/index.js";
import type {
  ConversationMemory,
  ConversationStore,
} from "../workflow/conversation-store.js";
import type { RunStore, WorkflowRunRecord } from "../workflow/run-store.js";
import { toRunRecord } from "../workflow/run-store.js";
import {
  Runner,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "../workflow/runner.js";
import type { EventTrigger, Trigger } from "../workflow/trigger.js";
import type { Workflow } from "../workflow/workflow.js";
import { Event, type EventMetadata } from "./event.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type { EventQueue } from "./event-queue.js";
import { Queue } from "./queue.js";
import { Snapshot } from "./snapshot.js";

const MIN_CONCURRENCY = 1;
const DEFAULT_MAX_CONCURRENT_EVENTS = 1;
const DEFAULT_WORKFLOW_CONCURRENCY = 2;
const DEFAULT_MODE: OrchestratorMode = "all";
const MISSING_SCHEDULER_MESSAGE =
  "Cron scheduler is not configured. Provide OrchestratorOptions.scheduler.";
const MISSING_WORKER_MODE_MESSAGE = "Drain is not available in producer mode.";
const MISSING_CONVERSATION_STORE_MESSAGE =
  "Conversation store is not configured. Provide OrchestratorOptions.conversationStore.";
const CHATFLOW_REQUIRES_CONVERSATION_ID =
  "Chatflow requires conversationId to run.";
const CHATFLOW_CRON_UNSUPPORTED =
  "Chatflow workflows cannot be scheduled by cron.";

export type CronJobHandler = () => void | Promise<void>;

export interface CronScheduler {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  addJob(
    id: string,
    cronExpression: string,
    handler: CronJobHandler,
    name?: string,
  ): void;
  removeJob(id: string): boolean;
  isJobScheduled(id: string): boolean;
}

export interface WorkflowErrorContext {
  workflowId: string;
  event: Event;
  trigger: Trigger<Event, unknown, unknown>;
}

export type WorkflowErrorHandler = (
  error: Error,
  context: WorkflowErrorContext,
) => void | Promise<void>;

export type OrchestratorMode = "all" | "producer" | "worker";

export type RunStoreErrorHandler = (
  error: Error,
  record: WorkflowRunRecord,
) => void | Promise<void>;

export interface OrchestratorOptions {
  maxConcurrentEvents?: number;
  workflowConcurrency?: number;
  mode?: OrchestratorMode;
  queue?: EventQueue;
  scheduler?: CronScheduler;
  onWorkflowError?: WorkflowErrorHandler;
  conversationStore?: ConversationStore;
  runStore?: RunStore;
  onRunStoreError?: RunStoreErrorHandler;
}

interface RegisteredWorkflow<Context = unknown, Input = unknown> {
  workflow: Workflow<Context, Input>;
  trigger: Trigger<Event, Input, Context>;
  options?: WorkflowRunOptions<Context, Input>;
}

type AnyRegisteredWorkflow = RegisteredWorkflow<unknown, unknown>;
type EventRegisteredWorkflow = RegisteredWorkflow<unknown, unknown> & {
  trigger: EventTrigger<Event, unknown, unknown>;
};

interface OrchestratorMetrics {
  published: number;
  processed: number;
  dispatchErrors: number;
  workflowRuns: number;
  workflowErrors: number;
}

export class Orchestrator {
  readonly dispatcher: EventDispatcher;
  readonly queue: EventQueue;
  readonly runner: Runner;
  private readonly workflows = new Map<string, AnyRegisteredWorkflow>();
  private readonly eventWorkflowIndex = new Map<
    string,
    Set<EventRegisteredWorkflow>
  >();
  private readonly wildcardEventWorkflows = new Set<EventRegisteredWorkflow>();
  private readonly regexEventWorkflows = new Set<EventRegisteredWorkflow>();
  private readonly maxConcurrentEvents: number;
  private readonly workflowConcurrency: number;
  private readonly mode: OrchestratorMode;
  private readonly scheduler?: CronScheduler;
  private readonly onWorkflowError?: WorkflowErrorHandler;
  private readonly conversationStore?: ConversationStore;
  private readonly runStore?: RunStore;
  private readonly onRunStoreError?: RunStoreErrorHandler;
  private readonly conversationLocks = new Map<string, Promise<void>>();
  private isRunning = false;
  private processing: Promise<void> | null = null;
  private metrics: OrchestratorMetrics = {
    published: 0,
    processed: 0,
    dispatchErrors: 0,
    workflowRuns: 0,
    workflowErrors: 0,
  };

  constructor(options: OrchestratorOptions = {}) {
    this.dispatcher = new EventDispatcher();
    this.queue = options.queue ?? new Queue();
    this.runner = new Runner();
    this.maxConcurrentEvents = Math.max(
      MIN_CONCURRENCY,
      options.maxConcurrentEvents ?? DEFAULT_MAX_CONCURRENT_EVENTS,
    );
    this.workflowConcurrency = Math.max(
      MIN_CONCURRENCY,
      options.workflowConcurrency ?? DEFAULT_WORKFLOW_CONCURRENCY,
    );
    this.mode = options.mode ?? DEFAULT_MODE;
    this.scheduler = options.scheduler;
    this.onWorkflowError = options.onWorkflowError;
    this.conversationStore = options.conversationStore;
    this.runStore = options.runStore;
    this.onRunStoreError = options.onRunStoreError;
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    if (this.shouldStartScheduler()) {
      void Promise.resolve(this.scheduler?.start()).catch(() => {});
    }
    if (this.isWorkerMode()) {
      void this.kick();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.scheduler && this.shouldStartScheduler()) {
      await this.scheduler.stop();
    }
    if (this.processing) {
      await this.processing;
    }
  }

  publish<TPayload = unknown>(
    type: string,
    payload?: TPayload,
    metadata?: EventMetadata,
  ): Event<TPayload> {
    const event = Event.create(type, payload, metadata);
    this.enqueue(event);
    return event;
  }

  enqueue(event: Event): void {
    this.queue.enqueue(event);
    this.metrics.published += 1;

    if (this.isRunning && this.isWorkerMode()) {
      void this.kick();
    }
  }

  async drain(): Promise<void> {
    if (!this.isWorkerMode()) {
      throw new StateError(MISSING_WORKER_MODE_MESSAGE);
    }
    await this.kick(true);
  }

  registerWorkflow<Context = unknown, Input = unknown>(
    workflow: Workflow<Context, Input>,
    trigger: Trigger<Event, Input, Context> = { type: "manual" },
    options?: WorkflowRunOptions<Context, Input>,
  ): void {
    if (this.workflows.has(workflow.id)) {
      throw new ConflictError(`Workflow already registered: ${workflow.id}`);
    }

    const registration: RegisteredWorkflow<Context, Input> = {
      workflow,
      trigger,
      options,
    };

    const storedRegistration = registration as AnyRegisteredWorkflow;
    this.workflows.set(workflow.id, storedRegistration);
    this.indexWorkflow(storedRegistration);
  }

  registerCronJob(
    jobId: string,
    cronExpression: string,
    handler: CronJobHandler,
    name?: string,
  ): void {
    this.getScheduler().addJob(jobId, cronExpression, handler, name);
  }

  registerCronEvent<TPayload = unknown>(
    jobId: string,
    cronExpression: string,
    eventType: string,
    payload?: TPayload,
    metadata?: EventMetadata,
    name?: string,
  ): void {
    this.registerCronJob(
      jobId,
      cronExpression,
      () => {
        this.publish(eventType, payload, metadata);
      },
      name,
    );
  }

  registerCronWorkflow<Context = unknown, Input = unknown>(
    jobId: string,
    cronExpression: string,
    workflowId: string,
    options?: WorkflowRunOptions<Context, Input>,
    name?: string,
  ): void {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }
    if (registration.workflow.type === "chatflow") {
      throw new InvalidArgumentError(CHATFLOW_CRON_UNSUPPORTED);
    }

    this.registerCronJob(
      jobId,
      cronExpression,
      async () => {
        await this.runWorkflow<Context, Input>(workflowId, options);
      },
      name,
    );
  }

  removeCronJob(jobId: string): boolean {
    return this.getScheduler().removeJob(jobId);
  }

  isCronJobScheduled(jobId: string): boolean {
    return this.getScheduler().isJobScheduled(jobId);
  }

  unregisterWorkflow(workflowId: string): boolean {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      return false;
    }

    this.unindexWorkflow(registration);
    return this.workflows.delete(workflowId);
  }

  async runWorkflow<Context = unknown, Input = unknown>(
    workflowId: string,
    options?: WorkflowRunOptions<Context, Input>,
  ): Promise<WorkflowRunResult> {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }

    const mergedOptions: WorkflowRunOptions<unknown, unknown> = {
      ...(registration.options ?? {}),
      ...(options ?? {}),
    };

    this.metrics.workflowRuns += 1;

    const result = await this.executeWorkflow(registration, mergedOptions);

    if (result.status === "failed") {
      this.metrics.workflowErrors += 1;
    }

    return result;
  }

  snapshot(): Snapshot {
    return new Snapshot({
      isRunning: this.isRunning,
      mode: this.mode,
      queueSize: this.queue.size(),
      metrics: { ...this.metrics },
    });
  }

  private async kick(allowWhenStopped: boolean = false): Promise<void> {
    if (this.processing) {
      return this.processing;
    }

    const run = async (): Promise<void> => {
      do {
        await this.processQueue(allowWhenStopped);
      } while (this.shouldContinueProcessing(allowWhenStopped));
    };

    this.processing = run().finally(() => {
      this.processing = null;
      if (this.shouldContinueProcessing(allowWhenStopped)) {
        void this.kick(allowWhenStopped);
      }
    });

    return this.processing;
  }

  private getScheduler(): CronScheduler {
    if (!this.scheduler) {
      throw new StateError(MISSING_SCHEDULER_MESSAGE);
    }
    return this.scheduler;
  }

  private getConversationStore(): ConversationStore {
    if (!this.conversationStore) {
      throw new StateError(MISSING_CONVERSATION_STORE_MESSAGE);
    }
    return this.conversationStore;
  }

  private isWorkerMode(): boolean {
    return this.mode !== "producer";
  }

  private shouldStartScheduler(): boolean {
    return this.mode !== "worker";
  }

  private async withConversationLock<T>(
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.conversationLocks.get(conversationId) ?? Promise.resolve();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.catch(() => {}).then(() => gate);
    this.conversationLocks.set(conversationId, chain);

    await previous.catch(() => {});
    try {
      return await task();
    } finally {
      if (release) {
        release();
      }
      if (this.conversationLocks.get(conversationId) === chain) {
        this.conversationLocks.delete(conversationId);
      }
    }
  }

  private async processQueue(allowWhenStopped: boolean): Promise<void> {
    const inFlight = new Set<Promise<void>>();

    while (this.queue.size() > 0 || inFlight.size > 0) {
      while (
        (this.isRunning || allowWhenStopped) &&
        this.queue.size() > 0 &&
        inFlight.size < this.maxConcurrentEvents
      ) {
        const event = this.queue.dequeue();
        if (!event) {
          break;
        }

        const task = this.processEvent(event).finally(() => {
          inFlight.delete(task);
        });
        inFlight.add(task);
      }

      if (inFlight.size === 0) {
        break;
      }

      await Promise.race(inFlight);
    }
  }

  private async processEvent(event: Event): Promise<void> {
    this.metrics.processed += 1;
    const dispatchResult = await this.dispatcher.dispatch(event);
    this.metrics.dispatchErrors += dispatchResult.errors.length;

    await this.runTriggeredWorkflows(event);
  }

  private async runTriggeredWorkflows(event: Event): Promise<void> {
    const triggered = this.getTriggeredWorkflows(event);
    if (triggered.length === 0) {
      return;
    }

    const inFlight = new Set<Promise<void>>();

    const schedule = (registration: EventRegisteredWorkflow): void => {
      const task = this.executeTriggeredWorkflow(registration, event)
        .catch((error: unknown) => {
          const err =
            error instanceof Error
              ? error
              : new RuntimeError(String(error), { cause: error });
          void this.handleWorkflowError(err, registration, event);
        })
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    };

    for (const registration of triggered) {
      while (inFlight.size >= this.workflowConcurrency) {
        await Promise.race(inFlight);
      }
      schedule(registration);
    }

    if (inFlight.size > 0) {
      await Promise.all(inFlight);
    }
  }

  private async executeTriggeredWorkflow(
    registration: EventRegisteredWorkflow,
    event: Event,
  ): Promise<void> {
    const trigger = registration.trigger;
    const baseOptions = registration.options ?? {};
    const input =
      trigger.mapInput?.(event) ?? baseOptions.input ?? event.payload;
    const context = trigger.mapContext?.(event) ?? baseOptions.context;
    const conversationId =
      trigger.mapConversationId?.(event) ?? baseOptions.conversationId;

    this.metrics.workflowRuns += 1;

    try {
      const result = await this.executeWorkflow(registration, {
        ...baseOptions,
        input,
        context,
        event,
        conversationId,
      });

      if (result.status === "failed") {
        this.metrics.workflowErrors += 1;
      }
    } catch (error: unknown) {
      this.metrics.workflowErrors += 1;
      throw error;
    }
  }

  private mergeMemory(
    base?: ConversationMemory,
    override?: ConversationMemory,
  ): ConversationMemory | undefined {
    if (!base && !override) {
      return undefined;
    }
    return { ...(base ?? {}), ...(override ?? {}) };
  }

  private async saveRunRecord(result: WorkflowRunResult): Promise<void> {
    if (!this.runStore) {
      return;
    }
    const record = toRunRecord(result);
    try {
      await this.runStore.save(record);
    } catch (error: unknown) {
      const err =
        error instanceof Error
          ? error
          : new RuntimeError(String(error), { cause: error });
      if (this.onRunStoreError) {
        await this.onRunStoreError(err, record);
        return;
      }
      throw err;
    }
  }

  private async executeWorkflow(
    registration: AnyRegisteredWorkflow,
    options: WorkflowRunOptions<unknown, unknown>,
  ): Promise<WorkflowRunResult> {
    const workflow = registration.workflow;
    if (workflow.type !== "chatflow") {
      const result = await this.runner.run(workflow, options);
      await this.saveRunRecord(result);
      return result;
    }

    const conversationId = options.conversationId;
    if (!conversationId || conversationId.trim().length === 0) {
      throw new InvalidArgumentError(CHATFLOW_REQUIRES_CONVERSATION_ID);
    }

    return this.withConversationLock(conversationId, async () => {
      const store = this.getConversationStore();
      const storedMemory = await store.get(conversationId);
      const memory = this.mergeMemory(storedMemory, options.memory);

      const result = await this.runner.run(workflow, {
        ...options,
        conversationId,
        memory,
      });

      await store.set(conversationId, result.memory ?? memory ?? {});
      await this.saveRunRecord(result);
      return result;
    });
  }

  private getTriggeredWorkflows(event: Event): EventRegisteredWorkflow[] {
    const candidates = new Set<EventRegisteredWorkflow>();

    const direct = this.eventWorkflowIndex.get(event.type);
    if (direct) {
      for (const registration of direct) {
        candidates.add(registration);
      }
    }

    for (const registration of this.wildcardEventWorkflows) {
      candidates.add(registration);
    }

    for (const registration of this.regexEventWorkflows) {
      if (this.matchesEventType(registration.trigger.eventType, event.type)) {
        candidates.add(registration);
      }
    }

    if (candidates.size === 0) {
      return [];
    }

    const matches: EventRegisteredWorkflow[] = [];
    for (const registration of candidates) {
      if (registration.trigger.filter && !registration.trigger.filter(event)) {
        continue;
      }
      matches.push(registration);
    }

    return matches;
  }

  private matchesEventType(
    matcher: EventTrigger<Event, unknown, unknown>["eventType"],
    eventType: string,
  ): boolean {
    if (matcher instanceof RegExp) {
      if (matcher.global || matcher.sticky) {
        matcher.lastIndex = 0;
      }
      return matcher.test(eventType);
    }

    if (Array.isArray(matcher)) {
      return matcher.includes(eventType);
    }

    if (matcher === "*") {
      return true;
    }

    return matcher === eventType;
  }

  private indexWorkflow(registration: AnyRegisteredWorkflow): void {
    if (!this.isEventRegistration(registration)) {
      return;
    }

    const matcher = registration.trigger.eventType;

    if (matcher instanceof RegExp) {
      this.regexEventWorkflows.add(registration);
      return;
    }

    if (Array.isArray(matcher)) {
      for (const eventType of matcher) {
        if (eventType === "*") {
          this.wildcardEventWorkflows.add(registration);
        } else {
          this.addEventIndex(eventType, registration);
        }
      }
      return;
    }

    if (matcher === "*") {
      this.wildcardEventWorkflows.add(registration);
      return;
    }

    this.addEventIndex(matcher, registration);
  }

  private unindexWorkflow(registration: AnyRegisteredWorkflow): void {
    if (!this.isEventRegistration(registration)) {
      return;
    }

    const matcher = registration.trigger.eventType;

    if (matcher instanceof RegExp) {
      this.regexEventWorkflows.delete(registration);
      return;
    }

    if (Array.isArray(matcher)) {
      for (const eventType of matcher) {
        if (eventType === "*") {
          this.wildcardEventWorkflows.delete(registration);
        } else {
          this.removeEventIndex(eventType, registration);
        }
      }
      return;
    }

    if (matcher === "*") {
      this.wildcardEventWorkflows.delete(registration);
      return;
    }

    this.removeEventIndex(matcher, registration);
  }

  private addEventIndex(
    eventType: string,
    registration: EventRegisteredWorkflow,
  ): void {
    const bucket = this.eventWorkflowIndex.get(eventType);
    if (bucket) {
      bucket.add(registration);
      return;
    }

    this.eventWorkflowIndex.set(eventType, new Set([registration]));
  }

  private removeEventIndex(
    eventType: string,
    registration: EventRegisteredWorkflow,
  ): void {
    const bucket = this.eventWorkflowIndex.get(eventType);
    if (!bucket) {
      return;
    }

    bucket.delete(registration);
    if (bucket.size === 0) {
      this.eventWorkflowIndex.delete(eventType);
    }
  }

  private shouldContinueProcessing(allowWhenStopped: boolean): boolean {
    return (this.isRunning || allowWhenStopped) && this.queue.size() > 0;
  }

  private isEventRegistration(
    registration: AnyRegisteredWorkflow,
  ): registration is EventRegisteredWorkflow {
    return registration.trigger.type === "event";
  }

  private async handleWorkflowError(
    error: Error,
    registration: EventRegisteredWorkflow,
    event: Event,
  ): Promise<void> {
    if (!this.onWorkflowError) {
      return;
    }

    try {
      await this.onWorkflowError(error, {
        workflowId: registration.workflow.id,
        event,
        trigger: registration.trigger,
      });
    } catch {
      // Ignore errors raised by the error handler itself.
    }
  }
}
