# A prévia do Cartão (#164)

`POST /anki/card-preview` (POST com a origem da extensão, como toda rota que lê a coleção). Os exemplos estão em `exemplos-da-previa.json`. O Cartão é desenhado pelo Anki (o renderizador dele, com o modelo de Cartão do tipo de nota que a coleção tem); a Conexão só escolhe os campos.

| Corpo | Resposta |
|---|---|
| `{ lang, nivel? }`: o Cartão de exemplo do estilo (idioma × nível; sem `nivel`, o Iniciante). O exemplo é o texto de Cartão do `engine/estilos.json`, passado pela mesma `campos_da_nota` do Envio | `200 { source: "example", lang, nivel, deck, noteType, front, back, css }` |
| `{ guid }`: o Cartão de uma nota gravada (o primeiro Cartão do Envio, #173) | `200 { source: "note", deck, noteType, front, back, css }` |

- `front` e `back` são o HTML do Cartão como o Anki o escreve (`back` leva a frente em cima, como o Anki depois de “Mostrar resposta”), `css` é o do tipo de nota. A extensão o mostra num quadro isolado, sem scripts: o **áudio** vem como `<span class="pm-tocar">▶</span>` (a página não toca o áudio do Anki) e a **imagem** vem dentro do HTML (`data:`, até 2 MB; sem o arquivo, um espaço de imagem), porque a página não alcança a pasta de mídia.
- Nada é gravado, salvo o tipo de nota do idioma, que a Conexão cria se a coleção ainda não o tem (o que o Envio faria; a primeira gravação marca o perfil aberto como o fixo). Um tipo de nota que a coleção já tinha é o que o Anki desenha: um criado antes do #162 mostra o verso que ele de fato tem.
- `400`: `invalid_lang`, `invalid_level` (o idioma não tem o nível), `invalid_request` (nem `lang` nem `guid`, ou os dois). `404`: `note_not_found` (`guid` que a coleção não tem), `note_type_missing`. `503 anki_card_preview_unavailable` (sem coleção aberta, outro perfil aberto, Anki sem responder). Uma Conexão anterior à rota responde `404 not_found`: a extensão diz para atualizá-la.
- Só o pedido do exemplo (`previaDoCartao(lang, nivel)`) é da extensão hoje; o da nota gravada tem exemplo mas `daExtensao: false` até o #173.
