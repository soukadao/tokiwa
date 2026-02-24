import type { Event } from "./event.js";

export interface EventQueue {
  enqueue(event: Event): void;
  dequeue(): Event | undefined;
  size(): number;
  peek?(): Event | undefined;
  clear?(): void;
  list?(): Event[];
  drain?(): Event[];
}
