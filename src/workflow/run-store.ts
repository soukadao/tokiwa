import type { FileSystem } from "../core/file-system.js";
import { FileSystem as DefaultFileSystem } from "../core/file-system.js";
import type { ConversationMemory } from "./conversation-store.js";
import type { WorkflowRunResult, WorkflowTimelineEntry } from "./runner.js";

export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorInfo | string;
}

export type WorkflowTimelineRecord =
  | {
      type: "run_start";
      timestamp: string;
    }
  | {
      type: "run_complete";
      timestamp: string;
      status: "succeeded" | "failed";
      durationMs: number;
    }
  | {
      type: "node_start";
      nodeId: string;
      timestamp: string;
      attempt: number;
    }
  | {
      type: "node_complete";
      nodeId: string;
      timestamp: string;
      durationMs: number;
      attempt: number;
    }
  | {
      type: "node_retry";
      nodeId: string;
      timestamp: string;
      attempt: number;
      nextDelayMs: number;
      error: ErrorInfo;
    }
  | {
      type: "node_error";
      nodeId: string;
      timestamp: string;
      attempt: number;
      error: ErrorInfo;
    };

export interface WorkflowRunRecord {
  runId: string;
  workflowId: string;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: Record<string, unknown>;
  errors: Record<string, ErrorInfo>;
  attempts: Record<string, number>;
  timeline: WorkflowTimelineRecord[];
  conversationId?: string;
  memory?: ConversationMemory;
}

export interface RunStoreListOptions {
  workflowId?: string;
  limit?: number;
}

export interface RunStore {
  save(record: WorkflowRunRecord): Promise<void>;
  get(runId: string): Promise<WorkflowRunRecord | undefined>;
  list?(options?: RunStoreListOptions): Promise<WorkflowRunRecord[]>;
}

const stringifyCause = (cause: unknown): string => {
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
};

const toErrorInfo = (error: Error): ErrorInfo => {
  const base: ErrorInfo = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return { ...base, cause: toErrorInfo(cause) };
  }
  if (cause !== undefined) {
    return { ...base, cause: stringifyCause(cause) };
  }
  return base;
};

const serializeTimelineEntry = (
  entry: WorkflowTimelineEntry,
): WorkflowTimelineRecord => {
  switch (entry.type) {
    case "run_start":
      return {
        type: entry.type,
        timestamp: entry.timestamp.toISOString(),
      };
    case "run_complete":
      return {
        type: entry.type,
        timestamp: entry.timestamp.toISOString(),
        status: entry.status,
        durationMs: entry.durationMs,
      };
    case "node_start":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt,
      };
    case "node_complete":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        durationMs: entry.durationMs,
        attempt: entry.attempt,
      };
    case "node_retry":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt,
        nextDelayMs: entry.nextDelayMs,
        error: toErrorInfo(entry.error),
      };
    case "node_error":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt,
        error: toErrorInfo(entry.error),
      };
  }
};

export const toRunRecord = (result: WorkflowRunResult): WorkflowRunRecord => {
  const errors: Record<string, ErrorInfo> = {};
  for (const [nodeId, error] of Object.entries(result.errors)) {
    errors[nodeId] = toErrorInfo(error);
  }
  return {
    runId: result.runId,
    workflowId: result.workflowId,
    status: result.status,
    startedAt: result.startedAt.toISOString(),
    finishedAt: result.finishedAt.toISOString(),
    durationMs: result.durationMs,
    results: result.results,
    errors,
    attempts: result.attempts,
    timeline: result.timeline.map(serializeTimelineEntry),
    conversationId: result.conversationId,
    memory: result.memory,
  };
};

export class InMemoryRunStore implements RunStore {
  private readonly store = new Map<string, WorkflowRunRecord>();

  async save(record: WorkflowRunRecord): Promise<void> {
    this.store.set(record.runId, record);
  }

  async get(runId: string): Promise<WorkflowRunRecord | undefined> {
    return this.store.get(runId);
  }

  async list(options: RunStoreListOptions = {}): Promise<WorkflowRunRecord[]> {
    const records = Array.from(this.store.values());
    const filtered = options.workflowId
      ? records.filter((record) => record.workflowId === options.workflowId)
      : records;
    if (options.limit && options.limit > 0) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }
}

export interface FileRunStoreOptions {
  directory?: string;
  fileSystem?: FileSystem;
}

const DEFAULT_RUNS_DIRECTORY = "runs";
const RUN_FILE_EXTENSION = ".json";

export class FileRunStore implements RunStore {
  private readonly directory: string;
  private readonly fs: FileSystem;

  constructor(options: FileRunStoreOptions = {}) {
    this.directory = options.directory ?? DEFAULT_RUNS_DIRECTORY;
    this.fs = options.fileSystem ?? new DefaultFileSystem();
  }

  async save(record: WorkflowRunRecord): Promise<void> {
    const path = this.pathFor(record.runId);
    await this.fs.writeJson(path, record);
  }

  async get(runId: string): Promise<WorkflowRunRecord | undefined> {
    const path = this.pathFor(runId);
    if (!(await this.fs.exists(path))) {
      return undefined;
    }
    return this.fs.readJson<WorkflowRunRecord>(path);
  }

  async list(options: RunStoreListOptions = {}): Promise<WorkflowRunRecord[]> {
    if (!(await this.fs.exists(this.directory))) {
      return [];
    }
    const names = await this.fs.listDir(this.directory);
    const records: WorkflowRunRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(RUN_FILE_EXTENSION)) {
        continue;
      }
      const record = await this.fs.readJson<WorkflowRunRecord>(
        this.joinPath(name),
      );
      if (options.workflowId && record.workflowId !== options.workflowId) {
        continue;
      }
      records.push(record);
      if (
        options.limit &&
        options.limit > 0 &&
        records.length >= options.limit
      ) {
        break;
      }
    }
    return records;
  }

  private pathFor(runId: string): string {
    return this.joinPath(`${runId}${RUN_FILE_EXTENSION}`);
  }

  private joinPath(fileName: string): string {
    return `${this.directory}/${fileName}`;
  }
}
