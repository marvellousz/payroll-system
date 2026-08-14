const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

let mainWindow = null;
let serverProcess = null;

function isDev() {
  return !app.isPackaged;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 640,
    title: "Payroll",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, "loading.html"));
  return win;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 47821;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function waitForPort(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Server did not start on port ${port}`));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function findServerJs(dir, depth = 0) {
  if (!dir || depth > 8 || !fs.existsSync(dir)) return null;
  const direct = path.join(dir, "server.js");
  if (fs.existsSync(direct)) return direct;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const found = findServerJs(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

function loadDotenv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "PORT" || key === "HOSTNAME" || key === "HOST" || key === "NODE_ENV") continue;
    out[key] = val;
  }
  return out;
}

function resourceCandidates() {
  if (isDev()) {
    return [path.join(__dirname, "resources")];
  }
  return [
    path.join(process.resourcesPath, "app-server"),
    path.join(process.resourcesPath, "resources"),
    process.resourcesPath,
  ];
}

function resolveRuntime() {
  const nodeName = process.platform === "win32" ? "node.exe" : "node";
  const attempts = [];
  for (const root of resourceCandidates()) {
    const node = path.join(root, nodeName);
    const serverJs =
      findServerJs(path.join(root, "server")) || findServerJs(root);
    attempts.push({ root, node, serverJs });
    if (fs.existsSync(node) && serverJs) {
      return { node, serverJs, serverDir: path.dirname(serverJs), root };
    }
  }
  const detail = attempts
    .map(
      (a) =>
        `${a.root} → node ${fs.existsSync(a.node) ? "yes" : "no"}, server.js ${a.serverJs || "missing"}`
    )
    .join("\n");
  throw new Error(`Bundled Node/server not found.\n${detail}`);
}

function logPath() {
  return path.join(app.getPath("userData"), "server.log");
}

function appendLog(message) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(logPath(), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    /* ignore */
  }
}

async function startBundledServer() {
  const runtime = resolveRuntime();
  const port = await findFreePort();
  const envFile = path.join(runtime.serverDir, ".env");
  const fileLog = fs.openSync(logPath(), "a");
  appendLog(`Starting ${runtime.node} ${runtime.serverJs} on ${port}`);
  appendLog(`cwd=${runtime.serverDir}`);

  const child = spawn(runtime.node, [runtime.serverJs], {
    cwd: runtime.serverDir,
    env: {
      ...process.env,
      ...loadDotenv(envFile),
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    windowsHide: true,
    stdio: ["ignore", fileLog, fileLog],
  });
  serverProcess = child;
  child.on("exit", (code) => appendLog(`server exited code=${code}`));
  await waitForPort(port, 90_000);
  return port;
}

async function startDevServer() {
  const projectRoot = path.join(__dirname, "..");
  try {
    await waitForPort(3000, 800);
    return 3000;
  } catch {
    appendLog("Dev server not running; starting npm run dev");
    const child = spawn("npm", ["run", "dev"], {
      cwd: projectRoot,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, BROWSER: "none" },
    });
    serverProcess = child;
    await waitForPort(3000, 120_000);
    return 3000;
  }
}

function showFatal(err) {
  const message = err instanceof Error ? err.message : String(err);
  appendLog(`FATAL ${message}`);
  dialog.showErrorBox(
    "Payroll",
    `${message}\n\nLog: ${logPath()}`
  );
}

app.whenReady().then(async () => {
  mainWindow = createWindow();
  try {
    const port = isDev() ? await startDevServer() : await startBundledServer();
    const url = `http://127.0.0.1:${port}`;
    appendLog(`Loading ${url}`);
    await mainWindow.loadURL(url);
  } catch (err) {
    showFatal(err);
  }
});

app.on("window-all-closed", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});
