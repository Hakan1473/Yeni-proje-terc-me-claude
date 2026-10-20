import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Entry point kept at the project root for AI Studio compatibility.
// If started with plain `node server.ts` without the tsx loader, re-spawn with `--import tsx`
const isTsx = process.env.__TSX_ACTIVE === '1' || process.execArgv.some((a) => a.includes('tsx'));

if (!isTsx) {
  const currentFile = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, ['--import', 'tsx', currentFile, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, __TSX_ACTIVE: '1' },
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
} else {
  await import('./server/index');
}
