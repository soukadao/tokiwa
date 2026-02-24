import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function compareToFile(
  filePath1: string,
  filePath2: string,
): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([
      readFile(filePath1),
      readFile(filePath2),
    ]);
    return timingSafeEqual(left, right);
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}
