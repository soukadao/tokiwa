export interface SnapshotMetrics {
  published: number;
  processed: number;
  dispatchErrors: number;
  workflowRuns: number;
  workflowErrors: number;
}

export interface SnapshotInit {
  isRunning: boolean;
  mode?: "all" | "producer" | "worker";
  queueSize: number;
  metrics: SnapshotMetrics;
  timestamp?: Date;
}

export class Snapshot {
  readonly isRunning: boolean;
  readonly mode: "all" | "producer" | "worker";
  readonly queueSize: number;
  readonly metrics: SnapshotMetrics;
  readonly timestamp: Date;

  constructor(init: SnapshotInit) {
    this.isRunning = init.isRunning;
    this.mode = init.mode ?? "all";
    this.queueSize = init.queueSize;
    this.metrics = init.metrics;
    this.timestamp = init.timestamp ?? new Date();
  }
}
