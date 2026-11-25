import ast
import json
import sys

COM_CORPO = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)


def eh_texto(valor):
    return isinstance(valor, ast.Constant) and isinstance(valor.value, str)


def tem_docstring(no):
    return isinstance(no, COM_CORPO) and bool(no.body) and isinstance(no.body[0], ast.Expr) and eh_texto(no.body[0].value)


def posicao(no):
    instrucao = no.body[0]
    sozinha = len(no.body) == 1 and not isinstance(no, ast.Module)
    return [instrucao.lineno, instrucao.col_offset, instrucao.end_lineno, instrucao.end_col_offset, sozinha]


def docstrings(arvore):
    return sorted(posicao(no) for no in ast.walk(arvore) if tem_docstring(no))


def ler(fonte):
    try:
        return {"docstrings": docstrings(ast.parse(fonte))}
    except (SyntaxError, ValueError) as erro:
        return {"erro": str(erro)}


def main():
    fonte = sys.stdin.buffer.read().decode("utf-8", "surrogateescape")
    sys.stdout.buffer.write(json.dumps(ler(fonte)).encode("ascii"))


main()
