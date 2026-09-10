---
name: chinese-calendar-data
description: Call Yuk Tung Liu's ChineseCalendar GitHub Pages data/calculation code and return structured JSON for Chinese calendar years, lunar months, moon phases, and solar terms.
---

# Chinese Calendar Data

Use this skill when the user wants to call or reuse data from `https://ytliu0.github.io/ChineseCalendar/index_simp.html`, or asks for programmatic Chinese calendar data from that site.

The site is a static GitHub Pages application. It does not expose a JSON HTTP API. The yearly calendar is computed by the official `index_c.js` script, whose data tables and algorithms are embedded in that file.

## Use The Helper

Prefer the helper script instead of scraping rendered HTML. The script lives at `scripts/chinese_calendar_data.mjs` **relative to this skill's directory** (where this SKILL.md is). Resolve it against wherever the skill is installed, e.g. `~/.pi/agent/skills/chinese-calendar-data/` for Pi, `~/.codex/skills/chinese-calendar-data/` for Codex, or a git checkout such as `~/repos/chinese-calendar-data/`:

```bash
SKILL_DIR=<path to this skill directory>
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --year 2024
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --date 2024-02-10
```

Useful options:

- `--year <int>`: required unless the year is passed as the first positional argument. Valid range is `-721..2200`. The site uses astronomical year numbering: `0` means 1 BCE, `-1` means 2 BCE.
- `--date <YYYY-MM-DD>`: return one civil date's日柱/sexagenary day and matching lunar date. Signed astronomical years are accepted, for example `--date -0721-01-01`.
- `--lang simp|trad|en`: output labels, default `simp`.
- `--ancient-li <name>`: ancient calendar system for years before 221 BCE. Common values are `Chunqiu`, `Zhou`, `Lu`, `Huangdi`, `Yin`, `Xia1`, `Xia2`, `Zhuanxu`.
- `--region <name>`: alternate regional/dynastic calendar for split-calendar periods. Supported values include `default`, `Shu`, `Wu`, `LaterQin`, `NorthernLiang`, `WeiZhouSui`, `WeiQi`, `LiaoJinYuan`, and `SouthernMing`.
- `--raw`: include the direct return value of the site's `calDataYear()` function.
- `--refresh`: redownload the official `index_c.js` before running.
- `--three-readings`: add 春节派/立春派/公元取模 three year-boundary readings (requires `--date`). Shows `disagree_chun_vs_li` when 春节派 and 立春派 give different 生肖.
- `--warn-uncertain`: add warning if the year/month is in the engine's known-uncertain list (requires `--date`). The engine author flags years where 朔气时刻接近北京午夜 and dates may differ by one day: 2057, 2089, 2097, 2115, 2116, 2133, 2165, 2172.
- `--bazi`: add 八字四柱 (requires `--date`). 年柱按立春, 月柱按节气(五虎遁), 日柱取自引擎. `--time <H:MM>` additionally gives 时柱(五鼠遁, 民用时近似, 未做经度/均时差修正).
- `--xingxiu`: add 星宿两套民俗硬表 (requires `--date`). `lunar_month_day_xingxiu` = **本命星宿**(农历月+日查表, 27宿循环, 无牛宿; 闰月按同月序), `daily_zhiri_xingxiu` = **值日星宿**(星期+日支查表, 28宿全日循环). 输出顺序: 本命在前、值日在后. 两表为不同民俗体系, 结果不同属正常; 与天文星宿位置无关. 数据在 `data/xingxiu_lunar.json` / `data/xingxiu_daily.json` (用户供图转录, 已过结构自检).

The helper downloads and caches the official JavaScript under `~/.cache/chinese-calendar-data/index_c.js`, then evaluates it in a Node VM and calls `langConstant()` and `calDataYear()`. It keeps the source URL in the JSON metadata so downstream code can attribute the result.

## 名人生日档案

`data/known_dates.md` 存已查证的名人生日/历史日期。用户问名人生日时**先查该表**; 新查到的日期用本 skill 排好(农历/干支/星宿)后追加进表, 注明来源。单一来源标 ⚠, 双源核实改 ✓。

### 查证来源优先级

新日期查证时按以下顺序找来源, 尽量多源交叉确认:

1. **维基百科** (第一优先, 不限语言): 最可靠且机器可读 — 按人物母语/主要活动语言选语言版, 中文人物先试 `zh.wikipedia.org`, 国际人物/英文名先试 `en.wikipedia.org`, 其他语言版 (ja/de/fr/ko 等) 同理; 某语言版无条目就换另一语言版。取结构化数据: `curl https://<lang>.wikipedia.org/api/rest_v1/page/summary/<人物>` 或 `action=parse&prop=wikitext` 取 infobox 的 `birth_date`。注意区分农历/公历标注, 维基默认公历。技巧: `page/summary` 返回的 JSON 带 `wikibase_item` (如 `Q30948807`), 可据此在任意语言版间找同一人物的条目 — 先查 Wikidata sitelinks: `curl "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=<Q号>&props=sitelinks&format=json&formatversion=2"`, 取目标语言版的 `title` 再回 `page/summary` 取数据。
2. **Google 搜索** (第二优先): 搜 `<人物> 生日` / `<人物> birth date` 交叉确认, 结果里的百科/媒体条目可作第二来源。
3. **百度百科** (第三优先): 搜 `<人物> 生日` 或直接 `baike.baidu.com`, 常带农历生日与出生地细节, 但需警惕营销号内容。
4. **其他**: 官方传记/官网、权威媒体 (新华社/Reuters/Bloomberg)、福布斯等人物页。

规则:
- 本地模型会话里若无法直接联网(无 bash 网络、搜索 MCP 不可用或结果不合适), 把查证任务交给外部模型 CLI: `~/.kimi-code/bin/kimi -p "<人物+待核日期+已知分歧, 要结论+来源>"`(已验证能溯源引用链), 或 `~/.grok/bin/grok -p "..."`; 结果当作二手证据处理
- 至少查 2 个独立来源; 日期不一致时**不写入档案**, 在回复中列出分歧并说明
- 同一出版集团/同一原始通稿的转载不算独立来源
- 来源只有一条时 `核实` 列标 ⚠, 双源一致改 ✓
- 时辰一律不存(名人时辰几乎不可考)

## Output Notes

星宿一律用 `--xingxiu` 直接带日期取结果, **不要**自己写 python 读 `data/xingxiu_*.json` 或手推星期/日支。脚本里的星期换算(`weekday = (jd0 + ordinal + 2) % 7`, 0=星期天)与日支分组已跟引擎对齐; 手推易错(实测过: 把星期四误当星期三, 值日星宿跟着错)。

The normalized JSON keeps the original numeric fields where they matter:

- `months[].start_day_ordinal` is the site's day number relative to the requested civil year. Values can be `<=0` or greater than the year length because lunar months can start in adjacent civil years.
- `months[].leap` is true when the site's `cmonthNum` is negative.
- `months[].day_count` is 29 or 30 from the site's small/big-month flag.
- `solar_terms[]` and `moon_phases[]` include both ordinal values and mapped civil dates.
- `--date` output includes `day.sexagenary_day`, `day.julian_day_noon`, the stem/branch indexes, and `day.lunar_date`.

For civil dates, preserve the site's calendar convention: Gregorian dates are used from 1582-10-15 onward, Julian dates before that, and proleptic Julian dates before year 8. The helper handles the skipped civil dates 1582-10-05 through 1582-10-14 when mapping day ordinals for 1582.

If the user needs exactly what the website displays, use the page URL format `https://ytliu0.github.io/ChineseCalendar/index_simp.html?y=<year>` for the rendered calendar, but use the helper for machine-readable data.
