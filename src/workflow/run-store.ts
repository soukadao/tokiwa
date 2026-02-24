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

/**
 * WorkflowRunResult を永続化用の WorkflowRunRecord に変換する。
 *
 * Date オブジェクトを ISO 文字列に、Error オブジェクトを ErrorInfo に変換し、
 * シリアライズ可能なレコードを返す。
 *
 * @param result - ワークフロー実行結果
 * @returns 永続化用に変換されたワークフロー実行レコード
 */
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

/**
 * RunStore のインメモリ実装。
 *
 * 内部で Map を使用してレコードを保持する。
 * テストや短期間の実行など、永続化が不要な場合に適している。
 */
export class InMemoryRunStore implements RunStore {
  private readonly store = new Map<string, WorkflowRunRecord>();

  /**
   * レコードをインメモリストアに保存する。
   *
   * 同じ runId のレコードが既に存在する場合は上書きされる。
   *
   * @param record - 保存するワークフロー実行レコード
   */
  async save(record: WorkflowRunRecord): Promise<void> {
    this.store.set(record.runId, record);
  }

  /**
   * 指定された runId に対応するレコードを取得する。
   *
   * @param runId - 取得対象の実行ID
   * @returns 該当するレコード。存在しない場合は undefined
   */
  async get(runId: string): Promise<WorkflowRunRecord | undefined> {
    return this.store.get(runId);
  }

  /**
   * 保存されているレコードの一覧を返す。
   *
   * workflowId によるフィルタリングや、limit による件数制限が可能。
   *
   * @param options - フィルタリングおよび件数制限のオプション
   * @returns 条件に一致するレコードの配列
   */
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

/**
 * RunStore のファイルベース実装。
 *
 * 各レコードを JSON ファイルとしてディレクトリに保存する。
 * 永続化が必要な本番環境での使用に適している。
 */
export class FileRunStore implements RunStore {
  private readonly directory: string;
  private readonly fs: FileSystem;

  constructor(options: FileRunStoreOptions = {}) {
    this.directory = options.directory ?? DEFAULT_RUNS_DIRECTORY;
    this.fs = options.fileSystem ?? new DefaultFileSystem();
  }

  /**
   * レコードを JSON ファイルとして保存する。
   *
   * ファイル名は runId に基づいて自動生成される。
   *
   * @param record - 保存するワークフロー実行レコード
   */
  async save(record: WorkflowRunRecord): Promise<void> {
    const path = this.pathFor(record.runId);
    await this.fs.writeJson(path, record);
  }

  /**
   * 指定された runId に対応するレコードを JSON ファイルから読み込む。
   *
   * ファイルが存在しない場合は undefined を返す。
   *
   * @param runId - 取得対象の実行ID
   * @returns 該当するレコード。ファイルが存在しない場合は undefined
   */
  async get(runId: string): Promise<WorkflowRunRecord | undefined> {
    const path = this.pathFor(runId);
    if (!(await this.fs.exists(path))) {
      return undefined;
    }
    return this.fs.readJson<WorkflowRunRecord>(path);
  }

  /**
   * ディレクトリ内の JSON ファイルからレコードの一覧を読み込む。
   *
   * workflowId によるフィルタリングや、limit による件数制限が可能。
   * ディレクトリが存在しない場合は空配列を返す。
   *
   * @param options - フィルタリングおよび件数制限のオプション
   * @returns 条件に一致するレコードの配列
   */
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

  /**
   * 指定された runId に対応するファイルパスを生成する。
   *
   * @param runId - 実行ID
   * @returns JSON ファイルのフルパス
   */
  private pathFor(runId: string): string {
    return this.joinPath(`${runId}${RUN_FILE_EXTENSION}`);
  }

  /**
   * ディレクトリとファイル名を結合してパスを生成する。
   *
   * @param fileName - ファイル名
   * @returns 結合されたファイルパス
   */
  private joinPath(fileName: string): string {
    return `${this.directory}/${fileName}`;
  }
}
