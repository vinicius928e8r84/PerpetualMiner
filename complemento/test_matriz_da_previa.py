MATRIZ_DA_PREVIA = {
    ("POST", "/anki/card-preview"): {
        "corpo": {"lang": "en", "nivel": "iniciante"}, "muda": True, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_request"), ({"lang": "fr"}, 400, "invalid_lang"), ({"lang": "ru", "nivel": "mestre"}, 400, "invalid_level"),
                    ({"lang": "en", "tipoProprio": "Meu Inglês"}, 400, "invalid_mapping")],
    },
    ("POST", "/anki/note-types"): {"corpo": {}, "muda": True, "le_a_colecao": True, "le_o_perfil": False, "recusas": []},
    ("POST", "/voz/falar"): {
        "corpo": {"lang": "en", "sotaque": "com", "texto": "Could you tell me where the nearest pharmacy is?"},
        "le_a_colecao": False, "le_o_perfil": False, "recusas": [({}, 400, "invalid_request")],
    },
    ("POST", "/anki/browse"): {
        "corpo": {"guid": "guid-do-primeiro"}, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_request"), ({"guid": ""}, 400, "invalid_request"), ({"guid": 7}, 400, "invalid_request")],
    },
}
