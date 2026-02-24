import type { ConversationMemory } from "./conversation-store.js";
import type { Node } from "./node.js";
import type { Workflow } from "./workflow.js";
export interface WorkflowRunOptions<Context = unknown, Input = unknown> {
    input?: Input;
    context?: Context;
    event?: unknown;
    conversationId?: string;
    memory?: ConversationMemory;
    concurrency?: number;
    failFast?: boolean;
    onNodeStart?: (node: Node<Context, Input>) => void | Promise<void>;
    onNodeComplete?: (node: Node<Context, Input>, result: unknown) => void | Promise<void>;
    onNodeError?: (node: Node<Context, Input>, error: Error) => void | Promise<void>;
    onNodeRetry?: (node: Node<Context, Input>, error: Error, attempt: number, nextDelayMs: number) => void | Promise<void>;
}
export type WorkflowTimelineEntry = {
    type: "run_start";
    timestamp: Date;
} | {
    type: "run_complete";
    timestamp: Date;
    status: "succeeded" | "failed";
    durationMs: number;
} | {
    type: "node_start";
    nodeId: string;
    timestamp: Date;
    attempt: number;
} | {
    type: "node_complete";
    nodeId: string;
    timestamp: Date;
    durationMs: number;
    attempt: number;
} | {
    type: "node_retry";
    nodeId: string;
    timestamp: Date;
    attempt: number;
    nextDelayMs: number;
    error: Error;
} | {
    type: "node_error";
    nodeId: string;
    timestamp: Date;
    attempt: number;
    error: Error;
};
export interface WorkflowRunResult {
    runId: string;
    workflowId: string;
    status: "succeeded" | "failed";
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    results: Record<string, unknown>;
    errors: Record<string, Error>;
    attempts: Record<string, number>;
    timeline: WorkflowTimelineEntry[];
    conversationId?: string;
    memory?: ConversationMemory;
}
/**
 * ワークフローの実行エンジン。
 *
 * ワークフロー内のノードを依存関係の順序に従って実行する。
 * 同時実行数の制御、リトライポリシーによる再試行、
 * および `AbortSignal` を利用した中断をサポートする。
 */
export declare class Runner {
    /**
     * ワークフローを実行し、すべてのノードを依存関係の順序に従って処理する。
     *
     * 依存関係のないノードから順に、設定された同時実行数（concurrency）の範囲内で
     * 並列にノードを実行する。`failFast` が有効な場合、いずれかのノードでエラーが
     * 発生した時点で残りの実行を中断する。chatflow タイプのワークフローでは
     * `conversationId` が必須となり、同時実行数のデフォルトは 1 となる。
     *
     * @typeParam Context - ワークフロー全体で共有されるコンテキストの型
     * @typeParam Input - ワークフローへの入力データの型
     * @param workflow - 実行対象のワークフロー定義
     * @param options - 実行オプション（入力値、コンテキスト、同時実行数、コールバック等）
     * @returns 実行結果（ステータス、各ノードの結果・エラー、タイムライン等を含む）
     * @throws {InvalidArgumentError} chatflow タイプで conversationId が未指定の場合
     * @throws {DependencyError} ノードが存在しない依存先を参照している場合
     * @throws {CyclicDependencyError} ワークフローに循環依存が含まれている場合
     */
    run<Context = unknown, Input = unknown>(workflow: Workflow<Context, Input>, options?: WorkflowRunOptions<Context, Input>): Promise<WorkflowRunResult>;
    /**
     * 単一ノードをリトライポリシーに基づいて実行する。
     *
     * ノードのハンドラを呼び出し、成功した場合は結果を `results` に格納する。
     * 失敗した場合はリトライポリシー（最大試行回数、指数バックオフ、ジッター）に
     * 従って再試行を行う。すべての試行が失敗した場合、またはアボートシグナルを
     * 受信した場合はエラーをスローする。各段階でタイムラインエントリの記録と
     * コールバックの呼び出しを行う。
     *
     * @typeParam Context - ワークフロー全体で共有されるコンテキストの型
     * @typeParam Input - ワークフローへの入力データの型
     * @param node - 実行対象のノード
     * @param workflow - ノードが属するワークフロー定義
     * @param runId - 今回の実行を識別する一意の ID
     * @param options - ワークフロー実行オプション（コールバック等を含む）
     * @param results - 各ノードの実行結果を格納する共有オブジェクト
     * @param errors - 各ノードのエラーを格納する共有オブジェクト
     * @param attempts - 各ノードの試行回数を格納する共有オブジェクト
     * @param timeline - 実行タイムラインのエントリ配列
     * @param conversationId - 会話 ID（chatflow の場合に使用）
     * @param signal - 中断を検知するための AbortSignal
     * @param memory - 会話メモリの現在の状態
     * @param getMemory - 会話メモリを取得する関数
     * @param setMemory - 会話メモリを置き換える関数
     * @param updateMemory - 会話メモリを部分更新する関数
     * @throws ノードの全リトライが失敗した場合、またはアボートされた場合にエラーをスローする
     */
    private runNode;
}
