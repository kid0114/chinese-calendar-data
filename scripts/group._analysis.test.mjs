import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyzeDataset, renderMarkdown } from './group._analysis.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'group._analysis.mjs');
const fixture = () => ({ groups: [{ id: 'sample', label: 'Example', member_count: 3, members: [
  { name: 'A', mansions: { benming_native: '角', duty: '牛' }, day_master_stem: '甲', day_master_element: '木' },
  { name: 'B', mansions: { benming_native: '虛' }, day_master_stem: '乙', day_master_element: '木' },
  { name: 'C', mansions: { benming_native: '畢' }, day_master_stem: '壬', day_master_element: '水' },
] }] });
const first = data => data.groups[0].members[0];
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: os.tmpdir() });

function temporary(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'group-analysis-test-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('native triplets, same-mansion members, and traditional characters', () => {
  const data = fixture();
  data.groups[0].members.push({ ...structuredClone(first(data)), name: 'D' });
  data.groups[0].member_count = 4;
  const group = analyzeDataset(data).groups[0];
  assert.equal(group.native_groups.length, 9);
  assert.equal(group.native_groups[0].count, 3);
  assert.equal(group.native_groups[0].members[1].native_mansion, '虚');
  assert.equal(group.native_groups[8].members[0].native_mansion, '毕');
  assert.equal(group.native_groups[1].count, 0);
  assert.equal(group.native_groups[0].ratio, '3/4');
  assert.equal(group.native_groups[0].percentage, 75);
});

test('Day Master stem and element counts do not use chart wuxing_counts', () => {
  const data = fixture();
  first(data).wuxing_counts = { 木: 0, 火: 999, 土: 0, 金: 0, 水: 0 };
  const group = analyzeDataset(data).groups[0];
  assert.equal(group.day_masters.length, 10);
  assert.equal(group.day_master_elements.length, 5);
  assert.deepEqual(group.day_master_elements.map(r => r.count), [2, 0, 0, 0, 1]);
  assert.equal(group.day_master_elements[0].percentage, 66.67);
  assert.equal(group.day_master_elements[0].proportion, 2 / 3);
  assert.equal(group.day_masters[0].ratio, '1/3');
});

test('keeps groups separate, accepts repeated people across administrations, and does not mutate input', () => {
  const data = fixture();
  const second = structuredClone(data.groups[0]);
  second.id = 'second';
  data.groups.push(second);
  const before = structuredClone(data);
  const report = analyzeDataset(data);
  assert.deepEqual(report.groups.map(g => g.member_count), [3, 3]);
  assert.deepEqual(data, before);
  assert.deepEqual(analyzeDataset(data, ['second']).groups.map(g => g.id), ['second']);
});

test('handles singleton denominators without assuming 16 members', () => {
  const data = fixture();
  data.groups[0].members = [first(data)];
  data.groups[0].member_count = 1;
  const group = analyzeDataset(data).groups[0];
  assert.equal(group.native_groups[0].ratio, '1/1');
  assert.equal(group.native_groups[0].percentage, 100);
  assert.equal(group.day_masters[1].ratio, '0/1');
});

for (const [name, change, expected] of [
  ['empty group', d => { d.groups[0].members = []; }, /non-empty/],
  ['incorrect denominator', d => { d.groups[0].member_count = 16; }, /member_count/],
  ['duplicate member', d => { d.groups[0].members[1].name = ' a '; }, /duplicate member/],
  ['missing name', d => { delete first(d).name; }, /missing member name/],
  ['missing native mansion', d => { delete first(d).mansions; }, /native mansion/],
  ['native 牛', d => { first(d).mansions.benming_native = '牛'; }, /27-mansion/],
  ['multi-character mansion', d => { first(d).mansions.benming_native = '角虚'; }, /native mansion/],
  ['missing stem', d => { delete first(d).day_master_stem; }, /day_master_stem/],
  ['missing element', d => { delete first(d).day_master_element; }, /day_master_element/],
  ['contradictory element', d => { first(d).day_master_element = '水'; }, /day_master_element/],
  ['contradictory combined Day Master', d => { first(d).day_master = '乙木'; }, /day_master contradicts/],
  ['contradictory day pillar', d => { first(d).day_pillar = '壬寅'; }, /day_pillar/],
  ['contradictory cached group index', d => { first(d).mansions.yetai_group = { group_index: 2 }; }, /stored yetai group/],
  ['contradictory cached triplet', d => { first(d).mansions.yetai_group = { mansions: ['亢', '危', '参'] }; }, /stored yetai triplet/],
  ['empty mansion in cached triplet', d => { first(d).mansions.yetai_group = { mansions: ['', '角', '虚'] }; }, /stored yetai triplet/],
  ['duplicate cached triplet entries', d => { first(d).mansions.yetai_group = { mansions: ['角', '角', '虚'] }; }, /stored yetai triplet/],
]) {
  test(`rejects ${name}`, () => {
    const data = fixture(); change(data);
    assert.throws(() => analyzeDataset(data), expected);
  });
}

test('rejects ambiguous input roots, duplicate IDs, unknown IDs, and repeated selections', () => {
  assert.throws(() => analyzeDataset({ groups: [], administrations: [] }), /not both/);
  assert.throws(() => analyzeDataset({ groups: [] }), /non-empty/);
  const data = fixture();
  assert.throws(() => analyzeDataset(data, ['missing']), /Unknown group/);
  assert.throws(() => analyzeDataset(data, ['sample', 'sample']), /more than once/);
  data.groups.push(structuredClone(data.groups[0]));
  assert.throws(() => analyzeDataset(data), /Duplicate group id/);
});

test('accepts traditional cached triplets regardless of stored triplet order', () => {
  const data = fixture();
  first(data).mansions.yetai_group = { group_index: 1, mansions: ['觜', '虛', '角'] };
  assert.equal(analyzeDataset(data).groups[0].native_groups[0].count, 2);
});

test('Markdown has three tables, safe cell text, exact ratios, and all zero categories', () => {
  const data = fixture();
  first(data).name = 'Name | <tag>\nnext';
  const md = renderMarkdown(analyzeDataset(data));
  assert.equal((md.match(/^### /gm) ?? []).length, 3);
  assert.ok(md.includes('Name &#124; &lt;tag&gt; next'));
  assert.ok(md.includes('| 亢 / 危 / 参 | — | 0 | 0/3 | 0.00% |'));
  assert.ok(md.includes('| Wood 木 | 2 | 2/3 | 66.67% |'));
  assert.ok(md.includes('same mansion = 命'));
  for (const line of md.split('\n').filter(line => line.startsWith('| '))) {
    assert.ok([4, 5].includes(line.split('|').length - 2), line);
  }
});

test('synthetic matrix covers all 27 native mansions, ten stems, and five elements', () => {
  const mansions = [...'角虚觜亢危参氐室井房壁鬼心奎柳尾娄星箕胃张斗昴翼女毕轸'];
  const stems = [...'甲乙丙丁戊己庚辛壬癸'];
  const elements = [...'木火土金水'];
  const members = Array.from({ length: 30 }, (_, i) => ({
    name: `Synthetic member ${i + 1}`,
    mansions: { benming_native: mansions[i % 27] },
    day_master_stem: stems[i % 10],
    day_master_element: elements[Math.floor((i % 10) / 2)],
  }));
  const group = analyzeDataset({ administrations: [{ id: 'matrix', members }] }).groups[0];
  assert.equal(group.member_count, 30);
  assert.deepEqual(group.native_groups.map(r => r.count), [6, 3, 3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(group.day_masters.map(r => r.count), Array(10).fill(3));
  assert.deepEqual(group.day_master_elements.map(r => r.count), Array(5).fill(6));
  for (const rows of [group.native_groups, group.day_masters, group.day_master_elements]) {
    assert.equal(rows.reduce((sum, r) => sum + r.count, 0), 30);
    assert.ok(rows.every(r => r.denominator === 30));
  }
});

test('CLI filtering/JSON/list/help work with synthetic input from any directory', () => temporary(dir => {
  const input = path.join(dir, 'synthetic.json');
  const data = fixture();
  const second = structuredClone(data.groups[0]);
  second.id = 'second';
  data.groups.push(second);
  writeFileSync(input, JSON.stringify(data));
  const invoke = (...args) => run('--input', input, ...args);
  assert.equal(run('--help').status, 0);
  const list = invoke('--list');
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stdout.trim().split('\n').length, 2);
  const all = invoke('--format', 'json');
  assert.equal(all.status, 0, all.stderr);
  assert.equal(JSON.parse(all.stdout).groups.length, 2);
  const json = invoke('--group', 'sample', '--format', 'json');
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout).groups.map(g => g.id), ['sample']);
  const md = invoke('--group', 'sample');
  assert.equal(md.status, 0, md.stderr);
  assert.ok(md.stdout.includes('| Water 水 | 1 | 1/3 | 33.33% |'));
  assert.ok(!md.stdout.includes('(second)'));
  const two = invoke('--group', 'second', '--group', 'sample', '--format', 'json');
  assert.deepEqual(JSON.parse(two.stdout).groups.map(g => g.id), ['sample', 'second']);
}));

test('CLI reports invalid options and files without partial stdout', () => temporary(dir => {
  const input = path.join(dir, 'synthetic.json');
  writeFileSync(input, JSON.stringify(fixture()));
  for (const args of [['--group'], ['--format', 'csv'], ['--unknown'], ['--group', 'missing'], ['--input', '/no/such/group-analysis.json']]) {
    const result = run('--input', input, ...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /group\._analysis:/);
  }
}));

test('clean installations need no local data for help and explain missing input', () => temporary(dir => {
  const scripts = path.join(dir, 'scripts');
  mkdirSync(scripts);
  const isolated = path.join(scripts, 'group._analysis.mjs');
  writeFileSync(isolated, readFileSync(SCRIPT));
  const help = spawnSync(process.execPath, [isolated, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  const missing = spawnSync(process.execPath, [isolated], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /not distributed/);
  assert.match(missing.stderr, /--input/);
}));

test('CLI output files match stdout; input stays unchanged', () => temporary(dir => {
  const input = path.join(dir, 'input.json');
  const output = path.join(dir, 'report.md');
  const content = JSON.stringify(fixture());
  writeFileSync(input, content);
  const expected = run('--input', input);
  const result = run('--input', input, '--output', output);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(output, 'utf8'), expected.stdout);
  assert.equal(readFileSync(input, 'utf8'), content);
}));

test('CLI refuses overwriting input directly, through a symlink, or through a hard link', () => temporary(dir => {
  const input = path.join(dir, 'input.json');
  const symlink = path.join(dir, 'alias.json');
  const hardlink = path.join(dir, 'hardlink.json');
  const content = JSON.stringify(fixture());
  writeFileSync(input, content);
  symlinkSync(input, symlink);
  linkSync(input, hardlink);
  for (const output of [input, symlink, hardlink]) {
    const result = run('--input', input, '--output', output);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot overwrite/);
    assert.equal(readFileSync(input, 'utf8'), content);
  }
}));

test('CLI validates before writing and fails clearly on malformed JSON', () => temporary(dir => {
  const input = path.join(dir, 'invalid.json');
  const output = path.join(dir, 'report.md');
  writeFileSync(output, 'keep this report');
  for (const content of ['{bad json', JSON.stringify({ groups: [] })]) {
    writeFileSync(input, content);
    const result = run('--input', input, '--output', output);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(output, 'utf8'), 'keep this report');
  }
}));
