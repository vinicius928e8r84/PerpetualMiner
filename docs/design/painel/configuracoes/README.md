# Painel · Configurações

Resolução do ticket [Protótipo: Painel · Configurações](https://github.com/vinicius928e8r84/PerpetualMiner/issues/14) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele parte de:
- o shell [Ilhas](../shell/README.md): sidebar, cabeçalho de área e endereços;
- a identidade [Veio](../../identidade-veio/README.md);
- a cópia do [catálogo de voz](../../voz/README.md) (CFG-01 a CFG-18).

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
| Q1 | Tratamento dos 4 cards | **C · Resumo primeiro.** Cada card fica fechado numa linha com o estado atual e abre no lugar. |
| Q2 | Gravador de atalho | **Grava na própria linha.** Um atalho repetido é **recusado**, com aviso na linha. Um **“Restaurar atalhos padrão”** único volta tudo ao padrão de fábrica. Não há um “Voltar ao Alt+S” por atalho. |
| Q3 | Chave do Gemini salva | **Resumo mascarado + Trocar chave.** |
| Q4 | Onde aparece um problema de sync | **No card Conta & sync e no chip da sidebar.** Nenhuma faixa nas outras áreas. |

## Anatomia (variante C)

- **Área:** cabeçalho “Configurações”, só o título. Embaixo, 4 cards de largura até ~820 px, com 8 px de vão, na ordem **Conta & sync · Atalhos · Chave do Gemini · Zona de perigo**. Os cards são “buracos” `bg` na ilha, com raio 14.
- **Linha fechada** (a linha inteira é clicável):
  - à esquerda, um azulejo de ícone (34 px, `surface-2`, raio 10) e o título (15/700);
  - à direita, o **resumo do estado** (12,5 px, `muted`) e um chevron.
- **Card aberto:**
  - o resumo some e a descrição aparece sob o título;
  - o conteúdo entra alinhado ao título (recuo de 62 px);
  - o chevron gira.
  - Vários cards podem ficar abertos ao mesmo tempo.
- **Endereços:** `#configuracoes/conta|atalhos|chave|perigo` **abrem** o card, rolam até ele e piscam uma borda ouro por ~1,4 s. `#configuracoes` sozinho abre tudo fechado. Quem aponta para eles:
  - o “Mudar atalho” do popup vai para `#configuracoes/atalhos`;
  - o “Abrir Configurações” do Minerar de uma foto vai para `#configuracoes/chave`, e o campo recebe o foco se a chave estiver vazia;
  - o chip de conta vai para `#configuracoes/conta`.
- **Zona de perigo:** borda `danger` e azulejo de ícone `danger` a 12 %. Fica sempre por último.
- **Janela estreita:** abaixo de ~560 px de conteúdo, o resumo da linha fechada some e o conteúdo perde o recuo.

### Resumos da linha fechada

| card | resumo |
|---|---|
| Conta & sync | ponto de estado + `Nome · <estado do chip>` (ex.: “Vinicius · Sincronizado há 2 min”). Erro em `danger`. Sem conta: “Sem conta · só neste computador”. |
| Atalhos | `Legenda [Alt+S]  Seleção [Alt+Botão voltar]`, com as teclas no estilo `kbd`. Sem atalho: “Sem atalho”. |
| Chave do Gemini | `AIza••••••••3kQ9` em mono. Vazia: ponto `danger` + “Sem chave”. |
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
| Sessão expirou (CFG-08) | “Sua sessão expirou. Entre de novo para sincronizar.” + **Entrar com Google** | “Sessão expirou”, em `danger` |
| Perfil sem nome (CFG-10) | O nome vira “Conta Google”. | igual |
| Sem conta (CFG-06) | Avatar vazio, “Suas frases em qualquer computador”, “Sem conta, elas ficam só neste computador.” e **Entrar com Google** (primário). | “Sem conta · Só neste computador” |
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

## Chave do Gemini

**Descrição:** “Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.” Hoje fica em `chrome.storage.local`.

- **Salva:** ponto verde, “Chave salva” e o resumo `AIza••••••••3kQ9` (4 primeiros + 4 últimos caracteres). À direita, o botão **Trocar chave**, que abre o campo com **Salvar chave** e **Cancelar**.
- **Vazia:**
  - o campo “Cole a chave (começa com AIza)” fica aberto, com **Salvar chave** primário;
  - a nota diz: “Sem a chave, Minerar de uma foto não consegue ler as fotos.”
- **Salvar vazio** (CFG-16): o campo ganha borda `danger`, com “Cole a chave antes de salvar” embaixo.
- **Salvar:** vale também o Enter no campo. Aparece o toast “Chave do Gemini salva” (CFG-16) e o card volta ao resumo.
- A chave **não é validada** (não há chamada de teste). Isso seria função nova.

## Zona de perigo

- **Descrição:** “Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta.” Sem conta, fica só “Apagar tudo aqui não dá para desfazer.”
- **Linha:** “Apagar todas as frases”, com a contagem e o alcance: “1.284 frases em todos os computadores da sua conta” (sem conta: “neste computador”). O botão `danger` contorno diz **Apagar todas as 1.284 frases**; com 1 frase, “Apagar 1 frase”.
- **Com 0 frases:** o botão fica indisponível, com “Nenhuma frase para apagar”.
- **Modal** (CFG-17, o mesmo componente de apagar 1 frase e a seleção, sem digitar nada):
  - título: “Apagar todas as 1.284 frases?”;
  - corpo: “Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.” Sem conta, fica só “Elas somem deste computador.”;
  - botões **Cancelar** (com o foco inicial) e **Apagar 1.284 frases** (`danger` cheio);
  - Esc fecha.
- **Depois:** toast “Todas as frases foram apagadas” (CFG-18). O contador de Frases na sidebar vai a 0.

## Notas de construção

- Troca o `confirm()` nativo de `apagarTudo()` (`painel.js`) pelo modal. O botão de lixeira ao lado do total, no topo da sidebar, some.
- O gravador sai do popup (`popup.js iniciarGravacao`) e vem para cá; no popup fica só o rodapé “Alt+S · Mudar atalho”. **Minerar seleção** continua sendo o `pm_atalho` de hoje.
- **Minerar legenda gravável** (lista fechada) vira um segundo atalho no mesmo motor do `content.js` (`_correspondeAtalho`), com padrão Alt+S. Isso aceita botões do mouse, ao contrário do `chrome.commands`. Decidir na construção se o `commands` do manifest continua como reserva.
- Os rótulos dos botões do mouse passam a PT-BR (CFG-14). O que já está gravado em inglês é traduzido na exibição.
- “Restaurar atalhos padrão” grava `{legenda: Alt+S, seleção: nenhum}`.
- A chave do Gemini sai da barra do Minerar de uma foto (`bookreader.html` / `bookreader.js`); o `geminiApiKey` continua o mesmo.

## Lista fechada

A observação do dono no Q2 **amplia o item “atalho Minerar legenda (Alt+S) gravável”**, que passa a ser “atalhos graváveis + **Restaurar atalhos padrão**”. As outras decisões são revestimento.
