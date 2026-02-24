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

      if (isNaN(startValue) || isNaN(endValue)) {
        throw new InvalidArgumentError(`Invalid range: ${part}`);
      }

      if (startValue < min || endValue > max || startValue > endValue) {
        throw new InvalidArgumentError(`Range out of bounds: ${part}`);
      }

      this.addRange(values, startValue, endValue, DEFAULT_RANGE_STEP, min, max);
      return;
    }

    const value = parseInt(part, BASE_10);

    if (isNaN(value)) {
      throw new InvalidArgumentError(`Invalid value: ${part}`);
    }

    if (value < min || value > max) {
      throw new InvalidArgumentError(
        `Value out of bounds: ${value} (must be between ${min} and ${max})`,
      );
    }

    values.add(value);
  }

  private parseStepValue(step: string): number {
    const stepValue = parseInt(step, BASE_10);

    if (isNaN(stepValue) || stepValue < MIN_STEP_VALUE) {
      throw new InvalidArgumentError(`Invalid step value: ${step}`);
    }

    return stepValue;
  }

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

  private parseBoundedValue(
    value: string,
    min: number,
    max: number,
    label: string,
  ): number {
    const parsed = parseInt(value, BASE_10);

    if (isNaN(parsed)) {
      throw new InvalidArgumentError(`Invalid range: ${label}`);
    }

    if (parsed < min || parsed > max) {
      throw new InvalidArgumentError(`Range out of bounds: ${label}`);
    }

    return parsed;
  }

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

  private buildRange(min: number, max: number): number[] {
    const values: number[] = [];
    for (let i = min; i <= max; i++) {
      values.push(i);
    }
    return values;
  }

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

  private matchesDay(date: Date): boolean {
    return (
      this.fields.dayOfMonth.includes(date.getDate()) &&
      this.fields.dayOfWeek.includes(date.getDay())
    );
  }

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
