import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { spawnAsync, runLatexmkWithProgress } = require("./subprocess.js");
const { jobContext } = require("./jobContext.js");
const logger = { info: vi.fn(), warn: vi.fn() };
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Run actual processes: mocking spawn would miss orphaned compiler children.
describe("subprocess lifecycle", () => {
  it("retains bounded output, reports command failures, and rejects pre-cancelled work", async () => {
    const result = await spawnAsync(process.execPath, ["-e", "console.log('abcdefghij'); console.error('problem'); process.exitCode=2"], { logger, maxOutput: 5 });
    expect(result).toMatchObject({ success: false, code: 2, stdout: "abcde", stderr: "probl" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(spawnAsync(process.execPath, ["-e", "process.exit(0)"], { logger, signal: controller.signal })).rejects.toThrow("cancelled");
    const missing = await spawnAsync("carrel-command-that-does-not-exist", [], { logger });
    expect(missing.success).toBe(false);
  });

  it("kills children after a disconnected parent exits with closed stdio", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "carrel-process-"));
    const heartbeat = path.join(dir, "heartbeat");
    let childPid = 0;
    const controller = new AbortController();
    const childCode = `const fs=require('fs'); process.on('SIGTERM',()=>{}); setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'x'),10); process.send('ready');`;
    const parentCode = `const {spawn}=require('child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:['ignore','ignore','ignore','ipc']}); child.on('message',()=>console.log('READY:'+child.pid)); setInterval(()=>{},1000);`;
    try {
      const pending = jobContext.run({ signal: controller.signal }, () => spawnAsync(process.execPath, ["-e", parentCode], {
        logger, timeout: 5000,
        onStdout(text: string) {
          const match = text.match(/READY:(\d+)/);
          if (match) { childPid = Number(match[1]); controller.abort(new Error("disconnected")); }
        },
      }));
      await expect(pending).rejects.toThrow("disconnected");
      expect(childPid).toBeGreaterThan(0);
      await delay(50);
      const before = await readFile(heartbeat, "utf8").catch(() => "");
      await delay(100);
      expect(await readFile(heartbeat, "utf8").catch(() => "")).toBe(before);
    } finally {
      if (childPid) { try { process.kill(childPid, "SIGKILL"); } catch { /* already exited */ } }
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("escalates a timeout when both parent and child ignore SIGTERM", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "carrel-timeout-"));
    const heartbeat = path.join(dir, "heartbeat");
    let childPid = 0;
    const childCode = `const fs=require('fs'); process.on('SIGTERM',()=>{}); setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'x'),10); console.log('READY:'+process.pid);`;
    const parentCode = `process.on('SIGTERM',()=>{}); require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'}); setInterval(()=>{},1000);`;
    try {
      const result = await spawnAsync(process.execPath, ["-e", parentCode], {
        logger, timeout: 500,
        onStdout(text: string) { const match = text.match(/READY:(\d+)/); if (match) childPid = Number(match[1]); },
      });
      expect(result).toMatchObject({ success: false, timedOut: true });
      expect(childPid).toBeGreaterThan(0);
      await delay(50);
      const before = await readFile(heartbeat, "utf8");
      await delay(100);
      expect(await readFile(heartbeat, "utf8")).toBe(before);
    } finally {
      if (childPid) { try { process.kill(childPid, "SIGKILL"); } catch { /* already exited */ } }
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it("preserves compiler arguments and detects progress split across output chunks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "carrel-latex-"));
    try {
      const executable = path.join(dir, "latexmk");
      await writeFile(executable, `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2))); process.stdout.write("Latexmk: applying ru"); setTimeout(()=>process.stdout.write("le 'pdflatex'\\nLatexmk: applying rule 'biber main'\\n"),20);`);
      await chmod(executable, 0o755);
      vi.stubEnv("PATH", `${dir}:${process.env.PATH}`);
      const progress = vi.fn();
      const result = await runLatexmkWithProgress("-pdf", "main.tex", { cwd: dir, logger, recorder: true, auxdir: "aux", outdir: "out", onProgress: progress });
      expect(result.success).toBe(true);
      const args = JSON.parse(result.log.split("\n")[0]);
      expect(args).toContain("-bibtex");
      expect(args).toContain("-recorder");
      expect(args).toContain("-auxdir=aux");
      expect(args).toContain("-outdir=out");
      expect(progress.mock.calls.map(([message]) => message)).toEqual(["Compiling (pass 1)...", "Running biber..."]);
    } finally {
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
