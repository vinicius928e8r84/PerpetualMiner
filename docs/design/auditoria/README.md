# Auditoria & inventário do front: veredito por item

Resolução do ticket [Auditoria & inventário do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/2) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Auditoria somente-leitura em `42994e0` (2026-09-14). Grilling feito numa página Lavish (cópia visual: [`auditoria-front.html`](auditoria-front.html)); os levantamentos brutos por superfície, com `file:line` para cada item, estão em [`levantamento/`](levantamento/).

Os vereditos valem; nomes e lugares marcados como **Superada em** foram refinados pelas specs das superfícies. Índice: [docs/design](../README.md).

## Decisões

### Q0: Para quem é este front?

Muda o quanto de jargão/controle técnico é aceitável (TLD, Judge/Guard, jobId, debug bundle) e o que fazer com “Olá, Vinicius ;-;” fixo no HTML.

**Decisão:** Só eu agora, mas o redesign já deve servir a outros depois.

> Nota do dono: Só eu agora; logo um grupo pequeno (namorada, amigos). Depois de validar, a ideia é deixar plug-and-play e vender como assinatura.

### Q1: Auto Miner — onde mora?

Hoje em 3 lugares: popup (toggle EN/RU + limite + contador), mini-painel sem rótulo dentro da barra de filtros do painel, e o badge contador no botão flutuante (com conta errada).

**Decisão:** Controles só no popup; overlay mantém só o contador (status); sai do painel.

### Q2: Popup — qual é o papel do “mini painel”?

Hoje: Abrir painel · Auto Miner · Configurar atalho · Adição manual · Últimas 5 (com ↻, “Tudo”, “Deletar” — este quebrado: a frase ressuscita no sync).

**Decisão:** “Cockpit de captura”: Abrir painel · Auto Miner · Adição rápida · Últimas 5 só leitura. Corta ↻, “Tudo”, “Deletar”. Atalho vai para Configurações (Q11).

### Q3: Apagar — quantos caminhos?

Hoje 5, cada um com regra diferente: lixeira minúscula “apagar TUDO” ao lado do contador na sidebar; “Deletar” da seleção (com confirm); ícone por linha (sem confirm); confirm surpresa pós-envio ao Anki; “Deletar” do popup.

**Decisão:** Fica: por linha + “apagar selecionadas”. “Apagar tudo” vai para uma zona de perigo em Configurações. Pós-envio vira escolha explícita dentro do modal Envio ao Anki. Popup perde o seu.

> Nota do dono: O popup de apagar após enviar ao Anki está muito fraco: às vezes buga, às vezes não aparece, e está feio.

### Q4: Entrada de frases no painel

Hoje 3 botões soltos com a mesma finalidade: “Adição em Massa” (colar), “Importar .txt” (arquivo) e “BookReader” (foto, outra aba). Regras divergem (só o import deduplica; só Editar tem “Detalhe”) — unificar regras é comportamento e fica fora.

**Decisão:** Um único “Adicionar frases” com 3 modos: Colar · Arquivo .txt · Foto de livro. Popup mantém a adição rápida.

> **Superada em** [Frases](../painel/frases/README.md): o botão é **“Minerar frases”**, com os modos Colar · Arquivo .txt · Foto; a Foto leva à página “Minerar de uma foto”. No popup, a adição rápida é a mineração rápida (botão “Minerar”).

### Q5: Filtro de fonte duplicado

A lista de fontes da sidebar (“Todos os Streamings”) parece navegação mas é o mesmo filtro do dropdown “Todas as Fontes” da barra de filtros.

**Decisão:** Fica o dropdown (junto de Idioma/Ordem); a lista sai da sidebar, que fica livre para navegação de verdade.

### Q6: Header do painel com 11 controles

BookReader, Pág., Todas, Editar Selecionados, contador, Deletar, Exportar .txt, Enviar ao Anki, Importar .txt, Adição em Massa, ☰ (decorativo) — numa linha sem quebra.

**Decisão:** Ações sobre seleção (Pág./Todas/contador/Editar/Apagar/Exportar/Enviar ao Anki) viram uma barra contextual que só aparece com seleção; fixo só “Adicionar frases”. ☰ e funil cortados.

> **Superada em** [Frases](../painel/frases/README.md): o botão fixo é “Minerar frases ▾”. A barra contextual tem Editar contexto · Exportar .txt · Apagar · Enviar ao Anki.

### Q7: Exportar/Importar .txt ainda têm lugar?

Exportar .txt marca a frase como “exported” → ganha badge “No Anki” e some com “Esconder Exportadas”, mesmo sem ter ido ao Anki (bug). Import perde as keywords do export.

**Decisão:** Ficam, rebaixados a um menu secundário “Arquivo .txt”; “Enviar ao Anki” é a ação principal.

> **Superada em** [Frases](../painel/frases/README.md): não há menu “Arquivo .txt”. Exportar .txt fica na barra contextual de seleção; Importar é o modo Arquivo .txt do “Minerar frases”. “Enviar ao Anki” segue como a ação principal.

### Q8: Anki Bridge — onde mora?

Hoje: card na sidebar (badge, “Custo no filtro”, resumo, Gerenciar) + seção inline que abre entre o header e a lista, empurrando as frases para baixo (Presets · Custos · Baralhos e termos · Vocabulário). Badge, custo e status aparecem 2×.

**Decisão:** Sidebar mostra só o status Online/Offline; custo/resumo saem dela. O Bridge vira área própria com 4 sub-áreas (Presets · Custos · Baralhos e termos · Vocabulário).

> **Superada em** [shell](../painel/shell/README.md): a área se chama **Conexão com o Anki**, com as abas na ordem Custos · Baralhos e termos · Vocabulário · Ajustes de envio (“Presets” virou “Ajustes de envio”, BRG-07). Abre em Custos.

### Q9: Controles técnicos do Bridge

TLD palavra/frase em texto livre, métricas “Judge”/“Guard”, USD com 4 casas, jobId bruto, “G n / IA m”, “Stage atual”, botão “Baixar debug bundle”, “Reparar Anki” (mata processos).

**Decisão:** Ficam, reagrupados numa camada “Avançado/diagnóstico” recolhida. A camada principal mostra: baralho, fonte de imagem, custo total, frases OK, jobs OK, status do job.

### Q10: BookReader — nome e arrumação interna

Não é um leitor: é foto → Gemini → trechos marcados → salvar. Página própria, entra só por um botão âmbar do painel. “Trocar Foto” e “Limpar Lista” são o mesmo handler; “Marcar todas”/“Desmarcar todas” é o 3º padrão de selecionar-tudo do app.

**Decisão:** Continua página própria, entra por “Adicionar frases → Foto de livro” (Q4); nome muda para algo que diga o que faz (texto exato no ticket de Voz); Trocar Foto + Limpar Lista viram 1 ação; seleção igual à do painel; chave Gemini sai para Configurações (Q11).

> **Superada em** [Voz](../voz/README.md): a entrada é “Minerar frases → Foto” e o nome da página é “Minerar de uma foto” (V9, C7).

### Q11: Nasce um agrupamento “Configurações”?

Ajustes espalhados: chave Gemini (sidebar do BookReader), gravar atalho de captura (popup), conta Google + login/logout (sidebar do painel), “apagar tudo” (lixeira da sidebar), presets do Bridge (seção do Bridge).

**Decisão:** Sim: “Configurações” reúne Conta & sync · Chave Gemini · Atalhos (gravar o de seleção + mostrar o Alt+S) · Zona de perigo. Presets ficam no Bridge; limites do Auto Miner ficam no popup.

> **Superada em** [shell](../painel/shell/README.md): os presets são os “Ajustes de envio” da Conexão com o Anki; os dois atalhos são graváveis (R2-2), com os nomes “Minerar legenda” e “Minerar seleção”.

> Nota do dono: O Alt+S deveria ser configurável para outro atalho de teclado ou mouse.

### Q12: Toasts e overlays do content.js

Três feedbacks in-page com três caras: toast “Minerado & Copiado” (verde, ao lado do botão), overlay “Frase Capturada!” (ciano, centro da tela, com ⚡) e toast Auto Miner (verde-escuro) — dois deles com o mesmo id, substituindo um ao outro.

**Decisão:** Um só componente de feedback in-page, com variantes (legenda · seleção · Auto Miner), sempre na mesma posição.

### Q13: Limpeza óbvia — confirma o corte?

Itens órfãos, mortos ou sem função. Desmarque o que quiser manter.

- [x] Ícone ☰ decorativo no header (parece menu, sem handler)
- [x] Ícone funil ao lado do título (parece filtro, sem handler)
- [x] “Olá, Vinicius ;-;” fixo no HTML
- [x] Botão “Sair” da sidebar (só fecha a aba; confunde com “Sair da conta”)
- [x] ↻ do popup (a lista já atualiza sozinha)
- [x] “Atualizar status” no modal Envio ao Anki (já faz polling a cada 3 s)
- [x] icon.svg órfão (será substituído pela nova identidade)
- [x] Tooltip do badge, estado “A” e rótulos de skip do Auto Miner (nunca aparecem)
- [x] Textos inalcançáveis (“Nenhum baralho configurado.”, “Nenhum job foi criado.”, “Adicionando ao histórico de frases…”, “Carregue ao menos uma imagem primeiro.”)
- [x] IDs legados no JS, CSS órfão (.bridge-analytics-top, .bridge-mini-title-row), listeners mortos, subtítulos de dev do Bridge

### Q14: Lacunas vs. “zero função nova” — o que conta como revestimento?

Marque o que pode entrar nos protótipos como revestimento. O resto fica fora (anotado para depois).

- [x] Rótulos/legendas em contadores e inputs (“hoje”, “limite diário”)
- [x] title/aria-label no botão flutuante e botões só-ícone
- [x] Ícones PNG 16/32/48/128 no manifest (a identidade precisa deles)
- [x] Mostrar o atalho Alt+S na UI (hoje invisível)
- [x] Estado vazio que diferencia “sem frases” de “filtro escondeu tudo”
- [x] Confirmação ao apagar 1 frase
- [x] Botão cancelar no carregamento do BookReader
- [x] Busca na lista de frases
- [x] Contador do Auto Miner no badge do ícone da toolbar **(diverge da recomendação)**

> **Superada em** [lista fechada](../README.md#lista-fechada): a lista final tem **9 itens**. Veja R2-1.

### Q15: O que fazer com os bugs achados?

~25 defeitos reais (tabela abaixo), fora do escopo deste mapa. Alguns perdem dados (BookReader salvando em paralelo; delete do popup que ressuscita) e dois são de segurança (postMessage sem origem; innerHTML sem escape).

**Decisão:** Abrir 1 issue separada “Bugs encontrados na auditoria do front” (fora do mapa), priorizada, com file:line.

### Q16: Conceitos do domínio (glossário)

Só os conceitos que mudam o agrupamento — o resto da terminologia vai para o ticket de Voz. Vou gravar no CONTEXT.md do repo.

- [x] Frase é a unidade em todo o app (“trecho” do BookReader = frase vinda de livro).
- [x] Fonte = de onde veio (netflix, youtube, web, pdf, livro, manual…); Contexto = Fonte + Título + Detalhe. Some “Streaming/Plataforma”.
- [x] Enviada ao Anki e Exportada (.txt) são estados distintos (hoje o código mistura — vai pra lista de bugs).
- [x] Baralho (termo do Anki em PT) em vez de Deck.
- [x] Envio no lugar de job/lote para o usuário (1 envio por idioma).

### R2-1: A regra “zero função nova” continua?

Na Q14 você pôs no escopo 4 coisas que criam comportamento: busca na lista, confirmação ao apagar 1 frase, cancelar no BookReader e contador do Auto Miner no badge da toolbar. Na Q11 você pediu Alt+S configurável. Hoje o mapa diz “Zero função nova, zero mudança de comportamento”.

**Decisão:** Relaxa com lista fechada: esses 5 entram nos protótipos como “ajustes de UX” permitidos. Qualquer outra função nova continua fora. Eu atualizo a regra no mapa.

> **Superada em** [lista fechada](../README.md#lista-fechada): a lista final tem **9 itens**: (1) busca na lista de frases (PAI-04); (2) confirmação ao apagar 1 frase (PAI-12); (3) Cancelar no carregamento do Minerar de uma foto (FOT-06/07); (4) confirmação ao Recomeçar com frases não mineradas (FOT-17/18); (5) “Tentar de novo” numa foto que falhou (FOT-11, lote FOT-15); (6) contador da mineração automática no badge da toolbar, somando os idiomas ligados (MIN-09); (7) atalho “Minerar legenda” gravável (+ botão do mouse, recusa repetido) com “Restaurar atalhos padrão” (CFG-11…14); (8) abrir a Boas-vindas na instalação (ONB-01); (9) lembrete “Configuração pela metade” ocultável.

### R2-2: Atalhos: como fica com o Alt+S configurável?

Hoje existem dois conceitos: Alt+S fixo (minera a legenda do vídeo) e um atalho gravável que só captura texto selecionado. O popup chama o segundo de “Atalho de Captura”, sem dizer que é só para seleção.

**Decisão:** Dois atalhos com nome, os dois graváveis (teclado ou botão extra do mouse), no mesmo gravador: “Minerar legenda” (padrão Alt+S) e “Capturar seleção”. Moram em Configurações · Atalhos.

> **Superada em** [Voz](../voz/README.md): o segundo atalho se chama **“Minerar seleção”** (V8: “capturar” sai).

### R2-3: O plano de assinatura muda o destino deste mapa?

Você disse: agora é só você, logo um grupo pequeno, e depois a ideia é deixar plug-and-play e vender como assinatura. Plug-and-play hoje esbarraria em: bridge Python local no Windows, chave Gemini pessoal, projeto Firebase próprio e ausência de onboarding.

**Decisão:** O destino não muda: spec e protótipos deste front. O produto de assinatura (onboarding, cobrança, bridge instalável, contas) entra em “Fora do escopo” como esforço futuro. A identidade e a voz já devem ser de produto, nada pessoal, e isso vira nota nos tickets de identidade e de voz.

> Nota do dono: O resto fica para depois, mas dá para incluir protótipo de onboarding e primeira execução.

### R2-4: O fim do envio ao Anki: como fica a escolha de apagar?

Sua nota: o popup de apagar depois do envio “tá muito fraco, buga, às vezes não aparece e tá muito feio”. Pela Q3 ele vira escolha explícita dentro do modal “Envio ao Anki”. O “às vezes não aparece” vai para a issue de bugs. Uma causa provável: se o painel recarrega durante o envio, ele perde os envios que estava acompanhando e nunca pergunta.

**Decisão:** Ao terminar, o modal mostra um resumo (enviadas · duplicadas · falhas) e dois botões: “Apagar as N enviadas” em destaque e “Manter e marcar como enviadas”.

> **Superada em** [Voz](../voz/README.md): o segundo botão é só **“Manter”**, com o texto sob os botões “Manter deixa as frases no histórico, marcadas como enviadas ao Anki.” (ENV-10).

## Inventário anotado

Vereditos: **fica** · **corta** (excesso) · **reagrupa** (muda de lugar/grupo). O status é o estado de hoje: working, broken, orphan, dead, redundant, missing. A coluna Q aponta a decisão que justifica o veredito.

### Popup

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| P1–3 | Cabeçalho: logo raio ciano + “PerpetualMiner” + “Minerador de legendas” | `working` estático | **reagrupa** | → nova identidade | Q0 |
| P4 | “Abrir Painel de Estudos” | `working` foca aba existente ou abre | **fica** | nome da tela → ticket de Voz |  |
| P5–11 | Auto Miner EN/RU: toggle, limite (1–100), contador “0/20” | `working` sem rótulo; não diz que é diário | **fica** | casa única do Auto Miner | Q1 |
| P13–16 | “Configurar Atalho de Captura” (gravar, badge, hint) | `working` rótulos crus (“BracketLeft”, “Mouse Btn 5”); não diz que é p/ texto selecionado | **reagrupa** | → Configurações · Atalhos, como o atalho “Capturar seleção” (**Superada em** [Voz](../voz/README.md): “Minerar seleção”) | R2-2 |
| P17–19 | “Adição Manual”: textarea + “Adicionar” | `working` sem feedback de sucesso/erro; título salvo “Manual Input” | **fica** | adição rápida | Q4 |
| P20/24 | “Últimas mineradas” (5 cards com checkbox) | `working` clicar no card não faz nada | **fica** | só leitura (sem checkbox) | Q2 |
| P21 | ↻ “Atualizar lista” | `redundant` redundante com auto-refresh; zera seleção | **corta** |  | Q13 |
| P22 | “Tudo” | `redundant` seleciona só os 5 visíveis | **corta** |  | Q2 |
| P23 | “Deletar (N)” | `broken` sem confirm, sem Firestore/tombstone → ressuscita | **corta** | apagar mora no painel | Q3 |
| P25–26 | “Carregando...” / “Nenhuma frase salva ainda.” | `working` não ensina a minerar | **fica** | texto → ticket de Voz |  |

### Overlay (content.js)

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| O1 | Atalho Alt+S (minerar legenda) | `working` fixo, invisível na UI; sequestra digitação em inputs | **reagrupa** | vira o atalho gravável “Minerar legenda” (padrão Alt+S) em Configurações · Atalhos | R2-2 |
| O2 | Botão flutuante (div 48px, balão verde) | `working` sem title/aria; aparece com qualquer <video> | **fica** | → nova identidade | Q0 |
| O3 | Atalho custom de seleção | `working` sem callback de erro | **fica** |  |  |
| O4 | Ponte postMessage (copiar/salvar) | `broken` sem checagem de origem; salva 2× se clipboard falha | **fica** | invisível; defeito → bugs | Q15 |
| O5 | Toast “Minerado & Copiado · Idioma” | `working` otimista; innerHTML sem escape | **reagrupa** | → componente único de feedback | Q12 |
| O6 | Overlay central “⚡ Frase Capturada!” (ciano) | `working` otimista; sem escape | **reagrupa** | → componente único de feedback | Q12 |
| O9 | Toast “Auto Miner - Idioma - n/limite” | `working` mesmo id do O5 | **reagrupa** | → componente único de feedback | Q12 |
| O7 | Borda vermelha 800 ms (legenda não encontrada) | `working` sem texto | **fica** | mensagem → ticket de Voz |  |
| O8 | Badge contador Auto Miner no botão | `broken` soma EN+RU mesmo com um desligado (“25/20”) | **fica** | status do Auto Miner; conta → bugs | Q1 |
| O8a–c | Tooltip do badge, estado “A”, rótulos de skip | `dead` nunca aparecem | **corta** |  | Q13 |
| T6 | Menu de contexto “Enviar para o PerpetualMiner” | `working` zero feedback | **fica** | feedback visível: fora da lista fechada, fica para depois | R2-1 |

### Ícone da toolbar

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| T2 | Ícones no manifest | `missing` ausentes → Chrome mostra “P” cinza | **reagrupa** | → PNGs da nova identidade | Q14 |
| T3 | icon.svg | `dead` não referenciado; SVG nem é aceito | **corta** | substituído | Q13 |
| T5 | Badge do ícone (setBadgeText) | `missing` nunca usado | **reagrupa** | entra: contador do Auto Miner no badge (lista fechada, R2-1) | Q14 |

### Painel · shell

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| S1 | Logo bolha Google + wordmark | `working` estático | **reagrupa** | → nova identidade | Q0 |
| S2 | “Olá, Vinicius ;-;” | `dead` fixo no HTML | **corta** |  | Q13 |
| S3 | “Total N frases” | `working` ignora filtros | **fica** |  |  |
| S4 | Lixeira “Apagar todas” (ícone 13px) | `working` destrutivo, escondido | **reagrupa** | → Configurações · Zona de perigo | Q3 |
| S5–6 | “Login com Google” + dica de sync | `working`  | **reagrupa** | → Configurações · Conta | Q11 |
| S7–9 | Avatar, nome, status de sync | `working` “Erro de sync” com ícone de “sincronizando” | **fica** | status visível no shell | Q11 |
| S10 | “Sair da conta” | `working`  | **reagrupa** | → Configurações · Conta | Q11 |
| S11–12 | Card “Anki Bridge” + badge Online/Offline | `working`  | **fica** | só o status no shell | Q8 |
| S13–14 | “Custo no filtro” + resumo “N job(s) no filtro” | `redundant` filtro invisível; duplica a área do Bridge | **corta** | fica só na área do Bridge | Q8 |
| S15 | “Gerenciar” | `working` pode abrir o Anki no PC | **reagrupa** | → entrada da área Bridge | Q8 |
| S16 | Lista de fontes (“Todos os Streamings”) | `redundant` duplica dropdown; sem escape | **corta** |  | Q5 |
| S17 | “Sair” (window.close) | `working` mesmo ícone de logout | **corta** |  | Q13 |
| H1 | Título “Frases mineradas” | `working`  | **fica** |  |  |
| H2 | Ícone funil ao lado do título | `orphan` sem handler | **corta** |  | Q13 |
| H3 | Link âmbar “BookReader” | `working`  | **reagrupa** | → Adicionar frases · Foto (**Superada em** [Frases](../painel/frases/README.md): Minerar frases → Foto) | Q4 |
| H4–5 | “Pág.” / “Todas (N)” | `working`  | **reagrupa** | → barra contextual de seleção | Q6 |
| H6 | “Editar Selecionados” | `working` sempre habilitado | **reagrupa** | → barra contextual | Q6 |
| H7 | “N selecionada(s)” | `working` conta ocultas pelo filtro | **reagrupa** | → barra contextual | Q6 |
| H8 | “Deletar” seleção | `working` confirm + Firestore | **reagrupa** | → barra contextual | Q6 |
| H9 | “Exportar .txt” | `broken` marca “No Anki” falso; tooltip errado | **reagrupa** | → menu “Arquivo .txt” (**Superada em** [Frases](../painel/frases/README.md): Exportar .txt na barra contextual de seleção) | Q7 |
| H10 | “Enviar ao Anki” | `working` duplo clique duplica; resalva presets | **reagrupa** | → ação principal da barra contextual | Q6 |
| H12 | “Importar .txt” | `working` perde keywords do export | **reagrupa** | → Adicionar frases · Arquivo (**Superada em** [Frases](../painel/frases/README.md): Minerar frases · Arquivo .txt) | Q4 |
| H13 | “Adição em Massa” | `working`  | **reagrupa** | → Adicionar frases · Colar (**Superada em** [Frases](../painel/frases/README.md): Minerar frases · Colar) | Q4 |
| H14 | Ícone ☰ | `orphan` sem handler | **corta** |  | Q13 |

### Painel · Frases & modais

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| T1 | Dropdown “Todas as Fontes” | `working` vira “Todos os Streamings” após escolher | **fica** | filtro único de fonte | Q5 |
| T2–3 | Dropdowns Idioma / Ordem | `working`  | **fica** |  |  |
| — | Busca na lista de frases | `missing` não existe | **reagrupa** | entra na barra de filtros (lista fechada, R2-1) | R2-1 |
| T5 | “Esconder Exportadas” | `working` inclui exportadas .txt; texto não muda | **fica** | rótulo → Voz | Q16 |
| T6 | Mini-painel Auto Miner (sem rótulo) | `redundant` duplica popup | **corta** |  | Q1 |
| L1–2 | “Carregando...” / “Nenhuma frase encontrada.” | `working` não distingue vazio de filtrado | **fica** | Q14 / Voz | Q14 |
| L3 | Cabeçalho de data (hoje/ontem/N dias) | `working`  | **fica** |  |  |
| L4 | Checkbox por linha | `working`  | **fica** |  |  |
| L5–8 | Palavras clicáveis, chip keyword/auto, ×, + grupo | `working` “+” diz “segundo” mas permite N | **fica** |  |  |
| L9 | Badge “✓ No Anki” | `broken` também p/ .txt e duplicatas | **fica** | semântica → Q16 + bugs | Q16 |
| L10 | Linha de contexto (Título · Detalhe · Fonte) | `working`  | **fica** |  |  |
| L13 | Editar texto (inline) | `working` pode desalinhar keywords | **fica** |  |  |
| L14 | Editar metadados (modal) | `working`  | **fica** |  |  |
| L15 | Copiar | `working` falha silenciosa | **fica** |  |  |
| L16 | Apagar linha | `working` sem confirm, sem toast | **fica** | ganha confirmação (lista fechada, R2-1) | R2-1 |
| P1–6 | Paginação (10/pág, 1ª/ant/próx/última, “X a Y de N”) | `working`  | **fica** |  |  |
| M1 | Modal Editar Metadados (Fonte/Título/Detalhe) | `working` regras bulk≠individual; Enter salva | **fica** |  |  |
| M1.10 | Foco em Título | `dead` sobrescrito 50 ms depois | **corta** |  | Q13 |
| M2 | Modal Adição em Massa | `working` sem dedupe, sem Detalhe; duplo clique duplica | **reagrupa** | → Adicionar frases · Colar (**Superada em** [Frases](../painel/frases/README.md): Minerar frases · Colar) | Q4 |
| M2.6 | Barra de progresso | `broken` falsa (salta p/ 100%) | **fica** | estado de progresso; conserto → bugs | Q15 |
| I1–4 | Overlay de importação | `dead` nunca pinta; spinner sem @keyframes | **fica** | estado de progresso do “Adicionar” (**Superada em** [Frases](../painel/frases/README.md): do “Minerar frases”); conserto → bugs | Q15 |
| M3 | Modal “Envio para o Anki” (polling 3 s) | `working` sem Esc/backdrop | **fica** |  |  |
| M3.4 | Card de job: jobId, “Status: completed”, ISO, “Stage atual” | `working` jargão cru | **reagrupa** | status legível + detalhe em Avançado | Q9 |
| M3.5 | “Continuar” por job | `working`  | **fica** |  |  |
| M3.6 | “Retentar falhos” | `working` estilo de Cancelar; sempre visível | **fica** |  |  |
| M3.7 | “Atualizar status” | `redundant` redundante com polling | **corta** |  | Q13 |
| M3.9 | Fallback jobs.slice(0,8) | `dead` inalcançável | **corta** |  | Q13 |
| M3.10 | confirm() “Apagar do Perpetual Miner as N frases…” | `working` surge sem clique, no meio do polling; limpa sua seleção | **reagrupa** | → resumo (enviadas · duplicadas · falhas) + “Apagar as N enviadas” em destaque / “Manter” | R2-4 |

### Painel · Anki Bridge

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| B1–3 | Seção inline “Presets e custos” + subtítulo de dev | `working` empurra a lista; título incompleto | **reagrupa** | → área própria com 4 sub-áreas | Q8 |
| B4 | Badge Online/Offline duplicado | `redundant`  | **corta** | fica o do shell | Q8 |
| B5 | Ícone “Atualizar custos” | `working` recarrega tudo e pode abrir o Anki | **fica** | rótulo → Voz |  |
| B6 | “Fechar” | `working`  | **fica** | depende do formato (ticket de arquitetura) | Q8 |
| C4/C9 | Baralho EN/RU (texto livre) | `working` sem validação; em branco volta ao padrão | **fica** | camada principal | Q9 |
| C5/C10 | Fonte de imagem (“Google Images”/“DALL-E”) | `working` “DALL-E” desatualizado; Google pode gerar custo IA | **fica** | rótulo → Voz | Q9 |
| C6–7/C11–12 | TLD palavra / TLD frase | `working` técnico (sotaque gTTS) | **reagrupa** | → Avançado | Q9 |
| C13 | “Salvar presets” | `working` também salvo em silêncio a cada envio | **fica** |  |  |
| D4–5 | Total do filtro + status | `working` “$0.0000” em erro = gasto zero | **fica** |  |  |
| D6,D12 | Métricas “Cards” (custo), “Imagem IA”, “Economia” | `working` “Cards” como custo confunde | **fica** | camada principal (rótulos → Voz) | Q9 |
| D8–9 | Métricas “Judge” / “Guard” | `working` jargão | **reagrupa** | → Avançado | Q9 |
| D10–11 | “Frases OK” / “Jobs OK” | `working`  | **fica** |  |  |
| D14–19 | Período Hoje/Mês/Tudo, Idioma, De/Até | `working` sem acento | **fica** |  |  |
| D20–24 | Origem das imagens (Google/Gerada/Pulada/Falhou) | `working` sem estado vazio | **fica** |  |  |
| D25–28 | Jobs recentes (12 máx, meta dd/mm \| EN \| status) | `working` sem polling | **fica** |  |  |
| D27 | jobId bruto | `working`  | **reagrupa** | → Avançado | Q9 |
| D29 | “Continuar” em Jobs recentes | `working` também no modal | **fica** |  |  |
| D30 | “Baixar debug bundle” | `working` dump JSON com caminhos | **reagrupa** | → Avançado | Q9 |
| D31–32 | Pills “G n / IA m”, lastError cru | `working` crípticos | **reagrupa** | → Avançado | Q9 |
| E3 | “Reparar Anki” | `broken` mata processos sem confirm; timeout 45 s vs 110 s | **fica** | → Avançado? timeout → bugs | Q9 |
| E5–7,E9–10 | Estados: aguardando/atualizando/erro/cache/fallback local | `working` erro com a mesma cara de carregando | **fica** | textos → Voz |  |
| E8 | “Nenhum baralho configurado.” | `dead` inalcançável | **corta** |  | Q13 |
| E11–13 | Cards de stats (total + por baralho, maturidade) | `working` “Vocabulario na Frente” | **fica** |  |  |
| F2–6 | Vocabulário: resumo, idioma, tipo, busca, status | `working` sem filtro “Visto”; “items” | **fica** |  |  |
| F7 | Vocabulário preso em “Aguardando…” | `broken` se stats falhar | **fica** | conserto → bugs | Q15 |
| F11–13 | Tabela de vocabulário (até 10 000 linhas) | `working`  | **fica** |  |  |
| J/K | IDs legados no JS + CSS órfão | `dead`  | **corta** |  | Q13 |

### BookReader

| Ref | Item | Estado hoje | Veredito | Destino / nota | Q |
|---|---|---|---|---|---|
| S1 | Logo livro roxo + “BookReader / PerpetualMiner” | `working` 3º logo | **reagrupa** | → nova identidade | Q0 |
| S2–6 | Chave Gemini (input, olho, “Salvar Key”, link) | `working` não dá para apagar a chave | **reagrupa** | → Configurações · Chave Gemini | Q11 |
| S7–8 | “Título do Livro (opcional)” | `working` nunca é lembrado | **fica** |  |  |
| S9 | Legenda “Marcações reconhecidas” | `working` “Underscores” vs “_underlines_” | **fica** |  |  |
| S10 | “Voltar ao Painel” | `working` vira uma 2ª aba do painel | **fica** | comportamento → bugs | Q15 |
| M1–2 | “Transcrição de Livro Físico” + subtítulo | `working` nome ≠ “BookReader” | **fica** | nome → Q10/Voz | Q10 |
| M3–4 | Barra de erro (5 s) + toast | `working` timers se sobrepõem | **fica** |  |  |
| U1–2 | Zona de upload (arrastar/clicar) | `working` HEIC anunciado mas quebrado | **fica** |  |  |
| P1–5 | Prévia + fila + “Analisar Marcações” | `working` fila escondida/indescobrível | **fica** |  |  |
| P6 | “Trocar Foto” | `redundant` = mesmo handler de “Limpar Lista” | **reagrupa** | → 1 ação só | Q10 |
| L1–6 | Carregando + progresso + fila | `working` sem cancelar | **fica** | ganha botão cancelar (lista fechada, R2-1) | R2-1 |
| R1–3 | Faixa “arraste mais fotos”, “Selecionar”, contador | `working` “1 trecho prontos” | **fica** |  |  |
| R4–5 | “Marcar todas” / “Desmarcar todas” | `redundant` 3º padrão de selecionar-tudo | **reagrupa** | → 1 toggle igual ao painel | Q10 |
| R6 | “Limpar Lista” | `redundant` sem confirm; não cancela Gemini | **reagrupa** | → mescla com Trocar Foto | Q10 |
| R7 | Linhas editáveis com checkbox | `working`  | **fica** |  |  |
| R8 | Estado vazio “Não encontrei trechos…” | `broken` aparece também quando a API falhou | **fica** | conserto → bugs; texto → Voz | Q15 |
| R9 | “Salvar no PerpetualMiner” | `broken` perde trechos (corrida); re-salva duplicado | **fica** | conserto → bugs | Q15 |
| — | Textos mortos (“Adicionando ao histórico…”, “Carregue ao menos…”) | `dead` inalcançáveis | **corta** |  | Q13 |

## Bugs encontrados (fora do escopo deste mapa)

Registrados na issue [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9). Não entram no redesign.

| Grav. | Onde | Defeito | Local |
|---|---|---|---|
| Alta | BookReader | Salvar vários trechos em paralelo → corrida no background (read-modify-write) perde frases; UI diz “N salvos” | `bookreader.js:436 · background.js:167` |
| Alta | Popup | “Deletar” não apaga do Firestore nem grava tombstone → frase ressuscita para usuário logado | `popup.js:184` |
| Alta | Overlay | postMessage sem checagem de origem → qualquer site injeta frases e sobrescreve o clipboard | `content.js:148` |
| Alta | Overlay | innerHTML sem escape com texto da legenda/seleção (toasts e overlay) | `content.js:134, 733, 765` |
| Média | Painel | “Exportar .txt” marca exported → badge “No Anki” falso e some com “Esconder Exportadas” | `painel.js:2029` |
| Média | Painel | Duplicatas do bridge (duplicatePhraseIds) ignoradas → contam como “enviadas” | `painel.js:2243–2333` |
| Média | Painel | Duplo clique em “Enviar ao Anki”/“Adicionar frases” duplica jobs/frases | `painel.js:2081, 2538` |
| Média | Painel | Erro de rede em POST /jobs sem mensagem; EN criado + RU falho → job EN órfão | `painel.js:2133` |
| Média | Painel | Exportar→Importar .txt perde keywords; textos com “ : ” truncados | `painel.js:2666` |
| Média | Bridge | “Reparar Anki”: cliente aborta em 45 s, servidor leva até ~110 s → falso erro | `painel.js:1319` |
| Média | Bridge | Vocabulário preso em “Aguardando…” quando stats falha | `painel.js:1300` |
| Média | Bridge | Presets salvos em silêncio a cada envio; aba desatualizada sobrescreve | `painel.js:2087` |
| Média | BookReader | Botão “salvo” reabilita e re-salva duplicado; Limpar/Trocar não cancelam Gemini (itens fantasma) | `bookreader.js:334` |
| Média | BookReader | Estado vazio culpa as marcações quando a API falhou | `bookreader.js:368` |
| Média | Overlay | Alt+S sequestra digitação em inputs e salva “captions” de imagens em páginas sem vídeo | `content.js:169, 302` |
| Média | Overlay | Salva 2× quando o clipboard falha no top frame | `content.js:458, 719` |
| Baixa | Overlay | Badge do Auto Miner soma EN+RU mesmo com idioma desligado (“25/20”) | `content.js:351` |
| Baixa | Painel | Overlay de importação nunca pinta; spinner sem @keyframes; progresso falso na Adição em Massa | `painel.js:2602 · painel.css:1973` |
| Baixa | Painel | Nomes de fonte sem escape na sidebar/dropdown | `painel.js:1667, 1675` |
| Baixa | Painel | Seleção sobrevive a troca de filtro → ações em frases invisíveis; conclusão de job limpa a seleção | `painel.js:721, 2325` |
| Baixa | Bridge | Erro com a mesma cara de carregando (CSS sobrescrito); total ≠ soma (otherUsd oculto) | `painel.css:1647–1666` |
| Baixa | BookReader | HEIC anunciado mas rejeitado/mal rotulado; título do livro nunca é lembrado; “Voltar” abre 2º painel | `bookreader.js:193, 559, 507` |
| Baixa | Todos | Detecção de idioma: tudo que não é cirílico vira “Inglês” (3 cópias) | `bookreader.js:571 · background.js:280 · popup.js:203` |
| Baixa | Bridge | Nomes de baralho padrão divergentes em 5 lugares (CIMV / English Mining / teste) | `painel.js:32 · background.js:16 · server.py:929` |
| Média | Painel | Pergunta “apagar enviadas” às vezes não aparece no fim do envio ao Anki (relato do dono; causa provável: recarregar o painel perde os envios acompanhados) | `painel.js:2243–2333` |

## “Mensagens que não dizem nada”: insumo para o ticket de Voz & tom

**Dumps crus / jargão**

- “Falha ao criar job EN: 500”
- “Erro ao deletar da nuvem: HTTP 403”
- “Firestore: permissão negada — verifique as regras de segurança no console Firebase.”
- “Nao foi possivel reparar o Anki: signal is aborted without reason”
- “Mostrando cache anterior… ankistats_refresh_in_progress”
- “Status: completed • Atualizado: 2026-…Z” / “Stage atual”
- “Imagem 2: HTTP 429” (Gemini, em inglês)

**Vagas (sem causa nem próximo passo)**

- “Erro de sync” (com ícone de sincronizando)
- “Anki Bridge indisponível.”
- “Não foi possível salvar os trechos.”
- “Falha ao continuar job.” / “Falha ao retentar jobs.”
- “Nenhuma frase encontrada.” (vazio ou filtro?)
- “Custo no filtro” / “N job(s) no filtro” (qual filtro?)

**Otimistas / mentem**

- “Frase Capturada!” antes de salvar
- “Minerado & Copiado” antes do clipboard
- “N trechos salvos!” com trechos perdidos
- “$0.0000” quando o analytics falhou
- “✓ No Anki” para .txt e duplicatas
- “Presets do Anki Bridge salvos.” a cada envio

**Silêncio (deveria dizer algo)**

- Legenda não encontrada: só borda vermelha 800 ms
- Menu de contexto: nenhum feedback
- Adição manual do popup falha calada
- Erro de rede em “Enviar ao Anki”
- Toasts de 1,8 s para mensagens de 3 linhas
- Contadores “0/20” sem legenda
