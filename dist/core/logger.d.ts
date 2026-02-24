export declare const LOG_LEVEL: {
    readonly emergency: 0;
    readonly alert: 1;
    readonly critical: 2;
    readonly error: 3;
    readonly warning: 4;
    readonly notice: 5;
    readonly info: 6;
    readonly debug: 7;
};
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
/**
 * レベル付きロガー
 * シンク（出力先）を差し替え可能で、レベルによるフィルタリングを行う
 */
export declare class Logger {
    private level;
    private levelValue;
    private sink;
    /**
     * @param options ログレベルやシンクの設定
     */
    constructor(options?: LoggerOptions);
    /**
     * ログレベルを変更する
     * @param level 新しいログレベル
     */
    setLevel(level: LogLevel): void;
    /**
     * 現在のログレベルを返す
     * @returns 現在のログレベル
     */
    getLevel(): LogLevel;
    /**
     * ログ出力先（シンク）を変更する
     * @param sink 新しいログシンク
     */
    setSink(sink: LogSink): void;
    /**
     * 指定レベルでログを記録する。現在のレベル以下の場合のみ出力される
     * @param level ログレベル
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
    /**
     * emergencyレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    emergency(message: string, context?: Record<string, unknown>): void;
    /**
     * alertレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    alert(message: string, context?: Record<string, unknown>): void;
    /**
     * criticalレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    critical(message: string, context?: Record<string, unknown>): void;
    /**
     * errorレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    error(message: string, context?: Record<string, unknown>): void;
    /**
     * warningレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    warning(message: string, context?: Record<string, unknown>): void;
    /**
     * noticeレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    notice(message: string, context?: Record<string, unknown>): void;
    /**
     * infoレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    info(message: string, context?: Record<string, unknown>): void;
    /**
     * debugレベルのログを記録する
     * @param message ログメッセージ
     * @param context 追加のコンテキスト情報
     */
    debug(message: string, context?: Record<string, unknown>): void;
}
/**
 * 新しいLoggerインスタンスを生成するファクトリ関数
 * @param options ログレベルやシンクの設定
 * @returns 新しいLoggerインスタンス
 */
export declare const createLogger: (options?: LoggerOptions) => Logger;
