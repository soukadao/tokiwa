import type { FileSystem } from "../core/file-system.js";
export type ConversationMemory = Record<string, unknown>;
export interface ConversationStore {
    get(conversationId: string): Promise<ConversationMemory | undefined>;
    set(conversationId: string, memory: ConversationMemory): Promise<void>;
    delete?(conversationId: string): Promise<void>;
}
/**
 * ConversationStore のインメモリ実装。
 *
 * 会話メモリを Map に保持し、外部からの変更を防ぐためにディープクローンを用いて
 * 取得・保存を行う。テストや短期間の利用に適している。
 */
export declare class InMemoryConversationStore implements ConversationStore {
    private readonly store;
    /**
     * 指定された会話IDに対応するメモリを取得する。
     *
     * 格納されたメモリのディープクローンを返すため、返却値を変更しても
     * ストア内部のデータには影響しない。
     *
     * @param conversationId - 取得対象の会話ID
     * @returns 会話メモリのディープクローン。存在しない場合は `undefined`
     */
    get(conversationId: string): Promise<ConversationMemory | undefined>;
    /**
     * 指定された会話IDに対して会話メモリを保存する。
     *
     * 引数のメモリをディープクローンして格納するため、保存後に元のオブジェクトを
     * 変更してもストア内部のデータには影響しない。
     *
     * @param conversationId - 保存対象の会話ID
     * @param memory - 保存する会話メモリ
     */
    set(conversationId: string, memory: ConversationMemory): Promise<void>;
    /**
     * 指定された会話IDに対応するメモリを削除する。
     *
     * @param conversationId - 削除対象の会話ID
     */
    delete(conversationId: string): Promise<void>;
}
export interface DeltaConversationStoreOptions {
    directory?: string;
    fileSystem?: FileSystem;
    compactAfterPatches?: number;
}
/**
 * ファイルベースの ConversationStore 実装。ベースファイルとデルタパッチを用いて
 * 会話メモリを効率的に永続化する。
 *
 * 初回保存時にベースファイル (base.json) を書き出し、以降の更新は差分 (diff) を
 * デルタファイル (deltas.jsonl) へ追記する。デルタ数が閾値に達すると自動的に
 * コンパクション（ベースファイルの書き直しとデルタファイルのクリア）を行う。
 */
export declare class DeltaConversationStore implements ConversationStore {
    private readonly directory;
    private readonly fs;
    private readonly compactAfterPatches;
    constructor(options?: DeltaConversationStoreOptions);
    /**
     * 指定された会話IDに対応するメモリを取得する。
     *
     * ベースファイルとデルタファイルから現在の状態を復元する。
     * デルタ数がコンパクション閾値以上の場合、自動的にコンパクションを実行して
     * 次回以降の読み取りを高速化する。
     *
     * @param conversationId - 取得対象の会話ID
     * @returns 復元された会話メモリ。存在しない場合は `undefined`
     */
    get(conversationId: string): Promise<ConversationMemory | undefined>;
    /**
     * 指定された会話IDに対して会話メモリを保存する。
     *
     * 既存のベースファイルが存在しない場合は新規にベースファイルを作成する。
     * 既存の状態がある場合は、現在の状態との差分を計算してデルタファイルに追記する。
     * 差分が空の場合は書き込みをスキップする。デルタ数がコンパクション閾値に達した
     * 場合は自動的にコンパクションを実行する。
     *
     * @param conversationId - 保存対象の会話ID
     * @param memory - 保存する会話メモリ
     */
    set(conversationId: string, memory: ConversationMemory): Promise<void>;
    /**
     * 指定された会話IDに対応するベースファイルとデルタファイルを削除する。
     *
     * @param conversationId - 削除対象の会話ID
     */
    delete(conversationId: string): Promise<void>;
    /**
     * 指定された会話IDに対応するベースファイルのパスを返す。
     *
     * @param conversationId - 会話ID
     * @returns ベースファイル (base.json) の絶対パス
     */
    private basePath;
    /**
     * 指定された会話IDに対応するデルタファイルのパスを返す。
     *
     * @param conversationId - 会話ID
     * @returns デルタファイル (deltas.jsonl) の絶対パス
     */
    private deltaPath;
    /**
     * ベースファイルに会話メモリをJSON形式で書き込む。
     *
     * @param conversationId - 会話ID
     * @param memory - 書き込む会話メモリ
     */
    private writeBase;
    /**
     * デルタファイルに差分エントリを1行追記する。
     *
     * タイムスタンプとともに差分情報をJSONL形式で追記する。
     *
     * @param conversationId - 会話ID
     * @param diff - 追記するメモリ差分
     */
    private appendDelta;
    /**
     * デルタファイルの内容をクリア（空文字で上書き）する。
     *
     * @param conversationId - 会話ID
     */
    private clearDeltas;
    /**
     * コンパクションを実行する。
     *
     * 現在のメモリ状態をベースファイルに書き出し、デルタファイルをクリアすることで
     * 蓄積されたデルタパッチを統合し、次回以降の読み取りパフォーマンスを改善する。
     *
     * @param conversationId - 会話ID
     * @param memory - コンパクション時点の最新メモリ状態
     */
    private compact;
    /**
     * ベースファイルとデルタファイルから現在の会話メモリ状態を読み取る。
     *
     * ベースファイルが存在しない場合は未初期化として扱う。ベースファイルなしで
     * デルタファイルのみ存在する場合は不整合としてエラーをスローする。
     * ベースファイルが存在する場合、デルタファイルの各行を順に適用して
     * 最新のメモリ状態を復元する。
     *
     * @param conversationId - 会話ID
     * @returns 復元されたメモリ状態と適用されたデルタ数
     */
    private readState;
}
