# Painel · Configurações

Resolução do ticket [Protótipo: Painel · Configurações](https://github.com/vinicius928e8r84/PerpetualMiner/issues/14) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele parte de:
- o shell [Ilhas](../shell/README.md): sidebar, cabeçalho de área e endereços;
- a identidade [Veio](../../identidade-veio/README.md);
- a cópia do [catálogo de voz](../../voz/README.md) (CFG-01 a CFG-35).

**Protótipo:** [`prototipo-configuracoes.html`](prototipo-configuracoes.html). Abra direto no navegador.
- `?variant=C` é o tratamento travado e o padrão. `A` (Pilha) e `B` (Rótulo à esquerda) foram as alternativas.
- As setas ← → trocam a variante, e **T** alterna o tema.
- O painel “Estados do protótipo” simula:
  - os 10 estados de conta;
  - a chave vazia ou salva;
  - 0, 1 ou 1.284 frases;
  - o trilho;
  - a chegada pelo popup, pelo Minerar de uma foto e pelo chip de conta.
- O gravador de atalho funciona de verdade.

Decidido numa rodada no Lavish, em 2026-09-15. O dono escolheu a **C** e aceitou as outras três recomendações, com uma observação no gravador (“bom ter uma forma de resetar aos atalhos de fábrica”), que virou o **Restaurar atalhos padrão**.

## Decisões

| # | decisão | escolha |
|---|---|---|
| Q1 | Tratamento dos cards | **C · Resumo primeiro.** Cada card fica fechado numa linha com o estado atual e abre no lugar. |
| Q2 | Gravador de atalho | **Grava na própria linha.** Um atalho repetido é **recusado**, com aviso na linha (parte do item 7 da lista fechada). Um **“Restaurar atalhos padrão”** único volta tudo ao padrão de fábrica. Não há um “Voltar ao Alt+S” por atalho. |
| Q3 | Chave do Gemini salva | **Resumo mascarado + Trocar chave.** |
| Q4 | Onde aparece um problema de sync | **No card Conta & sync e no chip da sidebar.** Nenhuma faixa nas outras áreas. |
| Q5 | Lugar do seletor de tema ([#45](https://github.com/vinicius928e8r84/PerpetualMiner/issues/45), item 10 da lista fechada) | **Um card próprio, Aparência**, entre a Chave do Gemini e a Zona de perigo, no mesmo tratamento “resumo primeiro” da Q1. Decidido pelo dono numa rodada no Lavish, em 2026-09-19 (#45), com a cópia CFG-29…31 aprovada como está. O protótipo travado é anterior a este card; aqui a spec manda. |

## Anatomia (variante C)

- **Área:** cabeçalho “Configurações”, só o título. Embaixo, 6 cards de largura até ~820 px, com 8 px de vão, na ordem **Conta & sync · Atalhos · IA dos cartões · Chave do Gemini · Aparência · Zona de perigo**. Os cards são “buracos” `bg` na ilha, com raio 14.
- **Linha fechada** (a linha inteira é clicável):
  - à esquerda, um azulejo de ícone (34 px, `surface-2`, raio 10) e o título (15/700);
  - à direita, o **resumo do estado** (12,5 px, `muted`) e um chevron.
- **Card aberto:**
  - o resumo some e a descrição aparece sob o título;
  - o conteúdo entra alinhado ao título (recuo de 62 px);
  - o chevron gira.
  - Vários cards podem ficar abertos ao mesmo tempo.
- **Endereços:** `#configuracoes/conta|atalhos|ia|chave|aparencia|perigo` **abrem** o card, rolam até ele e piscam uma borda ouro por ~1,4 s. `#configuracoes` sozinho abre tudo fechado. Quem aponta para eles:
  - o “Mudar atalho” do popup vai para `#configuracoes/atalhos`;
  - o “Definir atalho”, que aparece no lugar da tecla quando não há atalho de legenda gravado (PAI-02, ONB-05, rodapé do popup), também vai para `#configuracoes/atalhos`;
  - o “Abrir Configurações” do Minerar de uma foto vai para `#configuracoes/chave`, e o campo recebe o foco se a chave estiver vazia;
  - o chip de conta vai para `#configuracoes/conta`.
- **Zona de perigo:** borda `danger` e azulejo de ícone `danger` a 12 %. Fica sempre por último.
- **Janela estreita:** abaixo de ~560 px de conteúdo, o resumo da linha fechada some e o conteúdo perde o recuo.
- **Movimento:** a pílula pulsando do gravador, o ponto piscando do Sincronizando, o flash de ~1,4 s da borda e a tecla nova piscando só animam **sem `prefers-reduced-motion`**. Com reduced-motion, ficam estáticos: a pílula, o ponto e a borda aparecem, sem pulsar nem piscar.

### Resumos da linha fechada

| card | resumo |
|---|---|
| Conta & sync | ponto de estado + `Nome · <estado do chip>` (ex.: “Vinicius · Sincronizado há 2 min”). Erro em `danger`. Sem conta: “Sem conta · só neste computador”. |
| Atalhos | `Legenda [Alt+S]  Seleção [Alt+Botão voltar]`, com as teclas no estilo `kbd`. Sem atalho: “Sem atalho”. |
| IA dos cartões | `••••••••9f3a` em mono (só o fim da chave da OpenAI). Sem chave: ponto `danger` + “Sem chave”. |
| Chave do Gemini | `AIza••••••••3kQ9` em mono. Vazia: ponto `danger` + “Sem chave”. |
| Aparência | O tema em uso: “Escuro” ou “Claro” (CFG-31). |
| Zona de perigo | “1.284 frases” · “1 frase” · “Nenhuma frase”. |

## Conta & sync

**Descrição:** “Com a conta, suas frases ficam iguais em qualquer computador em que você entrar.”

| estado | card aberto | chip da sidebar |
|---|---|---|
| Sincronizado (CFG-02) | Avatar 40 px, nome, ponto verde e “Sincronizado há 2 min”. **Sair da conta** (botão fantasma). Nota: “Ao sair, as frases continuam neste computador.” | Sincronizado há 2 min |
| Sincronizando (CFG-01) | O mesmo, com o ponto piscando e “Sincronizando…”. | Sincronizando… |
| Primeira subida (CFG-09) | “Sincronizando 12 frases…” | igual |
| Sem sincronizar (CFG-03) | O status fica em `danger`: “Sem sincronizar · as frases estão só neste computador”. Embaixo, um bloco de erro inline: “As mudanças deste computador ainda não subiram para a nuvem.” + **Tentar de novo** + Detalhes. | “Sem sincronizar”, em `danger` |
| Sync parcial (CFG-05) | “8 de 10 frases sincronizadas · 2 ficaram só neste computador” + Tentar de novo + Detalhes | “8 de 10 sincronizadas”, em `danger` |
| Nuvem recusou (CFG-04) | “A nuvem recusou o acesso. Saia da conta e entre de novo.” O Sair da conta vira botão normal. Detalhes com a mensagem do Firestore. | “Sem sincronizar”, em `danger` |
| Sessão expirou (CFG-08) | “Sua sessão expirou. Entre de novo para sincronizar.” + **Entrar** | “Sessão expirou”, em `danger` |
| Perfil sem nome (CFG-10) | O nome vira “Conta Google”. | igual |
| Sem conta (CFG-06) | Avatar vazio, “Suas frases em qualquer computador”, “Sem conta, elas ficam só neste computador.” e **Entrar com Google** (primário). | “Sem conta · só neste computador” |
| Login falhou (CFG-07) | Sem conta + erro inline: “Não deu para entrar com o Google. Tente de novo.” + Tentar de novo + Detalhes. **Cancelar o login não mostra nada.** | igual a sem conta |

Um problema de sync aparece **só** aqui e no chip (Q4). O chip fica sempre visível e leva ao card aberto.

## Atalhos

**Descrição:** “Vale para qualquer página aberta no Chrome. Grave uma combinação de teclas ou um botão extra do mouse.”

- **Linhas:**
  - **Minerar legenda**: “Minera a legenda que está na tela do vídeo.” Padrão: `Alt+S`.
  - **Minerar seleção**: “Minera o texto que você selecionou na página.” Padrão: sem atalho, como hoje.
  - Cada linha tem a tecla atual (`kbd`) e o botão **Gravar atalho**. “Sem atalho” aparece como `kbd` tracejado.
- **Gravando** (CFG-13):
  - a `kbd` da linha vira uma pílula ouro pulsando com “Pressione as teclas ou um botão extra do mouse…”, e o botão vira **Cancelar**;
  - **Esc** sem modificador cancela;
  - o botão da outra linha fica indisponível;
  - clique esquerdo e direito não gravam, então o Cancelar continua clicável.
- **O que grava:**
  - uma tecla com modificadores (Ctrl, Alt, Shift), rotulada como `Ctrl+Shift+K`;
  - um botão extra do mouse, também com modificadores: “Botão do meio”, “Botão voltar”, “Botão avançar” ou “Botão N do mouse” (CFG-14).
  - Enquanto grava, os botões voltar e avançar do mouse **não navegam**.
- **Gravou:** a tecla nova pisca uma vez, sem toast (C4: a mudança já aparece na tela).
- **Atalho repetido:**
  - a gravação continua;
  - a linha avisa em `danger`: “Esse atalho já é do Minerar legenda. Grave outro.” (mensagem nova, pelas regras V/C);
  - nada muda até sair uma combinação livre.
- **Restaurar atalhos padrão:**
  - é uma linha no pé do card, com a nota “Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho.” e um botão fantasma;
  - **só aparece quando algum atalho difere do padrão**;
  - aplica na hora, sem confirmação e sem toast.

## IA dos cartões

Ticket [#140](https://github.com/vinicius928e8r84/PerpetualMiner/issues/140) da [spec #138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138); o desenho é o **A** do [#101](https://github.com/vinicius928e8r84/PerpetualMiner/issues/101) (o dono escolheu, em 2026-10-01, as duas entradas **em duas colunas do mesmo tamanho**). O mesmo card mora no passo “Configurar a IA dos cartões” da [Boas-vindas](../boas-vindas/README.md#os-passos). A cópia é o CFG-35 do [catálogo da Voz](../../voz/README.md).

**Descrição:** “Quem escreve o texto dos cartões: a sua chave da OpenAI ou a sua conta do ChatGPT.” O azulejo é a faísca (`ia`, na base Veio).

- **Duas colunas do mesmo tamanho**, cada uma uma ilha `surface` de raio 12: **Chave da OpenAI** à esquerda e **Conta do ChatGPT** (com o selo “Plus ou Pro”) à direita. Abaixo de ~620 px de largura do card (560 px de conteúdo), as colunas viram linhas (proposta do worker no #101, não decisão do dono); o conteúdo do passo da Boas-vindas tem cerca de 595 px e fica em duas colunas. O card termina com a linha da imagem gerada por IA, que sempre sai pela chave.
- **Chave da OpenAI, sem chave:** o campo “Cole a chave (começa com sk-)” e **Conferir e salvar** (primário); embaixo, a sugestão de criar a chave num projeto próprio da OpenAI com limite de gasto mensal, a frase de que o desligamento de verdade é revogar a chave, e o link “Onde criar a chave”. Conferir vazio dá a borda `danger` e “Cole a chave antes de conferir” (como o CFG-16 do Gemini).
- **Conferindo:** o botão diz “Conferindo a chave…”, fica no Tab e no foco e não repete o pedido; o campo guarda o que foi colado, desabilitado.
- **Chave conferida:** ponto verde, “Chave conferida”, a chave mascarada (`••••••••9f3a`: a tela só sabe o fim dela) e **Trocar chave**, que abre o campo *vazio* com Conferir e salvar e Cancelar. Embaixo: “Fica neste computador: na extensão e numa cópia da Conexão com o Anki.” (estado verdadeiro de hoje; quando a chave acompanhar a conta Google, #154, o texto muda) e, quando a Conexão responde, “A Conexão com o Anki tem uma cópia da chave.” ou “…ainda não tem a cópia da chave. Ela a recebe quando responder.” Com a Conexão sem responder, o card não afirma nada sobre a cópia.
- **Erros:** uma faixa `danger` que atravessa o card, abaixo das colunas, com a entrada a que pertence em negrito (“Chave da OpenAI”), o que fazer e o Detalhes (`HTTP 402 · openai_no_credit`). Chave recusada → **Trocar chave**; sem crédito → **Adicionar crédito** (abre a OpenAI numa aba nova); organização não verificada → **Verificar organização**; a OpenAI fora do ar, ou a Conexão sem responder, ou a Conexão com erro → **Tentar de novo** (manda a mesma chave). O campo volta com o que foi colado, e a faixa some ao digitar. Uma chave recusada nunca troca a que já estava guardada.
- **Conta do ChatGPT:** o botão “Continuar com o ChatGPT” fica desabilitado e a coluna diz “Ainda não dá para entrar com o ChatGPT. Por enquanto, use a chave.” O login chega no ticket do plano (#155).
- **Onde a chave mora:** a Conexão com o Anki (o complemento) confere a chave na OpenAI e guarda uma cópia própria em `user_files/chaves`, fora da configuração, dos logs e do pacote do AnkiWeb, e só devolve os 4 últimos caracteres (`complemento/contrato/exemplos.json`). A extensão guarda a chave inteira no IndexedDB da extensão (o content script e o overlay não o alcançam) e, no `chrome.storage.local`, só os 4 últimos (`pm_chave_openai`). Se a Conexão voltar sem a cópia, a extensão a entrega de novo sozinha.

## Chave do Gemini

**Descrição:** “Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.” Hoje fica em `chrome.storage.local`.

- **Salva:** ponto verde, “Chave salva” e o resumo `AIza••••••••3kQ9` (4 primeiros + 4 últimos caracteres). À direita, o botão **Trocar chave**, que abre o campo com **Salvar chave** e **Cancelar**.
- **Vazia:**
  - o campo “Cole a chave (começa com AIza)” fica aberto, com **Salvar chave** primário;
  - a nota diz: “Sem a chave, Minerar de uma foto não consegue ler as fotos.”
- **Salvar vazio** (CFG-16): o campo ganha borda `danger`, com “Cole a chave antes de salvar” embaixo.
- **Salvar:** vale também o Enter no campo. Aparece o toast “Chave do Gemini salva” (CFG-16) e o card volta ao resumo.
- A chave **não é validada** (não há chamada de teste). Isso seria função nova.

## Aparência

**Descrição:** “Só neste computador.” (CFG-29)

- **Controle:** um controle segmentado de duas opções, **Escuro · Claro** (CFG-30), com o grupo rotulado “Tema” para o leitor de tela. É um grupo de rádio: as setas trocam a opção, e o foco visível é o do Veio.
- **Sem escolha gravada:** o app abre no **escuro**, o padrão do Veio. O controle mostra Escuro marcado.
- **Trocar:** vale **na hora**, sem recarregar e sem toast (C4: a mudança já aparece na tela), no painel e em qualquer popup ou Minerar de uma foto que esteja aberto.
- **Lembrado neste computador:** a escolha fica em `chrome.storage.local` e **não** sobe com o sync da conta. Outro computador segue com o que estiver gravado nele.
- **Onde vale:** painel (inclusive a Boas-vindas), popup e Minerar de uma foto. O **overlay** in-page usa sempre os tokens escuros (Veio, Tema e tokens), e o seletor não muda isso.
  - **Adiado de propósito:** o Minerar de uma foto já carrega a escolha, mas só passa a segui-la quando for refeito na Veio ([#36](https://github.com/vinicius928e8r84/PerpetualMiner/issues/36)/[#37](https://github.com/vinicius928e8r84/PerpetualMiner/issues/37), passo 5). Até lá as cores dele estão escritas à mão, fora dos tokens, e ficam como foram desenhadas: claro. Esse ticket fecha com um teste de que a tela segue o tema escolhido. O popup já segue o tema desde que foi refeito ([#38](https://github.com/vinicius928e8r84/PerpetualMiner/issues/38), passo 6).
- **Cores:** o claro usa só os tokens claros de [Tema e tokens](../../identidade-veio/README.md#tema-e-tokens), com o contraste que o Veio garante. Nenhuma cor nova.
- **Movimento:** a troca de tema não anima.

## Zona de perigo

- **Descrição:** “Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.” Sem conta, fica só “Apagar tudo aqui não dá para desfazer.”
- **Linha:** “Apagar todas as frases”, com a contagem e o alcance: “1.284 frases em todos os computadores da sua conta” (sem conta: “neste computador”). O botão de perigo **contorno** (vermelho, a entrada) diz **Apagar todas as 1.284 frases**; com 1 frase, “Apagar 1 frase”. Ele não apaga: só abre o modal.
- **Com 0 frases:** o botão fica indisponível, com “Nenhuma frase para apagar”.
- **Modal** (CFG-17, o mesmo componente de apagar 1 frase e a seleção, sem digitar nada):
  - título: “Apagar todas as 1.284 frases?”;
  - corpo: “Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.” Sem conta, fica só “Elas somem deste computador.”;
  - botões **Cancelar** (com o foco inicial) e **Apagar 1.284 frases** (perigo **preenchido**, o vermelho cheio que o Veio reserva só para o botão que confirma dentro do modal destrutivo);
  - Esc fecha.
- **Depois:** toast “Todas as frases foram apagadas” (CFG-18). O contador de Frases na sidebar vai a 0.

## Notas de construção

- Troca o `confirm()` nativo de `apagarTudo()` (`painel.js`) pelo modal. O botão de lixeira ao lado do total, no topo da sidebar, some.
- O gravador sai do popup (`popup.js iniciarGravacao`) e vem para cá; no popup fica só o rodapé “Alt+S · Mudar atalho”, com o atalho de legenda que estiver gravado; sem atalho gravado, “Sem atalho” + **Definir atalho**. **Minerar seleção** continua sendo o `pm_atalho` de hoje.
- **Minerar legenda gravável** (lista fechada) vira um segundo atalho no mesmo motor do `content.js` (`lib/atalhos.js`), com padrão Alt+S e gravado em `pm_atalho_legenda`. Isso aceita botões do mouse, ao contrário do `chrome.commands`. **Pendência fechada no #27:** o manifest não declara `commands` (nem declarava), então o atalho gravado vale só pelo content script; não há reserva.
- Os rótulos dos botões do mouse passam a PT-BR (CFG-14). O que já está gravado em inglês é traduzido na exibição.
- “Restaurar atalhos padrão” grava `{legenda: Alt+S, seleção: nenhum}`.
- A chave do Gemini sai da barra do Minerar de uma foto (`bookreader.html` / `bookreader.js`); o `geminiApiKey` continua o mesmo.
- O tema claro vive em `veio/tokens.css`, nos valores claros da tabela do Veio. Cada página (painel, popup, Minerar de uma foto) aplica o tema gravado antes de pintar, para não piscar o escuro ao abrir no claro, e escuta a mudança em `chrome.storage` para trocar na hora. O overlay não lê essa escolha.

## Lista fechada

Esta área cumpre o **item 7** da lista fechada: atalho “Minerar legenda” gravável (+ botão do mouse, **recusa atalho repetido**) com **Restaurar atalhos padrão** (CFG-11…14). A observação do dono no Q2 somou o Restaurar atalhos padrão ao item, e recusar o atalho repetido faz parte dele. As outras decisões são revestimento.

O card **Aparência** cumpre o **item 10**: seletor de tema (escuro, o padrão, ou claro), lembrado neste computador, valendo para o painel, o popup e Minerar de uma foto, com o overlay sempre escuro (CFG-29…31, [#45](https://github.com/vinicius928e8r84/PerpetualMiner/issues/45)).
