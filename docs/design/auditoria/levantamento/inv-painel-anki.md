# Inventário: painel.html — área Anki Bridge (Presets, Custos, Baralhos e termos, Vocabulário)

Repo: `/mnt/c/Users/sadvi/Desktop/MineradorLegendas` (somente leitura, nenhum arquivo foi alterado).
Arquivos: `painel.html` (617 l.), `painel.css` (2040 l.), `painel.js` (2739 l.), e `bridge/server.py`, `bridge/analytics.py`, `bridge/anki_session.py` (lidos só para entender contratos).
Fora do escopo (outro agente): shell do painel, "Frases mineradas", modais Editar Metadados, Adição em Massa e Envio ao Anki (`#bridge-progress-modal`). Menciono o modal apenas quando um controle desta área o abre.

Legenda de status: **working**, **broken**, **partial** (funciona só no caminho feliz, ou tem bug real), **orphan** (sem handler, ou o handler aponta para um elemento que não existe), **dead** (nunca aparece, inalcançável).

Base do bridge: `BRIDGE_URL = 'http://127.0.0.1:8766'` (painel.js:29). Chave de storage: `chrome.storage.local.ankiBridgePresets` (painel.js:30). Padrões em painel.js:31-34: `en {deckName:'CIMV', imageSource:'1', ttsWordTld:'com', ttsPhraseTld:'co.uk'}`, `ru {deckName:'RUSSIAN', imageSource:'1', ttsWordTld:'ru', ttsPhraseTld:'ru'}`.

Canal "toast" = `mostrarToast()` (painel.js:2716): div roxa fixa no canto inferior direito, **some depois de 1,8 s** e é substituída por qualquer toast mais novo.

---

## 0. Ciclo de vida (o que roda sem o usuário clicar)

| Quando | O quê | Onde |
|---|---|---|
| DOMContentLoaded | `inicializarBridgeUI()`: lê `ankiBridgePresets`, preenche os inputs, define as datas de "Hoje", `GET /health`, e `atualizarBridgeAnalytics()` (`GET /analytics/summary` + `GET /analytics/jobs`). **Não** carrega stats do Anki (`includeAnki:false`). | painel.js:1003-1012 |
| A cada 15 s | `atualizarBridgeHealth()` → `GET /health`; só alterna os 2 badges. **Não** atualiza custos/resumo quando o bridge volta a ficar online. | painel.js:1011, 1161-1178 |
| Clique em "Gerenciar" | Mostra o workspace, rola até ele e chama analytics + `GET /anki/stats/decks?...&launch=1` e depois `GET /anki/vocabulary`. | painel.js:1021-1028 |
| Workspace aberto | **Sem polling.** Custos e jobs só atualizam com clique manual ou mudança de filtro. | — |
| Outra aba salva presets | **Sem listener** para `ankiBridgePresets` (`setupStorageSyncListener` só observa `frases` e `pm_auto_miner_state_view`, painel.js:544-570), então os inputs ficam desatualizados. | — |

---

## A. Card compacto da sidebar (`section.bridge-panel`, painel.html:82-94)

Sempre visível na sidebar escura, entre o login do Firebase e `#platform-nav`.

| # | Elemento / seletor | file:line | O que faz (handler → função → endpoint/storage) | Status | Condição de exibição |
|---|---|---|---|---|---|
| A1 | `h3.bridge-title` "Anki Bridge" | painel.html:84 | Título estático | working | sempre |
| A2 | `#bridge-health-badge` "Offline" / "Online" | painel.html:85 | `atualizarBridgeHealth()` (js:1161) → `GET /health`; resposta 2xx → "Online" + `.online`, qualquer outra coisa → "Offline" + `.offline`. Só testa o **bridge**, não o Anki/AnkiConnect. | working | sempre; o HTML começa com "Offline", então pisca "Offline" no carregamento mesmo com o bridge no ar |
| A3 | label "Custo no filtro" | painel.html:89 | Estático | working (texto enganoso) | sempre. O "filtro" é o intervalo de datas/idioma do workspace, **invisível** quando o workspace está fechado (padrão = Hoje, Todos) |
| A4 | `#bridge-sidebar-cost` "$0.0000" | painel.html:90 | Recebe `formatUsd(summary.costs.totalUsd)` (js:1561); vira "$0.0000" em erro (js:1245) | working | sempre. Em erro mostra `$0.0000`, igual a "gasto zero" |
| A5 | `#bridge-sidebar-summary` | painel.html:92 | Espelha o status do analytics por `setBridgeStatusText` (js:1105-1108). Recebe duas escritas seguidas com o mesmo texto (js:1240-1241, redundante) | working | sempre. Valores: "Aguardando bridge...", "Atualizando...", "`N` job(s) no filtro", "Analytics indisponivel. Verifique se o bridge esta online." |
| A6 | `#btn-open-bridge-workspace` "Gerenciar" | painel.html:93 | click (js:950) → `abrirBridgeWorkspace()` (js:1021): remove `.hidden` de `#bridge-workspace`, rola até ele, dá foco, e chama `atualizarBridgeWorkspaceData({includeAnki:true, launchAnki:true})`. Não alterna: clicar de novo com o workspace aberto só rola e recarrega. **Efeito colateral:** `launch=1` pode abrir o Anki Desktop se o AnkiConnect não estiver pronto e a leitura local de `collection.anki2` falhar (server.py:750-752) | working | sempre |

---

## B. Shell do workspace (`#bridge-workspace`, painel.html:189-208)

`section.bridge-workspace.hidden` fica dentro de `<main>`, entre `.main-header` e `.main-toolbar`. Escondido por padrão; só aparece por A6.

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| B1 | `.bridge-kicker` "Anki Bridge" | html:192 | estático | working | workspace aberto |
| B2 | `h2#bridge-workspace-title` "Presets e custos" | html:193 | estático; **incompleto**: a seção também tem "Baralhos e termos" e "Vocabulario" | working | idem |
| B3 | `p.bridge-workspace-subtitle` "Configuracoes separadas da navegacao, com custos e jobs em leitura rapida." | html:194 | estático; é jargão de dev e não diz nada ao usuário | working | idem |
| B4 | `span.bridge-health-badge[data-bridge-health-badge]` "Offline"/"Online" | html:197 | Mesma lógica de A2 (js:1162-1170). Duplica A2 | working | idem |
| B5 | `#btn-bridge-analytics-refresh-main` (só ícone; title/aria "Atualizar custos") | html:198-205 | click (js:961) → `atualizarBridgeWorkspaceData({includeAnki:true, refreshAnki:true, launchAnki:true})`: recarrega custos, jobs, stats do Anki (fura o cache de 60 s, `refresh=1`), pode abrir o Anki (`launch=1`) e recarrega o vocabulário. **O tooltip diz só "custos"**, mas o botão faz bem mais | working (rótulo enganoso) | idem |
| B6 | `#btn-close-bridge-workspace` "Fechar" | html:206 | click (js:953) → `fecharBridgeWorkspace()` (js:1030): adiciona `.hidden` e rola até `#phrases-list` | working | idem |

---

## C. Presets (`.bridge-presets-card`, painel.html:211-278)

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| C1 | `h3#bridge-presets-title` "Presets" | html:214 | estático | working | workspace aberto |
| C2 | `p` "Decks, imagem e TLDs usados ao enviar frases para o Anki." | html:215 | estático. Não diz que o Deck **também** define de qual baralho vem o vocabulário das seções E/F e das keywords automáticas (background.js:936-939) | working | idem |
| C3 | pill "EN" + `strong` "Ingles" | html:222-223 | estático (sem acento) | working | idem |
| C4 | `#preset-main-en-deck` (texto, label "Deck", placeholder "CIMV") | html:225-228 | Preenchido por `preencherBridgePresetInputs()` (js:1126). Lido por `salvarBridgePresets()` (js:1142). Salvo em `ankiBridgePresets.en.deckName`. Vai no `POST /jobs` como `deckName`, em `GET /anki/stats/decks?deck=…&lang=en` e em `GET /anki/vocabulary?deck=…`, e o background.js usa para as keywords automáticas. Texto livre, sem validação nem autocomplete; precisa bater **exatamente** com o nome do deck no Anki (server.py:679). Deixar em branco → volta **em silêncio** para "CIMV" (js:1117) | working | idem |
| C5 | `#preset-main-en-image` (select, label "Fonte de imagem") opções `1`="Google Images", `2`="DALL-E" | html:229-235 | Salvo em `ankiBridgePresets.en.imageSource`; vai no `POST /jobs` como `imageSource`. No motor, "1" = busca no Google/Openverse + juiz + **geração por IA como fallback** (engine/start.py:488-493, 593), então "Google Images" ainda pode gerar custo de IA. **"DALL-E" está desatualizado**: `engine/config.yaml:46` usa `image_model: "gpt-image-1"` com o comentário "dall-e-3 was retired" | working (rótulo desatualizado/enganoso) | idem |
| C6 | `#preset-main-en-word-tld` (label "TLD palavra", placeholder "com") | html:237-240 | `ankiBridgePresets.en.ttsWordTld` → `POST /jobs` `tts.wordTld` → tld do perfil TTS (server.py:1147-1152). Texto livre sem validação; um valor inválido só falha depois, no job | working (técnico) | idem |
| C7 | `#preset-main-en-phrase-tld` (label "TLD frase", placeholder "co.uk") | html:241-244 | idem para `ttsPhraseTld` / `tts.phraseTld` | working (técnico) | idem |
| C8 | pill "RU" + "Russo" | html:250-251 | estático | working | idem |
| C9 | `#preset-main-ru-deck` (placeholder "RUSSIAN") | html:253-256 | igual a C4, para `ru` | working | idem |
| C10 | `#preset-main-ru-image` (Google Images / DALL-E) | html:257-263 | igual a C5 | working (mesmo problema de rótulo) | idem |
| C11 | `#preset-main-ru-word-tld` (placeholder "ru") | html:265-268 | igual a C6 | working | idem |
| C12 | `#preset-main-ru-phrase-tld` (placeholder "ru") | html:269-272 | igual a C7 | working | idem |
| C13 | `#btn-save-bridge-presets-main` "Salvar presets" | html:277 | click (js:949) → `salvarBridgePresets()` (js:1139): lê os 8 inputs (em branco = padrão), grava `chrome.storage.local.ankiBridgePresets`, preenche de novo; se o workspace estiver visível, chama `atualizarBridgeDeckStats({refresh:true, launch:true})`; toast **"Presets do Anki Bridge salvos."** Sem indicador de alteração pendente, sem "restaurar padrões", sem validação e sem sync entre abas | working | idem |
| C14 | (implícito) salvar ao enviar | js:2087 | `enviarSelecionadasAoAnki()` (botão "Enviar ao Anki", fora do escopo) chama `salvarBridgePresets()` antes de enviar, então **edições não salvas nos inputs de preset (mesmo com o workspace escondido) são salvas em silêncio a cada envio**. O toast "Presets do Anki Bridge salvos." pisca e logo é substituído. Com duas abas do painel abertas, a aba desatualizada sobrescreve os presets da outra | partial (efeito colateral surpresa) | ao enviar |

---

## D. Custos (`.bridge-cost-card`, painel.html:280-333)

Dados vêm de `GET /analytics/summary?lang=&from=&to=` e `GET /analytics/jobs?...` (js:1225-1250; server.py:892-900; bridge/analytics.py:297-415).

### D.1 Cabeçalho e total

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| D1 | `h3#bridge-costs-title` "Custos" | html:283 | estático | working | workspace aberto |
| D2 | `p` "Gasto, origem das imagens e ultimos jobs do bridge." | html:284 | estático | working | idem |
| D3 | label "Total do filtro" | html:290 | estático | working | idem |
| D4 | `#bridge-cost-total` "$0.0000" | html:291 | `formatUsd(costs.totalUsd)` (js:1560), 4 casas decimais; "$0.0000" em erro (js:1244) | working | idem |
| D5 | `#bridge-analytics-status-main` (small) | html:292 | `setBridgeStatusText` (js:1105). Textos: "Aguardando bridge..." (HTML), "Atualizando..." (js:1227), "`N` job(s) no filtro" (js:1239), "Analytics indisponivel. Verifique se o bridge esta online." (js:1243). Também serve de guarda: `atualizarBridgeAnalytics` não faz nada se este elemento não existir (js:1226) | working | idem |

### D.2 Grade de métricas `#bridge-analytics-metrics-main` (html:294, render em js:1562-1576)

Vazia até o 1º sucesso; **esvaziada** em erro (js:1246), sem mensagem de estado vazio.

| # | Rótulo (verbatim) | Valor | Campo de origem | Status / observação |
|---|---|---|---|---|
| D6 | "Cards" | `formatUsd(costs.cardUsd)` | custo de tokens do LLM que não são judge/guard (analytics.py:243-244) | working. O rótulo "Cards" para um **custo** confunde com a contagem "Cards" em E/F |
| D7 | "Imagem IA" | `formatUsd(costs.imageGenerationUsd)` | | working |
| D8 | "Judge" | `formatUsd(costs.imageJudgeUsd)` | tokens `[image_judge]` | working. Jargão em inglês, sem explicação |
| D9 | "Guard" | `formatUsd(costs.imageGuardUsd)` | tokens `[image_guard]` | working. Jargão em inglês, sem explicação |
| D10 | "Frases OK" | `cards.successful/cards.requested` | | working. "Frases" aqui, "Cards" em D6 |
| D11 | "Jobs OK" | `jobs.completed/jobs.total` | | working. Jobs `partial` contam como não OK |
| D12 | "Economia" | `formatUsd(images.savingsUsd)` | `cost_saved_vs_generated_usd` | working. Não explica economia "em relação a quê" |
| — | *(não mostrado)* `costs.otherUsd` | — | analytics.py:133, 264, 275 | **A soma das métricas visíveis pode ser menor que o Total (D4)**; a diferença não aparece |

### D.3 Filtros (html:297-321)

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| D13 | `.bridge-range-row[aria-label="Periodo dos custos"]` | html:298 | container | working | workspace aberto |
| D14 | `button.bridge-range-btn.active[data-analytics-range-main="today"]` "Hoje" | html:299 | click (js:976-983) → `bridgeAnalyticsRange='today'`, `aplicarDatasBridgeAnalytics()` (De=Até=hoje), `marcarBridgeAnalyticsRange()`, `atualizarBridgeAnalytics()` | working | idem |
| D15 | `[data-analytics-range-main="month"]` "Mes" | html:300 | De = dia 1 do mês, Até = hoje | working (sem acento, "Mês") | idem |
| D16 | `[data-analytics-range-main="all"]` "Tudo" | html:301 | limpa as duas datas | working | idem |
| D17 | label "Idioma" + `#bridge-analytics-lang-main` (Todos/EN/RU; values all/en/ru) | html:304-311 | change (js:965) → `atualizarBridgeAnalytics()` → `lang=` | working. Não é persistido; volta para "Todos" ao recarregar | idem |
| D18 | label "De" + `#bridge-analytics-from-main` (date) | html:312-315 | change (js:966-970) → range='custom' (desmarca os 3 botões) → recarrega. Se De > Até, o servidor inverte em silêncio (server.py:304-305) | working | idem |
| D19 | label "Ate" + `#bridge-analytics-to-main` (date) | html:316-319 | igual a D18 (js:971-975) | working (sem acento, "Até") | idem |
| — | Condição de corrida | js:1225-1250 | Cliques rápidos em range/idioma disparam requisições concorrentes sem cancelamento; uma resposta antiga pode sobrescrever a mais nova | partial (menor) | — |

### D.4 "Origem das imagens" `#bridge-image-rates-main` (html:325-326; js:1578-1591)

| # | Rótulo | Valor | Status |
|---|---|---|---|
| D20 | `.bridge-mini-title` "Origem das imagens" | título | working |
| D21 | "Google" | `realPct` %, barra, "`n` imagem(ns)" | working. `real` também inclui **openverse** (analytics.py:150), então "Google" não é exato |
| D22 | "Gerada" | `generatedPct`, "`n` imagem(ns)" | working |
| D23 | "Pulada" | `skippedPct` | working |
| D24 | "Falhou" | `failedPct`. Qualquer fonte não reconhecida cai aqui (analytics.py:156) | working |
| — | Estado vazio / erro | nada: o container fica `''` (js:1247), sobra só um título sem conteúdo | partial (estado vazio ausente) |
| — | `generatedAttempted` / `generatedAttemptPct` | calculado pelo servidor, nunca mostrado | — |

### D.5 "Jobs recentes" `#bridge-analytics-jobs-main` (html:329-330; js:1594-1634)

Mostra no máximo **12** jobs (`slice(0,12)`), sem aviso quando há mais. A lista rola (max-height 240px).

| # | Elemento | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| D25 | `.bridge-mini-title` "Jobs recentes" | html:329 | título | working | workspace aberto |
| D26 | vazio: "Sem jobs nesse filtro." | js:1598 | quando `jobs` está vazio | working | 0 jobs no filtro |
| D27 | `.bridge-analytics-job-id`, o `jobId` bruto (ex.: `20260914-113200-en-a1b2c3`) | js:1612 | exibição (truncado com reticências a 250px) | working (técnico) | por job |
| D28 | `.bridge-analytics-job-meta` "`dd/mm` \| `EN` \| `status`" | js:1613 | `formatDataCurta` (sem ano, sem hora) + lang em maiúsculas + `statusLabelBridge`: completed→"OK", failed→"Falhou", partial→"Parcial", running→"Rodando", queued→"Fila", senão o valor bruto (ex.: "unknown") ou "N/D" | working | por job |
| D29 | Botão "Continuar" `.bridge-retry-job-btn[data-retry-job]` (title/aria "Continuar job") | js:1606-1608 | click delegado (js:984-990) → `continuarBridgeJob(id)` (js:2335) → `POST /jobs/{id}/retry` → abre `#bridge-progress-modal` (fora do escopo) + polling a cada 3 s. Toasts "Job reenfileirado para continuar." / "Falha ao continuar job." | working | status `failed` ou `partial` |
| D30 | Botão só com ícone de download `.bridge-debug-btn[data-debug-job]` (title/aria "Baixar debug bundle") | js:1617-1623 | click delegado (js:991) → `baixarBridgeDebugBundle(id)` (js:1636) → `GET /jobs/{id}/debug-bundle` → baixa `anki-bridge-debug-<jobId>.json` (estado do job, logs, 200 linhas finais do log do bridge, caminhos do executável/perfil do Anki, config sanitizada). Toasts "Debug bundle baixado." / "Falha ao baixar debug bundle." | working (muito técnico) | todo job |
| D31 | Pills `.bridge-analytics-job-stats`: "`$x.xxxx`", "Frases `s`/`r`", "G `n` / IA `m`" | js:1626-1630 | exibição. "G"/"IA" são abreviações crípticas | working | por job |
| D32 | `.bridge-job-error` = `job.lastError` bruto | js:1604 | exceção do Python/código passado direto (escapado) | working (técnico) | quando `lastError` existe |
| — | Não mostrados, embora o servidor envie | analytics.py:404-405 | `deckName`, `imageSource`, `stage`, `updatedAt` | — | — |
| — | Status desatualizado | — | Sem polling: um job "Rodando" continua "Rodando" até o próximo refresh manual | partial | — |

---

## E. Baralhos e termos (`.bridge-anki-card`, painel.html:335-348)

Dados vêm de `GET /anki/stats/decks?deck=<en>&lang=en&deck=<ru>&lang=ru[&refresh=1][&launch=1]` (js:1263-1275, 1291-1304; server.py:938-951, 701-789). O servidor guarda cache de 60 s. Se o AnkiConnect não estiver pronto, cai para a leitura de `collection.anki2` direto do SQLite.

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| E1 | `h3#bridge-anki-title` "Baralhos e termos" | html:338 | estático | working | workspace aberto |
| E2 | `p` "Progresso por idioma no Anki, separado dos custos do bridge." | html:339 | estático, redação de dev | working | idem |
| E3 | `#btn-bridge-anki-repair` "Reparar Anki" (title "Fechar processos travados do Anki e reabrir o perfil configurado") | html:341 | click (js:964) → `repararBridgeAnki()` (js:1306): desabilita o botão, texto "Reparando...", área de stats mostra "Fechando Anki travado e reabrindo...", `POST /anki/repair` com **abort no cliente em 45 s** (js:1319). No servidor: taskkill em todos os processos do Anki (até ~20 s), espera 2 s, abre o Anki e aguarda até `anki_wait_timeout_sec` = **90 s** (bridge/config.json; anki_session.py:612-669). **Se o Anki demorar mais que ~43 s, a UI aborta e mostra "Nao foi possivel reparar o Anki: signal is aborted without reason" (mensagem do AbortError do Chrome), enquanto o reparo continua no servidor.** Resultados: ok → toast "Anki reparado. Atualizando cards e termos." e refresh; não ok mas `after.collectionReady\|connectAvailable` → toast com a mensagem formatada e refresh; senão → a área de stats mostra "Nao foi possivel reparar o Anki: `<msg>`" + toast "Nao foi possivel reparar o Anki." **Encerra à força qualquer Anki aberto**, sem confirm() | partial | workspace aberto |
| E4 | Container `#bridge-anki-stats-main` (grade de 3 colunas) | html:345 | alvo do render | working | idem |
| E5 | placeholder "Aguardando Anki..." | html:346 | fica até o workspace abrir pela 1ª vez | working | antes do 1º carregamento |
| E6 | carregando: "Atualizando Anki..." | js:1294 | | working | durante o fetch |
| E7 | erro: "Cards e termos por idioma indisponiveis. Use Reparar Anki e atualize novamente." | js:1302 | em resposta não-OK ou erro de rede; **descarta o `detail` do servidor** | working (mensagem vaga) | stats falharam |
| E8 | vazio: "Nenhum baralho configurado." | js:1375 | só se `decks` vier vazio. A UI sempre manda 2 decks e deck em branco vira o padrão, então isso é **inalcançável** | dead | — |
| E9 | aviso de cache antigo: "Mostrando cache anterior. Atualizacao do Anki falhou: `<data.message>`" | js:1382-1384 | `data.message` pode ser o código bruto **`ankistats_refresh_in_progress`** (server.py:724) ou um detalhe cru de exceção, tipo "ConnectionError: HTTPConnectionPool(...)" / "deckNames error: ..." (anki_session.py:91-112). Fallback: "AnkiConnect indisponivel" | working (texto técnico) | `data.stale` |
| E10 | aviso de fonte: "Stats lidos do banco local do Anki. Para enviar cards, o AnkiConnect ainda precisa abrir normalmente." | js:1385-1387 | quando `source === 'collection.anki2'`; o `sourceDetail`/`collectionPath` do servidor são ignorados | working | fallback local |
| E11 | Card total `.bridge-anki-total`: "Vocabulario na Frente" / "`N` palavras" / pills "`n` cards", "`n` termos alvo", "`x.xx` novos/card", "`n` maduros" / barra `mature/reviewed` | js:1388-1398 | exibição; "Frente" é o nome do campo da nota no Anki. A barra não tem rótulo nem legenda | working | ≥1 deck |
| E12 | Card por deck `.bridge-anki-deck`: "`Ingles\|Russo` \| `<deckName>`" / "`N` palavras" / pills "cards", "termos alvo", "novos/card", "`n` novos", "`n` recentes" (young+learning), "`n` maduros" / barra / "`n` notas \| `x.x`% maturidade" | js:1400-1421 | exibição | working | por deck |
| E13 | Deck ausente: classe `.bridge-anki-missing` (borda tracejada laranja), subtítulo "Baralho nao encontrado \| 0.0% maturidade" | js:1405-1406 | quando o servidor retorna `missing:true` (deck não está em `deckNames`, server.py:679-681). É o **único** retorno de que um nome de deck digitado em C4/C9 está errado | working | nome do deck não bate |

---

## F. Vocabulário (`.bridge-vocab-panel`, painel.html:350-379)

Dados vêm de `GET /anki/vocabulary?deck=<preset deck>&lang=&limit=10000[&q=][&status=][&type=]` (js:1431-1463; server.py:953-1000). Tem fallback live → `collection.anki2`.

| # | Elemento / seletor | file:line | O que faz | Status | Condição |
|---|---|---|---|---|---|
| F1 | `.bridge-mini-title` "Vocabulario" | html:353 | estático | working | workspace aberto |
| F2 | `#bridge-vocab-summary` | html:354 | Textos: "Aguardando Anki..." (HTML), "Calculando vocabulario da Frente..." (js:1453), "`N` item\|items em `Ingles\|Russo` \| mostrando `n`" (js:1493; **erro de português: "items" em vez de "itens"**), "Vocabulario indisponivel." (js:1460) | working (erro no plural) | idem |
| F3 | `#bridge-vocab-lang` (title "Idioma"): `en`="Ingles", `ru`="Russo" | html:357-360 | change (js:996) → `atualizarBridgeVocabulary()`; o deck vem de `bridgePresets[lang].deckName`. Não persistido (fica só em `bridgeVocabularyDeck.lang` na memória) | working | idem |
| F4 | `#bridge-vocab-type` (title "Tipo"): all="Palavras + termos", word="So palavras", term="So termos" | html:361-365 | change (js:995) → `type=` | working (sem acento, "Só") | idem |
| F5 | `#bridge-vocab-search` (type=search, placeholder "Buscar") | html:366 | input (js:993) → debounce de 250 ms (js:1426-1429) → `q=`. Busca por substring sem diferenciar maiúsculas, feita no servidor. **Cada tecla, depois do debounce, recalcula o vocabulário do deck inteiro via AnkiConnect**, e não há cancelamento, então respostas fora de ordem podem mostrar um resultado antigo | partial (condição de corrida, custo) | idem |
| F6 | `#bridge-vocab-status` (title "Status da palavra"): all="Todas", new="Novas", recent="Recentes", mature="Maduras", mixed="Mistas" | html:367-373 | change (js:994) → `status=`. O servidor também aceita `seen`, e a tabela mostra a pill "Visto", mas **não há opção de filtro para "Visto"**. O title diz "palavra", mas também filtra termos | working (opção faltando) | idem |
| F7 | `#bridge-vocab-list` placeholder "Aguardando vocabulario..." | html:376-378 | **Se o fetch de stats (E) falhar, o vocabulário nunca é pedido** (`atualizarBridgeVocabulary` só roda depois de um stats OK, js:1300), então F2/F7 ficam presos em "Aguardando Anki..." / "Aguardando vocabulario..." até o usuário mexer em algum filtro do vocabulário, mesmo que `/anki/vocabulary` funcionasse sozinho (ele tem fallback próprio) | partial | stats falharam |
| F8 | carregando: "Atualizando vocabulario..." | js:1452 | | working | durante o fetch |
| F9 | erro: "Nao foi possivel carregar o vocabulario." | js:1461 | descarta o erro do servidor (`deck_required`, `invalid_lang`, `anki_vocabulary_unavailable` + detail) | working (vago) | fetch falhou |
| F10 | vazio: "Nenhum item encontrado." | js:1496 | | working | 0 resultados |
| F11 | Tabela `.bridge-vocab-table`, colunas **Item, Tipo, Cards, Status, Maduros, Recentes, Novos** | js:1499-1522 | até **10.000 linhas** renderizadas via innerHTML (sem paginação/virtualização; o `offset` do servidor não é usado) | working (risco de desempenho) | ≥1 resultado |
| F12 | Pill de tipo `.bridge-vocab-type-pill.word\|term`: "Palavra" / "Termo" / "Item" (fallback) | js:1476-1482, 1514 | | working | por linha |
| F13 | Pill de status `.bridge-vocab-status-pill.<status>`: "Novo"/"Recente"/"Maduro"/"Misto"/"Visto" ou valor bruto | js:1465-1474, 1516 | | working | por linha |
| — | `data.sourceDetail` ("AnkiConnect indisponivel; lendo collection.anki2. Motivo: ...") | server.py:983 | nunca mostrado, então o usuário não fica sabendo que o vocabulário veio do fallback local | — | — |

---

## G. Catálogo de mensagens (verbatim), só desta área

| Texto | Canal | Gatilho | file:line |
|---|---|---|---|
| "Offline" / "Online" | badge (×2) | `/health` | html:85,197; js:1167 |
| "Aguardando bridge..." | sidebar + status de custos | HTML inicial | html:92, 292 |
| "Atualizando..." | idem | analytics carregando | js:1227 |
| "`N` job(s) no filtro" | idem | analytics OK | js:1239 |
| "Analytics indisponivel. Verifique se o bridge esta online." | idem | analytics falhou | js:1243 |
| "Presets do Anki Bridge salvos." | toast | Salvar presets / todo "Enviar ao Anki" | js:1158 |
| "Sem jobs nesse filtro." | vazio em Jobs recentes | 0 jobs | js:1598 |
| "Job reenfileirado para continuar." | toast | Continuar OK | js:2345 |
| "Falha ao continuar job." | toast | Continuar falhou (esconde 404 `job_not_found`) | js:2348 |
| "Debug bundle baixado." | toast | download OK | js:1651 |
| "Falha ao baixar debug bundle." | toast | download falhou | js:1653 |
| "Aguardando Anki..." | stats + resumo do vocab | HTML inicial | html:346, 354 |
| "Atualizando Anki..." | stats | carregando | js:1294 |
| "Cards e termos por idioma indisponiveis. Use Reparar Anki e atualize novamente." | stats | stats falharam | js:1302 |
| "Nenhum baralho configurado." | stats | inalcançável | js:1375 |
| "Mostrando cache anterior. Atualizacao do Anki falhou: " + `data.message` \| "AnkiConnect indisponivel" | stats | stale | js:1383 |
| (vindo do bridge em `data.message`) "ankistats_refresh_in_progress", "`<Exc>`: `<msg>`", "version error: …", "deckNames error: …" | idem | idem | server.py:724,758,777; anki_session.py:91-112 |
| "Stats lidos do banco local do Anki. Para enviar cards, o AnkiConnect ainda precisa abrir normalmente." | stats | fallback local | js:1386 |
| "Vocabulario na Frente", "palavras", "cards", "termos alvo", "novos/card", "maduros", "novos", "recentes", "notas", "maturidade", "Baralho nao encontrado", "Ingles", "Russo" | cards de stats | render | js:1389-1419 |
| "Reparando..." | texto do botão | reparo em andamento | js:1311 |
| "Fechando Anki travado e reabrindo..." | stats | reparo em andamento | js:1314 |
| "Anki reparado. Atualizando cards e termos." | toast | reparo ok | js:1333 |
| "Windows recusou fechar o Anki invisivel (processos: `<pids>`). Feche o Anki pelo Gerenciador de Tarefas como administrador ou reinicie o Windows; depois retente o job." | toast ou stats | reparo com acesso negado; texto longo num toast de 1,8 s; mostra PIDs; fala em "retente o job" num contexto de reparo | js:1286 |
| fallback de pids: "desconhecidos" | idem | | js:1284 |
| (vindo do bridge como `detail`) "Ainda existem processos do Anki rodando em segundo plano." / "O Windows recusou fechar processos do Anki. Feche pelo Gerenciador de Tarefas como administrador ou reinicie o Windows." / "anki_repair_in_progress" / `collectionDetail` bruto, ex.: "ConnectionError: …" / código "anki_repair_failed" | toast ou stats | reparo falhou | anki_session.py:614, 636-639, 668; server.py:916-919; js:1288 |
| "Nao foi possivel reparar o Anki: `<msg>`" (inclui "signal is aborted without reason" depois de 45 s) | stats | reparo falhou | js:1337 |
| "Nao foi possivel reparar o Anki." | toast | reparo falhou | js:1339 |
| "Calculando vocabulario da Frente..." | resumo do vocab | carregando | js:1453 |
| "Atualizando vocabulario..." | lista do vocab | carregando | js:1452 |
| "`N` item\|items em `Ingles\|Russo` \| mostrando `n`" | resumo do vocab | OK | js:1493 |
| "Vocabulario indisponivel." / "Nao foi possivel carregar o vocabulario." | resumo / lista do vocab | falhou | js:1460-1461 |
| "Nenhum item encontrado." | lista do vocab | 0 linhas | js:1496 |
| "Aguardando vocabulario..." | lista do vocab | HTML inicial / preso | html:377 |
| Rótulos de métrica: "Cards", "Imagem IA", "Judge", "Guard", "Frases OK", "Jobs OK", "Economia" | grade de custos | | js:1563-1569 |
| Taxas de imagem: "Google", "Gerada", "Pulada", "Falhou", "`n` imagem(ns)" | | | js:1579-1589 |
| Status de job: "OK", "Falhou", "Parcial", "Rodando", "Fila", "N/D", ou o valor bruto | meta de Jobs recentes | | js:1540-1549 |
| Pills do job: "Frases s/r", "G n / IA m" | | | js:1628-1629 |
| `job.lastError` bruto | Jobs recentes | | js:1604 |

Nenhum `confirm()` nem `alert()` nesta área (o único `confirm` do fluxo do bridge, "Apagar do Perpetual Miner as N frases enviadas ao Anki?" em js:2269, pertence ao modal de Envio ao Anki, fora do escopo).

---

## H. Endpoints do bridge chamados por esta área

| Endpoint | Chamado por | Campos usados na UI | Campos devolvidos e ignorados |
|---|---|---|---|
| `GET /health` | badges, a cada 15 s | só `resp.ok` | `jobs`, `activeJobId`, `runtime`, `moduleFingerprint` |
| `GET /analytics/summary` | custos | `costs.{totalUsd,cardUsd,imageGenerationUsd,imageJudgeUsd,imageGuardUsd}`, `jobs.{total,completed}`, `cards.{successful,requested}`, `images.{real,generated,skipped,failed,*Pct,savingsUsd}` | `costs.otherUsd`, `jobs.{failed,partial,running,queued,unknown}`, `cards.failed`, `byLanguage`, `generatedAttempt*` |
| `GET /analytics/jobs` | Jobs recentes | `jobId, createdAt, lang, status, lastError, costs.totalUsd, successfulCards, requestedCards, images.{real,generated}` | `deckName, imageSource, stage, updatedAt, failedCards, matchedRecords` |
| `GET /anki/stats/decks` | Baralhos e termos | `decks[], totals, stale, message, source` | `sourceDetail, collectionPath, generatedAt`; em 503 o `detail` é ignorado |
| `POST /anki/repair` | Reparar Anki | `ok, detail, after.{collectionReady,connectAvailable,collectionDetail}, accessDenied, kill.*, pids, processes, code` | `before`, `lastStatus` |
| `GET /anki/vocabulary` | Vocabulário | `words[], totalWords, lang` | `sourceDetail, filters`; em erro, `error/detail` é ignorado |
| `POST /jobs/{id}/retry` | Continuar | só `resp.ok` | corpo |
| `GET /jobs/{id}/debug-bundle` | download | JSON inteiro salvo em arquivo | — |
| `GET /anki/status`, `GET /anki/deck-stats` (alias) | **nunca chamados pelo painel** | — | — |

---

## I. Redundâncias

1. **Badge de saúde duas vezes**: `#bridge-health-badge` (sidebar, html:85) e `[data-bridge-health-badge]` (workspace, html:197). Mesma fonte.
2. **Custo total duas vezes**: `#bridge-sidebar-cost` e `#bridge-cost-total`, com rótulos diferentes ("Custo no filtro" vs "Total do filtro").
3. **Texto de status duas vezes**: `#bridge-sidebar-summary` e `#bridge-analytics-status-main`, via `setBridgeStatusText`. Em js:1240-1241 o texto da sidebar é escrito duas vezes.
4. **Botão "Continuar"** em dois lugares: Jobs recentes (js:1607) e o modal de progresso (js:2223), com markup quase igual. O modal também tem "Retentar falhos" (html:609) = a mesma ação `/retry` com outro verbo.
5. **Refresh do Anki**: "Gerenciar" (launch), o ícone de refresh (refresh+launch), "Salvar presets" (refresh+launch) e o fim do "Reparar Anki" (refresh) disparam todos `atualizarBridgeDeckStats`.
6. **Save de presets** pelo botão explícito (C13) **e** implícito a cada "Enviar ao Anki" (js:2087).
7. **Nomes de deck padrão definidos em 5 lugares, com valores divergentes**: painel.js:32-33 (`CIMV`/`RUSSIAN`), background.js:16-19 (`CIMV`,`English Mining` / `RUSSIAN`,`Russian Mining`), server.py:929-932 (`English Mining`/`Russian Mining` quando nenhum deck é passado), server.py:1035 (`"teste"` como deckName padrão de job), engine/start.py:289 (`CIMV`/`RUSSIAN`/`teste`).
8. **Nenhuma sobreposição com popup.html / bookreader.html** nesta área: grep por `anki|bridge|preset|deck|baralho|8766` nesses arquivos e JS não retorna nada. Os presets são lidos também pelo background.js (deck do vocabulário das keywords automáticas, background.js:936-939), sem que a UI avise.
9. (Fora do escopo, só registro) Os controles do Auto Miner existem tanto no painel (`.auto-miner-panel`, html:430-437) quanto no popup (`#autoMinerEn` etc., popup.html:34-50).

---

## J. Controles órfãos / código morto

JS com fallback para IDs que **não existem** em nenhum HTML (vestígios de um layout antigo de sidebar):

| Código | file:line | Alvo inexistente |
|---|---|---|
| `bridgePresetEl` → `byId(\`preset-${lang}-${field}\`)` | js:1085 | `#preset-en-deck`, `#preset-en-image`, `#preset-en-word-tld`, `#preset-en-phrase-tld`, `#preset-ru-*` |
| `setBridgePresetValue` (mesmo fallback) | js:1121 | idem |
| `bridgeAnalyticsLangEl` → `byId('bridge-analytics-lang')` | js:1089 | `#bridge-analytics-lang` |
| `bridgeAnalyticsFromEl` → `byId('bridge-analytics-from')` | js:1093 | `#bridge-analytics-from` |
| `bridgeAnalyticsToEl` → `byId('bridge-analytics-to')` | js:1097 | `#bridge-analytics-to` |
| `querySelectorAll('[data-analytics-range], …')` e `btn.dataset.analyticsRange` | js:976, 978, 1208-1209 | nenhum elemento tem `data-analytics-range` (só `-main`) |
| guardas `?.` em todos os handlers do bridge | js:949-996 | inofensivos, mas escondem esse legado |

UI inalcançável: E8 "Nenhum baralho configurado." (dead).

Nenhum controle sem handler: todos os botões, selects e inputs desta área têm listener.

---

## K. CSS de elementos que não existem mais (painel.css)

| Seletor | Linha | Observação |
|---|---|---|
| `.bridge-analytics-top` | 935 (dentro da lista de flex em 931-943) | não usado em HTML/JS |
| `.bridge-mini-title-row` | 1557-1562 | não usado |
| Os demais `.bridge-*` (≈88 seletores) | 823-1771 | todos referenciados; `.bridge-job-*`/`.bridge-progress-list` (1716-1771) servem o modal fora do escopo |

Problemas de CSS (não são órfãos):
- `.bridge-analytics-empty` é definido duas vezes: 1647-1654 (junto com `.bridge-job-error`, **texto vermelho**) e 1656-1666 (sobrescreve para **cinza**). Então **todas as mensagens de erro nesta área (E7, E9, F9, falha de reparo) aparecem com o mesmo visual neutro dos estados de carregando/vazio.** Não dá para distinguir erro de "carregando".
- `.bridge-mini-title` tem duas regras (952, 1553); `.bridge-rate-top` também (940, 1577); `.bridge-anki-deck strong` também (1216, 1226). É só regra fragmentada, não quebra nada.
- A classe `.bridge-analytics-job-meta` (nome de "analytics jobs") é reutilizada no subtítulo dos cards de deck (js:1419). Só nomenclatura.
- `.bridge-vocab-table { min-width: 760px }` força rolagem horizontal em larguras estreitas.

---

## L. Terminologia inconsistente (variantes do mesmo conceito)

| Conceito | Variantes encontradas |
|---|---|
| Deck | "Deck" (label do preset, html:226, 254; texto de ajuda "Decks, imagem e TLDs") · "Baralho(s)" ("Baralhos e termos", "Baralho nao encontrado", "Nenhum baralho configurado") · "deck" nos toasts/código do bridge |
| Preset | "Presets" · "Presets do Anki Bridge" · (repair) "perfil configurado" = perfil do Anki, conceito diferente mas palavra parecida. Não aparecem "modelo"/"perfil" como sinônimos de preset |
| Idioma | "EN"/"RU" (pills, filtro de custos) · "Ingles"/"Russo" (presets, vocab, cards de stats) · "Inglês" com acento (modal de progresso, js:2227) · "Todos" vs "Todas" (filtro de custos vs filtro de status) |
| Unidade de envio | "job(s)" · "lote(s)" (toast do Enviar, js:2147) · "Jobs recentes" · "Jobs OK" |
| Nota/card | "cards" · "notas" · "Frases OK" / "Frases s/r" · "Cards" (como **rótulo de custo**, D6) |
| Vocabulário | "Vocabulario" · "Vocabulario na Frente" · "palavras" · "termos" · "termos alvo" · "itens"/"items" · "Item" (cabeçalho da tabela) · "Palavras + termos" |
| Maturidade | "Novas/Novos/Novo" · "Recentes/Recente" (= young+learning) · "Maduras/maduros/Maduro" · "Mistas/Misto" · "Visto" (sem opção de filtro) · "maturidade" |
| Imagem | "Fonte de imagem" (preset) · "Origem das imagens" (custos) · "Google Images"/"Google"/"G" · "DALL-E"/"Imagem IA"/"Gerada"/"IA" |
| Retentar | "Continuar" · "Continuar job" · "Retentar falhos" · "reenfileirado" · (mensagem de reparo) "retente o job" |
| Serviço | "Anki Bridge" · "bridge" · "serviço residente" (toast do Enviar) · "AnkiConnect" · "banco local do Anki" |
| Atualizar | "Atualizar custos" (tooltip) faz custos + Anki + vocab · "Atualizando..." / "Atualizando Anki..." / "Atualizando vocabulario..." |
| Custos | "Custos" · "Analytics" ("Analytics indisponivel") · "Gasto" · "Total do filtro" · "Custo no filtro" · "Economia" |
| Acentuação | Esta área quase inteira não tem acento: "Ingles", "Mes", "Ate", "Vocabulario", "Configuracoes", "navegacao", "rapida", "ultimos", "indisponivel", "Nao foi possivel", "Atualizacao", "invisivel", "So palavras". O resto do painel usa acento ("Inglês", "Não foi possível ler o status do bridge.", "indisponível"). Mais o plural errado "items" (js:1493) |

---

## M. Controles/conteúdo técnico demais exposto ao usuário (só sinalizados)

- TLD palavra / TLD frase (C6, C7, C11, C12): TLDs do gTTS usados para escolher o sotaque, em texto livre.
- Nome do Deck em texto livre, que precisa bater exatamente com o Anki (C4, C9).
- Fonte de imagem "DALL-E" (nome de modelo desatualizado) (C5, C10).
- Métricas de custo "Judge", "Guard"; USD com 4 casas decimais; "Economia" sem explicação (D6-D12).
- `jobId` bruto (D27); abreviações "G n / IA m" (D31).
- `lastError` bruto (D32), `data.message` bruto (E9), `detail`/`collectionDetail` brutos no reparo, códigos crus como `anki_repair_failed`, `anki_repair_in_progress`, `ankistats_refresh_in_progress`, e "signal is aborted without reason".
- Botão "Baixar debug bundle" (D30): baixa um dump JSON com estado do job, logs, caminhos do executável/perfil do Anki e config.
- PIDs de processo na mensagem de acesso negado (js:1286).
- "Reparar Anki": mata processos do Anki à força, sem confirmação (E3).
- "Frente" (nome do campo da nota no Anki) em "Vocabulario na Frente" / "Calculando vocabulario da Frente..." (E11, F2).
- Menções a "AnkiConnect", "banco local do Anki" / collection.anki2 (E9, E10).

---

## N. Mensagens que não dizem nada (ou escondem a causa real)

- "Custo no filtro" (sidebar): o filtro não aparece quando o workspace está fechado.
- "Configuracoes separadas da navegacao, com custos e jobs em leitura rapida." / "Progresso por idioma no Anki, separado dos custos do bridge." descrevem o layout, não o que o usuário faz aqui.
- "$0.0000" em erro de analytics fica igual a "gasto zero" (js:1244-1245).
- Erro de analytics deixa as colunas "Origem das imagens" e "Jobs recentes" **em branco**, sem mensagem (js:1246-1248).
- "Analytics indisponivel. Verifique se o bridge esta online." aparece até quando o badge diz "Online" (ex.: um erro 500), e continua na sidebar depois que o bridge volta, porque o poll de health não re-dispara o analytics.
- "Cards e termos por idioma indisponiveis. Use Reparar Anki e atualize novamente." descarta o `detail` do servidor.
- "Nao foi possivel carregar o vocabulario." / "Vocabulario indisponivel." descartam `error`/`detail`.
- "Nao foi possivel reparar o Anki." (toast) é genérico; e "…: anki_repair_failed" / "…: anki_repair_in_progress" / "…: signal is aborted without reason" são códigos crus.
- "Mostrando cache anterior. Atualizacao do Anki falhou: ankistats_refresh_in_progress" é um código cru.
- "Falha ao continuar job." / "Falha ao baixar debug bundle." não trazem o motivo (ex.: 404 `job_not_found`).
- "Aguardando Anki..." / "Aguardando vocabulario..." ficam presos para sempre quando o stats falha (F7).
- Status "N/D" ou "unknown" cru em Jobs recentes.
- A mensagem longa de acesso negado vai para um toast que some em 1,8 s (js:1327).
- "Presets do Anki Bridge salvos." pisca a cada "Enviar ao Anki", mesmo sem o usuário ter mexido em preset.

---

## O. Lista resumida de problemas funcionais (por severidade)

1. **Reparar Anki: timeout de 45 s no cliente vs até ~110 s no servidor** (js:1319 vs anki_session.py:617-660 + config `anki_wait_timeout_sec: 90`): a UI reporta falha ("signal is aborted without reason") enquanto o reparo ainda roda e pode dar certo. Além disso, o reparo mata qualquer Anki aberto sem confirm().
2. **O vocabulário depende do sucesso do stats** (js:1300): quando o stats falha, o Vocabulário fica preso em "Aguardando…", embora o endpoint dele tenha fallback próprio.
3. **Save implícito dos presets a cada "Enviar ao Anki"** (js:2087), sem sync entre abas: uma aba desatualizada sobrescreve os presets.
4. **Estados de erro com o mesmo visual de carregando/vazio** (CSS 1647-1666 sobrescreve o vermelho para cinza).
5. **Total ≠ soma das métricas** porque `otherUsd` não aparece.
6. **"Google Images" pode gerar custo de IA** (fallback no motor) e "DALL-E" é um nome de modelo desatualizado.
7. **Filtro de vocabulário sem "Visto"**; plural "items"; tabela de 10k linhas renderizada de uma vez; buscas concorrentes sem cancelamento.
8. **Sem polling no workspace**: Jobs recentes e custos ficam defasados enquanto os jobs rodam.
9. **Código morto de IDs legados** (seção J) e 2 seletores CSS mortos (seção K); a mensagem "Nenhum baralho configurado." é inalcançável.
