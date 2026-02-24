import { generateId } from "../core/index.js";

export type ConnectionState = "connected" | "disconnected";

export interface ConnectionInit {
  id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export class Connection {
  readonly id: string;
  readonly name?: string;
  private state: ConnectionState = "disconnected";
  private metadata: Record<string, unknown>;

  constructor(init: ConnectionInit = {}) {
    this.id = init.id ?? generateId();
    this.name = init.name;
    this.metadata = init.metadata ?? {};
  }

  connect(): void {
    this.state = "connected";
  }

  disconnect(): void {
    this.state = "disconnected";
  }

  getState(): ConnectionState {
    return this.state;
  }

  updateMetadata(update: Record<string, unknown>): void {
    this.metadata = { ...this.metadata, ...update };
  }

  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }
}
