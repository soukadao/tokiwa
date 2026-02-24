import type { FileSystem } from "../core/file-system.js";
import { FileSystem as DefaultFileSystem } from "../core/file-system.js";
import { RuntimeError } from "../core/index.js";
import {
  applyMemoryDiff,
  diffMemory,
  isEmptyDiff,
  type MemoryDiff,
} from "./memory-diff.js";

export type ConversationMemory = Record<string, unknown>;

export interface ConversationStore {
  get(conversationId: string): Promise<ConversationMemory | undefined>;
  set(conversationId: string, memory: ConversationMemory): Promise<void>;
  delete?(conversationId: string): Promise<void>;
}

const cloneMemory = (memory: ConversationMemory): ConversationMemory => ({
  ...memory,
});

export class InMemoryConversationStore implements ConversationStore {
  private readonly store = new Map<string, ConversationMemory>();

  async get(conversationId: string): Promise<ConversationMemory | undefined> {
    const memory = this.store.get(conversationId);
    if (!memory) {
      return undefined;
    }
    return cloneMemory(memory);
  }

  async set(conversationId: string, memory: ConversationMemory): Promise<void> {
    this.store.set(conversationId, cloneMemory(memory));
  }

  async delete(conversationId: string): Promise<void> {
    this.store.delete(conversationId);
  }
}

export interface DeltaConversationStoreOptions {
  directory?: string;
  fileSystem?: FileSystem;
  compactAfterPatches?: number;
}

interface DeltaEntry {
  timestamp: string;
  diff: MemoryDiff;
}

const DEFAULT_DIRECTORY = "conversations";
const DEFAULT_COMPACT_AFTER_PATCHES = 50;
const MIN_COMPACT_AFTER_PATCHES = 1;
const BASE_FILE_NAME = "base.json";
const DELTA_FILE_NAME = "deltas.jsonl";
const LINE_ENDING = "\n";

export class DeltaConversationStore implements ConversationStore {
  private readonly directory: string;
  private readonly fs: FileSystem;
  private readonly compactAfterPatches: number;

  constructor(options: DeltaConversationStoreOptions = {}) {
    this.directory = options.directory ?? DEFAULT_DIRECTORY;
    this.fs = options.fileSystem ?? new DefaultFileSystem();
    const compactAfterPatches =
      options.compactAfterPatches ?? DEFAULT_COMPACT_AFTER_PATCHES;
    this.compactAfterPatches = Math.max(
      MIN_COMPACT_AFTER_PATCHES,
      compactAfterPatches,
    );
  }

  async get(conversationId: string): Promise<ConversationMemory | undefined> {
    const state = await this.readState(conversationId);
    if (!state.memory) {
      return undefined;
    }
    if (state.deltaCount >= this.compactAfterPatches) {
      await this.compact(conversationId, state.memory);
    }
    return state.memory;
  }

  async set(conversationId: string, memory: ConversationMemory): Promise<void> {
    const state = await this.readState(conversationId);
    if (!state.memory) {
      await this.writeBase(conversationId, memory);
      await this.clearDeltas(conversationId);
      return;
    }

    const diff = diffMemory(state.memory, memory);
    if (isEmptyDiff(diff)) {
      return;
    }

    await this.appendDelta(conversationId, diff);

    const nextDeltaCount = state.deltaCount + 1;
    if (nextDeltaCount >= this.compactAfterPatches) {
      await this.compact(conversationId, memory);
    }
  }

  async delete(conversationId: string): Promise<void> {
    await this.fs.remove(this.basePath(conversationId));
    await this.fs.remove(this.deltaPath(conversationId));
  }

  private basePath(conversationId: string): string {
    return `${this.directory}/${conversationId}/${BASE_FILE_NAME}`;
  }

  private deltaPath(conversationId: string): string {
    return `${this.directory}/${conversationId}/${DELTA_FILE_NAME}`;
  }

  private async writeBase(
    conversationId: string,
    memory: ConversationMemory,
  ): Promise<void> {
    await this.fs.writeJson(this.basePath(conversationId), memory);
  }

  private async appendDelta(
    conversationId: string,
    diff: MemoryDiff,
  ): Promise<void> {
    const entry: DeltaEntry = {
      timestamp: new Date().toISOString(),
      diff,
    };
    const line = `${JSON.stringify(entry)}${LINE_ENDING}`;
    await this.fs.appendText(this.deltaPath(conversationId), line);
  }

  private async clearDeltas(conversationId: string): Promise<void> {
    await this.fs.writeText(this.deltaPath(conversationId), "");
  }

  private async compact(
    conversationId: string,
    memory: ConversationMemory,
  ): Promise<void> {
    await this.writeBase(conversationId, memory);
    await this.clearDeltas(conversationId);
  }

  private async readState(conversationId: string): Promise<{
    memory?: ConversationMemory;
    deltaCount: number;
  }> {
    const basePath = this.basePath(conversationId);
    const deltaPath = this.deltaPath(conversationId);

    if (!(await this.fs.exists(basePath))) {
      if (await this.fs.exists(deltaPath)) {
        throw new RuntimeError(
          `Delta file exists without base: ${conversationId}`,
        );
      }
      return { memory: undefined, deltaCount: 0 };
    }

    let memory = await this.fs.readJson<ConversationMemory>(basePath);
    if (!(await this.fs.exists(deltaPath))) {
      return { memory, deltaCount: 0 };
    }

    const text = await this.fs.readText(deltaPath);
    const lines = text.split(LINE_ENDING).filter((line) => line.length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line) as DeltaEntry;
      memory = applyMemoryDiff(memory, entry.diff);
    }

    return { memory, deltaCount: lines.length };
  }
}
