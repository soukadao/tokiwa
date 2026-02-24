export interface EnvLoadOptions {
    prefix?: string;
    parseNumbers?: boolean;
    parseBooleans?: boolean;
}
/**
 * キーバリュー形式の設定ストア
 * 環境変数からの読み込みや型安全な値取得をサポートする
 */
export declare class Config {
    private readonly store;
    /**
     * 設定値を保存する
     * @param key 設定キー
     * @param value 設定値
     */
    set<T>(key: string, value: T): void;
    /**
     * 設定値を取得する
     * @param key 設定キー
     * @returns 設定値。キーが存在しない場合はundefined
     */
    get<T>(key: string): T | undefined;
    /**
     * 指定キーが存在するか確認する
     * @param key 設定キー
     * @returns キーが存在すればtrue
     */
    has(key: string): boolean;
    /**
     * 指定キーの設定値を削除する
     * @param key 設定キー
     * @returns キーが存在して削除されたらtrue
     */
    delete(key: string): boolean;
    /** すべての設定値をクリアする */
    clear(): void;
    /**
     * 環境変数から設定を読み込む
     * prefixで絞り込み、数値・真偽値の自動パースが可能
     * @param options 読み込みオプション
     */
    loadFromEnv(options?: EnvLoadOptions): void;
    /**
     * 文字列型として設定値を取得する
     * @param key 設定キー
     * @param fallback キーが存在しない場合のデフォルト値
     * @returns 文字列値。キーが存在せずfallbackもない場合はundefined
     * @throws {InvalidArgumentError} 値が文字列でない場合
     */
    getString(key: string, fallback?: string): string | undefined;
    /**
     * 数値型として設定値を取得する
     * @param key 設定キー
     * @param fallback キーが存在しない場合のデフォルト値
     * @returns 数値。キーが存在せずfallbackもない場合はundefined
     * @throws {InvalidArgumentError} 値が数値に変換できない場合
     */
    getNumber(key: string, fallback?: number): number | undefined;
    /**
     * 真偽値型として設定値を取得する
     * 文字列の場合、"true"/"1"/"yes"/"on"はtrue、"false"/"0"/"no"/"off"はfalseとして扱う
     * @param key 設定キー
     * @param fallback キーが存在しない場合のデフォルト値
     * @returns 真偽値。キーが存在せずfallbackもない場合はundefined
     * @throws {InvalidArgumentError} 値が真偽値に変換できない場合
     */
    getBoolean(key: string, fallback?: boolean): boolean | undefined;
    /**
     * 必須の設定値を取得する
     * @param key 設定キー
     * @returns 設定値
     * @throws {InvalidArgumentError} キーが存在しない場合
     */
    getRequired<T>(key: string): T;
    /**
     * 環境変数の文字列値を適切な型にパースする
     * @param value 環境変数の文字列値
     * @param parseNumbers 数値パースを有効にするか
     * @param parseBooleans 真偽値パースを有効にするか
     * @returns パースされた値
     */
    private parseEnvValue;
}
/**
 * 新しいConfigインスタンスを生成するファクトリ関数
 * @returns 新しいConfigインスタンス
 */
export declare const createConfig: () => Config;
