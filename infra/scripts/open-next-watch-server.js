const fs = require("node:fs");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const runnerPath = path.join(projectRoot, "infra", "scripts", "run-next-watch-server.js");

switch (process.platform) {
  case "darwin":
    openOnMac();
    break;
  case "win32":
    openOnWindows();
    break;
  case "linux":
    openOnLinux();
    break;
  default:
    throw new Error(`Unsupported platform: ${process.platform}`);
}

function openOnMac() {
  const command = buildPosixCommand();

  execFileSync(
    "osascript",
    [
      "-e",
      'tell application id "com.googlecode.iterm2" to activate',
      "-e",
      'tell application id "com.googlecode.iterm2"',
      "-e",
      "  if (count of windows) = 0 then",
      "-e",
      "    create window with default profile",
      "-e",
      "  end if",
      "-e",
      "  tell current window",
      "-e",
      "    tell current session",
      "-e",
      "      set newSession to (split vertically with default profile)",
      "-e",
      `      tell newSession to write text "${escapeAppleScript(command)}"`,
      "-e",
      "    end tell",
      "-e",
      "  end tell",
      "-e",
      "end tell",
    ],
    { stdio: "inherit" },
  );
}

function openOnWindows() {
  const command = buildWindowsCommand();

  if (commandExists("wt")) {
    spawnSync("wt", ["-w", "0", "split-pane", "-V", "cmd", "/k", command], {
      stdio: "inherit",
    });
    return;
  }

  spawnSync("cmd.exe", ["/c", "start", "Next.js Watch Server", "cmd.exe", "/k", command], {
    stdio: "inherit",
  });
}

function openOnLinux() {
  if (isWsl()) {
    spawnDetachedRunner();
    return;
  }

  const command = buildPosixCommand();
  const escapedCommand = escapeSingleQuotes(command);
  const terminalLaunchers = [
    ["gnome-terminal", ["--", "bash", "-lc", command]],
    ["konsole", ["-e", "bash", "-lc", command]],
    ["xfce4-terminal", ["--command", `bash -lc '${escapedCommand}'`]],
    ["x-terminal-emulator", ["-e", `bash -lc '${escapedCommand}'`]],
    ["xterm", ["-e", `bash -lc '${escapedCommand}'`]],
  ];

  for (const [binary, args] of terminalLaunchers) {
    if (!commandExists(binary)) {
      continue;
    }

    spawnSync(binary, args, { stdio: "inherit" });
    return;
  }

  throw new Error(
    "No supported Linux terminal emulator found. Tried gnome-terminal, konsole, xfce4-terminal, x-terminal-emulator, and xterm.",
  );
}

function isWsl() {
  try {
    const version = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    return version.includes("microsoft") || version.includes("wsl");
  } catch {
    return false;
  }
}

function spawnDetachedRunner() {
  const child = spawn(process.execPath, [runnerPath], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function buildPosixCommand() {
  return `cd "${projectRoot}" && "${process.execPath}" "${runnerPath}"`;
}

function buildWindowsCommand() {
  return `cd /d "${projectRoot}" && "${process.execPath}" "${runnerPath}"`;
}

function commandExists(binary) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [binary], { stdio: "ignore" });
  return result.status === 0;
}

function escapeAppleScript(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `'\\''`);
}
