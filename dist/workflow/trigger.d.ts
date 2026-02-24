export type EventTypeMatcher = string | string[] | RegExp;
export interface EventLike {
    type: string;
}
export interface EventTrigger<TEvent = EventLike, TInput = unknown, TContext = unknown> {
    type: "event";
    eventType: EventTypeMatcher;
    filter?: (event: TEvent) => boolean;
    mapInput?: (event: TEvent) => TInput;
    mapContext?: (event: TEvent) => TContext;
    mapConversationId?: (event: TEvent) => string;
}
export interface ManualTrigger {
    type: "manual";
}
export type Trigger<TEvent = EventLike, TInput = unknown, TContext = unknown> = EventTrigger<TEvent, TInput, TContext> | ManualTrigger;
