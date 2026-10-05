# Open the Anki with the computer

Configurações › **Conexão com o Anki** holds one switch, **Abrir o Anki com o computador**, off by default. On, the Conexão (the Anki add-on) writes the login item that opens the Anki when the person signs in to the computer: a LaunchAgent on the Mac, a shortcut in the Startup folder on Windows. Off, it deletes the item. The item lives in the Conexão, so the switch shows what the Conexão says and changes only after its answer.

## Sub-features

- `login-default` the switch starts off; the closed row says `Não abre com o computador`; reading the state writes nothing.
- `login-on` turning it on asks the Conexão to write the item (`POST /abrir-com-o-computador`, `{ ligado: true }`); the switch and the row (`Abre com o computador`) follow the answer.
- `login-off` turning it off asks the Conexão to delete the item.
- `login-wait` while the Conexão works the switch is disabled and still shows the real state.
- `login-offline` with the Conexão off the switch is unavailable, the note says why and the row says `Indisponível agora`; when the Conexão comes back it shows what the Conexão has.
- `login-errors` a write the Conexão refuses (item not written, Anki not found, a computer with no login item) keeps the switch where it really is and shows a persistent aviso with Detalhes.
- `login-unknown` a write whose answer is lost or late (3 s) is uncertain: the switch is unavailable, the aviso asserts nothing, and the screen reads `/estado` until it confirms; an invalid or failed read (even after a good one) makes the switch unavailable, never "off".

## How to get to it (user POV)

- Sidebar › **Configurações** › card **Conexão com o Anki**, or open `painel.html#configuracoes/anki` (the card opens by itself).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The login item lives in the Anki fake (`fakes.anki.itemDeLogin()` says `desligado` or `ligado`; `definirItemDeLogin('ligado' | 'sem_anki' | 'falha' | 'indisponivel')` sets the situation, from the contract examples in `complemento/contrato/exemplos.json`). It is the extension against the contract, **not** the real add-on writing a real LaunchAgent or shortcut.

- **Default and turning on/off (`login-default`, `login-on`, `login-off`).** `drive.sh login-liga configuracoes-abrir-anki.spec -g "interruptor"`. Observable: the switch named `Abrir o Anki com o computador`, the row text, the requests the fake received (`fakes.anki.requisicoes`, the bodies `{"ligado":true}` / `{"ligado":false}`) and `fakes.anki.itemDeLogin()`.
- **Waiting (`login-wait`).** `-g "enquanto a Conexão escreve o item"`.
- **Offline (`login-offline`).** `-g "com a Conexão desligada"`.
- **Failures (`login-errors`).** `-g "quando o item não muda"`. Observable: the aviso text per cause and `Detalhes` with the code (`login_item_failed`); the final item is asserted with `fakes.anki.itemInstalado()`.
- **Unknown (`login-unknown`).** `-g "quando a resposta de ligar não chega"` (`fakes.anki.perderARespostaDoItemDeLogin({ aplicada })`) and `-g "não sabe responder"` (invalid answers, a read that fails after a good one).
- **Both sides of the contract.** `drive.sh login-contrato contrato-da-conexao.spec` for the fake; `python3.9 complemento/test_servidor.py` and `python3.9 complemento/test_item_de_login.py` for the add-on (the file written and deleted in a temp folder, per system).

## Gotchas

- The switch is a Veio toggle (the input is visually hidden): click the label (`#cfg-anki-corpo .veio-toggle`) or focus the switch and press Space.
- Nothing is stored in `chrome.storage`: after a reload the state comes from the Conexão again, so a proof that seeds storage proves nothing here.
- What the Mac and Windows do with the item (the Anki really opening at login, the Mac's "Background items added" notice) is not provable in this harness: it is the owner's rehearsal (`complemento/LEIA-ME.md`).
