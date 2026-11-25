import ast
import io
import json
import sys
import tokenize

COM_CORPO = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)


def coluna_em_caracteres(linhas, linha, em_bytes):
    return len(linhas[linha - 1].encode("utf-8")[:em_bytes].decode("utf-8", "ignore"))


class Docstring:
    def __init__(self, instrucao, sozinha, linhas):
        self.texto = instrucao.value.value
        self.sozinha = sozinha
        self.inicio = (instrucao.lineno, coluna_em_caracteres(linhas, instrucao.lineno, instrucao.col_offset))
        self.fim = (instrucao.end_lineno, coluna_em_caracteres(linhas, instrucao.end_lineno, instrucao.end_col_offset))

    def contem(self, token):
        return self.inicio <= token.start and token.end <= self.fim


def eh_texto(valor):
    return isinstance(valor, ast.Constant) and isinstance(valor.value, str)


def eh_docstring(instrucao):
    return isinstance(instrucao, ast.Expr) and eh_texto(instrucao.value)


def tem_docstring(no):
    return isinstance(no, COM_CORPO) and bool(no.body) and eh_docstring(no.body[0])


def docstrings(arvore, linhas):
    achadas = []
    for no in filter(tem_docstring, ast.walk(arvore)):
        sozinha = len(no.body) == 1 and not isinstance(no, ast.Module)
        achadas.append(Docstring(no.body[0], sozinha, linhas))
    return achadas


def docstring_do(token, achadas):
    return next((d for d in achadas if d.contem(token)), None)


def entrada_do_codigo(token):
    texto = "" if token.type == tokenize.NEWLINE else token.string
    return tokenize.tok_name[token.type] + ":" + texto


def o_que_fica_do_token(token, doc, aberta):
    if doc is not None:
        return []
    if aberta is not None and token.type == tokenize.NEWLINE:
        return ["NAME:pass", "NEWLINE:"] if aberta.sozinha else []
    return [entrada_do_codigo(token)]


def codigo_sem_docstrings(tokens, achadas):
    codigo = []
    aberta = None
    for token in tokens:
        doc = docstring_do(token, achadas)
        codigo.extend(o_que_fica_do_token(token, doc, aberta))
        aberta = doc
    return codigo


def ler(fonte):
    arvore = ast.parse(fonte)
    achadas = docstrings(arvore, fonte.split("\n"))
    tokens = list(tokenize.generate_tokens(io.StringIO(fonte).readline))
    ignorados = (tokenize.COMMENT, tokenize.NL, tokenize.ENCODING)
    comentarios = ["C:" + t.string for t in tokens if t.type == tokenize.COMMENT] + ["D:" + d.texto for d in achadas]
    return {"codigo": codigo_sem_docstrings([t for t in tokens if t.type not in ignorados], achadas), "comentarios": comentarios}


def main():
    fonte = sys.stdin.buffer.read().decode("utf-8", "surrogateescape")
    try:
        saida = ler(fonte)
    except (tokenize.TokenError, IndentationError, SyntaxError, ValueError) as erro:
        saida = {"erro": str(erro)}
    sys.stdout.buffer.write(json.dumps(saida, ensure_ascii=True).encode("ascii"))


main()
