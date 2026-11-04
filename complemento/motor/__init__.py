"""O motor de texto dentro do complemento: os módulos de `engine/`, importados como o pacote `complemento.motor`.

No `.ankiaddon`, `empacotar.py` copia para esta pasta os arquivos de `engine/` que o Envio usa (`ARQUIVOS_DO_MOTOR`
lá); no repositório eles não estão aqui, e esta pasta passa a procurar os módulos em `engine/`. Com `__package__`, cada módulo do motor importa os irmãos de forma relativa
(no Python 3.9 do Anki, um `import parser` solto pegaria o módulo `parser` da biblioteca padrão).
"""

import os

PASTA = os.path.dirname(os.path.abspath(__file__))
_ENGINE = os.path.normpath(os.path.join(PASTA, "..", "..", "engine"))

if not os.path.exists(os.path.join(PASTA, "generate_cards.py")) and os.path.isdir(_ENGINE):
    __path__.append(_ENGINE)  # noqa: F821 — o `__path__` do próprio pacote
    PASTA = _ENGINE
