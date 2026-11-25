import os

try:
    from aqt import mw
except ImportError:
    mw = None

if mw is not None:
    from . import no_anki

    CONEXAO = no_anki.ao_carregar(mw, os.path.dirname(os.path.abspath(__file__)))
