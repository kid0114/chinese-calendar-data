# chinese-calendar-data

中文说明见 [README.zh.md](README.zh.md)

**One core decision: don't reimplement the calendar — borrow the authoritative engine.**

An accurate Chinese calendar is two things stacked together: astronomy (new moons and solar terms computed to the minute) and history (the six ancient calendars of pre-Qin China, parallel calendars of rival dynasties, the 1582 Gregorian reform). Reimplementing either is a near-guaranteed way to be wrong. [Yuk Tung Liu's ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) has already done both — it just ships as a static web page with no API.

The calendar helper does exactly one thing: **lifts the official engine `index_c.js` out of the page and runs it as a library**. A separate offline group-analysis helper summarizes already-calculated records without changing or reimplementing the calendar engine.

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

## Group analysis: native mansions and Day Masters

`group._analysis.mjs` generates **three separate statistical tables per population**: native-mansion triplets, the ten Day Masters, and the five Day Master elements. Runs offline with Node.js 18+ and no npm dependencies.

```bash
# Run from this checkout, or set SKILL_DIR to your installed skill directory:
SKILL_DIR=.
DATA=/path/to/local/groups.json
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA"                    # groups kept separate
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --group example    # one group
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --list
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --format json
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --output /tmp/group-statistics.md
node --test "$SKILL_DIR/scripts/group._analysis.test.mjs"
```

- **Counts, exact ratios, percentages:** every category is included, even zero-count categories. Each population uses its own validated denominator, not a hardcoded 16. Percentages use two decimals; rounded rows may not sum to exactly 100%.
- **Native mansions only:** the 27-mansion cycle forms nine triplets spaced nine apart. Same mansion = 命; different mansions in the same triplet = 业胎. Traditional mansion names are normalized. Duty mansions are not used.
- **Day Master elements:** count one day stem per person, not weighted whole-chart `wuxing_counts`.
- **Validation:** missing/contradictory fields or duplicate members within one population fail explicitly. People serving in separate administrations count once in each cohort; populations are never pooled automatically. The input dataset is never modified.
- **Input/output:** Markdown to stdout by default; `--format json` exposes structured counts and ratios for later presentation work. Use `--input FILE` for another dataset or `--output FILE` to save a report.

### Local data stays local

**No local research datasets, member records, or generated statistics are distributed.** Both `data/known_dates.md` and `data/cabinets_by_administration.json` are Git-ignored. Supply your own local JSON with `--input`; the default path is only a local convenience and is not bundled. Tests use synthetic members created in memory or temporary files, never local research records.

The helper only aggregates stored fields; it does not research birthdays, verify roster dates, or recompute charts. Keep population-selection dates/bases explicit when comparing groups. Folk relationship labels are grouping conventions, not causal claims.

### Input format (synthetic example)

Custom JSON can use `groups` instead of `administrations`:

```json
{
  "groups": [{
    "id": "example",
    "label": "Example population",
    "members": [{
      "name": "Example member",
      "mansions": { "benming_native": "角" },
      "day_master_stem": "甲",
      "day_master_element": "木"
    }]
  }]
}
```

```bash
node "$SKILL_DIR/scripts/group._analysis.mjs" --input my-groups.json --group example
```

Optional `member_count`, cached `mansions.yetai_group`, `day_master`, and `day_pillar` fields are checked for consistency when present. See `--help` for all CLI options.

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
scripts/chinese_calendar_data.mjs  # the calendar helper
scripts/group._analysis.mjs       # offline group statistics (Markdown / JSON)
scripts/group._analysis.test.mjs  # regression, validation, and CLI tests
data/xingxiu_lunar.json            # 27-mansion lunar month+day table (folk)
data/xingxiu_daily.json            # 28-mansion weekday+branch table (folk)
data/known_dates.md                # local verification archive (a cache that grows with use; not published)
```

## Boundaries & attribution

- Calendar conventions follow the site: Gregorian from 1582-10-15, (proleptic) Julian before; the skipped 1582 dates are handled
- Every result carries source metadata (page URL, script URL, cache path) for attribution
- The upstream engine and its data belong to Yuk Tung Liu; this repo only caches, executes, and normalizes
