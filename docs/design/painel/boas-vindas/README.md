# Onboarding e primeira execução: “Boas-vindas”

Resolução do ticket [Protótipo: onboarding & primeira execução](https://github.com/vinicius928e8r84/PerpetualMiner/issues/10) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele herda:
- a identidade [Veio](../../identidade-veio/README.md);
- o [popup Cockpit](../../popup/README.md) e o [shell Ilhas do Painel](../shell/README.md);
- os nomes e a cópia do [guia de voz & catálogo](../../voz/README.md) (regras V1–V10 e C1–C9).

**Protótipo:** [`prototipo-onboarding.html`](prototipo-onboarding.html). Abra direto no navegador.
- `?variant=C` é a estrutura travada (padrão). `A` (Vazios que ensinam) e `B` (Primeiros passos) foram as alternativas. O protótipo registra a decisão de layout, mas os controles dos passos 3–7 foram revisados depois: para esses estados, valem [Os passos](#os-passos) e a [F1](#conexão-com-o-anki-como-ligar-f1), não as ações antigas do protótipo.
- É uma janela do Chrome falsa: o ícone da extensão abre o popup, e o Painel roda no shell Ilhas.
- O painel “Estados do protótipo” simula a instalação nova, Alt+S num vídeo, a mineração automática, a Conexão com o Anki instalada ou não, a conta, o atalho e a chave.
- As setas ← → trocam a variante, e **T** alterna o tema.

Avaliado no Lavish em 2026-09-15, numa rodada de 5 perguntas.

## Decisão

| pergunta | escolha |
|---|---|
| Estrutura | **C · Boas-vindas**: uma página própria, um passo por vez, com o controle real dentro de cada passo. A (vazios que ensinam, sem guia) e B (checklist no topo de Frases) ficaram de fora. |
| Ordem dos passos | **Valor primeiro** (ver [Os passos](#os-passos)). |
| Na instalação | **Abre a página Boas-vindas sozinha.** Isso é comportamento novo e **entra na lista fechada** (item 8). |
| Como ligar a Conexão com o Anki | O passo 4 e o card ONB-16 da área montam [o mesmo componente](#conexão-com-o-anki-como-ligar-f1) (#99, #145): pôr a Conexão no Anki por um arquivo e reiniciar o Anki, sem terminal. |
| Mineração automática com a Conexão desligada | **Deixa ligar, com status honesto**: o azulejo do popup e o passo dizem que nada é minerado assim (C8). Não muda comportamento. |

### Achado que decidiu a ordem

A mineração automática **não minera nada com a Conexão com o Anki desligada**, nos dois idiomas. Ela precisa do vocabulário do baralho para saber que palavra é nova:
- `background.js:333`: inglês, com `requireVocabulary`, devolve `[]` quando não há vocabulário;
- `background.js:345`: russo, mesma coisa.

Por isso a Conexão vem antes da mineração automática, e o status honesto (Q5) explica por que um idioma ligado ainda não minera.

## Na instalação

- `chrome.runtime.onInstalled` com `reason === 'install'` abre uma aba em **`painel.html#boas-vindas`**.
  - Só na instalação: atualização da extensão não abre nada.
  - O menu de contexto continua sendo criado como hoje.
- `#boas-vindas` é um **endereço novo do Painel** e está na [tabela de endereços do shell](../shell/README.md#endereços). A página **não tem sidebar**.

## A página Boas-vindas

**Layout:**
- Fundo `bg`, marca Veio de 40 px com o cursor piscando no topo, centralizada.
- Uma grade de duas colunas (máx. 900 px), que empilha em uma coluna abaixo de ~760 px:
  - **Coluna da lista (230 px):** ilha `surface` de raio 20 com os 9 itens:
    - Boas-vindas, os 7 passos e Tudo pronto;
    - cada passo tem uma marca: número, ✓ ouro quando feito, tracejado quando pulado;
    - o item atual usa `surface-2` com contorno `border-strong`, igual à nav do shell;
    - dá para clicar em qualquer item.
  - **Card do passo:** ilha `surface` de raio 20 com sombra.
    - Linha de sobretítulo em maiúsculas: “Passo 4 de 7 · opcional”.
    - Título 24/800.
    - O texto do passo.
    - O **controle real** num bloco `bg` de raio 14.
    - Rodapé com “Voltar” · “Agora não” (só nos opcionais) · “Continuar” (primário).

**Telas:**
1. **Abertura:** “Boas-vindas ao PerpetualMiner”, uma linha sobre o produto (a frase descritiva mora aqui e na loja; o popup não tem subtítulo) e a lista dos 7 passos com a etiqueta “opcional”. Botões “Pular a configuração” (fantasma) e “Começar” (primário).
2. **Os 7 passos**, abaixo.
3. **Tudo pronto:** o resumo de cada passo (feito · agora não · falta) e o botão “Abrir painel”, que abre o Painel em `#frases`.

## Os passos

A ordem é travada. Cada passo reusa uma função que já existe; nenhum cria função nova.

| # | passo | controle no passo (função existente) | feito quando |
|---|---|---|---|
| 1 | **Minerar a primeira frase** | Texto sobre o atalho de legenda gravado e o menu de contexto, uma ilustração estática da legenda marcada (linha ouro + palavra grifada + chip `palavra:`/`auto:`, como no [overlay](../../overlay/README.md)) e o campo de mineração rápida do popup. Sem atalho de legenda gravado, no lugar da tecla aparece “Sem atalho” + **Definir atalho**, que leva ao passo 2 desta página (o gravador; fora da Boas-vindas, a mesma ação leva a `#configuracoes/atalhos`). | há ≥ 1 frase |
| 2 | **Escolher o atalho de Minerar seleção** | O gravador de atalho de Configurações › Atalhos, com as mesmas linhas e controles de lá. “Minerar legenda” mostra o atalho que estiver gravado (de fábrica, `Alt+S`), não um `Alt+S` fixo; sem atalho gravado, mostra “Sem atalho” (`kbd` tracejado), com o mesmo “Gravar atalho” ao lado para defini-lo. | `pm_atalho` gravado |
| 3 | **Entrar com Google** · opcional | O corpo do card Conta & sync de Configurações: login, estado da sincronização e falha no login. | conta conectada |
| 4 | **Ligar a Conexão com o Anki** | Os passos da [F1](#conexão-com-o-anki-como-ligar-f1): pôr a Conexão no Anki (baixar o arquivo, abrir, responder Sim) e reiniciar o Anki, com a conferência sozinha. | a conexão está ligada |
| 5 | **Configurar a IA dos cartões** · opcional | O card IA dos cartões de Configurações ([CFG-35](../../voz/README.md), [Configurações § IA dos cartões](../configuracoes/README.md#ia-dos-cartões)): as duas entradas em colunas do mesmo tamanho; a coluna da chave funciona, a do ChatGPT chega no #155. | chave da OpenAI conferida |
| 6 | **Ligar a mineração automática** · opcional | Os toggles EN/RU do popup, com o limite por dia editável (1–100). Com a conexão desligada, a nota de dependência aparece; ainda dá para ligar um idioma. | um idioma ligado |
| 7 | **Adicionar a chave do Gemini** · opcional | O card Chave do Gemini de Configurações: sem chave, campo e “Onde conseguir a chave” recolhido; com chave, valor mascarado e “Trocar chave”. | chave salva |

- Os passos se marcam **pelo estado real**. Se a pessoa já fez algo fora da página, o passo já aparece feito.
- **Pular:**
  - “Agora não” só existe nos opcionais.
  - Nos obrigatórios, “Continuar” segue sem marcar o passo; ele fica como “falta” no resumo.
- **Mineração automática em dois lugares, de propósito:** os toggles EN/RU moram no popup e aparecem de novo no passo 5, que usa os mesmos controles e o mesmo estado. É deliberado: o passo apresenta a função no momento em que ela passa a funcionar (depois da Conexão), e o texto do passo (ONB-09) e o Tudo pronto (ONB-12) apontam que o lugar dela no dia a dia é o popup.

## Retomada: o lembrete

- Enquanto a pessoa não chegar a **Tudo pronto**, aparece um lembrete. Isso inclui quem usou “Pular a configuração” ou fechou a aba.
- O lembrete aparece em dois lugares:
  - **no popup:** um cartão entre o cabeçalho e “Abrir painel” (acento a 45% + fundo com 5% de acento, com um anel de progresso): “Configuração pela metade · 2 de 7”, “Volte de onde parou” e o botão “Continuar configuração”;
  - **em Frases:** uma faixa ouro no topo, “A configuração ficou pela metade: 2 de 7 passos.”, com os botões “Ocultar” e “Continuar configuração”.
- “Continuar configuração” abre `#boas-vindas` no primeiro passo que falta.
- “Ocultar” esconde o lembrete **de vez**, nos dois lugares.
- Esse lembrete ocultável é o **item 9 da lista fechada** (“Configuração pela metade”).
- Configurações não ganha entrada para reabrir a página. Tudo o que ela configura já mora lá.

## Conexão com o Anki: como ligar (F1)

O passo 4 da Boas-vindas e o card ONB-16 da área Conexão com o Anki montam **o mesmo componente** (`painel-conexao-passos.js`, o desenho B do #99 com os passos de #145): uma lista de passos e o card do passo. A cópia está em [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js) (`ONB-16.*`; `ONB-08.corpo` é só o texto de abertura do passo 4). Na tela o nome é **Conexão com o Anki**; “complemento” só aparece onde o próprio Anki usa a palavra (Ferramentas › Complementos).

**Retry comum à F1, ao passo 4 e ao ONB-16:** enquanto a Conexão diz “Conectando”, o botão que está à mostra fica indisponível, mas continua no percurso do Tab e conserva o foco; apertá-lo de novo não repete a conferência. O contrato de implementação está nos comentários de [`lib/conexao-na-tela.js`](../../../../lib/conexao-na-tela.js). O botão é **Tentar de novo** (`ENV-01.tentarDeNovo`) nos dois lugares.

Os passos, na ordem (o número na tela é a posição na lista):

1. **Ter o Anki** (`ONB-18`, #146): a pergunta “Você já tem o Anki?”, com as duas respostas. **Não tenho** abre a página de download do Anki numa aba nova (o painel fica no passo; o Anki não tem endereço fixo de instalador por sistema, um arquivo por processador com a versão no nome) e diz o que fazer depois pelo sistema da pessoa (no Mac, “Arraste o Anki para a pasta Aplicativos e abra-o de lá.”; no Windows, o instalador; nos outros, “Depois de instalar, abra o Anki.”). **Já tenho** usa o abridor da Conexão (#147) para abrir o Anki sozinho quando a permissão `nativeMessaging` já está dada (“O Anki está abrindo…”, e a conferência de 15 s encontra a Conexão que o Anki abriu trouxe); sem a permissão, sem o abridor, ou sem ele abrir, o caminho manual de sempre (“Abra o Anki para continuar.”). A escolha fica só na tela: o que marca o passo é a Conexão respondendo, e antes dela a tela não diz nada do Anki — “não instalado”, “fechado” e “aberto sem a Conexão” dão o mesmo silêncio (nunca “não encontrado”).
2. **Pôr a Conexão no Anki** (`ONB-16.passo1Titulo`): baixar › abrir › **Sim** › reiniciar. Antes de baixar, a animação do aviso (`ONB-19`, #146) mostra o que o próprio Anki pergunta ao abrir o arquivo, e de onde clicar: dois quadros que se alternam sozinhos — a janela “Instalar extensão do Anki” com o aviso “Importante: Como as extensões são programas baixados da internet, elas são potencialmente maliciosas.” (as palavras do próprio Anki em pt-BR) e o mesmo diálogo com o Sim marcado; com movimento reduzido, os quadros ficam parados, lado a lado. O botão **Baixar a Conexão com o Anki** é um link de download do `.ankiaddon` que vai dentro do pacote da extensão (`conexao/perpetualminer.ankiaddon`; sem permissão nova). Abrir o arquivo com o Anki fechado abre o Anki e instala (ensaio do dono). O Detalhes **O arquivo não abriu?** é a reserva: com o código do AnkiWeb (`PerpetualMiner.CODIGO_DO_ANKIWEB`, só depois do primeiro upload, #176), diz para colá-lo em Ferramentas › Complementos › Obter complementos; sem ele, diz que o código vem em breve. Nunca um número inventado.
3. **Reiniciar o Anki** (`ONB-16.passo2Titulo`): este passo sempre existe (no Anki do Mac, o arquivo pediu reinício até com o Anki fechado). A extensão confere sozinha (a conferência de 15 s do `ConexaoAnki`); a linha de status diz **Conectando ao Anki…** e, quando a Conexão responde, **Achei o Anki · perfil · versão** (o perfil e a versão vêm do `/health` do complemento; sem perfil, ou sem versão, a parte falta). O Tentar de novo vive neste passo.

4. **Abrir o Anki sozinho** (`ONB-17`, #147): logo depois de a Conexão responder, o card passa sozinho a este passo, e a linha “Achei o Anki · perfil · versão” continua nele. **Permitir abrir o Anki** pede ao Chrome a permissão opcional `nativeMessaging` (o aviso é do Chrome) e a extensão confere o abridor que a Conexão deixou no computador: só “achou o Anki?”, nada abre nem fecha. Achou: “O Anki abre sozinho quando um Envio precisar.” e o passo vira ✓. Com a permissão já dada, a conferência sai sem clique. **Agora não** fica guardado e o passo fica “agora não”: “Sem essa permissão, quando o Anki estiver fechado o Envio pede que você o abra.” (o mesmo texto quando o Chrome não dá a permissão). O abridor não achou o Anki, ou não respondeu: o que fazer (fechar e abrir o Anki, que refaz o abridor), **Tentar de novo** e o que o Chrome disse no Detalhes. Sem protótipo próprio: o desenho segue o card do passo, e as referências visuais esperam o dono.

Enquanto a Conexão não respondeu, o status do passo 2 (Pôr a Conexão no Anki) diz **Esperando a Conexão**: antes dela a extensão não enxerga o Anki, e “não instalado”, “fechado” e “aberto sem a Conexão” dão o mesmo silêncio — o passo 1 não diz nada do Anki (e nem traz a linha da Conexão: o Tentar de novo mora no passo de reiniciar). Sem resposta **2 minutos** depois de a pessoa ver os passos pela primeira vez (ou de baixar o arquivo), o card mostra o checklist de 3 itens (**O Anki está aberto?** · **Você fechou o Anki e abriu de novo?** · **A Conexão com o Anki está ativada em Ferramentas › Complementos?**) e **Baixar de novo**, em qualquer passo; a conferência continua sozinha e o checklist sai quando a Conexão responde. Ligada, os três primeiros passos viram ✓, o Tentar de novo sai e o foco, se estava nele, vai para o título (do passo 4 da Boas-vindas, o do passo). O passo 4 da Boas-vindas fica feito pela Conexão ligada; o passo 4 dos passos da Conexão é à parte (“agora não” não deixa o passo 4 por fazer). Quem já viu a Conexão ligar e a vê cair volta ao passo do abridor, que é o que falta — não ao primeiro.

- **Passo 4 da Boas-vindas:** `ONB-08.corpo`, e o componente com a lista de passos **acima** do card do passo, sem Voltar · Continuar próprios (o card da Boas-vindas tem os seus).
- **Área Conexão com o Anki, nunca conectada:** o card ONB-16, com a lista ao lado do card do passo; o desenho e os estados estão em [Conexão com o Anki § Estados](../anki/README.md#estados). Quem já tinha a área aberta sem conexão vê o mesmo passo da Boas-vindas.
- **Sem terminal:** os comandos `pip` e `python`, o Detalhes de comandos e o Copiar saíram (ONB-08.passo1…, ONB-16.detalhes, `.copiar`, `.copiado`, `.naoCopiou`).

## Cópia nova

Tudo segue V1–V10 e C1–C9. V10 permite o nome do produto no onboarding. Estes itens estão no catálogo da Voz, na seção ONB do [guia de voz](../../voz/README.md):

| ID | estado | cópia |
|---|---|---|
| ONB-01 | Abertura (título + corpo) | Boas-vindas ao PerpetualMiner — Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões. Sete passos rápidos deixam tudo pronto; os opcionais dá para pular. |
| ONB-02 | Botões da abertura | Pular a configuração · Começar |
| ONB-03 | Sobretítulo do passo | Passo 4 de 7 · opcional |
| ONB-04 | Botões do passo | Voltar · Agora não · Continuar |
| ONB-05 | Passo 1 | Num vídeo com legenda, aperte Alt+S. A frase vai para o histórico e já fica copiada. / Numa página ou PDF, selecione o texto e use o botão direito › Minerar com PerpetualMiner. / Ou cole uma frase aqui, como no popup: |
| ONB-06 | Passo 2 | Escolha uma tecla ou um botão extra do mouse para minerar o texto selecionado, sem abrir o menu. |
| ONB-07 | Passo 3 | Entre com Google para ter suas frases em qualquer computador. Sem conta, elas ficam só neste. |
| ONB-08 | Passo 4 | A Conexão com o Anki fica dentro do Anki, neste computador. É ela que cria os cartões e diz quais palavras você já conhece. (depois, o componente da [F1](#conexão-com-o-anki-como-ligar-f1))  |
| ONB-09 | Passo 5 | Com ela ligada, as legendas com uma palavra que você ainda não conhece são mineradas sozinhas, até um limite por dia. Liga por idioma. / Os mesmos botões ficam no popup, pelo ícone da extensão. |
| ONB-10 | Dependência da mineração automática (passo e popup) | Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece. |
| ONB-11 | Passo 6 | `corpo`, `onde` e `detalhes` em [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js) |
| ONB-12 | Tudo pronto | Tudo pronto — Dá para mudar qualquer coisa depois, em Configurações. A mineração automática fica no popup. [Abrir painel] |
| ONB-13 | Resumo (por passo) | feito (o valor: “Alt+Q”, “ligada”…) · agora não · falta |
| ONB-14 | Lembrete no popup | Configuração pela metade · 2 de 7 — Volte de onde parou [Continuar configuração] |
| ONB-15 | Lembrete em Frases | A configuração ficou pela metade: 2 de 7 passos. [Ocultar] [Continuar configuração] |
| ONB-16 | Área Conexão com o Anki, nunca conectada, e os passos da F1 | Ainda não houve conexão neste computador — (O que é + O que falta sem ela, da F1); os passos, o arquivo, o checklist e o “Achei o Anki” em [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js) |
| ONB-18 | Passo Ter o Anki, o primeiro dos passos da F1 (#146) | [`ONB-18` em `lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js): a pergunta “Você já tem o Anki?”, as duas respostas, o instalador pelo sistema e o que cada uma mostra |
| ONB-19 | A animação do aviso do Anki, no passo de baixar o arquivo (#146) | [`ONB-19` em `lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js): o aviso que o próprio Anki mostra, os botões do diálogo dele e a legenda |

Em ONB-05, o `Alt+S` é o atalho de legenda que estiver gravado. Sem atalho gravado, no lugar da tecla aparece “Sem atalho” + a ação **Definir atalho**. Na Boas-vindas, ela leva ao passo 2 desta página, onde está o gravador; na PAI-02 e no rodapé do popup, leva a `#configuracoes/atalhos`.

## Lista fechada

A Boas-vindas responde por dois itens da lista fechada das Notes do mapa:
- **8. abrir a página Boas-vindas na instalação**, com `onInstalled` e `reason === 'install'` (só install; ONB-01);
- **9. o lembrete “Configuração pela metade” ocultável** (ONB-14 no popup, ONB-15 em Frases; ver [Retomada](#retomada-o-lembrete)).

A página em si é reagrupamento e revestimento: cada controle dentro dela é uma função que já existe, só mostrada em outro lugar.

## Instalador da Conexão com o Anki

A orientação da F1 é provisória. Na rodada, o dono avisou:

> usar isso por enquanto mas vai ter que ter instalador quando eu for passar deixar frictionless pro pessoal e de forma estavel para que se o instalador der erro ela saiba corrigir facilmente ou nem precise saber que deu pau e corrigir só, ou com um simples botao.

Isso fica **fora deste mapa**, dentro do esforço futuro “bridge instalável”. Mas já deixa três requisitos para ele:
1. um instalador sem terminal;
2. que se conserte sozinho quando der erro;
3. ou que se conserte com um botão só.

Quando ele existir, o passo 4 troca as instruções e a área troca as instruções com Detalhes por esse botão.

## Onde isso mora nas outras specs

- [Painel · Frases mineradas](../frases/README.md): a faixa do lembrete (ONB-15) no topo de Frases e o vazio PAI-02 depois da Boas-vindas.
- [Painel · Conexão com o Anki](../anki/README.md): o card “Ainda não houve conexão neste computador” (ONB-16) no lugar das abas na primeira execução.
- [Painel · Configurações](../configuracoes/README.md): os passos 2, 3 e 6 reusam os controles de lá, então os dois precisam ficar iguais.
- **Consolidação da spec (feita):** `#boas-vindas` está na [tabela de endereços do shell](../shell/README.md#endereços), e os ONB-01…16 estão no catálogo da Voz, na seção ONB do [guia de voz](../../voz/README.md).
