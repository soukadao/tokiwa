import { performance } from "node:perf_hooks";

const DEFAULT_MEASUREMENT_TIMES = 10_000;

export class Performance {
  static measurement<T>(
    fn: () => T,
    times: number = DEFAULT_MEASUREMENT_TIMES,
  ): { times: number[] } {
    const resultTimes: number[] = [];

    for (let i = 0; i < times; i++) {
      const { time } = Performance.run(fn);
      resultTimes.push(time);
    }

    return { times: resultTimes };
  }

  static run<T>(fn: () => T): { result: T; time: number } {
    const t0 = performance.now();
    const result = fn();
    const t1 = performance.now();
    const time = t1 - t0;

    return { result, time };
  }
}
