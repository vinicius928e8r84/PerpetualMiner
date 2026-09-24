# Voz, tom &amp; catálogo de mensagens/estados

Resolução do ticket [Voz, tom & catálogo de mensagens/estados](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4), parte do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1).

O que está aqui:

1. **Guia de voz e tom**: as regras que qualquer mensagem nova precisa seguir.
2. **Regras por categoria**: onde cada tipo de mensagem aparece e o que ela diz.
3. **Catálogo**: 183 estados-chave com a cópia aprovada. É o texto que os protótipos e a construção usam.

Este documento cobre só o *conteúdo*. Três coisas ficam para outros tickets:

- a aparência dos componentes (toast, modal, ícone de status): [Identidade visual própria & design system base](https://github.com/vinicius928e8r84/PerpetualMiner/issues/3);
- onde cada área mora: [Painel — arquitetura de informação & shell](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6);
- a lógica que hoje mente (mensagem de sucesso antes de confirmar): [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9).

Os termos seguem o [`CONTEXT.md`](../../../CONTEXT.md). A versão interativa do catálogo está em [`catalogo.html`](catalogo.html).

---

## 1. Guia de voz e tom

| # | Regra | Exemplo |
|---|---|---|
| V1 | **Quem fala:** o app não tem “eu” e nunca diz “nós”. Ele fala de forma impessoal sobre o que aconteceu. O usuário é tratado por **você**, quase sempre implícito no imperativo. Nunca “tu”. | “Nenhuma marcação encontrada nesta foto. Marque as frases com /barras/…” |
| V2 | **Temperatura:** calmo e direto, como um colega competente. **Zero exclamação**, zero piada. Sucesso é curto e factual. Se o produto tiver entusiasmo, ele fica na identidade visual. | “Frase minerada · Inglês” |
| V3 | **Anatomia do erro:** (1) o que aconteceu, nos termos do usuário; (2) o que fazer, com um botão quando existe ação. A causa técnica (código HTTP, mensagem crua, jobId) vai para um **“Detalhes”** recolhido e copiável. | “O envio em inglês não começou. A conexão com o Anki respondeu com erro. [Tentar de novo] · Detalhes” |
| V4 | **Honestidade:** só se afirma o que já aconteceu. Durante a espera, a mensagem diz a ação em andamento. Falha tem cópia própria. Dado ausente aparece como “indisponível”, nunca como zero. | “Salvando…” → “Frase minerada” / “Não deu para minerar a frase.” · “Custo indisponível” (e não “$0.0000”) |
| V5 | **Sem emoji no texto.** Ícones de status vêm do componente, não da cópia. Símbolos tipográficos permitidos: “…”, “·” (separador) e “→”. | — |
| V6 | **Só PT-BR.** Inglês só em nome próprio (Anki, Gemini, Netflix, YouTube). Mensagem de terceiro é traduzida, e o texto original vai para Detalhes. Traduzir a UI para inglês fica fora deste esforço. “keyword” pode continuar como nome técnico no código, nunca na tela: o chip da Palavra diz `palavra: …` quando você a escolheu e `auto: …` quando foi detectada, igual no Painel e no overlay (`keyword:` e `nova:` saem). | “O Gemini está recebendo pedidos demais…” · Detalhes: HTTP 429 |
| V7 | **Convenções de escrita** (checáveis mecanicamente, ver abaixo). | — |
| V8 | **Verbo central: minerar.** Pôr uma frase no histórico é minerar, qualquer que seja a Fonte. “Capturar”, “salvar” e “adicionar” saem. | Atalhos “Minerar legenda” e “Minerar seleção” · botão “Minerar frases” |
| V9 | A página hoje chamada BookReader passa a se chamar **“Minerar de uma foto”**. | — |
| V10 | **As mensagens evitam citar o nome do produto.** Onde é inevitável (manifest, menu de contexto do Chrome, onboarding), a grafia é **PerpetualMiner**. A tela grande se chama só **Painel**. | “Apagar 12 frases?” · “Minerar com PerpetualMiner” · “Abrir painel” |
| D1 | **Cartão**, não card. Coerente com Baralho e com o Anki em PT-BR. | “Criando cartões” |
| D2 | Os nomes de recurso também são traduzidos: **Mineração automática** (era Auto Miner) e **Conexão com o Anki** (era Anki Bridge). | “Mineração automática · Inglês · 12 de 20 hoje” |

### Convenções de escrita (V7)

- **Sentence case** em tudo: títulos, botões, toasts, rótulos. Exemplo: “Editar contexto”, e não “Editar Contexto”.
- **Reticências** são um caractere só (“…”) e aparecem **só em estado em andamento**. Placeholder não leva reticências.
- **Ponto final:** não vai em título, botão, rótulo nem em toast de uma frase só. Vai em texto de corpo com mais de uma frase.
- **Números** vêm sempre com unidade e plural certo: “1 frase”, “12 frases”, “1.284 frases”. Nunca um número solto, “job(s)” ou “frase(s)”.
- **Separador “·”:** quando ele continua o mesmo status ou a mesma frase, o que vem depois começa com minúscula: “Sem conta · só neste computador”, “Frase minerada · não deu para copiar”. Quando separa rótulos independentes (modos, etapas, filtros, o idioma), cada rótulo mantém a caixa própria: “Colar · Arquivo .txt · Foto”, “Frase minerada · Inglês”.
- **Dinheiro:** “US$ 0,42”, com 2 casas por padrão. Com “Mostrar custos com 4 casas” ligado no Avançado, todos os valores passam a 4 casas, em todo lugar. Valor positivo abaixo de 1 centavo aparece como “< US$ 0,01”, nunca “US$ 0,00”.
- **Datas:** relativas na camada principal (“há 5 min”, “ontem”, “há 3 dias”). ISO e hora exata só em Detalhes.
- **Botões** dizem verbo + objeto: “Apagar 12 frases”, “Tentar de novo”, “Limpar filtros”. Nunca “OK”, “Sim” ou “Confirmar” sozinhos. O botão de desistir é sempre “Cancelar”.
- **Acentuação:** completa, sempre. Hoje falta acento em toda a área do Bridge.

---

## 2. Regras por categoria

| # | Categoria | Regra |
|---|---|---|
| C1 | **Canal** | O canal depende do tipo de mensagem. (1) **Toast**: só sucesso e aviso leve, com até ~60 caracteres numa linha e sem ação obrigatória; ele some sozinho, e a duração é proporcional ao texto, nunca menor que o tempo de leitura. (2) **Inline e persistente**: todo erro que pede ação; fica no lugar do problema, com o botão da ação, até ser resolvido ou fechado. (3) **No lugar do conteúdo**: vazio, loading e “indisponível”. (4) **Modal próprio**: confirmação destrutiva; nunca `confirm()` nativo. Toasts não se sobrescrevem a ponto de esconder um erro. |
| C2 | **Vazio** | São três vazios diferentes. No **primeiro uso**, a mensagem diz o que vai aparecer ali e ensina a encher, com a ação. Quando o **filtro ou a busca não acha nada**, ela diz que é o filtro e oferece “Limpar filtros” ou “Limpar busca”. Quando houve **falha**, não é vazio: é erro, e segue a V3. |
| C3 | **Loading** | Gerúndio + objeto; nunca um “Carregando” genérico. Com N itens, mostra “3 de 12”. Com etapas, a etapa tem nome de gente (“Gerando imagens”, não “generating_images”). Em espera longa (mais de ~10 s), diz o que está segurando. Espera curta fica sem texto, só esqueleto ou nada. Quando existe, “Cancelar” fica ao lado. |
| C4 | **Sucesso** | A fórmula é objeto no particípio + contagem + destino, sem “com sucesso”. **Parcial nunca é sucesso**: “10 de 12 frases enviadas · 2 falharam [Ver falhas]”. O app **cala quando a mudança já aparece na tela** (editar na lista, marcar ou desmarcar) e fala quando o efeito é invisível ou acontece em outra tela (minerar por cima do vídeo, envio, cópia, download). |
| C5 | **Confirmação: anatomia** | **Título**: a pergunta, com contagem e objeto (“Apagar 12 frases?”). **Corpo**: só a consequência que não é óbvia, como sumir de outros computadores, não dar para desfazer ou o que a outra opção faz. **Botões**: o destrutivo repete o verbo (“Apagar 12 frases”); o outro é “Cancelar”. |
| C6 | **Confirmação: atrito** | Um só modal (o da C5) para apagar 1 frase, apagar a seleção e apagar tudo. O atrito extra de “Apagar tudo” vem do lugar (Configurações › Zona de perigo) e do texto (contagem total e aviso da nuvem). Não é preciso digitar nada para confirmar. |
| C7 | **Entrada em massa** | O botão é **“Minerar frases”**, com os modos Colar · Arquivo .txt · Foto. A foto leva à página “Minerar de uma foto”. |
| C8 | **Status persistente** | Rótulo curto com o estado **atual verdadeiro**, nunca o estado otimista inicial. Erro usa palavra e ícone diferentes de andamento. Quando o estado impede algo, a mensagem diz o quê. Todo número vem com o que ele conta. Exemplo: “Sem sincronizar · as frases estão só neste computador”. |
| C9 | **Silêncios** | Toda ação que o usuário inicia tem retorno visível, a menos que a mudança já apareça na tela. Estes silêncios passam a ter mensagem: legenda não encontrada; mineração rápida do popup (a falha ganha mensagem; o sucesso é a frase aparecendo no topo da lista); falha ao salvar ou copiar ao minerar; erro de rede ao criar ou retomar o Envio; importação que salvou localmente mas não subiu para a nuvem; e a confirmação ao **Recomeçar** o Minerar de uma foto com frases ainda não mineradas (**novo item da lista fechada**). O menu de contexto continua sem retorno, porque isso seria função nova (Auditoria, T6). Um **“Tentar de novo” que repete a mesma ação com o mesmo dado é revestimento**, não função nova: “Tentar de novo nas que falharam” (FOT-15) é o lote do “Tentar de novo” da foto. |
| F1 | **Conexão desligada** | Nos erros, cópia genérica: “Ligue-a neste computador” (ENV-01). A instrução concreta de como ligar fica no passo 4 da Boas-vindas e na área Conexão com o Anki enquanto ela nunca respondeu (ONB-08, ONB-16), com o retry “Tentar de novo”. |

---

## 3. Catálogo de estados-chave

São 183 estados. “Hoje” é o texto atual do código, em `HEAD 42994e0`. **(novo)** marca uma mensagem que hoje não existe: um silêncio que passa a ter voz. **(some)** marca um texto que sai sem nada no lugar.

As contagens são exemplos e sempre seguem o plural certo. Um erro sem cópia própria usa GLB-01 como último recurso, sempre com Detalhes.

### Popup

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| POP-01 | Lista das últimas carregando **(some)** | loading | Carregando... | _(sem texto)_ | Espera curta: sem texto, só esqueleto (C3). |
| POP-02 | Nenhuma frase (1º uso) | vazio | Nenhuma frase salva ainda. | Nenhuma frase ainda. Aperte Alt+S num vídeo com legenda para minerar a primeira. | Mostra o atalho que estiver configurado de fato. Sem atalho gravado: GLB-02. |
| POP-03 | Campo da mineração rápida | status | Cole ou escreva uma frase… | Cole ou escreva uma frase | Placeholder não é andamento: sem “…” (V7). |
| POP-04 | Botão da mineração rápida | status | Adicionar | Minerar |  |
| POP-05 | Mineração rápida deu certo **(novo)** | sucesso | (nada) | _(sem texto)_ | O campo limpa e a frase aparece no topo das últimas. É visível, então fica sem toast (C4). |
| POP-06 | Mineração rápida falhou **(novo)** | erro | (falha calada) | Não deu para minerar a frase. Tente de novo. | Inline sob o campo, com “Detalhes” (C9). |
| POP-10 | Título da seção | status | Auto Miner | Mineração automática |  |
| POP-07 | Contador da mineração automática | status | 0/20 | 12 de 20 hoje | Número com o que ele conta (C8). |
| POP-08 | Mineração automática no limite | status | 20/20 (amarelo) | Limite de hoje atingido · 20 de 20 |  |
| POP-09 | Botão que abre o Painel | status | Abrir Painel de Estudos | Abrir painel | V10. |
| POP-11 | Rodapé do atalho | status | Configurar Atalho de Captura · Atalho atual: … (o Alt+S não aparece) | Alt+S minera a legenda do vídeo · Mudar atalho | Mostra o atalho “Minerar legenda” gravado, não um texto fixo. “Mudar atalho” abre o painel em Configurações › Atalhos. Sem atalho gravado: GLB-02. |
| POP-12 | Subtítulo do cabeçalho **(some)** | status | Minerador de legendas | _(sem texto)_ | O popup não tem subtítulo: só a marca Veio + “PerpetualMiner”. A frase descritiva fica para a Boas-vindas (ONB-01) e a loja. |

### Minerar na página (componente de feedback)

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| MIN-01 | Alt+S / botão: minerou e copiou | sucesso | Minerado & Copiado · Inglês | Frase minerada e copiada · Inglês | 2ª linha: “{Título} · {Detalhe}”, 3ª: a frase. Só aparece depois de salvar e copiar de verdade (V4). |
| MIN-02 | Minerou, mas não copiou **(novo)** | sucesso | (dizia sucesso igual) | Frase minerada · não deu para copiar |  |
| MIN-03 | Falhou ao salvar **(novo)** | erro | (dizia sucesso igual) | Não deu para minerar a frase. Tente de novo. | Fica até fechar (×), Esc ou até a próxima captura substituí-la, com “Tentar de novo” (C1). O sucesso continua sumindo em ~3,5 s. |
| MIN-04 | Nenhuma legenda na tela **(novo)** | erro | (borda vermelha por 800 ms) | Nenhuma legenda na tela agora. Ative as legendas do vídeo e tente de novo. | C9. |
| MIN-05 | Atalho de seleção: minerou | sucesso | ⚡ Frase Capturada! | Frase minerada · Inglês | 2ª linha: começo da frase. |
| MIN-06 | Auto Miner minerou uma linha | sucesso | Auto Miner - Inglês - 12/20 | Mineração automática · Inglês · 12 de 20 hoje |  |
| MIN-07 | Botão flutuante (title/aria) **(novo)** | status | (nenhum) | Minerar legenda (Alt+S) | Mostra o atalho configurado. Sem atalho gravado, fica só “Minerar legenda”. |
| MIN-08 | Menu de contexto do Chrome | status | Enviar para o PerpetualMiner | Minerar com PerpetualMiner | V10: único lugar onde o nome aparece. O retorno visual continua fora (Auditoria T6). |
| MIN-09 | Badge da toolbar (tooltip) **(novo)** | status | (não existe) | Mineração automática: 12 hoje | Contador na toolbar: lista fechada. Soma só os idiomas ligados. Quando todos os idiomas ligados bateram o limite: “Mineração automática: limite de hoje atingido”. O contador no canto do botão flutuante (n/limite) é o do idioma daquela captura, não o do badge. |
| MIN-10 | Página sem vídeo e sem seleção **(novo)** | erro | (nada aparece) | Esta página não tem vídeo com legenda. | Alt+S ou o atalho de seleção numa página sem vídeo e sem texto selecionado. A pílula surge no canto inferior direito. C9. |
| MIN-11 | Contador do botão flutuante (tooltip) **(novo)** | status | Auto Miner: {n} de {limite} hoje | Mineração automática · Inglês: 9 de 15 hoje | O contador `n/limite` do botão é o do idioma daquela captura, não a soma do badge (MIN-09). No limite: “Mineração automática · Inglês: limite de hoje atingido”. |

### Minerar de uma foto

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| FOT-01 | Título + subtítulo | status | Transcrição de Livro Físico | Minerar de uma foto — Tire uma foto da página com os trechos marcados e escolha quais frases minerar. | V9. |
| FOT-02 | Área de envio vazia | vazio | Arraste fotos aqui · ou clique para selecionar · múltiplas imagens suportadas · JPG, PNG, HEIC, WEBP | Arraste fotos de páginas marcadas — ou clique para escolher · JPG, PNG, HEIC ou WEBP |  |
| FOT-03 | Aviso na prévia | status | Confira se as marcações estão visíveis na foto | Confira se as marcações aparecem na foto |  |
| FOT-04 | Arquivo que não é foto | erro | Nenhum arquivo de imagem. Use JPG, PNG, WEBP ou HEIC. | Esse arquivo não é uma foto. Use JPG, PNG, HEIC ou WEBP. |  |
| FOT-05 | Sem chave do Gemini | erro | Insira sua Gemini API Key nas configurações à esquerda. | Para ler fotos, adicione sua chave do Gemini em Configurações. | Botão “Abrir Configurações”. |
| FOT-06 | Lendo 1 foto | loading | Analisando a imagem… / O Gemini está identificando os trechos marcados | Lendo a foto… — Procurando os trechos marcados | Com “Cancelar” ao lado (lista fechada). |
| FOT-07 | Lendo várias fotos | loading | Processando imagem 2 de 5… | Lendo a foto 2 de 5… | Com “Cancelar”. “Adicionando ao histórico de frases…” (enganoso) some. |
| FOT-08 | Fotos esperando na fila | status | +2 fotos na fila aguardando / Processando foto... 2 na fila · pode arrastar mais! | 2 fotos na fila · arraste mais para ler em seguida |  |
| FOT-09 | Contagem de resultados | status | Total acumulado: 1 trecho prontos para salvar | 12 frases encontradas | Frase, não trecho (glossário). |
| FOT-10 | Nenhuma marcação encontrada | vazio | Não encontrei trechos marcados nesta imagem. / Certifique-se de que as marcações estão visíveis. / Use /barras/, _underlines_ ou sublinhado físico. | Nenhuma marcação encontrada nesta foto. Marque as frases com /barras/, _sublinhado_ ou caneta e confira se aparecem na foto. | Só quando a leitura funcionou; se a API falhou, é o FOT-11 (C2). |
| FOT-11 | Gemini falhou numa foto | erro | Imagem 2: HTTP 429 / Erro ao processar foto: <msg em inglês> | Não deu para ler a foto 2. O Gemini está recebendo pedidos demais; espere um minuto e tente de novo. | A 2ª frase traduz a causa: chave inválida → “A chave do Gemini não funciona. Confira em Configurações.” Original em Detalhes. |
| FOT-12 | Botão principal | status | Salvar no PerpetualMiner | Minerar 12 frases |  |
| FOT-13 | Nenhuma frase marcada p/ minerar | erro | Selecione ao menos um trecho para salvar. | Selecione pelo menos uma frase. |  |
| FOT-14 | Minerou tudo | sucesso | 12 trecho(s) salvo(s) no PerpetualMiner! | 12 frases mineradas | O botão volta ao rótulo normal (hoje fica preso em “salvos!”). |
| FOT-15 | Minerou parte **(novo)** | erro | (não avisa) | 10 de 12 frases mineradas · 2 falharam | Com “Tentar de novo” nas 2 (C4). |
| FOT-16 | Falhou tudo | erro | Não foi possível salvar os trechos. | Não deu para minerar as frases. Tente de novo. |  |
| FOT-17 | Botão Trocar Foto + Limpar Lista (juntos) | status | Limpar Lista / Trocar Foto | Recomeçar |  |
| FOT-18 | Recomeçar com resultados não minerados **(novo)** | confirmação | (sem confirmação) | Descartar 12 frases não mineradas? — Elas ainda não foram mineradas e vão se perder. [Cancelar] [Descartar 12 frases] | C9: entra na lista fechada. Sem resultados pendentes, recomeça direto. |
| FOT-19 | Status de cada foto na fila **(novo)** | status | (não existe) | Pronta · Na fila · Lendo… · 12 frases · Sem marcações · Falhou · Cancelada | Selo por foto. “Falhou” vem com o motivo embaixo e “Tentar de novo”: a 2ª frase do FOT-11 (“O Gemini está recebendo pedidos demais; espere um minuto e tente de novo.”, “A chave do Gemini não funciona. Confira em Configurações.”) ou “Sem conexão com a internet. Confira a rede e tente de novo.”. “Sem marcações” é a leitura que funcionou sem achar nada (FOT-10). |
| FOT-20 | Progresso da leitura **(novo)** | status | Processando imagem 2 de 5… | 2 de 4 lidas | No topo da fila de fotos, ao lado de “Cancelar”. |
| FOT-21 | Leitura cancelada **(novo)** | status | (não existe) | Leitura cancelada. 2 fotos ficaram sem ler; as frases das fotos já lidas continuam aqui. | Aviso informativo depois do Cancelar (lista fechada). Singular: “1 foto ficou sem ler”. |

### Painel · Shell

O shell “Ilhas” do Painel: a sidebar, os títulos das áreas e o chip de conta ([spec do shell](../painel/shell/README.md)). O total de Frases usa PAI-05; o ponto da Conexão com o Anki, BRG-01 e BRG-02; a faixa da Conexão desligada, ENV-01 (F1); o chip, CFG-01, CFG-02 e CFG-10.

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| SHL-01 | Itens da sidebar **(novo)** | status | Todos os Streamings · Netflix · YouTube… (as Fontes) · Sair | Frases · Conexão com o Anki · Configurações | Rótulo da navegação para o leitor de tela: “Navegação do painel”. As Fontes saem da sidebar. No trilho, o rótulo vira o tooltip. |
| SHL-02 | Títulos das áreas **(novo)** | status | Frases mineradas · Presets e custos | Frases mineradas · Conexão com o Anki · Configurações | Cabeçalho de área, 22/700. |
| SHL-03 | Abas da Conexão com o Anki **(novo)** | status | (tudo numa página só) | Custos · Baralhos e termos · Vocabulário · Ajustes de envio | Controle segmentado; o grupo se chama “Seções da Conexão com o Anki”. |
| SHL-04 | Cards de Configurações **(novo)** | status | (espalhados na sidebar e no Minerar de uma foto) | Conta & sync · Atalhos · Chave do Gemini · Aparência · Zona de perigo | A Chave do Gemini usa CFG-15; a Aparência, CFG-29…31. |
| SHL-05 | Chip de conta **(novo)** | status | Login com Google · Sincronizado · Erro de sync | Sem conta · só neste computador · Sem sincronizar · 8 de 10 sincronizadas · Sessão expirou | Sem conta, o chip mostra em duas linhas, como o nome e o estado de quem tem conta: “Sem conta” e “Só neste computador”; a frase inteira fica no tooltip. Com conta: nome + CFG-01, CFG-02 ou CFG-09; em `danger`, “Sem sincronizar” quando o sync falha ou a nuvem recusa (CFG-03, CFG-04), “8 de 10 sincronizadas” no sync parcial (CFG-05) e “Sessão expirou” (CFG-08) (C11). |
| SHL-06 | Atualizar a Conexão com o Anki **(novo)** | status | (ícone sem texto) | Atualizar | Tooltip: BRG-24. |

### Painel · Frases

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| PAI-01 | Lista carregando **(some)** | loading | Carregando... | _(sem texto)_ | Esqueleto sem texto (C3). |
| PAI-02 | Nenhuma frase (1º uso) | vazio | Nenhuma frase encontrada. | Nenhuma frase ainda. Minere de um vídeo com Alt+S ou use Minerar frases para colar, importar ou ler uma foto. | Botão “Minerar frases”. Mostra o atalho “Minerar legenda” gravado; sem atalho gravado: GLB-02. |
| PAI-03 | Filtros esconderam tudo | vazio | Nenhuma frase encontrada. | Nenhuma frase com estes filtros. | Botão “Limpar filtros”. |
| PAI-04 | Busca sem resultado **(novo)** | vazio | (busca não existe) | Nenhuma frase com “{termo}”. | Botão “Limpar busca”. Busca: lista fechada. |
| PAI-05 | Total | status | Total 1284 frases | 1.284 frases |  |
| PAI-06 | Contador de seleção | status | 3 selecionada(s) | 3 selecionadas |  |
| PAI-07 | Paginação | status | 1 a 50 de 1284 frases | 1–10 de 1.284 | 10 frases por página. |
| PAI-08 | Selo da frase | status | ✓ No Anki (também p/ .txt) | Enviada ao Anki · Exportada | Dois selos distintos (glossário). A lógica certa é bug (#9). |
| PAI-09 | Filtro de enviadas | status | Esconder Exportadas | Ocultar enviadas e exportadas | Diz o que o filtro faz hoje. |
| PAI-10 | Filtros | status | Todos os Streamings / Todas as Fontes · Todos os Idiomas · 🇬🇧 Inglês | Todas as fontes · Todos os idiomas · Inglês | Sem bandeira (V5). |
| PAI-11 | Cabeçalho de data | status | (3 dias atrás) · (hoje) · (ontem) | há 3 dias · hoje · ontem |  |
| PAI-12 | Apagar 1 frase **(novo)** | confirmação | (sem confirmação) | Apagar esta frase? — Ela some também dos outros computadores conectados à sua conta. Não dá para desfazer. [Cancelar] [Apagar frase] | Sem conta: sem a frase da nuvem. Depois de apagar: sem toast (a linha some). |
| PAI-13 | Apagar seleção | confirmação | Deseja deletar as 1 frase selecionadas? Esta ação não pode ser desfeita. | Apagar 12 frases? — Elas somem também dos outros computadores conectados à sua conta. Não dá para desfazer. [Cancelar] [Apagar 12 frases] |  |
| PAI-14 | Seleção apagada | sucesso | 12 frase(s) deletada(s)! | 12 frases apagadas | A seleção pode cobrir várias páginas, então fica o toast. |
| PAI-15 | Apagou local, nuvem falhou | erro | Erro ao deletar da nuvem: HTTP 403 | As frases foram apagadas deste computador, mas não da nuvem. Elas podem voltar na próxima sincronização. | “Tentar de novo” + Detalhes. |
| PAI-16 | Editou texto na lista **(some)** | sucesso | Frase atualizada! | _(sem texto)_ | A mudança está na tela (C4). |
| PAI-17 | Copiou frase | sucesso | Copiado! | Frase copiada | Falha: “Não deu para copiar”. |
| PAI-18 | Ação sem seleção **(some)** | erro | Selecione as frases que deseja exportar. (e editar/enviar) | _(sem texto)_ | Com a barra contextual, essas ações só aparecem com seleção: a mensagem fica inalcançável. |
| PAI-19 | Exportou .txt | sucesso | 12 frases exportadas! | 12 frases exportadas para .txt |  |
| PAI-20 | Modal de contexto (título) | status | Editar Metadados · Editar 12 frase(s) selecionada(s) | Editar contexto · Editar contexto de 12 frases — Campos em branco ficam como estão · [Cancelar] [Salvar contexto] | Contexto, não metadados (glossário). |
| PAI-21 | Campos do contexto | status | Plataforma ou tipo de origem · Episódio, capítulo ou informação complementar | Fonte — de onde a frase veio (netflix, youtube, livro…) · Título · Detalhe — episódio, capítulo ou canal |  |
| PAI-22 | Contexto em massa salvo | sucesso | Metadados atualizados! | Contexto de 12 frases atualizado | Edição individual: sem toast. |
| PAI-23 | Campo da busca **(novo)** | status | (busca não existe) | Buscar nas frases | Procura no texto da frase e no Título. O × ao lado do texto usa o rótulo de PAI-04 (“Limpar busca”). Busca: lista fechada. |
| PAI-24 | Ordem da lista | status | Mais novas primeiro · Mais velhas primeiro | Mais novas primeiro · Mais antigas primeiro | Select em pílula na linha dos filtros. |
| PAI-25 | Nomes dos filtros **(novo)** | status | (sem nome) | Fonte · Idioma · Ordem | Nome de cada select para o leitor de tela. |
| PAI-26 | Navegar entre páginas **(novo)** | status | Primeira · Anterior · 1 de 129 · Próxima · Última | Páginas — 1 de 129 · Primeira página · Página anterior · Próxima página · Última página | “Páginas” é o nome da navegação para o leitor de tela; os quatro botões são só-ícone e o nome vira o tooltip. A contagem “1–10 de 1.284” é PAI-07. |
| PAI-27 | Chip da Palavra: ações **(novo)** | status | Remover keywords · Adicionar segundo grupo | Remover a palavra · Adicionar outro grupo | × e + do chip `palavra:`/`auto:`, só-ícone; o nome vira o tooltip. |
| PAI-28 | Selecionar uma frase **(novo)** | status | (checkbox sem nome) | Selecionar frase | Nome do checkbox de cada cartão para o leitor de tela. |
| PAI-29 | Nomes das Fontes **(novo)** | status | Todos os Streamings · Amazon Prime Video · Físico/Livro… | Netflix · YouTube · Prime Video · Max · Disney+ · Star+ · Kinopoisk · Web · Seleção · PDF · Livro · Manual · Importado | O selo de Fonte no cartão e as opções do filtro de Fonte. Uma Fonte fora da lista aparece com o nome gravado. |
| PAI-30 | Ações do cartão **(novo)** | status | Editar texto da frase · Editar metadados · Copiar frase · Apagar frase (só title) | Editar texto · Editar contexto · Copiar frase · Apagar frase | As 4 ações só-ícone de cada cartão; o nome é o rótulo para o leitor de tela e o tooltip. |
| PAI-31 | Selecionar a página **(novo)** | status | (Pág.) | Selecionar página | O checkbox da linha de seleção, sem seleção; marcado com a página inteira, misto com parte dela. |
| PAI-32 | Barra contextual de seleção **(novo)** | status | Pág. · Todas (30) · Editar Selecionados · Deletar · Exportar .txt · Enviar ao Anki | Desmarcar todas · Selecionar todas as 30 frases · Editar contexto · Exportar .txt · Apagar · Enviar ao Anki | Aparece só com seleção, abaixo dos filtros. “Desmarcar todas” é o × só-ícone (rótulo e tooltip). “Selecionar todas as N frases” só com a página inteira marcada, e conta as frases dos filtros atuais. |
| PAI-33 | Editar texto no lugar **(novo)** | status | (a textarea sem rótulo e sem botões) | Texto da frase · Enter salva · Esc cancela · [Cancelar] [Salvar texto] | “Texto da frase” é o nome do campo para o leitor de tela. Salvar não dá toast (PAI-16). |
| PAI-34 | Fechar **(novo)** | status | Fechar (só title) | Fechar | O × dos modais e dos avisos persistentes, para o leitor de tela e o tooltip. |

### Painel · Minerar frases (Colar · Arquivo .txt · Foto)

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| ADD-01 | Botão de entrada | status | Adição em Massa · Importar .txt · BookReader | Minerar frases → Colar · Arquivo .txt · Foto | C7. |
| ADD-02 | Colar: campo | status | Cole as frases — uma por linha | Cole as frases, uma por linha |  |
| ADD-03 | Colar: vazio | erro | Cole ao menos uma frase. | Cole pelo menos uma frase. |  |
| ADD-04 | Colar/arquivo: progresso | loading | 3 de 12… · Importando 50 linha(s)… · Linha 3 de 50 | Minerando 3 de 12… |  |
| ADD-05 | Colar: deu certo | sucesso | 12 frase(s) adicionada(s)! | 12 frases mineradas |  |
| ADD-06 | Minerou local, nuvem falhou | erro | Salvo localmente (sync falhou: …) — coberto pelo sucesso | 12 frases mineradas neste computador, mas não foram para a nuvem. | Persistente, com “Tentar de novo”. Não é mais sobrescrito (C1, C9). |
| ADD-07 | Arquivo ilegível | erro | Não foi possível ler o arquivo. | Não deu para ler este arquivo. Use um .txt com uma frase por linha. |  |
| ADD-08 | Arquivo vazio | erro | Arquivo vazio. | O arquivo está vazio. |  |
| ADD-09 | Nada novo no arquivo | vazio | Nenhuma frase nova. 3 duplicata(s), 1 inválida(s). | Nenhuma frase nova: 3 já estavam no histórico e 1 linha não pôde ser lida. |  |
| ADD-10 | Arquivo importado | sucesso | 12 frase(s) importada(s)! (3 duplicata(s) ignorada(s)) | 12 frases mineradas · 3 já existiam |  |
| ADD-11 | Menu Minerar frases: descrição de cada modo **(novo)** | status | (não existe) | Colar — Uma frase por linha · Arquivo .txt — Importar um .txt com uma frase por linha · Foto — Abre Minerar de uma foto numa aba nova | Uma linha de explicação sob cada modo do menu (C7). |

### Envio ao Anki

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| ENV-01 | Bridge desligado ao enviar | erro | Anki Bridge offline. Inicie o serviço residente no PC. | A conexão com o Anki está desligada. Ligue-a neste computador e tente de novo. | “Tentar de novo”. Ver F1. |
| ENV-02 | Bridge não respondeu bem | erro | Anki Bridge indisponível. | A conexão com o Anki não respondeu. Confira se ela está ligada e tente de novo. | Detalhes: status HTTP. |
| ENV-03 | Envio não começou | erro | Falha ao criar job EN: 500 | O envio em inglês não começou. A conexão com o Anki respondeu com erro. | “Tentar de novo” + Detalhes. |
| ENV-04 | Erro de rede ao enviar/retomar **(novo)** | erro | (nada aparece) | A conexão com o Anki não respondeu. Confira se ela está ligada. | C9. |
| ENV-05 | Envios criados **(some)** | sucesso | 2 lote(s) enviado(s) ao bridge. + Presets do Anki Bridge salvos. | _(sem texto)_ | O modal de progresso abre na hora: é visível (C4). |
| ENV-06 | Modal de progresso | loading | Aguardando jobs… · 2 job(s) acompanhados | Enviando ao Anki… — 2 envios · inglês e russo |  |
| ENV-07 | Etapas do envio | loading | Na fila · Gerando cards · Extraindo prompts · Gerando áudio · Gerando imagens · Aguardando Anki · Enviando ao Anki · Stage atual: … | Na fila · Criando cartões · Preparando imagens · Gerando áudio · Escolhendo imagens · Esperando o Anki · Enviando ao Anki | Sem “Stage atual:”, só a etapa. |
| ENV-08 | Cartão do envio | status | job_8f2c • Inglês / Status: completed • Atualizado: 2026-09-14T…Z | Envio em inglês · 12 frases · atualizado há 1 min | jobId e ISO em Detalhes. |
| ENV-09 | Sem notícia do Bridge (polling) | erro | Não foi possível ler o status do bridge. | Sem resposta da conexão com o Anki. Tentando de novo… | O polling continua sozinho, então o texto é verdadeiro. |
| ENV-10 | Fim: resumo | sucesso | confirm() “Apagar do Perpetual Miner as N frases enviadas ao Anki?” | Envio concluído — 12 enviadas · 2 já estavam no Anki · 1 falhou [Apagar as 12 enviadas] [Manter] | Título “Envio concluído em parte” se houver falha. Texto sob os botões: “Manter deixa as frases no histórico, marcadas como enviadas ao Anki.” |
| ENV-11 | Apagou as enviadas | sucesso | 12 frase(s) apagada(s) do Perpetual Miner. | 12 frases apagadas |  |
| ENV-12 | Manteve **(some)** | sucesso | 12 frase(s) enviada(s) ao Anki. | _(sem texto)_ | O resumo já disse (C4). |
| ENV-13 | Retomar envio (botões) | status | Continuar job · Retentar falhos | Continuar envio · Tentar de novo as que falharam |  |
| ENV-14 | Retomada OK / falhou | sucesso | Job reenfileirado para continuar. · Falha ao continuar job. · Falha ao retentar jobs. | Envio retomado · Não deu para retomar o envio. Confira se a conexão com o Anki está ligada. | Detalhes no erro. |
| ENV-15 | Pé do modal de progresso **(novo)** | status | (não existe) | Pode fechar: o resumo abre quando o envio terminar. | O resumo (ENV-10) abre sozinho em qualquer área. |

### Painel · Conexão com o Anki

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| BRG-01 | Estado do Bridge | status | Online / Offline | Conexão com o Anki: ligada / desligada · Enviar ao Anki fica indisponível | C8. |
| BRG-02 | Conectando | loading | Aguardando bridge... | Conectando ao Anki… |  |
| BRG-03 | Custo total | status | $0.0000 (também quando falhou) | US$ 0,42 · se falhou: Custo indisponível | 2 casas; com “Mostrar custos com 4 casas” ligado no Avançado, todos os valores com 4 casas (V7). |
| BRG-04 | Custos falharam | erro | Analytics indisponivel. Verifique se o bridge esta online. | Não deu para carregar os custos. Confira se a conexão com o Anki está ligada. | “Tentar de novo”. |
| BRG-05 | Resumo do período | status | 12 job(s) no filtro · Custo no filtro | 12 envios neste período |  |
| BRG-06 | Descrições das seções | status | Decks, imagem e TLDs usados ao enviar… · Gasto, origem das imagens e ultimos jobs do bridge. | Baralho, imagens e termos usados em cada envio. · Quanto cada envio custou e de onde vieram as imagens. · Progresso de cada idioma no Anki. | Com acento (hoje falta em toda a área). |
| BRG-07 | Presets EN/RU | status | Presets · Salvar presets · Presets do Anki Bridge salvos. | Ajustes de envio · Salvar ajustes · Ajustes de envio salvos | “Presets” sai (V6). |
| BRG-08 | Métricas de custo | status | Cards · Imagem IA · Judge · Guard · Economia | Criação de cartões · Imagens geradas · Escolha de imagem · Triagem de imagem · Economia com fotos reais | Escolha e Triagem ficam no Avançado. |
| BRG-09 | Origem das imagens | status | Google · Gerada · Pulada · Falhou · G 3 / IA 2 | Foto real · Gerada por IA · Sem imagem · Falhou · 3 fotos · 2 geradas |  |
| BRG-10 | Lendo baralhos | loading | Aguardando Anki... · Atualizando Anki... | Lendo os baralhos do Anki… |  |
| BRG-11 | Baralhos falharam | erro | Cards e termos por idioma indisponiveis. Use Reparar Anki e atualize novamente. | Não deu para ler os baralhos do Anki. Use Reparar Anki e tente de novo. | Botão “Reparar Anki”. |
| BRG-12 | Dados antigos | status | Mostrando cache anterior. Atualizacao do Anki falhou: ankistats_refresh_in_progress | Mostrando dados de há 2 h. Não deu para atualizar agora. | Código em Detalhes. |
| BRG-13 | Lido do arquivo local | status | Stats lidos do banco local do Anki. Para enviar cards, o AnkiConnect ainda precisa abrir normalmente. | Números lidos direto do arquivo do Anki. Para enviar, o Anki precisa abrir normalmente. |  |
| BRG-14 | Baralho não existe | erro | Baralho nao encontrado | O baralho “English Mining” não existe no Anki. Confira o nome em Ajustes de envio. |  |
| BRG-15 | Reparar Anki: andamento | loading | Reparando... · Fechando Anki travado e reabrindo... | Reparando… · Fechando o Anki travado e abrindo de novo… |  |
| BRG-16 | Reparar Anki: OK | sucesso | Anki reparado. Atualizando cards e termos. | Anki reparado |  |
| BRG-17 | Reparar Anki: tempo esgotado | erro | Nao foi possivel reparar o Anki: signal is aborted without reason | O reparo demorou demais e foi interrompido. O Anki pode ter reaberto mesmo assim: atualize para conferir. | “Atualizar” + Detalhes. O timeout é bug (#9). |
| BRG-18 | Reparar Anki: Windows bloqueou | erro | Windows recusou fechar o Anki invisivel (processos: 1234). Feche o Anki pelo Gerenciador de Tarefas como administrador… | O Windows não deixou fechar o Anki. Feche o Anki pelo Gerenciador de Tarefas (como administrador) ou reinicie o computador, e tente de novo. | Inline e persistente, não toast de 1,8 s (C1). PIDs em Detalhes. |
| BRG-19 | Vocabulário | loading | Aguardando vocabulario... · Calculando vocabulario da Frente... | Lendo o vocabulário… |  |
| BRG-20 | Vocabulário falhou | erro | Vocabulario indisponivel. · Nao foi possivel carregar o vocabulario. | Não deu para carregar o vocabulário. | “Tentar de novo”. |
| BRG-21 | Vocabulário: resumo / vazio | status | 1200 items em Ingles \| mostrando 50 · Nenhum item encontrado. · So palavras / So termos | 1.200 itens em inglês · mostrando 50 · Nenhum item com esta busca. · Só palavras / Só termos |  |
| BRG-22 | Lista de envios vazia | vazio | Sem jobs nesse filtro. | Nenhum envio neste período. |  |
| BRG-23 | Diagnóstico (Avançado) | status | Baixar debug bundle · Debug bundle baixado. · Falha ao baixar debug bundle. | Baixar diagnóstico · (download visível, sem toast) · Não deu para baixar o diagnóstico. |  |
| BRG-24 | Botão atualizar | status | Atualizar custos (também abre o Anki) | Atualizar (abre o Anki se precisar) | Tooltip honesto. |
| BRG-25 | Custos carregando | loading | Atualizando... | Somando os custos… | Linha com o gerúndio + esqueleto (C3). |
| BRG-26 | Custo abaixo de 1 centavo | status | $0.0042 | < US$ 0,01 | Valor positivo abaixo de 1 centavo; nunca “US$ 0,00”. Com “Mostrar custos com 4 casas” ligado, mostra as 4 casas (V7). |
| BRG-27 | Azulejo do baralho que não existe | erro | Baralho nao encontrado \| 0.0% maturidade | baralho não encontrado | Legenda do azulejo, em minúscula como “palavras”; o valor vira “—”. O detalhe mostra BRG-14 com “Abrir Ajustes de envio”. |

### Configurações · Conta & sync · Atalhos · Chave · Aparência · Zona de perigo

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| CFG-01 | Sync: estado inicial | status | Sincronizado (antes de sincronizar) | Sincronizando… | Nunca o estado otimista (C8). |
| CFG-02 | Sync OK | status | Sincronizado | Sincronizado há 2 min |  |
| CFG-03 | Sync falhou | erro | Erro de sync (com ícone de sincronizando) · Erro na nuvem — usando dados locais. | Sem sincronizar · as frases estão só neste computador · As mudanças deste computador ainda não subiram para a nuvem. [Tentar de novo] | Status persistente com “Tentar de novo” e Detalhes; ícone próprio de erro. |
| CFG-04 | Nuvem recusou acesso | erro | Firestore: permissão negada — verifique as regras de segurança no console Firebase. | A nuvem recusou o acesso. Saia da conta e entre de novo. | A instrução de dev vai para Detalhes. |
| CFG-05 | Sync parcial | erro | Sync parcial: 8/10 frases enviadas. | 8 de 10 frases sincronizadas · 2 ficaram só neste computador · As mudanças deste computador ainda não subiram para a nuvem. [Tentar de novo] | “Tentar de novo” e Detalhes. |
| CFG-06 | Entrar | status | Login com Google — Sincronize suas frases em qualquer dispositivo | Entrar com Google — Suas frases em qualquer computador · Sem conta, elas ficam só neste computador. |  |
| CFG-07 | Login falhou / cancelado | erro | Erro no login: Login cancelado · Erro no login: <msg crua> | (cancelado: nada) · Não deu para entrar com o Google. Tente de novo. [Tentar de novo] | Cancelar não é erro. Inline no card Conta & sync, com Detalhes. |
| CFG-08 | Sessão expirou | erro | Token expirado — faça login novamente | Sua sessão expirou. Entre de novo para sincronizar. | Botão “Entrar”. |
| CFG-09 | Primeira subida para a nuvem | loading | Migrando… · 12 frase(s) migrada(s) para a nuvem! · Migração falhou: … | Sincronizando 12 frases… · 12 frases sincronizadas · Não deu para sincronizar suas frases. Elas continuam neste computador. | “Enviar” fica reservado para o Anki. |
| CFG-10 | Nome sem perfil | status | Usuário | Conta Google |  |
| CFG-11 | Atalhos: nomes | status | Atalho de Captura · (Alt+S invisível) | Minerar legenda · Minerar seleção | V8. |
| CFG-12 | Atalho: gravador | status | Não configurado · Clique aqui para gravar atalho · Cancelar gravação | Sem atalho · Gravar atalho · Cancelar |  |
| CFG-13 | Atalho: gravando | loading | ⏺ Aguardando… pressione uma tecla ou clique com um botão extra do mouse | Pressione as teclas ou um botão extra do mouse… |  |
| CFG-14 | Atalho: botões do mouse | status | Middle Click · Mouse Back · Mouse Forward · Mouse Btn 5 | Botão do meio · Botão voltar · Botão avançar · Botão 5 do mouse | V6. |
| CFG-15 | Chave do Gemini | status | Gemini API Key · AIza... · Salvar Key | Chave do Gemini — usada para ler fotos · Cole a chave (começa com AIza) · Salvar chave · Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador. · Chave salva · Trocar chave · Cancelar · Sem a chave, Minerar de uma foto não consegue ler as fotos. | Salva: “Chave salva” + a chave mascarada (CFG-28) + Trocar chave, que abre o campo com Salvar chave e Cancelar. Vazia: o campo aberto e a nota. |
| CFG-16 | Chave: vazia / salva | sucesso | Digite uma API Key antes de salvar. · API Key salva! | Cole a chave antes de salvar · Chave do Gemini salva |  |
| CFG-17 | Apagar todas as frases | confirmação | Apagar TODAS as frases? Esta ação não pode ser desfeita. | Apagar todas as 1.284 frases? — Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer. [Cancelar] [Apagar 1.284 frases] | C6: sem digitar. Singular: “Apagar 1 frase?”. Sem conta, fica só “Elas somem deste computador.”, como a spec da superfície pede (o protótipo ainda repete “Não dá para desfazer.”; a descrição do card já diz isso). |
| CFG-18 | Todas apagadas **(novo)** | sucesso | (nada) | Todas as frases foram apagadas | A lista fica em outra área, então fica o toast. |
| CFG-19 | Atalho repetido **(novo)** | erro | (não existe) | Esse atalho já é do Minerar legenda. Grave outro. | Inline na linha, em `danger`; a gravação continua e nada muda até sair uma combinação livre. Faz parte do item “atalho gravável” da lista fechada. |
| CFG-20 | Apagar tudo sem frases **(novo)** | status | (não existe) | Nenhuma frase para apagar | O botão da Zona de perigo fica indisponível com este rótulo. |
| CFG-21 | Restaurar atalhos padrão **(novo)** | status | (não existe) | Restaurar atalhos padrão | Botão fantasma no card Atalhos (lista fechada, item 7). Devolve os atalhos de fábrica sem confirmação: a mudança aparece na linha na hora. |
| CFG-22 | Atalhos de fábrica (dica) **(novo)** | status | (não existe) | Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho. | Ao lado de “Restaurar atalhos padrão”. |
| CFG-23 | Sair da conta **(novo)** | status | Sair da conta | Sair da conta | Botão fantasma no card Conta & sync. |
| CFG-24 | Entrada do Apagar tudo **(novo)** | status | (lixeira sem texto ao lado do total) | Apagar todas as frases · 1.284 frases em todos os computadores da sua conta · [Apagar todas as 1.284 frases] | Singular: “Apagar 1 frase”. Sem conta, o alcance é “1.284 frases neste computador”; sem frases, “Nenhuma frase no histórico” e o botão CFG-20. Perigo em contorno: só abre a confirmação (CFG-17). |
| CFG-25 | Conta & sync: descrição **(novo)** | status | (não existe) | Com a conta, suas frases ficam iguais em qualquer computador em que você entrar. | Sob o título, com o card aberto. |
| CFG-26 | Sair da conta: nota **(novo)** | status | (não existe) | Ao sair, as frases continuam neste computador. | Sob a conta, quando o sync está em dia. |
| CFG-27 | Conta & sync: resumo **(novo)** | status | (não existe) | Vinicius · Sincronizado há 2 min | A linha fechada: nome (ou CFG-10) + o estado do chip (SHL-05). Sem conta: “Sem conta · só neste computador”. |
| CFG-28 | Resumos da linha fechada **(novo)** | status | (não existe) | Legenda · Seleção · Sem chave · Nenhuma frase | A linha fechada de Atalhos (“Legenda [Alt+S]  Seleção [Alt+Botão voltar]”, com as teclas em `kbd`; sem atalho, CFG-12), da Chave do Gemini (a chave mascarada em mono; vazia, ponto `danger` + “Sem chave”) e da Zona de perigo (PAI-05: “1.284 frases”, “1 frase”; sem frases, “Nenhuma frase”). |
| CFG-29 | Aparência: título e descrição **(novo)** | status | (não existe) | Aparência — Vale para o painel, o popup e Minerar de uma foto, só neste computador. O que aparece por cima dos vídeos e das páginas continua escuro. | O título do card; a descrição aparece sob ele com o card aberto. Seletor de tema: lista fechada, item 10. |
| CFG-30 | Tema: opções **(novo)** | status | (não existe) | Tema · Escuro · Claro | “Tema” rotula o grupo para o leitor de tela; as opções são o controle segmentado. Trocar não tem toast: o tema muda na tela (C4). |
| CFG-31 | Aparência: resumo **(novo)** | status | (não existe) | Escuro · Claro | A linha fechada mostra o tema em uso. Sem escolha gravada: “Escuro”. |
| CFG-32 | Zona de perigo: descrição **(novo)** | status | (não existe) | Apagar tudo aqui não dá para desfazer, e vale para todos os computadores da sua conta. | Sob o título, com o card aberto. Sem conta: “Apagar tudo aqui não dá para desfazer.” |

### Boas-vindas (primeira execução)

A página não existe hoje: todas as linhas são novas. V10 permite o nome do produto aqui.

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| ONB-01 | Abertura (título + corpo) **(novo)** | status | (não existe) | Boas-vindas ao PerpetualMiner — Minere frases de vídeos, páginas e fotos de livros, e envie ao Anki como cartões. Seis passos rápidos deixam tudo pronto; os opcionais dá para pular. | Abre sozinha na instalação (lista fechada). |
| ONB-02 | Botões da abertura **(novo)** | status | (não existe) | Pular a configuração · Começar |  |
| ONB-03 | Sobretítulo do passo **(novo)** | status | (não existe) | Passo 4 de 6 · opcional |  |
| ONB-04 | Botões do passo **(novo)** | status | (não existe) | Voltar · Agora não · Continuar | “Agora não” só nos passos opcionais. |
| ONB-05 | Passo 1 **(novo)** | status | (não existe) | Num vídeo com legenda, aperte Alt+S. A frase vai para o histórico e já fica copiada. / Numa página ou PDF, selecione o texto e use o botão direito › Minerar com PerpetualMiner. / Ou cole uma frase aqui, como no popup: | Mostra o atalho “Minerar legenda” gravado; sem atalho gravado: GLB-02. |
| ONB-06 | Passo 2 **(novo)** | status | (não existe) | Escolha uma tecla ou um botão extra do mouse para minerar o texto selecionado, sem abrir o menu. | Mostra o atalho de legenda que estiver gravado (não Alt+S fixo), com os mesmos controles de Configurações › Atalhos. |
| ONB-07 | Passo 3 **(novo)** | status | (não existe) | Entre com Google para ter suas frases em qualquer computador. Sem conta, elas ficam só neste. |  |
| ONB-08 | Passo 4 **(novo)** | status | (não existe) | A Conexão com o Anki é um programa que roda neste computador, ao lado do Anki. É ela que cria os cartões e diz quais palavras você já conhece. Ela liga sozinha com o Windows depois de instalada uma vez. — 1. Abra o Anki neste computador, com o complemento AnkiConnect. 2. Instale a Conexão com o Anki uma vez (veja Detalhes). Depois ela liga sozinha com o Windows. 3. Volte aqui e use Tentar de novo. | Fecha a F1. Botão “Tentar de novo” (o mesmo retry do shell) + Detalhes recolhido e copiável com os comandos de instalação, a porta e o log. |
| ONB-09 | Passo 5 **(novo)** | status | (não existe) | Com ela ligada, as legendas com uma palavra que você ainda não conhece são mineradas sozinhas, até um limite por dia. Liga por idioma. / Os mesmos botões ficam no popup, pelo ícone da extensão. | A mineração automática estar no popup e aqui é deliberado. |
| ONB-10 | Dependência da mineração automática (passo e popup) **(novo)** | status | (não existe) | Nada é minerado com a Conexão com o Anki desligada: é ela que diz quais palavras você já conhece. | C8. |
| ONB-11 | Passo 6 **(novo)** | status | (não existe) | Só é usada em Minerar de uma foto, para ler os trechos marcados numa página de livro. Dá para adicionar depois: a página pede quando precisar. · Detalhes: No Google AI Studio, em “Get API key”. A chave fica só neste computador. |  |
| ONB-12 | Tudo pronto **(novo)** | status | (não existe) | Tudo pronto — Dá para mudar qualquer coisa depois, em Configurações. A mineração automática fica no popup. [Abrir painel] | “Abrir painel” abre o Painel em Frases. |
| ONB-13 | Resumo (por passo) **(novo)** | status | (não existe) | feito (o valor: “Alt+Q”, “ligada”…) · agora não · falta |  |
| ONB-14 | Lembrete no popup **(novo)** | status | (não existe) | Configuração pela metade · 2 de 6 — Volte de onde parou [Continuar configuração] | O lembrete ocultável é item da lista fechada. |
| ONB-15 | Lembrete em Frases **(novo)** | status | (não existe) | A configuração ficou pela metade: 2 de 6 passos. [Ocultar] [Continuar configuração] | “Ocultar” esconde o lembrete de vez, nos dois lugares. |
| ONB-16 | Área Conexão com o Anki, nunca conectada **(novo)** | vazio | (não existe) | Ainda não houve conexão neste computador — A Conexão com o Anki é um programa que roda neste computador, ao lado do Anki. É ela que cria os cartões e diz quais palavras você já conhece. Ela liga sozinha com o Windows depois de instalada uma vez. Sem ela, dá para minerar à vontade; o que fica indisponível é Enviar ao Anki e a mineração automática. | No lugar das abas na primeira vez, com os 3 passos do ONB-08. A faixa ENV-01/F1 continua em cima. |

### Global

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| GLB-01 | Erro sem tradução conhecida | erro | <err.message cru> | Algo deu errado. Tente de novo. | Último recurso, sempre com Detalhes. Todo erro conhecido tem cópia própria acima. |
| GLB-02 | Atalho “Minerar legenda” vazio **(novo)** | status | (Alt+S fixo, não dá para esvaziar) | Sem atalho · [Definir atalho] | Onde a cópia supõe Alt+S (POP-02, POP-11, PAI-02, ONB-05), sem atalho gravado a tecla dá lugar a “Sem atalho” e à ação “Definir atalho”, que abre `#configuracoes/atalhos` (na Boas-vindas, leva ao passo 2 da própria página, onde está o gravador). |
