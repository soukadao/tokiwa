import type { ConversationMemory } from "./conversation-store.js";

export interface MemoryDiff {
  set: ConversationMemory;
  remove: string[];
}

const EMPTY_DIFF: MemoryDiff = { set: {}, remove: [] };

/**
 * 差分が空かどうかを判定する
 * @param diff メモリ差分
 * @returns 変更がなければtrue
 */
export const isEmptyDiff = (diff: MemoryDiff): boolean =>
  Object.keys(diff.set).length === 0 && diff.remove.length === 0;

/**
 * 2つのメモリ状態の差分を計算する
 * @param previous 変更前のメモリ
 * @param next 変更後のメモリ
 * @returns 設定された値と削除されたキーの差分
 */
export const diffMemory = (
  previous: ConversationMemory,
  next: ConversationMemory,
): MemoryDiff => {
  const set: ConversationMemory = {};
  const remove: string[] = [];

  const prevKeys = Object.keys(previous);
  const nextKeys = new Set(Object.keys(next));

  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      remove.push(key);
      continue;
    }
    const prevValue = previous[key];
    const nextValue = next[key];
    if (!Object.is(prevValue, nextValue)) {
      set[key] = nextValue;
    }
  }

  for (const key of Object.keys(next)) {
    if (!(key in previous)) {
      set[key] = next[key];
    }
  }

  if (Object.keys(set).length === 0 && remove.length === 0) {
    return EMPTY_DIFF;
  }

  return { set, remove };
};

/**
 * メモリ差分をベースのメモリに適用する
 * @param base ベースとなるメモリ
 * @param diff 適用する差分
 * @returns 差分適用後の新しいメモリ
 */
export const applyMemoryDiff = (
  base: ConversationMemory,
  diff: MemoryDiff,
): ConversationMemory => {
  const next: ConversationMemory = { ...base, ...diff.set };
  for (const key of diff.remove) {
    delete next[key];
  }
  return next;
};
