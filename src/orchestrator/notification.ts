import { TZDate } from "@date-fns/tz";
import { generateId } from "../core/index.js";
import type { Event } from "./event.js";

export type NotificationLevel = "info" | "warning" | "error";

export interface NotificationInit {
  level?: NotificationLevel;
  message: string;
  timestamp?: Date;
  data?: unknown;
  event?: Event;
}

/**
 * システム通知を表すクラス。通知レベル、メッセージ、任意のデータおよび関連イベントを保持する。
 */
export class Notification {
  readonly id: string;
  readonly level: NotificationLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly data?: unknown;
  readonly event?: Event;

  /**
   * NotificationInitから通知を生成する。レベルが未指定の場合は"info"がデフォルトとなる。
   *
   * @param init - 通知の初期化パラメータ
   */
  constructor(init: NotificationInit) {
    this.id = generateId();
    this.level = init.level ?? "info";
    this.message = init.message;
    this.timestamp = init.timestamp ?? new TZDate();
    this.data = init.data;
    this.event = init.event;
  }
}
