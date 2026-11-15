# O contrato do login do ChatGPT (#155)

POST com a origem da extensão; contexto `chatgpt`: `desconectada`, `entrando`, `conectada`, `recusou`, `nao_serve` ou `acabou`. Nenhuma resposta leva
um token (`docs/design/login-do-chatgpt.md`).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /ia/chatgpt/estado` | `{}` | `{ conectada, entrando, falha, acabou }` (`falha`, da última tentativa: `chatgpt_access_denied`, `chatgpt_plan_not_granted`, `chatgpt_login_failed`, `chatgpt_not_eligible` ou `null`; `acabou`: `chatgpt_signed_out` quando a renovação do login foi recusada, senão `null`. Com `acabou` o Envio para e não gasta a chave, até a pessoa entrar de novo ou sair) |
| `POST /ia/chatgpt/entrar` | `{}` | `{ url }`: uma tentativa nova; a extensão abre a URL numa aba |
| `POST /ia/chatgpt/sair` | `{}` | `{ ok, revogada }`: revoga a sessão (se dá) e apaga o login; o login que acabou também sai (nada a revogar) |

`"<url de autorização>"` na resposta é a URL do login (o `state` muda a cada tentativa).

O retorno `GET /auth/callback` é do navegador, fora dos exemplos (`servidor.PAGINAS`; `test_login_do_chatgpt.py`).

Voltar ao [contrato da Conexão](LEIA-ME.md).
