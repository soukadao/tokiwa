/** 取得したロックを表すハンドル */
export interface LockHandle {
    /** ロックキー */
    key: string;
    /** ロック識別トークン */
    token: string;
}
/** ロック取得時のオプション */
export interface LockAcquireOptions {
    /** ロックの有効期間（ミリ秒） */
    ttlMs?: number;
    /** 取得リトライ回数 */
    retryCount?: number;
    /** リトライ間隔（ミリ秒） */
    retryDelayMs?: number;
}
/** 分散ロックのインターフェース */
export interface DistributedLock {
    /**
     * ロックを取得する
     * @param key ロックキー
     * @param options 取得オプション
     * @returns ロックハンドル。取得できなかった場合はnull
     */
    acquire(key: string, options?: LockAcquireOptions): Promise<LockHandle | null>;
    /**
     * ロックを解放する
     * @param handle 解放するロックのハンドル
     * @returns 解放に成功したらtrue
     */
    release(handle: LockHandle): Promise<boolean>;
    /**
     * ロックのTTLを延長する
     * @param handle 延長するロックのハンドル
     * @param ttlMs 新しい有効期間（ミリ秒）
     * @returns 延長に成功したらtrue
     */
    refresh?(handle: LockHandle, ttlMs: number): Promise<boolean>;
}
