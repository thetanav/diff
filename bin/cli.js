#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

async function main() {
  const args = process.argv.slice(2);
  const pr = args[0] || "";

  const bun = hasBun();
  if (!bun) {
    console.error("Error: webdiff requires Bun (https://bun.sh) to run.");
    process.exit(1);
  }

  if (!existsSync(resolve(root, "dist"))) {
    console.log("Building frontend…");
    execSync("bun run build", { cwd: root, stdio: "inherit" });
  }

  const PORT = process.env.PORT || "3000";
  const env = {
    ...process.env,
    PORT,
    ...(pr ? { WEBDIFF_PR: pr } : {}),
  };

  console.log(`Starting webdiff server on http://localhost:${PORT} …`);
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

  console.log(`Opening ${url}`);
  openBrowser(url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
