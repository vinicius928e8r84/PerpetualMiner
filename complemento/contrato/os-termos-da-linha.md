# Os Termos da linha (#905)

Exemplos: `exemplos-dos-termos.json`. Uma rota da Conexão lê uma linha de texto e diz quais Termos há nela, por uma IA muito barata. A extensão a chama pela Mineração automática (`lib/termos-da-linha.js`), só na dúvida; o construtor é `PedidoAoAnki.termosDaLinha(lang, texto)`.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /ia/termos` | `{ lang, texto }`: `lang` é `en` ou `ru`; `texto` é uma linha de 1 a 500 letras com ao menos uma palavra | `200 { termos, pagou }`; `termos` é uma lista de `{ texto, posicoes, tipo, comum }`; `pagou` é `chave` ou `plano`. `400 invalid_request`; `409` parado (`openai_key_missing`, ou o motivo do login que acabou, como `chatgpt_signed_out`); `502` com o código da IA ou `ai_invalid_response` |

- `posicoes` são as posições (a partir de 0, na ordem da linha) das palavras do Termo; as palavras são as que a extensão conta em `lib/palavra-automatica.js` (letras e números, com apóstrofo ou hífen dentro da palavra). `texto` é essas palavras unidas por espaço. Um Termo de palavras não vizinhas (`look the word up`) leva as posições separadas.
- `tipo` é um de `palavra`, `phrasal_verb`, `expressao`, `giria`, `nome`. `comum` diz se a pessoa vai encontrar o Termo no dia a dia.
- Quem paga segue a tabela da IA dos cartões: com o login do ChatGPT, o plano; sem login, a chave da OpenAI (o `gpt-4o-mini`, o mais barato da lista nossa com preço conhecido, não o modelo que a pessoa escolheu para os cartões); sem os dois, `409` sem chamar a IA. Nunca troca sozinha: o plano no limite responde `chatgpt_usage_limit`, não gasta a chave.
- O custo entra nos Custos do mês e no teto, numa pasta por idioma e mês (`custos/termos-<lang>-<AAAA>-<MM>/`), que sai da lista de Envios por não ter Cartões. Pelo plano o custo é 0 e o registro guarda o que a chave cobraria.
- A resposta da IA que não serve (JSON quebrado, posição fora da linha, tipo desconhecido, `common` que não é verdadeiro ou falso) é `502 ai_invalid_response`; o que a IA gastou para responder mal também conta.
- O corpo de um erro da OpenAI nunca volta nem é gravado (ADR 0012): o motor lê no máximo 64 KB dele só para escolher o código e o descarta. O log não leva a linha.
- Cada pedido que a IA responde grava um registro de custo; por isso os exemplos de sucesso são `"repetivel": false`. O contexto dos exemplos é o de sempre: `chaveNaConexao`, `chatgpt` e `openai`.
