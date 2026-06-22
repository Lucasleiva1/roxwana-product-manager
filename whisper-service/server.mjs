import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const whisperRoot = join(
  projectRoot,
  "src-tauri",
  "resources",
  "whisper",
  "windows-x64",
);
const releaseDir = join(whisperRoot, "Release");
const executable = join(releaseDir, "whisper-cli.exe");
const model = join(whisperRoot, "ggml-base-q5_1.bin");
const port = Number(process.env.ROXWANA_WHISPER_PORT || 8765);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Whisper-Language, X-Whisper-Context",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function hasAudibleSpeech(wav) {
  if (wav.length < 46) return false;
  let energy = 0;
  let samples = 0;
  for (let offset = 44; offset + 1 < wav.length; offset += 2) {
    energy += Math.abs(wav.readInt16LE(offset));
    samples += 1;
  }
  return samples > 0 && energy / samples > 180;
}

function runWhisper(audioPath, outputBase, language, context) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      executable,
      [
        "-m",
        model,
        "-f",
        audioPath,
        "-l",
        language || "es",
        "-otxt",
        "-nt",
        "-of",
        outputBase,
        "--prompt",
        context.slice(-500),
      ],
      { cwd: releaseDir, windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(stderr || `Whisper finalizó con código ${code}`));
    });
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, headers);
    response.end(JSON.stringify({ ready: true, engine: "whisper.cpp", model: "base-q5_1" }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/transcribe") {
    response.writeHead(404, headers);
    response.end(JSON.stringify({ error: "Ruta no encontrada" }));
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const workDir = await mkdtemp(join(tmpdir(), "roxwana-whisper-"));
  const audioPath = join(workDir, "voice.wav");
  const outputBase = join(workDir, "transcript");
  try {
    const wav = Buffer.concat(chunks);
    if (!hasAudibleSpeech(wav)) {
      response.writeHead(200, headers);
      response.end(JSON.stringify({ text: "", language: "es" }));
      return;
    }
    await writeFile(audioPath, wav);
    const language = String(request.headers["x-whisper-language"] || "es");
    const context = decodeURIComponent(String(request.headers["x-whisper-context"] || ""));
    await runWhisper(audioPath, outputBase, language, context);
    const text = (await readFile(`${outputBase}.txt`, "utf8")).trim();
    response.writeHead(200, headers);
    response.end(JSON.stringify({ text, language }));
  } catch (error) {
    response.writeHead(500, headers);
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ROXWANA Whisper listo en http://127.0.0.1:${port}`);
});
