AUTORIZAR = "https://auth.openai.com/api/accounts/authorize"
LOGIN = "https://auth.openai.com"
TOKEN = "/api/accounts/oauth/token"
OPENID = "/.well-known/openid-configuration"

CLIENTE_DINAMICO = "dynamic_agent_client"
NOME_DO_APP = "PerpetualMiner"
ESCOPO_DO_PLANO = "chatgpt.tokens.use.direct"
ESCOPOS = "openid profile email offline_access resource.invoke " + ESCOPO_DO_PLANO
RECURSO = "https://api.openai.com/v1"
CAMINHO_DO_RETORNO = "/auth/callback"

REFRESH_INUTILIZAVEL = frozenset([
    "invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated",
    "refresh_token_reused", "invalid_client",
])

MODELOS = "/v1/models"
