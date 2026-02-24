import type { ConversationMemory } from "./conversation-store.js";

export interface MemoryDiff {
  set: ConversationMemory;
  remove: string[];
}

const EMPTY_DIFF: MemoryDiff = { set: {}, remove: [] };

export const isEmptyDiff = (diff: MemoryDiff): boolean =>
  Object.keys(diff.set).length === 0 && diff.remove.length === 0;

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
