"""A Conexão real (o complemento do Anki) para o modo `PM_CONEXAO=real` do e2e.

Sobe `complemento/servidor.Conexao` numa porta livre, com a coleção em memória e, no lugar de tudo o que ela pediria à internet, os
de mentira que os testes do complemento já usam (a OpenAI, o Firestore, a voz do Google, o Openverse e o servidor de login do ChatGPT),
e fala com o fixture por linhas de JSON: ao ficar pronta escreve `{"porta": N}`; cada linha lida de stdin é um comando e leva uma linha de resposta:

    {"openai": "recusa"}      muda o comportamento da OpenAI de mentira (as chaves de `COMPORTAMENTOS`)
    {"colecao": {...}}        abre uma coleção descrita como nos exemplos do contrato (`ColecaoEmMemoria`)
    {"mundo": {"colecao": {...}, "perfil": "..."}}  o mundo que o fake montou (`fakes.anki.naFrente`): a coleção aberta no perfil, ou,
                              com `perfil` null, o Anki na tela de perfis (a coleção fechada)
    {"mudar": {"jobId", "state"}}  o estado que o fake deu ao Envio (`moverEnvio`, `concluirEnvio`), gravado pelo portão `Fila.mudar`:
                              uma transição que a máquina não aceita volta `{"erro": ...}`
    {"criar": {...}}          um Envio que chega sem a extensão (`receberEnvio`), pelo `Fila.criar`
    {"envios": true}          os Envios que a fila guardou, na ordem: `{jobId, lang, corpo (o pedido como as rotas o mostram), createdAt, state}`
    {"estado": true}          responde o que a Conexão guardou: a cópia da chave, os documentos da nuvem, os pedidos à OpenAI,
                              as falas que a voz de mentira ouviu e a pasta de dados (apagada ao fechar)
    {"pareamento": "codigo"}  o código que a janela do Anki de mentira mostra agora (ou null); "navegadores": quantos navegadores estão pareados;
                              "desconectar": o botão Desconectar navegadores da janela do Anki; "cancelar": o Cancelar do diálogo do código

A Conexão sobe com os dois navegadores de teste já pareados (complemento/contrato/exemplos-do-pareamento.json), como o fake.

Fecha ao fim de stdin, e a pasta de dados vai junto. Nada aqui é produto: é o que o teste põe no lugar do Anki e da internet.
"""

import json
import os
import shutil
import sys
import tempfile

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

from complemento import configuracao, envio, pasta_de_dados, registro, servidor
from complemento.test_chatgpt_de_mentira import ChatGPTDeMentira
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_imagens_de_mentira import OpenverseDeMentira
from complemento.test_openai_de_mentira import COMPORTAMENTOS, FirestoreDeMentira, OpenAIDeMentira
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, TelaDeMentira, semear
from complemento.test_voz_de_mentira import VozDeMentira


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
    openai, firestore, voz, openverse, login = OpenAIDeMentira("aceita"), FirestoreDeMentira(), VozDeMentira(), OpenverseDeMentira(), ChatGPTDeMentira()
    de_mentira = (openai, firestore, voz, openverse, login)
    colecao = ColecaoQueTroca()
    semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
    tela = TelaDeMentira()
    conexao = servidor.Conexao(
        porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO, perfil_aberto=lambda: colecao.perfil_aberto(),
        logger=logger, dados=dados, colecao=colecao, openai_base=openai.base, firestore_base=firestore.base,
        voz_base=voz.base, openverse_base=openverse.base, chatgpt_base=login.base, intervalo_de_parada=0.005, trabalhando=False,
    )
    conexao.pareamento.na_tela = tela
    for servico in de_mentira:
        servico.__enter__()
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
                colecao.atual.fixar_o_perfil(conexao.perfil_fixo)
                responder({"ok": True})
            elif "mundo" in comando:
                perfil = comando["mundo"].get("perfil")
                colecao.atual = ColecaoEmMemoria(comando["mundo"]["colecao"], perfil_aberto=perfil) if perfil else ColecaoEmMemoria.fechada()
                colecao.atual.fixar_o_perfil(conexao.perfil_fixo)
                responder({"ok": True})
            elif "mudar" in comando:
                novo = comando["mudar"]["state"]
                try:
                    conexao.fila.mudar(comando["mudar"]["jobId"], lambda estado: (estado.clear(), estado.update(novo)))
                    responder({"ok": True})
                except (ValueError, TypeError) as erro:
                    responder({"erro": str(erro)})
            elif "criar" in comando:
                status, resposta = conexao.fila.criar(comando["criar"])
                responder({"status": status, "resposta": resposta} if status < 300 else {"erro": json.dumps(resposta)})
            elif comando.get("envios"):
                lista = []
                for item in conexao.fila.ordem():
                    pedido = envio.visao_do_pedido(conexao.fila.pedido(item["jobId"]))
                    corpo = {chave: valor for chave, valor in pedido.items() if chave != "createdAt"}
                    lista.append({"jobId": item["jobId"], "lang": pedido["lang"], "corpo": corpo, "createdAt": pedido.get("createdAt"), "state": conexao.fila.estado(item["jobId"])})
                responder({"envios": lista})
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
                responder({"cofre": guardada, "nuvem": firestore.documentos, "pedidosAOpenAI": [list(p) for p in openai.pedidos],
                           "falas": [list(p) for p in voz.pedidos], "pasta": pasta})
            else:
                responder({"erro": "comando desconhecido"})
    finally:
        conexao.parar()
        for servico in de_mentira:
            servico.__exit__(None, None, None)
        for handler in list(logger.handlers):
            handler.close()
        shutil.rmtree(pasta, ignore_errors=True)


if __name__ == "__main__":
    main()
