# Testes e ferramentas

O papel de `scripts/`, do complemento, do `e2e/`, das skills do repositório, do CI e do `preview/`, em uma frase. Lido sob demanda, não em toda sessão. Os arquivos da extensão estão em [extensao.md](extensao.md).

A regra `indice-de-arquivos` exige uma linha, aqui ou em `extensao.md`, para cada arquivo novo da raiz, de `lib/`, de `veio/` e do topo de `scripts/`, e acusa a linha que cita um arquivo que não existe mais.

| File | Role |
|------|------|
| `scripts/atualizar-extensao.sh`, `scripts/com.perpetualminer.atualizar.plist.exemplo` | Keeps an unpacked clone on `main` up to date, and the launchd example that schedules it. |
| `scripts/empacotar-extensao.mjs`, `scripts/arquivos-do-pacote.js` | Builds the Web Store zip, and says which files ship. |
| `scripts/testes.json`, `scripts/testar.mjs`, `scripts/grupos-de-teste.js`, `scripts/arquivos-em-paralelo.js`, `scripts/unittest-em-paralelo.js`, `scripts/test_testar.mjs` | The test groups and the runner CI calls for every job. |
| `scripts/preparar-python.sh` | Makes the Python venv of the engine tests. |
| `scripts/gerar-catalogo-da-voz.js`, `scripts/conferir-voz.js`, `scripts/voz-do-catalogo.js` | Generates and checks the derived copies of the Voice catalog. |
| `scripts/yaml-de-workflow.js` | Reads workflow YAML for the CI tests. |
| `scripts/ci/` | The code the workflows run: required checks, the green commit, the PR body checks (and the sensitive paths that make a PR ALTA), the lint and dependency audit of what a change adds, the test selection. |
| `scripts/ganchos/` | The size limit hook (`scripts/ganchos/LEIA-ME.md`). |
| `scripts/regras/` | The review rules a script can check, one file per rule (the secret, binary and debug locks among them), with the baseline and the proofs (`node scripts/regras/verificar.js --help`). |
| `scripts/qualidade/`, `.qlty/qlty.toml` | The second, informative opinion on Code Health. |
| `complemento/` | The Conexão com o Anki as an Anki add-on (`complemento/LEIA-ME.md`). |
| `e2e/` | The Playwright suite that runs the unpacked extension in Chromium (`docs/testes.md`, skill `e2e-suite`). |
| `e2e/estado-final.js` | `estadoFinal`: the e2e check of what ended up stored after a test acts. |
| `e2e/relogio-parado.js` | `pararRelogio`: the one place that sets up the test clock. |
| `e2e/fontconfig/fonts.conf` | The only fonts the test Chromium sees, so the visual references render the same everywhere. |
| `.agents/skills/verify-perpetualminer/` | The skill that drives and proves the extension through the e2e harness, with the feature map. |
| `.github/workflows/` | One workflow per job; each test job calls `node scripts/testar.mjs <group>`. |
| `preview/`, `vercel.json` | The static preview site Vercel publishes, copied from the repository files. |
