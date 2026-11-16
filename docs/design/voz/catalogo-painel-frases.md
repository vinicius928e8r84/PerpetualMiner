# Voz: catálogo de Painel: Shell, Frases e Minerar frases

Parte do catálogo de [`README.md`](README.md) (§ 3): estas linhas são do mesmo catálogo e seguem as mesmas regras (V1–V10, C1–C9), mas moram aqui, um arquivo por área, para o README não crescer (o limite de tamanho dos arquivos) e dois PRs de áreas diferentes não mexerem no mesmo arquivo. O texto de cada linha está em [`lib/voz/catalogo.js`](../../../lib/voz/catalogo.js), que é a fonte; nenhum script lê mais esta tabela (`test_voz.js` confere só o catálogo com `catalogo-textos.json`).

### Painel · Shell

O shell “Ilhas” do Painel: a sidebar, os títulos das áreas e o chip de conta ([spec do shell](../painel/shell/README.md)). O total de Frases usa PAI-05; o ponto da Conexão com o Anki, BRG-01 e BRG-02; a faixa da Conexão desligada, ENV-01 (F1); o chip, CFG-01, CFG-02 e CFG-10.

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| SHL-01 | Itens da sidebar **(novo)** | status | Todos os Streamings · Netflix · YouTube… (as Fontes) · Sair | Frases · Conexão com o Anki · Configurações | Rótulo da navegação para o leitor de tela: “Navegação do painel”. As Fontes saem da sidebar. No trilho, o rótulo vira o tooltip. |
| SHL-02 | Títulos das áreas **(novo)** | status | Frases mineradas · Presets e custos | Frases mineradas · Conexão com o Anki · Configurações | Cabeçalho de área, 22/700. |
| SHL-03 | Abas da Conexão com o Anki **(novo)** | status | (tudo numa página só) | Custos · Baralhos e termos · Vocabulário · Ajustes de envio | Controle segmentado; o grupo se chama “Seções da Conexão com o Anki”. |
| SHL-04 | Cards de Configurações **(novo)** | status | (espalhados na sidebar e no Minerar de uma foto) | Conta & sync · Atalhos · Conexão com o Anki · Chave do Gemini · Zona de perigo | A Chave do Gemini usa CFG-15; a Aparência, CFG-29…31. |
| SHL-05 | Chip de conta **(novo)** | status | Login com Google · Sincronizado · Erro de sync | Sem conta · só neste computador · Sem sincronizar · 8 de 10 sincronizadas · Sessão expirou | Sem conta, o chip mostra “Sem conta” e “Só neste computador” em duas linhas; a frase inteira fica no tooltip. Com conta: nome + CFG-01, CFG-02 ou CFG-09; em `danger`, “Sem sincronizar” quando o sync falha ou a nuvem recusa (CFG-03, CFG-04), “8 de 10 sincronizadas” no sync parcial (CFG-05) e “Sessão expirou” (CFG-08) (C11). |
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
| PAI-32 | Barra contextual de seleção **(novo)** | status | Pág. · Todas (30) · Editar Selecionados · Deletar · Exportar .txt · Enviar ao Anki | Desmarcar todas · Selecionar todas as 30 frases · Editar contexto · Exportar .txt · Apagar · Enviar ao Anki | Só com seleção, abaixo dos filtros. “Desmarcar todas” é o × só-ícone (rótulo e tooltip). “Selecionar todas as N frases” só com a página inteira marcada, e conta as dos filtros atuais. Com a Conexão desligada e nunca ligada, Enviar ao Anki fica `aria-disabled` e o tooltip “Indisponível: a Conexão com o Anki está desligada. Ligue-a neste computador para enviar.” aparece com o mouse ou o foco. |
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
| ADD-06 | Minerou local, nuvem falhou | erro | Salvo localmente (sync falhou: …) — coberto pelo sucesso | 12 frases mineradas neste computador, mas não foram para a nuvem. | Persistente, com “Tentar de novo” e sem “Detalhes”: a causa fica no card Conta & sync. Não é mais sobrescrito (C1, C9). |
| ADD-07 | Arquivo ilegível | erro | Não foi possível ler o arquivo. | Não deu para ler este arquivo. Use um .txt com uma frase por linha. |  |
| ADD-08 | Arquivo vazio | erro | Arquivo vazio. | O arquivo está vazio. |  |
| ADD-09 | Nada novo no arquivo | vazio | Nenhuma frase nova. 3 duplicata(s), 1 inválida(s). | Nenhuma frase nova: 3 já estavam no histórico e 1 linha não pôde ser lida. | Só repetidas: “Nenhuma frase nova: 3 já estavam no histórico.” Só ilegíveis: “Nenhuma frase nova: 1 linha não pôde ser lida.” Nunca fala de zero. |
| ADD-10 | Arquivo importado | sucesso | 12 frase(s) importada(s)! (3 duplicata(s) ignorada(s)) | 12 frases mineradas · 3 já existiam |  |
| ADD-11 | Menu Minerar frases: descrição de cada modo **(novo)** | status | (não existe) | Colar — Uma frase por linha · Arquivo .txt — Importar um .txt com uma frase por linha · Foto — Abre Minerar de uma foto numa aba nova | Uma linha de explicação sob cada modo do menu (C7). |
| ADD-12 | O modal Minerar frases **(novo)** | status | Frases · Adicionar frases · Cancelar | Frases · livro, web, podcast · Atomic Habits · Minerar 3 frases · Escolha um arquivo .txt · Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora. · Escolher arquivo · Escolher outro arquivo · As frases entram no topo da lista. · [Cancelar] [Fechar] | O título do modal é o ADD-01 (“Minerar frases”) e as abas são Colar · Arquivo .txt · Foto ↗ do ADD-01. Sem frases, o botão diz “Minerar frases”. “Fechar” fica no lugar de “Cancelar” depois do ADD-09. Fonte e Título usam os rótulos de PAI-21. |
