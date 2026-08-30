# Bridge Panel UX Redesign

## Contexto

O painel da extensao concentra status do Anki Bridge, presets e informacoes de custo dentro da sidebar. A largura reduzida deixa os campos espremidos, sem rotulos claros, e faz os custos competirem com navegacao e conta do usuario.

## Objetivo

Separar as configuracoes do Anki Bridge e as informacoes de custo em uma area propria no conteudo principal do painel, mantendo a sidebar leve e focada em navegacao/status.

## Escopo

- Transformar o bloco atual da sidebar em um resumo compacto do Anki Bridge.
- Criar uma secao principal dedicada ao Anki Bridge.
- Isolar visualmente presets e custos em secoes separadas.
- Reaproveitar a logica existente de presets, health check, analytics, filtros e download de debug.
- Melhorar rotulos, hierarquia, espacamento, responsividade e legibilidade.

## Fora de Escopo

- Alterar endpoints do bridge.
- Alterar o formato salvo dos presets.
- Alterar calculos de custo.
- Criar novas metricas de backend.
- Mudar o fluxo de envio de frases para o Anki.

## Arquitetura

### Sidebar

A sidebar passa a mostrar apenas um resumo compacto:

- titulo "Anki Bridge";
- badge Online/Offline usando o mesmo `bridge-health-badge`;
- uma linha curta de status/custo do filtro atual quando disponivel;
- botao "Gerenciar" que leva o foco visual para a secao principal do Anki Bridge.

Esse resumo deve ocupar pouco espaco e nao conter inputs editaveis.

### Secao Principal

Adicionar uma secao `bridge-workspace` no conteudo principal, proxima ao topo do painel, antes da lista de frases. Ela deve ter:

- cabecalho com titulo, subtitulo curto e status do bridge;
- area de presets;
- area de custos;
- layout em duas colunas em telas largas e coluna unica quando o espaco for menor.

### Presets

Os presets serao apresentados em dois cards independentes:

- Ingles;
- Russo.

Cada card deve conter labels visiveis para:

- deck;
- fonte de imagem;
- TLD palavra;
- TLD frase.

O botao "Salvar presets" fica no final da area de presets, com feedback existente via toast.

### Custos

A area de custos deve priorizar leitura rapida:

- total em destaque;
- breakdown por Cards, Imagem IA, Judge e Guard;
- status do filtro atual;
- controles de periodo e idioma em uma faixa propria;
- barras de origem de imagem em bloco separado;
- jobs recentes em cards mais legiveis, com custo, cards processados, origem da imagem e botao de debug.

Os dados continuam vindos de `/analytics/summary` e `/analytics/jobs`.

## Estados

- Offline: manter status claro e limpar metricas/listas como hoje.
- Sem jobs: mostrar mensagem vazia no bloco de custos.
- Carregando: usar texto curto "Atualizando..." no status.
- Custom range: manter comportamento atual ao editar datas.

## Acessibilidade e UX

- Campos devem ter `label` associado, nao depender so de placeholder.
- Botoes de icone devem manter `aria-label`.
- Textos longos de job devem truncar sem quebrar layout.
- A secao deve ser legivel sem depender de hover.
- A sidebar nao deve ter scroll interno pesado por causa do Anki Bridge.

## Testes

- Verificar que presets carregam do `chrome.storage.local`.
- Salvar presets e confirmar que os mesmos campos continuam sendo persistidos.
- Verificar health badge Online/Offline.
- Verificar filtros Hoje, Mes, Tudo, datas customizadas e idioma.
- Verificar estado do bridge offline.
- Verificar renderizacao com jobs vazios e com jobs existentes.
- Verificar que o botao de debug ainda baixa o JSON.
- Fazer revisao visual responsiva em largura comum de desktop e largura estreita.
