import type { ConversationMemory } from "./conversation-store.js";
export interface MemoryDiff {
    set: ConversationMemory;
    remove: string[];
}
/**
 * 差分が空かどうかを判定する
 * @param diff メモリ差分
 * @returns 変更がなければtrue
 */
export declare const isEmptyDiff: (diff: MemoryDiff) => boolean;
/**
 * 2つのメモリ状態の差分を計算する
 * @param previous 変更前のメモリ
 * @param next 変更後のメモリ
 * @returns 設定された値と削除されたキーの差分
 */
export declare const diffMemory: (previous: ConversationMemory, next: ConversationMemory) => MemoryDiff;
/**
 * メモリ差分をベースのメモリに適用する
 * @param base ベースとなるメモリ
 * @param diff 適用する差分
 * @returns 差分適用後の新しいメモリ
 */
export declare const applyMemoryDiff: (base: ConversationMemory, diff: MemoryDiff) => ConversationMemory;
