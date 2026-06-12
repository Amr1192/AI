/**
 * Free API ports on Windows before restart (8000 HTTP, 8081 WebSocket).
 * Orphan node.exe processes often survive Ctrl+C with tsx watch.
 */
import { execSync } from 'node:child_process';

const PORTS = [8000, 8081];

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Stopped process ${pid} (port ${port})`);
      } catch {
        // already gone
      }
    }
    if (pids.size === 0) {
      console.log(`Port ${port} is free`);
    }
  } catch {
    console.log(`Port ${port} is free`);
  }
}

for (const port of PORTS) {
  killPort(port);
}
