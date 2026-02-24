/**
 * 関数の実行時間を計測する
 * @param fn 計測対象の関数
 * @returns 実行結果と経過時間（ミリ秒）
 */
export declare const runPerformance: <T>(fn: () => T) => {
    result: T;
    time: number;
};
/**
 * 関数を複数回実行し、各回の実行時間を収集する
 * @param fn 計測対象の関数
 * @param times 実行回数（デフォルト: 10,000）
 * @returns 各回の実行時間（ミリ秒）の配列
 */
export declare const measurePerformance: <T>(fn: () => T, times?: number) => {
    times: number[];
};
