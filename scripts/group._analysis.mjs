#!/usr/bin/env node
// Aggregate already-calculated birth-chart fields; never recompute calendars.
import { readFileSync, realpathSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = path.join(HERE, '../data/cabinets_by_administration.json');
const TRIPLETS = ['角虚觜', '亢危参', '氐室井', '房壁鬼', '心奎柳', '尾娄星', '箕胃张', '斗昴翼', '女毕轸'];
const STEMS = [...'甲乙丙丁戊己庚辛壬癸'];
const ELEMENTS = [...'木火土金水'];
const STEM_ELEMENT = Object.fromEntries(STEMS.map((stem, i) => [stem, ELEMENTS[Math.floor(i / 2)]]));
const ELEMENT_EN = { 木: 'Wood', 火: 'Fire', 土: 'Earth', 金: 'Metal', 水: 'Water' };
const VARIANTS = { 虛: '虚', 軫: '轸', 畢: '毕', 參: '参', 張: '张', 婁: '娄' };
const normalizeMansion = value => typeof value === 'string'
  ? [...value.trim()].map(c => VARIANTS[c] ?? c).join('') : '';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function statistics(count, denominator) {
  return {
    count,
    denominator,
    ratio: `${count}/${denominator}`,
    proportion: count / denominator,
    percentage: Number((count * 100 / denominator).toFixed(2)),
  };
}

function analyzeGroup(group) {
  const prefix = `Group ${group.id}`;
  requireValue(Array.isArray(group.members) && group.members.length > 0, `${prefix}: members must be a non-empty array`);
  const n = group.members.length;
  if (group.member_count !== undefined) {
    requireValue(group.member_count === n, `${prefix}: member_count does not match members.length (${n})`);
  }
  const seen = new Set();
  const native = TRIPLETS.map((triplet, i) => ({ group_index: i + 1, mansions: [...triplet], members: [] }));
  const stems = new Map(STEMS.map(stem => [stem, 0]));
  const elements = new Map(ELEMENTS.map(element => [element, 0]));
  for (const [i, member] of group.members.entries()) {
    requireValue(member && typeof member === 'object', `${prefix}: invalid member at index ${i}`);
    const name = member.name_en ?? member.name;
    requireValue(typeof name === 'string' && name.trim(), `${prefix}: missing member name at index ${i}`);
    const key = name.trim().normalize('NFKC').toLowerCase();
    requireValue(!seen.has(key), `${prefix}: duplicate member ${name}`);
    seen.add(key);
    const context = `${prefix}, ${name}`;
    const mansion = normalizeMansion(member.mansions?.benming_native);
    const index = TRIPLETS.findIndex(triplet => mansion.length === 1 && triplet.includes(mansion));
    requireValue(index >= 0, `${context}: invalid or missing native mansion ${JSON.stringify(mansion)} (牛 is outside the 27-mansion system)`);
    const cached = member.mansions.yetai_group;
    if (cached !== undefined) {
      requireValue(cached && typeof cached === 'object', `${context}: invalid stored yetai_group`);
      if (cached.group_index !== undefined) {
        requireValue(cached.group_index === index + 1, `${context}: stored yetai group contradicts native mansion`);
      }
      if (cached.mansions !== undefined) {
        requireValue(Array.isArray(cached.mansions)
          && cached.mansions.length === 3
          && new Set(cached.mansions.map(normalizeMansion)).size === 3
          && cached.mansions.every(m => normalizeMansion(m).length === 1 && TRIPLETS[index].includes(normalizeMansion(m))),
        `${context}: stored yetai triplet contradicts native mansion`);
      }
    }
    const stem = member.day_master_stem;
    const element = member.day_master_element;
    requireValue(stems.has(stem), `${context}: invalid or missing day_master_stem`);
    requireValue(element === STEM_ELEMENT[stem], `${context}: day_master_element contradicts day_master_stem`);
    if (member.day_master !== undefined) {
      requireValue(member.day_master === stem + element, `${context}: day_master contradicts stem/element`);
    }
    if (member.day_pillar !== undefined) {
      requireValue(typeof member.day_pillar === 'string' && member.day_pillar[0] === stem,
        `${context}: day_pillar contradicts day_master_stem`);
    }
    native[index].members.push({ name: name.trim(), native_mansion: mansion });
    stems.set(stem, stems.get(stem) + 1);
    elements.set(element, elements.get(element) + 1);
  }
  const result = {
    id: group.id,
    label: typeof group.label === 'string' ? group.label : group.id,
    member_count: n,
  };
  for (const key of ['label_zh', 'president', 'reference_year', 'term_start', 'term_end', 'selection_basis', 'notes', 'roster_sources']) {
    if (group[key] !== undefined) result[key] = group[key];
  }
  result.native_groups = native.map(row => ({ ...row, ...statistics(row.members.length, n) }));
  result.day_masters = STEMS.map(stem => ({
    stem, element: STEM_ELEMENT[stem], day_master: stem + STEM_ELEMENT[stem], ...statistics(stems.get(stem), n),
  }));
  result.day_master_elements = ELEMENTS.map(element => ({
    element, element_en: ELEMENT_EN[element], ...statistics(elements.get(element), n),
  }));
  return result;
}

export function analyzeDataset(dataset, selectedIds = []) {
  requireValue(dataset && typeof dataset === 'object' && !Array.isArray(dataset), 'Input must be a JSON object');
  requireValue(!(dataset.administrations !== undefined && dataset.groups !== undefined), 'Input must contain administrations or groups, not both');
  const groups = dataset.administrations ?? dataset.groups;
  requireValue(Array.isArray(groups) && groups.length > 0, 'Input must contain a non-empty administrations or groups array');
  const ids = new Set();
  for (const group of groups) {
    requireValue(group && typeof group.id === 'string' && group.id.trim(), 'Each group needs a non-empty id');
    requireValue(!ids.has(group.id), `Duplicate group id: ${group.id}`);
    ids.add(group.id);
  }
  requireValue(Array.isArray(selectedIds) && selectedIds.every(id => typeof id === 'string'), 'Selected group IDs must be strings');
  requireValue(new Set(selectedIds).size === selectedIds.length, 'Do not select the same group more than once');
  for (const id of selectedIds) {
    requireValue(ids.has(id), `Unknown group ${id}; available: ${[...ids].join(', ')}`);
  }
  const selected = selectedIds.length ? groups.filter(group => selectedIds.includes(group.id)) : groups;
  return {
    analysis_schema_version: 1,
    input_scope: dataset.scope ?? null,
    method: {
      population: 'Analyze each input group separately; denominator = its validated member count. Do not pool groups or deduplicate people across administrations.',
      native_mansions: 'Use stored benming_native only, normalized to simplified characters. 27 mansions in nine triplets; same mansion = 命, different mansions within a triplet = 业胎. Duty mansions are not analyzed.',
      day_masters: 'One day stem per member; combine stems by their day-master element, not whole-chart wuxing_counts.',
      percentages: 'count / denominator * 100, rounded to two decimals. Exact ratios are retained; rounded totals may differ from 100%.',
      evidence: 'Aggregates existing data only; does not verify birthdays, cabinet rosters, or birth-chart calculations. Folk classifications, not causal claims.',
    },
    groups: selected.map(analyzeGroup),
  };
}

const escapeMarkdown = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');

function table(headers, rows) {
  return [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.join(' | ')} |`).join('\n');
}

export function renderMarkdown(analysis) {
  const sections = ['# Group analysis', '',
    'Each group is analyzed separately. Native mansions only; same mansion = 命, different mansions within a triplet = 业胎. Day Master elements are not whole-chart element counts.',
    'This report summarizes stored records; it does not re-verify their roster dates or birthdays.',
    'Percentages are rounded to two decimals; exact ratios are included.',
  ];
  if (analysis.input_scope) sections.push('', `Input scope: ${escapeMarkdown(analysis.input_scope)}`);
  for (const group of analysis.groups) {
    const n = group.member_count;
    const proportion = row => `${row.percentage.toFixed(2)}%`;
    const total = ['**Total**', `**${n}**`, `**${n}/${n}**`, '**100.00%**'];
    sections.push('', `## ${escapeMarkdown(group.label)} (${escapeMarkdown(group.id)})`, '',
      `Members: **${n}**; denominator: **${n}**.`);
    if (group.selection_basis) sections.push(`Selection basis: ${escapeMarkdown(group.selection_basis)}.`);
    if (Array.isArray(group.notes)) {
      for (const note of group.notes) sections.push(`- ${escapeMarkdown(note)}`);
    }
    sections.push('', '### Native-mansion groups (本命星宿)', '', table(
      ['Group', 'Members (native mansion)', 'Count', 'Ratio', 'Proportion'],
      [...group.native_groups.map(row => [row.mansions.join(' / '),
        row.members.map(m => `${escapeMarkdown(m.name)} (${m.native_mansion})`).join('; ') || '—',
        row.count, row.ratio, proportion(row)]), [total[0], '', ...total.slice(1)]],
    ), '', '### Day Masters (日主)', '', table(
      ['Day Master', 'Count', 'Ratio', 'Proportion'],
      [...group.day_masters.map(row => [row.day_master, row.count, row.ratio, proportion(row)]), total],
    ), '', '### Day Master elements', '', table(
      ['Element', 'Count', 'Ratio', 'Proportion'],
      [...group.day_master_elements.map(row => [`${row.element_en} ${row.element}`, row.count, row.ratio, proportion(row)]), total],
    ));
  }
  return sections.join('\n') + '\n';
}

function usage() {
  return `group._analysis.mjs — native-mansion and Day Master group statistics (offline)
Usage: node group._analysis.mjs [options]
  --input FILE        Local input JSON (default: ../data/cabinets_by_administration.json; not distributed)
  --group ID          Select a group/administration; repeatable (default: all, separate)
  --format FORMAT     markdown (default) or json
  --output FILE       Write report to FILE instead of stdout; cannot overwrite input
  --list              List available group IDs and labels without generating tables
  --help, -h          Show help

Input: { "administrations": [...] } or { "groups": [...] }.
Each group has id, optional label/member_count, and non-empty members.
Each member needs name_en (or name), mansions.benming_native,
day_master_stem, day_master_element. Other chart fields are cross-checked if present.
No calendar recalculation, network requests, or source-data changes.
`;
}

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, groups: [], format: 'markdown', output: null, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--list') options.list = true;
    else if (['--input', '--group', '--format', '--output'].includes(arg)) {
      const value = argv[++i];
      requireValue(value && !value.startsWith('--'), `${arg} requires a value`);
      if (arg === '--group') options.groups.push(value);
      else options[arg.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  requireValue(['markdown', 'json'].includes(options.format), '--format must be markdown or json');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write(usage());
  requireValue(existsSync(options.input), 'Input dataset not found. Local datasets are not distributed; provide --input /path/to/local/groups.json.');
  const input = realpathSync(options.input);
  if (options.output) {
    const outputExists = existsSync(options.output);
    const output = outputExists ? realpathSync(options.output) : path.resolve(options.output);
    const inputStat = statSync(input);
    const outputStat = outputExists ? statSync(output) : null;
    const sameFile = output === input || (outputStat && inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino);
    requireValue(!sameFile, '--output cannot overwrite the input dataset');
  }
  const dataset = JSON.parse(readFileSync(input, 'utf8'));
  const analysis = analyzeDataset(dataset, options.groups);
  const text = options.list
    ? analysis.groups.map(group => `${group.id}\t${group.label}\t${group.member_count}`).join('\n') + '\n'
    : options.format === 'json' ? JSON.stringify(analysis, null, 2) + '\n' : renderMarkdown(analysis);
  if (options.output) writeFileSync(options.output, text, 'utf8');
  else process.stdout.write(text);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    process.stderr.write(`group._analysis: ${error.message}\n`);
    process.exitCode = 1;
  }
}
