"""PerpetualMiner: a Conexão com o Anki, como complemento do Anki.

O Anki importa esta pasta ao abrir. Fora do Anki (nos testes) não há `aqt`, e nada
acontece ao importar.
"""

import os

try:
    from aqt import mw
except ImportError:
    mw = None

if mw is not None:
    from . import no_anki

    CONEXAO = no_anki.ao_carregar(mw, os.path.dirname(os.path.abspath(__file__)))
