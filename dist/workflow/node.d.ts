import type { ConversationMemory } from "./conversation-store.js";
export interface NodeExecutionContext<Context = unknown, Input = unknown> {
    workflowId: string;
    nodeId: string;
    runId: string;
    conversationId?: string;
    context?: Context;
    input?: Input;
    event?: unknown;
    signal?: AbortSignal;
    results: Record<string, unknown>;
    getResult<T = unknown>(nodeId: string): T | undefined;
    memory?: ConversationMemory;
    getMemory?: () => ConversationMemory | undefined;
    setMemory?: (next: ConversationMemory) => void | Promise<void>;
    updateMemory?: (patch: Partial<ConversationMemory>) => void | Promise<void>;
}
export type NodeHandler<Context = unknown, Input = unknown, Output = unknown> = (context: NodeExecutionContext<Context, Input>) => Output | Promise<Output>;
export interface RetryPolicy {
    maxAttempts?: number;
    initialDelayMs?: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    jitterMs?: number;
}
export interface NodeDefinition<Context = unknown, Input = unknown, Output = unknown> {
    name?: string;
    dependsOn?: string[];
    handler: NodeHandler<Context, Input, Output>;
    retry?: RetryPolicy;
}
/**
 * ワークフロー内の単一ノードを表すクラス。
 * 各ノードはハンドラ関数、依存関係リスト、およびリトライポリシーを持ち、
 * ワークフローの実行単位として動作する。
 *
 * @typeParam Context - ワークフロー全体で共有されるコンテキストの型
 * @typeParam Input - ノードに渡される入力データの型
 * @typeParam Output - ノードのハンドラが返す出力データの型
 */
export declare class Node<Context = unknown, Input = unknown, Output = unknown> {
    readonly id: string;
    readonly name?: string;
    readonly handler: NodeHandler<Context, Input, Output>;
    readonly retry?: RetryPolicy;
    private readonly dependencies;
    /**
     * NodeDefinition からノードを生成する。
     * リトライポリシーが指定されている場合、各パラメータ（maxAttempts, initialDelayMs,
     * backoffMultiplier, maxDelayMs, jitterMs）のバリデーションを行い、
     * 不正な値が含まれている場合は {@link InvalidArgumentError} をスローする。
     * また、dependsOn で指定された依存ノード ID を内部の依存関係セットに登録する。
     *
     * @param definition - ノードの定義オブジェクト（名前、ハンドラ、依存関係、リトライポリシーを含む）
     * @throws {InvalidArgumentError} リトライポリシーのパラメータが不正な場合
     */
    constructor(definition: NodeDefinition<Context, Input, Output>);
    /**
     * 指定されたノード ID を依存関係として追加する。
     * このノードは、追加された依存ノードの実行が完了するまで実行されない。
     *
     * @param nodeId - 依存先ノードの ID
     */
    addDependency(nodeId: string): void;
    /**
     * このノードが依存しているノード ID の一覧を返す。
     * 返される配列は内部の依存関係セットのスナップショットであり、
     * 変更しても元のデータには影響しない。
     *
     * @returns 依存先ノード ID の配列
     */
    get dependsOn(): string[];
}
