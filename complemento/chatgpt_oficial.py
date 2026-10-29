"""O caminho oficial do “Sign in with ChatGPT” com o uso do plano (#155), num lugar só: os endereços e os valores do protocolo.

Fonte de cada valor: a doc oficial para apps abertos, `https://developers.openai.com/siwc/llms-full.txt` (lida em 2026-10-26;
as páginas S3 a S8 da pesquisa #92), e o ensaio #121, em que o dono entrou de verdade por este caminho com o retorno na 8766.
O que só o ensaio do dono confirma está em `docs/design/login-do-chatgpt.md` (§ 6). Só o código muda isto: nada no ambiente,
na configuração ou num pedido desvia o login ou os tokens para outro lugar (a Conexão recebe as bases de `inicio.iniciar`).
"""

# “Registration and sign-in” § 2: o navegador da pessoa abre esta URL (a Conexão nunca a pede).
AUTORIZAR = "https://auth.openai.com/api/accounts/authorize"
# O servidor de login: a troca do código e a renovação (“Registration and sign-in” § 3, “Accounts and sessions” § Refreshing
# tokens) e o `revocation_endpoint` do Sair (“Accounts and sessions” § End the renewable session).
LOGIN = "https://auth.openai.com"
TOKEN = "/api/accounts/oauth/token"
OPENID = "/.well-known/openid-configuration"

# “Registration and sign-in”: o primeiro registro usa o cliente dinâmico; a OpenAI devolve no retorno o `client_id` emitido.
CLIENTE_DINAMICO = "dynamic_agent_client"
NOME_DO_APP = "PerpetualMiner"  # `agent_name_hint`: o nome do app, o mesmo em toda instalação
ESCOPO_DO_PLANO = "chatgpt.tokens.use.direct"
ESCOPOS = "openid profile email offline_access resource.invoke " + ESCOPO_DO_PLANO
RECURSO = "https://api.openai.com/v1"  # `resource`, na autorização, na troca e na renovação
CAMINHO_DO_RETORNO = "/auth/callback"  # `http://127.0.0.1:<porta>/auth/callback`: só a porta pode variar

# “Errors and recovery” § Refresh errors: o refresh que não serve mais (o login acabou; a pessoa entra de novo).
REFRESH_INUTILIZAVEL = frozenset([
    "invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated",
    "refresh_token_reused", "invalid_client",
])

# “Models and inference”: a lista de modelos da conta (`models`, com `slug` e `visibility: list`) pelo mesmo token, e o texto por
# `POST /v1/responses` (`openai_http.responder`, do motor), os dois no `OPENAI_BASE` de `configuracao.py`. O link de Gerenciar uso
# (“Accounts and sessions” § Tracking usage) é da tela: `painel-ia-chatgpt.js`.
MODELOS = "/v1/models"
