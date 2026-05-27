#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const VERSION = pkg.version;

function hasBun() {
  try {
    execSync("bun --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true });
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  }
}

function waitForPort(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = createServer();
      sock.once("error", () => {
        sock.close();
        resolve();
      });
      sock.once("listening", () => {
        sock.close();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(check, 200);
        }
      });
      sock.listen(port);
    }
    check();
  });
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function help() {
  console.log(`
${bold("webdiff")} ${dim(`v${VERSION}`)} — A fast, compact PR diff viewer

${bold("Usage")}
  ${green("npx webdiff")} ${cyan("<pr-url|owner/repo#123>")}    ${dim("Open a PR diff")}
  ${green("npx webdiff")} ${cyan("--help")}                      ${dim("Show this help")}
  ${green("npx webdiff")} ${cyan("--version")}                   ${dim("Show version")}

${bold("Options")}
  ${cyan("--version, -v")}    Print version
  ${cyan("--help, -h")}       Print this help

${bold("Environment")}
  ${dim("PORT")}              Server port ${dim("(default: 3000)")}
  ${dim("GITHUB_TOKEN")}      GitHub API token ${dim("(falls back to gh auth token)")}

${bold("Examples")}
  ${dim("$")} ${green("npx webdiff")} ${cyan("https://github.com/owner/repo/pull/123")}
  ${dim("$")} ${green("npx webdiff")} ${cyan("owner/repo#123")}
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    help();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`v${VERSION}`);
    return;
  }

  const pr = args[0] || "";

  const bun = hasBun();
  if (!bun) {
    console.error(`${red("Error:")} webdiff requires ${bold("Bun")} (https://bun.sh) to run.`);
    process.exit(1);
  }

  if (!existsSync(resolve(root, "dist"))) {
    console.log(`${dim("→")} Building frontend…`);
    execSync("bun run build", { cwd: root, stdio: "inherit" });
  }

  const PORT = process.env.PORT || "3000";
  const env = {
    ...process.env,
    PORT,
    ...(pr ? { WEBDIFF_PR: pr } : {}),
  };

  console.log(`${dim("→")} Starting webdiff server on ${bold(`http://localhost:${PORT}`)} …`);
  const server = spawn("bun", ["run", "server.ts"], {
    cwd: root,
    env,
    stdio: "inherit",
  });

  server.on("exit", (code) => process.exit(code ?? 1));

  process.on("SIGINT", () => server.kill());
  process.on("SIGTERM", () => server.kill());

  await waitForPort(Number(PORT));

  const url = pr
    ? `http://localhost:${PORT}/#${encodeURIComponent(pr)}`
    : `http://localhost:${PORT}`;

  console.log(`${dim("→")} Opening ${bold(url)}`);
  openBrowser(url);
}

main().catch((err) => {
  console.error(`${red("Error:")} ${err.message}`);
  process.exit(1);
});
