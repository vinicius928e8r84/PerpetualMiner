import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const sha256 = arquivo => createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
const { version } = JSON.parse(fs.readFileSync(path.join(AQUI, 'node_modules/xstate/package.json'), 'utf8'));

let iguais = true;
for (const arquivo of ['xstate.umd.min.js', 'xstate-fsm.umd.min.js']) {
  const doNpm = path.join(AQUI, 'node_modules/xstate/dist', arquivo);
  const daPasta = path.join(AQUI, 'vendor', arquivo);
  const igual = sha256(doNpm) === sha256(daPasta);
  iguais &&= igual;
  console.log(`${igual ? 'igual   ' : 'DIFERENTE'} vendor/${arquivo}: ${fs.statSync(daPasta).size} bytes, sha256 ${sha256(daPasta)} (xstate ${version} do npm)`);
}
process.exit(iguais ? 0 : 1);
