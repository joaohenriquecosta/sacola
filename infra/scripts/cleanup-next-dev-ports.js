// Kills any stale `next dev` process on ports 3000-3004 before running tests.
// Prevents "address already in use" errors when a previous test run crashed.
// Ported from automanews — uses `lsof`/`ss` to find PIDs and SIGTERM them.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PORTS_TO_CLEAN = [3000, 3001, 3002, 3003, 3004];
const projectRoot = path.resolve(__dirname, "..", "..");

if (require.main === module) {
  cleanupNextDevPorts();
}

module.exports = { cleanupNextDevPorts };

function cleanupNextDevPorts() {
  if (process.platform === "win32") {
    return;
  }

  cleanupBySs();
  cleanupByLsof();
}

function cleanupBySs() {
  const ssResult = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });

  if (ssResult.status !== 0 || !ssResult.stdout) {
    return;
  }

  const pids = new Set();
  for (const line of ssResult.stdout.split("\n")) {
    if (!PORTS_TO_CLEAN.some((port) => line.includes(`:${port}`))) continue;
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      pids.add(Number.parseInt(match[1], 10));
    }
  }

  for (const pid of pids) {
    terminateIfNextProcess(pid);
  }
}

function cleanupByLsof() {
  for (const port of PORTS_TO_CLEAN) {
    const lsofResult = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });

    if (lsofResult.status !== 0 || !lsofResult.stdout) continue;

    const pids = lsofResult.stdout
      .trim()
      .split("\n")
      .map((v) => Number.parseInt(v, 10))
      .filter((v) => Number.isInteger(v));

    for (const pid of pids) {
      terminateIfNextProcess(pid);
    }
  }
}

function terminateIfNextProcess(pid) {
  const psResult = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  const command = psResult.stdout?.trim() ?? "";
  const processCwd = getProcessCwd(pid);

  if (!command.includes("next") || !processCwd?.startsWith(projectRoot)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function getProcessCwd(pid) {
  // Linux
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    // macOS fallback: lsof -p <pid> -a -d cwd -F n
    try {
      const result = spawnSync("lsof", ["-p", String(pid), "-a", "-d", "cwd", "-F", "n"], {
        encoding: "utf8",
      });
      for (const line of (result.stdout ?? "").split("\n")) {
        if (line.startsWith("n") && line.length > 1) return line.slice(1);
      }
      return null;
    } catch {
      return null;
    }
  }
}
