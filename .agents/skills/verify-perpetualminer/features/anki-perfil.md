# The fixed Anki profile

The Cartões only enter the Anki profile that was open on the first connection (#149). With 2 or more profiles, Configurações › **Conexão com o Anki** shows the row **Perfil do Anki** to pick another; with one profile nothing about profiles shows. With another profile open the Envio waits (`O Anki está no perfil X. O Envio espera.`) and the card offers **Abrir <perfil>**, which closes the open profile the Anki's own way (it syncs) and opens the marked one. A marked profile the Anki no longer has gets a red aviso asking to pick another, and nothing goes to any other profile.

## Sub-features

- `perfil-linha` the row `Perfil do Anki` (a list with the marked profile) appears only with 2 or more profiles; with one profile the card says nothing about profiles.
- `perfil-escolher` picking another profile asks the Conexão (`POST /anki/profile`); the list shows what the Conexão kept, and a failed pick says `Não deu para trocar o perfil. Tente de novo.`
- `perfil-sumiu` a marked profile that is gone (renamed or deleted) shows a red aviso, also with one profile left; picking another clears it.
- `perfil-espera` an Envio waiting on another open profile says who is open and offers `Abrir <perfil>`; the click asks the Conexão (`POST /anki/profile/open`); a click the Conexão does not answer says `Não deu para abrir o perfil. Tente de novo.`
- `perfil-envio-sumiu` an Envio waiting on a gone profile says so and `Escolher perfil` closes the progress and opens Configurações.

## How to get to it (user POV)

- Sidebar › **Configurações** › card **Conexão com o Anki** (`painel.html#configuracoes/anki`) for the row; **Enviar ao Anki** in Frases, then the progress modal, for the waiting card.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The profiles live in the Anki fake (`fakes.anki.definirPerfis(lista, { marcado, aberto })`; `perfilMarcado()` and `perfilAberto()` say what the Conexão kept; `falharAEscolhaDoPerfil()`; `moverEnvio(jobId, { stage: 'wait_anki', esperando: { reason, profile, marked } })` puts the Envio in the waiting state). It is the extension against the contract (`complemento/contrato/exemplos-do-perfil.json`), **not** a real Anki closing and opening profiles.

- **The row, picking, gone (`perfil-linha`, `perfil-escolher`, `perfil-sumiu`).** `drive.sh perfil configuracoes-perfil.spec`. Observable: the combobox `Perfil do Anki`, the aviso text, the request bodies (`{"profile":"Beto"}`) and `fakes.anki.perfilMarcado()`. A lost answer (`context.route` aborting `POST /anki/profile` in `configuracoes-perfil.spec.js`) shows the re-read profile and no failure notice when the Conexão did mark it.
- **The waiting card (`perfil-espera`, `perfil-envio-sumiu`).** `drive.sh perfil-envio painel-envio-perfil.spec`. Observable: the card text, the `Abrir Ana` button, the `POST /anki/profile/open` request and `fakes.anki.perfilAberto()`.
- **The add-on side.** `python3.9 complemento/test_perfil_fixo.py` (the real server, in-memory collection) and `test_no_anki_perfil.py` (the order of Anki calls: `pm.load`, `onOpenProfile`, `unloadProfile`).

## Gotchas

- The visual references of both screens are `test.fixme` (no PNG) until the owner approves them against the prototypes (`perfil-fixo-visual.spec.js`).
- Whether the real Anki enters a profile by itself (`mw.pm.load` + `mw.onOpenProfile`) and closes one the normal way is **not** provable here: it is the owner's rehearsal (risk 4 of #138, `complemento/LEIA-ME.md`).
