# The Envio stopped by a closed Anki, Tentar de novo on its card, and the plan's limit (`painel-envio-parado.js`, `painel-envio-cartao.js`, `painel-envio-limite.js`)

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
  (`AbrirOAnki.causaDoAbridor`). The card reads the opener's answer by its `desfecho` (`AbrirOAnki.DESFECHO`), like the Envio strip: `aberto` and `respondeu` say
  nothing, `reiniciado` and `ligado` show the BRG-39 success toast, `sumiu` and `falhou` show BRG-39's sentence with Instalar de novo or Baixar
  diagnóstico on the card (`AbrirOAnki.falaDoDesfecho`), the rest is `abridor · <desfecho> · <motivo>` in Detalhes. The person opening the Anki alone needs no click at all.
- **The opener never reopens an Anki the person closed.** Nothing calls it but that click (and Enviar, #150): polling, redrawing, the loop and the
  Conexão coming back do not. The panel cannot tell a closed Anki from a hung one (the Conexão is dead either way), so it never opens either by
  itself; the automatic restart of a hung Anki belongs to the repair (#152), which must keep a closed Anki closed.
- **Tentar de novo on the card.** An Envio that ended `partial` or `failed` has **Tentar de novo →** (`ENV-03.tentarDeNovo`, `POST /jobs/retry`);
  the Conexão redoes only the Cards that failed. **Continuar envio** stays for the Envio stopped by a closed Anki. Visual references: `envio-parado`, `envio-em-parte`, `envio-codigo-da-conexao`
  wait for the owner (`test.fixme`, no PNG).

## Driving it (`drive.sh anki-parado painel-envio-parado.spec`)

The fake Envio gets `moverEnvio(jobId, { stage, cartoes })` (`cartoes`: `{ '<phraseId>-<n>': 'added' | 'pending' | 'failed' }`), then `fakes.anki.desligar()`. Observable: the card text above within a few seconds, `fakes.abridor.pedidos()` has no `abrir` until Continuar envio is clicked (then exactly one, and `Abrindo o Anki para enviar…`); after `ligar()` the sentence goes and the panel sends no `/jobs/retry` (the Conexão resumes by itself: that part is `python3.9 complemento/test_envio_retomada.py`, not the fake). `definir('achei_sem_abrir')` adds `Não deu para abrir o Anki. Abra-o você mesmo.`. A real Anki closing and reopening on a Mac is only the owner's rehearsal.

## The ChatGPT plan at its limit (#158, `painel-envio-limite.js`)

Tests: `e2e/tests/painel-envio-limite.spec.js` (the card, the three actions, the Envio coming back by itself), the `#158` case of
`painel-envio-copia.spec.js`, `complemento/test_limite_do_plano.py` (the Conexão side), the examples in `complemento/contrato/exemplos-do-limite.json`.

- **What the Conexão does.** A `chatgpt_usage_limit` from the plan no longer ends the Envio: it stays `running` with `waiting: { reason: "plan_limit" }`,
  asks the same text again every 5 min (`espera_do_plano`) and goes on by itself when the plan answers; a Card in the Anki, or with its text
  paid, is never asked again. **Tentar de novo** (`POST /jobs/retry`) wakes that wait: the text is asked now. **Usar a minha chave**
  (`POST /jobs/usar-a-chave`) marks the Envio `usingKey` and what is missing goes by the OpenAI key (`409 openai_key_missing` without one; `409 job_finished` once it ended).
- **What the card says.** While `state.waiting.reason` is `plan_limit` and the Envio has not ended, ENV-19: “Limite de uso atingido · Faltam 7 cartões”
  (the Cards of `state.cards` not `added`/`duplicate`; “Falta 1 cartão”) and “Quando o plano liberar, o Envio continua sozinho.”, then three actions in a
  row: **Gerenciar uso** (a link, the main one, to `chatgpt.com/settings/usage` in a new tab), **Usar a minha chave** and **Tentar de novo**. It goes by itself
  when the Conexão drops `waiting`. A closed Anki still wins over it (ENV-18).
- **Usar a minha chave, in the panel.** On `200` the card drops the limit at once (the next read agrees: no `waiting`); on `409 openai_key_missing` the
  progress modal closes and the panel goes to `#configuracoes/ia` to paste a key (the Envio keeps waiting for the plan); any other failure says ENV-14's “Não deu para retomar o envio…”.
- **Driving it** (`drive.sh anki-plano-no-limite painel-envio-limite.spec`): `moverEnvio(jobId, { stage, cartoes, esperando: { reason: 'plan_limit' } })`;
  `guardarChaveNaConexao('9f3a')` gives Usar a minha chave a key. The visual reference `envio-limite-do-plano` waits for the owner (`test.fixme`, no PNG).
  A real plan at its limit is only the owner's rehearsal (#288).
