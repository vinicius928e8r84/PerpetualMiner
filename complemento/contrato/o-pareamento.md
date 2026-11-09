# O pareamento (#192): quem pode pedir à Conexão

A Conexão só atende o pedido assinado por um navegador que se **pareou** com ela. `GET /health` (e o retorno do login do ChatGPT, `GET /auth/callback`) ficam abertos; as três rotas do
pareamento exigem a origem da extensão, mas não a assinatura; tudo o mais, **a rota que não existe inclusive**, exige a origem **e** a assinatura. O desenho (os donos de cada dado, os
estados, as falhas, as 8 variantes, os limites) é `docs/design/pareamento-da-conexao.md`; o código é `complemento/pareamento.py` e `servidor.py` › `_pedido_aceito` (o porteiro, num lugar
só) do lado do complemento e `lib/pareamento.js` e `PedidoAoAnki.pedir` do lado da extensão. Os exemplos são `exemplos-do-pareamento.json`.

## As rotas do pareamento

Todas POST, com a origem da extensão e sem assinatura. `nome`, no `concluir`, é só um rótulo (até 60 letras) para reconhecer o navegador.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /pareamento/comecar` | `{}` | `200 { ok }`: o Anki abre um diálogo com o código de 6 caracteres (vale 5 minutos, 5 tentativas). **O código nunca volta em resposta HTTP**, nem entra em arquivo ou log. `503 pairing_unavailable`: o Anki não tem onde mostrá-lo |
| `POST /pareamento/concluir` | `{ codigo, cliente, nome? }` | `200 { cliente, segredo }`: grava o navegador (`user_files/pareamento.json`, só do dono, até 5) e entrega o segredo **uma vez**; o mesmo pedido de novo (a resposta se perdeu) devolve o mesmo segredo. `401 pairing_code_wrong { restam }`; `410 pairing_code_expired` (venceu, cancelado, sem código, ou o quinto erro); `409 pairing_code_used` (outro navegador usou o código); `400 invalid_request` |
| `POST /pareamento/conferir` | `{ cliente, desafio }` | `200 { sessao, prova }` com `prova = HMAC(segredo, "pm1\nservidor\n" ‖ desafio ‖ "\n" ‖ sessao)`; `401 pairing_required` (a Conexão não conhece o navegador, e não dá prova nenhuma); `400 invalid_request` |

`cliente` é um UUID que a extensão sorteia; `desafio`, 16 a 128 caracteres de base64/hex que ela sorteia a cada `conferir`; `sessao` nasce a cada subida da Conexão (só na memória).

## O pedido assinado

Cada pedido às outras rotas leva quatro cabeçalhos: `X-PerpetualMiner-Cliente`, `-Sessao` (a que o `conferir` deu), `-Nonce` (16 a 64 letras, novo a cada pedido, nunca repetido na sessão) e `-Assinatura`:

```
HMAC-SHA256(segredo, "pm1\npedido\n" + sessao + "\n" + nonce + "\n" + MÉTODO + "\n" + caminho + "\n" + sha256hex(corpo))
```

em base64; `caminho` sem a busca; `corpo` são os bytes enviados (vazio sem corpo). A resposta a um pedido assinado leva `X-PerpetualMiner-Prova` (exposta por `Access-Control-Expose-Headers`):

```
HMAC-SHA256(segredo, "pm1\nresposta\n" + sessao + "\n" + nonce + "\n" + status + "\n" + sha256hex(corpo da resposta))
```

A extensão só entrega a resposta a quem pediu se a prova confere. Os rótulos `pedido`, `resposta` e `servidor` separam os usos. O vetor comum às duas linguagens está em `exemplos-do-pareamento.json`
(`vetorDeAssinatura`): `complemento/test_pareamento.py` e `test_pareamento_do_anki.js` o conferem.

## As recusas do porteiro

Antes de escolher a rota, e sempre `401`: `pairing_required` (sem assinatura, ou navegador que a Conexão não conhece), `session_expired` (assinado numa subida anterior: a extensão refaz o `conferir` e
repete uma vez) e `pairing_invalid` (assinatura errada, nonce repetido). Valem para toda rota: os exemplos usam `/ia/estado` (`assinatura`: `ausente`, `errada`, `sessaoVelha` no pedido), e
`test_pareamento_porteiro.py` pede cada rota de `ROTAS`. Uma recusa não leva prova. O corpo grande demais ainda é `400 invalid_json`, antes da assinatura.

A Conexão **de antes do pareamento** (404 no `conferir`) só recebe da extensão, sem assinatura, `POST /atualizacao/agora` e `/atualizacao/reiniciar` (corpo `{}`): são o jeito de ela sair da versão velha.

## No contrato e nos testes

- `contexto` dos exemplos: `pareado: false` (a Conexão não conhece nenhum navegador; o padrão é o navegador `primeiro` de `navegadoresDeTeste`), `semTela` (o Anki não tem onde mostrar o código), `codigoPendente` (o Anki mostra
  este código) e `codigoUsadoPor` (outro navegador já o usou). `navegadoresDeTeste` guarda o `cliente` e o `segredo` dos dois navegadores de teste, que o e2e e os testes do complemento usam.
- O harness de `test_servidor.py` assina por padrão todo exemplo que traz a origem da extensão (`pedir_como_o_exemplo`); o fake do e2e verifica a assinatura de todo pedido e assina toda resposta
  (`e2e/fakes/pareamento.js`); `PM_CONEXAO=real` roda os mesmos fluxos contra o servidor de verdade.
- Respostas com `"<segredo>"`, `"<prova>"` (32 bytes em base64) e `"<sessão>"` (32 hexadecimais) no JSON mudam a cada pareamento e a cada subida.
