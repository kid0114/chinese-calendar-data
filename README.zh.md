# chinese-calendar-data（中文说明）

一个 agent skill（Pi / Codex），把 [Yuk Tung Liu 的 ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) 的数据以结构化 JSON 查出来。**主要用途：查星宿**（值日星宿 / 农历月日星宿），顺带支持农历日期、干支、八字、节气、月相等。

网站本身是静态 GitHub Pages，没有 HTTP API。本 skill 下载官方 `index_c.js` 引擎（本地缓存），在 Node VM 里执行，把输出整理成 JSON。

## 主要用法：查星宿

```bash
SKILL_DIR=<本 skill 所在目录>
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --date 1990-07-30 --xingxiu
```

`--xingxiu` 输出两套**民俗查表**星宿（两套体系不同，结果不一致属正常，与天文星宿位置无关）：

| 字段 | 体系 | 说明 |
|---|---|---|
| `daily_zhiri_xingxiu` | 星期 + 日支查表 | 28 宿全日循环（逐日 +1），即"值日星宿" |
| `lunar_month_day_xingxiu` | 农历月 + 日查表 | 27 宿循环（跳过牛宿），闰月按同月序 |

查表数据在 `data/xingxiu_daily.json` / `data/xingxiu_lunar.json`（用户供图转录，已过结构自检）。

## 其他能力

- **`--year <int>`**：全年历——农历月（闰月标记、大小月天数）、节气、月相。范围 `-721..2200`（天文纪年：`0` = 公元前 1 年）
- **`--date <YYYY-MM-DD>`**：单日——日柱（干支）、农历日期
- **`--bazi`**：八字四柱（年柱按立春、月柱按节气五虎遁、日柱取引擎；`--time H:MM` 加时柱，五鼠遁，民用时近似）
- **`--three-readings`**：春节派 / 立春派 / 公元取模 三种生肖边界读法，分歧时给 `disagree_chun_vs_li`
- **`--warn-uncertain`**：引擎已知不确定年份（朔气时刻接近北京午夜）警告
- **`--lang simp|trad|en`**、**`--ancient-li`**、**`--region`**：先秦及分历时期
- **`--raw`**：`calDataYear()` 原始返回；**`--refresh`**：重新下载引擎

## 安装

```bash
git clone https://github.com/kid0114/chinese-calendar-data ~/.pi/agent/skills/chinese-calendar-data
# 或 Codex:
git clone https://github.com/kid0114/chinese-calendar-data ~/.codex/skills/chinese-calendar-data
```

## 目录结构

```
SKILL.md                        # 给 agent 的 skill 说明
agents/openai.yaml              # 接口元数据
scripts/chinese_calendar_data.mjs  # 主脚本（Node，无依赖）
data/xingxiu_lunar.json         # 27 宿月日表（民俗）
data/xingxiu_daily.json         # 28 宿值日表（民俗）
data/known_dates.md             # 已查证名人生日档案（⚠ 单源 / ✓ 双源）
```

## 备注

- 历法约定跟随原站：1582-10-15 起格里历，之前儒略历；1582 跳过的日期已处理
- 星宿表是民俗查表体系，不是天文星宿位置
- 上游引擎及数据版权归 Yuk Tung Liu，本仓库仅缓存调用，每次结果都带来源 URL
