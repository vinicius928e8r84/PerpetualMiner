import ast
import json
import sys

LACOS = (ast.For, ast.AsyncFor, ast.While)
FUNCOES = (ast.FunctionDef, ast.AsyncFunctionDef)
ESCOLHA = (ast.Match,) if hasattr(ast, 'Match') else ()
CASO = (ast.match_case,) if hasattr(ast, 'match_case') else ()
ANINHADORES = (ast.If,) + LACOS + ESCOLHA
DESVIOS = (ast.If, ast.ExceptHandler) + LACOS + CASO
COM_CONDICAO = (ast.If, ast.While, ast.IfExp)


def operadores_logicos(no):
    return sum(len(x.values) - 1 for x in ast.walk(no) if isinstance(x, ast.BoolOp))


def quantos_argumentos(funcao):
    a = funcao.args
    nomeados = [x for x in a.posonlyargs + a.args + a.kwonlyargs if x.arg not in ('self', 'cls')]
    return len(nomeados) + int(a.vararg is not None) + int(a.kwarg is not None)


def nova_unidade(nome, funcao):
    fim = getattr(funcao, 'end_lineno', funcao.lineno)
    return dict(nome=nome, linha=funcao.lineno, linhas=fim - funcao.lineno + 1,
                argumentos=quantos_argumentos(funcao), cc=1, aninhamento=0, blocos=0, condicoes=[])


def desvios_do_no(no):
    if isinstance(no, ast.comprehension):
        return 1 + len(no.ifs)
    if isinstance(no, ast.BoolOp):
        return len(no.values) - 1
    return int(isinstance(no, DESVIOS))


def marcar_bloco(unidade, bloco):
    if bloco is None or bloco['marcado']:
        return
    bloco['marcado'] = True
    unidade['blocos'] += 1


class Posicao:
    def __init__(self, unidade, prof=0, bloco=None, classe=None):
        self.unidade = unidade
        self.prof = prof
        self.bloco = bloco
        self.classe = classe

    def abaixo(self, prof, bloco):
        return Posicao(self.unidade, prof, bloco)

    def sem_classe(self):
        return Posicao(self.unidade, self.prof, self.bloco)


class Medicao:
    def __init__(self):
        self.unidades = []
        self.global_ = nova_unidade('(topo do arquivo)', ast.parse('def f(): pass').body[0])

    def visitar_todos(self, nos, posicao):
        for no in nos:
            self.visitar(no, posicao)

    def visitar(self, no, posicao):
        if isinstance(no, FUNCOES):
            self.visitar_funcao(no, posicao)
        elif isinstance(no, ast.Lambda):
            self.visitar(no.body, posicao)
        elif isinstance(no, ast.ClassDef):
            self.visitar_todos(no.body, Posicao(posicao.unidade, posicao.prof, posicao.bloco, no.name))
        else:
            self.visitar_comum(no, posicao)

    def visitar_funcao(self, funcao, posicao):
        if posicao.unidade is not self.global_ and posicao.classe is None:
            self.visitar_todos(funcao.body, posicao)
            return
        nome = posicao.classe + '.' + funcao.name if posicao.classe else funcao.name
        unidade = nova_unidade(nome, funcao)
        self.unidades.append(unidade)
        self.visitar_todos(funcao.body, Posicao(unidade))

    def contar_condicao(self, teste, unidade):
        operadores = operadores_logicos(teste)
        if operadores >= 2:
            unidade['condicoes'].append(operadores)

    def aninhar(self, no, posicao):
        if not isinstance(no, ANINHADORES):
            return posicao.sem_classe()
        unidade = posicao.unidade
        dentro = posicao.prof + 1
        unidade['aninhamento'] = max(unidade['aninhamento'], dentro)
        bloco = {'marcado': False} if dentro == 1 else posicao.bloco
        if dentro >= 2:
            marcar_bloco(unidade, bloco)
        return posicao.abaixo(dentro, bloco)

    def visitar_comum(self, no, posicao):
        unidade = posicao.unidade
        unidade['cc'] += desvios_do_no(no)
        if isinstance(no, COM_CONDICAO):
            self.contar_condicao(no.test, unidade)
        dentro = self.aninhar(no, posicao)
        if isinstance(no, ast.If):
            self.visitar_se(no, posicao.sem_classe(), dentro)
        else:
            self.visitar_todos(ast.iter_child_nodes(no), dentro)

    def visitar_se(self, se, fora, dentro):
        self.visitar(se.test, fora)
        self.visitar_todos(se.body, dentro)
        resto = se.orelse
        while len(resto) == 1 and isinstance(resto[0], ast.If):
            senao_se = resto[0]
            fora.unidade['cc'] += 1
            self.contar_condicao(senao_se.test, fora.unidade)
            self.visitar(senao_se.test, fora)
            self.visitar_todos(senao_se.body, dentro)
            resto = senao_se.orelse
        self.visitar_todos(resto, dentro)


def linhas_de_codigo(fonte):
    return sum(1 for linha in fonte.split('\n') if linha.strip() and not linha.strip().startswith('#'))


def medir(fonte):
    try:
        arvore = ast.parse(fonte)
    except SyntaxError as erro:
        return dict(erro=str(erro))
    medicao = Medicao()
    medicao.visitar_todos(arvore.body, Posicao(medicao.global_))
    topo = {campo: medicao.global_[campo] for campo in ('nome', 'linha', 'cc', 'aninhamento', 'blocos', 'condicoes')}
    return dict(unidades=medicao.unidades, topo=topo, linhasDeCodigo=linhas_de_codigo(fonte))


def principal():
    fontes = json.load(sys.stdin)
    json.dump({arquivo: medir(fonte) for arquivo, fonte in fontes.items()}, sys.stdout)


if __name__ == '__main__':
    principal()
