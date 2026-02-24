import { InvalidArgumentError } from "./errors.js";

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "off"]);
const EMPTY_PREFIX = "";

export interface EnvLoadOptions {
  prefix?: string;
  parseNumbers?: boolean;
  parseBooleans?: boolean;
}

export class Config {
  private readonly store = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  loadFromEnv(options: EnvLoadOptions = {}): void {
    const prefix = options.prefix ?? EMPTY_PREFIX;
    const parseNumbers = options.parseNumbers ?? true;
    const parseBooleans = options.parseBooleans ?? true;

    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(prefix) || value === undefined) {
        continue;
      }

      const normalizedKey = prefix ? key.slice(prefix.length) : key;
      const parsed = this.parseEnvValue(value, parseNumbers, parseBooleans);
      this.set(normalizedKey, parsed);
    }
  }

  getString(key: string, fallback?: string): string | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "string") {
      return value;
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a string`);
  }

  getNumber(key: string, fallback?: number): number | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && NUMBER_PATTERN.test(value)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a number`);
  }

  getBoolean(key: string, fallback?: boolean): boolean | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (BOOLEAN_TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (BOOLEAN_FALSE_VALUES.has(normalized)) {
        return false;
      }
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a boolean`);
  }

  getRequired<T>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new InvalidArgumentError(`Missing required config value: ${key}`);
    }
    return value;
  }

  private parseEnvValue(
    value: string,
    parseNumbers: boolean,
    parseBooleans: boolean,
  ): string | number | boolean {
    if (parseBooleans) {
      const normalized = value.toLowerCase();
      if (BOOLEAN_TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (BOOLEAN_FALSE_VALUES.has(normalized)) {
        return false;
      }
    }

    if (parseNumbers && NUMBER_PATTERN.test(value)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return value;
  }
}
export const createConfig = (): Config => new Config();
