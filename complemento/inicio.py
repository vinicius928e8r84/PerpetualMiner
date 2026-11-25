from . import do_computador, pasta_de_dados, registro, tipo_de_nota
from .baralhos import ColecaoIndisponivel
from .configuracao import ATUALIZACAO_AUTOMATICA, PORTA, VERSAO
from .do_computador import ABRIDOR_DESTE_COMPUTADOR, PASSAGEM_DESTE_COMPUTADOR
from .esperas import Esperas
from .montagem_da_conexao import Ambiente, Fronteiras, Porta, montar
from .servicos_de_fora import ServicosDeFora
from .servidor import Conexao


def iniciar(
    pasta_do_complemento,
    perfil_aberto,
    *,
    porta=PORTA,
    colecao=None,
    item_de_login=None,
    servicos=ServicosDeFora(),
    esperas=None,
    abridor=ABRIDOR_DESTE_COMPUTADOR,
    ao_abrir_o_perfil=None,
    passagem=PASSAGEM_DESTE_COMPUTADOR,
    anki_web=None,
    atualizacao_automatica=ATUALIZACAO_AUTOMATICA,
):
    logger = registro.silencioso()
    try:
        dados = pasta_de_dados.preparar(pasta_do_complemento)
        logger = registro.criar(dados.logs)
        ambiente = Ambiente(dados, logger, VERSAO)
        fronteiras = Fronteiras(
            colecao=colecao, item_de_login=do_computador.item_de_login(item_de_login),
            atualizacao=do_computador.atualizacao(dados, anki_web, atualizacao_automatica, ambiente))
        conexao = Conexao(Porta(porta), montar(ambiente, servicos, esperas or Esperas(), fronteiras), perfil_aberto)
        _cuidar_do_perfil(conexao, do_computador.abridor(abridor, pasta_do_complemento, dados), ao_abrir_o_perfil, logger)
        return _subir(conexao, do_computador.passagem(passagem, porta))
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None


def _subir(conexao, passagem):
    if passagem is not None and passagem.pendente(conexao):
        conexao.iniciar_depois(lambda cancelado: passagem.fazer(conexao, cancelado))
    elif not conexao.iniciar():
        return None
    conexao.atualizacao.iniciar()
    return conexao


def _preparar_a_colecao(conexao, logger):
    try:
        feito = tipo_de_nota.preparar(conexao.colecao)
    except ColecaoIndisponivel:
        return
    except Exception:
        logger.exception("A coleção não foi preparada")
        return
    if any(feito["tipos"].values()) or feito["baralhos"]:
        logger.info("A coleção foi preparada: tipos de nota criados %s, Baralhos criados %s", sorted(l for l, c in feito["tipos"].items() if c), feito["baralhos"])


def _atualizar_o_item_de_login(item, logger):
    if item is None:
        return
    try:
        if item.reescrever_se_difere():
            logger.info("O item de login de “Abrir o Anki com o computador” foi reescrito: %s", item.caminho)
    except Exception as erro:
        logger.warning("O item de login não foi conferido: %s", erro)


def _cuidar_do_perfil(conexao, abridor, ao_abrir_o_perfil, logger):
    def reagir():
        _atualizar_o_item_de_login(conexao.item_de_login, logger)
        try:
            marcado = conexao.perfil_fixo.marcar_se_falta(conexao.perfil_aberto())
        except Exception as erro:
            logger.warning("O perfil aberto não foi marcado: %s", erro)
            return
        _preparar_a_colecao(conexao, logger)
        if abridor is None:
            return
        try:
            perfis = conexao.colecao.perfis()
        except Exception:
            perfis = []
        if perfis and marcado not in perfis:
            marcado = None
        try:
            abridor.escrever(marcado)
        except Exception as erro:
            logger.warning("O abridor não foi escrito: %s", erro)

    conexao.ao_mudar_o_perfil = reagir
    reagir()
    if ao_abrir_o_perfil is not None:
        try:
            ao_abrir_o_perfil(reagir)
        except Exception:
            logger.exception("O perfil e o abridor não vão acompanhar o perfil que abrir")
