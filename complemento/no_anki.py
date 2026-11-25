import os
import threading
import time

from . import cartoes_do_anki, criacao_na_revisao, inicio, janela, registro
from .criacao_no_anki import CriacaoNoAnki
from .baralhos import ColecaoIndisponivel, PerfilIlegivel, TipoDeNotaAusente
from .atualizacao_do_anki import AnkiWebDoAnki
from .configuracao import PORTA, VERSAO
from .servicos_de_fora import ServicosDeFora

LIMITE_DA_LEITURA_S = 10
ESPERA_DA_ENTRADA_S = 15
BARALHO_PADRAO = 1


def perfil_aberto(mw):
    if getattr(mw, "col", None) is None:
        return None
    return getattr(getattr(mw, "pm", None), "name", None)


class ColecaoDoAnki(CriacaoNoAnki):
    def __init__(self, mw, limite_s=LIMITE_DA_LEITURA_S, espera_da_entrada_s=ESPERA_DA_ENTRADA_S):
        self._mw = mw
        self._limite_s = limite_s
        self._sincronizando = threading.Event()
        self._fixo = None
        self._espera_da_entrada_s = espera_da_entrada_s
        self._entrando_ate = 0.0
        self._trocando = False

    def sincronizacao_comecou(self, *_):
        self._sincronizando.set()

    def sincronizacao_terminou(self, *_):
        self._sincronizando.clear()

    def _na_thread_principal(self, leitura, com_colecao=True):
        resultado = {}
        pronto = threading.Event()

        def ler():
            try:
                resultado["valor"] = leitura(self._colecao() if com_colecao else self._mw)
            except Exception as erro:
                resultado["erro"] = erro
            finally:
                pronto.set()

        self._mw.taskman.run_on_main(ler)
        if not pronto.wait(self._limite_s):
            raise ColecaoIndisponivel("anki_busy")
        if "erro" in resultado:
            raise resultado["erro"]
        return resultado["valor"]

    def _colecao(self):
        colecao = getattr(self._mw, "col", None)
        if colecao is None:
            raise ColecaoIndisponivel("collection_not_open")
        return colecao

    def perfis(self):
        return self._na_thread_principal(lambda mw: list(mw.pm.profiles()), com_colecao=False)

    def perfil_aberto(self):
        return perfil_aberto(self._mw)

    def fixar_o_perfil(self, fixo):
        self._fixo = fixo

    def entrar_no_perfil_fixo(self):
        return self._na_thread_principal(self._entrar_no_marcado, com_colecao=False)

    def trocar_para_o_perfil_fixo(self):
        return self._na_thread_principal(self._trocar_para_o_marcado, com_colecao=False)

    def _marcado_que_existe(self, mw):
        try:
            marcado = self._fixo.marcado() if self._fixo is not None else None
        except PerfilIlegivel:
            return None
        return marcado if marcado in mw.pm.profiles() else None

    @staticmethod
    def _janela_de_perfis_livre(mw):
        app = mw.app
        ativa = app.activeWindow()
        return not app.activeModalWidget() and (ativa is None or ativa is getattr(mw, "profileDiag", None))

    def _entrar_no_marcado(self, mw):
        marcado = self._marcado_que_existe(mw)
        if marcado is None or getattr(mw, "col", None) is not None or getattr(mw, "state", None) != "profileManager":
            return False
        if not self._janela_de_perfis_livre(mw):
            return False
        if time.monotonic() < self._entrando_ate:
            return False
        self._entrando_ate = time.monotonic() + self._espera_da_entrada_s
        if not mw.pm.load(marcado):
            return False
        mw.onOpenProfile()
        return True

    def _trocar_para_o_marcado(self, mw):
        marcado = self._marcado_que_existe(mw)
        if marcado is None:
            return False
        if getattr(mw, "col", None) is None:
            return self._entrar_no_marcado(mw)
        if mw.pm.name == marcado or self._trocando:
            return False

        def depois_de_fechar():
            self._trocando = False
            mw.showProfileManager()
            self._entrando_ate = 0.0
            self._entrar_no_marcado(mw)

        self._trocando = True
        try:
            mw.unloadProfile(depois_de_fechar)
        except Exception:
            self._trocando = False
            raise
        return True

    def nomes_dos_baralhos(self):
        return self._na_thread_principal(lambda colecao: [baralho.name for baralho in colecao.decks.all_names_and_ids()])

    def cartoes_do_baralho(self, nome):
        return self._na_thread_principal(lambda colecao: _cartoes_do_baralho(colecao, nome))

    def _se_pode_gravar(self, operacao):
        def sem_sincronizar(colecao):
            if self._fixo is not None:
                self._fixo.conferir(self._mw.pm.name, self._mw.pm.profiles())
            if self._sincronizando.is_set():
                raise ColecaoIndisponivel("anki_syncing")
            return operacao(colecao)

        return sem_sincronizar

    def _gravando(self, operacao):
        return self._na_thread_principal(self._se_pode_gravar(operacao))

    def tipo_de_nota(self, nome):
        return self._gravando(lambda colecao: cartoes_do_anki.campos_do_tipo(colecao.models.by_name(nome)))

    def tipos_de_nota(self):
        return self._gravando(lambda colecao: {modelo["name"]: cartoes_do_anki.campos_do_tipo(modelo) for modelo in colecao.models.all()})

    def guids_existentes(self, guids):
        if not guids:
            return set()
        marcas = ",".join("?" * len(guids))
        return self._gravando(lambda colecao: {linha[0] for linha in colecao.db.all("select guid from notes where guid in (%s)" % marcas, *guids)})

    def adicionar_nota(self, nota):
        return self._gravando(lambda colecao: _adicionar_nota(colecao, nota))

    def cartao_renderizado(self, tipo_de_nota, campos):
        return self._na_thread_principal(lambda colecao: cartoes_do_anki.renderizado(colecao, tipo_de_nota, campos))

    def nota_gravada(self, guid):
        return self._na_thread_principal(lambda colecao: cartoes_do_anki.nota_gravada(colecao, guid))

    def abrir_no_navegador(self, guid):
        return self._na_thread_principal(lambda colecao: cartoes_do_anki.abrir_no_navegador(colecao, self._mw, guid))

    def arquivo_de_midia(self, nome, limite_de_bytes):
        return self._na_thread_principal(lambda colecao: cartoes_do_anki.arquivo_de_midia(colecao, nome, limite_de_bytes))

    def criar_tipo_de_nota(self, definicao):
        return self._gravando(lambda colecao: _criar_tipo_de_nota(colecao, definicao))

    def modelos_do_tipo_de_nota(self, nome):
        return self._gravando(lambda colecao: cartoes_do_anki.modelos_do_tipo(colecao.models.by_name(nome)))

    def trocar_o_modelo(self, nome, modelo, css):
        return self._gravando(lambda colecao: cartoes_do_anki.trocar_o_modelo(colecao, nome, modelo, css))

    def criar_baralhos_da_instalacao_nova(self, nomes):
        return self._gravando(lambda colecao: _criar_baralhos_da_instalacao_nova(colecao, nomes))

    def gravar_cartao(self, nota, frente):
        return self._gravando(lambda colecao: _gravar_cartao(colecao, nota, frente))


def _adicionar_nota(colecao, nota):
    if colecao.db.all("select 1 from notes where guid = ?", nota.guid):
        return
    modelo = colecao.models.by_name(nota.tipo_de_nota)
    if modelo is None or not set(nota.campos) <= set(cartoes_do_anki.campos_do_tipo(modelo)):
        raise TipoDeNotaAusente(nota.tipo_de_nota)
    campos = nota.campos
    for nome, dados in (nota.midia or {}).items():
        guardado = colecao.media.write_data(nome, dados)
        campos = {campo: valor.replace("[sound:%s]" % nome, "[sound:%s]" % guardado) for campo, valor in campos.items()}
    nova = colecao.new_note(modelo)
    for nome, valor in campos.items():
        nova[nome] = valor
    nova.tags = list(nota.etiquetas)
    nova.guid = nota.guid
    colecao.add_note(nova, colecao.decks.id(nota.baralho))


def _criar_tipo_de_nota(colecao, definicao):
    modelos = colecao.models
    if modelos.by_name(definicao["nome"]) is not None:
        return False
    novo = modelos.new(definicao["nome"])
    for campo in definicao["campos"]:
        modelos.add_field(novo, modelos.new_field(campo))
    for modelo in definicao["modelos"]:
        cartao = modelos.new_template(modelo["nome"])
        cartao["qfmt"], cartao["afmt"] = modelo["frente"], modelo["verso"]
        modelos.add_template(novo, cartao)
    novo["css"] = definicao["css"]
    (modelos.add_dict if hasattr(modelos, "add_dict") else modelos.add)(novo)
    return True


def _criar_baralhos_da_instalacao_nova(colecao, nomes):
    if any(baralho.id != BARALHO_PADRAO for baralho in colecao.decks.all_names_and_ids()):
        return []
    for nome in nomes:
        colecao.decks.id(nome)
    return list(nomes)


def _gravar_cartao(colecao, nota, frente):
    if colecao.db.all("select 1 from notes where guid = ?", nota.guid):
        return "added"
    if any(frente.esta_em(cartao) for cartao in _cartoes_do_baralho(colecao, nota.baralho)):
        return "duplicate"
    _adicionar_nota(colecao, nota)
    return "added"


def _cartoes_do_baralho(colecao, nome):
    ids = [
        int(baralho.id)
        for baralho in colecao.decks.all_names_and_ids()
        if baralho.name == nome or baralho.name.startswith(nome + "::")
    ]
    if not ids:
        return []
    lista = ",".join(str(id_) for id_ in ids)
    linhas = colecao.db.all(
        "select c.nid, c.type, c.ivl, n.mid, n.flds from cards c join notes n on n.id = c.nid "
        "where c.did in (%s) or c.odid in (%s)" % (lista, lista)
    )
    nomes_dos_campos = {}
    cartoes = []
    for nota, tipo, intervalo, modelo, campos in linhas:
        if modelo not in nomes_dos_campos:
            tipo_de_nota = colecao.models.get(modelo)
            nomes_dos_campos[modelo] = [campo["name"] for campo in sorted(tipo_de_nota["flds"], key=lambda c: c["ord"])] if tipo_de_nota else []
        nomes = nomes_dos_campos[modelo]
        valores = str(campos or "").split("\x1f")
        cartoes.append({
            "nota": nota,
            "campos": [(nomes[posicao] if posicao < len(nomes) else "", valor) for posicao, valor in enumerate(valores)],
            "tipo": tipo,
            "intervalo": intervalo,
        })
    return cartoes


def _ao_abrir_o_perfil(funcao):
    from aqt import gui_hooks

    gui_hooks.profile_did_open.append(funcao)


def _ao_sincronizar(colecao):
    from aqt import gui_hooks

    gui_hooks.sync_will_start.append(colecao.sincronizacao_comecou)
    gui_hooks.sync_did_finish.append(colecao.sincronizacao_terminou)


def _qt_do_anki(logger):
    from .qt_do_anki import QtDoAnki

    return QtDoAnki(logger)


def ao_carregar(mw, pasta_do_complemento, *, porta=PORTA, ao_abrir_o_perfil=_ao_abrir_o_perfil,
                abridor=inicio.ABRIDOR_DESTE_COMPUTADOR, ao_sincronizar=_ao_sincronizar, servicos=ServicosDeFora(),
                esperas=None, qt=None,
                ao_receber_mensagem=criacao_na_revisao.ao_receber_mensagem):
    colecao = ColecaoDoAnki(mw)
    try:
        ao_sincronizar(colecao)
    except Exception:
        pass
    criacao_na_revisao.ligar(colecao, ao_receber_mensagem)
    conexao = inicio.iniciar(pasta_do_complemento, lambda: perfil_aberto(mw), inicio.Arredores(porta=porta, colecao=colecao, ao_abrir_o_perfil=ao_abrir_o_perfil, abridor=abridor, servicos=servicos, esperas=esperas, anki_web=AnkiWebDoAnki(mw, pasta_do_complemento)))
    _por_no_menu(mw, conexao, os.path.basename(os.path.abspath(pasta_do_complemento)), qt)
    return conexao


def _por_no_menu(mw, conexao, modulo, qt):
    logger = conexao.logger if conexao is not None else registro.silencioso()
    try:
        janela.ligar(mw, janela.Janela(conexao, lambda: perfil_aberto(mw), VERSAO, logger), qt or _qt_do_anki(logger), modulo)
    except Exception:
        logger.exception("O item PerpetualMiner… não entrou em Ferramentas")
