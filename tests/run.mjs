// Sobe o servidor, roda os scripts pedidos em sequência e encerra.
// spawn assíncrono: o servidor roda neste mesmo processo e precisa do event loop livre.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';

const run = (script) => new Promise((ok) => {
  spawn(process.execPath, [script], { stdio: 'inherit', cwd: fileURLToPath(new URL('.', import.meta.url)) })
    .on('exit', (code) => ok(code));
});

const server = await start();
let falhou = false;
for (const script of process.argv.slice(2)) {
  console.log(`\n▶ ${script}`);
  if ((await run(script)) !== 0) falhou = true;
}
server.close();
process.exit(falhou ? 1 : 0);
