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

// node_modules/.pnpm/@date-fns+tz@1.4.1/node_modules/@date-fns/tz/tzName/index.js
function tzName(timeZone, date, format = "long") {
  return new Intl.DateTimeFormat("en-US", {
    // Enforces engine to render the time. Without the option JavaScriptCore omits it.
    hour: "numeric",
    timeZone,
    timeZoneName: format
  }).format(date).split(/\s/g).slice(2).join(" ");
}

// node_modules/.pnpm/@date-fns+tz@1.4.1/node_modules/@date-fns/tz/tzOffset/index.js
var offsetFormatCache = {};
var offsetCache = {};
function tzOffset(timeZone, date) {
  try {
    const format = offsetFormatCache[timeZone] ||= new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset"
    }).format;
    const offsetStr = format(date).split("GMT")[1];
    if (offsetStr in offsetCache) return offsetCache[offsetStr];
    return calcOffset(offsetStr, offsetStr.split(":"));
  } catch {
    if (timeZone in offsetCache) return offsetCache[timeZone];
    const captures = timeZone?.match(offsetRe);
    if (captures) return calcOffset(timeZone, captures.slice(1));
    return NaN;
  }
}
var offsetRe = /([+-]\d\d):?(\d\d)?/;
function calcOffset(cacheStr, values) {
  const hours = +(values[0] || 0);
  const minutes = +(values[1] || 0);
  const seconds = +(values[2] || 0) / 60;
  return offsetCache[cacheStr] = hours * 60 + minutes > 0 ? hours * 60 + minutes + seconds : hours * 60 - minutes - seconds;
}

// node_modules/.pnpm/@date-fns+tz@1.4.1/node_modules/@date-fns/tz/date/mini.js
var TZDateMini = class _TZDateMini extends Date {
  //#region static
  constructor(...args) {
    super();
    if (args.length > 1 && typeof args[args.length - 1] === "string") {
      this.timeZone = args.pop();
    }
    this.internal = /* @__PURE__ */ new Date();
    if (isNaN(tzOffset(this.timeZone, this))) {
      this.setTime(NaN);
    } else {
      if (!args.length) {
        this.setTime(Date.now());
      } else if (typeof args[0] === "number" && (args.length === 1 || args.length === 2 && typeof args[1] !== "number")) {
        this.setTime(args[0]);
      } else if (typeof args[0] === "string") {
        this.setTime(+new Date(args[0]));
      } else if (args[0] instanceof Date) {
        this.setTime(+args[0]);
      } else {
        this.setTime(+new Date(...args));
        adjustToSystemTZ(this, NaN);
        syncToInternal(this);
      }
    }
  }
  static tz(tz, ...args) {
    return args.length ? new _TZDateMini(...args, tz) : new _TZDateMini(Date.now(), tz);
  }
  //#endregion
  //#region time zone
  withTimeZone(timeZone) {
    return new _TZDateMini(+this, timeZone);
  }
  getTimezoneOffset() {
    const offset = -tzOffset(this.timeZone, this);
    return offset > 0 ? Math.floor(offset) : Math.ceil(offset);
  }
  //#endregion
  //#region time
  setTime(time) {
    Date.prototype.setTime.apply(this, arguments);
    syncToInternal(this);
    return +this;
  }
  //#endregion
  //#region date-fns integration
  [/* @__PURE__ */ Symbol.for("constructDateFrom")](date) {
    return new _TZDateMini(+new Date(date), this.timeZone);
  }
  //#endregion
};
var re = /^(get|set)(?!UTC)/;
Object.getOwnPropertyNames(Date.prototype).forEach((method) => {
  if (!re.test(method)) return;
  const utcMethod = method.replace(re, "$1UTC");
  if (!TZDateMini.prototype[utcMethod]) return;
  if (method.startsWith("get")) {
    TZDateMini.prototype[method] = function() {
      return this.internal[utcMethod]();
    };
  } else {
    TZDateMini.prototype[method] = function() {
      Date.prototype[utcMethod].apply(this.internal, arguments);
      syncFromInternal(this);
      return +this;
    };
    TZDateMini.prototype[utcMethod] = function() {
      Date.prototype[utcMethod].apply(this, arguments);
      syncToInternal(this);
      return +this;
    };
  }
});
function syncToInternal(date) {
  date.internal.setTime(+date);
  date.internal.setUTCSeconds(date.internal.getUTCSeconds() - Math.round(-tzOffset(date.timeZone, date) * 60));
}
function syncFromInternal(date) {
  Date.prototype.setFullYear.call(date, date.internal.getUTCFullYear(), date.internal.getUTCMonth(), date.internal.getUTCDate());
  Date.prototype.setHours.call(date, date.internal.getUTCHours(), date.internal.getUTCMinutes(), date.internal.getUTCSeconds(), date.internal.getUTCMilliseconds());
  adjustToSystemTZ(date);
}
function adjustToSystemTZ(date) {
  const baseOffset = tzOffset(date.timeZone, date);
  const offset = baseOffset > 0 ? Math.floor(baseOffset) : Math.ceil(baseOffset);
  const prevHour = /* @__PURE__ */ new Date(+date);
  prevHour.setUTCHours(prevHour.getUTCHours() - 1);
  const systemOffset = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset();
  const prevHourSystemOffset = -(/* @__PURE__ */ new Date(+prevHour)).getTimezoneOffset();
  const systemDSTChange = systemOffset - prevHourSystemOffset;
  const dstShift = Date.prototype.getHours.apply(date) !== date.internal.getUTCHours();
  if (systemDSTChange && dstShift) date.internal.setUTCMinutes(date.internal.getUTCMinutes() + systemDSTChange);
  const offsetDiff = systemOffset - offset;
  if (offsetDiff) Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetDiff);
  const systemDate = /* @__PURE__ */ new Date(+date);
  systemDate.setUTCSeconds(0);
  const systemSecondsOffset = systemOffset > 0 ? systemDate.getSeconds() : (systemDate.getSeconds() - 60) % 60;
  const secondsOffset = Math.round(-(tzOffset(date.timeZone, date) * 60)) % 60;
  if (secondsOffset || systemSecondsOffset) {
    date.internal.setUTCSeconds(date.internal.getUTCSeconds() + secondsOffset);
    Date.prototype.setUTCSeconds.call(date, Date.prototype.getUTCSeconds.call(date) + secondsOffset + systemSecondsOffset);
  }
  const postBaseOffset = tzOffset(date.timeZone, date);
  const postOffset = postBaseOffset > 0 ? Math.floor(postBaseOffset) : Math.ceil(postBaseOffset);
  const postSystemOffset = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset();
  const postOffsetDiff = postSystemOffset - postOffset;
  const offsetChanged = postOffset !== offset;
  const postDiff = postOffsetDiff - offsetDiff;
  if (offsetChanged && postDiff) {
    Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + postDiff);
    const newBaseOffset = tzOffset(date.timeZone, date);
    const newOffset = newBaseOffset > 0 ? Math.floor(newBaseOffset) : Math.ceil(newBaseOffset);
    const offsetChange = postOffset - newOffset;
    if (offsetChange) {
      date.internal.setUTCMinutes(date.internal.getUTCMinutes() + offsetChange);
      Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetChange);
    }
  }
}

// node_modules/.pnpm/@date-fns+tz@1.4.1/node_modules/@date-fns/tz/date/index.js
var TZDate = class _TZDate extends TZDateMini {
  //#region static
  static tz(tz, ...args) {
    return args.length ? new _TZDate(...args, tz) : new _TZDate(Date.now(), tz);
  }
  //#endregion
  //#region representation
  toISOString() {
    const [sign, hours, minutes] = this.tzComponents();
    const tz = `${sign}${hours}:${minutes}`;
    return this.internal.toISOString().slice(0, -1) + tz;
  }
  toString() {
    return `${this.toDateString()} ${this.toTimeString()}`;
  }
  toDateString() {
    const [day, date, month, year] = this.internal.toUTCString().split(" ");
    return `${day?.slice(0, -1)} ${month} ${date} ${year}`;
  }
  toTimeString() {
    const time = this.internal.toUTCString().split(" ")[4];
    const [sign, hours, minutes] = this.tzComponents();
    return `${time} GMT${sign}${hours}${minutes} (${tzName(this.timeZone, this)})`;
  }
  toLocaleString(locales, options) {
    return Date.prototype.toLocaleString.call(this, locales, {
      ...options,
      timeZone: options?.timeZone || this.timeZone
    });
  }
  toLocaleDateString(locales, options) {
    return Date.prototype.toLocaleDateString.call(this, locales, {
      ...options,
      timeZone: options?.timeZone || this.timeZone
    });
  }
  toLocaleTimeString(locales, options) {
    return Date.prototype.toLocaleTimeString.call(this, locales, {
      ...options,
      timeZone: options?.timeZone || this.timeZone
    });
  }
  //#endregion
  //#region private
  tzComponents() {
    const offset = this.getTimezoneOffset();
    const sign = offset > 0 ? "-" : "+";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
    return [sign, hours, minutes];
  }
  //#endregion
  withTimeZone(timeZone) {
    return new _TZDate(+this, timeZone);
  }
  //#region date-fns integration
  [/* @__PURE__ */ Symbol.for("constructDateFrom")](date) {
    return new _TZDate(+new Date(date), this.timeZone);
  }
  //#endregion
};

// src/utils/exec-async.ts
import {
  exec,
  execFile
} from "node:child_process";
import { promisify } from "node:util";
var DEFAULT_ENCODING = "utf8";
var SHELL_EXEC_DISABLED_MESSAGE = "Shell execution is disabled. Pass { allowShell: true } to execAsync.";
var execAsyncRaw = promisify(exec);
var execFileAsyncRaw = promisify(execFile);
var normalizeOutput = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (value) {
    return value.toString(DEFAULT_ENCODING);
  }
  return "";
};
var execAsync = async (command, options = {}) => {
  if (!options.allowShell) {
    throw new InvalidArgumentError(SHELL_EXEC_DISABLED_MESSAGE);
  }
  const { allowShell: _allowShell, ...execOptions } = options;
  const { stdout, stderr } = await execAsyncRaw(command, {
    encoding: DEFAULT_ENCODING,
    ...execOptions
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};
var execFileAsync = async (file, args = [], options = {}) => {
  const { stdout, stderr } = await execFileAsyncRaw(file, args, {
    encoding: DEFAULT_ENCODING,
    ...options
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};

// src/utils/command.ts
var formatCommand = (command, args) => [command, ...args].join(" ");
var isExecError = (error) => error instanceof Error && ("stderr" in error || "code" in error);
var execCommand = async (command, args = []) => {
  const commandText = formatCommand(command, args);
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout;
  } catch (error) {
    if (isExecError(error)) {
      const stderr = typeof error.stderr === "string" ? error.stderr : error.stderr?.toString() ?? "";
      throw new RuntimeError(
        `Command failed: ${commandText}
Exit code: ${error.code}
${stderr}`
      );
    }
    throw new RuntimeError(`Command failed: ${commandText}
${error}`);
  }
};

// src/utils/performance.ts
import { performance } from "node:perf_hooks";
var DEFAULT_MEASUREMENT_TIMES = 1e4;
var runPerformance = (fn) => {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  const time = t1 - t0;
  return { result, time };
};
var measurePerformance = (fn, times = DEFAULT_MEASUREMENT_TIMES) => {
  const resultTimes = [];
  for (let i = 0; i < times; i++) {
    const { time } = runPerformance(fn);
    resultTimes.push(time);
  }
  return { times: resultTimes };
};
export {
  execAsync,
  execCommand,
  execFileAsync,
  measurePerformance,
  runPerformance
};
//# sourceMappingURL=index.js.map
