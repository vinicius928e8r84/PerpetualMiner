# O contrato do modelo dos cartões (#157)

POST com a origem da extensão; o contexto é `modelo` (um cenário de `modelos`, em `exemplos-do-modelo.json`: o dia de hoje, a escolha de antes,
o que a OpenAI lista para a chave e para o plano e as datas de saída que valem sobre a lista nossa, `complemento/modelos_da_ia.json`);
quem paga vem dos contextos de sempre (`chatgpt`, `chaveNaConexao`, `openai`). Nenhuma resposta leva a chave nem um token
(`docs/design/modelo-dos-cartoes.md`).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /ia/modelo/estado` | `{}` | `{ paga, escolha, modelos, aviso, trocou }`: `paga` é `plano`, `chave` ou `null`; `escolha`, o que vale hoje (`automatico` ou um modelo); `modelos`, os que a conta oferece (com a chave, só texto que vê foto; sem o que já saiu); `aviso`, `{ modelo, saida }` enquanto a saída do escolhido não chegou; `trocou`, `{ de }` quando a Conexão passou sozinha para o Automático (com `porque: "pagador"` quando a conta que paga agora é outra que a de quando o modelo foi escolhido e não o tem). `503 models_unavailable`: a lista da conta não veio |
| `POST /ia/modelo/escolher` | `{ modelo }` | `{ ok, escolha }`; `automatico` serve também de Trocar agora e apaga o `trocou`. `400 invalid_request`; `404 model_not_found` (o modelo não está na lista da conta); `503 models_unavailable` |

Ler não grava: quem guarda a troca é o Envio, no primeiro Cartão depois de a escolha cair.

Voltar ao [contrato da Conexão](LEIA-ME.md).
