import { generateId, InvalidArgumentError } from "../core/index.js";
import type { Event } from "./event.js";

export interface HandlerContext {
  subscriberId: string;
}

export type EventHandler<TPayload = unknown> = (
  event: Event<TPayload>,
  context: HandlerContext,
) => void | Promise<void>;

export interface SubscriberOptions {
  name?: string;
  once?: boolean;
  filter?: (event: Event) => boolean;
}

export class Subscriber<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly once: boolean;
  readonly filter?: (event: Event) => boolean;
  readonly handler: EventHandler<TPayload>;

  constructor(
    type: string,
    handler: EventHandler<TPayload>,
    options: SubscriberOptions = {},
  ) {
    if (!type || type.trim().length === 0) {
      throw new InvalidArgumentError(
        "Subscriber type must be a non-empty string",
      );
    }

    this.id = generateId();
    this.type = type;
    this.name = options.name;
    this.once = options.once ?? false;
    this.filter = options.filter;
    this.handler = handler;
  }
}
