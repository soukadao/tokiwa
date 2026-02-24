/**
 * アプリケーション共通の基底エラークラス
 * サブクラス名を自動的にnameプロパティに設定する
 */
export declare class AppError extends Error {
    /**
     * @param message エラーメッセージ
     * @param options エラーオプション（causeなど）
     */
    constructor(message: string, options?: ErrorOptions);
}
/** 無効な引数が渡された場合のエラー */
export declare class InvalidArgumentError extends AppError {
}
/** 実行時エラー */
export declare class RuntimeError extends AppError {
}
/** リソースが見つからない場合のエラー */
export declare class NotFoundError extends AppError {
}
/** リソースの競合が発生した場合のエラー */
export declare class ConflictError extends AppError {
}
/** 不正な状態で操作が実行された場合のエラー */
export declare class StateError extends AppError {
}
/** 依存関係に問題がある場合のエラー */
export declare class DependencyError extends AppError {
}
/** 循環依存が検出された場合のエラー */
export declare class CyclicDependencyError extends DependencyError {
}
/** シリアライズ/デシリアライズに失敗した場合のエラー */
export declare class SerializationError extends AppError {
}
