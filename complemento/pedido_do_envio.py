"""O pedido de um Envio (`POST /jobs`) e o id dele: o que vale, o que a Conexão guarda e a impressão do corpo (#142).

Mora à parte de `envio.py` (que o importa e reexporta estes nomes) para a fila e o trabalho ficarem num arquivo só deles.
"""

import hashlib
import json
import re

from . import tipo_proprio
from .motor import estilos

_ID_DO_ENVIO = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_PROVEDOR_DA_VOZ = re.compile(r"^[a-z0-9_-]{1,32}$")
MAXIMO_DE_RESERVAS = 8
MAXIMO_DE_FRASES = 500
ETIQUETA_DE_TESTE = "perpetualminer-teste"


def id_valido(job_id):
    return isinstance(job_id, str) and bool(_ID_DO_ENVIO.match(job_id))


def id_que_serve_de_caminho(job_id):
    """Um id que as rotas de achar aceitam: texto, sem barra nem `..` (um id fora de UUID só dá 404)."""
    return isinstance(job_id, str) and bool(job_id) and "/" not in job_id and "\\" not in job_id and ".." not in job_id and "\x00" not in job_id


def _canonico(dados):
    return json.dumps(dados, ensure_ascii=False, sort_keys=True)


def impressao(pedido):
    """O SHA-256 do JSON canônico do corpo do `POST /jobs` já normalizado (`validar_pedido`): gravado no criar, nunca mudado."""
    return hashlib.sha256(_canonico(pedido).encode("utf-8")).hexdigest()


def ids_unicos(valores):
    vistos, ids = set(), []
    for valor in valores or []:
        try:
            numero = int(valor)
        except (TypeError, ValueError):
            continue
        if numero not in vistos:
            vistos.add(numero)
            ids.append(numero)
    return ids


def _sem_id_de_envio(corpo):
    return not id_valido(corpo.get("jobId"))


def _idioma_que_a_conexao_nao_tem(corpo):
    return corpo.get("lang") not in estilos.idiomas()


def _baralho_sem_nome_que_sirva(corpo):
    deck = corpo.get("deckName")
    return not isinstance(deck, str) or not deck.strip() or len(deck) > 256


def _nivel_que_o_idioma_nao_tem(corpo):
    return "nivel" in corpo and corpo["nivel"] not in estilos.niveis(corpo["lang"])


def _teste_que_nao_e_sim_nem_nao(corpo):
    return "teste" in corpo and type(corpo["teste"]) is not bool


def _tipo_proprio_pedido(corpo):
    return tipo_proprio.forma(corpo["tipoProprio"]) if "tipoProprio" in corpo else None


def _mapeamento_que_nao_serve(corpo):
    if "tipoProprio" not in corpo:
        return False
    proprio = _tipo_proprio_pedido(corpo)
    return proprio is None or bool(tipo_proprio.recusa(proprio, set(proprio["mapa"].values())))


def _sem_frases(corpo):
    entradas = corpo.get("entries")
    return not isinstance(entradas, list) or not entradas


def _frases_demais(corpo):
    return len(corpo["entries"]) > MAXIMO_DE_FRASES


def _frase_da_entrada(entrada):
    frase = entrada.get("phraseId") if isinstance(entrada, dict) else None
    if type(frase) is not int or not isinstance(entrada.get("line"), str):
        return None
    return {"phraseId": frase, "line": entrada["line"]}


def _entrada_que_nao_serve(corpo):
    return any(_frase_da_entrada(entrada) is None for entrada in corpo["entries"])


def _voz_pedida(corpo):
    tts = corpo.get("tts")
    return tts if isinstance(tts, dict) else {}


def _provedor_de_voz(nome):
    return isinstance(nome, str) and bool(_PROVEDOR_DA_VOZ.match(nome))


def _reserva_que_serve(reserva):
    return isinstance(reserva, list) and len(reserva) <= MAXIMO_DE_RESERVAS and all(map(_provedor_de_voz, reserva))


def _reserva_que_nao_serve(corpo):
    tts = _voz_pedida(corpo)
    return "reserva" in tts and not _reserva_que_serve(tts["reserva"])


_RECUSAS = (
    (_sem_id_de_envio, (400, "invalid_job_id")),
    (_idioma_que_a_conexao_nao_tem, (400, "invalid_lang")),
    (_baralho_sem_nome_que_sirva, (400, "invalid_request")),
    (_nivel_que_o_idioma_nao_tem, (400, "invalid_level")),
    (_teste_que_nao_e_sim_nem_nao, (400, "invalid_request")),
    (_mapeamento_que_nao_serve, (400, "invalid_mapping")),
    (_sem_frases, (400, "entries_required")),
    (_frases_demais, (413, "too_many_entries")),
    (_entrada_que_nao_serve, (400, "entries_required")),
    (_reserva_que_nao_serve, (400, "invalid_request")),
)


def _recusa_do_pedido(corpo):
    return next((recusa for recusa_quando, recusa in _RECUSAS if recusa_quando(corpo)), None)


def _frases_sem_repetir(entradas):
    primeiras = {}
    for frase in map(_frase_da_entrada, entradas):
        primeiras.setdefault(frase["phraseId"], frase)
    return list(primeiras.values())


def _voz_guardada(corpo):
    tts = _voz_pedida(corpo)
    guardada = {chave: valor for chave, valor in tts.items() if isinstance(valor, str)}
    if "reserva" in tts:
        guardada["reserva"] = list(dict.fromkeys(tts["reserva"]))
    return guardada


def _pedido_normalizado(corpo):
    proprio = _tipo_proprio_pedido(corpo)
    return {
        "jobId": corpo["jobId"],
        "lang": corpo["lang"],
        "deckName": corpo["deckName"].strip(),
        "imageSource": str(corpo.get("imageSource") or "1"),
        **({"nivel": corpo["nivel"]} if "nivel" in corpo else {}),
        **({"tipoProprio": proprio} if proprio else {}),
        **({"teste": True} if corpo.get("teste") else {}),
        "tts": _voz_guardada(corpo),
        "entries": _frases_sem_repetir(corpo["entries"]),
    }


def validar_pedido(corpo):
    """O pedido de `POST /jobs` normalizado, ou (status, erro) se ele não serve. Frases com o mesmo `phraseId` valem uma vez (a primeira)."""
    recusa = _recusa_do_pedido(corpo)
    if recusa:
        return None, recusa
    return _pedido_normalizado(corpo), None


def visao_do_pedido(pedido):
    """O pedido como as rotas o mostram: sem a impressão do corpo (ela é só da Conexão)."""
    return None if pedido is None else {chave: valor for chave, valor in pedido.items() if chave != "corpoSha256"}
