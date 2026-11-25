import os

PASTA = os.path.dirname(os.path.abspath(__file__))
_ENGINE = os.path.normpath(os.path.join(PASTA, "..", "..", "engine"))

if not os.path.exists(os.path.join(PASTA, "generate_cards.py")) and os.path.isdir(_ENGINE):
    __path__.append(_ENGINE)  # noqa: F821
    PASTA = _ENGINE
