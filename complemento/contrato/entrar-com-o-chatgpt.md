# O contrato do login do ChatGPT (#155)

POST com a origem da extensão; contexto `chatgpt`: `desconectada`, `entrando`, `conectada` ou `recusou`. Nenhuma resposta leva
um token (`docs/design/login-do-chatgpt.md`).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /ia/chatgpt/estado` | `{}` | `{ conectada, entrando, falha }` (`falha`: `chatgpt_access_denied`, `chatgpt_plan_not_granted`, `chatgpt_login_failed` ou `null`) |
| `POST /ia/chatgpt/entrar` | `{}` | `{ url }`: uma tentativa nova; a extensão abre a URL numa aba |
| `POST /ia/chatgpt/sair` | `{}` | `{ ok, revogada }`: revoga a sessão (se dá) e apaga o login |

`"<url de autorização>"` na resposta é a URL do login (o `state` muda a cada tentativa).

O retorno `GET /auth/callback` é do navegador, fora dos exemplos (`servidor.PAGINAS`; `test_login_do_chatgpt.py`).

Voltar ao [contrato da Conexão](LEIA-ME.md).
