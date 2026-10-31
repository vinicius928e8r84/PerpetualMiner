"""As rotas do Envio (#142): criar e tentar de novo mudam a fila; as outras só leem. Tudo POST com a origem da extensão, listadas em
`servidor.ROTAS`. Usar a minha chave é o limite do plano (#158); `/analytics/jobs` é a aba Custos."""

import os

from . import custos, diagnostico, envio, limite_do_plano


def _criar_envio(conexao, corpo):
    return conexao.fila.criar(corpo)


def _listar_envios(conexao, corpo):
    return 200, {"jobs": conexao.fila.listar()}


def _com_o_envio(corpo, conexao, resposta):
    """Responde pelo Envio `jobId` do corpo: 400 se o id não é texto ou tem caractere de caminho, 404 se a Conexão não o tem
    (qualquer formato: só o criar exige um UUID)."""
    job_id = corpo.get("jobId")
    if not envio.id_que_serve_de_caminho(job_id):
        return 400, {"error": "invalid_job_id"}
    if conexao.fila.pedido(job_id) is None:
        return 404, {"error": "job_not_found"}
    return resposta(job_id)


def _ver_envio(conexao, corpo):
    return _com_o_envio(corpo, conexao, lambda job_id: (200, {"job": envio.visao_do_pedido(conexao.fila.pedido(job_id)), "state": conexao.fila.estado(job_id)}))


def _tentar_envio_de_novo(conexao, corpo):
    return _com_o_envio(corpo, conexao, conexao.fila.tentar_de_novo)


def _usar_a_chave_no_envio(conexao, corpo):
    """O limite do plano (#158): o que falta do Envio vai pela chave da OpenAI."""
    return _com_o_envio(corpo, conexao, lambda job_id: limite_do_plano.usar_a_chave(conexao.fila, conexao.cofre, job_id))


def _apagar_as_frases_dos_envios(conexao, corpo):
    """O Apagar tudo da extensão (CFG-17) tira também as Frases que a Conexão guarda: as linhas dos pedidos e os textos gerados."""
    conexao.fila.apagar_as_frases()
    return 200, {"ok": True}


def _pacote_de_diagnostico(conexao, corpo):
    log = os.path.join(conexao.dados.logs, "complemento.log")
    return _com_o_envio(corpo, conexao, lambda job_id: (200, diagnostico.pacote_de_diagnostico(conexao.fila, job_id, conexao.versao, log)))


def _custos_dos_envios(conexao, corpo):
    idioma = corpo.get("lang") if corpo.get("lang") in ("en", "ru") else "all"
    return 200, {"jobs": custos.linhas(conexao.fila, custos.dia(corpo.get("from")), custos.dia(corpo.get("to")), idioma)}


ROTAS_DO_ENVIO = {
    ("POST", "/jobs"): _criar_envio,
    ("POST", "/jobs/list"): _listar_envios,
    ("POST", "/jobs/get"): _ver_envio,
    ("POST", "/jobs/retry"): _tentar_envio_de_novo,
    ("POST", "/jobs/usar-a-chave"): _usar_a_chave_no_envio,
    ("POST", "/jobs/debug-bundle"): _pacote_de_diagnostico,
    ("POST", "/jobs/apagar-frases"): _apagar_as_frases_dos_envios,
    ("POST", "/analytics/jobs"): _custos_dos_envios,
}
