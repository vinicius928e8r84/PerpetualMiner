"""A ligação do complemento com o Anki de verdade: o que só existe lá dentro (`mw`).

Fica fora do `__init__.py` para que os testes usem o mesmo adaptador que o Anki usa, com um `mw` de mentira.
"""

import os
import threading
import time

from . import inicio, janela, registro
from .baralhos import ColecaoIndisponivel, PerfilIlegivel, TipoDeNotaAusente
from .configuracao import OPENAI_BASE, OPENVERSE_BASE, PORTA, VERSAO, VOZ_BASE

# Quanto a Conexão espera a thread principal do Anki ler a coleção antes de dizer que o Anki não respondeu.
LIMITE_DA_LEITURA_S = 10
# Depois de pedir ao Anki que entre num perfil, a Conexão não pede de novo por este tempo (s): entrar não é instantâneo, e um segundo
# pedido no meio abriria o perfil duas vezes.
ESPERA_DA_ENTRADA_S = 15
BARALHO_PADRAO = 1  # o id do Baralho que todo Anki tem


def perfil_aberto(mw):
    """O nome do perfil que o Anki tem **aberto**, ou None.

    `mw.pm.name` também vale com um perfil só selecionado na janela de perfis (o gerente o guarda
    antes de abrir a coleção) e depois de fechado; só com a coleção carregada (`mw.col`) há perfil aberto.
    """
    if getattr(mw, "col", None) is None:
        return None
    return getattr(getattr(mw, "pm", None), "name", None)


class ColecaoDoAnki:
    """O adaptador da coleção (o contrato, de leitura, de gravação e do perfil fixo, está em `baralhos.py`), sobre o `mw` do Anki.

    A coleção do Anki não é para outras threads: toda leitura e toda gravação roda na thread principal
    (`mw.taskman.run_on_main`), uma operação curta de cada vez, e só volta com o resultado; o que se faz com os
    Cartões (normalizar, contar, montar os campos) fica na thread da Conexão ou na do Envio. Durante uma sincronização
    (os ganchos `sync_will_start`/`sync_did_finish`, ligados por `ao_carregar`) nada se grava: `anki_syncing`.
    A lista de perfis vem do gerente de perfis (`mw.pm`), que a conhece mesmo sem coleção aberta, mas também
    guarda um sqlite da thread principal: ela é lida lá, sem exigir coleção.
    """

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
        """Roda `leitura` na thread principal do Anki e devolve o que ela leu. Com `com_colecao`, `leitura`
        recebe a coleção aberta (sem ela, `ColecaoIndisponivel`); sem, recebe só o `mw`."""
        resultado = {}
        pronto = threading.Event()

        def ler():
            try:
                resultado["valor"] = leitura(self._colecao() if com_colecao else self._mw)
            except Exception as erro:  # a leitura volta à thread da Conexão, que decide a resposta
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
        """O perfil fixo (#149, `perfil.PerfilFixo`): daqui em diante toda gravação só vale no perfil marcado."""
        self._fixo = fixo

    def entrar_no_perfil_fixo(self):
        """Com o Anki na tela de perfis, abre o perfil marcado (`mw.pm.load` e `mw.onOpenProfile`, as funções que a janela de perfis
        usa). Com um perfil aberto não faz nada. Devolve se começou a entrar."""
        return self._na_thread_principal(self._entrar_no_marcado, com_colecao=False)

    def trocar_para_o_perfil_fixo(self):
        """O clique em “Abrir <perfil>”: fecha o perfil aberto pelo caminho normal do Anki (`unloadProfile`, que sincroniza e só então
        segue) e abre o marcado. Na tela de perfis só abre; já no marcado, não faz nada. Devolve se começou."""
        return self._na_thread_principal(self._trocar_para_o_marcado, com_colecao=False)

    def _marcado_que_existe(self, mw):
        try:
            marcado = self._fixo.marcado() if self._fixo is not None else None
        except PerfilIlegivel:
            return None
        return marcado if marcado in mw.pm.profiles() else None

    @staticmethod
    def _janela_de_perfis_livre(mw):
        """A janela de perfis é a janela ativa e nenhum diálogo modal está aberto. `run_on_main` roda também dentro do laço de um modal:
        com o “Excluir” ou o “Renomear” da janela de perfis aberto, entrar no perfil marcado faria o que a pessoa confirmar valer para ele
        (`pm.remove(pm.name)`, `pm.rename`)."""
        app = mw.app
        ativa = app.activeWindow()
        return not app.activeModalWidget() and (ativa is None or ativa is getattr(mw, "profileDiag", None))

    def _entrar_no_marcado(self, mw):
        """Na thread principal. Só da tela de perfis (`mw.state`), sem coleção aberta, e uma vez por `espera_da_entrada_s`."""
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
            return False  # `_trocando`: o Anki ainda sincroniza ao fechar; um segundo clique fecharia o perfil de novo

        def depois_de_fechar():
            self._trocando = False
            mw.showProfileManager()  # o que o item Trocar de perfil faz depois de fechar (`unloadProfileAndShowProfileManager`)
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

    def _gravando(self, operacao):
        """A operação de gravação, na thread principal; a sincronização é conferida lá, na hora em que ela roda."""
        def sem_sincronizar(colecao):
            if self._fixo is not None:  # o perfil lido aqui, na hora de gravar: nenhuma troca de perfil cabe entre a conferência e a nota
                self._fixo.conferir(self._mw.pm.name, self._mw.pm.profiles())
            if self._sincronizando.is_set():
                raise ColecaoIndisponivel("anki_syncing")
            return operacao(colecao)

        return self._na_thread_principal(sem_sincronizar)

    def tipo_de_nota(self, nome):
        return self._gravando(lambda colecao: _campos_do_tipo(colecao.models.by_name(nome)))

    def guids_existentes(self, guids):
        if not guids:
            return set()
        marcas = ",".join("?" * len(guids))
        return self._gravando(lambda colecao: {linha[0] for linha in colecao.db.all("select guid from notes where guid in (%s)" % marcas, *guids)})

    def adicionar_nota(self, baralho, tipo_de_nota, campos, etiquetas, guid, midia=None):
        return self._gravando(lambda colecao: _adicionar_nota(colecao, baralho, tipo_de_nota, campos, etiquetas, guid, midia))

    def criar_tipo_de_nota(self, definicao):
        """Cria o tipo de nota (`tipo_de_nota.definicao`) se a coleção não tem um com o nome; um que já existe não é tocado. Devolve se criou."""
        return self._gravando(lambda colecao: _criar_tipo_de_nota(colecao, definicao))

    def criar_baralhos_da_instalacao_nova(self, nomes):
        """Cria os Baralhos `nomes` só se a coleção não tem nenhum além do padrão do Anki; devolve os criados (nenhum, para quem já tem Baralho)."""
        return self._gravando(lambda colecao: _criar_baralhos_da_instalacao_nova(colecao, nomes))

    def gravar_cartao(self, baralho, tipo_de_nota, campos, etiquetas, guid, campos_da_frente, frente_normalizada, normalizar, midia=None):
        """O passo de gravar um Cartão, **uma função só** na thread principal: a sincronização, o `guid`, a frente no Baralho e a nota.

        Devolve `"added"` (a nota é deste Cartão: já estava, ou foi gravada agora) ou `"duplicate"` (a frente já estava no Baralho,
        de outra nota). A busca da frente fica aqui dentro: uma função que o Anki ocupado atrasou, e que a thread de trabalho
        deixou de esperar, não faz a volta seguinte contar a própria nota como duplicata. A `midia` (`{nome: bytes}`, o áudio e a imagem do
        Cartão) é guardada pela coleção junto com a nota nova, e só com ela."""
        return self._gravando(lambda colecao: _gravar_cartao(
            colecao, baralho, tipo_de_nota, campos, etiquetas, guid, campos_da_frente, frente_normalizada, normalizar, midia))


def _campos_do_tipo(modelo):
    return [campo["name"] for campo in sorted(modelo["flds"], key=lambda c: c["ord"])] if modelo else None


def _adicionar_nota(colecao, baralho, tipo_de_nota, campos, etiquetas, guid, midia=None):
    """Uma nota nova, na thread principal: o Baralho é criado se falta (`decks.id`), o tipo de nota tem de existir com os campos.
    A `midia` vai para a pasta de mídia da coleção (`media.write_data`) antes da nota; se a coleção deu outro nome ao arquivo (já
    havia um de mesmo nome e outro conteúdo), o `[sound:…]` da nota cita o nome que ficou (um `<img src>` segue o nome pedido).

    Uma nota com o mesmo `guid` já gravada fica como está: é a gravação que o Anki ocupado atrasou (o Envio desistiu de
    esperar e pediu de novo), e o Anki não impede dois `guid` iguais."""
    if colecao.db.all("select 1 from notes where guid = ?", guid):
        return
    modelo = colecao.models.by_name(tipo_de_nota)
    if modelo is None or not set(campos) <= set(_campos_do_tipo(modelo)):
        raise TipoDeNotaAusente(tipo_de_nota)
    for nome, dados in (midia or {}).items():
        guardado = colecao.media.write_data(nome, dados)
        campos = {campo: valor.replace("[sound:%s]" % nome, "[sound:%s]" % guardado) for campo, valor in campos.items()}
    nota = colecao.new_note(modelo)
    for nome, valor in campos.items():
        nota[nome] = valor
    nota.tags = list(etiquetas)
    nota.guid = guid
    colecao.add_note(nota, colecao.decks.id(baralho))


def _criar_tipo_de_nota(colecao, definicao):
    """Na thread principal. Só cria: o que já existe com o nome fica como a pessoa o deixou, qualquer que seja o conteúdo."""
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
    (modelos.add_dict if hasattr(modelos, "add_dict") else modelos.add)(novo)  # `add_dict` é o do Anki novo; `add`, o dos mais antigos
    return True


def _criar_baralhos_da_instalacao_nova(colecao, nomes):
    """O Baralho padrão do Anki é o de id 1, e o nome dele segue o idioma do Anki (“Default”, “Padrão”, “По умолчанию”): é o id que o reconhece."""
    if any(baralho.id != BARALHO_PADRAO for baralho in colecao.decks.all_names_and_ids()):
        return []
    for nome in nomes:
        colecao.decks.id(nome)  # cria o Baralho (e o pai, `PerpetualMiner`)
    return list(nomes)


def _gravar_cartao(colecao, baralho, tipo_de_nota, campos, etiquetas, guid, campos_da_frente, frente_normalizada, normalizar, midia=None):
    if colecao.db.all("select 1 from notes where guid = ?", guid):
        return "added"
    frentes = (campos_da_frente,) if isinstance(campos_da_frente, str) else tuple(campos_da_frente)
    for cartao in _cartoes_do_baralho(colecao, baralho):
        if any(nome in frentes and valor and normalizar(valor) == frente_normalizada for nome, valor in cartao["campos"]):
            return "duplicate"
    _adicionar_nota(colecao, baralho, tipo_de_nota, campos, etiquetas, guid, midia)
    return "added"


def _cartoes_do_baralho(colecao, nome):
    """Os Cartões do Baralho e dos subbaralhos (e os que um Baralho filtrado emprestou), como a busca `deck:` do Anki."""
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
            tipo_de_nota = colecao.models.get(modelo)  # None: o tipo de nota sumiu; os campos ficam sem nome
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
    """Roda `funcao` cada vez que um perfil abre no Anki (o gancho `profile_did_open`)."""
    from aqt import gui_hooks

    gui_hooks.profile_did_open.append(funcao)


def _ao_sincronizar(colecao):
    """Liga o adaptador aos ganchos de sincronização do Anki: enquanto sincroniza, o Envio não grava."""
    from aqt import gui_hooks

    gui_hooks.sync_will_start.append(colecao.sincronizacao_comecou)
    gui_hooks.sync_did_finish.append(colecao.sincronizacao_terminou)


def _qt_do_anki(logger):
    from .qt_do_anki import QtDoAnki

    return QtDoAnki(logger)


def ao_carregar(mw, pasta_do_complemento, *, porta=PORTA, ao_abrir_o_perfil=_ao_abrir_o_perfil,
                abridor=inicio.ABRIDOR_DESTE_COMPUTADOR, ao_sincronizar=_ao_sincronizar, openai_base=OPENAI_BASE,
                openverse_base=OPENVERSE_BASE, voz_base=VOZ_BASE, qt=None):
    """O que o Anki faz ao importar o complemento: devolve a Conexão, ou None se ela não subiu.

    Depois de subir (ou não), põe o item “PerpetualMiner…” em Ferramentas e o botão Config (#175) pela fronteira `qt`
    (`qt_do_anki.QtDoAnki`; omitida, a do Anki). O nome da pasta do complemento é o que o Anki chama de módulo dele."""
    colecao = ColecaoDoAnki(mw)
    try:
        ao_sincronizar(colecao)
    except Exception:  # sem os ganchos (um Anki que os mudou), o Envio só não sabe da sincronização: o Anki recusa e ele espera
        pass
    conexao = inicio.iniciar(
        pasta_do_complemento,
        lambda: perfil_aberto(mw),
        porta=porta,
        colecao=colecao,
        ao_abrir_o_perfil=ao_abrir_o_perfil,
        abridor=abridor,
        openai_base=openai_base,
        openverse_base=openverse_base,
        voz_base=voz_base,
    )
    _por_no_menu(mw, conexao, os.path.basename(os.path.abspath(pasta_do_complemento)), qt)
    return conexao


def _por_no_menu(mw, conexao, modulo, qt):
    """O item e a janela. Sem eles (um Anki que mudou o menu) a Conexão segue: o erro vai ao registro, nunca ao Anki."""
    logger = conexao.logger if conexao is not None else registro.silencioso()
    try:
        janela.ligar(mw, janela.Janela(conexao, lambda: perfil_aberto(mw), VERSAO, logger), qt or _qt_do_anki(logger), modulo, logger)
    except Exception:
        logger.exception("O item PerpetualMiner… não entrou em Ferramentas")
