# A Voz do passo do nível e da prévia do Cartão (#164)

Continuação do catálogo de [`README.md`](README.md) (§ 3): estas linhas são do mesmo catálogo e seguem as mesmas regras (V1–V10, C1–C9), mas moram aqui porque o
README não pode crescer (o limite de tamanho dos arquivos). `scripts/voz-da-spec.js` lê os dois arquivos como um só, e o texto de cada linha está em
[`lib/voz/catalogo-nivel.js`](../../../lib/voz/catalogo-nivel.js); `test_voz.js` confere os dois contra elas.

### Boas-vindas e Ajustes de envio: o nível e a prévia do Cartão

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| BRG-43 | A prévia do cartão **(novo)** | status | (não existe) | Prévia do cartão · Cartão de exemplo · Exemplo do Intermediário em inglês, como o Anki mostra. · Frente · Verso · Montando a prévia… · A prévia aparece com a Conexão com o Anki ligada. · Atualize a Conexão com o Anki para ver a prévia. · Não deu para montar a prévia. Tente de novo. · Tentar de novo · Mais estilos em Ajustes de envio | O Cartão de exemplo do estilo, desenhado pelo Anki (#164), em Ajustes de envio › Estilo do cartão e no passo do nível da Boas-vindas (ONB-20). Muda com o nível escolhido na tela, antes de salvar. Frente e Verso são as duas faces; o Verso traz a frente, como o Anki depois de “Mostrar resposta”. “Mais estilos…” só aparece na Boas-vindas e leva a Ajustes de envio. |
| ONB-20 | Passo do nível do cartão **(novo)** | status | (não existe) | Escolha o nível de cada idioma ligado. Ele decide o que o verso do cartão explica, e dá para mudar depois. · Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui; o nível também fica em Ajustes de envio. · Ligar a mineração automática · Não deu para salvar o nível. Tente de novo. | O passo 7 da Boas-vindas (#164), depois da mineração automática, que diz quais idiomas estão ligados. Cada idioma ligado traz o controle de BRG-42 e a prévia de BRG-43; escolher salva na hora, no mesmo lugar que Ajustes de envio › Estilo do cartão (`ankiBridgePresets`). O passo é opcional e está feito quando todo idioma ligado tem o nível salvo. A prévia traz o link “Mais estilos em Ajustes de envio”. |
