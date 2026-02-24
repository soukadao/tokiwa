import { TZDate } from "@date-fns/tz";

/**
 * オーケストレーターのメトリクス情報。
 */
export interface SnapshotMetrics {
  /** パブリッシュされたイベントの総数 */
  published: number;
  /** 処理済みイベントの総数 */
  processed: number;
  /** ディスパッチエラーの総数 */
  dispatchErrors: number;
  /** ワークフロー実行回数 */
  workflowRuns: number;
  /** ワークフローエラーの総数 */
  workflowErrors: number;
}

/**
 * スナップショット作成時の初期化パラメータ。
 */
export interface SnapshotInit {
  /** オーケストレーターが実行中かどうか */
  isRunning: boolean;
  /** オーケストレーターの動作モード。省略時は `"all"` */
  mode?: "all" | "producer" | "worker";
  /** キュー内の未処理イベント数 */
  queueSize: number;
  /** メトリクス情報 */
  metrics: SnapshotMetrics;
  /** スナップショット取得時刻。省略時は現在時刻 */
  timestamp?: Date;
}

/**
 * オーケストレーターの状態を表す不変のスナップショット。
 * 実行状況、動作モード、キューサイズ、メトリクスを保持する。
 */
export class Snapshot {
  /** オーケストレーターが実行中かどうか */
  readonly isRunning: boolean;
  /** オーケストレーターの動作モード */
  readonly mode: "all" | "producer" | "worker";
  /** キュー内の未処理イベント数 */
  readonly queueSize: number;
  /** メトリクス情報 */
  readonly metrics: SnapshotMetrics;
  /** スナップショット取得時刻 */
  readonly timestamp: Date;

  /**
   * 初期化パラメータからスナップショットを作成する。
   * @param init - スナップショットの初期化パラメータ
   */
  constructor(init: SnapshotInit) {
    this.isRunning = init.isRunning;
    this.mode = init.mode ?? "all";
    this.queueSize = init.queueSize;
    this.metrics = init.metrics;
    this.timestamp = init.timestamp ?? new TZDate();
  }
}
