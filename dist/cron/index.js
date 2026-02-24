// src/core/errors.ts
var AppError = class extends Error {
  /**
   * @param message エラーメッセージ
   * @param options エラーオプション（causeなど）
   */
  constructor(message, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
  }
};
var InvalidArgumentError = class extends AppError {
};
var RuntimeError = class extends AppError {
};

// src/core/logger.ts
var LOG_LEVEL = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7
};
var DEFAULT_LOG_LEVEL = "info";
var UNSERIALIZABLE_PLACEHOLDER = "[Unserializable]";
var LEVEL_METHOD_MAP = {
  emergency: "error",
  alert: "error",
  critical: "error",
  error: "error",
  warning: "warn",
  notice: "info",
  info: "info",
  debug: "debug"
};
var safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return UNSERIALIZABLE_PLACEHOLDER;
  }
};
var createDefaultSink = () => {
  return (entry) => {
    const method = LEVEL_METHOD_MAP[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const contextText = entry.context ? ` ${safeStringify(entry.context)}` : "";
    console[method](
      `[${timestamp}] ${entry.level}: ${entry.message}${contextText}`
    );
  };
};
var Logger = class {
  level = DEFAULT_LOG_LEVEL;
  levelValue = LOG_LEVEL[DEFAULT_LOG_LEVEL];
  sink = createDefaultSink();
  /**
   * @param options ログレベルやシンクの設定
   */
  constructor(options = {}) {
    if (options.level) {
      this.setLevel(options.level);
    }
    if (options.sink) {
      this.setSink(options.sink);
    }
  }
  /**
   * ログレベルを変更する
   * @param level 新しいログレベル
   */
  setLevel(level) {
    this.level = level;
    this.levelValue = LOG_LEVEL[level];
  }
  /**
   * 現在のログレベルを返す
   * @returns 現在のログレベル
   */
  getLevel() {
    return this.level;
  }
  /**
   * ログ出力先（シンク）を変更する
   * @param sink 新しいログシンク
   */
  setSink(sink) {
    this.sink = sink;
  }
  /**
   * 指定レベルでログを記録する。現在のレベル以下の場合のみ出力される
   * @param level ログレベル
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  log(level, message, context) {
    if (LOG_LEVEL[level] > this.levelValue) {
      return;
    }
    this.sink({ level, message, timestamp: /* @__PURE__ */ new Date(), context });
  }
  /**
   * emergencyレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  emergency(message, context) {
    this.log("emergency", message, context);
  }
  /**
   * alertレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  alert(message, context) {
    this.log("alert", message, context);
  }
  /**
   * criticalレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  critical(message, context) {
    this.log("critical", message, context);
  }
  /**
   * errorレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  error(message, context) {
    this.log("error", message, context);
  }
  /**
   * warningレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  warning(message, context) {
    this.log("warning", message, context);
  }
  /**
   * noticeレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  notice(message, context) {
    this.log("notice", message, context);
  }
  /**
   * infoレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  info(message, context) {
    this.log("info", message, context);
  }
  /**
   * debugレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  debug(message, context) {
    this.log("debug", message, context);
  }
};

// src/cron/cron.ts
var CRON_FIELD_SPECS = [
  { key: "minute", min: 0, max: 59 },
  { key: "hour", min: 0, max: 23 },
  { key: "dayOfMonth", min: 1, max: 31 },
  { key: "month", min: 1, max: 12 },
  { key: "dayOfWeek", min: 0, max: 6 }
];
var CRON_FIELD_COUNT = CRON_FIELD_SPECS.length;
var BASE_10 = 10;
var MIN_STEP_VALUE = 1;
var DEFAULT_RANGE_STEP = 1;
var NEXT_MINUTE_INCREMENT = 1;
var NEXT_HOUR_INCREMENT = 1;
var NEXT_DAY_INCREMENT = 1;
var NEXT_YEAR_INCREMENT = 1;
var MONTH_OFFSET = 1;
var RESET_HOURS = 0;
var RESET_MINUTES = 0;
var RESET_SECONDS = 0;
var RESET_MILLISECONDS = 0;
var LOOKAHEAD_YEARS = 4;
var DAYS_PER_YEAR = 365;
var HOURS_PER_DAY = 24;
var MINUTES_PER_HOUR = 60;
var CRON_MAX_ITERATIONS = LOOKAHEAD_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR;
var Cron = class _Cron {
  static MAX_ITERATIONS = CRON_MAX_ITERATIONS;
  fields;
  /**
   * @param expression minute hour dayOfMonth month dayOfWeek
   */
  constructor(expression) {
    this.fields = this.parse(expression);
  }
  /**
   * 5フィールドのcron式をパースし、CronFieldsオブジェクトに変換する。
   * @param expression スペース区切りのcron式文字列
   * @returns パース済みのCronFieldsオブジェクト
   */
  parse(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== CRON_FIELD_COUNT) {
      throw new InvalidArgumentError(
        "Cron expression must have exactly 5 fields"
      );
    }
    const fields = {
      minute: [],
      hour: [],
      dayOfMonth: [],
      month: [],
      dayOfWeek: []
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
  parseField(field, min, max) {
    if (field === "*") {
      return this.buildRange(min, max);
    }
    const values = /* @__PURE__ */ new Set();
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
  parseFieldPart(part, min, max, values) {
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
        `Value out of bounds: ${value} (must be between ${min} and ${max})`
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
  parseStepValue(step) {
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
  parseStepRange(range, min, max) {
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
      end: max
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
  parseBoundedValue(value, min, max, label) {
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
  addRange(values, start, end, step, min, max) {
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
  buildRange(min, max) {
    const values = [];
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
  sortedValues(values) {
    return Array.from(values).sort((a, b) => a - b);
  }
  /**
   * Returns true when the date matches the cron fields.
   */
  matches(date) {
    return this.fields.minute.includes(date.getMinutes()) && this.fields.hour.includes(date.getHours()) && this.fields.dayOfMonth.includes(date.getDate()) && this.fields.month.includes(date.getMonth() + MONTH_OFFSET) && this.fields.dayOfWeek.includes(date.getDay());
  }
  /**
   * Returns the next execution time after the given date.
   * Seconds and milliseconds are cleared before searching.
   */
  getNextExecution(after = /* @__PURE__ */ new Date()) {
    const next = new Date(after);
    next.setSeconds(RESET_SECONDS, RESET_MILLISECONDS);
    next.setMinutes(next.getMinutes() + NEXT_MINUTE_INCREMENT);
    let iterations = 0;
    while (iterations < _Cron.MAX_ITERATIONS) {
      const month = next.getMonth() + MONTH_OFFSET;
      if (!this.fields.month.includes(month)) {
        const { value, carry } = this.nextAllowedValue(
          this.fields.month,
          month
        );
        if (carry) {
          next.setFullYear(next.getFullYear() + NEXT_YEAR_INCREMENT);
        }
        next.setMonth(value - MONTH_OFFSET, 1);
        next.setHours(
          RESET_HOURS,
          RESET_MINUTES,
          RESET_SECONDS,
          RESET_MILLISECONDS
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
          RESET_MILLISECONDS
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
          minute
        );
        if (carry) {
          next.setHours(
            next.getHours() + NEXT_HOUR_INCREMENT,
            value,
            RESET_SECONDS,
            RESET_MILLISECONDS
          );
        } else {
          next.setMinutes(value, RESET_SECONDS, RESET_MILLISECONDS);
        }
        iterations++;
        continue;
      }
      return next;
    }
    if (iterations >= _Cron.MAX_ITERATIONS) {
      throw new RuntimeError(
        `Could not find next execution time within ${LOOKAHEAD_YEARS} years`
      );
    }
    return next;
  }
  /**
   * Returns a shallow copy of the parsed fields.
   */
  getFields() {
    return { ...this.fields };
  }
  /**
   * 指定された日付がdayOfMonthとdayOfWeekの両方に一致するか判定する。
   * @param date 判定対象の日付
   * @returns 両フィールドに一致する場合true
   */
  matchesDay(date) {
    return this.fields.dayOfMonth.includes(date.getDate()) && this.fields.dayOfWeek.includes(date.getDay());
  }
  /**
   * ソート済みリストから現在値以上の次の許容値を探す。
   * 現在値以上の値が見つからない場合、リストの先頭に戻りキャリーフラグをtrueにする。
   * @param values ソート済みの許容値リスト
   * @param current 現在の値
   * @returns 次の許容値とキャリーフラグを含むオブジェクト
   */
  nextAllowedValue(values, current) {
    for (const value of values) {
      if (value >= current) {
        return { value, carry: false };
      }
    }
    return { value: values[0], carry: true };
  }
};

// src/cron/leader-scheduler.ts
var DEFAULT_LOCK_KEY = "tokiwa:locks:cron";
var DEFAULT_LOCK_TTL_MS = 6e4;
var DEFAULT_REFRESH_INTERVAL_MS = 2e4;
var DEFAULT_RETRY_INTERVAL_MS = 5e3;
var LeaderScheduler = class {
  scheduler;
  lock;
  lockKey;
  lockTtlMs;
  refreshIntervalMs;
  retryIntervalMs;
  running = false;
  leaderHandle = null;
  refreshTimer = null;
  retryTimer = null;
  schedulerStarted = false;
  /**
   * スケジューラー、ロック、タイミングオプションで初期化する。
   * @param options スケジューラー、ロック、およびタイミング設定を含むオプション
   */
  constructor(options) {
    this.scheduler = options.scheduler;
    this.lock = options.lock;
    this.lockKey = options.lockKey ?? DEFAULT_LOCK_KEY;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  }
  /**
   * リーダー選出を開始する。ロックの取得を試み、成功すればスケジューラーを起動する。
   */
  async start() {
    if (this.running) {
      return;
    }
    this.running = true;
    await this.tryAcquire();
  }
  /**
   * スケジューラーを停止し、リーダーシップを解放する。
   */
  async stop() {
    this.running = false;
    this.clearRetry();
    await this.stopLeader();
  }
  /**
   * 内部スケジューラーにジョブを追加する。
   * @param id ジョブの一意識別子
   * @param cronExpression cron式文字列
   * @param handler ジョブ実行時に呼び出されるハンドラー
   * @param name ジョブの表示名（省略可）
   */
  addJob(id, cronExpression, handler, name) {
    this.scheduler.addJob(id, cronExpression, handler, name);
  }
  /**
   * 内部スケジューラーからジョブを削除する。
   * @param id 削除対象のジョブID
   * @returns ジョブが存在し削除された場合true
   */
  removeJob(id) {
    return this.scheduler.removeJob(id);
  }
  /**
   * 指定されたIDのジョブが登録されているか確認する。
   * @param id 確認対象のジョブID
   * @returns ジョブが登録されている場合true
   */
  isJobScheduled(id) {
    return this.scheduler.isJobScheduled(id);
  }
  /**
   * リーダーシップロックの取得を試みる。取得成功時はリーダーとして起動し、失敗時はリトライをスケジュールする。
   */
  async tryAcquire() {
    if (!this.running) {
      return;
    }
    const handle = await this.lock.acquire(this.lockKey, {
      ttlMs: this.lockTtlMs
    });
    if (!handle) {
      this.scheduleRetry();
      return;
    }
    this.leaderHandle = handle;
    this.startLeader();
  }
  /**
   * 内部スケジューラーを起動し、ロックのリフレッシュタイマーを開始する。
   */
  startLeader() {
    if (this.schedulerStarted) {
      return;
    }
    this.scheduler.start();
    this.schedulerStarted = true;
    if (this.refreshIntervalMs > 0 && this.lock.refresh) {
      this.refreshTimer = setInterval(() => {
        void this.refresh();
      }, this.refreshIntervalMs);
    }
  }
  /**
   * ロックのTTLをリフレッシュする。リフレッシュに失敗した場合は降格処理を行う。
   */
  async refresh() {
    if (!this.leaderHandle || !this.lock.refresh) {
      return;
    }
    const ok = await this.lock.refresh(this.leaderHandle, this.lockTtlMs);
    if (!ok) {
      await this.demote();
    }
  }
  /**
   * リーダーシップを放棄する。スケジューラーを停止し、ロックを解放した後、リーダーシップの再取得を試みる。
   */
  async demote() {
    if (!this.leaderHandle) {
      return;
    }
    const handle = this.leaderHandle;
    this.leaderHandle = null;
    this.stopRefresh();
    if (this.schedulerStarted) {
      await this.scheduler.stop();
      this.schedulerStarted = false;
    }
    await this.lock.release(handle);
    if (this.running) {
      this.scheduleRetry();
    }
  }
  /**
   * ロック取得のリトライをretryIntervalMs後にスケジュールする。
   */
  scheduleRetry() {
    if (!this.running) {
      return;
    }
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      void this.tryAcquire();
    }, this.retryIntervalMs);
  }
  /**
   * リトライタイマーをクリアする。
   */
  clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  /**
   * リフレッシュタイマーをクリアする。
   */
  stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  /**
   * スケジューラーを停止し、ロックを解放してリーダーシップを終了する。
   */
  async stopLeader() {
    this.stopRefresh();
    if (this.schedulerStarted) {
      await this.scheduler.stop();
      this.schedulerStarted = false;
    }
    if (this.leaderHandle) {
      await this.lock.release(this.leaderHandle);
      this.leaderHandle = null;
    }
  }
};

// src/cron/scheduler.ts
var MILLISECONDS_PER_SECOND = 1e3;
var SECONDS_PER_MINUTE = 60;
var MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
var DEFAULT_CHECK_INTERVAL_MS = MILLISECONDS_PER_MINUTE;
var MIN_CHECK_INTERVAL_MS = 1;
var RESET_SECONDS2 = 0;
var RESET_MILLISECONDS2 = 0;
var NEXT_MINUTE_INCREMENT2 = 1;
var Scheduler = class _Scheduler {
  jobs = /* @__PURE__ */ new Map();
  timerId = null;
  isRunning = false;
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS;
  logger;
  inFlight = /* @__PURE__ */ new Set();
  lastRunKeyByJob = /* @__PURE__ */ new Map();
  /**
   * @param options Default is minute boundary scheduling.
   */
  constructor(options = {}) {
    if (typeof options === "number") {
      this.checkIntervalMs = options;
      this.logger = new Logger({ level: "error" });
    } else {
      this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
      this.logger = options.logger ?? new Logger({ level: "error" });
    }
    this.checkIntervalMs = Math.max(
      MIN_CHECK_INTERVAL_MS,
      this.checkIntervalMs
    );
  }
  /**
   * Adds or replaces a job by id.
   */
  addJob(id, cronExpression, handler, name) {
    const cron = new Cron(cronExpression);
    const job = { id, cron, handler, name };
    this.jobs.set(id, job);
    this.lastRunKeyByJob.delete(id);
  }
  /**
   * Removes a job by id.
   */
  removeJob(id) {
    this.lastRunKeyByJob.delete(id);
    return this.jobs.delete(id);
  }
  /**
   * Returns a job by id, if present.
   */
  getJob(id) {
    return this.jobs.get(id);
  }
  /**
   * Returns all registered jobs.
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }
  /**
   * Starts scheduling if not already running.
   */
  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.scheduleNextCheck();
  }
  /**
   * Stops scheduling and clears the pending timer.
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    this.clearTimer();
    await this.waitForInFlight();
  }
  /**
   * 次のタイマーティックをスケジュールする。
   * デフォルト間隔の場合は次の分境界まで、それ以外はcheckIntervalMsで待機する。
   */
  scheduleNextCheck() {
    if (!this.isRunning) {
      return;
    }
    const delay = this.checkIntervalMs === DEFAULT_CHECK_INTERVAL_MS ? _Scheduler.getDelayUntilNextMinute(/* @__PURE__ */ new Date()) : this.checkIntervalMs;
    this.timerId = setTimeout(this.handleTick, delay);
  }
  /**
   * タイマーコールバック。ジョブの実行チェックを行い、次のティックを再スケジュールする。
   */
  handleTick = () => {
    void this.checkAndExecuteJobs();
    this.scheduleNextCheck();
  };
  /**
   * 全ジョブを現在時刻と照合し、一致するジョブを実行する。
   * 同一分内での重複実行を防止するためミニットキーで管理する。
   */
  async checkAndExecuteJobs() {
    const now = /* @__PURE__ */ new Date();
    const minuteKey = _Scheduler.buildMinuteKey(now);
    const tasks = [];
    for (const job of this.jobs.values()) {
      if (!job.cron.matches(now)) {
        continue;
      }
      if (this.lastRunKeyByJob.get(job.id) === minuteKey) {
        continue;
      }
      this.lastRunKeyByJob.set(job.id, minuteKey);
      tasks.push(this.runJob(job));
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }
  /**
   * 保留中のsetTimeoutタイマーをクリアする。
   */
  clearTimer() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
  /**
   * ジョブのハンドラーを実行し、エラー発生時はログに記録する。
   * 実行中のジョブはinFlightセットで追跡される。
   * @param job 実行対象のジョブ
   * @returns ジョブ完了を表すPromise
   */
  runJob(job) {
    const task = (async () => {
      try {
        await job.handler();
      } catch (error) {
        this.logger.error(`Error executing job ${job.id}`, {
          jobId: job.id,
          name: job.name,
          error
        });
      }
    })();
    this.inFlight.add(task);
    task.finally(() => {
      this.inFlight.delete(task);
    });
    return task;
  }
  /**
   * 実行中の全ジョブが完了するまで待機する。
   */
  async waitForInFlight() {
    if (this.inFlight.size === 0) {
      return;
    }
    await Promise.allSettled(this.inFlight);
  }
  /**
   * 現在時刻から次の分境界までのミリ秒数を計算する。
   * @param now 現在時刻
   * @returns 次の分境界までのミリ秒数
   */
  static getDelayUntilNextMinute(now) {
    const nextMinute = new Date(now);
    nextMinute.setSeconds(RESET_SECONDS2, RESET_MILLISECONDS2);
    nextMinute.setMinutes(nextMinute.getMinutes() + NEXT_MINUTE_INCREMENT2);
    return nextMinute.getTime() - now.getTime();
  }
  /**
   * 指定された日時から分単位の一意キーを生成する。重複実行防止に使用される。
   * @param date キー生成対象の日時
   * @returns "年-月-日-時-分" 形式の文字列キー
   */
  static buildMinuteKey(date) {
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ].join("-");
  }
  /**
   * Returns the next execution time for a job, or null if missing.
   */
  getNextExecutionTime(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    return job.cron.getNextExecution();
  }
  /**
   * Returns true when a job id is registered.
   */
  isJobScheduled(jobId) {
    return this.jobs.has(jobId);
  }
};
export {
  Cron,
  LeaderScheduler,
  Scheduler
};
//# sourceMappingURL=index.js.map
