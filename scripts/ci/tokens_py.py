import io
import json
import sys
import tokenize

IGNORADOS = {tokenize.COMMENT, tokenize.NL, tokenize.ENCODING}


def ler(fonte):
    codigo = []
    comentarios = []
    for token in tokenize.generate_tokens(io.StringIO(fonte).readline):
        if token.type == tokenize.COMMENT:
            comentarios.append(token.string)
        elif token.type not in IGNORADOS:
            codigo.append([tokenize.tok_name[token.type], token.string])
    return {"codigo": codigo, "comentarios": comentarios}


def main():
    fonte = sys.stdin.buffer.read().decode("utf-8", "surrogateescape")
    try:
        saida = ler(fonte)
    except (tokenize.TokenError, IndentationError, SyntaxError) as erro:
        saida = {"erro": str(erro)}
    sys.stdout.buffer.write(json.dumps(saida, ensure_ascii=True).encode("ascii"))


main()
