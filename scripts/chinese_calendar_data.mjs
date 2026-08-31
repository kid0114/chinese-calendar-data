#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE_URL = "https://ytliu0.github.io/ChineseCalendar/index_c.js";
const DEFAULT_CACHE = path.join(os.homedir(), ".cache", "chinese-calendar-data", "index_c.js");
const LANG = new Map([
  ["en", 0],
  ["english", 0],
  ["0", 0],
  ["trad", 1],
  ["traditional", 1],
  ["traditional-chinese", 1],
  ["1", 1],
  ["simp", 2],
  ["simplified", 2],
  ["simplified-chinese", 2],
  ["2", 2],
]);

function usage(exitCode = 0) {
const text = `Usage:
  chinese_calendar_data.mjs --year <year> [options]
  chinese_calendar_data.mjs --date <YYYY-MM-DD> [options]
  chinese_calendar_data.mjs <year> [options]

Options:
  --lang <simp|trad|en>        Label language, default: simp
  --date <YYYY-MM-DD>          Return the specific civil date's day pillar
  --ancient-li <name>          Ancient calendar for years before 221 BCE
  --region <name>              Regional/dynastic calendar, default: default
  --raw                        Include raw calDataYear() output
  --refresh                    Redownload official index_c.js
  --three-readings             Add 春节派/立春派/公元取模 three year-boundary readings (requires --date)
  --warn-uncertain             Add warning if the year/month is in the engine's known-uncertain list (requires --date)
  --bazi                       Add 八字四柱 (年/月/日柱, 节气定月柱; requires --date)
  --xingxiu                    Add 星宿两套民俗硬表: 农历月日表(27宿) + 值日表(星期+日支, 28宿)
  --time <H:MM>                With --bazi, also add 时柱 (五鼠遁, 民用时近似)
  --source-url <url>           Override source JS URL
  --cache <path>               Override cache path
  -h, --help                   Show this help

Year range: -721..2200. Year 0 means 1 BCE, -1 means 2 BCE.
Dates use the site's civil calendar convention: Gregorian from 1582-10-15,
Julian before that, and proleptic Julian before year 8.`;
  (exitCode ? console.error : console.log)(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    lang: "simp",
    region: "default",
    raw: false,
    refresh: false,
    threeReadings: false,
    warnUncertain: false,
    bazi: false,
    xingxiu: false,
    time: null,
    sourceUrl: DEFAULT_SOURCE_URL,
    cache: DEFAULT_CACHE,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage(0);
    if (!arg.startsWith("-") && opts.year === undefined) {
      opts.year = Number.parseInt(arg, 10);
      continue;
    }
    const readValue = () => {
      if (i + 1 >= argv.length) usage(2);
      return argv[++i];
    };
    switch (arg) {
      case "--year":
      case "-y":
        opts.year = Number.parseInt(readValue(), 10);
        break;
      case "--date":
      case "-d":
        opts.date = parseDate(readValue());
        break;
      case "--lang":
        opts.lang = readValue();
        break;
      case "--ancient-li":
      case "--li":
        opts.ancientLi = readValue();
        break;
      case "--region":
        opts.region = readValue();
        break;
      case "--raw":
        opts.raw = true;
        break;
      case "--refresh":
        opts.refresh = true;
        break;
      case "--three-readings":
        opts.threeReadings = true;
        break;
      case "--warn-uncertain":
        opts.warnUncertain = true;
        break;
      case "--bazi":
        opts.bazi = true;
        break;
      case "--xingxiu":
        opts.xingxiu = true;
        break;
      case "--time":
        opts.time = readValue();
        opts.bazi = true;
        break;
      case "--source-url":
        opts.sourceUrl = readValue();
        break;
      case "--cache":
        opts.cache = readValue();
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage(2);
    }
  }

  if (opts.date) {
    if (opts.year !== undefined && opts.year !== opts.date.year) {
      console.error("--year must match the year in --date when both are provided.");
      usage(2);
    }
    opts.year = opts.date.year;
  }
  if (opts.threeReadings && !opts.date) {
    console.error("--three-readings requires --date.");
    usage(2);
  }
  if (opts.bazi && !opts.date) {
    console.error("--bazi requires --date.");
    usage(2);
  }
  if (opts.xingxiu && !opts.date) {
    console.error("--xingxiu requires --date.");
    usage(2);
  }
  if (!Number.isInteger(opts.year) || opts.year < -721 || opts.year > 2200) {
    console.error("Invalid year. Expected an integer between -721 and 2200.");
    usage(2);
  }
  const langKey = String(opts.lang).toLowerCase();
  if (!LANG.has(langKey)) {
    console.error("Invalid --lang. Expected simp, trad, or en.");
    usage(2);
  }
  opts.langIndex = LANG.get(langKey);
  return opts;
}

function parseDate(value) {
  const match = String(value).match(/^([+-]?\d{1,6})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    console.error("Invalid --date. Expected YYYY-MM-DD, with signed astronomical years allowed.");
    usage(2);
  }
  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadOfficialScript(opts) {
  const hasCache = await pathExists(opts.cache);
  if (!opts.refresh && hasCache) {
    return {
      code: await fsp.readFile(opts.cache, "utf8"),
      cachePath: opts.cache,
      downloaded: false,
    };
  }

  try {
    const code = await fetchText(opts.sourceUrl);
    await fsp.mkdir(path.dirname(opts.cache), { recursive: true });
    await fsp.writeFile(opts.cache, code, "utf8");
    return { code, cachePath: opts.cache, downloaded: true };
  } catch (error) {
    if (hasCache) {
      console.error(`Warning: download failed, using cache: ${error.message}`);
      return {
        code: await fsp.readFile(opts.cache, "utf8"),
        cachePath: opts.cache,
        downloaded: false,
        downloadError: error.message,
      };
    }
    throw error;
  }
}

function loadContext(code) {
  const context = {
    console,
    alert(message) {
      throw new Error(String(message));
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "index_c.js" });
  for (const name of ["langConstant", "calDataYear", "NdaysGregJul"]) {
    if (typeof context[name] !== "function") {
      throw new Error(`Official script did not expose ${name}()`);
    }
  }
  return context;
}

function monthDaysForYear(ctx, year) {
  return ctx.NdaysGregJul(year);
}

function monthBoundaries(ctx, year) {
  const days = monthDaysForYear(ctx, year);
  const leap = days === 366 ? 1 : 0;
  if (year === 1582) {
    return [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 294, 324, 355];
  }
  return [0, 31, 59 + leap, 90 + leap, 120 + leap, 151 + leap, 181 + leap, 212 + leap, 243 + leap, 273 + leap, 304 + leap, 334 + leap, 365 + leap];
}

function ordinalToDate(ctx, year, ordinal) {
  const days = monthDaysForYear(ctx, year);
  if (ordinal < 1) {
    return ordinalToDate(ctx, year - 1, monthDaysForYear(ctx, year - 1) + ordinal);
  }
  if (ordinal > days) {
    return ordinalToDate(ctx, year + 1, ordinal - days);
  }

  const boundaries = monthBoundaries(ctx, year);
  let month = 12;
  for (let i = 1; i < boundaries.length; i++) {
    if (ordinal <= boundaries[i]) {
      month = i;
      break;
    }
  }
  let day = ordinal - boundaries[month - 1];
  if (year === 1582 && month === 10 && day >= 5) {
    day += 10;
  }
  return { year, month, day };
}

function dateToOrdinal(ctx, date) {
  const { year, month, day } = date;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Date parts must be integers.");
  }
  if (year < -721 || year > 2200) {
    throw new Error("Date year is outside the supported range -721..2200.");
  }
  if (month < 1 || month > 12) {
    throw new Error("Date month must be between 1 and 12.");
  }
  if (year === 1582 && month === 10 && day >= 5 && day <= 14) {
    throw new Error("Dates 1582-10-05 through 1582-10-14 do not exist in this site's Julian/Gregorian convention.");
  }

  const boundaries = monthBoundaries(ctx, year);
  const monthLength = boundaries[month] - boundaries[month - 1];
  const civilMonthLength = year === 1582 && month === 10 ? 31 : monthLength;
  if (day < 1 || day > civilMonthLength) {
    throw new Error(`Invalid day ${day} for ${year}-${pad2(month)}.`);
  }

  let normalizedDay = day;
  if (year === 1582 && month === 10 && day >= 15) {
    normalizedDay -= 10;
  }
  return boundaries[month - 1] + normalizedDay;
}

function ordinalFloatToDateTime(ctx, year, value) {
  let ordinal = Math.floor(value);
  let minutes = Math.round((value - ordinal) * 1440);
  if (minutes >= 1440) {
    ordinal += 1;
    minutes -= 1440;
  }
  if (minutes < 0) {
    ordinal -= 1;
    minutes += 1440;
  }
  const date = ordinalToDate(ctx, year, ordinal);
  return {
    ...date,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isoishDate(date) {
  const y = date.year < 0 ? `-${String(Math.abs(date.year)).padStart(4, "0")}` : String(date.year).padStart(4, "0");
  return `${y}-${pad2(date.month)}-${pad2(date.day)}`;
}

function isoishDateTime(dateTime) {
  return `${isoishDate(dateTime)} ${pad2(dateTime.hour)}:${pad2(dateTime.minute)}`;
}

function defaultAncientLi(year) {
  if (year < -479) return "Chunqiu";
  if (year < -220) return "Zhou";
  return null;
}

function phaseName(lang, phase) {
  const names = lang.Qnames || ["Q0", "Q1", "Q2", "Q3"];
  return names[phase] || `Q${phase}`;
}

function sexagenaryDay(ctx, lang, data, date) {
  const ordinal = dateToOrdinal(ctx, date);
  const julianDayNoon = data.jd0 + ordinal + 1;
  const heavenIndex = (julianDayNoon - 1) % 10;
  const earthIndex = (julianDayNoon + 1) % 12;
  const name = lang.lang === 0
    ? `${lang.heaven[heavenIndex]} ${lang.earth[earthIndex]}`
    : `${lang.heaven[heavenIndex]}${lang.earth[earthIndex]}`;
  return {
    civil_date: isoishDate(date),
    day_ordinal: ordinal,
    julian_day_noon: julianDayNoon,
    sexagenary_day: name,
    heavenly_stem: lang.heaven[heavenIndex],
    earthly_branch: lang.earth[earthIndex],
    heavenly_stem_index: heavenIndex,
    earthly_branch_index: earthIndex,
  };
}

function lunarDateForOrdinal(lang, data, ordinal) {
  let index = data.cmonthDate.length - 1;
  for (let i = 0; i < data.cmonthDate.length - 1; i++) {
    if (ordinal >= data.cmonthDate[i] && ordinal < data.cmonthDate[i + 1]) {
      index = i;
      break;
    }
  }

  const monthNumber = data.cmonthNum[index];
  const absMonth = Math.abs(monthNumber);
  const leap = monthNumber < 0;
  const day = ordinal - data.cmonthDate[index] + 1;
  const baseName = lang.cmonth?.[absMonth - 1] ?? String(absMonth);
  const monthName = lang.lang === 0 ? `${leap ? "Leap " : ""}${absMonth}` : `${leap ? "闰" : ""}${baseName}月`;
  const dayName = lang.lang === 0 ? String(day).padStart(2, "0") : lang.date_numChi?.[day - 1] ?? String(day);

  return {
    month_index: index,
    month_number: absMonth,
    month_name: monthName,
    leap,
    day,
    day_name: dayName,
    text: lang.lang === 0 ? `${monthName}-${dayName}` : `${monthName}${dayName}`,
  };
}

function normalize(ctx, year, lang, data, opts, sourceInfo) {
  const months = data.cmonthDate.map((start, index) => {
    const monthNumber = data.cmonthNum[index];
    const leap = monthNumber < 0;
    const absMonth = Math.abs(monthNumber);
    const dayCount = data.cmonthLong[index] === 1 ? 30 : 29;
    const startDate = ordinalToDate(ctx, year, start);
    const endDate = ordinalToDate(ctx, year, start + dayCount - 1);
    const baseName = lang.cmonth?.[absMonth - 1] ?? String(absMonth);
    const monthName = lang.lang === 0 ? `${leap ? "Leap " : ""}${absMonth}` : `${leap ? "闰" : ""}${baseName}月`;
    return {
      index,
      month_number: absMonth,
      month_name: monthName,
      leap,
      jian: data.cmonthJian[index],
      chinese_year_offset: data.cmonthYear[index],
      xia_year_flag: data.cmonthXiaYear[index],
      start_day_ordinal: start,
      start_date: isoishDate(startDate),
      end_date: isoishDate(endDate),
      day_count: dayCount,
      long_month: data.cmonthLong[index] === 1,
    };
  });

  const solarTerms = (data.solar || []).map((value, index) => {
    const dateTime = ordinalFloatToDateTime(ctx, year, value);
    return {
      index,
      name: lang.soltermNames?.[index % 24] ?? `term-${index}`,
      day_ordinal: value,
      datetime: isoishDateTime(dateTime),
      date: isoishDate(dateTime),
      hour: dateTime.hour,
      minute: dateTime.minute,
    };
  });

  const moonPhases = [];
  for (const [key, phase] of [["Q0", 0], ["Q1", 1], ["Q2", 2], ["Q3", 3]]) {
    for (const [index, value] of (data[key] || []).entries()) {
      const dateTime = ordinalFloatToDateTime(ctx, year, value);
      moonPhases.push({
        phase: key,
        phase_index: phase,
        name: phaseName(lang, phase),
        index,
        day_ordinal: value,
        datetime: isoishDateTime(dateTime),
        date: isoishDate(dateTime),
        hour: dateTime.hour,
        minute: dateTime.minute,
      });
    }
  }
  moonPhases.sort((a, b) => a.day_ordinal - b.day_ordinal || a.phase_index - b.phase_index);

  return {
    source: {
      page_url: "https://ytliu0.github.io/ChineseCalendar/index_simp.html",
      script_url: opts.sourceUrl,
      cache_path: sourceInfo.cachePath,
      downloaded: sourceInfo.downloaded,
      download_error: sourceInfo.downloadError,
    },
    query: {
      year,
      language: opts.lang,
      language_index: opts.langIndex,
      region: lang.region,
      ancient_li: lang.li_ancient,
      astronomical_year_numbering: true,
    },
    calendar_system: ctx.get_Western_calendar_name ? ctx.get_Western_calendar_name(year)[opts.langIndex] : undefined,
    year_day_count: monthDaysForYear(ctx, year),
    jd0: data.jd0,
    gregorian_julian_month_boundaries: data.mday,
    months,
    solar_terms: solarTerms,
    moon_phases: moonPhases,
    eclipses: {
      solar: data.sol_eclipse || [],
      lunar: data.lun_eclipse || [],
    },
  };
}

/* ---- 三种生肖/干支年口径 (春节/立春/公元取模) ----
 * 全部从引擎数据推, 不引第三方结论。立春派边界用引擎 solar[IDX_LICHUN].
 * IDX_LICHUN=2 依据: soltermNames=["小寒","大寒","立春",...], solar[0]=小寒.
 */
const GUAN = "甲乙丙丁戊己庚辛壬癸".split("");
const ZHI = "子丑寅卯辰巳午未申酉戌亥".split("");
const ANI = "鼠牛虎兔龙蛇马羊猴鸡狗猪".split("");
const WX = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
const IDX_LICHUN = 2;

function mod(a, n) { const r = a % n; return r < 0 ? r + n : r; }

function ganzhiForYear(y) {
  const n = mod(y - 4, 60);
  return {
    ganzhi: GUAN[mod(n, 10)] + ZHI[mod(n, 12)],
    animal: ANI[mod(n, 12)],
    wuxing: WX[GUAN[mod(n, 10)]],
    // 公元 4 年 = 甲子. 引擎自身用 (y+725)%10/(y+727)%12, 二者等价.
  };
}

function threeReadings(ctx, year, data, date) {
  const ordinal = dateToOrdinal(ctx, date);
  let cmIdx = data.cmonthDate.length - 1;
  for (let i = 0; i < data.cmonthDate.length - 1; i++) {
    if (ordinal >= data.cmonthDate[i] && ordinal < data.cmonthDate[i + 1]) { cmIdx = i; break; }
  }
  const yearOffset = data.cmonthYear[cmIdx];
  const chun = ganzhiForYear(year + yearOffset);

  // 立春派: 立春时刻为界. 引擎时刻为真太阳时, 民用时约再加 16~30 分钟 (均时差).
  const jdNoon = data.jd0 + ordinal + 1;
  const prev = ctx.calDataYear(year - 1, ctx.langConstant(2));
  const lichunPrev = prev.jd0 + prev.solar[IDX_LICHUN];
  const lichunThis = data.jd0 + data.solar[IDX_LICHUN];
  const lcYear = (jdNoon < lichunThis) ? year - 1 : year;
  const li = ganzhiForYear(lcYear);

  const plain = ganzhiForYear(year);

  return {
    chun_jie_pai: { ...chun, boundary: "正月初一" },
    li_chun_pai: { ...li, boundary: "立春" },
    gong_yuan_qu_mo: { ...plain, boundary: "1月1日" },
    disagree_chun_vs_li: chun.ganzhi !== li.ganzhi,
    lichun_datetime_ordinal: data.solar[IDX_LICHUN],
  };
}

// 引擎作者自列的存疑年/月 (朔气时刻接近北京午夜, 日期可能差一天)
const ENGINE_FLAGGED = [[2057, 9], [2089, 8], [2097, 7], [2115, 2], [2116, 4], [2133, 9], [2165, 11], [2172, 9]];

/* ---- 星宿硬表 (民俗查表法, 与天文无关, 用户供图转录) ----
 * 表1 xingxiu_lunar.json : 农历月+日 → 星宿, 27宿循环(无牛), 转录已经过
 *   "每列逐日+1(27循环)" 自检。
 * 表2 xingxiu_daily.json : 星期+日支 → 值日星宿, 28宿全日循环, 转录已经过
 *   "星期+1且地支组+1则星宿+1(28循环)" 自检。
 * 星期换算: weekday = (jd0 + ordinal + 2) % 7, 0=星期天
 *   (与引擎 printMonth 的星期计算一致, 已用 1956-01-01=星期天 验证)
 */
const XINGXIU_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
let _xxCache = null;
function loadXingxiu() {
  if (_xxCache) return _xxCache;
  _xxCache = {
    lunar: JSON.parse(fs.readFileSync(path.join(XINGXIU_DIR, "xingxiu_lunar.json"), "utf8")),
    daily: JSON.parse(fs.readFileSync(path.join(XINGXIU_DIR, "xingxiu_daily.json"), "utf8")),
  };
  return _xxCache;
}

// 日支 index (子=0..亥=11) → 表2 列组
function branchGroup(bi) {
  if (bi === 8 || bi === 0 || bi === 4) return 0;  // 申子辰
  if (bi === 5 || bi === 9 || bi === 1) return 1;  // 巳酉丑
  if (bi === 2 || bi === 6 || bi === 10) return 2; // 寅午戌
  return 3;                                        // 亥卯未
}

function xingxiuFor(ctx, lang, data, date) {
  const xx = loadXingxiu();
  const ordinal = dateToOrdinal(ctx, date);
  const lunar = lunarDateForOrdinal(lang, data, ordinal);
  const day = sexagenaryDay(ctx, lang, data, date);

  // 表1: 农历月+日 (闰月按同月序)
  const m1 = xx.lunar.table_by_month[String(lunar.month_number)];
  const lunarXing = m1 && lunar.day <= 30 ? m1[lunar.day - 1] : null;

  // 表2: 星期+日支
  const weekday = mod(data.jd0 + ordinal + 2, 7);
  const g = branchGroup(day.earthly_branch_index);
  const dailyXing = xx.daily.table[weekday][g];

  return {
    lunar_month_day_xingxiu: {
      xingxiu: lunarXing,
      basis: `农历${lunar.leap ? "闰" : ""}${lunar.month_name}${lunar.day_name}`,
      note: lunar.leap ? "闰月按同月序查" : undefined,
      system: xx.lunar.system,
    },
    daily_zhiri_xingxiu: {
      xingxiu: dailyXing,
      basis: `${xx.daily.weekdays[weekday]}, ${day.earthly_branch}日`,
      system: xx.daily.system,
    },
    warning: "民俗查表法, 两套体系结果不同属正常; 与天文星宿位置无关",
  };
}
const TERMS_FLAGGED = [[2051, 3], [2083, 2], [2084, 3], [2114, 11], [2142, 9], [2155, 10], [2157, 12], [2183, 3], [2186, 2]];

function engineFlagged(year, month) {
  return ENGINE_FLAGGED.some(([a, b]) => a === year && b === month)
    || TERMS_FLAGGED.some(([a, b]) => a === year && b === month);
}

/* ---- 八字四柱: 节气定月柱(五虎遁), 日干定时柱(五鼠遁) ----
 * 月柱边界用"节"(非中气): 立春→寅, 惊蛰→卯, ..., 小寒→丑, 大雪→子。
 * 节气时刻取引擎 solar[] (真太阳时), 与当日正午 JD 比较。
 * 年柱用立春派。时柱需 --time, 按当地民用时近似(未做经度/均时差修正)。
 */
const JIE_BRANCH_SEQ = [ // [solar下标, 月支index]; solar[0]=小寒, [2]=立春, [4]=惊蛰...
  [22, 0],  // 大雪 → 子
  [0, 1],   // 小寒 → 丑
  [2, 2],   // 立春 → 寅
  [4, 3],   // 惊蛰 → 卯
  [6, 4],   // 清明 → 辰
  [8, 5],   // 立夏 → 巳
  [10, 6],  // 芒种 → 午
  [12, 7],  // 小暑 → 未
  [14, 8],  // 立秋 → 申
  [16, 9],  // 白露 → 酉
  [18, 10], // 寒露 → 戌
  [20, 11], // 立冬 → 亥
];

function baziFourPillars(ctx, year, data, date, dayGanIdx, timeStr) {
  const ordinal = dateToOrdinal(ctx, date);
  const jdNoon = data.jd0 + ordinal + 1;
  const prev = ctx.calDataYear(year - 1, ctx.langConstant(2));
  const next = ctx.calDataYear(year + 1, ctx.langConstant(2));

  // 构造节气切换点: {jd, branchIdx, ganYear(立春派年), jieName}
  const names = ctx.langConstant(2).soltermNames;
  const points = [];
  // 上一年大雪 → 子月, 属上一年
  points.push({ jd: prev.jd0 + prev.solar[22], branch: 0, ganYear: year - 1, jie: names[22] });
  // 本年各节
  for (const [idx, br] of JIE_BRANCH_SEQ) {
    // 小寒(idx 0, 1月)仍属上一年; 立春起属本年
    const ganYear = idx === 0 ? year - 1 : year;
    points.push({ jd: data.jd0 + data.solar[idx], branch: br, ganYear, jie: names[idx] });
  }
  // 次年小寒 → 丑, 属本年
  points.push({ jd: next.jd0 + next.solar[0], branch: 1, ganYear: year, jie: names[0] });
  points.sort((a, b) => a.jd - b.jd);

  let cur = points[0];
  for (const p of points) { if (jdNoon >= p.jd) cur = p; else break; }

  // 年柱: 立春派 (本日已过本年立春则取本年)
  const lichunThis = data.jd0 + data.solar[IDX_LICHUN];
  const gzYear = (jdNoon < lichunThis) ? year - 1 : year;
  const yearGanIdx = mod(gzYear - 4, 10);
  const yearPillar = ganzhiForYear(gzYear);

  // 月柱: 五虎遁, 正月(寅)起
  const monthSeq = mod(cur.branch - 2, 12);          // 寅=0, 卯=1, ..., 丑=11
  const monthGanIdx = mod((yearGanIdx % 5) * 2 + 2 + monthSeq, 10);
  const monthPillar = GUAN[monthGanIdx] + ZHI[cur.branch];

  const out = {
    year_pillar: { ganzhi: yearPillar.ganzhi, animal: yearPillar.animal, wuxing: yearPillar.wuxing, boundary: "立春" },
    month_pillar: { ganzhi: monthPillar, branch: ZHI[cur.branch], from_jie: cur.jie, note: "交节时刻起算" },
    day_pillar: { ganzhi: null }, // 由调用方填
  };

  // 时柱: 五鼠遁 (需 --time)
  if (timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    if (Number.isInteger(hh) && hh >= 0 && hh <= 23) {
      const hourBranch = Math.floor(((hh + 1) % 24) / 2); // 子=0 (23-1点)
      const hourGanIdx = mod((dayGanIdx % 5) * 2 + hourBranch, 10);
      out.hour_pillar = { ganzhi: GUAN[hourGanIdx] + ZHI[hourBranch], branch: ZHI[hourBranch], time: timeStr,
        note: "按民用时; 严谨排盘应换算出生地真太阳时" };
    }
  }
  return out;
}

function normalizeDateQuery(ctx, year, lang, data, opts, sourceInfo) {
  const day = sexagenaryDay(ctx, lang, data, opts.date);
  const out = {
    source: {
      page_url: "https://ytliu0.github.io/ChineseCalendar/index_simp.html",
      script_url: opts.sourceUrl,
      cache_path: sourceInfo.cachePath,
      downloaded: sourceInfo.downloaded,
      download_error: sourceInfo.downloadError,
    },
    query: {
      date: day.civil_date,
      year,
      language: opts.lang,
      language_index: opts.langIndex,
      region: lang.region,
      ancient_li: lang.li_ancient,
      astronomical_year_numbering: true,
    },
    calendar_system: ctx.get_Western_calendar_name ? ctx.get_Western_calendar_name(year)[opts.langIndex] : undefined,
    day: {
      ...day,
      lunar_date: lunarDateForOrdinal(lang, data, day.day_ordinal),
    },
  };
  if (opts.threeReadings) {
    out.three_readings = threeReadings(ctx, year, data, opts.date);
  }
  if (opts.warnUncertain && engineFlagged(year, opts.date.month)) {
    out.warn_uncertain = "该年月朔气时刻接近北京午夜, 历法上存有一日之差的风险 (引擎作者自列告警)";
  }
  if (opts.bazi) {
    const bazi = baziFourPillars(ctx, year, data, opts.date, day.heavenly_stem_index, opts.time);
    bazi.day_pillar.ganzhi = day.sexagenary_day;
    out.bazi = bazi;
  }
  if (opts.xingxiu) {
    out.xingxiu = xingxiuFor(ctx, lang, data, opts.date);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sourceInfo = await loadOfficialScript(opts);
  const ctx = loadContext(sourceInfo.code);
  const lang = ctx.langConstant(opts.langIndex);
  lang.region = opts.region;
  lang.li_ancient = opts.ancientLi || defaultAncientLi(opts.year);

  const data = ctx.calDataYear(opts.year, lang);
  const output = opts.date
    ? normalizeDateQuery(ctx, opts.year, lang, data, opts, sourceInfo)
    : normalize(ctx, opts.year, lang, data, opts, sourceInfo);
  if (opts.raw) {
    output.raw = data;
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
