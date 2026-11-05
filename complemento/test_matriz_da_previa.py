"""As entradas de `POST /anki/card-preview` (#164), `POST /anki/note-types` (#165) e `POST /anki/browse` (o Abrir no Anki, #173) na matriz de rotas de `test_servidor.MATRIZ`: o que a rota faz em cada estado do Anki.

A prévia lê a coleção (o Anki desenha o Cartão) e não grava nota; cria só o tipo de nota do idioma, se falta, e essa primeira gravação marca o
perfil aberto (o perfil fixo, como o Envio): por isso `muda`. O Abrir no Anki lê a coleção (acha a nota pelo `guid`) e não grava nada. Não é teste: fica fora do `.ankiaddon` pelo nome.
"""

MATRIZ_DA_PREVIA = {
    ("POST", "/anki/card-preview"): {
        "corpo": {"lang": "en", "nivel": "iniciante"}, "muda": True, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_request"), ({"lang": "fr"}, 400, "invalid_lang"), ({"lang": "ru", "nivel": "mestre"}, 400, "invalid_level"),
                    ({"lang": "en", "tipoProprio": "Meu Inglês"}, 400, "invalid_mapping")],
    },
    # Os tipos de nota da pessoa (#165): só lê a coleção, nada é criado; a leitura marca o perfil aberto como a da prévia (`muda`).
    ("POST", "/anki/note-types"): {"corpo": {}, "muda": True, "le_a_colecao": True, "le_o_perfil": False, "recusas": []},
    ("POST", "/anki/browse"): {
        "corpo": {"guid": "guid-do-primeiro"}, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_request"), ({"guid": ""}, 400, "invalid_request"), ({"guid": 7}, 400, "invalid_request")],
    },
}
