# Popup (mini painel): estrutura “Cockpit”

Resolução do ticket [Protótipo: Popup (mini painel)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/5) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Herda a identidade [Veio](../identidade-veio/README.md) e os vereditos da [auditoria](../auditoria/README.md) (Q2: popup = cockpit de captura).

- Protótipo: [`prototipo-popup.html`](prototipo-popup.html). Abra direto no navegador. `?variant=A` é a estrutura travada; `B` (Abas) e `C` (Feed) foram as alternativas avaliadas; `Z` mostra as três lado a lado. As setas ← → trocam a variante e **T** alterna o tema. O painel lateral troca de cenário (dia normal, primeiro uso, limite atingido, falha ao salvar) e simula a mineração automática e o Alt+S.
- Avaliado no Lavish em 2026-09-14.
- **Cópia:** toda a cópia do popup é a do catálogo da [Voz](../voz/README.md) (POP-01…10, e MIN-09 para o badge). Onde o protótipo mostra texto antigo (“Auto Miner”, “Adicionar”, “7/20”, subtítulo), vale esta spec.

## Decisão

Três estruturas foram avaliadas: **A · Cockpit** (pilha), **B · Abas** (Adicionar | Auto Miner | Recentes) e **C · Feed** (últimas primeiro + compositor fixo). O dono escolheu **A em todas as perguntas** (“A ganhou facilmente”):

| pergunta | escolha |
|---|---|
| Estrutura base | A · Cockpit: tudo à vista numa pilha |
| “Abrir painel” | botão primário largo (ouro), logo abaixo do cabeçalho |
| Mineração automática | dois azulejos lado a lado, EN \| RU, com medidor |
| Atalhos no popup | só o rodapé com o atalho de legenda + “Mudar atalho” |

## A tela, de cima para baixo (340 px, teto 600 px)

1. **Cabeçalho** (`surface`): ícone Veio 30 px + nome “PerpetualMiner” com cursor piscando. **Sem subtítulo**: a frase descritiva fica para a Boas-vindas e a loja.
   - **Lembrete da configuração** (ONB-14; item 9 da lista fechada): enquanto a [Boas-vindas](../painel/boas-vindas/README.md) não chega a “Tudo pronto” e o lembrete não foi ocultado, um cartão entre o cabeçalho e “Abrir painel” (acento a 45% + fundo com 5% de acento, anel de progresso): “Configuração pela metade · 2 de 6 — Volte de onde parou” e o botão “Continuar configuração” → `painel.html#boas-vindas`.
2. **Abrir painel** (POP-09): botão primário largo. Foca a aba do painel se já existe; senão abre uma nova (comportamento de hoje).
3. **Mineração automática** (POP-10; título de seção + “por dia” à direita): dois azulejos em grade 1fr 1fr.
   - Cada azulejo: código do idioma em mono, toggle Veio, contador grande em mono (POP-07; formato no [catálogo da Voz](../voz/README.md)), medidor ouro com a proporção do dia e o campo “limite [20] /dia” (1–100).
   - Ligado: borda `accent` a 45% + fundo com 5% de acento (a regra de seleção da spec). Desligado: medidor em `border-strong`.
   - Limite do dia atingido: o campo de limite dá lugar ao estado POP-08 em `accent-text` (cópia no [catálogo da Voz](../voz/README.md)).
   - Com o Anki fechado (a Conexão não responde): a Mineração automática segue pela última leitura do vocabulário daquele Baralho, **sem prazo** (com a Conexão respondendo, a leitura se atualiza a cada 15 min), então o azulejo e o badge seguem contando. Sob os azulejos, o selo POP-17 diz a idade dos dados, “Vocabulário de ontem, 14:02” (a leitura mais antiga entre os idiomas ligados). O Anki conta como fechado também quando a Conexão responde lendo o arquivo do Anki e confirma (`/anki/status`) que não há processo dele (a Conexão de hoje no Windows): a idade é a dos dados, a da última leitura com o Anki aberto, não a da leitura; com o Anki aberto e o AnkiConnect sem responder, o selo não aparece. O idioma ligado que nunca foi lido mostra, no azulejo, BRG-37: “— esperando o Anki” e “Começa depois que o Anki abrir uma vez.” O botão Abrir o Anki é do #150.
   - Virada do dia: os contadores passam a contar o novo dia pelo relógio local do computador. Uma aba de vídeo que atingiu o limite ontem volta a minerar sem recarregar a página.
4. **Mineração rápida**: textarea de 2 linhas com o placeholder POP-03 “Cole ou escreva uma frase” e o botão “Minerar” (POP-04, secundário) dentro do canto inferior direito. Desabilitado com campo vazio; Enter envia, Shift+Enter quebra linha.
   - Sucesso (POP-05): **sem texto**. O campo limpa e a frase entra no topo das últimas com um realce breve; a mudança já aparece na tela, então não há toast (C4 da Voz).
   - Falha (POP-06): inline sob o campo, em `danger`, conforme o [catálogo da Voz](../voz/README.md), e **o texto fica no campo**.
5. **Últimas mineradas** (título + “Ver todas” à direita, que abre o painel): as 5 mais recentes, **só leitura**. Cada linha: frase em 1 linha com reticências e a palavra grifada, e embaixo o Contexto `Fonte · Título · Detalhe · há N min`. Sem checkbox, sem ↻, sem “Tudo”, sem “Deletar”.
   - Carregando (POP-01): sem texto, só esqueleto.
   - Vazio (POP-02): estado vazio que ensina, “Nenhuma frase ainda. Aperte Alt+S num vídeo com legenda para minerar a primeira.”, com o atalho que estiver configurado de fato no lugar de Alt+S. Sem atalho gravado, a segunda frase vira “Defina um atalho para minerar legendas de vídeo.”, com a ação “Definir atalho” → `#configuracoes/atalhos` (C17).
6. **Rodapé**: o atalho “Minerar legenda” atual (gravável, em `kbd`; o padrão é `Alt`+`S`) minera a legenda do vídeo, com o botão fantasma “Mudar atalho”, que abre o painel em `#configuracoes/atalhos`. Mostra o atalho gravado, não um texto fixo. **Sem atalho gravado:** mostra “Sem atalho” e a ação “Definir atalho”, que leva ao mesmo `#configuracoes/atalhos`.

**Badge da toolbar** (item 6 da lista fechada, MIN-09): mostra a soma dos contadores de hoje **só dos idiomas ligados**; sem badge quando os dois estão desligados. Cores da spec Veio (`#F5B83D` / `#1A1204`). Tooltip: “Mineração automática: N hoje” (ex.: “Mineração automática: 12 hoje”); quando todos os idiomas ligados bateram o limite, “Mineração automática: limite de hoje atingido”.

## Fica para outros tickets

- **Bugs vistos no caminho** (conta do badge somando idioma desligado, delete que ressuscita): em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9).
