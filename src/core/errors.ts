/**
 * アプリケーション共通の基底エラークラス
 * サブクラス名を自動的にnameプロパティに設定する
 */
export class AppError extends Error {
  /**
   * @param message エラーメッセージ
   * @param options エラーオプション（causeなど）
   */
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** 無効な引数が渡された場合のエラー */
export class InvalidArgumentError extends AppError {}

/** 実行時エラー */
export class RuntimeError extends AppError {}

/** リソースが見つからない場合のエラー */
export class NotFoundError extends AppError {}

/** リソースの競合が発生した場合のエラー */
export class ConflictError extends AppError {}

/** 不正な状態で操作が実行された場合のエラー */
export class StateError extends AppError {}

/** 依存関係に問題がある場合のエラー */
export class DependencyError extends AppError {}

/** 循環依存が検出された場合のエラー */
export class CyclicDependencyError extends DependencyError {}

/** シリアライズ/デシリアライズに失敗した場合のエラー */
export class SerializationError extends AppError {}
