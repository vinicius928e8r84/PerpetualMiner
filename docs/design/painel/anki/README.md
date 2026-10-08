# Painel · Conexão com o Anki: arrumação “Por idioma”

Resolução do ticket [Protótipo: Painel · Conexão com o Anki](https://github.com/vinicius928e8r84/PerpetualMiner/issues/13) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ela parte:
- do shell [Ilhas](../shell/README.md), com a mesma sidebar, o cabeçalho de área e os endereços;
- da identidade [Veio](../../identidade-veio/README.md);
- da [auditoria](../../auditoria/README.md) (“Painel · Anki Bridge”, Q8 e Q9). As sub-áreas seguem os nomes e a ordem do shell, **Custos · Baralhos e termos · Vocabulário · Ajustes de envio**, e não “Presets” primeiro, como a auditoria propunha;
- do [catálogo de voz](../../voz/README.md) (BRG-01…24, ENV-01, ENV-08, ENV-13, ENV-14 e ONB-16);
- da [Boas-vindas](../boas-vindas/README.md), de onde vêm a F1 (como ligar a Conexão) e o card ONB-16 da primeira vez.

**Protótipo:** [`prototipo-anki.html`](prototipo-anki.html). Abra direto no navegador.
- `?variant=C` é a arrumação travada e abre por padrão. `A` (Quadro) e `B` (Relatório) ficam como registro das alternativas.
- As setas ← → trocam a variante, e **T** alterna o tema.
- O painel “Estados do protótipo” simula:
  - a conexão ligada, conectando ou desligada;
  - carregando, erro ou vazio na aba aberta;
  - um envio em andamento;
  - baralhos lidos do arquivo local (BRG-13);
  - um baralho que não existe (BRG-14);
  - os três fins do Reparar Anki (BRG-16, 17 e 18).

Avaliado no Lavish em 2026-09-15. O dono escolheu a **C · Por idioma** (“gostei do C como favorito com só aquela parte do A”) e trouxe da A o card **Origem das imagens** do período (“a visão geral sem ser só única de um envio”).

## Ideia central

**O idioma é o eixo.** Em toda aba, um par de azulejos (Inglês | Russo, e “Todos os idiomas” em Custos) escolhe o recorte, cada um com o número principal do idioma. Onde há lista, ela é **lista × detalhe**: clicar num item abre o detalhe dele à direita.

## Por aba

| aba | arrumação |
|---|---|
| **Custos** | De cima para baixo:<br>1. Período em controle segmentado (Hoje · Este mês · Tudo) e De/Até à direita.<br>2. Azulejos **Todos os idiomas · Inglês · Russo**, cada um com o total e o nº de envios. O azulejo escolhido filtra tudo abaixo.<br>3. **Faixa de resumo**: criação de cartões, imagens geradas, economia com fotos reais, frases (N de M), envios concluídos (N de M).<br>4. **Origem das imagens do período** (vindo da A): as 4 barras (Foto real · Gerada por IA · Sem imagem · Falhou), com % e contagem, lado a lado.<br>5. **Envios recentes × detalhe**. À esquerda, a lista (título ENV-08, quando, ponto de status e custo). À direita, o envio escolhido: status, erro legível com Detalhes (V3), custo por parte (cartões · imagens geradas · escolha e triagem · total), imagens daquele envio e **Continuar envio** quando concluiu em parte ou falhou. |
| **Baralhos e termos** | Azulejos **Inglês · Russo** com o nº de palavras. Abaixo, o baralho escolhido: um **anel de maturidade** (maduros · recentes · novos) ao lado do número grande de “palavras diferentes nos cartões” e da lista cartões · termos-alvo · palavra nova por cartão · maduros · recentes · novos. |
| **Vocabulário** | Azulejos **Inglês · Russo** com o total de itens. Filtros tipo e status e a busca com lupa e um único × (Veio) para limpar. Abaixo, **lista × detalhe**: cada item com tipo, nº de cartões e selo de status; o detalhe mostra a barra maduros/recentes/novos e os números. |
| **Ajustes de envio** | Azulejos **Inglês · Russo** mostrando o baralho e a fonte de imagem atuais. Um formulário só, do idioma escolhido: Baralho (em branco volta ao padrão) e Imagens (Foto real (Google) · Gerada por IA, com a nota de custo) + **Salvar ajustes**. |

## Camada Avançado

Recolhida no pé da aba, com borda tracejada e um resumo do que tem dentro:
- **Custos:**
  - Escolha e Triagem de imagem com 4 casas, e o total com 4 casas;
  - chaves “Mostrar custos com 4 casas” e “Mostrar IDs dos envios”. São **poda**: escondem o que hoje aparece sempre, então são revestimento, não função nova;
  - a lista de envios com **Baixar diagnóstico** em cada um (BRG-23).
- **Baralhos e termos:** **Reparar Anki**, com uma frase dizendo o que ele faz. O botão também aparece no erro BRG-11.
- **Ajustes de envio:** o sotaque do áudio (palavra e frase) do idioma, escolhido pelo nome do lugar. A aba foi redesenhada em [`prototipo-ajustes-envio.html`](prototipo-ajustes-envio.html) (variante A · Cartões, escolhida pelo dono; B e C ficam de registro): um card por idioma, como os de Configurações, e o Baralho escolhido entre os do Anki.
- **Vocabulário:** não tem Avançado.

## Estados

| estado | como aparece |
|---|---|
| Conectando | Na primeira conferência, faixa neutra “Conectando ao Anki…” (BRG-02) e esqueleto no lugar do conteúdo. Uma porta que aceita mas não responde passa a Desligada em até 3 s da conferência, mesmo se a leitura do histórico de conexão demorar. |
| Nunca conectada (primeira vez) | Faixa ENV-01/F1 + **Tentar de novo** em cima. Enquanto nenhuma página deste computador recebeu `/health` ligado, **as abas dão lugar ao card ONB-16** “Ainda não houve conexão neste computador”, no desenho B (`prototipo-primeira-conexao.html?variant=B`, #74/#77): a lista dos passos ao lado do card do passo (o mesmo componente do passo 4 da Boas-vindas: **Você já tem o Anki?**, com as respostas **Já tenho o Anki** e **Ainda não tenho o Anki**, que traz o aviso do Anki com o site dele (#146), **Pôr a Conexão no Anki**, com o arquivo para baixar e o Detalhes “O arquivo não abriu?”, e **Reiniciar o Anki**, com a conferência e o “Achei o Anki · perfil · versão”; sem comandos de terminal; sem resposta em 2 minutos, o checklist de 3 itens e “Baixar de novo”), a linha “Confere sozinho a cada 15 s” e os quadros “Continua funcionando” / “Fica indisponível sem ela” (ver [Boas-vindas § Conexão com o Anki: como ligar](../boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1)). O passo escolhido pela pessoa permanece aberto após uma conferência sem sucesso e ao sair e voltar à área na mesma página. Se o painel recebe a primeira resposta ligada com o card visível, mostra Pronto antes de devolver as abas. Se o popup recebe a primeira resposta, mesmo com o painel aberto, o card sai sem Pronto; ao abrir o painel depois, as abas já estão lá. |
| Desligada | Faixa F1 + **Tentar de novo**. As abas mostram o último dado com o selo BRG-12, que traz o motivo (“Anki fechado. Mostrando dados de há 2 h.”): em Baralhos e termos e Vocabulário, sem “Detalhes”; em Custos, com o código em “Detalhes”. Com a Conexão ligada mas o Anki fechado (ela lê o arquivo do Anki e `/anki/status` confirma que não há processo dele), as duas abas mostram o mesmo selo, com a idade dos dados. Sem nenhuma leitura guardada, Baralhos e termos e Vocabulário dizem BRG-37, “— esperando o Anki” e “Começa depois que o Anki abrir uma vez.” Entrar na área nunca pede à Conexão que abra o Anki; só Atualizar e Tentar de novo, que a pessoa aperta. O botão Abrir o Anki é do #150. **Continuar envio** e **Reparar Anki** ficam indisponíveis, e o tooltip diz por quê (C8). Os Ajustes de envio continuam editáveis, com uma nota de que valem a partir do próximo envio. |
| Carregando | Linha com o gerúndio + esqueleto (C3): “Somando os custos…”, “Lendo os baralhos do Anki…” (BRG-10), “Lendo o vocabulário…” (BRG-19). |
| Erro | Inline e persistente, com **Tentar de novo** e Detalhes: BRG-04 (com “Custo indisponível”, BRG-03), BRG-11 (com Reparar Anki) e BRG-20. |
| Vazio | Custos: BRG-22 + “Ver tudo”. Vocabulário: BRG-21 + “Limpar busca”. |
| Arquivo local | Nota BRG-13 no topo de Baralhos e termos, com ponto parado. |
| Baralho não existe | O azulejo mostra “—” e “baralho não encontrado”, e o detalhe mostra BRG-14 com **Abrir Ajustes de envio**. |
| Reparar Anki | Enquanto repara, foco na espera BRG-15 e esqueleto; o Avançado desaparece, sem botão “Reparando…” na tela. Depois do sucesso, o foco volta ao botão do Avançado ou, se acionado pelo aviso BRG-11 (cujo botão some), vai ao azulejo do idioma escolhido após a releitura. Termina em toast “Anki reparado” (BRG-16) ou em erro inline BRG-17 (com ↻ Atualizar) ou BRG-18. |
| Envio em andamento | Selo “Enviando… · <etapa>” (ENV-07) na lista e no detalhe. |

O retry do card segue o [tratamento comum à F1 e ao passo 4](../boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1).

**Pronto no ONB-16:** o momento dura 1,8 s antes de as abas voltarem com o toast BRG-01. Uma nova tentativa nesse intervalo anuncia BRG-02 (texto e ponto) na linha de status, sem desfazer o marco: os títulos e os ✓ continuam, e o botão do card fica oculto. Se o foco estava num controle que sai ao entrar em Pronto, vai para o título do passo no card; quando o card sai com foco dentro, vai para a aba escolhida, já visível. A precedência de Conectando no Pronto tem cobertura em [`e2e/tests/conexao-na-tela.spec.js`](../../../../e2e/tests/conexao-na-tela.spec.js).

## Convenções

- **Dinheiro:** US$ com 2 casas na camada principal. Valor positivo abaixo de 1 centavo aparece como “< US$ 0,01”, nunca “US$ 0,00”. Com 4 casas ligado no Avançado, todos os valores passam a 4 casas.
- **Cores das barras e do anel:** ouro = foto real e maduros; `info` = gerada por IA e recentes; `muted` = sem imagem e novos; `danger` = falhou. Ficam iguais em todas as abas. O ouro e o `info` marcando séries são a **exceção de dataviz escrita no Veio**: vale só dentro do gráfico e da legenda dele; fora dali, o ouro continua só para a ação primária e a seleção.
- **Janela estreita:** azulejos, faixa e lista × detalhe viram uma coluna, e o detalhe cai para baixo da lista.

## Fica para outros tickets

- **Construção:** esforço separado depois da spec travada (fora do mapa).
