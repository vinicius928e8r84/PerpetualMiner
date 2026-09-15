# Popup (mini painel): estrutura “Cockpit”

Resolução do ticket [Protótipo: Popup (mini painel)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/5) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Herda a identidade [Veio](../identidade-veio/README.md) e os vereditos da [auditoria](../auditoria/README.md) (Q2: popup = cockpit de captura).

- Protótipo: [`prototipo-popup.html`](prototipo-popup.html). Abra direto no navegador. `?variant=A` é a estrutura travada; `B` (Abas) e `C` (Feed) foram as alternativas avaliadas; `Z` mostra as três lado a lado. As setas ← → trocam a variante e **T** alterna o tema. O painel lateral troca de cenário (dia normal, primeiro uso, limite atingido, falha ao salvar) e simula o Auto Miner e o Alt+S.
- Avaliado no Lavish em 2026-09-14.

## Decisão

Três estruturas foram avaliadas: **A · Cockpit** (pilha), **B · Abas** (Adicionar | Auto Miner | Recentes) e **C · Feed** (últimas primeiro + compositor fixo). O dono escolheu **A em todas as perguntas** (“A ganhou facilmente”):

| pergunta | escolha |
|---|---|
| Estrutura base | A · Cockpit: tudo à vista numa pilha |
| “Abrir painel” | botão primário largo (ouro), logo abaixo do cabeçalho |
| Auto Miner | dois azulejos lado a lado, EN \| RU, com medidor |
| Atalhos no popup | só o rodapé com Alt+S + “Mudar atalho” |

## A tela, de cima para baixo (340 px, teto 600 px)

1. **Cabeçalho** (`surface`): ícone Veio 30 px + nome com cursor piscando + subtítulo (texto provisório).
2. **Abrir painel**: botão primário largo. Foca a aba do painel se já existe; senão abre uma nova (comportamento de hoje).
3. **Auto Miner** (título de seção + “por dia” à direita): dois azulejos em grade 1fr 1fr.
   - Cada azulejo: código do idioma em mono, toggle Veio, contador grande em mono `7/20`, medidor ouro com a proporção do dia e o campo “limite [20] /dia” (1–100).
   - Ligado: borda `accent` a 45% + fundo com 5% de acento (a regra de seleção da spec). Desligado: medidor em `border-strong`.
   - Limite do dia atingido: o campo de limite dá lugar a “Limite de hoje atingido” em `accent-text`.
4. **Adição rápida**: textarea de 2 linhas com o botão “Adicionar” (secundário) dentro do canto inferior direito. Desabilitado com campo vazio; Enter envia, Shift+Enter quebra linha.
   - Sucesso: linha de status em `success` “Frase adicionada · EN/RU”; a frase entra no topo das últimas com um realce breve.
   - Falha: linha de status em `danger` “Não deu para salvar. Tente de novo.” e **o texto fica no campo** (hoje falha calada).
5. **Últimas mineradas** (título + “Ver todas” à direita, que abre o painel): as 5 mais recentes, **só leitura**. Cada linha: frase em 1 linha com reticências e a keyword grifada, e embaixo o Contexto `Fonte · Título · Detalhe · há N min`. Sem checkbox, sem ↻, sem “Tudo”, sem “Deletar”.
   - Vazio: estado vazio que ensina, “Nenhuma frase ainda” + “Aperte Alt+S num vídeo com legenda, ou cole uma frase aqui.”
6. **Rodapé**: `Alt`+`S` minera a legenda do vídeo, com o botão fantasma “Mudar atalho” que abre o painel em Configurações · Atalhos. Mostra o atalho “Minerar legenda” atual (gravável), não um texto fixo.

**Badge da toolbar** (item da lista fechada): mostra a soma dos contadores de hoje **só dos idiomas ligados**; sem badge quando os dois estão desligados. Cores da spec Veio (`#F5B83D` / `#1A1204`). Tooltip: “PerpetualMiner · Auto Miner: N hoje”.

## Fica para outros tickets

- **Redação:** subtítulo, rótulos, estados vazios e mensagens de sucesso/falha são provisórios. Quem decide é [Voz, tom & catálogo de mensagens/estados](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4).
- **Destino do “Mudar atalho”:** depende de onde Configurações · Atalhos mora no painel, decidido em [Painel — arquitetura de informação & shell](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6).
- **Bugs vistos no caminho** (conta do badge somando idioma desligado, delete que ressuscita): em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9).
