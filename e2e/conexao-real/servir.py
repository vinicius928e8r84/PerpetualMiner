import json
import os
import shutil
import sys
import tempfile

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

from complemento import configuracao, envio, pasta_de_dados, registro, servidor
from complemento.esperas import Esperas
from complemento.montagem_da_conexao import Ambiente, Fronteiras, Porta, montar
from complemento.servicos_de_fora import ServicosDeFora
from complemento.login_do_chatgpt import NAO_SERVE, SEM_ACESSO
from complemento.test_chatgpt_de_mentira import ChatGPTDeMentira, situar_o_login
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_fila_de_mentira import semear_a_fila
from complemento.test_harness import ler_o_contrato
from complemento.test_imagens_de_mentira import OpenverseDeMentira
from complemento.test_openai_de_mentira import COMPORTAMENTOS, FirestoreDeMentira, OpenAIDeMentira
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, TelaDeMentira, semear
from complemento.test_voz_de_mentira import VozDeMentira


class ColecaoQueTroca:
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
    servicos = ServicosDeFora(openai=openai.base, openverse=openverse.base, voz=voz.base, firestore=firestore.base, chatgpt=login.base)
    pecas = montar(Ambiente(dados, logger, configuracao.VERSAO), servicos, Esperas(da_parada=0.005), Fronteiras(colecao=colecao))
    conexao = servidor.Conexao(Porta(0), pecas.sem_trabalhador(), lambda: colecao.perfil_aberto())
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
                perfil, perfis = comando["mundo"].get("perfil"), comando["mundo"].get("perfis")
                lista = tuple(perfis["lista"]) if perfis else ("Usuário 1",)
                colecao.atual = ColecaoEmMemoria(comando["mundo"]["colecao"], perfis=lista, perfil_aberto=perfil) if perfil else ColecaoEmMemoria.fechada(perfis=lista)
                colecao.atual.fixar_o_perfil(conexao.perfil_fixo)
                if perfis and perfis["marcado"]:
                    conexao.perfil_fixo.marcar(perfis["marcado"])
                elif perfis and os.path.exists(conexao.perfil_fixo._caminho):
                    os.remove(conexao.perfil_fixo._caminho)
                responder({"ok": True})
            elif comando.get("perfis"):
                responder({"perfis": {"lista": list(colecao.perfis()), "marcado": conexao.perfil_fixo.marcado(), "aberto": colecao.perfil_aberto()}})
            elif "mudar" in comando:
                novo = comando["mudar"]["state"]
                try:
                    conexao.fila.mudar(comando["mudar"]["jobId"], lambda estado: (estado.clear(), estado.update(novo)))
                    responder({"ok": True})
                except (ValueError, TypeError) as erro:
                    responder({"erro": str(erro)})
            elif "chave" in comando:
                caminho = os.path.join(dados.chaves, "openai.json")
                if comando["chave"] is None:
                    if os.path.exists(caminho):
                        os.remove(caminho)
                else:
                    with open(caminho, "w", encoding="utf-8") as arquivo:
                        json.dump(comando["chave"], arquivo)
                responder({"ok": True})
            elif comando.get("login") is True:
                agora = conexao.chatgpt.estado()
                falha = {SEM_ACESSO: "recusou", NAO_SERVE: "nao_serve"}.get(agora["falha"])
                responder({"login": "conectada" if agora["conectada"] else "entrando" if agora["entrando"] else "acabou" if agora["acabou"] else falha or "desconectada"})
            elif "login" in comando:
                arquivo = os.path.join(dados.chaves, "chatgpt.json")
                if os.path.exists(arquivo):
                    os.remove(arquivo)
                if comando["login"] == "conectada":
                    with open(arquivo, "w", encoding="utf-8") as escrito:
                        json.dump({"client_id": "oaiapp_x", "access_token": "acesso-x", "refresh_token": "renovacao-x", "expira_em": 4e9}, escrito)
                elif comando["login"] != "desconectada":
                    situar_o_login(conexao, login, comando["login"])
                responder({"ok": True})
            elif "fila" in comando:
                semear_a_fila(dados.raiz, ler_o_contrato()["filas"][comando["fila"]])
                responder({"ok": True})
            elif comando.get("apagarFrases"):
                conexao.fila.apagar_as_frases()
                responder({"ok": True})
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
