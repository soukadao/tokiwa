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

export class Logger {
  private level: LogLevel = DEFAULT_LOG_LEVEL;
  private levelValue: number = LOG_LEVEL[DEFAULT_LOG_LEVEL];
  private sink: LogSink = createDefaultSink();

  constructor(options: LoggerOptions = {}) {
    if (options.level) {
      this.setLevel(options.level);
    }
    if (options.sink) {
      this.setSink(options.sink);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelValue = LOG_LEVEL[level];
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setSink(sink: LogSink): void {
    this.sink = sink;
  }

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

  emergency(message: string, context?: Record<string, unknown>): void {
    this.log("emergency", message, context);
  }

  alert(message: string, context?: Record<string, unknown>): void {
    this.log("alert", message, context);
  }

  critical(message: string, context?: Record<string, unknown>): void {
    this.log("critical", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  warning(message: string, context?: Record<string, unknown>): void {
    this.log("warning", message, context);
  }

  notice(message: string, context?: Record<string, unknown>): void {
    this.log("notice", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }
}
export const createLogger = (options: LoggerOptions = {}): Logger =>
  new Logger(options);
