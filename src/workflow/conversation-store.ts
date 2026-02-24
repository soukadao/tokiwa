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

const cloneMemory = (memory: ConversationMemory): ConversationMemory =>
  structuredClone(memory);

/**
 * ConversationStore のインメモリ実装。
 *
 * 会話メモリを Map に保持し、外部からの変更を防ぐためにディープクローンを用いて
 * 取得・保存を行う。テストや短期間の利用に適している。
 */
export class InMemoryConversationStore implements ConversationStore {
  private readonly store = new Map<string, ConversationMemory>();

  /**
   * 指定された会話IDに対応するメモリを取得する。
   *
   * 格納されたメモリのディープクローンを返すため、返却値を変更しても
   * ストア内部のデータには影響しない。
   *
   * @param conversationId - 取得対象の会話ID
   * @returns 会話メモリのディープクローン。存在しない場合は `undefined`
   */
  async get(conversationId: string): Promise<ConversationMemory | undefined> {
    const memory = this.store.get(conversationId);
    if (!memory) {
      return undefined;
    }
    return cloneMemory(memory);
  }

  /**
   * 指定された会話IDに対して会話メモリを保存する。
   *
   * 引数のメモリをディープクローンして格納するため、保存後に元のオブジェクトを
   * 変更してもストア内部のデータには影響しない。
   *
   * @param conversationId - 保存対象の会話ID
   * @param memory - 保存する会話メモリ
   */
  async set(conversationId: string, memory: ConversationMemory): Promise<void> {
    this.store.set(conversationId, cloneMemory(memory));
  }

  /**
   * 指定された会話IDに対応するメモリを削除する。
   *
   * @param conversationId - 削除対象の会話ID
   */
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

/**
 * ファイルベースの ConversationStore 実装。ベースファイルとデルタパッチを用いて
 * 会話メモリを効率的に永続化する。
 *
 * 初回保存時にベースファイル (base.json) を書き出し、以降の更新は差分 (diff) を
 * デルタファイル (deltas.jsonl) へ追記する。デルタ数が閾値に達すると自動的に
 * コンパクション（ベースファイルの書き直しとデルタファイルのクリア）を行う。
 */
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

  /**
   * 指定された会話IDに対応するベースファイルとデルタファイルを削除する。
   *
   * @param conversationId - 削除対象の会話ID
   */
  async delete(conversationId: string): Promise<void> {
    await this.fs.remove(this.basePath(conversationId));
    await this.fs.remove(this.deltaPath(conversationId));
  }

  /**
   * 指定された会話IDに対応するベースファイルのパスを返す。
   *
   * @param conversationId - 会話ID
   * @returns ベースファイル (base.json) の絶対パス
   */
  private basePath(conversationId: string): string {
    return `${this.directory}/${conversationId}/${BASE_FILE_NAME}`;
  }

  /**
   * 指定された会話IDに対応するデルタファイルのパスを返す。
   *
   * @param conversationId - 会話ID
   * @returns デルタファイル (deltas.jsonl) の絶対パス
   */
  private deltaPath(conversationId: string): string {
    return `${this.directory}/${conversationId}/${DELTA_FILE_NAME}`;
  }

  /**
   * ベースファイルに会話メモリをJSON形式で書き込む。
   *
   * @param conversationId - 会話ID
   * @param memory - 書き込む会話メモリ
   */
  private async writeBase(
    conversationId: string,
    memory: ConversationMemory,
  ): Promise<void> {
    await this.fs.writeJson(this.basePath(conversationId), memory);
  }

  /**
   * デルタファイルに差分エントリを1行追記する。
   *
   * タイムスタンプとともに差分情報をJSONL形式で追記する。
   *
   * @param conversationId - 会話ID
   * @param diff - 追記するメモリ差分
   */
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

  /**
   * デルタファイルの内容をクリア（空文字で上書き）する。
   *
   * @param conversationId - 会話ID
   */
  private async clearDeltas(conversationId: string): Promise<void> {
    await this.fs.writeText(this.deltaPath(conversationId), "");
  }

  /**
   * コンパクションを実行する。
   *
   * 現在のメモリ状態をベースファイルに書き出し、デルタファイルをクリアすることで
   * 蓄積されたデルタパッチを統合し、次回以降の読み取りパフォーマンスを改善する。
   *
   * @param conversationId - 会話ID
   * @param memory - コンパクション時点の最新メモリ状態
   */
  private async compact(
    conversationId: string,
    memory: ConversationMemory,
  ): Promise<void> {
    await this.writeBase(conversationId, memory);
    await this.clearDeltas(conversationId);
  }

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
