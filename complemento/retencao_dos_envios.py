"""A retenção dos Envios terminados (#243): passado o prazo, a Conexão apaga a fila e o estado de um Envio e **guarda os custos**.

Um Envio é apagado quando o estado dele diz que terminou (`completed`, `partial` ou `failed`, no fim de verdade: sem `waiting`, com a etapa igual ao
status) e a última atividade (`updatedAt`) tem `PRAZO_EM_DIAS` dias ou mais. Na dúvida, fica: estado que não se lê, status que não é de fim,
`updatedAt` que não é um instante ou está no futuro, e texto já pago que ainda não chegou ao Anki (`estado/<jobId>/*.txt`: o Tentar de novo o usaria).
Em andamento, na fila, pausado e esperando o Anki, o plano ou o teto nunca saem: o status deles não é de fim.

Sai, nesta ordem (morrer no meio deixa só o que a próxima rodada termina: ela acha o Envio pela fila, pelos pedidos soltos em `fila/` e pelos estados soltos em
`estado/`; o estado é o último porque, sem ele, o pedido refaria um Envio `queued`): a entrada em `fila/fila.json`, o pedido `fila/<jobId>.json`,
a pasta `estado/<jobId>/` e o estado `estado/<jobId>.json`. Se `estado/<jobId>` é um link para outra pasta (link simbólico ou junção do Windows), só o link sai e a pasta de destino nunca é lida nem apagada; a conferência é
pelo caminho real, que vale em qualquer Python (`os.path.islink` não vê a junção). Uma subpasta de verdade dentro de `estado/<jobId>/` o Envio não sabe apagar:
ele fica, com um aviso no registro a cada rodada, e a retenção nunca termina de sair com ele.
**Nunca** apaga nem reescreve `custos/<jobId>/costs.jsonl`: a aba Custos continua somando o que somava. Como a linha dela vem do pedido e do estado, antes de
apagar a retenção grava em `custos/<jobId>/ficha.json` o que a linha diz fora os custos (`custos.ficha_do_envio`: idioma, baralho, status, contagens; nunca a Palavra nem a Frase),
e `Fila.envios_dos_custos` junta esses Envios à fila para a aba Custos e o teto do mês. Quem pede a rodada é a thread de trabalho (`trabalhador.py`), ao subir e a cada 6 h.

Um erro de disco num Envio vai ao registro (só o id e o tipo do erro, nunca o pedido) e a rodada segue nos outros; nada aqui levanta erro.
"""

import os
from datetime import datetime, timedelta

from .custos import ficha_do_envio
from .gravacao_de_json import apagar, gravar_json
from .pedido_do_envio import id_que_serve_de_caminho, id_valido

PRAZO_EM_DIAS = 30
FIM = ("completed", "partial", "failed")


def _instante(valor):
    """O instante ISO 8601 do `updatedAt` (sem fuso, o do computador), ou None."""
    try:
        quando = datetime.fromisoformat(valor)
    except (TypeError, ValueError):
        return None
    return quando if quando.tzinfo else quando.astimezone()


def _json_soltos(pasta):
    """Os `<jobId>.json` que são arquivos de verdade em `pasta` (sem seguir link), na ordem."""
    if not os.path.isdir(pasta):
        return []
    soltos = []
    for nome in sorted(os.listdir(pasta)):
        caminho = os.path.join(pasta, nome)
        if nome.endswith(".json") and id_valido(nome[:-5]) and os.path.isfile(caminho) and not os.path.islink(caminho):
            soltos.append(nome[:-5])
    return soltos


def _ids(fila):
    """Os Envios da fila, os pedidos soltos em `fila/` e os estados soltos em `estado/` (a rodada que morreu no meio deixa um deles)."""
    ids = [item.get("jobId") for item in fila.ordem() if isinstance(item, dict)]
    ids += _json_soltos(fila.dados.fila) + _json_soltos(fila.dados.estado)
    return [job_id for index, job_id in enumerate(ids) if id_que_serve_de_caminho(job_id) and job_id not in ids[:index]]


def _e_link(fila, job_id):
    """Se `estado/<jobId>` leva para outro lugar (link simbólico ou junção): o caminho real não é o da pasta dentro de `estado/`."""
    pasta = os.path.realpath(fila.pasta_dos_textos(job_id))
    return os.path.normcase(pasta) != os.path.normcase(os.path.join(os.path.realpath(fila.dados.estado), job_id))


def _texto_pago(fila, job_id):
    pasta = fila.pasta_dos_textos(job_id)
    return os.path.isdir(pasta) and not _e_link(fila, job_id) and any(nome.endswith(".txt") for nome in os.listdir(pasta))


def venceu(fila, job_id, agora):
    """Se o Envio terminou há `PRAZO_EM_DIAS` dias ou mais e nada nele ainda vale; na dúvida, False."""
    estado = fila.estado(job_id)
    status = estado.get("status")
    if status not in FIM or estado.get("stage") != status or estado.get("waiting"):
        return False
    ultima = _instante(estado.get("updatedAt"))
    if ultima is None or agora - ultima < timedelta(days=PRAZO_EM_DIAS):
        return False
    if fila.pedido(job_id) is None and fila.ficha(job_id) is None:
        return False  # sem o pedido nem a ficha, nada diz como a aba Custos descreve o Envio
    return not _texto_pago(fila, job_id)


def _tirar_o_link(caminho):
    """Tira só a entrada: `os.remove` para o link simbólico, `os.rmdir` para a junção do Windows (que ele não tira); nenhum dos dois entra no destino."""
    try:
        os.remove(caminho)
    except FileNotFoundError:
        pass
    except OSError:
        os.rmdir(caminho)


def _apagar_o_envio(fila, job_id):
    pedido = fila.pedido(job_id)
    if pedido is not None:  # sem ele (a rodada que morreu depois do pedido), a ficha que já está é a boa
        gravar_json(fila.arquivo_da_ficha(job_id), ficha_do_envio(fila.item_da_fila(job_id) or {}, pedido, fila.estado(job_id)))  # antes de tudo
    ordem = fila.ordem()
    if any(item.get("jobId") == job_id for item in ordem if isinstance(item, dict)):
        gravar_json(fila._arquivo_da_fila(), {"jobs": [item for item in ordem if not (isinstance(item, dict) and item.get("jobId") == job_id)]})
    apagar(fila._arquivo_do_pedido(job_id))
    pasta = fila.pasta_dos_textos(job_id)
    if _e_link(fila, job_id):
        _tirar_o_link(pasta)  # só o link: o que ele aponta pode estar fora do `user_files`
    elif os.path.isdir(pasta):
        for nome in sorted(os.listdir(pasta)):
            apagar(os.path.join(pasta, nome))
        os.rmdir(pasta)
    apagar(fila._arquivo_do_estado(job_id))


def reter(fila, agora=None):
    """Uma rodada: apaga os Envios que venceram e devolve os ids, na ordem. Repetida logo depois, não acha nada."""
    agora = agora or datetime.now().astimezone()
    apagados = []
    try:
        with fila.tranca:
            candidatos = _ids(fila)
    except Exception as erro:
        _registrar(fila, "warning", "a rodada não leu a fila (%s)", type(erro).__name__)
        return apagados
    for job_id in candidatos:
        try:
            with fila.tranca:  # confere de novo sob a tranca: um Tentar de novo que chegou no meio ganha
                if not venceu(fila, job_id, agora):
                    continue
                _apagar_o_envio(fila, job_id)
            apagados.append(job_id)
            _registrar(fila, "info", "Envio %s: apagado pela retenção (terminado há %d dias ou mais); os custos ficam", job_id, PRAZO_EM_DIAS)
        except Exception as erro:
            _registrar(fila, "warning", "Envio %s: a retenção não conseguiu apagar (%s); tenta de novo na próxima rodada", job_id, type(erro).__name__)
    return apagados


def _registrar(fila, nivel, mensagem, *argumentos):
    if fila.logger:
        getattr(fila.logger, nivel)("Retenção: " + mensagem, *argumentos)
