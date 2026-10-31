"""O pedido de um Envio (`POST /jobs`) e o id dele: o que vale, o que a Conexão guarda e a impressão do corpo (#142).

Mora à parte de `envio.py` (que o importa e reexporta estes nomes) para a fila e o trabalho ficarem num arquivo só deles.
"""

import hashlib
import json
import re

_ID_DO_ENVIO = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
IDIOMAS = ("en", "ru")
# A reserva da voz (#174): uma lista de nomes de provedor, sem tamanho de abuso; a Conexão pula o nome que não conhece.
_PROVEDOR_DA_VOZ = re.compile(r"^[a-z0-9_-]{1,32}$")
MAXIMO_DE_RESERVAS = 8


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


def validar_pedido(corpo):
    """O pedido de `POST /jobs` normalizado, ou (status, erro) se ele não serve. Frases com o mesmo `phraseId` valem uma vez (a primeira)."""
    if not id_valido(corpo.get("jobId")):
        return None, (400, "invalid_job_id")
    if corpo.get("lang") not in IDIOMAS:
        return None, (400, "invalid_lang")
    deck = corpo.get("deckName")
    if not isinstance(deck, str) or not deck.strip() or len(deck) > 256:
        return None, (400, "invalid_request")
    entradas = corpo.get("entries")
    if not isinstance(entradas, list) or not entradas:
        return None, (400, "entries_required")
    limpas, vistas = [], set()
    for entrada in entradas:
        frase = entrada.get("phraseId") if isinstance(entrada, dict) else None
        if type(frase) is not int or not isinstance(entrada.get("line"), str):
            return None, (400, "entries_required")
        if frase not in vistas:
            vistas.add(frase)
            limpas.append({"phraseId": frase, "line": entrada["line"]})
    tts = corpo.get("tts") if isinstance(corpo.get("tts"), dict) else {}
    reserva = tts.get("reserva")
    if "reserva" in tts and not (isinstance(reserva, list) and len(reserva) <= MAXIMO_DE_RESERVAS
                                 and all(isinstance(nome, str) and _PROVEDOR_DA_VOZ.match(nome) for nome in reserva)):
        return None, (400, "invalid_request")
    return {
        "jobId": corpo["jobId"],
        "lang": corpo["lang"],
        "deckName": deck.strip(),
        "imageSource": str(corpo.get("imageSource") or "1"),
        "tts": dict({chave: valor for chave, valor in tts.items() if isinstance(valor, str)},
                    **({"reserva": list(dict.fromkeys(reserva))} if "reserva" in tts else {})),
        "entries": limpas,
    }, None


def visao_do_pedido(pedido):
    """O pedido como as rotas o mostram: sem a impressão do corpo (ela é só da Conexão)."""
    return None if pedido is None else {chave: valor for chave, valor in pedido.items() if chave != "corpoSha256"}
