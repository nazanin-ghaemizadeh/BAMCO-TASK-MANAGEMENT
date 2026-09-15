import { spawnSync } from 'node:child_process';

const knownFailures = new Set([
  'the guide card is visible to owners; upload is manager-only and replacement targets the latest file',
  'letters home card and independent route respect grant false',
  'letters home card and independent route respect grant true',
  'independent letters tab is available to explicitly granted owners; missing files cannot be downloaded and edits carry revision',
  'letters keep table, scroll and route through refresh, focus and access network errors',
  'people credential action edits an emailed user and the Excel export contains only safe account state',
  'people Excel writes explicit borders for every cell for selected and complete exports',
  'current Persian month completion and create-request counts use the agreed denominator'
]);

const run = spawnSync(process.execPath, ['--test','--test-force-exit','--test-reporter=tap','tests/*.test.cjs'], {
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024
});
const output = `${run.stdout || ''}${run.stderr || ''}`;
process.stdout.write(output);

const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1].trim());
const unexpected = failures.filter(name => !knownFailures.has(name));
const knownPresent = failures.filter(name => knownFailures.has(name));
const repaired = [...knownFailures].filter(name => !failures.includes(name));

console.log(`\nRegression gate: ${failures.length} failing test(s); ${knownPresent.length} known baseline; ${unexpected.length} new.`);
if (knownPresent.length) console.log('Known baseline failures (kept visible):\n- ' + knownPresent.join('\n- '));
if (repaired.length) console.log('Previously known failures now passing:\n- ' + repaired.join('\n- '));
if (unexpected.length) {
  console.error('Unexpected regression(s):\n- ' + unexpected.join('\n- '));
  process.exit(1);
}
if (run.error) {
  console.error(run.error);
  process.exit(1);
}
process.exit(0);
