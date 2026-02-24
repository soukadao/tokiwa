import { RuntimeError } from "../core/index.js";
import type { Event } from "./event.js";
import {
  type EventHandler,
  type HandlerContext,
  Subscriber,
  type SubscriberOptions,
} from "./subscriber.js";

export interface DispatchContext extends HandlerContext {
  dispatcher: EventDispatcher;
  eventType: string;
}

export interface DispatchError {
  subscriberId: string;
  error: Error;
  stage: "filter" | "handler";
}

export interface DispatchResult {
  event: Event;
  delivered: number;
  errors: DispatchError[];
}

export class EventDispatcher {
  private readonly subscribersByType = new Map<string, Set<Subscriber>>();
  private readonly subscribersById = new Map<string, Subscriber>();

  public subscribe(
    type: string,
    handler: EventHandler,
    options: SubscriberOptions = {},
  ): Subscriber {
    const subscriber = new Subscriber(type, handler, options);
    const bucket = this.subscribersByType.get(type) ?? new Set<Subscriber>();

    bucket.add(subscriber);
    this.subscribersByType.set(type, bucket);
    this.subscribersById.set(subscriber.id, subscriber);

    return subscriber;
  }

  public unsubscribe(subscriberId: string): boolean {
    const subscriber = this.subscribersById.get(subscriberId);
    if (!subscriber) {
      return false;
    }

    this.subscribersById.delete(subscriberId);
    const bucket = this.subscribersByType.get(subscriber.type);
    if (bucket) {
      bucket.delete(subscriber);
      if (bucket.size === 0) {
        this.subscribersByType.delete(subscriber.type);
      }
    }

    return true;
  }

  public clear(type?: string): void {
    if (!type) {
      this.subscribersByType.clear();
      this.subscribersById.clear();
      return;
    }

    const bucket = this.subscribersByType.get(type);
    if (!bucket) {
      return;
    }

    for (const subscriber of bucket) {
      this.subscribersById.delete(subscriber.id);
    }

    this.subscribersByType.delete(type);
  }

  public getSubscriber(subscriberId: string): Subscriber | undefined {
    return this.subscribersById.get(subscriberId);
  }

  public getSubscribers(type?: string): Subscriber[] {
    if (type) {
      return Array.from(this.subscribersByType.get(type) ?? []);
    }

    return Array.from(this.subscribersById.values());
  }

  public async dispatch(event: Event): Promise<DispatchResult> {
    const targets = new Set<Subscriber>();
    const direct = this.subscribersByType.get(event.type);
    const wildcard = this.subscribersByType.get("*");

    if (direct) {
      for (const subscriber of direct) {
        targets.add(subscriber);
      }
    }

    if (wildcard) {
      for (const subscriber of wildcard) {
        targets.add(subscriber);
      }
    }

    const errors: DispatchError[] = [];
    let delivered = 0;

    for (const subscriber of targets) {
      let executed = false;
      if (subscriber.filter) {
        try {
          if (!subscriber.filter(event)) {
            continue;
          }
        } catch (error: unknown) {
          errors.push({
            subscriberId: subscriber.id,
            error:
              error instanceof Error
                ? error
                : new RuntimeError(String(error), { cause: error }),
            stage: "filter",
          });
          continue;
        }
      }

      try {
        executed = true;
        const context: DispatchContext = {
          subscriberId: subscriber.id,
          dispatcher: this,
          eventType: event.type,
        };
        await subscriber.handler(event, context);
        delivered += 1;
      } catch (error: unknown) {
        errors.push({
          subscriberId: subscriber.id,
          error:
            error instanceof Error
              ? error
              : new RuntimeError(String(error), { cause: error }),
          stage: "handler",
        });
      } finally {
        if (subscriber.once && executed) {
          this.unsubscribe(subscriber.id);
        }
      }
    }

    return { event, delivered, errors };
  }
}
