import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const whisperEntry = join(projectRoot, "whisper-service", "server.mjs");
const viteArgs = [viteEntry, "--configLoader", "runner", ...process.argv.slice(2)];

const whisper = spawn(process.execPath, [whisperEntry], {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true,
});

const vite = spawn(process.execPath, viteArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true,
});

const stopChild = (child) => {
  if (child.exitCode === null && !child.killed) child.kill();
};

const shutdown = () => {
  stopChild(vite);
  stopChild(whisper);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

vite.on("exit", (code) => {
  stopChild(whisper);
  process.exitCode = code ?? 0;
});

