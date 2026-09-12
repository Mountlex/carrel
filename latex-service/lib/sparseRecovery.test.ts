import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("recovers more than five newly introduced inputs using a full checkout", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "carrel-sparse-test-")));
  const repo = path.join(root, "source");
  const bin = path.join(root, "bin");
  await mkdir(repo);
  await mkdir(bin);
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const serviceDir = fileURLToPath(new URL("..", import.meta.url));
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;

  await writeFile(path.join(repo, "main.tex"), "\\documentclass{article}\n\\begin{document}\n" +
    Array.from({ length: 7 }, (_, i) => `\\input{section${i}.tex}`).join("\n") + "\n\\end{document}\n");
  for (let i = 0; i < 7; i++) await writeFile(path.join(repo, `section${i}.tex`), `Section ${i}.\n`);
  execFileSync(git, ["init", "-b", "main", repo]);
  execFileSync(git, ["-C", repo, "add", "."]);
  execFileSync(git, ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
  // Keep HTTP URL validation and real Git sparse-checkout behavior in the test.
  await writeFile(path.join(bin, "git"), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');
const args=process.argv.slice(2).map(a=>a==='https://example.com/fixture.git'?${JSON.stringify(repo)}:a);
const r=spawnSync(${JSON.stringify(git)},args,{stdio:'inherit'});process.exit(r.status??1);\n`, { mode: 0o755 });
  // Model TeX stopping at the first missing input without requiring TeX in CI.
  // CARREL_TEST_REAL_TEX=1 runs the same regression with the installed latexmk.
  if (process.env.CARREL_TEST_REAL_TEX !== "1") {
    await writeFile(path.join(bin, "latexmk"), `#!${process.execPath}\nconst fs=require('node:fs');
for(let i=0;i<7;i++){if(!fs.existsSync('section'+i+'.tex')){
 const log="! I can't find file 'section"+i+".tex'.";fs.writeFileSync('main.log',log);console.log(log);process.exit(1);
}}
fs.writeFileSync('main.pdf','%PDF-1.4\\nfixture');console.log('Output written on main.pdf');\n`, { mode: 0o755 });
  }
  const server = spawn(process.execPath, ["server.js"], {
    cwd: serviceDir,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PORT: String(port),
      WORK_DIR: path.join(root, "work"), NODE_ENV: "production", LATEX_SERVICE_API_KEY: "test-key",
      LATEX_CACHE_ALLOWED: "off", LATEX_PERSIST_WORKDIR: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Service did not start: ${logs}`)), 5000);
      server.stdout.on("data", () => {
        if (logs.includes("service running")) { clearTimeout(timer); resolve(); }
      });
      server.once("error", error => { clearTimeout(timer); reject(error); });
    });
    const response = await fetch(`${url}/compile-from-git`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": "test-key" },
      body: JSON.stringify({ gitUrl: "https://example.com/fixture.git", branch: "main", target: "main.tex",
        compiler: "pdflatex", knownDependencies: ["main.tex"] }),
      signal: AbortSignal.timeout(45000),
    });
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.status, body.toString().slice(-2000)).toBe(200);
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(logs).toContain("Sparse recovery incomplete; checking out the full repository");
    expect(logs.match(/Sparse checkout updated/g)).toHaveLength(5);
  } finally {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    await stopped;
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
