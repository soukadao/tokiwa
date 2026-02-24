import { type Stats } from "node:fs";
export interface FileSystemOptions {
    baseDir?: string;
}
/**
 * ファイルシステム操作のラッパークラス
 * baseDirを基準としたパス解決とテキスト/JSON/ディレクトリ操作を提供する
 */
export declare class FileSystem {
    private readonly baseDir;
    /**
     * @param options ベースディレクトリ等のオプション
     */
    constructor(options?: FileSystemOptions);
    /**
     * baseDirを基準にパスを解決する
     * @param path 相対パスまたは絶対パス
     * @returns 解決済みのパス
     */
    resolvePath(path: string): string;
    /**
     * テキストファイルを読み込む
     * @param path ファイルパス
     * @returns ファイルの内容
     */
    readText(path: string): Promise<string>;
    /**
     * テキストファイルに書き込む。親ディレクトリがなければ自動作成する
     * @param path ファイルパス
     * @param contents 書き込む内容
     */
    writeText(path: string, contents: string): Promise<void>;
    /**
     * テキストファイルに追記する。親ディレクトリがなければ自動作成する
     * @param path ファイルパス
     * @param contents 追記する内容
     */
    appendText(path: string, contents: string): Promise<void>;
    /**
     * JSONファイルを読み込みパースする
     * @param path ファイルパス
     * @returns パースされたオブジェクト
     * @throws {SerializationError} JSONパースに失敗した場合
     */
    readJson<T = unknown>(path: string): Promise<T>;
    /**
     * 値をJSON形式でファイルに書き込む
     * @param path ファイルパス
     * @param value 書き込む値
     * @param indent インデント幅（デフォルト: 2）
     * @throws {SerializationError} JSONシリアライズに失敗した場合
     */
    writeJson(path: string, value: unknown, indent?: number): Promise<void>;
    /**
     * ディレクトリを作成する。既に存在する場合は何もしない
     * @param path ディレクトリパス
     */
    ensureDir(path: string): Promise<void>;
    /**
     * ファイルまたはディレクトリが存在するか確認する
     * @param path パス
     * @returns 存在すればtrue
     */
    exists(path: string): Promise<boolean>;
    /**
     * ファイルまたはディレクトリの情報を取得する
     * @param path パス
     * @returns ファイルステータス
     */
    stat(path: string): Promise<Stats>;
    /**
     * ディレクトリ内のエントリ一覧を取得する
     * @param path ディレクトリパス
     * @returns ファイル名の配列
     */
    listDir(path: string): Promise<string[]>;
    /**
     * ファイルまたはディレクトリを再帰的に削除する
     * @param path 削除対象のパス
     */
    remove(path: string): Promise<void>;
}
