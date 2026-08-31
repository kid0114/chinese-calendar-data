# chinese-calendar-data

An agent skill (Pi / Codex) that queries [Yuk Tung Liu's ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) data as structured JSON — lunar dates, sexagenary (干支) pillars, solar terms, moon phases, 八字, and 星宿 lookup tables.

The website is a static GitHub Pages app with no HTTP API. This skill downloads the official `index_c.js` engine (caching it locally), runs it in a Node VM, and normalizes the output to JSON.

## What it does

- **`--year <int>`** — full-year calendar: lunar months (with leap-month flags and day counts), solar terms, moon phases. Valid range `-721..2200` (astronomical year numbering: `0` = 1 BCE).
- **`--date <YYYY-MM-DD>`** — one civil date: sexagenary day (日柱), lunar date, and optional extras:
  - `--bazi` — 八字四柱 (year pillar by 立春, month pillar by 节气/五虎遁, day from the engine; `--time H:MM` adds 时柱 via 五鼠遁, civil-time approximation)
  - `--xingxiu` — two folk 星宿 lookup tables (27-宿 lunar month+day table, 28-宿 weekday+day-branch table; different systems, different results is normal; unrelated to astronomical star positions)
  - `--three-readings` — 春节派 / 立春派 / 公元取模 year-boundary readings, with a flag when 生肖 disagrees
  - `--warn-uncertain` — warning for engine-known-uncertain years (朔气时刻接近北京午夜)
- **`--lang simp|trad|en`**, **`--ancient-li`**, **`--region`** for pre-Qin and split-calendar periods
- **`--raw`** — direct `calDataYear()` return value; **`--refresh`** — redownload the engine

## Usage

The helper lives at `scripts/chinese_calendar_data.mjs` relative to this skill's directory. Resolve it against wherever the skill is installed (e.g. `~/.pi/agent/skills/chinese-calendar-data/`, `~/.codex/skills/chinese-calendar-data/`, or this checkout):

```bash
SKILL_DIR=<path to this skill directory>
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --year 2024
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --date 2024-02-10 --bazi --xingxiu
```

Output is a single JSON document on stdout, with source metadata (page URL, script URL, cache path) for attribution. The engine is cached under `~/.cache/chinese-calendar-data/index_c.js` (override with `--cache <path>`).

## Install as a skill

```bash
git clone https://github.com/kid0114/chinese-calendar-data ~/.pi/agent/skills/chinese-calendar-data
# or for Codex:
git clone https://github.com/kid0114/chinese-calendar-data ~/.codex/skills/chinese-calendar-data
```

## Layout

```
SKILL.md                        # skill instructions for the agent
agents/openai.yaml              # interface metadata
scripts/chinese_calendar_data.mjs  # the helper (Node, no dependencies)
data/xingxiu_lunar.json         # 27-宿 lunar month+day table (folk, transcribed from user-supplied chart)
data/xingxiu_daily.json         # 28-宿 weekday+day-branch table (folk, transcribed from user-supplied chart)
data/known_dates.md             # verified celebrity/historical birth-date archive
```

## Notes

- Calendar conventions follow the site: Gregorian from 1582-10-15, (proleptic) Julian before; the 1582 skipped dates are handled when mapping day ordinals.
- The 星宿 tables are folk lookup systems, not astronomy — see `--xingxiu` output for the per-table basis.
- `data/known_dates.md` follows a verification convention: single-source entries are marked ⚠, double-verified ✓.
- The upstream engine and its data belong to Yuk Tung Liu; this repo only caches and calls it, and attributes the source URL in every result.
