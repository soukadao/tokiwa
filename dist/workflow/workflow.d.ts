import { Node, type NodeDefinition } from "./node.js";
export type WorkflowType = "workflow" | "chatflow";
export interface WorkflowDefinition<Context = unknown, Input = unknown> {
    name?: string;
    description?: string;
    type?: WorkflowType;
    nodes?: Array<Node<Context, Input> | NodeDefinition<Context, Input>>;
}
/**
 * ノードと依存関係で構成されるワークフローを表すクラス。
 *
 * ノードの追加・接続・トポロジカルソートによる実行計画の生成を提供する。
 *
 * @typeParam Context - ワークフロー実行時に共有されるコンテキストの型
 * @typeParam Input - 各ノードに渡される入力の型
 */
export declare class Workflow<Context = unknown, Input = unknown> {
    readonly id: string;
    readonly name?: string;
    readonly description?: string;
    readonly type: WorkflowType;
    private readonly nodes;
    /**
     * ワークフロー定義からワークフローインスタンスを生成する。
     *
     * ワークフローのタイプは「workflow」または「chatflow」を指定可能。
     * 定義にノードが含まれている場合、それらを自動的にワークフローに追加する。
     *
     * @param definition - ワークフローの定義オブジェクト
     * @throws {InvalidArgumentError} ワークフロータイプが不正な場合
     */
    constructor(definition: WorkflowDefinition<Context, Input>);
    /**
     * ワークフローにノードを追加する。
     *
     * 同一IDのノードが既に存在する場合はエラーをスローする。
     *
     * @param node - 追加するノード
     * @throws {ConflictError} 同一IDのノードが既に存在する場合
     */
    addNode(node: Node<Context, Input>): void;
    /**
     * 2つのノード間に依存関係を作成し接続する。
     *
     * fromNodeId から toNodeId への依存関係を設定する。
     * つまり、toNodeId のノードは fromNodeId のノードが完了するまで実行されない。
     *
     * @param fromNodeId - 依存元のノードID（先に実行されるノード）
     * @param toNodeId - 依存先のノードID（後に実行されるノード）
     * @throws {NotFoundError} 指定されたノードIDが存在しない場合
     */
    connect(fromNodeId: string, toNodeId: string): void;
    /**
     * 指定されたIDのノードを取得する。
     *
     * @param nodeId - 取得するノードのID
     * @returns 該当するノード。存在しない場合は `undefined`
     */
    getNode(nodeId: string): Node<Context, Input> | undefined;
    /**
     * ワークフローに登録されている全ノードを配列として取得する。
     *
     * @returns 全ノードの配列
     */
    getNodes(): Node<Context, Input>[];
    /**
     * ノードの依存関係に基づいてトポロジカルソートを行い、実行計画を生成する。
     *
     * 依存関係のないノードから順に並べ、全ノードが正しい実行順序で返される。
     * 循環依存が検出された場合はエラーをスローする。
     *
     * @returns トポロジカルソート済みのノード配列（実行順）
     * @throws {DependencyError} ノードが存在しない依存先を参照している場合
     * @throws {CyclicDependencyError} ワークフローに循環依存が含まれている場合
     */
    getExecutionPlan(): Node<Context, Input>[];
}
