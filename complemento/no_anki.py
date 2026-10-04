"""A ligação do complemento com o Anki de verdade: o que só existe lá dentro (`mw`).

Fica fora do `__init__.py` para que os testes usem o mesmo adaptador que o Anki usa, com um `mw` de mentira.
"""

from . import inicio
from .configuracao import PORTA


def perfil_aberto(mw):
    """O nome do perfil que o Anki tem **aberto**, ou None.

    `mw.pm.name` também vale com um perfil só selecionado na janela de perfis (o gerente o guarda
    antes de abrir a coleção) e depois de fechado; só com a coleção carregada (`mw.col`) há perfil aberto.
    """
    if getattr(mw, "col", None) is None:
        return None
    return getattr(getattr(mw, "pm", None), "name", None)


def ao_carregar(mw, pasta_do_complemento, *, porta=PORTA):
    """O que o Anki faz ao importar o complemento: devolve a Conexão, ou None se ela não subiu."""
    return inicio.iniciar(pasta_do_complemento, lambda: perfil_aberto(mw), porta=porta)
