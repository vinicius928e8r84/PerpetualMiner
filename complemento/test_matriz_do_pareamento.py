"""As rotas do pareamento (#192) e a pergunta do abridor (`/anki/responde`, a outra rota sem assinatura) na matriz de rotas de `test_servidor.MATRIZ`: o que cada uma faz em cada estado do Anki.

Nenhuma lê a coleção nem o perfil. `concluir` grava o navegador pareado (`user_files/pareamento.json`: `muda`); `comecar` e `conferir` não guardam
nada. Não é teste: fica fora do `.ankiaddon` pelo nome, e o `test_servidor.py` não pode crescer.
"""

from complemento.test_pareamento_de_mentira import CLIENTE

SEM_LEITURA = {"le_a_colecao": False, "le_o_perfil": False}
MATRIZ_DO_PAREAMENTO = {
    ("POST", "/anki/responde"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/pareamento/comecar"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/pareamento/concluir"): {
        "corpo": {}, "status": 400, "muda": True, **SEM_LEITURA,
        "recusas": [({"codigo": "K7M-4PX"}, 400, "invalid_request"), ({"codigo": "K7M-4PX", "cliente": "nao-e-um-uuid"}, 400, "invalid_request"),
                    ({"codigo": "K7M-4PX", "cliente": CLIENTE, "nome": 7}, 400, "invalid_request")],
    },
    ("POST", "/pareamento/conferir"): {
        "corpo": {}, "status": 400, **SEM_LEITURA, "recusas": [({"cliente": CLIENTE}, 400, "invalid_request"), ({"cliente": CLIENTE, "desafio": "curto"}, 400, "invalid_request")],
    },
}
