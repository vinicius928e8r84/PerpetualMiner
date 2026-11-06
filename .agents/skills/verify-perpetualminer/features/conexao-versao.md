# The Conexão com o Anki version notice

The Conexão com o Anki updates itself in silence through AnkiWeb (`complemento/atualizacao.py`, **off by default** until the owner checks the AnkiWeb terms: `ATUALIZACAO_AUTOMATICA`). The extension reads the version and the update from `GET /health` and speaks only in three cases, in a notice at the top of the Painel (#177, BRG-50).

## Sub-features

- `conexao-versao-velha` the Conexão is older than `VERSAO_MINIMA` (`painel-conexao-versao.js`) (or says no version): `A Conexão com o Anki está desatualizada · O Envio espera. Suas frases estão guardadas.` with **Atualizar agora**. Newer, or old but working: nothing.
- `conexao-versao-falhou` the update failed: `A Conexão com o Anki segue na versão X. Não deu para atualizar agora.` with **Tentar de novo**. A background failure with a Conexão that still works shows nothing.
- `conexao-versao-atualizada` discreet `Conexão atualizada · X`, closable, once per version (`pm_conexao_atualizada_vista`).
- `conexao-versao-reiniciar` only when the old Conexão already has the new version on disk: `Conexão atualizada · X. Reinicie o Anki para ela valer agora.` with **Reiniciar o Anki** (closes the Anki through the Conexão, waits for it to go quiet, the abridor opens it again). Without the abridor permission the Anki is not closed and the notice says to do it by hand.

## How to get to it (user POV)

- Any Painel area, with the Conexão on (`painel.html`). Nothing to open: it shows when the health says so.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. `fakes.anki.atualizacao.definir({ versao, versaoNova })` sets the running and AnkiWeb versions; `fakes.anki.definirAtualizacao({ atualizacao: 'instalada' | 'falhou' | 'atualizada', ankiweb: 'com_versao_nova' | 'sem_versao_nova' | 'recusa' })` the stored state and how AnkiWeb answers; `fakes.anki.atualizacao.reinicios()`.

- **The states.** `drive.sh conexao-versao conexao-versao.spec`. Observable: `#painel-conexao-versao`, `pm_conexao_atualizada_vista`, `fakes.abridor.pedidos()`.
- **The add-on side.** `python3.9 complemento/test_atualizacao.py`: the AnkiWeb fake (query by id, install, the mark, the Anki that changed inside).

## Gotchas

- The real Anki internals (`aqt.addons`) were read in the Anki 26.09 source, not run; the owner's rehearsal (a Conexão installed from AnkiWeb, a version uploaded, Anki restarted) is what proves the silent update. See `docs/ankiweb/LEIA-ME.md`.
- The visual references are `test.fixme` (`conexao-versao-visual.spec.js`, no PNG) until the owner compares them.
