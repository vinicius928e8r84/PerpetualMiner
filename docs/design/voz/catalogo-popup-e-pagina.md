# Voz: catálogo de Popup e Minerar na página

Parte do catálogo de [`README.md`](README.md) (§ 3): estas linhas são do mesmo catálogo e seguem as mesmas regras (V1–V10, C1–C9), mas moram aqui, um arquivo por área, para o README não crescer (o limite de tamanho dos arquivos) e dois PRs de áreas diferentes não mexerem no mesmo arquivo. `scripts/voz-da-spec.js` lê todos os arquivos como um só, na ordem do índice do README, e o texto de cada linha está em [`lib/voz/catalogo.js`](../../../lib/voz/catalogo.js); `test_voz.js` confere os dois contra elas.

### Popup

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| POP-01 | Lista das últimas carregando **(some)** | loading | Carregando... | _(sem texto)_ | Espera curta: sem texto, só esqueleto (C3). |
| POP-02 | Nenhuma frase (1º uso) | vazio | Nenhuma frase salva ainda. | **Nenhuma frase ainda** · Aperte Alt+S num vídeo com legenda para minerar a primeira. | A picareta, o título em negrito e o texto embaixo. Mostra o atalho configurado de fato, uma tecla por `kbd`. Sem atalho gravado, o texto vira “Defina um atalho para minerar legendas de vídeo.” (`POP-02.semAtalho`, da spec do popup), com a ação “Definir atalho” de GLB-02. |
| POP-03 | Campo da mineração rápida | status | Cole ou escreva uma frase… | Cole ou escreva uma frase | Placeholder não é andamento: sem “…” (V7). |
| POP-04 | Botão da mineração rápida | status | Adicionar | Minerar |  |
| POP-05 | Mineração rápida deu certo **(novo)** | sucesso | (nada) | _(sem texto)_ | O campo limpa e a frase aparece no topo das últimas. É visível, então fica sem toast (C4). |
| POP-06 | Mineração rápida falhou **(novo)** | erro | (falha calada) | Não deu para minerar a frase. Tente de novo. | Inline sob o campo, com o ícone de alerta e sem “Detalhes”: a frase já diz o que fazer (dono, #38). |
| POP-10 | Título da seção | status | Auto Miner | Mineração automática |  |
| POP-07 | Contador da mineração automática | status | 0/20 | 12/20 · (leitor) 12 de 20 hoje | Na tela, o número grande e “/20” menor, como no protótipo (dono, #38). O leitor de tela ouve o número com o que ele conta (C8): “12 de 20 hoje”. |
| POP-08 | Mineração automática no limite | status | 20/20 (amarelo) | Limite de hoje atingido | A contagem já está no contador acima (POP-07), então não se repete. |
| POP-09 | Botão que abre o Painel | status | Abrir Painel de Estudos | Abrir painel | V10. |
| POP-11 | Rodapé do atalho | status | Configurar Atalho de Captura · Atalho atual: … (o Alt+S não aparece) | Alt+S minera a legenda do vídeo · Mudar atalho | Mostra o atalho “Minerar legenda” gravado, não um texto fixo. “Mudar atalho” abre o painel em Configurações › Atalhos. Sem atalho gravado: GLB-02. |
| POP-12 | Subtítulo do cabeçalho **(some)** | status | Minerador de legendas | _(sem texto)_ | O popup não tem subtítulo: só a marca Veio + “PerpetualMiner”. A frase descritiva fica para a Boas-vindas (ONB-01) e a loja. |
| POP-13 | Últimas mineradas: título e atalho para o Painel **(novo)** | status | Últimas mineradas | Últimas mineradas · Ver todas | “Ver todas” fica à direita do título, só com frase na lista, e abre o Painel em Frases. |
| POP-14 | Mineração automática: azulejo **(novo)** | status | (limite solto, sem rótulo) | por dia · limite [20] /dia | “por dia” à direita do título (POP-10). O leitor de tela ouve o toggle como “Mineração automática em inglês” e o campo como “Limite por dia em inglês”, com o idioma em minúscula. |
| POP-15 | Código do idioma no azulejo **(novo)** | status | EN · RU | EN · RU | Em mono, no topo do azulejo; o nome do idioma fica no rótulo do toggle (POP-14). |
| POP-16 | Mineração automática não carregou ou não salvou **(novo)** | erro | (falha calada) | Não deu para carregar a mineração automática. Feche e abra o popup de novo. · Não deu para salvar a mudança. Tente de novo. | Uma linha com o ícone de alerta, sob os azulejos, sem botão e sem “Detalhes”: diz o que fazer. Numa gravação que falhou, o toggle ou o limite voltam ao que está gravado. |
| POP-17 | Idade do vocabulário com o Anki fechado **(novo)** | status | (não existe) | Vocabulário de ontem, 14:02 | Uma linha sob os azulejos do popup, só com o Anki fechado (a Conexão desligada, ou ligada com o Anki confirmado fechado) e com leitura guardada: a mais antiga entre os idiomas ligados. O dia vem de PAI-11 e a hora é a da leitura. Com o botão BRG-38. Sem leitura, o azulejo diz BRG-37. |

### Minerar na página (componente de feedback)

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| MIN-01 | Alt+S / botão: minerou e copiou | sucesso | Minerado & Copiado · Inglês | Frase minerada e copiada | 2ª linha: a frase; a meta diz o idioma (`EN`, `RU`). Só aparece depois de salvar e copiar de verdade (V4). Revisão do dono no PR #66: sem “· Inglês” no título (a meta já diz) e sem a linha “{Título} · {Detalhe}”. |
| MIN-02 | Minerou, mas não copiou **(novo)** | sucesso | (dizia sucesso igual) | Frase minerada | Revisão do dono no PR #66: o que importa é ter minerado, então a pílula é a de sucesso, só sem “e copiada”. |
| MIN-03 | Falhou ao salvar **(novo)** | erro | (dizia sucesso igual) | Não deu para minerar / Tente de novo. | Título e dica, como a falha do protótipo. Dono, PR #66: sem × e sem “Tentar de novo”; some sozinha em ~3,5 s, como no protótipo. |
| MIN-04 | Nenhuma legenda na tela **(novo)** | erro | (borda vermelha por 800 ms) | Nenhuma legenda na tela / Ligue as legendas do player e tente de novo. | C9. Título e dica, como no protótipo. |
| MIN-05 | Atalho de seleção: minerou | sucesso | ⚡ Frase Capturada! | Frase minerada | 2ª linha: a frase; a meta é a Fonte, “Web” (PAI-29). |
| MIN-06 | Auto Miner minerou uma linha | sucesso | Auto Miner - Inglês - 12/20 | Mineração automática | 2ª linha: a frase; a meta é o idioma e o contador do dia (`EN 12/20`), como no protótipo. |
| MIN-07 | Botão flutuante (title/aria) **(novo)** | status | (nenhum) | Minerar legenda (Alt+S) | Mostra o atalho configurado. Sem atalho gravado, fica só “Minerar legenda”. |
| MIN-08 | Menu de contexto do Chrome | status | Enviar para o PerpetualMiner | Minerar com PerpetualMiner | V10: único lugar onde o nome aparece. O retorno visual continua fora (Auditoria T6). |
| MIN-09 | Badge da toolbar (tooltip) **(novo)** | status | (não existe) | Mineração automática: 12 hoje | Contador na toolbar: lista fechada. Soma só os idiomas ligados. Com todos no limite: “Mineração automática: limite de hoje atingido”. O contador no canto do botão flutuante (n/limite) é o do idioma daquela captura, não o do badge. |
| MIN-10 | Página sem vídeo e sem seleção **(novo)** | erro | (nada aparece) | Nenhuma legenda na tela / Esta página não tem vídeo com legenda. | Alt+S ou o atalho de seleção numa página sem vídeo e sem texto selecionado. A pílula surge no canto inferior direito. C9. |
| MIN-11 | Contador do botão flutuante (tooltip) **(novo)** | status | Auto Miner: {n} de {limite} hoje | Mineração automática · Inglês: 9 de 15 hoje | O contador `n/limite` do botão é o do idioma da captura, não a soma do badge (MIN-09). No limite: “Mineração automática · Inglês: limite de hoje atingido”. Na etiqueta do mouse, sem o idioma (a meta já o diz): “Mineração automática: 9 de 15 hoje” / “Mineração automática: limite de hoje atingido”. |
