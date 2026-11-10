# Pareamento da Conexão com o Anki (#192)

Página de desenho de uma fatia ALTA (formato de [`modelo-fatia-alta.md`](modelo-fatia-alta.md), seções 1 a 6), escrita antes do código e mantida com ele. O dono escolheu
a **opção A, o código mostrado no Anki e digitado no Painel** (09/11/2026), sem período de graça, com o desfazer pela janela do Anki (“Desconectar navegadores”). As opções
B (botão Permitir) e C (o abridor entrega o segredo) ficaram no relatório do #192 e mudam só a seção 3 (como o segredo nasce).

Onde está cada peça: o complemento em [`complemento/pareamento.py`](../../complemento/pareamento.py) (o porteiro é `servidor.py` › `_pedido_aceito`), a extensão em
[`lib/pareamento.js`](../../lib/pareamento.js) (o porteiro é `PedidoAoAnki.pedir`), a faixa do Painel em `painel-conexao-versao.js`, o diálogo e o botão no Anki em
`complemento/janela.py` e `qt_do_anki.py`. O contrato (rotas, cabeçalhos, exemplos): [`complemento/contrato/o-pareamento.md`](../../complemento/contrato/o-pareamento.md).

Ideia central em uma frase: **o segredo de pareamento nasce na Conexão, chega à extensão uma única vez, depois que a pessoa
digita no painel um código que só o Anki dela mostrou, e nunca mais trafega.** Cada pedido vai assinado com HMAC-SHA256, e
cada resposta volta assinada. O `Origin` continua sendo exigido, como camada contra páginas web, mas deixa de ser a fronteira.

Por que não um token simples no cabeçalho: quando o Anki está fechado, qualquer processo pode ocupar a 8766. Esse impostor
receberia o token no primeiro pedido privado (o painel pede `/ia/estado` a cada saúde OK) e passaria a ser um cliente válido da
Conexão real. Com o token simples, o risco do listener impostor vira risco do cliente. Com a assinatura, o impostor só vê HMACs,
de que não se tira o segredo.

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| segredo de pareamento `S` (32 bytes aleatórios, um por navegador pareado) | a Conexão: `user_files/pareamento.json` (`{ versao: 1, clientes: [{ cliente, segredo, nome, criadoEm }] }`, no máximo 5, gravado de uma vez, 0600 em POSIX) | a extensão: IndexedDB `pm-pareamento`, loja `conexao`, como `CryptoKey` HMAC **não extraível** (`extractable: false`) mais o `cliente` | `chrome.storage.local` (o content script lê), log, pacote de diagnóstico, `.ankiaddon`, URL ou corpo de resposta (salvo a resposta única do `concluir`) |
| `cliente` (UUID que a extensão sorteia ao parear) | a extensão | a Conexão, como chave da linha | segredo: é só um nome |
| código de pareamento `C` (6 caracteres de um alfabeto sem ambíguos, ~30 bits) | a Conexão, só na memória, por 5 minutos, até 5 tentativas | o diálogo do Anki (na tela) e o campo do painel enquanto a pessoa digita | arquivo, log, `GET /health`, resposta HTTP |
| `sessao` (aleatória, nasce a cada subida da Conexão) | a Conexão, só na memória | a memória de cada página e do service worker, depois de um `conferir` provado | guardada em disco; aceita de outra subida |
| `nonce` de cada pedido | o pedido em curso | nenhum | reaproveitado |

## 2. Estados

Do lado da extensão (o `ConexaoAnki` ganha a nuance; texto pela Voz, regra C8: a tela diz o estado verdadeiro):

| estado | quando | o que a tela diz (texto proposto, entra pelo catálogo) |
|---|---|---|
| desligada | `/health` não responde (como hoje) | o mesmo de hoje |
| a parear | `/health` OK e **nenhuma credencial guardada** (este navegador nunca se pareou) | “Conecte este navegador ao Anki” + botão **Conectar** |
| esperando o código | `comecar` respondeu; diálogo aberto no Anki | “Digite o código que apareceu no Anki” + campo + **Confirmar** |
| ligada | `conferir` provado (HMAC certo) nesta subida da Conexão | o “Ligada” de hoje. **O ponto da Conexão na barra lateral (e o texto dele) só diz ligada assim**: sem pareamento ele diz o texto de “a parear” e, com uma porta que não provou nada, o de “não confirmada” (`ConexaoAnki.apresentada()`) |
| não confirmada | `/health` OK, mas `conferir` voltou sem prova válida (impostor, Conexão de outro usuário do computador, prova errada) | “Algo na porta do Anki não se confirmou. Nada foi enviado.” + Tentar de novo |
| Conexão antiga | `conferir` → 404 (complemento sem pareamento, ou o bridge) | o aviso de atualizar que já existe (variantes 3/4); **nada privado é enviado** |

Do lado da Conexão: sem nenhum cliente; com clientes; com um código pendente (o diálogo aberto); código esgotado (5 erros) ou
vencido.

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| **começar** `POST /pareamento/comecar {}` | painel (botão Conectar) | `Origin` da extensão | a Conexão | cria `C` (ou reaproveita o pendente) e abre no Anki o diálogo ANK-05 com `C` e Cancelar | nenhum cliente é criado; `C` não volta na resposta |
| **concluir** `POST /pareamento/concluir { codigo, cliente, nome }` | painel (Confirmar) | `C` pendente, tentativas < 5 | a Conexão, com `hmac.compare_digest` | grava `{cliente, S}` em `pareamento.json` (sai o mais antigo se passar de 5), fecha o diálogo, responde `{ cliente, segredo }` | um código errado não grava nada; no 5º erro o código morre e o diálogo diz isso |
| **conferir** `POST /pareamento/conferir { cliente, desafio }` | `ConexaoAnki`, depois de cada `/health` OK e antes de todo pedido que leva segredo | cliente conhecido | a Conexão | nada: responde `{ sessao, prova: HMAC(S, "pm1 servidor" ‖ desafio ‖ sessao) }`; a extensão confere | nenhum estado muda; serve só para provar o listener |
| **pedido privado** (todas as rotas de hoje, menos `/health` e as páginas) | `PedidoAoAnki.pedir` | `S`, `sessao` provada | `_pedido_aceito` em `servidor.py` (um lugar só, antes de escolher a rota) | o que a rota já faz | sem assinatura ou com assinatura errada a rota nem roda: `401` (`pairing_required`, `pairing_invalid`, `session_expired`) |
| **resposta** | a Conexão (`_responder`) | a assinatura do pedido | `pedir`, que confere antes de devolver a resposta a quem chamou | nada | uma resposta sem prova válida é tratada como “não confirmada”, nunca como dado |
| **desconectar navegadores** | a pessoa, no Anki (janela PerpetualMiner…, ANK-02) | — | a Conexão | esvazia `clientes` | os Envios, a chave e o resto ficam |

Assinatura do pedido (cabeçalhos `X-PerpetualMiner-Cliente`, `-Sessao`, `-Nonce`, `-Assinatura`):
`HMAC-SHA256(S, "pm1\npedido\n" + sessao + "\n" + nonce + "\n" + MÉTODO + "\n" + caminho + "\n" + sha256hex(corpo))`.
Prova da resposta (`X-PerpetualMiner-Prova`, exposta por `Access-Control-Expose-Headers`):
`HMAC-SHA256(S, "pm1\nresposta\n" + sessao + "\n" + nonce + "\n" + status + "\n" + sha256hex(corpo da resposta))`.
Os rótulos `pedido`, `resposta` e `servidor` separam os usos: a prova que a Conexão dá a qualquer um no `conferir` não serve para
assinar um pedido. Os dois lados são do mesmo computador, então não há relógio a combinar. A `sessao` da subida é o que impede um
impostor de guardar um pedido assinado e repeti-lo depois na Conexão real: na subida seguinte a `sessao` é outra. A troca de
nomes funciona com a biblioteca padrão do Python 3.9 (`hmac`, `hashlib`, `secrets`) e com o WebCrypto; a prova de interoperabilidade
está no relatório (§ Evidências).

Falhas, sem exceção:

- **Atômico:** a gravação de `pareamento.json` usa a escrita de uma vez que o complemento já tem (`gravacao_de_json.py`), sob uma
  tranca. O cliente só existe depois de gravado; a resposta do `concluir` sai depois disso.
- **Resposta do `concluir` perdida:** o mesmo `{codigo, cliente}` repetido enquanto o código vale devolve **o mesmo** `S`
  (idempotente, como a regra `repetivel` do contrato exige), sem gravar de novo. Outro `cliente` com um código já usado → `409 pairing_code_used`.
  Depois de 5 minutos, a pessoa recomeça; a linha órfã sai pelo teto de 5 ou pelo Desconectar.
- **Conexão cai entre o `conferir` e o pedido:** o pedido seguinte leva uma `sessao` que a nova subida não conhece → `401 session_expired` → `pedir`
  refaz o `conferir` uma vez e repete. Se no lugar entrou um impostor, ele não prova o `conferir` → “não confirmada”.
- **Reverter:** só a pessoa, por dois caminhos: Desconectar navegadores no Anki (todos) ou parear de novo (substitui o daquele navegador).
  A extensão **não** apaga a credencial por um `401` sem prova (um impostor não pode desparear ninguém); um pareamento novo a substitui (o mesmo `cliente`, a mesma linha).
- **Sem período de graça:** a Conexão nova recusa pedido sem assinatura desde a primeira versão; a extensão nova recusa falar
  o privado com uma Conexão sem `/pareamento/conferir` (senão um impostor se passaria por “versão antiga” para receber tudo).

## 4. As 8 variantes

| # | variante | com o pareamento |
|---|---|---|
| 1 | sem Conexão | nada a parear; o painel diz desligada, como hoje; nenhum pedido privado sai |
| 2 | Anki fechado | idem. **Variante nova, 2b: impostor na 8766** (responde `/health` OK): o `conferir` não se prova → “não confirmada”; o fake grava o que recebeu, e o teste exige que não haja `chave`, `token`, `entries` nem `/ia/chatgpt/entrar` atendido |
| 3 | complemento antigo | `conferir` → 404: pede atualização, nada privado sai (antes, a extensão mandava pedidos privados a ele) |
| 4 | bridge Flask na 8766 | idem 3 |
| 5 | dois perfis ou contas numa Conexão | cada perfil do Chrome pareia sozinho (o seu `cliente`, o seu `S`); a Conexão guarda os dois; desparear um não desparea o outro, salvo o Desconectar de todos |
| 6 | quem vem da `main` | a extensão sem credencial cai em “a parear” uma vez; Envios, chave e Frases ficam; o reenvio da chave legada a cada saúde **para** até o pareamento (ele vira pedido com segredo) |
| 7 | resposta perdida ou painel fechado | `concluir` idempotente (§ 3); painel fechado no meio: o diálogo do Anki vence em 5 min ou com Cancelar |
| 8 | pedido repetido | cada tentativa leva `nonce` novo e é assinada de novo; o contrato repete os `POST` 2xx assinando cada vez; o `concluir` repetido devolve o mesmo `S` |

## 5. Limites aceitos (a confirmar pelo dono na escolha da opção)

- **L1. Programa do mesmo usuário do sistema:** quem roda como a pessoa lê `user_files/pareamento.json` e o perfil do Chrome em disco,
  como já lê `user_files/chaves/openai.json`. Nenhum pareamento local fecha isso. O Keychain do Mac ou o DPAPI do Windows não estão neste corte (o DPAPI não protege do mesmo usuário).
- **L2. Administrador/root e escuta do loopback:** fora do alcance. O `S` passa pelo loopback uma vez, no `concluir`.
- **L3. ACL do Windows:** `pareamento.json` herda a ACL da pasta, como a chave (limite já escrito em `docs/seguranca/chave-da-openai.md`).
- **L4. Corrida de milissegundos:** a Conexão real cai logo depois de um `conferir` provado, e um impostor ocupa a porta antes do pedido com segredo.
  O `conferir` fresco antes de cada pedido com segredo deixa a janela no tempo de um pedido local.
- **L5. Incômodo, não vazamento:** um processo pode ocupar a 8766, abrir o diálogo do código no Anki ou gastar as 5 tentativas de um código. A falha fica visível e nada
  vaza. **Há teto para o código novo** (o review do #192 mediu 400 palpites por segundo sem ele, uns 4 % de acerto por dia): cinco tentativas valem por código, mas o
  `comecar` só sorteia outro enquanto não houver `CODIGOS_ESGOTADOS_PARA_BLOQUEAR` (3) códigos seguidos que gastaram as tentativas sem que ninguém pareasse; depois disso
  responde `429 pairing_locked` por 15 minutos, sem código e sem diálogo. São 15 palpites a cada 15 minutos, uns 1.400 por dia: 2 chances em um milhão por dia em 31^6.
  O preço é um incômodo visível (quem insiste bloqueia o próprio Conectar por 15 minutos, e o Painel diz o texto aprovado “Algo na porta do Anki não se confirmou”). O diálogo é um
  só por vez: o pedido repetido com ele à vista não o traz de novo, e o fechado é destruído (`deleteLater`).
- **L6. Páginas abertas:** `GET /health` (versão e perfil) e o retorno do login do ChatGPT (`/auth/callback`, navegação, protegido por `state` e PKCE) seguem sem credencial.
- **L7. Quem digita um código que não viu:** com o Anki fechado e um impostor na 8766, o Conectar “funciona” (o impostor responde ok) e nenhum diálogo aparece no Anki; quem digita qualquer coisa pareia com o impostor, e a extensão não tem como saber. O passo “o código apareceu no Anki” é da pessoa; é ele que faz o código autenticar a Conexão. **Quem já estava pareado** não cai nisso sozinho: o `401 pairing_required` sem prova (do impostor, e também da Conexão verdadeira depois do Desconectar ou de perder o registro) não leva a tela a pedir o pareamento; ela diz “Algo na porta do Anki não se confirmou. Nada foi enviado”, com Tentar de novo e, **por escolha da pessoa**, Conectar (o único caminho de volta). Só quem aperta esse Conectar e digita um código que nunca viu pareia com o impostor. Um registro revogado que sobrevivesse ao Desconectar não entra nesta fatia e não cobriria o registro perdido.
- **L9. A Conexão que se diz antiga:** um impostor que responde 404 ao `conferir` recebe o Atualizar agora e o Reiniciar o Anki (`{}`), e nada mais. Ele não restarta o Anki de ninguém; no máximo mostra um aviso de atualização que a pessoa pode ignorar.
- **L8. A janela da leitura:** um pedido que só lê (sem chave, token nem Frases) reaproveita a sessão que a Conexão provou há menos de 20 s. Se ela cair e um impostor ocupar a porta nesse intervalo, ele vê o pedido assinado (a sessão e o nonce não servem em outra Conexão) e responde sem prova, que a extensão recusa. O pedido que leva a chave, o token, as Frases ou o UID pede um `conferir` novo antes.

## 6. Provas

| o quê | teste (CI) | o que o teste não prova |
|---|---|---|
| toda rota privada recusa sem assinatura, com assinatura errada e com `sessao` velha; aceita a certa | a matriz `EstadosDeCadaRota` de `test_servidor.py` ganha a coluna “credencial” e roda por todas as rotas de `ROTAS` (rota nova é coberta sem declarar nada) | — |
| o limite de hoje vira exigência | `test_limite_conhecido_…` em `test_servidor_leitura.py` passa a esperar `401` para o cliente que só forja o `Origin` | uma extensão real com `extraHeaders` |
| contrato | `test_servidor.py` assina por padrão os exemplos com `origem` da extensão; exemplos novos de `401`, `pairing_*`, `comecar`, `concluir`, `conferir`; `test_contrato_fechado.js` ganha as variantes novas de `PedidoAoAnki` | — |
| pareamento pelo painel | e2e com o fake (`fakes.anki.pareamento.codigoNoAnki()` lê o código “mostrado”): Conectar → código → ligada; código errado 5× → esgotado; vencido | o diálogo Qt real |
| impostor (variante 2b) | e2e: um fake impostor na porta; lê o que ele recebeu; o painel diz “não confirmada”; a aba do ChatGPT não abre | um impostor real noutro usuário do sistema |
| guarda | e2e: a credencial não está em `chrome.storage.local`; `pacote de diagnóstico` e log sem `segredo`; `test_empacotar.js` sem `pareamento.json` | LevelDB em disco |
| interoperabilidade HMAC | um teste Node + Python com o mesmo vetor (o do relatório) | — |
| fixtures do e2e | os testes começam pareados: a fixture `extensao` guarda a credencial no IndexedDB e o fake (ou o complemento real) conhece o navegador; `test.use({ pareada: false })` pareia pela tela | — |

**Prova real (fora do CI, pelo dono ou num ensaio)** — num Mac com Anki e Chrome de verdade e o pacote da loja:

1. **Parear pela tela:** Conectar → o código aparece no Anki → digitar → conectado (tooltip no Anki). Errar 5 vezes → o código morre e o diálogo fecha.
2. **Cliente forjado:** no Terminal, `curl -X POST -H 'Origin: chrome-extension://ohpoogiccjmdgilgegholdidgfhjkadf' -H 'Content-Type: application/json' -d '{"deck":"<baralho>","lang":"en"}' http://127.0.0.1:8766/anki/vocabulary` → `401` (antes: `200` com o vocabulário).
3. **Impostor:** fechar o Anki; subir na 8766 um servidor que responde OK a tudo e grava o que recebe; abrir o Painel, esperar 60 s, tentar Enviar, Entrar com o ChatGPT e sincronizar a chave. O registro dele **não** pode ter `chave`, `token` nem `entries`, a aba do ChatGPT não abre e o Painel diz “não confirmada”.
4. **Dois perfis do Chrome** pareiam cada um o seu. “Desconectar navegadores” na janela do Anki → os dois pedem o código de novo.
5. **Windows** (Chrome e Opera GX): os passos 1 a 3, com `Invoke-WebRequest` no 2.
6. **Quem vem da `main`:** um testador atualiza o complemento (AnkiWeb) e a extensão; pareia uma vez; os Envios, a chave e as Frases continuam lá.

## 7. O que ficou diferente do desenho de partida

Decisões do código, para a revisão não as achar por acidente:

- **O banco da credencial é `pm-pareamento`, não `pm-segredos`.** A migração e o Apagar tudo da chave da OpenAI apagam o banco `pm-segredos` inteiro (`lib/chave-da-openai.js`); a
  credencial do pareamento não é dado da pessoa e não pode sumir com ele.
- **Um cabeçalho a mais, `X-PerpetualMiner-Sessao`:** separa `session_expired` (assinado numa subida anterior) de `pairing_invalid` (assinatura errada).
- **O nonce repetido é recusado** (`pairing_invalid`) na sessão, com os últimos 8192 lembrados; o nonce é de 128 bits.
- **Cinco erros** matam o código: o quinto já responde `410 pairing_code_expired` (“O código venceu. Peça outro”) e o diálogo do Anki fecha; os quatro primeiros, `401 pairing_code_wrong` com `restam`.
- **`concluir` repetido** devolve o mesmo segredo só enquanto o código usado vale, o navegador é o mesmo **e** a linha dele ainda está em `pareamento.json` (depois do Desconectar, não); começar um
  código novo esquece o anterior.
- **A faixa do Painel mora em `painel-conexao-versao.js`**, junto do aviso de versão. O popup lê o estado (`ConexaoAnki.pareamento()`), mas não desenha nada.
- **A Conexão antiga** (404 no `conferir`) cai no aviso de versão (BRG-50) seja qual for a versão que diz, e nenhum pedido privado sai para ela. **Só dois saem, sem assinatura e com corpo `{}`**: Atualizar agora e Reiniciar o Anki (`daConexaoAntiga` em `PedidoAoAnki`): sem eles a Conexão velha nunca sairia da versão velha, e eles não levam dado da pessoa.
- **O pedido que leva dado da pessoa pede um `conferir` novo** (a chave, o token, a chave legada, as Frases); a leitura reaproveita a sessão provada há menos de 20 s.
- **O ponto da Conexão só fica verde com a Conexão provada** (a revisão do #192): `ConexaoAnki.apresentada()` é a situação como a tela a diz (`ligada`, ou `a_parear` / `nao_confirmada`);
  o shell, o texto dele e as abas de Custos e de Baralhos e termos a usam. As outras telas seguem a situação do `/health` e ganham 401 do `pedir` nos pedidos que fazem.
- **Quem já estava pareado e recebe `401 pairing_required` sem prova vê “não confirmada”, não “a parear”** (a revisão do #192; L7). Parear de novo é um segundo botão, Conectar.
- **O teto do código novo** (L5): três códigos esgotados seguidos bloqueiam o seguinte por 15 minutos (`429 pairing_locked`).
- **Texto**: o único texto novo do Painel é o BRG-52 (os que o dono aprovou); o do Anki é o ANK-05 e o botão do ANK-02. “Algo na porta do Anki não se confirmou” também serve quando o Anki não
  consegue abrir o diálogo (não há texto aprovado para isso).

Seguem fora desta fatia: as regras do Firestore (P6), a retenção dos Envios (#243), um “Desconectar” no Painel e o período de graça. O diálogo, o tooltip e o botão do Anki só têm prova de mentira no CI (§ 6).
