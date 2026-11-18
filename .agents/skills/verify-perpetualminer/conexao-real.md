# Driving against the real Conexão

Part of [`SKILL.md`](./SKILL.md) (launch, doctor, drive, evidence, cleanup are there).

The ordinary specs talk to `fakes.anki`, a JavaScript copy of the Conexão. For a change to the key, the account or any route that carries state, also drive the real Python owner and its HTTP, outside Anki. `scripts/conexao-real.py` starts `complemento.servidor.Conexao` on a free port with the repo's fake OpenAI and Firestore and the two e2e test browsers already paired (the fixture's `extensao` is paired by default, #192), and writes `{porta, pasta}` to the file you name (`pasta` is the `user_files` inside a `conexao-real-*` folder of the temp dir). It proves the real Python owner and HTTP, not Anki, OpenAI or Firestore.

```bash
PRONTO=/tmp/conexao-<run-id>.json    # outside the run directory: drive.sh refuses files in evidence/
python3.9 .agents/skills/verify-perpetualminer/scripts/conexao-real.py "$PWD" "$PRONTO" & PID=$!   # also python3.13
until [ -s "$PRONTO" ] || ! kill -0 $PID; do sleep 0.2; done
PM_CONEXAO_REAL="$PRONTO" .agents/skills/verify-perpetualminer/scripts/drive.sh <run-id> zz-scratch-<run-id>.spec
PASTA="$(python3 -c 'import json, os, sys; print(os.path.dirname(json.load(open(sys.argv[1]))["pasta"]))' "$PRONTO")"
kill $PID; rm -rf "$PRONTO" "$PASTA"    # PASTA is the conexao-real-* folder
```

The spec is a scratch one (`e2e/tests/zz-scratch-<run-id>.spec.js`, delete it before committing); it sends the panel's `127.0.0.1:8766` requests to that port:

```js
const fs = require('fs'), path = require('path');
const { test, expect } = require('../fixtures');
const { fotografar } = require('../evidencias-mineracao');
const { porta, pasta } = JSON.parse(fs.readFileSync(process.env.PM_CONEXAO_REAL, 'utf8'));
test('real Conexão: colar a chave grava o dono no cofre real, com conta vazia e revisão 1', async ({ page, context, extensao }) => {
  await context.route(/^http:\/\/(127\.0\.0\.1|localhost):8766\//,
    route => route.continue({ url: route.request().url().replace(/:8766\//, `:${porta}/`) }));
  await page.goto(extensao.url('painel.html#configuracoes/ia'));
  const card = page.locator('#cfg-ia');
  await card.getByRole('textbox', { name: 'Chave da OpenAI' }).fill('sk-proj-chave-de-exemplo-9f3a');
  await card.getByRole('button', { name: 'Conferir e salvar' }).click();
  await expect(card.locator('.cfg-resumo')).toHaveText('••••••••9f3a');
  await fotografar(page, 'conexao-real-colar.png');
  const dono = JSON.parse(fs.readFileSync(path.join(pasta, 'chaves', 'openai.json'), 'utf8'));
  expect({ conta: dono.conta, versao: dono.versao, naoEnviada: dono.naoEnviada, fim: dono.chave.slice(-4) })
    .toEqual({ conta: '', versao: 1, naoEnviada: true, fim: '9f3a' });
  expect((fs.statSync(path.join(pasta, 'chaves', 'openai.json')).mode & 0o777).toString(8)).toBe('600');
});
```

A second Chromium profile (the `K1:` test in `chave-autoridade.spec.js` launches one) needs the same `route` on its own context. For a rest check, read the key file's `versao` every few seconds for 60 s with both profiles open: against the real Conexão it moved once (B's sign-in took the owner from a synced A: 1 → 2) and then stayed.

Traps the hand-made harnesses fell into:

- **`pasta_de_dados.preparar`** must run before the Conexão starts: without it the key folder is missing and every save is a 500 (`FileNotFoundError: …/chaves/openai.json.novo`, and the screen says "Sem chave"). The script does it.
- **The fakes answer only inside the `with`** (`OpenAIDeMentira`, `FirestoreDeMentira`); a Conexão started after the block ends gets connection refused.
- **Seed old-store state through the service worker before opening the panel**, never with the panel already open: the panel reads it when it loads.
- **A reload is `page.reload()`**: `page.goto` to the same `#` address does not reload.
- **Read the key file only by its last 4 characters** (`dono.chave.slice(-4)`), and never print or save the whole value.
- **Fake keys only.** The fake OpenAI accepts any well-formed one; a real key must never reach this script.
