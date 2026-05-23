import { execSync, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTS = [3001, 5173];

function killPort(port) {
  try {
    const output = execSync("netstat -ano", { encoding: "utf-8" });
    const lines = output.split("\n").filter((l) => l.includes(`:${port} `) && l.includes("LISTENING"));
    const pids = [...new Set(lines.map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      if (pid === "0") continue;
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`    端口 ${port} -> 已停止 PID=${pid}`);
      } catch {}
    }
  } catch {}
}

console.log("==> 停止现有服务...");
for (const port of PORTS) killPort(port);

console.log("\n==> 启动 server (tsx watch)...");
const server = spawn("npx", ["tsx", "watch", "src/index.ts"], {
  cwd: path.join(__dirname, "apps", "server"),
  stdio: "inherit",
  shell: true,
});

console.log("==> 启动 web (vite)...");
const web = spawn("npx", ["vite"], {
  cwd: path.join(__dirname, "apps", "web"),
  stdio: "inherit",
  shell: true,
});

function cleanup() {
  server.kill();
  web.kill();
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
server.on("exit", () => web.kill());
web.on("exit", () => server.kill());
