# chinese-calendar-data（中文说明）

English: [README.md](README.md)

**一个核心决定：不重写历法，把权威引擎借出来用。**

准确的中国历法是两件事的叠加：天文计算（朔望月、节气精确到分钟）和历史规则（先秦古六历、分裂时期各政权并行的历法、1582 年改历）。自己实现几乎必错。而 [Yuk Tung Liu 的 ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) 已经把这两件事都做好了——只不过它以静态网页的形式发布，没有 API。

这个 skill 做的事情只有一件：**把网页里的官方引擎 `index_c.js` 拿出来，当库用**。

```
官方 index_c.js ──下载缓存──> Node VM 沙箱执行 ──归一化──> JSON
（算法与数据原封不动）        （不当网页，当函数库）   （给 agent 直接消费）
```

## 能回答什么

```bash
SKILL_DIR=<本 skill 所在目录>   # 如 ~/.pi/agent/skills/chinese-calendar-data
node "$SKILL_DIR/scripts/chinese_calendar_data.mjs" --date 1946-09-25 --bazi --xingxiu
```

- **生日 → 全盘**：`--date` 给日柱和农历日期；`--bazi` 加八字四柱（年柱按立春、月柱按节气五虎遁；`--time H:MM` 加时柱）；`--xingxiu` 加星宿
- **生肖有分歧？**：`--three-readings` 同时给春节派 / 立春派 / 公元取模三种口径，分歧时置 `disagree_chun_vs_li`
- **这天的历法本身可靠吗？**：`--warn-uncertain` 对引擎作者自列的存疑年月（朔气时刻接近北京午夜，日期可能差一天）给出警告
- **全年历**：`--year <int>` 给农历月（闰月、大小月）、节气、月相。范围公元前 721 年到公元 2200 年（天文纪年）
- **先秦与分裂时期**：`--ancient-li`（春秋/周/鲁/殷等古历）、`--region`（蜀/吴/辽金元/南明等并行历法）

## 星宿：两套民俗表，别和天文混了

`--xingxiu` 返回两套**查表法**星宿，体系不同、结果不同属正常，且都与天文星宿位置无关：

| 输出字段 | 俗称 | 查法 | 循环 |
|---|---|---|---|
| `lunar_month_day_xingxiu` | 本命星宿 | 农历月 + 日 | 27 宿（跳过牛宿） |
| `daily_zhiri_xingxiu` | 值日星宿 | 星期 + 日支 | 28 宿（逐日 +1） |

查表数据在 `data/xingxiu_lunar.json` / `data/xingxiu_daily.json`（供图转录，已过结构自检）。**查星宿请一律走 `--xingxiu`**，不要自己读 JSON 或手推星期——星期换算和日支分组已跟引擎对齐，手推实测错过。

## 安装

```bash
git clone https://github.com/kid0114/chinese-calendar-data ~/.pi/agent/skills/chinese-calendar-data
# 或 Codex:
git clone https://github.com/kid0114/chinese-calendar-data ~/.codex/skills/chinese-calendar-data
```

引擎首次运行时自动下载，缓存在 `~/.cache/chinese-calendar-data/`（`--refresh` 强制更新）。Node 单文件，零依赖。

## 目录结构

```
SKILL.md                           # 给 agent 的说明（查证流程、来源优先级）
agents/openai.yaml                 # 接口元数据
scripts/chinese_calendar_data.mjs  # 主脚本
data/xingxiu_lunar.json            # 27 宿月日表（民俗）
data/xingxiu_daily.json            # 28 宿值日表（民俗）
data/known_dates.md                # 本地查证档案（随用随查的缓存，不上传）
```

## 边界与归属

- 历法约定跟随原站：1582-10-15 起格里历，之前（顺推）儒略历；1582 年跳过的日期已处理
- 引擎返回的每条结果都附来源 URL（页面、脚本、缓存路径），便于溯源
- 上游引擎与数据版权归 Yuk Tung Liu；本仓库只做缓存、执行和格式归一化
