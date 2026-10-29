# The Envio stopped by a closed Anki, and Tentar de novo on its card (`painel-envio-parado.js`, `painel-envio-cartao.js`)

Tests: `e2e/tests/painel-envio-parado.spec.js` (the sentence, the button, the opener never called alone, Tentar de novo), the `#151` case of
`painel-envio-copia.spec.js` (the copy is the catalog's), `complemento/test_envio_retomada.py` (the Conexão side).

- **Who resumes.** The Conexão runs inside the Anki, so closing the Anki stops it with the Envio `running` on disk. When the Anki opens, the Conexão
  puts that Envio back in the queue and finishes it by itself (`trabalhador.py`, `recuperar_os_interrompidos`), paying the OpenAI only for the Cards
  that are not ready (`test_envio_retomada.py`). The panel never asks it to resume: it reads `POST /jobs/list` as before.
- **What the card says.** While `ConexaoAnki.situacao()` is `desligada` (after it answered once) and the Envio has not ended, the card shows ENV-18 —
  “3 de 10 no Anki. Quando o Anki abrir, o Envio continua sozinho.” — as two `<span>`s, each from the catalog. The count is the Cards of the last
  `state.cards` with status `added` or `duplicate` over all of them; without `cards` (the panel reopened with the Anki closed, or the bridge) only the
  second sentence. This beats a stale `waiting` (the profile). The Envio loop checks `/health` on every round while it has no news
  (`conferirEnvios`), so the sentence shows in about two seconds, and goes when the Conexão answers again (ENV-09, “Sem resposta…”, stays hidden meanwhile). The progress modal is where it lives:
  Enviar ao Anki with nothing new opens it.
- **Continuar envio** is the one click that calls the opener (`AbrirOAnki.abrirEEsperar()`, inside the click so Chrome can ask the
  `nativeMessaging` permission): “Abrindo o Anki para enviar…” (ENV-16) until the Conexão answers. When it does not open (no permission, no opener, the
  Anki not there, no answer in 2 min) the card adds BRG-38's “Não deu para abrir o Anki. Abra-o você mesmo.” and the cause in Detalhes
  (`AbrirOAnki.causaDoAbridor`). The person opening the Anki alone needs no click at all.
- **The opener never reopens an Anki the person closed.** Nothing calls it but that click (and Enviar, #150): polling, redrawing, the loop and the
  Conexão coming back do not. The panel cannot tell a closed Anki from a hung one (the Conexão is dead either way), so it never opens either by
  itself; the automatic restart of a hung Anki belongs to the repair (#152), which must keep a closed Anki closed.
- **Tentar de novo on the card.** An Envio that ended `partial` or `failed` has **Tentar de novo →** (`ENV-03.tentarDeNovo`, `POST /jobs/retry`);
  the Conexão redoes only the Cards that failed. **Continuar envio** stays where the person has to act first (Windows would not close the Anki,
  BRG-18) and for the Envio stopped by a closed Anki. Visual references: `envio-parado`, `envio-em-parte`, `envio-codigo-da-conexao`
  wait for the owner (`test.fixme`, no PNG).

## Driving it (`drive.sh anki-parado painel-envio-parado.spec`)

The fake Envio gets `moverEnvio(jobId, { stage, cartoes })` (`cartoes`: `{ '<phraseId>-<n>': 'added' | 'pending' | 'failed' }`), then `fakes.anki.desligar()`. Observable: the card text above within a few seconds, `fakes.abridor.pedidos()` has no `abrir` until Continuar envio is clicked (then exactly one, and `Abrindo o Anki para enviar…`); after `ligar()` the sentence goes and the panel sends no `/jobs/retry` (the Conexão resumes by itself: that part is `python3.9 complemento/test_envio_retomada.py`, not the fake). `definir('achei_sem_abrir')` adds `Não deu para abrir o Anki. Abra-o você mesmo.`. A real Anki closing and reopening on a Mac is only the owner's rehearsal.
