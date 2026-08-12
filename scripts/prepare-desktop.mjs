#!/usr/bin/env node
/**
 * Prepares Next.js standalone + portable Node for the Tauri desktop bundle.
 * Run via: npm run desktop:prepare  (also used by tauri:build)
 *
 * Build the Windows installer ON a Windows machine (WebView2 + MSVC tools required).
 */
import { execSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  chmodSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const resources = join(root, "src-tauri", "resources");
const serverOut = join(resources, "server");
const NODE_VERSION = "20.18.1";

function log(msg) {
  console.log(`[desktop:prepare] ${msg}`);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function download(url, dest) {
  log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function extractZip(zipPath, destDir) {
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}'"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
  }
}

async function fetchPortableNode() {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const arch =
    process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
  if (!arch) throw new Error(`Unsupported arch: ${process.arch}`);

  let platformFolder;
  let archiveName;
  let nodeBinaryRel;

  if (isWin) {
    platformFolder = `node-v${NODE_VERSION}-win-${arch}`;
    archiveName = `${platformFolder}.zip`;
    nodeBinaryRel = join(platformFolder, "node.exe");
  } else if (isMac) {
    platformFolder = `node-v${NODE_VERSION}-darwin-${arch}`;
    archiveName = `${platformFolder}.tar.gz`;
    nodeBinaryRel = join(platformFolder, "bin", "node");
  } else {
    platformFolder = `node-v${NODE_VERSION}-linux-${arch}`;
    archiveName = `${platformFolder}.tar.xz`;
    nodeBinaryRel = join(platformFolder, "bin", "node");
  }

  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
  const tmpDir = join(resources, "_node_tmp");
  const archivePath = join(tmpDir, archiveName);
  ensureDir(tmpDir);

  const nodeDest = join(resources, isWin ? "node.exe" : "node");
  if (existsSync(nodeDest)) {
    log(`Portable Node already present: ${nodeDest}`);
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  await download(url, archivePath);

  if (archiveName.endsWith(".zip")) {
    extractZip(archivePath, tmpDir);
  } else if (archiveName.endsWith(".tar.xz")) {
    execSync(`tar -xJf "${archivePath}" -C "${tmpDir}"`, { stdio: "inherit" });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: "inherit" });
  }

  const extracted = join(tmpDir, nodeBinaryRel);
  if (!existsSync(extracted)) {
    throw new Error(`Node binary not found after extract: ${extracted}`);
  }
  copyFileSync(extracted, nodeDest);
  if (!isWin) chmodSync(nodeDest, 0o755);
  rmSync(tmpDir, { recursive: true, force: true });
  log(`Portable Node ready: ${nodeDest}`);
}

function stageStandalone() {
  const standalone = join(root, ".next", "standalone");
  if (!existsSync(standalone)) {
    throw new Error("Missing .next/standalone — run `next build` first");
  }

  rmSync(serverOut, { recursive: true, force: true });
  ensureDir(serverOut);
  cpSync(standalone, serverOut, { recursive: true });

  const staticSrc = join(root, ".next", "static");
  const staticDest = join(serverOut, ".next", "static");
  if (existsSync(staticSrc)) {
    ensureDir(dirname(staticDest));
    cpSync(staticSrc, staticDest, { recursive: true });
  }

  const publicSrc = join(root, "public");
  if (existsSync(publicSrc)) {
    cpSync(publicSrc, join(serverOut, "public"), { recursive: true });
  }

  const envSrc = existsSync(join(root, ".env"))
    ? join(root, ".env")
    : existsSync(join(root, ".env.local"))
      ? join(root, ".env.local")
      : null;

  if (!envSrc) {
    throw new Error(
      "No .env or .env.local found. Desktop build needs Supabase/DB env vars."
    );
  }
  copyFileSync(envSrc, join(serverOut, ".env"));
  log(`Staged server + env from ${envSrc}`);
}

function writeLoadingPage() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payroll</title>
  <style>
    html,body{height:100%;margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#F3F4F6;color:#111827}
    .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
    h1{font-size:1.5rem;margin:0;font-weight:800}
    p{margin:0;color:#4B5563}
    .spin{width:28px;height:28px;border:3px solid #E5E7EB;border-top-color:#3B82F6;border-radius:50%;animation:s .7s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="spin"></div>
    <h1>Payroll</h1>
    <p>Starting desktop server…</p>
  </div>
</body>
</html>`;
  writeFileSync(join(resources, "loading.html"), html);
}

async function main() {
  ensureDir(resources);
  log("Generating Prisma client…");
  execSync("npx prisma generate", { cwd: root, stdio: "inherit", env: process.env });
  log("Building Next.js (standalone)…");
  execSync("npx next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DESKTOP_BUILD: "1" },
  });
  stageStandalone();
  await fetchPortableNode();
  writeLoadingPage();
  log("Desktop resources ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
