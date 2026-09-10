# chinese-calendar-data

中文说明见 [README.zh.md](README.zh.md)

**One core decision: don't reimplement the calendar — borrow the authoritative engine.**

An accurate Chinese calendar is two things stacked together: astronomy (new moons and solar terms computed to the minute) and history (the six ancient calendars of pre-Qin China, parallel calendars of rival dynasties, the 1582 Gregorian reform). Reimplementing either is a near-guaranteed way to be wrong. [Yuk Tung Liu's ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) has already done both — it just ships as a static web page with no API.

This skill does exactly one thing: **lifts the official engine `index_c.js` out of the page and runs it as a library**.

```
official index_c.js ──download & cache──> Node VM sandbox ──normalize──> JSON
(algorithm & data untouched)             (used as a library, not a page)  (ready for agents)
```

## What you can ask

```bash
SKILL_DIR=<path to this skill>   # e.g. ~/.pi/agent/skills/chinese-calendar-data
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --date 1946-09-25 --bazi --xingxiu
```

- **A date → the full picture**: `--date` gives the sexagenary day (日柱) and lunar date; `--bazi` adds the four pillars (year by 立春, month by solar terms/五虎遁; `--time H:MM` adds the hour pillar); `--xingxiu` adds the 星宿 mansions
- **Disputed zodiac year?**: `--three-readings` reports all three conventions (春节 / 立春 / Jan-1) and flags `disagree_chun_vs_li`
- **Is this date's calendar itself reliable?**: `--warn-uncertain` warns for the engine author's own list of uncertain years (new moon / solar term near Beijing midnight, dates may shift by one day)
- **A whole year**: `--year <int>` gives lunar months (leap flags, month lengths), solar terms, moon phases. Range 721 BCE – 2200 CE (astronomical year numbering: `0` = 1 BCE)
- **Pre-Qin & split-calendar eras**: `--ancient-li` (Chunqiu, Zhou, Lu, Yin, …), `--region` (Shu, Wu, LiaoJinYuan, SouthernMing, …)

## 星宿: two folk tables, not astronomy

`--xingxiu` returns two **lookup-table** mansions. Different systems giving different results is normal, and neither relates to astronomical star positions:

| Field | Common name | Lookup basis | Cycle |
|---|---|---|---|
| `lunar_month_day_xingxiu` | 本命星宿 | lunar month + day | 27 mansions (skips 牛) |
| `daily_zhiri_xingxiu` | 值日星宿 | weekday + day branch | 28 mansions (+1 daily) |

Table data lives in `data/xingxiu_lunar.json` / `data/xingxiu_daily.json` (transcribed from supplied charts, structurally self-checked). **Always query via `--xingxiu`** — never read the JSON or compute weekdays by hand; the weekday mapping and branch grouping are aligned with the engine, and manual derivation has been observed to go wrong in practice.

## Install

```bash
git clone https://github.com/kid0114/chinese-calendar-data ~/.pi/agent/skills/chinese-calendar-data
# or for Codex:
git clone https://github.com/kid0114/chinese-calendar-data ~/.codex/skills/chinese-calendar-data
```

The engine downloads on first run and caches at `~/.cache/chinese-calendar-data/` (`--refresh` forces an update). Single-file Node script, zero dependencies.

## Layout

```
SKILL.md                           # instructions for the agent (verification workflow, source priority)
agents/openai.yaml                 # interface metadata
scripts/chinese_calendar_data.mjs  # the helper
data/xingxiu_lunar.json            # 27-mansion lunar month+day table (folk)
data/xingxiu_daily.json            # 28-mansion weekday+branch table (folk)
data/known_dates.md                # local verification archive (a cache that grows with use; not published)
```

## Boundaries & attribution

- Calendar conventions follow the site: Gregorian from 1582-10-15, (proleptic) Julian before; the skipped 1582 dates are handled
- Every result carries source metadata (page URL, script URL, cache path) for attribution
- The upstream engine and its data belong to Yuk Tung Liu; this repo only caches, executes, and normalizes
