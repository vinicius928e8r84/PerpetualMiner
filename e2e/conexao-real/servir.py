"""A Conexão real (o complemento do Anki) para o modo `PM_CONEXAO=real` do e2e.

Sobe `complemento/servidor.Conexao` numa porta livre, com a coleção em memória, a OpenAI e o Firestore de mentira que os
testes do complemento já usam, e fala com o fixture por linhas de JSON: ao ficar pronta escreve
`{"porta": N}`; cada linha lida de stdin é um comando e leva uma linha de resposta:

    {"openai": "recusa"}      muda o comportamento da OpenAI de mentira (as chaves de `COMPORTAMENTOS`)
    {"colecao": {...}}        abre uma coleção descrita como nos exemplos do contrato (`ColecaoEmMemoria`)
    {"estado": true}          responde o que a Conexão guardou: a cópia da chave, os documentos da nuvem, os pedidos à OpenAI
    {"pareamento": "codigo"}  o código que a janela do Anki de mentira mostra agora (ou null); "navegadores": quantos navegadores estão pareados;
                              "desconectar": o botão Desconectar navegadores da janela do Anki; "cancelar": o Cancelar do diálogo do código

A Conexão sobe com os dois navegadores de teste já pareados (complemento/contrato/exemplos-do-pareamento.json), como o fake.

Fecha ao fim de stdin. Nada aqui é produto: é o que o teste põe no lugar do Anki, da OpenAI e do Firestore.
"""

import json
import os
import sys
import tempfile

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

from complemento import configuracao, pasta_de_dados, registro, servidor  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_openai_de_mentira import COMPORTAMENTOS, FirestoreDeMentira, OpenAIDeMentira  # noqa: E402
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, TelaDeMentira, semear  # noqa: E402


class ColecaoQueTroca:
    """O adaptador da coleção que a Conexão lê, apontando para a `ColecaoEmMemoria` que o teste escolheu."""

    def __init__(self):
        self.atual = ColecaoEmMemoria({"baralhos": []})

    def __getattr__(self, nome):
        return getattr(self.atual, nome)


def responder(dados):
    sys.stdout.write(json.dumps(dados, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    pasta = tempfile.mkdtemp(prefix="pm-conexao-real-")
    dados = pasta_de_dados.PastaDeDados(raiz=pasta, **{nome: os.path.join(pasta, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")})
    for destino in dados[1:]:
        os.makedirs(destino, exist_ok=True)
    logger = registro.criar(dados.logs)
    openai, firestore = OpenAIDeMentira("aceita"), FirestoreDeMentira()
    colecao = ColecaoQueTroca()
    semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
    tela = TelaDeMentira()
    conexao = servidor.Conexao(
        porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO, perfil_aberto=lambda: "Usuário 1",
        logger=logger, dados=dados, colecao=colecao, openai_base=openai.base, firestore_base=firestore.base,
        intervalo_de_parada=0.005, trabalhando=False,
    )
    conexao.pareamento.na_tela = tela
    openai.__enter__()
    firestore.__enter__()
    try:
        if not conexao.iniciar():
            raise SystemExit("a porta devia estar livre")
        responder({"porta": conexao.porta})
        for linha in sys.stdin:
            comando = json.loads(linha)
            if "openai" in comando:
                assert comando["openai"] in COMPORTAMENTOS, comando
                openai.comportamento = comando["openai"]
                responder({"ok": True})
            elif "colecao" in comando:
                colecao.atual = ColecaoEmMemoria(comando["colecao"])
                responder({"ok": True})
            elif "pareamento" in comando:
                pedido = comando["pareamento"]
                if pedido == "desconectar":
                    conexao.pareamento.desconectar()
                elif pedido == "cancelar":
                    tela.apertar_cancelar()
                responder({"codigo": tela.codigo if tela.aberta else None, "navegadores": conexao.pareamento.quantos()})
            elif comando.get("estado"):
                caminho = os.path.join(dados.chaves, "openai.json")
                guardada = None
                if os.path.exists(caminho):
                    with open(caminho, encoding="utf-8") as arquivo:
                        guardada = json.load(arquivo)
                responder({"cofre": guardada, "nuvem": firestore.documentos, "pedidosAOpenAI": [list(p) for p in openai.pedidos]})
            else:
                responder({"erro": "comando desconhecido"})
    finally:
        conexao.parar()
        openai.__exit__(None, None, None)
        firestore.__exit__(None, None, None)
        for handler in list(logger.handlers):
            handler.close()


if __name__ == "__main__":
    main()
