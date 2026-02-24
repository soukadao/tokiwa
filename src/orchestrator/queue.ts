import type { Event } from "./event.js";
import type { EventQueue } from "./event-queue.js";

const COMPACT_AFTER_DEQUEUE_COUNT = 50;
const COMPACT_RATIO = 2;

export class Queue implements EventQueue {
  private items: Event[] = [];
  private head = 0;

  enqueue(event: Event): void {
    this.items.push(event);
  }

  dequeue(): Event | undefined {
    if (this.head >= this.items.length) {
      return undefined;
    }

    const event = this.items[this.head];
    this.head += 1;

    if (
      this.head > COMPACT_AFTER_DEQUEUE_COUNT &&
      this.head * COMPACT_RATIO > this.items.length
    ) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }

    return event;
  }

  peek(): Event | undefined {
    return this.items[this.head];
  }

  size(): number {
    return this.items.length - this.head;
  }

  clear(): void {
    this.items.length = 0;
    this.head = 0;
  }

  list(): Event[] {
    return this.items.slice(this.head);
  }

  drain(): Event[] {
    const drained = this.items.slice(this.head);
    this.items.length = 0;
    this.head = 0;
    return drained;
  }
}
