import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

// Check the referenced projects explicitly. Running tsc --noEmit against the
// solution tsconfig (whose files array is empty) does not check their sources.
const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(root, 'scripts/typecheck-baseline.json');
const diagnostics = new Map();
for (const project of ['tsconfig.app.json', 'tsconfig.node.json']) {
  const configPath = path.join(root, project);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false });
  for (const diagnostic of [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]) {
    const file = diagnostic.file;
    const position = file && diagnostic.start !== undefined
      ? file.getLineAndCharacterOfPosition(diagnostic.start) : undefined;
    const entry = {
      file: file ? path.relative(root, file.fileName).replaceAll('\\', '/') : project,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n').replaceAll(root, '<project>'),
      source: file && position ? file.text.split(/\r?\n/)[position.line].trim() : '',
    };
    const key = JSON.stringify(entry);
    const existing = diagnostics.get(key);
    if (existing) existing.count++;
    else diagnostics.set(key, { ...entry, count: 1 });
  }
}
const current = [...diagnostics.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
if (process.argv.includes('--record-baseline')) {
  fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log(`Recorded ${current.length} existing diagnostic signatures. Review this file before committing.`);
  process.exit(0);
}
if (process.argv.includes('--strict')) {
  if (current.length) console.error(JSON.stringify(current, null, 2));
  process.exit(current.length ? 1 : 0);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const signature = entry => JSON.stringify(entry);
const expected = new Set(baseline.map(signature));
const actual = new Set(current.map(signature));
const added = current.filter(entry => !expected.has(signature(entry)));
const removed = baseline.filter(entry => !actual.has(signature(entry)));
if (added.length) {
  console.error('New or changed TypeScript errors (deployment blocked):');
  console.error(JSON.stringify(added, null, 2));
}
if (removed.length) {
  console.error('The TypeScript baseline has stale entries. Remove resolved entries; do not accept new errors.');
}
if (added.length || removed.length) process.exit(1);
console.log(`All referenced projects checked. No new TypeScript errors; ${baseline.length} existing signatures remain explicitly recorded in scripts/typecheck-baseline.json.`);
