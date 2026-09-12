// Runs inside the production image during the Docker build. Uses only local
// fixtures: no customer repositories, API keys, or external network access.
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

async function main() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'carrel-image-smoke-')));
  const repo = path.join(root, 'source');
  const bin = path.join(root, 'bin');
  await fs.mkdir(repo);
  await fs.mkdir(bin);
  const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, PORT: String(port), WORK_DIR: path.join(root, 'work'),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`, NODE_ENV: 'production',
    LATEX_SERVICE_API_KEY: 'local-smoke-key', LATEX_CACHE_ALLOWED: 'aux', LATEX_PERSIST_WORKDIR: 'on' };
  await fs.writeFile(path.join(bin, 'git'), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');
const args=process.argv.slice(2).map(a=>a==='https://example.com/smoke.git'?${JSON.stringify(repo)}:a);
const result=spawnSync(${JSON.stringify(git)},args,{stdio:'inherit'});process.exit(result.status??1);\n`, { mode: 0o755 });
  const gitCommand = args => execFileSync(git, ['-C', repo, ...args], { stdio: 'pipe' });
  const commit = () => {
    gitCommand(['add', '.']);
    gitCommand(['-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.com', 'commit', '-m', 'fixture']);
  };
  gitCommand(['init', '-b', 'main']);
  await fs.writeFile(path.join(repo, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nOriginal content.\n\\end{document}\n');
  commit();
  let logs = '';
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = data => { logs = (logs + data).slice(-100000); };
  server.stdout.on('data', append);
  server.stderr.on('data', append);
  const exited = once(server, 'exit');
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service startup timed out')), 15000);
      server.stdout.on('data', () => {
        if (logs.includes('service running')) { clearTimeout(timeout); resolve(); }
      });
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Service exited: ${code}`)); });
    });
    const request = async (endpoint, body) => {
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': env.LATEX_SERVICE_API_KEY },
        body: JSON.stringify(body), signal: AbortSignal.timeout(570000),
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      assert.equal(res.status, 200, `${endpoint}: ${buffer.toString().slice(-3000)}`);
      return { buffer, dependencies: JSON.parse(res.headers.get('X-Dependencies') || '[]') };
    };
    const compile = async (compiler, knownDependencies) => {
      const result = await request('/compile-from-git', {
        gitUrl: 'https://example.com/smoke.git', branch: 'main', target: 'main.tex', compiler,
        paperId: `image-smoke-${compiler}`, cacheMode: 'aux', knownDependencies,
      });
      assert.equal(result.buffer.subarray(0, 5).toString(), '%PDF-');
      return result;
    };
    const initial = await compile('pdflatex', ['main.tex']);
    // Reorganize the paper after dependency caching: exceed the old five-input
    // limit, with a bibliography that must also survive a cold/full checkout.
    await fs.writeFile(path.join(repo, 'main.tex'), '\\documentclass{article}\n\\begin{document}\n' +
      Array.from({ length: 7 }, (_, i) => `\\input{section${i}.tex}`).join('\n') +
      '\nA citation~\\cite{smoke}.\\bibliographystyle{plain}\\bibliography{references}\n\\end{document}\n');
    for (let i = 0; i < 7; i++) await fs.writeFile(path.join(repo, `section${i}.tex`), `New section ${i}.\n`);
    await fs.writeFile(path.join(repo, 'references.bib'), '@book{smoke,author={Smoke Author},title={Verified Bibliography},year={2026},publisher={Test}}\n');
    commit();
    const updated = await compile('pdflatex', initial.dependencies);
    assert.match(logs, /Sparse recovery incomplete; checking out the full repository/);
    for (let i = 0; i < 7; i++) assert.ok(updated.dependencies.includes(`section${i}.tex`), `Missing dependency section${i}`);
    assert.ok(updated.dependencies.includes('references.bib'), 'Bibliography missing from dependency list');
    for (const compiler of ['pdflatex', 'xelatex', 'lualatex']) {
      const { buffer } = await compile(compiler, updated.dependencies);
      const pdfPath = path.join(root, `${compiler}.pdf`);
      await fs.writeFile(pdfPath, buffer);
      const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
      assert.match(text, /New section 6/);
      assert.match(text, /Verified Bibliography/);
      const thumbnail = await request('/thumbnail', { pdfBase64: buffer.toString('base64'), width: 200 });
      assert.equal(thumbnail.buffer.subarray(1, 4).toString(), 'PNG');
      console.log(`Verified ${compiler}: updated inputs, bibliography, PDF text, thumbnail`);
    }
    const health = await fetch(`http://127.0.0.1:${port}/health`).then(res => res.json());
    assert.equal(health.status, 'ok');
    assert.equal(health.queue.running, 0);
    assert.equal(health.queue.queued, 0);
    console.log('Production image smoke tests passed');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (server.exitCode === null) server.kill('SIGTERM');
    const killTimer = setTimeout(() => server.kill('SIGKILL'), 32000);
    await exited;
    clearTimeout(killTimer);
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
