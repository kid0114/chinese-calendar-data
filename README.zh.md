# chinese-calendar-data（中文说明）

English: [README.md](README.md)

**一个核心决定：不重写历法，把权威引擎借出来用。**

准确的中国历法是两件事的叠加：天文计算（朔望月、节气精确到分钟）和历史规则（先秦古六历、分裂时期各政权并行的历法、1582 年改历）。自己实现几乎必错。而 [Yuk Tung Liu 的 ChineseCalendar](https://ytliu0.github.io/ChineseCalendar/index_simp.html) 已经把这两件事都做好了——只不过它以静态网页的形式发布，没有 API。

历法主脚本只做一件事：**把网页里的官方引擎 `index_c.js` 拿出来，当库用**。另有独立的离线群体分析脚本，只汇总已有排盘记录，不改写或重新实现历法引擎。

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

## 群体分析：本命星宿与日主统计

`group._analysis.mjs` 为每个群体分别生成三张表：**本命星宿业胎组、十干日主、日主五行**。Node.js 18+ 即可运行，无 npm 依赖，无需联网。

```bash
# 在仓库根目录运行；安装为 skill 时把 SKILL_DIR 改成实际路径：
SKILL_DIR=.
DATA=/path/to/local/groups.json
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA"                    # 全部群体，分别统计
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --group example    # 指定群体
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --list
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --format json
node "$SKILL_DIR/scripts/group._analysis.mjs" --input "$DATA" --output /tmp/group-statistics.md
node --test "$SKILL_DIR/scripts/group._analysis.test.mjs"
```

- **人数、精确分数、百分比**：保留零人数类别；每个群体独立校验分母，不写死 16 人。百分比保留两位小数，舍入后各项相加可能不等于 100%。
- **只用本命星宿**：27 宿每隔 9 宿组成一个三宿组，共九组。同宿为命，异宿同组为业胎；自动归一繁简宿名。不把值日宿套进 27 宿业胎循环。
- **日主五行**：每人按日干计一次，不是整张命盘的加权五行统计。
- **校验**：缺字段、字段矛盾、同一群体内重复成员直接报错，不静默剔除。跨政府复任者在各自群体各计一次，不自动混合群体；不修改输入文件。
- **输入输出**：默认 Markdown 输出到标准输出；`--format json` 提供结构化计数与比例。`--input FILE` 指定数据，`--output FILE` 保存报表。

### 本地数据不上传

**仓库不分发本地研究数据、真实成员记录或统计结果。** `data/known_dates.md` 和 `data/cabinets_by_administration.json` 均已加入 Git 忽略规则。用 `--input` 指定自己的本地 JSON；默认路径仅为本地使用提供便利，不随仓库分发。测试仅使用内存或临时文件中的虚构成员，不读取本地研究记录。

统计脚本只汇总已有字段，不查生日、不核实任职日期、不重新排盘。比较群体时须保留样本选择日期与口径；民俗关系仅为分组约定，不作因果断言。

### 输入格式（虚构示例）

自定义 JSON 可用 `groups` 根数组代替 `administrations`：

```json
{
  "groups": [{
    "id": "example",
    "label": "示例群体",
    "members": [{
      "name": "示例成员",
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

可选字段 `member_count`、缓存的 `mansions.yetai_group`、`day_master`、`day_pillar` 存在时会检查一致性。完整选项见 `--help`。

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
scripts/chinese_calendar_data.mjs  # 历法主脚本
scripts/group._analysis.mjs       # 离线群体统计（Markdown / JSON）
scripts/group._analysis.test.mjs  # 回归、校验与命令行测试
data/xingxiu_lunar.json            # 27 宿月日表（民俗）
data/xingxiu_daily.json            # 28 宿值日表（民俗）
data/known_dates.md                # 本地查证档案（随用随查的缓存，不上传）
```

## 边界与归属

- 历法约定跟随原站：1582-10-15 起格里历，之前（顺推）儒略历；1582 年跳过的日期已处理
- 引擎返回的每条结果都附来源 URL（页面、脚本、缓存路径），便于溯源
- 上游引擎与数据版权归 Yuk Tung Liu；本仓库只做缓存、执行和格式归一化
