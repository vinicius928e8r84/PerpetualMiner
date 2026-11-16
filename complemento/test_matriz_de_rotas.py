"""A matriz de rotas do servidor: o que cada rota faz em cada estado do Anki (apoio de `test_servidor_estados.py` e `test_servidor_repeticao.py`).

Não é teste: fica fora do `.ankiaddon` pelo nome.

Cada rota do servidor, declarada à parte dos exemplos, para a matriz de estados pedir a rota de verdade:
  corpo         o corpo mínimo que ela aceita (None: sem corpo);
  status        o que ela responde a esse corpo com o Anki saudável (200 se não disser);
  le_a_colecao  lê a coleção: se quebra responde 500, sem coleção aberta responde 503;
  le_o_perfil   lê o perfil aberto: ilegível, responde 500;
  recusas       cada validação do pedido: (corpo, status, `error`), com a coleção aberta;
  abre_perfil   a rota abre um perfil no Anki (de uma tela de perfis passa a haver coleção): a matriz a pede por último;
  muda          a rota muda o que a Conexão guarda (a chave, o item de login): `RepeticaoDeCadaRotaQueMuda` a pede de novo e com a base velha;
  versao        o corpo traz a base (`versao`) do que ela muda: a base velha tem que dar 409, sem mudar nada;
  muda_de_novo  o motivo (texto) de pedir de novo com a base atual poder mudar o que fica guardado de propósito.
Uma rota nova entra aqui dizendo o que faz; uma que não lê a coleção nem o perfil responde o mesmo `status` sempre.
`SEM_LEITURA`: as rotas que não leem a coleção nem o perfil.

Notas de cada rota:
A chave da IA (PR 191): não lê a coleção nem o perfil; sem a `chave` no corpo mínimo, recusa em todo estado.
Entrar com o ChatGPT (#155): entrar cria o id deste computador; sair apaga o arquivo do login.
O teto do mês (#160): lê só os custos e o arquivo dele; um valor que não é positivo é recusado.
O modelo dos cartões (#157): lê a OpenAI (a lista da conta), nunca a coleção nem o perfil.
Apagar a cópia da chave (#154): apagar o que não existe também é 200.
`Cofre.reentrega` só reconhece como repetição na base atual uma chave não vazia (`chave and moderna`, d6b9289).
O item de login de “Abrir o Anki com o computador” (PR 189): não lê a coleção nem o perfil.
O perfil fixo (#149): a lista lê o gerente de perfis (responde sem coleção) e o perfil aberto; a primeira com um perfil aberto o marca.
O Envio (#142): a fila é da Conexão, não da coleção nem do perfil. Criar e tentar de novo mudam a fila; repetidos, respondem igual
e não gravam nada (o `jobId` é a chave).
Usar a minha chave (#158) marca o Envio; repetido, nada mais muda.
A frente do Cartão (#166): reescreve o modelo do tipo de nota na coleção. A pasta de dados só muda na primeira gravação com um perfil aberto,
que o marca (`perfil.json`, como o Envio); repetida, nada mais muda.
O Ouvir dos Ajustes de envio (#174): fala uma frase de amostra, não lê a coleção nem o perfil e não guarda nada.
MATRIZ.update: o pareamento (#192)
MATRIZ.update: a prévia do Cartão (#164): em arquivo à parte, para este seguir abaixo do limite de tamanho
MATRIZ.update: a atualização pelo AnkiWeb (#177), também
A atualização (`/atualizacao/agora`, em `test_atualizacao.py`): não lê a coleção nem o perfil; sem o Anki dentro, "Atualizar agora" não tem de onde atualizar e "Reiniciar" não é entregue.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_atualizacao import MATRIZ_DA_ATUALIZACAO  # noqa: E402
from complemento.test_matriz_da_previa import MATRIZ_DA_PREVIA  # noqa: E402
from complemento.test_matriz_do_pareamento import MATRIZ_DO_PAREAMENTO  # noqa: E402


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
        "recusas": [({}, 400, "decks_required")],
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
