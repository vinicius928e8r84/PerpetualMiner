"""A Conexão real (o complemento do Anki) para o modo `PM_CONEXAO=real` do e2e.

Sobe `complemento/servidor.Conexao` numa porta livre, com a coleção em memória e, no lugar de tudo o que ela pediria à internet, os
de mentira que os testes do complemento já usam (a OpenAI, o Firestore, a voz do Google, o Openverse e o servidor de login do ChatGPT),
e fala com o fixture por linhas de JSON: ao ficar pronta escreve `{"porta": N}`; cada linha lida de stdin é um comando e leva uma linha de resposta:

    {"openai": "recusa"}      muda o comportamento da OpenAI de mentira (as chaves de `COMPORTAMENTOS`)
    {"colecao": {...}}        abre uma coleção descrita como nos exemplos do contrato (`ColecaoEmMemoria`)
    {"mundo": {"colecao": {...}, "perfil": "...", "perfis": {"lista", "marcado"}}}  o mundo que o fake montou (`fakes.anki.naFrente`):
                              a coleção aberta no perfil, ou, com `perfil` null, o Anki na tela de perfis (a coleção fechada); com
                              `perfis`, os perfis do Anki e o marcado (`definirPerfis`; null: a primeira conexão)
    {"perfis": true}          os perfis como a Conexão os tem agora: `{lista, marcado, aberto}`
    {"mudar": {"jobId", "state"}}  o estado que o fake deu ao Envio (`moverEnvio`, `concluirEnvio`), gravado pelo portão `Fila.mudar`:
                              uma transição que a máquina não aceita volta `{"erro": ...}`
    {"criar": {...}}          um Envio que chega sem a extensão (`receberEnvio`), pelo `Fila.criar`
    {"chave": {...} | null}   o `chaves/openai.json` que o teste deu à Conexão (`guardarChaveNaConexao`, `guardarRemocaoNaConexao`; null:
                              `esquecerAChave`), escrito como nos testes do complemento
    {"login": "situacao"}     o login do ChatGPT na situação que o teste deu (`chatgpt.definir`): `conectada` (o arquivo dos tokens),
                              `desconectada` (sem arquivo) ou uma das de `situar_o_login`, contra o servidor de login de mentira daqui
    {"login": true}           a situação do login agora, nos nomes do fake (`conectada`, `entrando`, `recusou`, `nao_serve`, `acabou`, `desconectada`)
    {"fila": "nome"}          a fila de um exemplo do contrato (`filas`; `definirFila`), semeada como nos testes do complemento
    {"apagarFrases": true}    o Apagar tudo feito por fora do pedido (`apagarAsFrases`), pelo `Fila.apagar_as_frases`
    {"envios": true}          os Envios que a fila guardou, na ordem: `{jobId, lang, corpo (o pedido como as rotas o mostram), createdAt, state}`
    {"estado": true}          responde o que a Conexão guardou: a cópia da chave, os documentos da nuvem, os pedidos à OpenAI,
                              as falas que a voz de mentira ouviu e a pasta de dados (apagada ao fechar)
    {"pareamento": "codigo"}  o código que a janela do Anki de mentira mostra agora (ou null); "navegadores": quantos navegadores estão pareados;
                              "desconectar": o botão Desconectar navegadores da janela do Anki; "cancelar": o Cancelar do diálogo do código

A Conexão sobe com os dois navegadores de teste já pareados (complemento/contrato/exemplos-do-pareamento.json), como o fake.

Fecha ao fim de stdin, e a pasta de dados vai junto. Nada aqui é produto: é o que o teste põe no lugar do Anki e da internet.
"""

import contextlib
import json
import os
import shutil
import sys
import tempfile

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

from complemento import configuracao, envio, pasta_de_dados, registro, servidor
from complemento.login_do_chatgpt import NAO_SERVE, SEM_ACESSO
from complemento.test_chatgpt_de_mentira import ChatGPTDeMentira, situar_o_login
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_fila_de_mentira import semear_a_fila
from complemento.test_harness import ler_o_contrato
from complemento.test_imagens_de_mentira import OpenverseDeMentira
from complemento.test_openai_de_mentira import COMPORTAMENTOS, FirestoreDeMentira, OpenAIDeMentira
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, TelaDeMentira, semear
from complemento.test_voz_de_mentira import VozDeMentira

PASTAS_DE_DADOS = ("fila", "estado", "custos", "logs", "chaves")
ARQUIVO_DA_CHAVE, ARQUIVO_DO_LOGIN = "openai.json", "chatgpt.json"
LOGIN_CONECTADO = {"client_id": "oaiapp_x", "access_token": "acesso-x", "refresh_token": "renovacao-x", "expira_em": 4e9}
FALHAS_DO_LOGIN = {SEM_ACESSO: "recusou", NAO_SERVE: "nao_serve"}


class ColecaoQueTroca:
    """O adaptador da coleção que a Conexão lê, apontando para a `ColecaoEmMemoria` que o teste escolheu."""

    def __init__(self):
        self.atual = ColecaoEmMemoria({"baralhos": []})

    def __getattr__(self, nome):
        return getattr(self.atual, nome)


def responder(dados):
    sys.stdout.write(json.dumps(dados, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def ler_json(caminho):
    if not os.path.exists(caminho):
        return None
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def gravar_json(caminho, conteudo):
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(conteudo, arquivo)


def apagar_se_existe(caminho):
    if os.path.exists(caminho):
        os.remove(caminho)


def nome_do_login(estado):
    """A situação do login nos nomes do fake: a que a Conexão diz, ou a falha que ela guarda."""
    if estado["conectada"]:
        return "conectada"
    if estado["entrando"]:
        return "entrando"
    return "acabou" if estado["acabou"] else FALHAS_DO_LOGIN.get(estado["falha"]) or "desconectada"


def o_envio_como_o_fake_o_espelha(fila, item):
    pedido = envio.visao_do_pedido(fila.pedido(item["jobId"]))
    corpo = {chave: valor for chave, valor in pedido.items() if chave != "createdAt"}
    return {"jobId": item["jobId"], "lang": pedido["lang"], "corpo": corpo, "createdAt": pedido.get("createdAt"), "state": fila.estado(item["jobId"])}


class MundoDeMentira:
    """A Conexão real e, no lugar de tudo o que ela pediria à internet e ao Anki, os de mentira; cada método de comando faz o que o teste mandou o mundo ficar."""

    def __init__(self):
        self.pasta = tempfile.mkdtemp(prefix="pm-conexao-real-")
        self.dados = pasta_de_dados.PastaDeDados(raiz=self.pasta, **{nome: os.path.join(self.pasta, nome) for nome in PASTAS_DE_DADOS})
        for destino in self.dados[1:]:
            os.makedirs(destino, exist_ok=True)
        self.logger = registro.criar(self.dados.logs)
        self.openai, self.firestore, self.voz = OpenAIDeMentira("aceita"), FirestoreDeMentira(), VozDeMentira()
        self.openverse, self.login = OpenverseDeMentira(), ChatGPTDeMentira()
        self.colecao, self.tela = ColecaoQueTroca(), TelaDeMentira()
        semear(os.path.join(self.pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
        self.conexao = self._montar_a_conexao()
        self.conexao.pareamento.na_tela = self.tela

    def _montar_a_conexao(self):
        return servidor.Conexao(
            porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO, perfil_aberto=lambda: self.colecao.perfil_aberto(),
            logger=self.logger, dados=self.dados, colecao=self.colecao, openai_base=self.openai.base, firestore_base=self.firestore.base,
            voz_base=self.voz.base, openverse_base=self.openverse.base, chatgpt_base=self.login.base, intervalo_de_parada=0.005, trabalhando=False,
        )

    def servicos_de_mentira(self):
        return (self.openai, self.firestore, self.voz, self.openverse, self.login)

    def fechar(self):
        self.conexao.parar()
        for servico in self.servicos_de_mentira():
            servico.__exit__(None, None, None)
        for handler in list(self.logger.handlers):
            handler.close()
        shutil.rmtree(self.pasta, ignore_errors=True)

    def _abrir_a_colecao(self, colecao):
        self.colecao.atual = colecao
        colecao.fixar_o_perfil(self.conexao.perfil_fixo)

    def _caminho_da_chave(self):
        return os.path.join(self.dados.chaves, ARQUIVO_DA_CHAVE)

    def trocar_a_openai(self, comportamento):
        assert comportamento in COMPORTAMENTOS, comportamento
        self.openai.comportamento = comportamento
        return {"ok": True}

    def trocar_a_colecao(self, descricao):
        self._abrir_a_colecao(ColecaoEmMemoria(descricao))
        return {"ok": True}

    def montar_o_mundo(self, mundo):
        perfil, perfis = mundo.get("perfil"), mundo.get("perfis")
        lista = tuple(perfis["lista"]) if perfis else ("Usuário 1",)
        self._abrir_a_colecao(ColecaoEmMemoria(mundo["colecao"], perfis=lista, perfil_aberto=perfil) if perfil else ColecaoEmMemoria.fechada(perfis=lista))
        if perfis and perfis["marcado"]:
            self.conexao.perfil_fixo.marcar(perfis["marcado"])
        elif perfis:
            apagar_se_existe(self.conexao.perfil_fixo._caminho)
        return {"ok": True}

    def dizer_os_perfis(self, _):
        return {"perfis": {"lista": list(self.colecao.perfis()), "marcado": self.conexao.perfil_fixo.marcado(), "aberto": self.colecao.perfil_aberto()}}

    def mover_o_envio(self, pedido):
        novo = pedido["state"]
        try:
            self.conexao.fila.mudar(pedido["jobId"], lambda estado: (estado.clear(), estado.update(novo)))
        except (ValueError, TypeError) as erro:
            return {"erro": str(erro)}
        return {"ok": True}

    def guardar_a_chave_na_conexao(self, chave):
        if chave is None:
            apagar_se_existe(self._caminho_da_chave())
        else:
            gravar_json(self._caminho_da_chave(), chave)
        return {"ok": True}

    def dizer_o_login(self, _):
        return {"login": nome_do_login(self.conexao.chatgpt.estado())}

    def situar_o_login_do_chatgpt(self, situacao):
        arquivo = os.path.join(self.dados.chaves, ARQUIVO_DO_LOGIN)
        apagar_se_existe(arquivo)
        if situacao == "conectada":
            gravar_json(arquivo, LOGIN_CONECTADO)
        elif situacao != "desconectada":
            situar_o_login(self.conexao, self.login, situacao)
        return {"ok": True}

    def semear_a_fila_do_contrato(self, nome):
        semear_a_fila(self.dados.raiz, ler_o_contrato()["filas"][nome])
        return {"ok": True}

    def apagar_as_frases(self, _):
        self.conexao.fila.apagar_as_frases()
        return {"ok": True}

    def receber_um_envio(self, pedido):
        status, resposta = self.conexao.fila.criar(pedido)
        return {"status": status, "resposta": resposta} if status < 300 else {"erro": json.dumps(resposta)}

    def listar_os_envios(self, _):
        fila = self.conexao.fila
        return {"envios": [o_envio_como_o_fake_o_espelha(fila, item) for item in fila.ordem()]}

    def mexer_na_janela_do_pareamento(self, pedido):
        if pedido == "desconectar":
            self.conexao.pareamento.desconectar()
        elif pedido == "cancelar":
            self.tela.apertar_cancelar()
        return {"codigo": self.tela.codigo if self.tela.aberta else None, "navegadores": self.conexao.pareamento.quantos()}

    def dizer_o_estado(self, _):
        return {"cofre": ler_json(self._caminho_da_chave()), "nuvem": self.firestore.documentos, "pedidosAOpenAI": [list(p) for p in self.openai.pedidos],
                "falas": [list(p) for p in self.voz.pedidos], "pasta": self.pasta}

    def responder_ao(self, comando):
        for chave, vale, quem_responde in COMANDOS:
            if chave in comando and vale(comando[chave]):
                return quem_responde(self, comando[chave])
        return {"erro": "comando desconhecido"}


def qualquer_valor(valor):
    return True


def so_verdadeiro(valor):
    return valor is True


COMANDOS = (
    ("openai", qualquer_valor, MundoDeMentira.trocar_a_openai),
    ("colecao", qualquer_valor, MundoDeMentira.trocar_a_colecao),
    ("mundo", qualquer_valor, MundoDeMentira.montar_o_mundo),
    ("perfis", bool, MundoDeMentira.dizer_os_perfis),
    ("mudar", qualquer_valor, MundoDeMentira.mover_o_envio),
    ("chave", qualquer_valor, MundoDeMentira.guardar_a_chave_na_conexao),
    ("login", so_verdadeiro, MundoDeMentira.dizer_o_login),
    ("login", qualquer_valor, MundoDeMentira.situar_o_login_do_chatgpt),
    ("fila", qualquer_valor, MundoDeMentira.semear_a_fila_do_contrato),
    ("apagarFrases", bool, MundoDeMentira.apagar_as_frases),
    ("criar", qualquer_valor, MundoDeMentira.receber_um_envio),
    ("envios", bool, MundoDeMentira.listar_os_envios),
    ("pareamento", qualquer_valor, MundoDeMentira.mexer_na_janela_do_pareamento),
    ("estado", bool, MundoDeMentira.dizer_o_estado),
)


@contextlib.contextmanager
def mundo_de_mentira():
    mundo = MundoDeMentira()
    for servico in mundo.servicos_de_mentira():
        servico.__enter__()
    try:
        if not mundo.conexao.iniciar():
            raise SystemExit("a porta devia estar livre")
        yield mundo
    finally:
        mundo.fechar()


def main():
    with mundo_de_mentira() as mundo:
        responder({"porta": mundo.conexao.porta})
        for linha in sys.stdin:
            responder(mundo.responder_ao(json.loads(linha)))


if __name__ == "__main__":
    main()
