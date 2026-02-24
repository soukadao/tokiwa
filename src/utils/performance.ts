import { performance } from "node:perf_hooks";

const DEFAULT_MEASUREMENT_TIMES = 10_000;

/**
 * 関数の実行時間を計測する
 * @param fn 計測対象の関数
 * @returns 実行結果と経過時間（ミリ秒）
 */
export const runPerformance = <T>(fn: () => T): { result: T; time: number } => {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  const time = t1 - t0;

  return { result, time };
};

/**
 * 関数を複数回実行し、各回の実行時間を収集する
 * @param fn 計測対象の関数
 * @param times 実行回数（デフォルト: 10,000）
 * @returns 各回の実行時間（ミリ秒）の配列
 */
export const measurePerformance = <T>(
  fn: () => T,
  times: number = DEFAULT_MEASUREMENT_TIMES,
): { times: number[] } => {
  const resultTimes: number[] = [];

  for (let i = 0; i < times; i++) {
    const { time } = runPerformance(fn);
    resultTimes.push(time);
  }

  return { times: resultTimes };
};
