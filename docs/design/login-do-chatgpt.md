# Página de desenho: entrar com o ChatGPT e o Cartão de texto pelo plano (#155)

Fatia ALTA pelo [modelo](modelo-fatia-alta.md): mexe numa **credencial** (os tokens do ChatGPT) que vive na Conexão com o Anki
e é pedida pela extensão. O que a fatia entrega: a coluna “Conta do ChatGPT” do card IA dos cartões ganha o botão que funciona,
o login oficial “Sign in with ChatGPT” (cliente dinâmico, PKCE, retorno em `http://127.0.0.1:8766/auth/callback`), os tokens
num arquivo da Conexão deste computador, o texto de cada Cartão pela Responses API quando há login, e a linha
“Usando o plano do ChatGPT · Gerenciar uso”. A imagem gerada continua pela chave (a linha do card já diz isso, CFG-35.imagem).

**De onde vêm os valores do protocolo.** Todos moram num módulo só, `complemento/chatgpt_oficial.py`, e cada um cita a fonte:
a doc oficial do Sign in with ChatGPT para apps abertos (`https://developers.openai.com/siwc/llms-full.txt`, as páginas S3 a S8
da pesquisa #92: “Registration and sign-in”, “Accounts and sessions”, “Models and inference”, “Preview limitations”,
“Errors and recovery”, “Token reference”), lida em 2026-10-26, e o ensaio #121 (o dono entrou de verdade com `dynamic_agent_client`,
o retorno na 8766 foi aceito e a OpenAI emitiu um `client_id` `oaiapp_…`). Nada aqui chamou a OpenAI: os testes falsificam a
fronteira HTTP. O que só o ensaio do dono prova está na §6.

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| os tokens (`access_token`, `refresh_token`, `id_token`), o `client_id` emitido, os escopos e a validade | a Conexão: `user_files/chaves/chatgpt.json`, 0600 em POSIX, gravado num temporário e trocado de uma vez (o mesmo gravador do cofre da chave) | ninguém | o navegador (`chrome.storage`, IndexedDB, a página), a nuvem, o log, o pacote de diagnóstico, um nome de arquivo, uma URL, o texto de um erro ou de uma resposta HTTP |
| o id deste computador (`ext_agent_host_id`, `urn:uuid:<uuid4>`) | a Conexão: `user_files/chaves/chatgpt-host.json`, criado no primeiro “Continuar com o ChatGPT” e mantido depois de Sair | ninguém | um dado da pessoa (é opaco e não autentica nada) |
| a tentativa de login (`state`, o verificador do PKCE, o `nonce`, a hora em que expira) | a memória da Conexão, **uma** tentativa por vez, 10 min | ninguém | disco, log ou resposta. Só o `state`, o desafio do PKCE e o `nonce` vão na URL de autorização, que a pessoa abre no navegador |
| o código de autorização | o pedido do retorno, até a troca | ninguém | guardado, logado ou trocado duas vezes |
| o estado público (`conectada`, `entrando`, `falha`) | a Conexão, lido por `POST /ia/chatgpt/estado` | **nada** na extensão: a coluna relê a Conexão a cada desenho | guardado no navegador |

## 2. Estados

Da Conexão (`POST /ia/chatgpt/estado`): `{ conectada, entrando, falha }`. O que a coluna diz (CFG-35, regra C8):

- **sem login** (`conectada: false`): “Use o seu plano em vez de pagar por cartão.”, o botão “Continuar com o ChatGPT” e a nota de
  que o login fica só neste computador, na Conexão com o Anki (história 35);
- **entrando** (`entrando: true`): o botão diz “Esperando o ChatGPT…” e não repete o pedido; a coluna relê o estado a cada 2 s;
- **conectada**: o ponto verde e “Usando o plano do ChatGPT · Gerenciar uso” (o link abre `chatgpt.com/settings/usage`, a página de
  uso que a doc manda linkar), e “Sair do ChatGPT”;
- **falha** (`chatgpt_access_denied`, `chatgpt_plan_not_granted`, `chatgpt_login_failed`): a faixa de erro do card, aberta por
  “Conta do ChatGPT:”, com Tentar de novo e o código no Detalhes; a Conexão sem responder ou antiga (404) também, cada uma com a sua cópia;
- **saiu sem a revogação confirmada**: a faixa diz que saiu neste computador e manda desconectar o app nas configurações do ChatGPT.

Com o login, cada Cartão de texto vai pelo plano; sem ele, pela chave, como antes. O Envio **nunca** passa de um para o outro
sozinho: um login que acabou para o Envio com `chatgpt_signed_out` (a doc: “OpenAI does not silently switch the request to another
billing path”, e gastar a chave sem a pessoa saber seria pior).

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| entrar | o painel: `POST /ia/chatgpt/entrar` (o botão; nada abre sozinho, #121) | o id deste computador | a Conexão | cria o id se falta; troca a tentativa pendente por uma nova (`state`, verificador e `nonce` novos, do `secrets`); devolve a URL de autorização, que o painel abre numa aba | os tokens: entrar de novo não apaga um login que já existe até a troca nova dar certo |
| retorno | o navegador: `GET /auth/callback?code&state&client_id` (ou `error`) | a tentativa pendente | a Conexão, se o `Host` é `127.0.0.1:<porta>`, a tentativa não expirou e o `state` é **o** da tentativa (comparação de tempo constante) | consome a tentativa **antes** da troca (o `state` vale uma vez); troca o código no token endpoint (`authorization_code`, o `client_id` emitido, o verificador, o mesmo `redirect_uri` e o mesmo `resource`); confere que veio o escopo `chatgpt.tokens.use.direct` e que o `nonce` do `id_token` é o da tentativa; grava o arquivo | outro `state`, outro `Host`, uma tentativa expirada ou nenhuma: nada muda (a tentativa certa continua esperando). A resposta é **sempre a mesma página fixa**, com `Cache-Control: no-store`, `Referrer-Policy: no-referrer` e `Content-Security-Policy: default-src 'none'`: ela não diz se deu certo (quem diz é a coluna) |
| renovar | a thread do Envio, antes de cada Cartão | o arquivo, sob a tranca do login | a Conexão | a 3 min da validade, `refresh_token` no token endpoint e troca, de uma vez, o `access_token`, a validade, os escopos e o `refresh_token` novo (ele roda) | duas renovações ao mesmo tempo (a tranca as serializa). Um refresh inutilizável (`invalid_grant`, `refresh_token_reused`, `invalid_client`…) apaga o arquivo; falha de rede ou 5xx mantém tudo |
| o texto de um Cartão | a thread do Envio | o arquivo (renovado) e o primeiro modelo da lista da conta (`GET /v1/models`, `visibility: list`, uma vez por Envio) | a Responses API | `POST /v1/responses` com `model`, `instructions` (o prompt de sistema de hoje), `input` com a mensagem, `store: false`, `stream: true`, sem `temperature`; só `response.completed` é sucesso | o texto da OpenAI num erro: só o código fica |
| sair | o painel: `POST /ia/chatgpt/sair` | o arquivo | a Conexão | tenta revogar o `refresh_token` no `revocation_endpoint` que o `openid-configuration` diz (só se ele é do mesmo servidor de login), apaga o arquivo e a tentativa, e responde `{ ok, revogada }` | o id deste computador. Repetido: sem arquivo, nada a revogar, a mesma resposta |
| ler | o painel: `POST /ia/chatgpt/estado` | o arquivo e a tentativa | a Conexão | nada | — |

**Atômico.** O arquivo dos tokens é escrito num temporário criado com `O_EXCL` e modo 0600 e trocado por `os.replace`; a tranca do
login serializa a troca do código, a renovação e o Sair. Entre dois processos: a extensão pediu a URL e a resposta se perdeu (o
botão pede de novo, e a tentativa antiga deixa de valer); o navegador voltou e a troca falhou na rede (a falha fica no estado, a
pessoa tenta de novo; o código já foi gasto); a renovação deu certo e a gravação não (o `refresh_token` novo se perde e o login
pede para entrar de novo: limite 5.d). Reverter: só a pessoa, por Sair ou desconectando o app no ChatGPT.

## 4. As 8 variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão | o botão pede e não tem resposta: a faixa diz que a Conexão não respondeu. Nada se afirma |
| 2 | Anki fechado | igual à 1; o login que já existe fica no arquivo e volta com o Anki |
| 3 | complemento antigo | as rotas `/ia/chatgpt/*` dão `404`: a coluna pede para atualizar a Conexão; o Envio segue pela chave |
| 4 | bridge Flask na 8766 | o mesmo `404` da 3 |
| 5 | dois perfis ou contas numa Conexão | um login por computador, de qualquer perfil do Chrome ou do Anki: é a doc (um arquivo por máquina) e o limite 5.b |
| 6 | quem vem da `main` | não há login antigo: a coluna começa sem login, e o Envio continua pela chave |
| 7 | resposta perdida ou painel fechado | o login termina no navegador e na Conexão sem o painel; ao reabrir, a coluna relê o estado |
| 8 | pedido repetido | estado e sair repetidos respondem igual e não gravam nada; entrar de novo cria outra tentativa (o `state` é de uma vez só), com a mesma forma de resposta e os mesmos arquivos |

## 5. Limites aceitos

- **a. A origem não autentica (#192).** Um processo local que declara a origem da extensão pode pedir a URL de login, ler o estado
  ou mandar Sair (como nas rotas da chave). Não lê nenhum token: nenhuma rota os devolve.
- **b. Um login por computador.** Sem seletor de contas: entrar de novo registra outro cliente (`dynamic_agent_client` toda vez).
  A doc sugere reusar o `client_id` emitido para a mesma conta; fica para quando houver o seletor.
- **c. O `id_token` não tem a assinatura conferida.** A Conexão confere só o `nonce`; a identidade (e-mail, `sub`) não é usada nem
  mostrada. A conferência pelo JWKS entra quando a tela mostrar a conta.
- **d. Renovar e não gravar** (o Anki morto entre os dois): o `refresh_token` novo se perde, e a pessoa entra de novo.
- **e. O modelo** é o primeiro da lista da conta (o “Automático” do #123, que ainda não tem tela). Sem custo em US$ nos registros:
  o plano não é pago por Cartão (a aba Custos com o plano é o #159).
- **f. Limite de uso, conta grátis e o primeiro 429 (#121)** param o Envio com o código (`chatgpt_usage_limit`,
  `chatgpt_not_eligible`, `chatgpt_rejected`) em Detalhes, sem cópia própria nem volta sozinha: são o #156 e o #158.
- **g. ACL no Windows**: herdada da pasta, como a da chave (`complemento/contrato/LEIA-ME.md`).
- **h. A página do retorno** é da Conexão, não do catálogo da Voz da extensão: “Pode fechar esta aba e voltar ao PerpetualMiner.”

## 6. Provas

| o quê | teste | o que não prova |
|---|---|---|
| a URL de autorização (cliente dinâmico, `agent_name_hint`, id do computador, escopos, `resource`, `redirect_uri` na porta da Conexão, `S256`), o retorno (`state` de uma vez, só a tentativa certa, só o `Host` de loopback, página fixa), a troca (o verificador que bate com o desafio), o escopo do plano, o `nonce`, a renovação, o Sair | `complemento/test_login_do_chatgpt.py`: o servidor real da Conexão, o servidor de login de mentira (`test_chatgpt_de_mentira.py`) | o servidor de login de verdade |
| os tokens só no arquivo: os valores do servidor de mentira não aparecem em nenhum outro arquivo de `user_files`, no log, no pacote de diagnóstico nem em resposta HTTP; o arquivo é 0600 | `test_login_do_chatgpt.py`, `test_plano_do_chatgpt.py` | Windows |
| o Cartão pela Responses API: o pedido tem `model` da lista, `instructions`, `input`, `store: false`, `stream: true`, sem `temperature`, com o `Bearer` do plano; o texto vem do stream; o login que acaba para o Envio | `test_plano_do_chatgpt.py`, `engine/test_openai_http.py` | a qualidade do Cartão e o consumo do Plus (risco 9) |
| o estado do login no contrato, nos dois lados | `complemento/contrato/exemplos-do-chatgpt.json`, `test_servidor.py`, `test_fake_anki.js`, `test_contrato_fechado.js` | — |
| a coluna, a linha, o login e o Sair com o fake | `e2e/tests/configuracoes-chatgpt.spec.js` | a tela de consentimento da OpenAI |
| a referência visual da coluna conectada | `e2e/tests/configuracoes-chatgpt.spec.js`, `test.fixme` sem PNG até o dono aprovar | a aprovação |
| um Cartão de texto feito pelo plano numa conta Plus ou Pro | ensaio do dono (#269) | — |
