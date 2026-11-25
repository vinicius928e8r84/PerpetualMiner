import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_atualizacao import MATRIZ_DA_ATUALIZACAO
from complemento.test_matriz_da_previa import MATRIZ_DA_PREVIA
from complemento.test_matriz_do_pareamento import MATRIZ_DO_PAREAMENTO


SEM_LEITURA = {"le_a_colecao": False, "le_o_perfil": False}
MATRIZ = {
    ('POST', '/ia/openai/sincronizar'): {
        'corpo': {'uid': 'uid-teste', 'token': 'token-ficticio', 'versao': 1}, 'muda': True, 'versao': True,
        **SEM_LEITURA, 'recusas': [({}, 400, 'invalid_request')],
    },
    ('POST', '/ia/openai/legado'): {
        'corpo': {'chave': '', 'conta': 'uid-teste', 'em': 100, 'versao': 0}, 'muda': True, 'versao': True,
        **SEM_LEITURA, 'recusas': [({}, 400, 'invalid_request')],
        'status': 409,
    },
    ("GET", "/health"): {"corpo": None, "le_a_colecao": False, "le_o_perfil": True, "recusas": []},
    ("POST", "/anki/decks"): {"corpo": {}, "le_a_colecao": True, "le_o_perfil": False, "recusas": []},
    ("POST", "/anki/stats/decks"): {
        "corpo": {"decks": [{"deckName": "Inglês", "lang": "en"}]},
        "le_a_colecao": True,
        "le_o_perfil": False,
        "recusas": [
            ({}, 400, "decks_required"), ({"decks": []}, 400, "decks_required"), ({"decks": ["Inglês"]}, 400, "decks_required"),
            ({"decks": {"deckName": "Inglês", "lang": "en"}}, 400, "decks_required"),
        ],
    },
    ("POST", "/ia/estado"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/ia/chatgpt/estado"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/ia/chatgpt/entrar"): {"corpo": {}, "muda": True, **SEM_LEITURA, "recusas": []},
    ("POST", "/ia/chatgpt/sair"): {"corpo": {}, "muda": True, **SEM_LEITURA, "recusas": []},
    ("POST", "/custos/teto"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/custos/teto/definir"): {
        "corpo": {"limitUsd": 10}, "muda": True, **SEM_LEITURA, "recusas": [({}, 400, "invalid_request"), ({"limitUsd": 0}, 400, "invalid_request")],
    },
    ("POST", "/ia/modelo/estado"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/ia/modelo/escolher"): {
        "corpo": {"modelo": "automatico"}, "muda": True, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_request"), ({"modelo": "gpt-4o"}, 404, "model_not_found")],
    },
    ("POST", "/ia/openai/chave/apagar"): {
        "corpo": {}, **SEM_LEITURA, "recusas": [], "muda": True, "versao": True,
        "muda_de_novo": "apagar de novo na base atual avança a revisão e a hora: `Cofre.reentrega` só reconhece a repetição de uma chave não vazia",
    },
    ("POST", "/ia/openai/chave"): {
        "corpo": {},
        "status": 400,
        "muda": True,
        "versao": True,
        "le_a_colecao": False,
        "le_o_perfil": False,
        "recusas": [({"chave": "x"}, 401, "openai_key_rejected")],
    },
    ("POST", "/abrir-com-o-computador/estado"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/abrir-com-o-computador"): {
        "corpo": {"ligado": True},
        "muda": True,
        "le_a_colecao": False,
        "le_o_perfil": False,
        "recusas": [({"ligado": "sim"}, 400, "invalid_request")],
    },
    ("POST", "/anki/profiles"): {"corpo": {}, "muda": True, "le_a_colecao": False, "le_o_perfil": True, "recusas": []},
    ("POST", "/anki/profile"): {
        "corpo": {"profile": "Usuário 1"}, "muda": True, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_request"), ({"profile": "Carla"}, 404, "profile_not_found")],
    },
    ("POST", "/anki/profile/open"): {"corpo": {}, "abre_perfil": True, **SEM_LEITURA, "recusas": []},
    ("POST", "/anki/vocabulary"): {
        "corpo": {"deck": "Inglês", "lang": "en"},
        "le_a_colecao": True,
        "le_o_perfil": False,
        "recusas": [({"lang": "en"}, 400, "deck_required"), ({"deck": "Inglês", "lang": "fr"}, 400, "invalid_lang")],
    },
    ("POST", "/jobs"): {
        "corpo": {"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": "Inglês", "entries": [{"phraseId": 1, "line": "give up : She gave up smoking"}]},
        "status": 201, "muda": True, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_job_id"), ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "de"}, 400, "invalid_lang"),
                    ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": ""}, 400, "invalid_request"),
                    ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": "Inglês", "entries": []}, 400, "entries_required")],
    },
    ("POST", "/jobs/list"): {"corpo": {}, **SEM_LEITURA, "recusas": []},
    ("POST", "/jobs/get"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/jobs/retry"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, "muda": True, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/jobs/usar-a-chave"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, "muda": True, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/jobs/apagar-frases"): {"corpo": {}, "muda": True, **SEM_LEITURA, "recusas": []},
    ("POST", "/jobs/debug-bundle"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, **SEM_LEITURA,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/analytics/jobs"): {"corpo": {"lang": "all"}, **SEM_LEITURA, "recusas": []},
    ("POST", "/anki/card-front"): {
        "corpo": {"lang": "en", "frente": "lacuna"}, "muda": True, "le_a_colecao": True, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_lang"), ({"lang": "en"}, 400, "invalid_front"), ({"lang": "en", "frente": "imagem_primeiro"}, 400, "invalid_front")],
    },
    ("POST", "/voz/ouvir"): {"corpo": {"lang": "en", "provedor": "google", "sotaque": "com"}, **SEM_LEITURA, "recusas": [({}, 400, "invalid_request")]},
}

MATRIZ.update(MATRIZ_DO_PAREAMENTO)
MATRIZ.update(MATRIZ_DA_PREVIA)
MATRIZ.update(MATRIZ_DA_ATUALIZACAO)
