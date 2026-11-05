"""A entrada de `POST /anki/card-preview` (#164) na matriz de rotas de `test_servidor.MATRIZ`: o que a rota faz em cada estado do Anki.

A prévia lê a coleção (o Anki desenha o Cartão) e não grava nota; cria só o tipo de nota do idioma, se falta, e essa primeira gravação marca o
perfil aberto (o perfil fixo, como o Envio): por isso `muda`. Também guarda a de `POST /voz/falar` (#170), que não lê a coleção nem o perfil e
não guarda nada: o `test_servidor.py` não pode crescer. Não é teste: fica fora do `.ankiaddon` pelo nome.
"""

MATRIZ_DA_PREVIA = {
    ("POST", "/anki/card-preview"): {
        "corpo": {"lang": "en", "nivel": "iniciante"}, "muda": True, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_request"), ({"lang": "fr"}, 400, "invalid_lang"), ({"lang": "ru", "nivel": "mestre"}, 400, "invalid_level")],
    },
    ("POST", "/voz/falar"): {
        "corpo": {"lang": "en", "sotaque": "com", "texto": "Could you tell me where the nearest pharmacy is?"},
        "le_a_colecao": False, "le_o_perfil": False, "recusas": [({}, 400, "invalid_request")],
    },
}
