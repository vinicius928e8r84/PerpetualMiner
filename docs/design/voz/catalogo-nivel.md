# A Voz do passo do nível e da prévia do Cartão (#164)

Continuação do catálogo de [`README.md`](README.md) (§ 3): estas linhas são do mesmo catálogo e seguem as mesmas regras (V1–V10, C1–C9), mas moram aqui porque o
README não pode crescer (o limite de tamanho dos arquivos). `scripts/voz-da-spec.js` lê os dois arquivos como um só, e o texto de cada linha está em
[`lib/voz/catalogo-nivel.js`](../../../lib/voz/catalogo-nivel.js); `test_voz.js` confere os dois contra elas.

### Boas-vindas e Ajustes de envio: o nível e a prévia do Cartão

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| BRG-43 | A prévia do cartão **(novo)** | status | (não existe) | Prévia do cartão · Cartão de exemplo · Exemplo do Intermediário em inglês, como o Anki mostra. · Frente · Verso · Montando a prévia… · A prévia aparece com a Conexão com o Anki ligada. · Atualize a Conexão com o Anki para ver a prévia. · Não deu para montar a prévia. Tente de novo. · Tentar de novo · Mais estilos em Ajustes de envio | O Cartão de exemplo do estilo, desenhado pelo Anki (#164), em Ajustes de envio › Estilo do cartão e no passo do nível da Boas-vindas (ONB-20). Muda com o nível escolhido na tela, antes de salvar. Frente e Verso são as duas faces; o Verso traz a frente, como o Anki depois de “Mostrar resposta”. “Mais estilos…” só aparece na Boas-vindas e leva a Ajustes de envio. |
| ONB-20 | Passo do nível do cartão **(novo)** | status | (não existe) | Escolha o nível de cada idioma ligado. Ele decide o que o verso do cartão explica, e dá para mudar depois. · Nenhum idioma está ligado. Ligue a mineração automática em um idioma para escolher o nível dele aqui; o nível também fica em Ajustes de envio. · Ligar a mineração automática · Não deu para salvar o nível. Tente de novo. | O passo 7 da Boas-vindas (#164), depois da mineração automática, que diz quais idiomas estão ligados. Cada idioma ligado traz o controle de BRG-42 e a prévia de BRG-43; escolher salva na hora, no mesmo lugar que Ajustes de envio › Estilo do cartão (`ankiBridgePresets`). O passo é opcional e está feito quando todo idioma ligado tem o nível salvo. A prévia traz o link “Mais estilos em Ajustes de envio”. |

### Ajustes de envio: a frente do cartão (#166)

| ID | Estado | Categoria | Hoje | Cópia aprovada | Nota |
|---|---|---|---|---|---|
| BRG-44 | Ajustes de envio: a frente do cartão **(novo)** | status | (não existe) | Frente · Frase com áudio · Ouvir primeiro · Lacuna · Produção · Ditado · A frase e o áudio na frente · Só o botão de tocar na frente: ouça antes de ler · A frase sem a palavra, com uma dica e sem áudio · A frase em português na frente: escreva no idioma e o Anki compara · Só o botão de tocar e um campo: escreva o que ouviu e o Anki mostra o que errou · Todos os cartões em {idioma} mudam na hora, sem custo · Os outros ajustes foram salvos, mas a frente não mudou: {motivo}. · a Conexão com o Anki está desligada · o Anki não está pronto (sem perfil aberto, em outro perfil ou sincronizando) · o tipo de nota em {idioma} foi alterado no Anki e a Conexão não mexe nele · a Conexão não conseguiu trocá-la · Tentar de novo | Nos Ajustes de envio, depois do Estilo do cartão (BRG-42). A Frente é por idioma e troca o modelo de Cartão na hora, sem custo; imagem primeiro não entra; Produção e Ditado usam o campo de digitação do Anki (#167). O aviso de falha diz que o resto foi salvo e só a frente não mudou; `{motivo}` é um dos quatro textos seguintes. |
