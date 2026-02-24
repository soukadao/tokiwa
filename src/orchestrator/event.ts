import { generateId, InvalidArgumentError } from "../core/index.js";

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  source?: string;
  tags?: string[];
}

export interface EventInit<TPayload = unknown> {
  id?: string;
  type: string;
  payload?: TPayload;
  timestamp?: Date;
  metadata?: EventMetadata;
}

export class Event<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly timestamp: Date;
  readonly metadata: EventMetadata;

  constructor(init: EventInit<TPayload>) {
    if (!init.type || init.type.trim().length === 0) {
      throw new InvalidArgumentError("Event type must be a non-empty string");
    }

    this.id = init.id ?? generateId();
    this.type = init.type;
    this.payload = init.payload as TPayload;
    this.timestamp = init.timestamp ?? new Date();
    this.metadata = init.metadata ?? {};
  }

  static create<TPayload = unknown>(
    type: string,
    payload?: TPayload,
    metadata?: EventMetadata,
  ): Event<TPayload> {
    return new Event<TPayload>({ type, payload, metadata });
  }
}
