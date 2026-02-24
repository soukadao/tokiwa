/**
 * Parsed cron fields in local time.
 * dayOfWeek uses 0 (Sunday) through 6 (Saturday).
 */
interface CronFields {
    minute: number[];
    hour: number[];
    dayOfMonth: number[];
    month: number[];
    dayOfWeek: number[];
}
/**
 * Parses a 5-field cron expression and evaluates dates in local time.
 */
export declare class Cron {
    private static readonly MAX_ITERATIONS;
    private readonly fields;
    /**
     * @param expression minute hour dayOfMonth month dayOfWeek
     */
    constructor(expression: string);
    /**
     * 5フィールドのcron式をパースし、CronFieldsオブジェクトに変換する。
     * @param expression スペース区切りのcron式文字列
     * @returns パース済みのCronFieldsオブジェクト
     */
    private parse;
    /**
     * 単一フィールドをパースする。ワイルドカード(*)、範囲、ステップ、カンマ区切りに対応する。
     * @param field パース対象のフィールド文字列
     * @param min フィールドの最小許容値
     * @param max フィールドの最大許容値
     * @returns ソート済みの許容値配列
     */
    private parseField;
    /**
     * カンマ区切りフィールドの1パートをパースし、値をセットに追加する。
     * ステップ式(/)、範囲式(-)、単一値のいずれかを処理する。
     * @param part パース対象のパート文字列
     * @param min フィールドの最小許容値
     * @param max フィールドの最大許容値
     * @param values パース結果を格納するセット
     */
    private parseFieldPart;
    /**
     * ステップ値をパースし、有効な正の整数であることを検証する。
     * @param step ステップ値の文字列
     * @returns パース済みのステップ値
     * @throws {InvalidArgumentError} ステップ値が無効または1未満の場合
     */
    private parseStepValue;
    /**
     * ステップ式の範囲部分をパースする。*(全範囲)、数値-数値(明示範囲)、単一数値(開始値のみ)に対応する。
     * @param range 範囲文字列（例: "*", "1-5", "3"）
     * @param min フィールドの最小許容値
     * @param max フィールドの最大許容値
     * @returns 開始値と終了値を含むオブジェクト
     */
    private parseStepRange;
    /**
     * 整数値をパースし、指定された範囲内であることを検証する。
     * @param value パース対象の文字列
     * @param min 許容される最小値
     * @param max 許容される最大値
     * @param label エラーメッセージ用のラベル文字列
     * @returns パース済みの整数値
     * @throws {InvalidArgumentError} 値が無効または範囲外の場合
     */
    private parseBoundedValue;
    /**
     * 指定されたステップ間隔で範囲内の値をセットに追加する。
     * @param values 値を追加するセット
     * @param start 範囲の開始値
     * @param end 範囲の終了値
     * @param step ステップ間隔
     * @param min フィールドの最小許容値
     * @param max フィールドの最大許容値
     */
    private addRange;
    /**
     * 最小値から最大値までの連続した整数配列を生成する。
     * @param min 範囲の開始値
     * @param max 範囲の終了値
     * @returns 連続した整数の配列
     */
    private buildRange;
    /**
     * セットを昇順にソートされた配列に変換する。
     * @param values 変換対象のセット
     * @returns ソート済みの数値配列
     */
    private sortedValues;
    /**
     * Returns true when the date matches the cron fields.
     */
    matches(date: Date): boolean;
    /**
     * Returns the next execution time after the given date.
     * Seconds and milliseconds are cleared before searching.
     */
    getNextExecution(after?: Date): Date;
    /**
     * Returns a shallow copy of the parsed fields.
     */
    getFields(): CronFields;
    /**
     * 指定された日付がdayOfMonthとdayOfWeekの両方に一致するか判定する。
     * @param date 判定対象の日付
     * @returns 両フィールドに一致する場合true
     */
    private matchesDay;
    /**
     * ソート済みリストから現在値以上の次の許容値を探す。
     * 現在値以上の値が見つからない場合、リストの先頭に戻りキャリーフラグをtrueにする。
     * @param values ソート済みの許容値リスト
     * @param current 現在の値
     * @returns 次の許容値とキャリーフラグを含むオブジェクト
     */
    private nextAllowedValue;
}
export {};
