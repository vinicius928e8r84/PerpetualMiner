# Página de desenho: a IA dos cartões como porta (C5, quem paga cada pedido)

Fatia ALTA pelo [modelo](modelo-fatia-alta.md): mexe em por onde passa a credencial (a chave da OpenAI e o login do ChatGPT), sem
mudar onde ela mora nem quem a guarda ([#154](../seguranca/chave-da-openai.md), [login-do-chatgpt.md](login-do-chatgpt.md)). A decisão
de quem paga cada pedido pago estava em seis lugares (`modelo_dos_cartoes.py`, `imagem_do_cartao.py`, `correcao_da_criacao.py`,
`audio_do_cartao.py`, `rotas_da_voz.py`, `limite_do_plano.py`); passa a ser uma tabela só, `complemento/ia_dos_cartoes.py`, e a
porta `IaDosCartoes` é quem lê o login e o cofre para o Envio e para as rotas.

## Quem paga cada pedido

| etapa (`ia_dos_cartoes`) | pedido | com login do ChatGPT | sem login, ou Usar a minha chave | sem chave |
|---|---|---|---|---|
| `texto` | o texto do Cartão | o plano; login acabado: o Envio para, mesmo com chave | a chave | o Envio para: `openai_key_missing` |
| `correcao` | a correção da Criação | como o texto | a chave | pula, sem erro |
| `juiz` | o juiz da imagem | o plano | a chave | sem plano também: sem imagem |
| `imagem` | a triagem e a imagem gerada | a chave, sempre | a chave | só a foto real, ou nenhuma |
| `voz` | a voz de reserva | a chave, sempre | a chave | sem reserva |
| `ouvir` | o Ouvir (a amostra da voz da OpenAI) | a chave, sempre | a chave | 409 `openai_key_missing` |

`quem_paga_a_etapa` dá `plano`, `chave` ou `parado` (ninguém paga, com o motivo); o que a etapa faz parada (a última coluna) é dela.
O plano não cobre voz nem a imagem gerada; o Usar a minha chave (#158) vale até com o login acabado. `test_ia_dos_cartoes.py` é esta
tabela, com o login e o cofre reais numa pasta temporária.

## 1. Dono único de cada dado

| dado | dono | o que a cópia nunca é |
|---|---|---|
| a chave da OpenAI | o cofre (`chaves.py`, `user_files/chaves/openai.json`) | guardada pela porta: ela relê o cofre a cada pedido |
| o login do ChatGPT | `login_do_chatgpt.py` (`chaves/chatgpt.json`) | guardado pela porta: ela pede a `situacao()` e o `token()` a cada pedido |
| a escolha Usar a minha chave | o estado do Envio (`usingKey`) | lembrada pela porta: o Envio a passa a cada pedido |
| o modelo do texto deste Envio | a porta (`novo_envio` o esquece no começo de cada Envio) | gravado: some com o Envio |
| quem paga cada etapa | `quem_paga_a_etapa` | decidido de novo numa etapa ou numa rota |

## 2. Estados

Os três do login (sem login, conectada, acabou) vezes a chave (guardada ou não) vezes o Usar a minha chave. A tela não muda: o que ela
diz em cada um continua em [login-do-chatgpt.md](login-do-chatgpt.md) e [modelo-dos-cartoes.md](modelo-dos-cartoes.md).

## 3. Transições

Nenhuma nova. A porta não grava credencial nem login: o login renovado pelo `token()` e o login que acaba seguem dele
(`login_do_chatgpt.py`), e a troca do modelo que caiu segue do `ModeloDosCartoes.do_envio`. Um pedido repetido relê os dois donos e dá o
mesmo pagador. O que ela grava é a linha de custo de cada texto pago, depois da resposta, como o motor fazia: uma resposta perdida não
anota custo, e o texto que não chegou ao disco é pedido de novo, como antes.

## 4. As 8 variantes

Sem mudança de rota nem de contrato: a extensão não vê a porta. As variantes 1 a 4 (sem Conexão, Anki fechado, Conexão antiga, a
bridge Flask) e a 6 (quem vem da `main`) não passam por ela. A 5 (dois perfis numa Conexão) segue o cofre e o login, que são um por
Conexão. A 7 e a 8 estão na seção 3.

## 5. Limites

Os da chave ([chave-da-openai.md](../seguranca/chave-da-openai.md)) e os do login ([login-do-chatgpt.md](login-do-chatgpt.md)), sem
nenhum novo. O texto do Cartão e a correção da Criação a porta pede ela mesma (`pedido_do_texto`: a credencial, o pedido pela camada de
provedores do motor e o custo no `costs.jsonl` do Envio, no formato de sempre; o da correção à parte), e o motor só recebe a função
`pedir`. Na imagem, a chave chega ao motor presa (`provedores.PelaChave`: a triagem e a imagem gerada pedem por ela) e o juiz chega
pronto (`JuizDaImagem.julgar`: o plano, ou a chave sem plano ou quando o plano recusa de passagem): o `config` do motor não leva segredo
nenhum. A voz de reserva e o Ouvir são da Conexão e recebem a chave na chamada. A credencial tem um formato só, o da camada de
provedores do motor (`{provedor, segredo, modelo}`, mais `via: "plano"`): o `Pagador` do texto e o plano do juiz a levam assim, e só a
porta lhe põe o endereço.

## 6. Provas

A tabela, a leitura do que está guardado e o texto pedido pela porta (pela chave e pelo plano, com o custo que fica): `complemento/test_ia_dos_cartoes.py`; o motor com um roteiro de respostas no lugar da rede: `engine/test_generate_cards.py`. O caminho inteiro, com o servidor real e a OpenAI de
mentira: `test_quem_paga.py`, `test_imagem_pelo_plano.py`, `test_voz_de_reserva.py`, `test_ouvir_a_voz.py`, `test_limite_do_plano.py`
e os `test_envio*.py`. Não provam o login real nem a OpenAI real.

## O que veio depois (C4)

O motor já escreve um Cartão por chamada (`generate_cards.escrever`: o texto que já está no disco não é pedido de novo), sem as opções de lote. O Motor
do Cartão (`complemento/motor_do_cartao.py`) tem as duas entradas, `escrever(cartao, ia)` e `montar(cartao, texto, ia, avisar)`, e as duas pedem à
porta presa ao Envio (`complemento/ia_do_envio.py`): ela lê o Usar a minha chave do Envio a cada pedido e conduz o teto do mês e o limite do plano,
com o `waiting` do estado pela `limite_do_plano.EsperaDoEnvio`. O `Trabalho` não herda mais nada: a correção da Criação (`CorrecaoDaCriacao.corrigir`)
pede à mesma porta, e o tipo de nota é um valor do Envio (`TipoDoEnvio.conferir`), conferido uma vez no começo. Com isso o C4 está feito; o que
ficou de fora é a #11 (outros provedores).
