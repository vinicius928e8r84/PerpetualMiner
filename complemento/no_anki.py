"""A ligação do complemento com o Anki de verdade: o que só existe lá dentro (`mw`).

Fica fora do `__init__.py` para que os testes usem o mesmo adaptador que o Anki usa, com um `mw` de mentira.
"""

import threading

from . import inicio
from .baralhos import ColecaoIndisponivel
from .configuracao import PORTA

# Quanto a Conexão espera a thread principal do Anki ler a coleção antes de dizer que o Anki não respondeu.
LIMITE_DA_LEITURA_S = 10


def perfil_aberto(mw):
    """O nome do perfil que o Anki tem **aberto**, ou None.

    `mw.pm.name` também vale com um perfil só selecionado na janela de perfis (o gerente o guarda
    antes de abrir a coleção) e depois de fechado; só com a coleção carregada (`mw.col`) há perfil aberto.
    """
    if getattr(mw, "col", None) is None:
        return None
    return getattr(getattr(mw, "pm", None), "name", None)


class LeitorDaColecaoDoAnki:
    """O lado de leitura do adaptador da coleção (o contrato está em `baralhos.py`), sobre o `mw` do Anki.

    A coleção do Anki não é para outras threads: toda leitura roda na thread principal (`mw.taskman.run_on_main`)
    e só volta com o que leu; o que se faz com os Cartões (normalizar, contar) fica na thread da Conexão.
    A lista de perfis vem do gerente de perfis (`mw.pm`), que a conhece mesmo sem coleção aberta, mas também
    guarda um sqlite da thread principal: ela é lida lá, sem exigir coleção.
    """

    def __init__(self, mw, limite_s=LIMITE_DA_LEITURA_S):
        self._mw = mw
        self._limite_s = limite_s

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

    def nomes_dos_baralhos(self):
        return self._na_thread_principal(lambda colecao: [baralho.name for baralho in colecao.decks.all_names_and_ids()])

    def cartoes_do_baralho(self, nome):
        return self._na_thread_principal(lambda colecao: _cartoes_do_baralho(colecao, nome))


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


def ao_carregar(mw, pasta_do_complemento, *, porta=PORTA, ao_abrir_o_perfil=_ao_abrir_o_perfil):
    """O que o Anki faz ao importar o complemento: devolve a Conexão, ou None se ela não subiu."""
    return inicio.iniciar(
        pasta_do_complemento,
        lambda: perfil_aberto(mw),
        porta=porta,
        colecao=LeitorDaColecaoDoAnki(mw),
        ao_abrir_o_perfil=ao_abrir_o_perfil,
    )
