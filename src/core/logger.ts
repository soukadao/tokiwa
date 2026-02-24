export const LOG_LEVEL = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
} as const;

export type LogLevel = keyof typeof LOG_LEVEL;

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

export type LogSink = (entry: LogEntry) => void;

export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
}

const DEFAULT_LOG_LEVEL: LogLevel = "info";
const UNSERIALIZABLE_PLACEHOLDER = "[Unserializable]";

const LEVEL_METHOD_MAP: Record<
  LogLevel,
  "debug" | "info" | "warn" | "error" | "log"
> = {
  emergency: "error",
  alert: "error",
  critical: "error",
  error: "error",
  warning: "warn",
  notice: "info",
  info: "info",
  debug: "debug",
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return UNSERIALIZABLE_PLACEHOLDER;
  }
};

const createDefaultSink = (): LogSink => {
  return (entry: LogEntry): void => {
    const method = LEVEL_METHOD_MAP[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const contextText = entry.context ? ` ${safeStringify(entry.context)}` : "";
    console[method](
      `[${timestamp}] ${entry.level}: ${entry.message}${contextText}`,
    );
  };
};

/**
 * レベル付きロガー
 * シンク（出力先）を差し替え可能で、レベルによるフィルタリングを行う
 */
export class Logger {
  private level: LogLevel = DEFAULT_LOG_LEVEL;
  private levelValue: number = LOG_LEVEL[DEFAULT_LOG_LEVEL];
  private sink: LogSink = createDefaultSink();

  /**
   * @param options ログレベルやシンクの設定
   */
  constructor(options: LoggerOptions = {}) {
    if (options.level) {
      this.setLevel(options.level);
    }
    if (options.sink) {
      this.setSink(options.sink);
    }
  }

  /**
   * ログレベルを変更する
   * @param level 新しいログレベル
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelValue = LOG_LEVEL[level];
  }

  /**
   * 現在のログレベルを返す
   * @returns 現在のログレベル
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * ログ出力先（シンク）を変更する
   * @param sink 新しいログシンク
   */
  setSink(sink: LogSink): void {
    this.sink = sink;
  }

  /**
   * 指定レベルでログを記録する。現在のレベル以下の場合のみ出力される
   * @param level ログレベル
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL[level] > this.levelValue) {
      return;
    }
    this.sink({ level, message, timestamp: new Date(), context });
  }

  /**
   * emergencyレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  emergency(message: string, context?: Record<string, unknown>): void {
    this.log("emergency", message, context);
  }

  /**
   * alertレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  alert(message: string, context?: Record<string, unknown>): void {
    this.log("alert", message, context);
  }

  /**
   * criticalレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  critical(message: string, context?: Record<string, unknown>): void {
    this.log("critical", message, context);
  }

  /**
   * errorレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  /**
   * warningレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  warning(message: string, context?: Record<string, unknown>): void {
    this.log("warning", message, context);
  }

  /**
   * noticeレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  notice(message: string, context?: Record<string, unknown>): void {
    this.log("notice", message, context);
  }

  /**
   * infoレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  /**
   * debugレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }
}
/**
 * 新しいLoggerインスタンスを生成するファクトリ関数
 * @param options ログレベルやシンクの設定
 * @returns 新しいLoggerインスタンス
 */
export const createLogger = (options: LoggerOptions = {}): Logger =>
  new Logger(options);
