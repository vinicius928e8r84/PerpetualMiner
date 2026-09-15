# Inventário UI — painel.html: shell + "Frases mineradas" + modais

Repo: `/mnt/c/Users/sadvi/Desktop/MineradorLegendas` (HEAD `42994e0`). Auditoria somente leitura.
Arquivos: `painel.html` (617 l.), `painel.css` (2040 l.), `painel.js` (2739 l.). Comparado com `popup.html/js`, `bookreader.html/js`, `background.js`, `bridge/server.py`.

Legenda de status: **working** = funciona · **broken** = tem handler mas comportamento errado/enganoso · **orphan** = sem handler ou handler aponta p/ elemento inexistente · **dead** = nunca aparece / caminho inalcançável / sobrescrito.

---

## 0. Arquitetura de informação (IA) atual

- **Uma única página** (`painel.html`), sem abas, sem roteamento, sem hash. Layout: `body{display:flex;height:100vh;overflow:hidden}` → **sidebar fixa roxa (260px)** + **`<main>` com scroll vertical próprio**.
- **Sidebar** (de cima p/ baixo): logo → saudação + "Total N frases" + lixeira "apagar tudo" → login Google/Firebase → card compacto "Anki Bridge" (badge, custo, resumo, botão **Gerenciar**) → **lista de fontes/streamings** (`#platform-nav`, que *parece* navegação mas é um **filtro** da lista) → "Sair" (fecha a aba).
- **Main** (tudo empilhado, rolando):
  1. `.main-header`: título fixo "Frases mineradas" + **barra de 11 controles** (BookReader, Pág., Todas, Editar Selecionados, contador, Deletar, Exportar .txt, Enviar ao Anki, Importar .txt, Adição em Massa, ícone ☰ decorativo). `.header-right` não tem `flex-wrap` → estoura em telas estreitas.
  2. `#bridge-workspace` (**seção inline colapsável**, oculta por padrão; aberta por "Gerenciar", fechada por "Fechar") — Presets/Custos/Baralhos/Vocabulário (fora do escopo; ver outro agente). Aparece *entre* o header e a toolbar de filtros, empurrando a lista para baixo.
  3. `.main-toolbar`: 3 dropdowns (Fonte, Idioma, Ordem) + toggle "Esconder Exportadas" + mini-painel Auto Miner (EN/RU).
  4. `#phrases-list`: lista paginada (10/página), agrupada por data.
  5. `.main-footer`: paginação + "X a Y de N frases".
- **Overlays**: modal Editar Metadados (`#edit-modal`), modal Adição em Massa (`#bulk-add-modal`), overlay de importação (`#import-overlay`), modal Envio para o Anki (`#bridge-progress-modal`), toast (`#_toast`, criado dinamicamente, 1,8 s), `confirm()` nativos.
- **Telas distintas**: 1 tela + 1 seção expansível (Bridge) + 3 modais + 1 overlay (que na prática nunca pinta) + BookReader em **outra aba** (`bookreader.html`, link `target=_blank`).
- Nenhum estado de filtro/ordem/toggle é persistido (reload volta ao padrão).

---

## 1. Shell — Sidebar

| # | Elemento / seletor | Arquivo:linha | O que faz (handler → efeito) | Status | Quando aparece |
|---|---|---|---|---|---|
| S1 | Logo SVG + "**Perpetual**Miner" `.sidebar-logo` | html:13-26 | Decorativo, sem handler | working (estático) | sempre |
| S2 | Saudação "Olá, **Vinicius ;-;**" `.user-greeting` | html:29 | **Texto hardcoded**; não usa o nome do usuário logado (`#firebase-name` é outro lugar) | broken (conteúdo fixo/pessoal) | sempre |
| S3 | "Total `<span id=total-count>` frases" | html:31; js:537, 802, 2010, 2023, 2061, 2308, 2576, 2657 | Contador = `todasFrases.length` (total geral, **ignora filtros**) | working | sempre; "0" até carregar |
| S4 | Lixeira `#btn-apagar-tudo` (`title="Apagar todas"`, só ícone 13px) | html:32-38; js:820 → `apagarTudo()` js:2015 | `confirm('Apagar TODAS as frases?\nEsta ação não pode ser desfeita.')` → zera `todasFrases`, `chrome.storage.local.set({frases:[]})`, `apagarTudoFirestore()` (tombstones sync/local/Firestore + DELETE por doc). Sem toast de sucesso; falha na nuvem só muda sync-status para "Erro de sync" | working (ação destrutiva escondida num ícone minúsculo ao lado do contador) | sempre |
| S5 | `#btn-login-google` "Login com Google" | html:49-57; js:847 → `loginGoogle()` js:94 | `chrome.identity.launchWebAuthFlow` → Google userinfo → Firebase `signInWithIdp`; salva `pm_firebase_auth`/`pm_user_info`; 1ª vez migra frases locais (`migrarParaFirestore`) senão `carregarFrasesFirestore` | working | deslogado (`#firebase-logged-out`) |
| S6 | Dica "Sincronize suas frases em qualquer dispositivo" `.firebase-hint` | html:58 | texto | working | deslogado |
| S7 | Avatar `#firebase-avatar` | html:64; js:199-201 | `src=photoURL`, `display:block` se houver foto | working | logado + foto |
| S8 | Nome `#firebase-name` | html:66; js:198 | `displayName || email || 'Usuário'` | working | logado |
| S9 | Status de sync `#sync-status` (inicial "✓ Sincronizado") | html:67-72; `setSyncStatus()` js:808 | Textos: "Migrando…", "Sincronizando…", "Enviando frases…", "Sincronizado", "Erro de sync". Ícone ✓ só para "Sincronizado", ícone "refresh" para todos os demais — **inclusive "Erro de sync"** (erro parece "sincronizando") | working / ícone enganoso no erro | logado |
| S10 | `#btn-logout` "Sair da conta" | html:75; js:848 → `logout()` js:183 | Remove credenciais do storage, mostra estado deslogado, recarrega frases locais. Sem confirmação/toast | working | logado |
| S11 | Card "Anki Bridge" `h3.bridge-title` | html:84 | título | working | sempre |
| S12 | Badge `#bridge-health-badge` "Offline"/"Online" | html:85; `atualizarBridgeHealth()` js:1161 (a cada 15 s, `GET 127.0.0.1:8766/health`) | Alterna classe online/offline | working | sempre |
| S13 | "Custo no filtro" + `#bridge-sidebar-cost` "$0.0000" | html:88-91; js:1244-1245, 1561 | Custo do **filtro de analytics do Bridge** (padrão "Hoje"), NÃO do filtro da lista de frases — rótulo ambíguo no contexto da página | working / ambíguo | sempre |
| S14 | `#bridge-sidebar-summary` "Aguardando bridge..." | html:92; js:1105-1108, 1227, 1239-1241, 1243 | "Atualizando..." → "`N job(s) no filtro`" ou "Analytics indisponivel. Verifique se o bridge esta online." (sem acentos). Pode contradizer o badge (badge Online + texto "indisponivel") | working | sempre |
| S15 | `#btn-open-bridge-workspace` "Gerenciar" | html:93; js:950 → `abrirBridgeWorkspace()` js:1021 | Remove `.hidden` de `#bridge-workspace`, `scrollIntoView`, `atualizarBridgeWorkspaceData({includeAnki:true, launchAnki:true})` (**pode lançar o Anki no PC** só por abrir o painel de gestão). Não alterna: clicar de novo não fecha | working | sempre |
| S16 | `#platform-nav` — itens gerados `button.nav-item[data-streaming]` ("Todos os Streamings" + 1 por `f.streaming` distinto, ícone colorido de `PLATAFORMAS` ou letra) | html:96; `construirSidebar()` js:1662; click js:911 → `filtrarPor()` js:1731 | Filtra a lista por fonte; marca `.active`. **Duplica o dropdown Fonte (T1)**. Nome = `capitalizar(s)` **sem escape** → HTML injetável via campo "Fonte" dos modais (CSP MV3 bloqueia script inline, mas quebra o markup). Case-sensitive: "Netflix" e "netflix" viram dois itens | working (redundante; bug de escape) | sempre (só "Todos os Streamings" se sem frases) |
| S17 | `#btn-sair` "Sair" (ícone de logout) | html:99-108; js:821 → `window.close()` | Fecha a aba do painel. Ícone e texto idênticos a "logout" — confunde com "Sair da conta" (S10) | working / terminologia confusa | sempre |

## 2. Shell — Header global (`.main-header`)

| # | Elemento | Arquivo:linha | O que faz | Status | Quando |
|---|---|---|---|---|---|
| H1 | `h1.main-title` "Frases mineradas" | html:117 | Título fixo — não muda quando o Bridge workspace está aberto | working | sempre |
| H2 | Ícone funil roxo ao lado do título | html:118-120 | **Decorativo, sem handler** (sugere filtro clicável) | orphan (affordance falsa) | sempre |
| H3 | Link `a.bookreader-btn` "BookReader" (`title="Abrir BookReader – transcrição de livros físicos"`) | html:123-129 | Abre `bookreader.html` em nova aba | working | sempre |
| H4 | `#btn-sel-pagina` "Pág." | html:130; js:825 → `selecionarPagina()` js:742 | Seleciona/desmarca as ≤10 frases da página atual; `.sel-active` + title "Desmarcar página atual"/"Selecionar página atual" (`atualizarBotoesSel` js:774) | working | sempre |
| H5 | `#btn-sel-todos` "Todas" → "Todas (N)" | html:131; js:826 → `selecionarTodosVisiveis()` js:758 | Seleciona/desmarca todas as frases **filtradas** (todas as páginas). Title "Desmarcar todas"/"Selecionar todas (N)" | working | sempre |
| H6 | `#btn-bulk-edit` "Editar Selecionados" (2 ícones: lápis + pasta) | html:132-140; js:824 → `abrirModalBulk()` js:2379 | Sem seleção: toast "Selecione ao menos uma frase para editar."; senão abre M1 em modo bulk | working (sempre habilitado) | sempre |
| H7 | `#selection-count` "N selecionada(s)" | html:141; `atualizarContadorSelecao()` js:721 | Conta `selecionadas` — **inclui frases fora do filtro atual** (seleção persiste ao trocar filtro) | working / pode enganar | só se ≥1 selecionada |
| H8 | `#btn-delete-selected` "Deletar" | html:142-149; js:849 → `deletarSelecionadas()` js:791 | `confirm('Deseja deletar as N frase(s) selecionadas?\nEsta ação não pode ser desfeita.')` → remove local + `removerFrasesFirestore` → toast "N frase(s) deletada(s)!". Apaga também selecionadas ocultas pelo filtro | working | só se ≥1 selecionada |
| H9 | `#btn-export` "Exportar .txt" (`title="Exportar frases com keyword como .txt"`) | html:150-157; js:822 → `exportarTxt()` js:2029 | Sem seleção: toast "Selecione as frases que deseja exportar."; senão baixa `perpetualminer-export.txt` (linhas `kw : texto [Contexto: fonte - titulo - detalhe]`, "Desconhecido" p/ vazios), **marca status `exported`** (→ badge "No Anki" e escondida por "Esconder Exportadas" mesmo sem ter ido ao Anki), limpa seleção, `firestoreBatchUpsert` sem `.catch`. Tooltip mente: exporta **todas** as selecionadas, com ou sem keyword. Toast "`N frases exportadas!`" sem singular | broken (efeito colateral "No Anki" enganoso; tooltip errado) | sempre |
| H10 | `#btn-send-anki` "Enviar ao Anki" | html:158-164; js:823 → `enviarSelecionadasAoAnki()` js:2081 | Sem seleção: toast. Senão **chama `salvarBridgePresets()`** (toast "Presets do Anki Bridge salvos." + se workspace aberto relança Anki), `GET /health`, agrupa por idioma, `POST /jobs` por idioma (EN/RU), abre M3 e faz polling de `GET /jobs` a cada 3 s. Sem estado de loading/disable → duplo clique cria jobs duplicados. Erro de rede no `POST /jobs` não é capturado (promise rejeitada, nenhuma mensagem). Se EN cria e RU falha, retorna sem acompanhar o job EN criado | working c/ bugs (duplo envio, erro silencioso, job órfão) | sempre |
| H11 | `#import-file-input` (file, `.txt`, hidden) | html:165; js:842 | `change` → `importarArquivoTxt(file)` | working | nunca visível |
| H12 | `#btn-import` "Importar .txt" (`title="Importar frases de um arquivo .txt exportado"`) | html:166-173; js:841 → `abrirImportador()` js:2585 | Clica no input; parse `parsearLinhaExportada` (js:2666) **descarta o prefixo de keyword** → exportar→importar perde as keywords; linhas com " : " no texto são truncadas; deduplica por texto (lowercase); `streaming:'importado'` se sem fonte; auto-keywords (só inglês) via `AUTO_KEYWORDS_FOR_PHRASE`; `firestoreBatchUpsert` com erro só no console | working c/ perda de dados (keywords) | sempre |
| H13 | `#btn-multi-add` "Adição em Massa" | html:174-180; js:829 → `abrirModalMultiAdd()` js:2525 | Abre M2 limpo | working | sempre |
| H14 | Ícone ☰ (3 linhas) no fim do header | html:181-185 | **Decorativo, sem handler** — parece menu | orphan (affordance falsa) | sempre |

## 3. Shell — `#bridge-workspace` (apenas pontos de ligação; conteúdo coberto por outro agente)

| # | Elemento | Linha | Nota |
|---|---|---|---|
| B1 | Section inline `#bridge-workspace` "Anki Bridge / Presets e custos" | html:189-382 | Não é aba/tela; seção oculta dentro do `<main>`. Aberta por S15, fechada por `#btn-close-bridge-workspace` "Fechar" (js:953 → `fecharBridgeWorkspace` js:1030, rola até a lista). Subtítulo "Configuracoes separadas da navegacao, com custos e jobs em leitura rapida." é jargão/sem acentos |
| B2 | Badge duplicado `[data-bridge-health-badge]` | html:197 | Mesmo estado do S12 (redundância intencional) |
| B3 | Presets (inputs `preset-main-*`) | html:219-277 | São lidos por **H10** (Enviar ao Anki) mesmo com a seção fechada; H10 os re-salva a cada envio |
| B4 | Fallbacks legados no JS | js:1085, 1089-1098, 1121, 976, 1208 | `preset-${lang}-${field}`, `bridge-analytics-lang/from/to`, `[data-analytics-range]` — **IDs inexistentes** (restos de uma versão antiga na sidebar). Código morto |

## 4. "Frases mineradas" — Toolbar de filtros (`.main-toolbar`)

| # | Elemento | Linha | O que faz | Status | Quando |
|---|---|---|---|---|---|
| T1 | `#dropdown-trigger` / `#dropdown-label` "Todas as Fontes" | html:387-392; js:874 | Abre `#dropdown-menu` (fecha os outros). Rótulo inicial "Todas as Fontes", mas após escolher "all" vira **"Todos os Streamings"** (`infoPlataforma('all').nome`) | working / rótulo inconsistente | sempre |
| T1a | `#dropdown-menu` itens `.dropdown-item[data-streaming]` | html:393; `construirDropdown()` js:1671; click js:916 | `filtrarPor()` — mesmo efeito de S16. Sem marcação do item ativo. Nome sem escape | working (redundante com S16) | ao abrir |
| T2 | `#idioma-trigger` / `#idioma-label` "Todos os Idiomas" | html:398-405; js:881-891 | Menu gerado de `f.idioma` distintos (`construirDropdownIdioma` js:1679): "Todos os Idiomas", "🇬🇧 Inglês", "🇷🇺 Russo", ou valor bruto. → `filtrarIdiomaPor()` js:1688 | working | sempre |
| T3 | `#ordem-trigger` / `#ordem-label` "Mais novas primeiro" + itens "Mais novas primeiro"/"Mais velhas primeiro" | html:409-418; js:893-903 → `filtrarOrdem()` js:1697 | Ordena por `id` (timestamp). Fallback de label "Ordenar" nunca usado | working | sempre |
| T4 | Clique fora fecha menus | js:905-909 | — | working | — |
| T5 | `#btn-hide-exported` "Esconder Exportadas" (`title="Mostrar/ocultar frases já exportadas para o Anki"`) | html:422-429; js:862-867 | Alterna `esconderExportadas` + `.active`; volta à pág. 1. **Texto não muda** quando ativo (só a cor); "exportadas" inclui as exportadas para .txt (H9) | working / rótulo ambíguo | sempre |
| T6 | `.auto-miner-panel` (`title="Auto Miner por idioma"`, **sem rótulo visível**) | html:430-437 | Contêiner | working | sempre |
| T6a | `#panel-auto-en` / `#panel-auto-ru` checkbox "EN"/"RU" | html:431, 434; js:997-998 → `salvarAutoMinerPainel()` js:1066 | `chrome.runtime.sendMessage({type:'AUTO_MINER_SET_SETTINGS'})` (background.js:149). Erros ignorados em silêncio | working | sempre |
| T6b | `#panel-auto-limit-en/ru` number (1-100, "20") | html:432, 435; js:999-1000 | Idem; limite é clampado no background. Sem label/unidade | working | sempre |
| T6c | `#panel-auto-count-en/ru` "0/20" | html:433, 436; `renderizarAutoMinerPainel()` js:1049 | "minerado hoje / limite diário" — sem legenda. Atualiza via `AUTO_MINER_GET_STATE` e `storage.onChanged(pm_auto_miner_state_view)`. O listener `runtime.onMessage AUTO_MINER_STATE_CHANGED` (js:565) provavelmente **nunca dispara** (background usa `chrome.tabs.sendMessage`, que só alcança content scripts) — redundante/morto, inofensivo | working | sempre |

> **Não existe campo de busca/pesquisa** na lista de frases (a única busca da página é a do Vocabulário do Bridge).

## 5. "Frases mineradas" — Lista (`#phrases-list`) e linhas

| # | Elemento | Linha | O que faz | Status | Quando |
|---|---|---|---|---|---|
| L1 | Estado inicial `.empty-state` "Carregando..." | html:441 | Substituído no 1º render | working | até carregar |
| L2 | Estado vazio "Nenhuma frase encontrada." (+ ícone balão) | js:1786-1793 | Único vazio: **não distingue** "não há frases" de "filtros ocultam tudo" nem sugere ação | working / pouco informativo | lista filtrada vazia |
| L3 | Cabeçalho de data `.date-label` "dd/mm/aaaa (hoje/ontem/N dias atrás)" ou "Sem data" | js:1796-1804, `labelDiasAtras` js:2694 | Agrupa a página por `f.data` | working | por grupo |
| L4 | Checkbox por linha `.frase-check[data-id]` | js:1831; change js:940 | Adiciona/remove de `selecionadas` → H7/H8 | working | cada linha |
| L5 | Palavras clicáveis `span.word[data-id][data-idx]` (`.active` = keyword) | js:1808-1814; click js:937 → `toggleWord()` js:1869 | Liga/desliga a palavra como keyword no último grupo; salva local + Firestore (`keywords`,`autoKeyword:false`). Keywords legadas sem `@idx` destacam **todas** as ocorrências e não são removíveis clicando (só pelo ×) | working (edge legado) | cada linha |
| L6 | Chip de keyword `.kw-chip` com rótulo "keyword:" ou "auto:" (verde `.auto` p/ auto-keyword) | js:1815-1823, `atualizarChip` js:1935 | Mostra keywords; grupos separados por "|" | working | se houver keywords |
| L7 | Botão × `.kw-clear[data-action=clear-kw]` (`title="Remover keywords"`) | js:1820; → `clearKeywords()` js:1909 | Remove todas as keywords da frase | working | com chip |
| L8 | Botão + `.btn-add-sep[data-action=add-sep]` (`title="Adicionar segundo grupo"`) | js:1822; → `addSeparator()` js:1922 | Anexa "|" para começar novo grupo. Sem feedback além de "|" no chip; tooltip diz "segundo" mas permite N grupos | working / pouco claro | com chip |
| L9 | Badge `.anki-badge` "✓ No Anki" | js:1827-1828 | Mostrado para `status==='exported'` — **também após Exportar .txt**, e para duplicatas que já existiam no deck | broken (semântica falsa) | status exported |
| L10 | Linha de contexto `.phrase-ctx` (ponto colorido + "Título · Detalhe · Plataforma") | `renderizarContexto()` js:2459 | Web/PDF omitem o nome da plataforma | working | se fonte/contexto |
| L11 | Estilo linha exportada `.phrase-item.exported` (opacidade 0.5) | css:391; js:1825 | — | working | exported |
| L12 | Estilo russo `.frase-ru` (sem itálico) | css:421-427; js:1826 | — | working | idioma Russo ou cirílico |
| L13 | Ação "Editar texto da frase" `[data-action=edit-text]` (ícone T) | js:1837-1843 → `editarTextoFrase()` js:1952 | Troca o texto por `<textarea.phrase-edit-input>`; Enter/blur salva, Esc cancela; toast "Frase atualizada!". Keywords indexadas (`@idx`) podem desalinhar após edição | working | cada linha |
| L14 | Ação "Editar metadados" `[data-action=edit]` (lápis) | js:1844-1847 → `abrirEdicaoIndividual()` js:2389 | Abre M1 modo individual | working | cada linha |
| L15 | Ação "Copiar frase" `[data-action=copy]` | js:1848-1852 → `copiarFrase()` js:1997 | `navigator.clipboard.writeText` → toast "Copiado!"; falha sem mensagem | working | cada linha |
| L16 | Ação "Apagar frase" `.btn-icon.danger[data-action=delete]` | js:1853-1858 → `deletarFrase()` js:2003 | **Apaga sem confirmação e sem toast** (bulk pede confirm) | working / inconsistente | cada linha |

## 6. "Frases mineradas" — Paginação (`.main-footer`)

| # | Elemento | Linha | O que faz | Status |
|---|---|---|---|---|
| P1 | `#btn-first` (title "Primeira") | html:446; js:869 | `irPagina(1)`; disabled na pág. 1 | working |
| P2 | `#btn-prev` ("Anterior") | html:451; js:870 | — | working |
| P3 | `#page-current` "1" · "de" · `#page-total` "1" | html:456-458; js:1777-1778 | Indicador (não editável) | working |
| P4 | `#btn-next` ("Próxima") | html:459; js:871 | — | working |
| P5 | `#btn-last` ("Última") | html:464; js:872 | — | working |
| P6 | `#page-info` "X a Y de N frases" / "0 frases" | html:470; js:1779-1780 | Tamanho de página fixo (10), sem seletor | working |

## 7. Modal M1 — Editar Metadados (`#edit-modal`)

| # | Elemento | Linha | O que faz | Status | Quando |
|---|---|---|---|---|---|
| M1.1 | `#modal-title` "Editar Metadados" / "Editar N frase(s) selecionada(s)" | html:480; js:2383, 2394 | — | working | aberto |
| M1.2 | `#modal-subtitle` — bulk: "Campos em branco não serão alterados"; individual: `"<prévia 65 chars…>"` | html:481; js:2384, 2395 | — | working | aberto |
| M1.3 | `#btn-modal-close` (×, title "Fechar") | html:483; js:851 → `fecharModal` | — | working | — |
| M1.4 | Campo "Fonte" `#modal-fonte` (placeholder "Ex: netflix, youtube, web, livro"; hint "Plataforma ou tipo de origem") | html:491-496 | Texto livre; **também sobrescreve `streaming`** → cria/renomeia item de filtro na sidebar (case-sensitive; sem escape) | working / arriscado | — |
| M1.5 | Campo "Título" `#modal-titulo` (placeholder "Ex: Stranger Things, Atomic Habits") | html:497-501 | — | working | — |
| M1.6 | Campo "Detalhe" `#modal-detalhe` (placeholder "Ex: S04E01, Cap. 3, Canal: Naval"; hint "Episódio, capítulo ou informação complementar") | html:502-507 | — | working | — |
| M1.7 | `#btn-modal-cancel` "Cancelar" | html:511; js:852 | fecha | working | — |
| M1.8 | `#btn-modal-save` "✓ Salvar" | html:512-517; js:853 → `salvarModal()` js:2410 | bulk → `salvarEdicaoEmMassa` (campos vazios preservados; limpa seleção; toast "Metadados atualizados!"; falha Firestore só muda sync-status). individual → `salvarEdicaoIndividual` (Fonte vazia preserva, **Título/Detalhe vazios apagam** — regra diferente do bulk; toast "Frase atualizada!") | working / regras inconsistentes | — |
| M1.9 | Teclado: Esc fecha; **Enter salva** (em qualquer campo); clique no backdrop fecha | js:854-860 | — | working | — |
| M1.10 | Foco em "Título" no modo individual | js:2400 | **Sobrescrito** 50 ms depois pelo foco em "Fonte" (`abrirModal` js:2405) | dead | — |

## 8. Modal M2 — Adição em Massa (`#bulk-add-modal`)

| # | Elemento | Linha | O que faz | Status |
|---|---|---|---|---|
| M2.1 | Título "Adição em Massa" / subtítulo "Cole as frases — uma por linha" | html:529-530 | — | working |
| M2.2 | `#btn-bulk-add-close` (×) | html:532; js:830 | fecha | working |
| M2.3 | "Frases" `#bulk-add-textarea` (placeholder 3 frases de exemplo em inglês) | html:541-544 | — | working |
| M2.4 | "Fonte" `#bulk-add-fonte` (placeholder "Ex: livro, web, podcast") | html:548-550 | vazio → `'manual'` | working |
| M2.5 | "Título" `#bulk-add-titulo` (placeholder "Ex: Atomic Habits") | html:553-556 | Sem campo "Detalhe" (M1 tem) | working |
| M2.6 | Barra de progresso `#bulk-add-progress-wrap/-bar/-label` "i de N…" | html:561-566; js:2546-2555 | **Progresso falso**: loop síncrono salta direto p/ 100% "N de N…"; depois fica parado enquanto `preencherAutoKeywords` (lento, 1 mensagem por frase) roda sem indicar isso | broken |
| M2.7 | `#btn-bulk-add-cancel` "Cancelar" | html:567; js:831 | fecha (não cancela operação em andamento) | working |
| M2.8 | `#btn-bulk-add-save` "✓ Adicionar frases" | html:568-573; js:832 → `salvarMultiAdd()` js:2538 | Vazio → toast "Cole ao menos uma frase."; cria frases (idioma por regex cirílico), auto-keywords (inglês), grava local + `firestoreBatchUpsert`; toast "N frase(s) adicionada(s)!" ou "Salvo localmente (sync falhou: <err.message>)". **Botão não é desabilitado** → duplo clique duplica. **Sem deduplicação** (Importar deduplica) | working c/ bug de duplo clique |
| M2.9 | Teclado: Esc fecha; clique no backdrop fecha | js:833-838 | — | working |

## 9. Overlay de importação (`#import-overlay`)

| # | Elemento | Linha | Status |
|---|---|---|---|
| I1 | Spinner `.import-spinner` | html:582; css:1967-1974 | **broken** — usa `animation: spin`, mas `@keyframes spin` **não existe** em painel.css |
| I2 | `#import-overlay-title` "Importando frases…" / "Importando N linha(s)…" | html:583; js:2603 | **dead** — overlay é mostrado e escondido no mesmo tick síncrono (sem `await` entre js:2602 e js:2634); nunca pinta |
| I3 | `#import-overlay-sub` | html:584; js:2646 | **dead** — só recebe `''`, e depois de o overlay já ter sido escondido |
| I4 | `#import-overlay-bar` / `#import-overlay-label` "Linha i de N" | html:585-588; js:2614-2615 | **dead** (mesma razão). A fase lenta real (auto-keywords + Firestore) roda **sem nenhum indicador** |

## 10. Modal M3 — Envio para o Anki (`#bridge-progress-modal`)

| # | Elemento | Linha | O que faz | Status | Quando |
|---|---|---|---|---|---|
| M3.1 | Título "Envio para o Anki" | html:596 | — | working | aberto por H10 ou "Continuar" |
| M3.2 | `#bridge-progress-subtitle` "Aguardando jobs…" → "N job(s) acompanhados" / "Sem jobs no bridge." / "Não foi possível ler o status do bridge." | html:597; js:2206, 2213, 2174 | — | working | — |
| M3.3 | `#btn-bridge-progress-close` (×) | html:599; js:954 | Fecha; polling continua (ok). **Sem Esc e sem clique no backdrop** (M1/M2 têm) | working / inconsistente | — |
| M3.4 | Card de job `.bridge-job-card`: título `<jobId bruto> • Russo/Inglês`; status `traduzirStage()` ("Na fila", "Gerando cards", "Extraindo prompts", "Gerando áudio", "Gerando imagens", "Aguardando Anki", "Enviando ao Anki", "Concluído", "Falhou", "Parcial", fallback "Aguardando"); meta "**Status: <status cru em inglês> • Atualizado: <timestamp ISO cru>**"; barra %; detalhe = `lastError` / `progress.label` / "**Stage atual: X**" | js:2201-2235, 2178-2199 | Dados crus/jargão (ID interno, "Stage", "completed", ISO) | working / jargão | por job |
| M3.5 | Botão "Continuar" por job (failed/partial) `[data-retry-job]` | js:2222-2224; click js:957 → `continuarBridgeJob()` js:2335 | `POST /jobs/{id}/retry`; toast "Job reenfileirado para continuar." / "Falha ao continuar job." | working | job failed/partial |
| M3.6 | `#btn-bridge-retry-failed` "Retentar falhos" (estilo de botão *Cancelar*) | html:609; js:956 → `retentarJobsFalhos()` js:2353 | Toasts: "Nenhum job ativo para retentar." / "Falha ao consultar jobs do bridge." / "Nenhum job falho para retentar." / "N job(s) reenfileirado(s)." / "Falha ao retentar jobs.". `fetch` fora de try → erro de rede sem mensagem. Sempre visível mesmo sem falhas | working / estilo enganoso | sempre no modal |
| M3.7 | `#btn-bridge-refresh` "Atualizar status" | html:610; js:955 → `atualizarBridgeProgress()` | `GET /jobs` + reconciliação | working | — |
| M3.8 | Lista vazia "Nenhum job encontrado." | js:2205 | — | working | sem jobs |
| M3.9 | Fallback `jobs.slice(0, 8)` quando não há jobs ativos | js:2210-2212 | **dead** — o modal só abre após H10/Continuar, que sempre definem `bridgeActiveJobIds` | dead |
| M3.10 | Pós-conclusão: `confirm('Apagar do Perpetual Miner as N frases enviadas ao Anki?')` → toast "N frase(s) apagada(s) do Perpetual Miner."; se Cancelar → marca `exported` + toast "N frase(s) enviada(s) ao Anki." e **limpa a seleção atual do usuário** | js:2243-2333 | Duplicatas (`duplicatePhraseIds`, novo no bridge — commit 656690d) **não são lidas pelo painel**: contam como "enviadas ao Anki" e ganham badge "No Anki"; falha total não gera toast algum | working / gap duplicata | quando todos jobs acompanhados terminam |

---

## 11. Todas as mensagens ao usuário (escopo shell + frases + modais), verbatim

### Toasts (`mostrarToast`, 1,8 s — curto para mensagens longas)
| Texto | js:linha | Observação |
|---|---|---|
| `Erro no login: ` + err.message \|\| `tente novamente` | 179 | err.message cru: "Login cancelado", "id_token não encontrado na resposta do Google", "Falha ao obter dados do usuário Google", "Firebase Auth falhou: <CÓDIGO_FIREBASE>", ou mensagem do `chrome.runtime.lastError` em inglês |
| `N frase(s) migrada(s) para a nuvem!` | 365 | |
| `Migração falhou: ` + err.message \|\| `verifique as regras do Firestore` | 368 | dump cru / jargão |
| `Firestore: permissão negada — verifique as regras de segurança no console Firebase.` | 472 | jargão de dev |
| `Sync parcial: X/Y frases enviadas.` | 474 | |
| `Erro na nuvem — usando dados locais.` | 529 | |
| `Erro ao deletar da nuvem: ${err.message}` | 701 | dump cru ("HTTP 403" etc.) |
| `N frase(s) deletada(s)!` | 804 | |
| `Presets do Anki Bridge salvos.` | 1158 | aparece também ao clicar **Enviar ao Anki** (efeito colateral) |
| `Selecione ao menos uma frase para editar.` | 2380 | |
| `Metadados atualizados!` | 2435 | |
| `Frase atualizada!` | 1992, 2452 | mesmo texto para editar texto e editar metadados |
| `Copiado!` | 2000 | |
| `Selecione as frases que deseja exportar.` | 2030 | |
| `${n} frases exportadas!` | 2065 | sem singular ("1 frases") |
| `Selecione as frases que deseja enviar ao Anki.` | 2083 | |
| `Anki Bridge offline. Inicie o serviço residente no PC.` | 2093 | |
| `Anki Bridge indisponível.` | 2097 | vago |
| `Falha ao criar job ${LANG}: ${err.error \|\| resp.status}` | 2133 | código cru (ex. "Falha ao criar job EN: 500") |
| `Nenhum job foi criado.` | 2141 | provavelmente inalcançável (seleção não-vazia sempre gera ≥1 lote) |
| `${n} lote(s) enviado(s) ao bridge.` | 2147 | "lote" vs "job" |
| `N frase(s) apagada(s) do Perpetual Miner.` | 2271 | |
| `N frase(s) enviada(s) ao Anki.` | 2332 | inclui duplicatas |
| `Job reenfileirado para continuar.` / `Falha ao continuar job.` | 2345, 2348 | |
| `Nenhum job ativo para retentar.` / `Falha ao consultar jobs do bridge.` / `Nenhum job falho para retentar.` / `N job(s) reenfileirado(s).` / `Falha ao retentar jobs.` | 2355-2374 | |
| `Cole ao menos uma frase.` | 2544 | |
| `Salvo localmente (sync falhou: ${err.message})` | 2572 | dump cru |
| `N frase(s) adicionada(s)!` | 2580 | |
| `Não foi possível ler o arquivo.` / `Arquivo vazio.` | 2592, 2595 | |
| `Nenhuma frase nova. X duplicata(s), Y inválida(s).` | 2641 | |
| `N frase(s) importada(s)! (X duplicata(s) ignorada(s))` | 2660-2661 | |

### confirm()
- `Apagar TODAS as frases?\nEsta ação não pode ser desfeita.` (js:2016)
- `Deseja deletar as N frase(s) selecionadas?\nEsta ação não pode ser desfeita.` (js:794)
- `Apagar do Perpetual Miner as N frases enviadas ao Anki?` (js:2269) — sem singular; "Perpetual Miner" com espaço vs marca "PerpetualMiner"; aparece **sem ação do usuário**, no meio do polling

### alert(): nenhum.

### Status/indicadores fixos
"Carregando...", "Nenhuma frase encontrada.", "Sincronizado", "Migrando…", "Sincronizando…", "Enviando frases…", "Erro de sync", "Online"/"Offline", "Aguardando bridge...", "Atualizando...", "N job(s) no filtro", "Analytics indisponivel. Verifique se o bridge esta online.", "N selecionada(s)", "Todas (N)", "X a Y de N frases", "0 frases", "No Anki", "keyword:", "auto:", "Aguardando jobs…", "N job(s) acompanhados", "Sem jobs no bridge.", "Não foi possível ler o status do bridge.", "Nenhum job encontrado.", "Stage atual: …", "Status: … • Atualizado: …", "Importando frases…" (dead), "Linha i de N" (dead), "i de N…".

---

## 12. Redundâncias

**Dentro do painel**
1. **Filtro de fonte em 2 lugares**: sidebar `#platform-nav` (S16) e dropdown `#dropdown-trigger` (T1) — mesma função `filtrarPor`, rótulos diferentes ("Todos os Streamings" vs "Todas as Fontes").
2. **Badge de saúde do bridge em 2 lugares**: sidebar (S12) e workspace (B2).
3. **Custo/status do bridge em 2 lugares**: sidebar "Custo no filtro"/resumo (S13/S14) e workspace "Total do filtro"/status (mesmos valores, `setBridgeStatusText`).
4. **"Continuar" job em 2 lugares**: M3 (M3.5) e lista "Jobs recentes" do workspace; mais "Retentar falhos" (M3.6) que faz o mesmo em lote.
5. **Apagar em 4 caminhos** com regras distintas: lixeira sidebar (tudo, confirm), "Deletar" (seleção, confirm+toast), ícone por linha (sem confirm/sem toast), confirm pós-envio ao Anki.
6. **Dois modais de "frases novas"**: "Adição em Massa" (sem dedupe, sem Detalhe) e "Importar .txt" (dedupe, parse de contexto) — mesma finalidade, regras diferentes.
7. **Duas formas de "exportar"**: .txt (H9) e Anki (H10) — ambas marcam `status:'exported'` e mostram "No Anki".
8. **Salvar presets**: botão "Salvar presets" no workspace e salvamento implícito em "Enviar ao Anki".
9. Código duplicado: `exportarTxt` (js:2031-2044) replica `montarLinhaMining` (js:2068) linha a linha; `labelMap` de idioma duplicado (js:1681 e 1691).
10. Listener `AUTO_MINER_STATE_CHANGED` (js:565) duplica o listener de storage (js:546) e provavelmente nunca dispara.

**Com popup.html/popup.js**
- **Auto Miner EN/RU + limites + contador**: idêntico no popup (`#autoMinerEn/Ru`, `#autoLimitEn/Ru`, `#autoCountEn/Ru`) e na toolbar do painel (T6). No popup tem título "Auto Miner"; no painel só tooltip.
- **Adicionar frase manual**: popup "Adição Manual" (`#txtManual` + "Adicionar", via `SALVAR_HISTORICO` no background, contexto `{fonte:'manual', titulo:'Manual Input'}`) vs painel "Adição em Massa" (grava direto no storage, fonte padrão 'manual', título vazio).
- **Lista + seleção + deletar**: popup "Últimas mineradas" (5 itens, checkbox "Tudo", "Deletar (N)", **sem confirm**) vs painel. O delete do popup **não grava tombstone nem apaga no Firestore** → para usuário logado, frases apagadas pelo popup voltam no próximo `carregarFrasesFirestore` (o listener do painel também ignora remoções quando logado, js:558-561).
- Nome da tela: popup chama o painel de "**Painel de Estudos**"; o painel se intitula "Frases mineradas" / `<title>PerpetualMiner`.

**Com bookreader.html**
- Seleção "Marcar todas"/"Desmarcar todas"/"Limpar Lista" (bookreader) vs "Pág."/"Todas (N)" (painel).
- Bookreader salva frases via `SALVAR_HISTORICO` (mesmo caminho do popup), outra "porta de entrada" de frases além de Adição em Massa/Importar.
- Botão voltar do bookreader (`#btn-voltar`) fecha a aba ou navega para `painel.html` — o painel abre o bookreader em nova aba.

## 13. Controles órfãos / mortos

| Item | Tipo |
|---|---|
| Ícone ☰ no header (html:181-185) | orphan (parece menu, sem handler) |
| Ícone funil ao lado do título (html:118-120) | orphan (parece filtro, sem handler) |
| Saudação "Olá, Vinicius ;-;" (html:29) | hardcoded, não ligada ao login |
| `#import-overlay` inteiro (título/sub/barra/label/spinner) | dead (nunca pinta) + spinner quebrado |
| `#import-overlay-sub` | dead (só recebe '') |
| Foco em `#modal-titulo` (js:2400) | dead (sobrescrito) |
| Fallback `jobs.slice(0, 8)` em M3 (js:2212) | dead |
| Toast "Nenhum job foi criado." (js:2141) | provavelmente inalcançável |
| Fallback label "Ordenar" (js:1701) | dead |
| IDs legados `preset-${lang}-*`, `bridge-analytics-lang/from/to`, `[data-analytics-range]` (js:1085-1098, 1121, 976, 1208) | orphan (elementos não existem) |
| `runtime.onMessage AUTO_MINER_STATE_CHANGED` (js:565) | provavelmente dead |
| `duplicatePhraseIds` do bridge | não consumido pelo painel (estado novo invisível) |

## 14. CSS sem elemento / regras redundantes

| Regra | css:linha | Situação |
|---|---|---|
| `.bridge-analytics-top` | 935 (em grupo) | classe não existe em HTML/JS |
| `.bridge-mini-title-row` | 1557-1562 | classe não existe |
| `animation: spin` em `.import-spinner` | 1973 | `@keyframes spin` inexistente |
| `.btn-delete-selected.hidden`, `.dropdown-menu.hidden`, `.modal-overlay.hidden`, `.selection-count.hidden`, `.ba-progress.hidden`, `.import-overlay.hidden` | 249, 308, 638, 802, 1911, 1952 | redundantes com o global `.hidden{display:none !important}` (1997) |
| Comentário "Botões de Ação Verde (#00ff88)" | 1848 | `.action-green-btn`/`.selection-count`/`.btn-green-save`/`.modal-textarea:focus` usam verde neon fora da paleta roxa |
| Botões sem `font-family: inherit` (`.export-btn`, `.send-anki-btn`, `.dropdown-trigger`, `.dropdown-item`, `.page-btn`, `.bookreader-btn` é `<a>`) | 201, 217, 280, 310, 550 | fonte do sistema diferente dos vizinhos; `.send-anki-btn` tem raio/padding/sombra próprios (12px/12px 16px) — destoa da barra |
| `.header-right` sem `flex-wrap` | 157-161 | 11 controles numa linha; estoura em larguras menores |

(Todas as demais 200+ classes do CSS têm uso, direto ou via template interpolado.)

## 15. Terminologia inconsistente

| Conceito | Variantes encontradas |
|---|---|
| Fonte da frase | "Fonte" (modais, dropdown "Todas as Fontes"), "Streaming(s)" ("Todos os Streamings"), "Plataforma" (hint "Plataforma ou tipo de origem"), "Contexto" (export `[Contexto: …]`), "origem" |
| Metadados | "Editar Metadados", "Editar metadados", "Editar Selecionados", "Editar N frases selecionadas", "Contexto" |
| Apagar | "Apagar todas", "Apagar TODAS", "Apagar frase", "apagada(s) do Perpetual Miner" vs "Deletar", "deletada(s)", "Deseja deletar" |
| Enviado/exportado | status `exported`, "Esconder Exportadas", "frases exportadas" (.txt), "No Anki" (badge), "enviada(s) ao Anki", "Envio para o Anki" (modal) vs "Enviar ao Anki" (botão) |
| Tarefa do bridge | "job(s)", "lote(s)" (toast), "jobs" + "Stage atual" (inglês) |
| Retentar | "Continuar", "Retentar falhos", "reenfileirado", "retentar" |
| Status de job | "OK"/"Fila"/"Rodando" (workspace, `statusLabelBridge`) vs "Concluído"/"Na fila" (modal, `traduzirStage`) vs "completed" cru ("Status: completed") |
| Keyword | "keyword:" (chip), "auto:", "Remover keywords", "frases com keyword", "grupo"/"segundo grupo" vs "termos" (Bridge) |
| Idioma | "🇬🇧 Inglês"/"🇷🇺 Russo" (filtro), "EN"/"RU" (Auto Miner), "Ingles" sem acento (Bridge), "Inglês" (modal M3) |
| Seleção | "Selecionados" (masc.) vs "selecionada(s)" (fem.); "Pág." vs "página atual"; "Todas" vs "Tudo" (popup) vs "Marcar todas" (bookreader) |
| Sair | "Sair" (fecha aba) vs "Sair da conta" (logout), mesmo ícone de logout |
| Marca / tela | "PerpetualMiner", "Perpetual Miner", "Painel de Estudos" (popup), "Frases mineradas" |
| Bridge | "Anki Bridge", "bridge", "serviço residente no PC" |
| Capitalização | "Esconder Exportadas", "Adição em Massa", "Editar Selecionados" (Title Case) vs "Frases mineradas", "Sair da conta" (sentence case) |
| Acentuação | "indisponivel", "esta online", "Nao foi possivel", "Configuracoes … navegacao", "Ingles" (sidebar/workspace) vs resto acentuado |

## 16. Mensagens que não dizem nada / jargão / dump cru

- "Erro de sync" (sem causa nem ação; ícone igual ao de "sincronizando").
- "Anki Bridge indisponível." (sem causa/ação — contraste com a versão "offline" que orienta).
- "Falha ao criar job EN: 500" / `err.error` cru.
- "Erro ao deletar da nuvem: HTTP 403" / qualquer `err.message` cru; "Salvo localmente (sync falhou: …)"; "Migração falhou: …"; "Erro no login: <mensagem inglês do Chrome/Firebase>".
- "Firestore: permissão negada — verifique as regras de segurança no console Firebase." (instrução para desenvolvedor).
- "Status: completed • Atualizado: 2026-09-14T…Z", título de card = jobId interno, "Stage atual: …".
- "N job(s) no filtro", "Custo no filtro" (qual filtro?), "Analytics indisponivel…".
- "Falha ao continuar job." / "Falha ao retentar jobs." / "Falha ao consultar jobs do bridge." (sem motivo).
- "Nenhuma frase encontrada." (não diz se é filtro ou lista vazia).
- "Copiado!" ok; "Frase atualizada!" genérico para duas ações diferentes.
- Contadores "0/20" do Auto Miner sem legenda; "Pág." abreviado.
- Falhas silenciosas (nenhuma mensagem): erro de rede em `POST /jobs` e em "Retentar falhos"; falha do clipboard; falhas do Auto Miner; falha do Firestore no import; falha do `firestoreBatchUpsert` pós-export; envio ao Anki em que todas as frases falharam.

## 17. Outros bugs relevantes observados

1. Exportar→Importar .txt **perde as keywords** (parser descarta o prefixo `kw : `) e trunca textos com " : ".
2. "Exportar .txt" marca `exported` → badge "No Anki" falso e a frase some com "Esconder Exportadas".
3. Duplo clique em "Enviar ao Anki" ou "Adicionar frases" duplica jobs/frases (sem disable/loading).
4. Seleção sobrevive a troca de filtro → Deletar/Exportar/Enviar agem sobre frases invisíveis.
5. Conclusão de job limpa a seleção corrente (`marcarFrasesExportadasBridge`, js:2325).
6. "Enviar ao Anki" regrava presets e (se workspace aberto) relança o Anki; "Gerenciar" também lança o Anki (`launch=1`).
7. Nomes de fonte inseridos sem `esc()` em `construirSidebar`/`construirDropdown`/idioma (js:1667, 1675, 1684).
8. Delete no popup não propaga ao Firestore (frases "ressuscitam" para usuário logado).
9. Duplicatas do bridge (commit 656690d) aparecem como "enviadas" e com badge "No Anki".
