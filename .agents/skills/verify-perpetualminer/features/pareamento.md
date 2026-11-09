# Conectar este navegador ao Anki (the pairing)

The Conexão com o Anki answers only a browser it has paired with (#192, owner's option A, 09/11): the secret is born in the Conexão, reaches the extension **once**, after the person types in the Painel a code only their Anki showed, and never travels again; every request is HMAC-signed and every answer comes back signed. `GET /health` and the pairing routes are the only open ones. Design page: `docs/design/pareamento-da-conexao.md`; routes, headers and examples: `complemento/contrato/o-pareamento.md`.

## Sub-features

- `pareamento-a-parear` the Conexão is on and this browser has no credential (or the Conexão does not know it): the notice `Conecte este navegador ao Anki` with **Conectar** at the top of the Painel (BRG-52, `painel-conexao-versao.js`). No private request leaves while it shows.
- `pareamento-codigo` **Conectar** makes the Anki open a dialog with the code (ANK-05: `Código para conectar o PerpetualMiner: K7M-4PX. Vale por 5 minutos`, **Cancelar**); the Painel shows `Digite o código que apareceu no Anki`, the field and **Confirmar**. Right: the credential is stored (a non-extractable `CryptoKey` in IndexedDB `pm-pareamento`), the Anki says `PerpetualMiner conectado` (tooltip), the Painel toasts `Conexão com o Anki: ligada` and the screens read again.
- `pareamento-errado` a wrong code: `Código errado. Restam 4 tentativas` (… `Resta 1 tentativa`), the field keeps what was typed; the fifth wrong code, a code older than 5 minutes or one cancelled in the Anki: `O código venceu. Peça outro` and back to **Conectar**.
- `pareamento-nao-confirmada` the port answers `/health` but does not prove it has this browser's secret (an impostor, another user's Conexão): `Algo na porta do Anki não se confirmou. Nada foi enviado` with **Tentar de novo**; the same text when the Anki cannot open the dialog.
- `pareamento-antiga` a Conexão without the routes (404 on `conferir`): the version notice (`conexao-versao-velha`) and no private request; only **Atualizar agora** and **Reiniciar o Anki** (body `{}`) are sent to it, unsigned, because they are how it leaves the old version.
- `pareamento-desconectar` the Anki window (Ferramentas › PerpetualMiner…) has **Desconectar navegadores** (enabled only with a browser connected): the list empties, each browser asks for the code again; the key, the Envios and the rest stay. The extension does not delete its credential on a 401 without proof.

## How to get to it (user POV)

- Any Painel area, and the Boas-vindas (at the top of it, `#boas-vindas > #painel-pareamento`), with the Conexão on and no pairing: the notice shows by itself. The Anki side (dialog, tooltip, button) is only real in a real Anki (the owner's rehearsal).

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The fixture `extensao` pairs the test browser by default (`test.use({ pareada: false })` does not: neither the extension nor the fake knows any browser). `fakes.anki.pareamento` is the pairing of the fake: `codigoNoAnki()` (what the Anki dialog shows), `vencerOCodigo()`, `cancelarNoAnki()`, `desconectar()`, `pareados()`, `recebidos()`, `antigo()`, `semJanelaDoAnki()`; `PM_CONEXAO=real` runs the real Python Conexão (`conexaoDoTeste.enviar({ pareamento: 'codigo' | 'navegadores' | 'desconectar' | 'cancelar' })`).

- **The flows.** `drive.sh pareamento pareamento.spec` (add `PM_CONEXAO=real PYTHON=python3.9` for the real server): Conectar → code → conectado, wrong and dead codes, cancel in the Anki, two Chrome profiles, Desconectar, the impostor on the port, the old Conexão. Observable: `#painel-pareamento`, `fakes.anki.pareamento.pareados()`, the IndexedDB `pm-pareamento` (non-extractable key), `extensao.lerStorage()` (no secret).
- **The impostor.** `pareamento.spec.js › quem não é a Conexão`: a route registered after the fake answers `/health` and everything else with `200 {}`; it only ever sees `/health` and `/pareamento/conferir`, never the key typed in the AI card.
- **Every route refuses the unsigned.** `python3.9 complemento/test_pareamento_porteiro.py` (each route of `ROTAS`, unsigned, wrong signature, old session) and the matrix of `test_servidor.py`.
- **The protocol, both languages.** `node test_pareamento_do_anki.js` (the extension's `pedir` against a Conexão that does what the add-on does) and `complemento/test_pareamento.py` (the shared HMAC vector, the code, the 5 attempts, the 5 minutes).

## Gotchas

- Visual references are `test.fixme` (`pareamento-visual.spec.js`, no PNG) until the owner compares them.
- The real proof (a real Anki dialog on Mac and Windows, the forged client, the impostor, two profiles, a tester coming from `main`) is outside CI: `docs/design/pareamento-da-conexao.md` § 6.
- A test that reads "the last request the fake saw" right after a click must wait for it (`expect.poll`): a signed request leaves a few milliseconds later than an unsigned one did.
