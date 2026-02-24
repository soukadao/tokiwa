export interface EventMetadata {
    correlationId?: string;
    causationId?: string;
    source?: string;
    tags?: string[];
}
export interface EventInit<TPayload = unknown> {
    type: string;
    payload?: TPayload;
    timestamp?: Date;
    metadata?: EventMetadata;
}
/**
 * ドメインイベントを表すクラス。型、ペイロード、タイムスタンプ、メタデータを保持する。
 *
 * @template TPayload - イベントのペイロードの型
 */
export declare class Event<TPayload = unknown> {
    readonly id: string;
    readonly type: string;
    readonly payload: TPayload;
    readonly timestamp: Date;
    readonly metadata: EventMetadata;
    /**
     * EventInitからイベントを生成する。typeが空文字列の場合はエラーをスローする。
     *
     * @param init - イベントの初期化パラメータ
     * @throws {InvalidArgumentError} typeが空文字列の場合
     */
    constructor(init: EventInit<TPayload>);
    /**
     * イベントを生成するファクトリメソッド。型、ペイロード、メタデータを指定してイベントを作成する。
     *
     * @template TPayload - イベントのペイロードの型
     * @param type - イベントの種別を示す文字列
     * @param payload - イベントに付随するデータ
     * @param metadata - イベントのメタデータ（相関ID、原因ID、ソース、タグなど）
     * @returns 新しいEventインスタンス
     */
    static create<TPayload = unknown>(type: string, payload?: TPayload, metadata?: EventMetadata): Event<TPayload>;
}
