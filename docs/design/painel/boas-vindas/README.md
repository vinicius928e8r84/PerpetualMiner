# Onboarding e primeira execução: “Boas-vindas”

Resolução do ticket [Protótipo: onboarding & primeira execução](https://github.com/vinicius928e8r84/PerpetualMiner/issues/10) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele herda:
- a identidade [Veio](../../identidade-veio/README.md);
- o [popup Cockpit](../../popup/README.md) e o [shell Ilhas do Painel](../shell/README.md);
- os nomes e a cópia do [guia de voz & catálogo](../../voz/README.md) (regras V1–V10 e C1–C9).

**Protótipo:** [`prototipo-onboarding.html`](prototipo-onboarding.html). Abra direto no navegador.
- `?variant=C` é a estrutura travada (padrão). `A` (Vazios que ensinam) e `B` (Primeiros passos) foram as alternativas. O protótipo registra a decisão de layout, mas os controles dos passos 3–6 foram revisados depois: para esses estados, valem [Os passos](#os-passos) e a [F1](#conexão-com-o-anki-como-ligar-f1), não as ações antigas do protótipo.
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
| Como ligar a Conexão com o Anki | O passo 4 e o card ONB-16 da área têm [instruções e ações distintas](#conexão-com-o-anki-como-ligar-f1). A orientação é provisória; ver [Instalador da Conexão](#instalador-da-conexão-com-o-anki). |
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
  - **Coluna da lista (230 px):** ilha `surface` de raio 20 com os 8 itens:
    - Boas-vindas, os 6 passos e Tudo pronto;
    - cada passo tem uma marca: número, ✓ ouro quando feito, tracejado quando pulado;
    - o item atual usa `surface-2` com contorno `border-strong`, igual à nav do shell;
    - dá para clicar em qualquer item.
  - **Card do passo:** ilha `surface` de raio 20 com sombra.
    - Linha de sobretítulo em maiúsculas: “Passo 4 de 6 · opcional”.
    - Título 24/800.
    - O texto do passo.
    - O **controle real** num bloco `bg` de raio 14.
    - Rodapé com “Voltar” · “Agora não” (só nos opcionais) · “Continuar” (primário).

**Telas:**
1. **Abertura:** “Boas-vindas ao PerpetualMiner”, uma linha sobre o produto (a frase descritiva mora aqui e na loja; o popup não tem subtítulo) e a lista dos 6 passos com a etiqueta “opcional”. Botões “Pular a configuração” (fantasma) e “Começar” (primário).
2. **Os 6 passos**, abaixo.
3. **Tudo pronto:** o resumo de cada passo (feito · agora não · falta) e o botão “Abrir painel”, que abre o Painel em `#frases`.

## Os passos

A ordem é travada. Cada passo reusa uma função que já existe; nenhum cria função nova.

| # | passo | controle no passo (função existente) | feito quando |
|---|---|---|---|
| 1 | **Minerar a primeira frase** | Texto sobre o atalho de legenda gravado e o menu de contexto, uma ilustração estática da legenda marcada (linha ouro + palavra grifada + chip `palavra:`/`auto:`, como no [overlay](../../overlay/README.md)) e o campo de mineração rápida do popup. Sem atalho de legenda gravado, no lugar da tecla aparece “Sem atalho” + **Definir atalho**, que leva ao passo 2 desta página (o gravador; fora da Boas-vindas, a mesma ação leva a `#configuracoes/atalhos`). | há ≥ 1 frase |
| 2 | **Escolher o atalho de Minerar seleção** | O gravador de atalho de Configurações › Atalhos, com as mesmas linhas e controles de lá. “Minerar legenda” mostra o atalho que estiver gravado (de fábrica, `Alt+S`), não um `Alt+S` fixo; sem atalho gravado, mostra “Sem atalho” (`kbd` tracejado), com o mesmo “Gravar atalho” ao lado para defini-lo. | `pm_atalho` gravado |
| 3 | **Entrar com Google** · opcional | O corpo do card Conta & sync de Configurações: login, estado da sincronização e falha no login. | conta conectada |
| 4 | **Ligar a Conexão com o Anki** | Status e instruções da [F1](#conexão-com-o-anki-como-ligar-f1) para este passo. | a conexão está ligada |
| 5 | **Ligar a mineração automática** · opcional | Os toggles EN/RU do popup, com o limite por dia editável (1–100). Com a conexão desligada, a nota de dependência aparece; ainda dá para ligar um idioma. | um idioma ligado |
| 6 | **Adicionar a chave do Gemini** · opcional | O card Chave do Gemini de Configurações: sem chave, campo e “Onde conseguir a chave” recolhido; com chave, valor mascarado e “Trocar chave”. | chave salva |

- Os passos se marcam **pelo estado real**. Se a pessoa já fez algo fora da página, o passo já aparece feito.
- **Pular:**
  - “Agora não” só existe nos opcionais.
  - Nos obrigatórios, “Continuar” segue sem marcar o passo; ele fica como “falta” no resumo.
- **Mineração automática em dois lugares, de propósito:** os toggles EN/RU moram no popup e aparecem de novo no passo 5, que usa os mesmos controles e o mesmo estado. É deliberado: o passo apresenta a função no momento em que ela passa a funcionar (depois da Conexão), e o texto do passo (ONB-09) e o Tudo pronto (ONB-12) apontam que o lugar dela no dia a dia é o popup.

## Retomada: o lembrete

- Enquanto a pessoa não chegar a **Tudo pronto**, aparece um lembrete. Isso inclui quem usou “Pular a configuração” ou fechou a aba.
- O lembrete aparece em dois lugares:
  - **no popup:** um cartão entre o cabeçalho e “Abrir painel” (acento a 45% + fundo com 5% de acento, com um anel de progresso): “Configuração pela metade · 2 de 6”, “Volte de onde parou” e o botão “Continuar configuração”;
  - **em Frases:** uma faixa ouro no topo, “A configuração ficou pela metade: 2 de 6 passos.”, com os botões “Ocultar” e “Continuar configuração”.
- “Continuar configuração” abre `#boas-vindas` no primeiro passo que falta.
- “Ocultar” esconde o lembrete **de vez**, nos dois lugares.
- Esse lembrete ocultável é o **item 9 da lista fechada** (“Configuração pela metade”).
- Configurações não ganha entrada para reabrir a página. Tudo o que ela configura já mora lá.

## Conexão com o Anki: como ligar (F1)

O passo 4 (`ONB-08.corpo`) e o card ONB-16 da área Conexão com o Anki (`ONB-16.corpo`) dão a mesma explicação inicial e usam o primeiro passo (`ONB-08.passo1`), mas não as ações seguintes. A cópia de cada variante está em [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js).

- **Passo 4 da Boas-vindas:** mostra o status da Conexão e, enquanto a última resposta foi “desligada”, três instruções (`ONB-08.passo1`, `.instalar`, `.verificar`). O botão e o terceiro item dizem **“Verificar de novo”** (`ONB-08.verificarDeNovo`); o botão pede a mesma conferência da F1 pelo módulo compartilhado [`lib/conexao-anki.js`](../../../../lib/conexao-anki.js). Neste passo **não há Detalhes nem Copiar**. Com a conexão ligada, as instruções e o botão saem.
- **Área Conexão com o Anki, nunca conectada:** a faixa ENV-01/F1 continua em cima, com **“Tentar de novo”**. Sem dado antigo, as abas dão lugar ao card ONB-16 com “O que falta sem ela”, os três passos antigos (`ONB-08.passo1`–`.passo3`) e os comandos em **Detalhes** recolhido e copiável (botão **Copiar**):
  - `pip install -r bridge/requirements.txt`
  - `python bridge/install_autostart.py`
  - `OPENAI_API_KEY` em `engine/.env`
  - a porta `127.0.0.1:8766` e o log `bridge/runtime/bridge.log`.

## Cópia nova

Tudo segue V1–V10 e C1–C9. V10 permite o nome do produto no onboarding. Estes itens estão no catálogo da Voz, na seção ONB do [guia de voz](../../voz/README.md):

| ID | estado | cópia |
|---|---|---|
| ONB-01 | Abertura (título + corpo) | Boas-vindas ao PerpetualMiner — Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões. Seis passos rápidos deixam tudo pronto; os opcionais dá para pular. |
| ONB-02 | Botões da abertura | Pular a configuração · Começar |
| ONB-03 | Sobretítulo do passo | Passo 4 de 6 · opcional |
| ONB-04 | Botões do passo | Voltar · Agora não · Continuar |
| ONB-05 | Passo 1 | Num vídeo com legenda, aperte Alt+S. A frase vai para o histórico e já fica copiada. / Numa página ou PDF, selecione o texto e use o botão direito › Minerar com PerpetualMiner. / Ou cole uma frase aqui, como no popup: |
| ONB-06 | Passo 2 | Escolha uma tecla ou um botão extra do mouse para minerar o texto selecionado, sem abrir o menu. |
| ONB-07 | Passo 3 | Entre com Google para ter suas frases em qualquer computador. Sem conta, elas ficam só neste. |
| ONB-08 | Passo 4 | ver [F1](#conexão-com-o-anki-como-ligar-f1) e as chaves de [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js) |
| ONB-09 | Passo 5 | Com ela ligada, as legendas com uma palavra que você ainda não conhece são mineradas sozinhas, até um limite por dia. Liga por idioma. / Os mesmos botões ficam no popup, pelo ícone da extensão. |
| ONB-10 | Dependência da mineração automática (passo e popup) | Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece. |
| ONB-11 | Passo 6 | `corpo`, `onde` e `detalhes` em [`lib/voz/catalogo.js`](../../../../lib/voz/catalogo.js) |
| ONB-12 | Tudo pronto | Tudo pronto — Dá para mudar qualquer coisa depois, em Configurações. A mineração automática fica no popup. [Abrir painel] |
| ONB-13 | Resumo (por passo) | feito (o valor: “Alt+Q”, “ligada”…) · agora não · falta |
| ONB-14 | Lembrete no popup | Configuração pela metade · 2 de 6 — Volte de onde parou [Continuar configuração] |
| ONB-15 | Lembrete em Frases | A configuração ficou pela metade: 2 de 6 passos. [Ocultar] [Continuar configuração] |
| ONB-16 | Área Conexão com o Anki, nunca conectada | Ainda não houve conexão neste computador — (O que é + O que falta sem ela, da F1) |

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
