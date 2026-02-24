import { promises as fs, type Stats } from "node:fs";
import { dirname, resolve } from "node:path";
import { SerializationError } from "./errors.js";

const DEFAULT_ENCODING: BufferEncoding = "utf8";
const DEFAULT_JSON_INDENT = 2;
const JSON_LINE_ENDING = "\n";

export interface FileSystemOptions {
  baseDir?: string;
}

export class FileSystem {
  private readonly baseDir: string | null;

  constructor(options: FileSystemOptions = {}) {
    this.baseDir = options.baseDir ?? null;
  }

  resolvePath(path: string): string {
    return this.baseDir ? resolve(this.baseDir, path) : path;
  }

  async readText(path: string): Promise<string> {
    return fs.readFile(this.resolvePath(path), { encoding: DEFAULT_ENCODING });
  }

  async writeText(path: string, contents: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, contents, { encoding: DEFAULT_ENCODING });
  }

  async appendText(path: string, contents: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, contents, { encoding: DEFAULT_ENCODING });
  }

  async readJson<T = unknown>(path: string): Promise<T> {
    const text = await this.readText(path);
    try {
      return JSON.parse(text) as T;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SerializationError(
        `Failed to parse JSON at ${path}: ${message}`,
      );
    }
  }

  async writeJson(
    path: string,
    value: unknown,
    indent: number = DEFAULT_JSON_INDENT,
  ): Promise<void> {
    const json = JSON.stringify(value, null, indent);
    if (json === undefined) {
      throw new SerializationError(`Value is not JSON serializable: ${path}`);
    }
    await this.writeText(path, `${json}${JSON_LINE_ENDING}`);
  }

  async ensureDir(path: string): Promise<void> {
    await fs.mkdir(this.resolvePath(path), { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<Stats> {
    return fs.stat(this.resolvePath(path));
  }

  async listDir(path: string): Promise<string[]> {
    return fs.readdir(this.resolvePath(path));
  }

  async remove(path: string): Promise<void> {
    await fs.rm(this.resolvePath(path), { recursive: true, force: true });
  }
}
