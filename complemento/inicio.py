import os
import sys

from . import abridor as abridores, item_de_login as itens_de_login, passagem as passagens, pasta_de_dados, registro, tipo_de_nota
from .baralhos import ColecaoIndisponivel
from .atualizacao import ARQUIVO_DE_QUEM_DESLIGOU, AnkiWebAusente, Atualizacao, RegistroDaAtualizacao
from .configuracao import ATUALIZACAO_AUTOMATICA, OPENAI_BASE, OPENVERSE_BASE, ORIGENS_ACEITAS, PORTA, VERSAO, VOZ_BASE
from .servidor import Conexao

ABRIDOR_DESTE_COMPUTADOR = object()
PASSAGEM_DESTE_COMPUTADOR = object()


def iniciar(
    pasta_do_complemento,
    perfil_aberto,
    *,
    porta=PORTA,
    origens_aceitas=ORIGENS_ACEITAS,
    colecao=None,
    item_de_login=None,
    openai_base=OPENAI_BASE,
    openverse_base=OPENVERSE_BASE,
    voz_base=VOZ_BASE,
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
        if abridor is ABRIDOR_DESTE_COMPUTADOR:
            abridor = abridores.deste_computador(
                computador=abridores.Computador(sys.platform, os.environ, sys.executable), pasta=os.path.join(dados.raiz, "abridor"),
                complemento=pasta_do_complemento,
            )
        if item_de_login is None:
            item_de_login = itens_de_login.deste_computador(plataforma=sys.platform, ambiente=os.environ, executavel=sys.executable)
        conexao = Conexao(
            porta=porta,
            origens_aceitas=origens_aceitas,
            versao=VERSAO,
            perfil_aberto=perfil_aberto,
            logger=logger,
            dados=dados,
            colecao=colecao,
            openai_base=openai_base,
            openverse_base=openverse_base,
            voz_base=voz_base,
            item_de_login=item_de_login,
            atualizacao=Atualizacao(
                registro=RegistroDaAtualizacao(os.path.join(dados.raiz, "atualizacao.json"), VERSAO, logger), anki_web=anki_web or AnkiWebAusente(), logger=logger,
                ligada=atualizacao_automatica and not os.path.exists(os.path.join(dados.raiz, ARQUIVO_DE_QUEM_DESLIGOU))),
        )
        _cuidar_do_perfil(conexao, abridor, ao_abrir_o_perfil, logger)
        if passagem is PASSAGEM_DESTE_COMPUTADOR:
            passagem = passagens.deste_computador(plataforma=sys.platform, ambiente=os.environ, porta=porta)
        if passagem is not None and passagem.pendente(conexao):
            conexao.iniciar_depois(lambda cancelado: passagem.fazer(conexao, cancelado))
            conexao.atualizacao.iniciar()
            return conexao
        if not conexao.iniciar():
            return None
        conexao.atualizacao.iniciar()
        return conexao
    except Exception:
        logger.exception("O complemento não conseguiu iniciar")
        return None


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
