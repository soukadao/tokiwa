import type { FileSystem } from "../core/file-system.js";
import type { ConversationMemory } from "./conversation-store.js";
import type { WorkflowRunResult } from "./runner.js";
export interface ErrorInfo {
    name: string;
    message: string;
    stack?: string;
    cause?: ErrorInfo | string;
}
export type WorkflowTimelineRecord = {
    type: "run_start";
    timestamp: string;
} | {
    type: "run_complete";
    timestamp: string;
    status: "succeeded" | "failed";
    durationMs: number;
} | {
    type: "node_start";
    nodeId: string;
    timestamp: string;
    attempt: number;
} | {
    type: "node_complete";
    nodeId: string;
    timestamp: string;
    durationMs: number;
    attempt: number;
} | {
    type: "node_retry";
    nodeId: string;
    timestamp: string;
    attempt: number;
    nextDelayMs: number;
    error: ErrorInfo;
} | {
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
/**
 * WorkflowRunResult を永続化用の WorkflowRunRecord に変換する。
 *
 * Date オブジェクトを ISO 文字列に、Error オブジェクトを ErrorInfo に変換し、
 * シリアライズ可能なレコードを返す。
 *
 * @param result - ワークフロー実行結果
 * @returns 永続化用に変換されたワークフロー実行レコード
 */
export declare const toRunRecord: (result: WorkflowRunResult) => WorkflowRunRecord;
/**
 * RunStore のインメモリ実装。
 *
 * 内部で Map を使用してレコードを保持する。
 * テストや短期間の実行など、永続化が不要な場合に適している。
 */
export declare class InMemoryRunStore implements RunStore {
    private readonly store;
    /**
     * レコードをインメモリストアに保存する。
     *
     * 同じ runId のレコードが既に存在する場合は上書きされる。
     *
     * @param record - 保存するワークフロー実行レコード
     */
    save(record: WorkflowRunRecord): Promise<void>;
    /**
     * 指定された runId に対応するレコードを取得する。
     *
     * @param runId - 取得対象の実行ID
     * @returns 該当するレコード。存在しない場合は undefined
     */
    get(runId: string): Promise<WorkflowRunRecord | undefined>;
    /**
     * 保存されているレコードの一覧を返す。
     *
     * workflowId によるフィルタリングや、limit による件数制限が可能。
     *
     * @param options - フィルタリングおよび件数制限のオプション
     * @returns 条件に一致するレコードの配列
     */
    list(options?: RunStoreListOptions): Promise<WorkflowRunRecord[]>;
}
export interface FileRunStoreOptions {
    directory?: string;
    fileSystem?: FileSystem;
}
/**
 * RunStore のファイルベース実装。
 *
 * 各レコードを JSON ファイルとしてディレクトリに保存する。
 * 永続化が必要な本番環境での使用に適している。
 */
export declare class FileRunStore implements RunStore {
    private readonly directory;
    private readonly fs;
    constructor(options?: FileRunStoreOptions);
    /**
     * レコードを JSON ファイルとして保存する。
     *
     * ファイル名は runId に基づいて自動生成される。
     *
     * @param record - 保存するワークフロー実行レコード
     */
    save(record: WorkflowRunRecord): Promise<void>;
    /**
     * 指定された runId に対応するレコードを JSON ファイルから読み込む。
     *
     * ファイルが存在しない場合は undefined を返す。
     *
     * @param runId - 取得対象の実行ID
     * @returns 該当するレコード。ファイルが存在しない場合は undefined
     */
    get(runId: string): Promise<WorkflowRunRecord | undefined>;
    /**
     * ディレクトリ内の JSON ファイルからレコードの一覧を読み込む。
     *
     * workflowId によるフィルタリングや、limit による件数制限が可能。
     * ディレクトリが存在しない場合は空配列を返す。
     *
     * @param options - フィルタリングおよび件数制限のオプション
     * @returns 条件に一致するレコードの配列
     */
    list(options?: RunStoreListOptions): Promise<WorkflowRunRecord[]>;
    /**
     * 指定された runId に対応するファイルパスを生成する。
     *
     * @param runId - 実行ID
     * @returns JSON ファイルのフルパス
     */
    private pathFor;
    /**
     * ディレクトリとファイル名を結合してパスを生成する。
     *
     * @param fileName - ファイル名
     * @returns 結合されたファイルパス
     */
    private joinPath;
}
