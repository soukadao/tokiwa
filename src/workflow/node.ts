import { InvalidArgumentError } from "../core/index.js";
import type { ConversationMemory } from "./conversation-store.js";

export interface NodeExecutionContext<Context = unknown, Input = unknown> {
  workflowId: string;
  nodeId: string;
  runId: string;
  conversationId?: string;
  context?: Context;
  input?: Input;
  event?: unknown;
  results: Record<string, unknown>;
  getResult<T = unknown>(nodeId: string): T | undefined;
  memory?: ConversationMemory;
  getMemory?: () => ConversationMemory | undefined;
  setMemory?: (next: ConversationMemory) => void | Promise<void>;
  updateMemory?: (patch: Partial<ConversationMemory>) => void | Promise<void>;
}

export type NodeHandler<
  Context = unknown,
  Input = unknown,
  Output = unknown,
> = (context: NodeExecutionContext<Context, Input>) => Output | Promise<Output>;

export interface RetryPolicy {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

export interface NodeDefinition<
  Context = unknown,
  Input = unknown,
  Output = unknown,
> {
  id: string;
  name?: string;
  dependsOn?: string[];
  handler: NodeHandler<Context, Input, Output>;
  retry?: RetryPolicy;
}

const MIN_RETRY_ATTEMPTS = 1;
const MIN_BACKOFF_MULTIPLIER = 1;
const MIN_DELAY_MS = 0;

const validateInteger = (value: number, name: string, min: number): number => {
  if (!Number.isInteger(value) || value < min) {
    throw new InvalidArgumentError(
      `Node retry ${name} must be an integer >= ${min}`,
    );
  }
  return value;
};

const validateNumber = (value: number, name: string, min: number): number => {
  if (!Number.isFinite(value) || value < min) {
    throw new InvalidArgumentError(
      `Node retry ${name} must be a number >= ${min}`,
    );
  }
  return value;
};

export class Node<Context = unknown, Input = unknown, Output = unknown> {
  readonly id: string;
  readonly name?: string;
  readonly handler: NodeHandler<Context, Input, Output>;
  readonly retry?: RetryPolicy;
  private readonly dependencies = new Set<string>();

  constructor(definition: NodeDefinition<Context, Input, Output>) {
    if (!definition.id || definition.id.trim().length === 0) {
      throw new InvalidArgumentError("Node id must be a non-empty string");
    }

    this.id = definition.id;
    this.name = definition.name;
    this.handler = definition.handler;
    this.retry = definition.retry
      ? {
          maxAttempts:
            definition.retry.maxAttempts === undefined
              ? undefined
              : validateInteger(
                  definition.retry.maxAttempts,
                  "maxAttempts",
                  MIN_RETRY_ATTEMPTS,
                ),
          initialDelayMs:
            definition.retry.initialDelayMs === undefined
              ? undefined
              : validateNumber(
                  definition.retry.initialDelayMs,
                  "initialDelayMs",
                  MIN_DELAY_MS,
                ),
          backoffMultiplier:
            definition.retry.backoffMultiplier === undefined
              ? undefined
              : validateNumber(
                  definition.retry.backoffMultiplier,
                  "backoffMultiplier",
                  MIN_BACKOFF_MULTIPLIER,
                ),
          maxDelayMs:
            definition.retry.maxDelayMs === undefined
              ? undefined
              : validateNumber(
                  definition.retry.maxDelayMs,
                  "maxDelayMs",
                  MIN_DELAY_MS,
                ),
          jitterMs:
            definition.retry.jitterMs === undefined
              ? undefined
              : validateNumber(
                  definition.retry.jitterMs,
                  "jitterMs",
                  MIN_DELAY_MS,
                ),
        }
      : undefined;

    if (definition.dependsOn) {
      for (const dep of definition.dependsOn) {
        this.dependencies.add(dep);
      }
    }
  }

  addDependency(nodeId: string): void {
    this.dependencies.add(nodeId);
  }

  get dependsOn(): string[] {
    return Array.from(this.dependencies);
  }
}
