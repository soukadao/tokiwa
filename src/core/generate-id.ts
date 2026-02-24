import { randomUUID } from "node:crypto";

/**
 * UUIDv4形式の一意なIDを生成する
 * @returns 生成されたUUID文字列
 */
export function generateId(): string {
  return randomUUID();
}
