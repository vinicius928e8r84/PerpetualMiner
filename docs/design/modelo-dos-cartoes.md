# Página de desenho: o modelo dos cartões (#157)

Fatia MÉDIA pelo [modelo](modelo-fatia-alta.md): não guarda nem registra credencial (a chave e o login do ChatGPT seguem como no
[#154](../seguranca/chave-da-openai.md) e no [#155](login-do-chatgpt.md); aqui só se lê quem paga). O que entrega: no Avançado do
card IA dos cartões, o “Modelo dos cartões” é um seletor com a lista da conta, e o padrão é **Automático**. O modelo nunca fica fixo
no código: o Automático com o login é o primeiro da lista do plano, e com a chave é o do motor (`engine/config.json`; trocá-lo por um
mais barato corre à parte, fora do escopo do ticket), conferido contra a lista de saída: se o do motor já saiu, é o primeiro modelo que a conta da chave oferece (#292).

## 1. Dono único de cada dado

| dado | dono | o que a cópia nunca é |
|---|---|---|
| a escolha (`automatico` ou um modelo) e o que a Conexão trocou sozinha (`trocou: { de }`, a linha verde) | a Conexão: `user_files/modelo-dos-cartoes.json`, gravado de uma vez. Nada ali é segredo | uma cópia no navegador: a tela relê a Conexão e não guarda nada |
| a lista nossa: o que cada modelo faz (`texto`, `foto`) e o dia em que a OpenAI o tira do ar (`saida`, ou `null`) | `complemento/modelos_da_ia.json`, que viaja com a extensão (dentro da Conexão, no `.ankiaddon`) | uma lista na tela ou no motor |
| a lista da conta | a OpenAI: `GET /v1/models` com a chave (só modelos de texto que veem foto, pela lista nossa) ou com o login (a lista do plano, `visibility: list`) | guardada: lida a cada leitura e uma vez por Envio |
| quem paga | o login do ChatGPT, se há; senão a chave; senão ninguém | escolhido pela pessoa aqui: o Envio nunca troca um pelo outro sozinho (#155) |

## 2. O que a tela diz

- **Sem chave e sem login:** o Avançado não aparece (só o Automático valeria). **Com a Conexão desligada ou antiga:** também não: nada se afirma da lista.
- **Com a chave:** o seletor (Automático e os modelos de texto que veem foto que a conta tem) e, embaixo, “Pago pela sua chave”.
- **Com o login:** a lista do plano e, embaixo, a linha do #155: “Usando o plano do ChatGPT · Gerenciar uso”.
- **Antes da saída** de um modelo escolhido: o aviso âmbar com a data, **Trocar agora** (escolhe o Automático) e **Escolher outro** (leva ao seletor). O Avançado abre sozinho quando há aviso ou troca a contar, a menos que a pessoa o tenha fechado.
- **Depois da troca:** a linha verde “O {modelo} saiu do ar. O Envio passou para o Automático.”, até a pessoa escolher outro modelo. Se o modelo caiu porque quem paga mudou (o login que acabou, ou entrou, e a conta nova não o tem), a linha é outra: “A forma de pagar mudou e a nova não tem o {modelo}. O Envio passou para o Automático.” A Conexão guarda quem pagava na escolha (`paga`) para saber.
- **A lista da conta não veio** (a OpenAI fora do ar, o login que acabou): a linha “Não deu para ler os modelos da sua conta. Tente de novo.” com Tentar de novo, sem seletor.

## 3. Transições

| transição | quem pede | o que lê | o que muda | o que não muda |
|---|---|---|---|---|
| ler | o painel: `POST /ia/modelo/estado` | a escolha, quem paga e a lista da conta, o dia de hoje | nada | o arquivo: ler **nunca grava**; depois da data a leitura já diz o Automático e a troca, e o Envio é quem a guarda |
| escolher | o painel: `POST /ia/modelo/escolher` (o seletor, Trocar agora) | a lista da conta (o modelo tem de estar nela e não ter saído) | a escolha, e apaga o `trocou` | repetir dá a mesma resposta e o mesmo arquivo |
| o Envio | a thread de trabalho, no primeiro Cartão de cada Envio | a escolha e a lista da conta | se a escolha caiu, guarda `automatico` e `trocou: { de }` e **segue**; o resto do Envio usa o Automático | o Envio não para por causa de um modelo |

A escolha **cai** em dois casos: o dia de hoje chegou à `saida` do modelo (na lista nossa), ou a conta deixou de oferecê-lo antes da data
(“se um modelo sumir antes da data, o Envio troca na hora e avisa depois”). Se a lista da chave não vem durante um Envio, vale a escolha
da pessoa, sem conferir a conta; só a data a derruba. Com o login, a lista que não vem para o Envio como já parava (`chatgpt_*`, #155).

## 4. Variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão, ou Conexão antiga (`404`) | o Avançado não aparece; o Envio da Conexão antiga usa o motor |
| 2 | Anki fechado | igual à 1; a escolha guardada volta com o Anki |
| 3 | o modelo escolhido já saiu quando se abre a tela | a leitura mostra o Automático e a linha verde; o seletor não o oferece |
| 4 | dois computadores | cada Conexão guarda a escolha do seu computador (não vai pela conta Google) |
| 5 | pedido repetido | `escolher` repetido responde igual e não regrava; `estado` é leitura |

## 5. Limites aceitos

- **a. A data de saída vem de uma lista nossa** (a proposta do worker, no ticket): ela só sabe o que alguém escreveu. A de fábrica não tem datas
  (`saida: null`), porque a OpenAI ainda não anunciou nenhuma para estes modelos: o dono põe cada data aqui quando ela sair
  (<https://platform.openai.com/docs/deprecations>), e o aviso e a troca passam a valer sem mais código. Até lá só vale a troca de um modelo que some da conta.
- **b. Risco 9 (#138):** a lista do plano não bate com a doc, e não se sabe se ela traz a data de saída. Por isso a data vem só da lista nossa, também para o plano.
- **c. Os modelos da chave** são os que o motor chama com `temperature` (`gpt-4o`, `gpt-4.1` e suas variantes menores): um modelo que a recusa não entra na lista nossa.
- **d. Fora do escopo:** o Automático com a chave não troca o `gpt-4o`/`gpt-4.1-mini` do motor por um modelo mais barato.
- **e. A origem não autentica (#192):** um processo local que declara a origem da extensão pode ler a escolha e a lista, ou trocar a escolha. Nada ali é segredo.

## 6. Provas

| o quê | teste | o que não prova |
|---|---|---|
| o Automático (motor com a chave, primeiro do plano com o login), a escolha, a troca no dia, a que some da conta, ler sem gravar, a lista de texto com foto, a lista nossa | `complemento/test_modelo_dos_cartoes.py`: o servidor real, a thread do Envio, a OpenAI de mentira na fronteira HTTP, o relógio que o teste dá à Conexão | a OpenAI de verdade |
| o estado e a escolha no contrato, nos dois lados | `complemento/contrato/exemplos-do-modelo.json`, `test_servidor.py`, `test_fake_anki.js`, `contrato-da-conexao.spec.js`, `test_contrato_fechado.js` | — |
| o Avançado, o aviso âmbar, Trocar agora, Escolher outro, a troca no dia pelo Envio e a linha verde (relógio parado) | `e2e/tests/configuracoes-modelo.spec.js` | o Envio de verdade (é o `unittest`) |
| a referência visual do Avançado, do aviso e da linha verde | `e2e/tests/configuracoes-modelo-visual.spec.js`, `test.fixme` sem PNG até o dono aprovar | a aprovação |
