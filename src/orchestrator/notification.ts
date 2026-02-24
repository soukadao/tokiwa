import { generateId } from "../core/index.js";
import type { Event } from "./event.js";

export type NotificationLevel = "info" | "warning" | "error";

export interface NotificationInit {
  id?: string;
  level?: NotificationLevel;
  message: string;
  timestamp?: Date;
  data?: unknown;
  event?: Event;
}

export class Notification {
  readonly id: string;
  readonly level: NotificationLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly data?: unknown;
  readonly event?: Event;

  constructor(init: NotificationInit) {
    this.id = init.id ?? generateId();
    this.level = init.level ?? "info";
    this.message = init.message;
    this.timestamp = init.timestamp ?? new Date();
    this.data = init.data;
    this.event = init.event;
  }
}
