import { InvalidArgumentError, RuntimeError } from "../core/index.js";

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

type CronFieldKey = keyof CronFields;

interface CronFieldSpec {
  key: CronFieldKey;
  min: number;
  max: number;
}

const CRON_FIELD_SPECS: ReadonlyArray<CronFieldSpec> = [
  { key: "minute", min: 0, max: 59 },
  { key: "hour", min: 0, max: 23 },
  { key: "dayOfMonth", min: 1, max: 31 },
  { key: "month", min: 1, max: 12 },
  { key: "dayOfWeek", min: 0, max: 6 },
];

const CRON_FIELD_COUNT = CRON_FIELD_SPECS.length;
const BASE_10 = 10;
const MIN_STEP_VALUE = 1;
const DEFAULT_RANGE_STEP = 1;
const NEXT_MINUTE_INCREMENT = 1;
const NEXT_HOUR_INCREMENT = 1;
const NEXT_DAY_INCREMENT = 1;
const NEXT_YEAR_INCREMENT = 1;
const MONTH_OFFSET = 1;
const RESET_HOURS = 0;
const RESET_MINUTES = 0;
const RESET_SECONDS = 0;
const RESET_MILLISECONDS = 0;
const LOOKAHEAD_YEARS = 4;
const DAYS_PER_YEAR = 365;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const CRON_MAX_ITERATIONS =
  LOOKAHEAD_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR;

/**
 * Parses a 5-field cron expression and evaluates dates in local time.
 */
export class Cron {
  private static readonly MAX_ITERATIONS = CRON_MAX_ITERATIONS;
  private readonly fields: CronFields;

  /**
   * @param expression minute hour dayOfMonth month dayOfWeek
   */
  constructor(expression: string) {
    this.fields = this.parse(expression);
  }

  /**
   * 5フィールドのcron式をパースし、CronFieldsオブジェクトに変換する。
   * @param expression スペース区切りのcron式文字列
   * @returns パース済みのCronFieldsオブジェクト
   */
  private parse(expression: string): CronFields {
    const parts = expression.trim().split(/\s+/);

    if (parts.length !== CRON_FIELD_COUNT) {
      throw new InvalidArgumentError(
        "Cron expression must have exactly 5 fields",
      );
    }

    const fields: Record<CronFieldKey, number[]> = {
      minute: [],
      hour: [],
      dayOfMonth: [],
      month: [],
      dayOfWeek: [],
    };

    CRON_FIELD_SPECS.forEach((spec, index) => {
      fields[spec.key] = this.parseField(parts[index], spec.min, spec.max);
    });

    return fields;
  }

  /**
   * 単一フィールドをパースする。ワイルドカード(*)、範囲、ステップ、カンマ区切りに対応する。
   * @param field パース対象のフィールド文字列
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @returns ソート済みの許容値配列
   */
  private parseField(field: string, min: number, max: number): number[] {
    if (field === "*") {
      return this.buildRange(min, max);
    }

    const values = new Set<number>();
    const parts = field.split(",");

    for (const part of parts) {
      this.parseFieldPart(part, min, max, values);
    }

    return this.sortedValues(values);
  }

  /**
   * カンマ区切りフィールドの1パートをパースし、値をセットに追加する。
   * ステップ式(/)、範囲式(-)、単一値のいずれかを処理する。
   * @param part パース対象のパート文字列
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @param values パース結果を格納するセット
   */
  private parseFieldPart(
    part: string,
    min: number,
    max: number,
    values: Set<number>,
  ): void {
    if (part.includes("/")) {
      const [range, step] = part.split("/");
      const stepValue = this.parseStepValue(step);
      const { start, end } = this.parseStepRange(range, min, max);
      this.addRange(values, start, end, stepValue, min, max);
      return;
    }

    if (part.includes("-")) {
      const [start, end] = part.split("-");
      const startValue = parseInt(start, BASE_10);
      const endValue = parseInt(end, BASE_10);

      if (Number.isNaN(startValue) || Number.isNaN(endValue)) {
        throw new InvalidArgumentError(`Invalid range: ${part}`);
      }

      if (startValue < min || endValue > max || startValue > endValue) {
        throw new InvalidArgumentError(`Range out of bounds: ${part}`);
      }

      this.addRange(values, startValue, endValue, DEFAULT_RANGE_STEP, min, max);
      return;
    }

    const value = parseInt(part, BASE_10);

    if (Number.isNaN(value)) {
      throw new InvalidArgumentError(`Invalid value: ${part}`);
    }

    if (value < min || value > max) {
      throw new InvalidArgumentError(
        `Value out of bounds: ${value} (must be between ${min} and ${max})`,
      );
    }

    values.add(value);
  }

  /**
   * ステップ値をパースし、有効な正の整数であることを検証する。
   * @param step ステップ値の文字列
   * @returns パース済みのステップ値
   * @throws {InvalidArgumentError} ステップ値が無効または1未満の場合
   */
  private parseStepValue(step: string): number {
    const stepValue = parseInt(step, BASE_10);

    if (Number.isNaN(stepValue) || stepValue < MIN_STEP_VALUE) {
      throw new InvalidArgumentError(`Invalid step value: ${step}`);
    }

    return stepValue;
  }

  /**
   * ステップ式の範囲部分をパースする。*(全範囲)、数値-数値(明示範囲)、単一数値(開始値のみ)に対応する。
   * @param range 範囲文字列（例: "*", "1-5", "3"）
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @returns 開始値と終了値を含むオブジェクト
   */
  private parseStepRange(
    range: string,
    min: number,
    max: number,
  ): { start: number; end: number } {
    if (range === "*") {
      return { start: min, end: max };
    }

    if (range.includes("-")) {
      const [start, end] = range.split("-");
      const startValue = this.parseBoundedValue(start, min, max, range);
      const endValue = this.parseBoundedValue(end, min, max, range);

      if (startValue > endValue) {
        throw new InvalidArgumentError(`Range out of bounds: ${range}`);
      }

      return { start: startValue, end: endValue };
    }

    return {
      start: this.parseBoundedValue(range, min, max, range),
      end: max,
    };
  }

  /**
   * 整数値をパースし、指定された範囲内であることを検証する。
   * @param value パース対象の文字列
   * @param min 許容される最小値
   * @param max 許容される最大値
   * @param label エラーメッセージ用のラベル文字列
   * @returns パース済みの整数値
   * @throws {InvalidArgumentError} 値が無効または範囲外の場合
   */
  private parseBoundedValue(
    value: string,
    min: number,
    max: number,
    label: string,
  ): number {
    const parsed = parseInt(value, BASE_10);

    if (Number.isNaN(parsed)) {
      throw new InvalidArgumentError(`Invalid range: ${label}`);
    }

    if (parsed < min || parsed > max) {
      throw new InvalidArgumentError(`Range out of bounds: ${label}`);
    }

    return parsed;
  }

  /**
   * 指定されたステップ間隔で範囲内の値をセットに追加する。
   * @param values 値を追加するセット
   * @param start 範囲の開始値
   * @param end 範囲の終了値
   * @param step ステップ間隔
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   */
  private addRange(
    values: Set<number>,
    start: number,
    end: number,
    step: number,
    min: number,
    max: number,
  ): void {
    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) {
        values.add(i);
      }
    }
  }

  /**
   * 最小値から最大値までの連続した整数配列を生成する。
   * @param min 範囲の開始値
   * @param max 範囲の終了値
   * @returns 連続した整数の配列
   */
  private buildRange(min: number, max: number): number[] {
    const values: number[] = [];
    for (let i = min; i <= max; i++) {
      values.push(i);
    }
    return values;
  }

  /**
   * セットを昇順にソートされた配列に変換する。
   * @param values 変換対象のセット
   * @returns ソート済みの数値配列
   */
  private sortedValues(values: Set<number>): number[] {
    return Array.from(values).sort((a, b) => a - b);
  }

  /**
   * Returns true when the date matches the cron fields.
   */
  public matches(date: Date): boolean {
    return (
      this.fields.minute.includes(date.getMinutes()) &&
      this.fields.hour.includes(date.getHours()) &&
      this.fields.dayOfMonth.includes(date.getDate()) &&
      this.fields.month.includes(date.getMonth() + MONTH_OFFSET) &&
      this.fields.dayOfWeek.includes(date.getDay())
    );
  }

  /**
   * Returns the next execution time after the given date.
   * Seconds and milliseconds are cleared before searching.
   */
  public getNextExecution(after: Date = new Date()): Date {
    const next = new Date(after);
    next.setSeconds(RESET_SECONDS, RESET_MILLISECONDS);
    next.setMinutes(next.getMinutes() + NEXT_MINUTE_INCREMENT);

    let iterations = 0;

    while (iterations < Cron.MAX_ITERATIONS) {
      const month = next.getMonth() + MONTH_OFFSET;
      if (!this.fields.month.includes(month)) {
        const { value, carry } = this.nextAllowedValue(
          this.fields.month,
          month,
        );
        if (carry) {
          next.setFullYear(next.getFullYear() + NEXT_YEAR_INCREMENT);
        }
        next.setMonth(value - MONTH_OFFSET, 1);
        next.setHours(
          RESET_HOURS,
          RESET_MINUTES,
          RESET_SECONDS,
          RESET_MILLISECONDS,
        );
        iterations++;
        continue;
      }

      if (!this.matchesDay(next)) {
        next.setDate(next.getDate() + NEXT_DAY_INCREMENT);
        next.setHours(
          RESET_HOURS,
          RESET_MINUTES,
          RESET_SECONDS,
          RESET_MILLISECONDS,
        );
        iterations++;
        continue;
      }

      const hour = next.getHours();
      if (!this.fields.hour.includes(hour)) {
        const { value, carry } = this.nextAllowedValue(this.fields.hour, hour);
        if (carry) {
          next.setDate(next.getDate() + NEXT_DAY_INCREMENT);
        }
        next.setHours(value, RESET_MINUTES, RESET_SECONDS, RESET_MILLISECONDS);
        iterations++;
        continue;
      }

      const minute = next.getMinutes();
      if (!this.fields.minute.includes(minute)) {
        const { value, carry } = this.nextAllowedValue(
          this.fields.minute,
          minute,
        );
        if (carry) {
          next.setHours(
            next.getHours() + NEXT_HOUR_INCREMENT,
            value,
            RESET_SECONDS,
            RESET_MILLISECONDS,
          );
        } else {
          next.setMinutes(value, RESET_SECONDS, RESET_MILLISECONDS);
        }
        iterations++;
        continue;
      }

      return next;
    }

    if (iterations >= Cron.MAX_ITERATIONS) {
      throw new RuntimeError(
        `Could not find next execution time within ${LOOKAHEAD_YEARS} years`,
      );
    }

    return next;
  }

  /**
   * Returns a shallow copy of the parsed fields.
   */
  public getFields(): CronFields {
    return { ...this.fields };
  }

  /**
   * 指定された日付がdayOfMonthとdayOfWeekの両方に一致するか判定する。
   * @param date 判定対象の日付
   * @returns 両フィールドに一致する場合true
   */
  private matchesDay(date: Date): boolean {
    return (
      this.fields.dayOfMonth.includes(date.getDate()) &&
      this.fields.dayOfWeek.includes(date.getDay())
    );
  }

  /**
   * ソート済みリストから現在値以上の次の許容値を探す。
   * 現在値以上の値が見つからない場合、リストの先頭に戻りキャリーフラグをtrueにする。
   * @param values ソート済みの許容値リスト
   * @param current 現在の値
   * @returns 次の許容値とキャリーフラグを含むオブジェクト
   */
  private nextAllowedValue(
    values: number[],
    current: number,
  ): { value: number; carry: boolean } {
    for (const value of values) {
      if (value >= current) {
        return { value, carry: false };
      }
    }

    return { value: values[0], carry: true };
  }
}
