# Voz: catálogo de Global

Parte do catálogo de [`README.md`](README.md) (§ 3): estas linhas são do mesmo catálogo e seguem as mesmas regras (V1–V10, C1–C9), mas moram aqui, um arquivo por área, para o README não crescer (o limite de tamanho dos arquivos) e dois PRs de áreas diferentes não mexerem no mesmo arquivo. O texto de cada linha está em [`lib/voz/catalogo.js`](../../../lib/voz/catalogo.js), que é a fonte; nenhum script lê mais esta tabela (`test_voz.js` confere só o catálogo com `catalogo-textos.json`).

### Global

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| GLB-01 | Erro sem tradução conhecida | erro | <err.message cru> | Algo deu errado. Tente de novo. | Último recurso, sempre com Detalhes. Todo erro conhecido tem cópia própria acima. |
| GLB-02 | Atalho “Minerar legenda” vazio **(novo)** | status | (Alt+S fixo, não dá para esvaziar) | Sem atalho · [Definir atalho] | Onde a cópia supõe Alt+S (POP-11, PAI-02, ONB-05; POP-02 tem frase própria), sem atalho gravado a tecla dá lugar a “Sem atalho” e à ação “Definir atalho”, que abre `#configuracoes/atalhos` (na Boas-vindas, leva ao passo 2 da própria página, onde está o gravador). |
