import contextlib
import http.client
import json
import os
import sys
from dataclasses import dataclass
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_atualizacao import atualizacao_do_exemplo
from complemento import configuracao, pasta_de_dados, registro, servidor
from complemento.esperas import Esperas
from complemento.montagem_da_conexao import Ambiente, Fronteiras, Porta, montar
from complemento.servicos_de_fora import ServicosDeFora
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_contexto_da_conexao import ChaveGuardadaAntes, item_de_login_do_contexto
from complemento.test_fila_de_mentira import semear_a_fila
from complemento.test_imagens_de_mentira import OpenverseDeMentira
from complemento.test_openai_de_mentira import OpenAIDeMentira, FirestoreDeMentira
from complemento.test_voz_de_mentira import VozDeMentira
from complemento.test_chatgpt_de_mentira import ChatGPTDeMentira, situar_o_login
from complemento.test_modelos_de_mentira import preparar_o_cenario
from complemento.test_pareamento_de_mentira import cabecalhos_assinados, preparar_o_pareamento, recusa_do_porteiro, semear

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos.json")
ORIGEM = configuracao.ORIGENS_ACEITAS[0]


RESPONDIDOS = set()
"""Tudo o que o servidor real respondeu, neste processo, a uma rota que ele tem: (método, caminho, status, `error`).
`tearDownModule` exige um exemplo do contrato para cada um. Ficam de fora a recusa de origem (403), igual em toda rota,
e o que não é rota (404, OPTIONS), que é do contrato de origem."""


def registrar_a_resposta(metodo, caminho, status, corpo):
    if (metodo, caminho.split("?", 1)[0]) not in servidor.ROTAS or status == 403:
        return
    try:
        erro = json.loads(corpo).get("error")
    except (ValueError, AttributeError):
        erro = None
    if recusa_do_porteiro(status, erro, caminho):
        return
    RESPONDIDOS.add((metodo, caminho.split("?", 1)[0], status, erro))


def tearDownModule():
    exemplos = exemplos_do_contrato()
    cobertos = {
        (e["pedido"]["metodo"], e["pedido"]["caminho"], e["resposta"]["status"], (e["resposta"]["json"] or {}).get("error")) for e in exemplos
    }
    sem_exemplo = sorted(RESPONDIDOS - cobertos, key=str)
    if sem_exemplo:
        raise AssertionError(
            "O complemento respondeu o que o contrato (complemento/contrato/exemplos.json) não tem exemplo: %s. "
            "Escreva o exemplo de cada um (o contexto em que acontece e o pedido) e rode de novo; o fake do e2e e o "
            "teste do contrato leem o mesmo arquivo." % "; ".join("%s %s -> %s %s" % estado for estado in sem_exemplo)
        )


def ler_o_contrato():
    with open(CONTRATO, encoding="utf-8") as arquivo:
        contrato = json.load(arquivo)
    pasta = os.path.dirname(CONTRATO)
    for nome in sorted(n for n in os.listdir(pasta) if n.startswith("exemplos-") and n.endswith(".json")):
        with open(os.path.join(pasta, nome), encoding="utf-8") as arquivo:
            for chave, valor in json.load(arquivo).items():
                if isinstance(valor, list):
                    contrato[chave] = contrato.get(chave, []) + valor
                else:
                    repetidos = set(valor) & set(contrato.get(chave, {}))
                    assert not repetidos, "%s: %s de %r já existe em outro arquivo do contrato" % (nome, sorted(repetidos), chave)
                    contrato[chave] = dict(contrato.get(chave, {}), **valor)
    return contrato


def exemplos_do_contrato():
    return ler_o_contrato()["exemplos"]


def colecao_do_exemplo(contexto):
    nome = contexto.get("colecao")
    perfis = tuple(contexto.get("perfis", ("Usuário 1",)))
    if not nome:
        return ColecaoEmMemoria.fechada(perfis=perfis)
    return ColecaoEmMemoria(ler_o_contrato()["colecoes"][nome], perfis=perfis, perfil_aberto=contexto.get("perfil"))


def sucesso(status):
    return 200 <= status < 300


def deve_repetir(exemplo):
    return exemplo["pedido"]["metodo"] == "POST" and sucesso(exemplo["resposta"]["status"])


LOGIN_DO_CHATGPT_CONECTADO = {"client_id": "oaiapp_x", "access_token": "acesso-x", "refresh_token": "renovacao-x", "expira_em": 4e9}


def escrever_json_se_houver(caminho, conteudo):
    if conteudo is None:
        return
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(conteudo, arquivo)


def esperas_do_teste(do_plano, do_teto, do_contato):
    """As esperas de uma Conexão de teste: curtas, menos as três que o teste escolhe."""
    return Esperas(do_anki=0.01, da_openai=(0, 0), do_plano=do_plano, do_teto=do_teto, do_contato=do_contato, do_envio=0.01, da_parada=0.005)


@dataclass(frozen=True)
class Cenario:
    perfil: str = "Usuário 1"
    origens: object = None
    falha_no_perfil: bool = False
    colecao: object = None
    item: object = "desligado"
    openai: str = "aceita"
    chave_na_conexao: object = None
    cofre_sem_escrita: bool = False
    versao_na_conexao: int = 0
    chave_apagada: bool = False
    conta_na_conexao: object = None
    nao_enviada: bool = True
    hora_na_conexao: int = 0
    firebase: int = 0
    trabalhando: bool = False
    espera_do_contato: float = 0.0
    chatgpt: object = None
    perfil_marcado: object = None
    adaptador_de_imagem: object = None
    espera_do_plano: int = 300
    modelo: object = None
    voz_responde: str = "aceita"
    hoje: object = None
    teto: object = None
    atualizacao: object = None
    ankiweb: object = None
    espera_do_teto: int = 60
    pareado: bool = True
    tela: bool = True
    estado_do_pareamento: object = None

    def chave_guardada(self):
        return ChaveGuardadaAntes(
            self.chave_na_conexao, self.versao_na_conexao, self.chave_apagada, self.conta_na_conexao, self.hora_na_conexao, self.nao_enviada).no_arquivo()

    def esperas(self):
        return esperas_do_teste(self.espera_do_plano, self.espera_do_teto, self.espera_do_contato)


@dataclass(frozen=True)
class Pedido:
    origem: object = ORIGEM
    cabecalhos: object = None
    corpo: object = None
    corpo_bruto: object = None
    assinar: bool = True


def corpo_em_bytes(pedido):
    corpo = pedido.corpo_bruto
    if pedido.corpo is not None:
        corpo = pedido.corpo if isinstance(pedido.corpo, bytes) else json.dumps(pedido.corpo)
    return corpo.encode("utf-8") if isinstance(corpo, str) else corpo


def cabecalhos_do_pedido(pedido, corpo, sessao, alvo):
    metodo, caminho = alvo
    enviados = {}
    if pedido.origem is not None:
        enviados["Origin"] = pedido.origem
    if corpo is not None:
        enviados["Content-Type"] = "application/json"
    if pedido.assinar:
        enviados.update(cabecalhos_assinados(sessao, metodo, caminho.split("?", 1)[0], corpo or b""))
    enviados.update(pedido.cabecalhos or {})
    return enviados


class ConexaoNoTeste:
    def __init__(self, pasta, **cenario):
        como = Cenario(**cenario)
        self.perfil = como.perfil
        self._com_tela, self._estado_do_pareamento = como.tela, como.estado_do_pareamento or {}
        self.situacao_do_chatgpt = como.chatgpt
        self.falha_no_perfil = como.falha_no_perfil
        self.pasta = pasta
        self.item = item_de_login_do_contexto(pasta, como.item)
        self.dados = pasta_de_dados.PastaDeDados(raiz=pasta, **{nome: os.path.join(pasta, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")})
        self.logs, self.chaves = self.dados.logs, self.dados.chaves
        for pasta_ in self.dados[1:]:
            os.makedirs(pasta_, exist_ok=True)
        self.cofre_sem_escrita = como.cofre_sem_escrita
        self._semear(como)
        self._criar_os_servicos_de_mentira(como)
        self.logger = registro.criar(self.logs)
        pecas = self._montar(como)
        self.conexao = servidor.Conexao(Porta(0, como.origens or configuracao.ORIGENS_ACEITAS), pecas if como.trabalhando else pecas.sem_trabalhador(), self._ler_o_perfil)

    def _semear(self, como):
        escrever_json_se_houver(os.path.join(self.chaves, "openai.json"), como.chave_guardada())
        escrever_json_se_houver(os.path.join(self.pasta, "perfil.json"), None if como.perfil_marcado is None else {"perfil": como.perfil_marcado})
        escrever_json_se_houver(os.path.join(self.chaves, "chatgpt.json"), LOGIN_DO_CHATGPT_CONECTADO if como.chatgpt == "conectada" else None)
        escrever_json_se_houver(os.path.join(self.pasta, "teto-do-mes.json"), None if como.teto is None else {"limitUsd": como.teto})
        if como.pareado:
            semear(os.path.join(self.pasta, "pareamento.json"))

    def _criar_os_servicos_de_mentira(self, como):
        self.de_mentira = (self.openai, self.openverse, self.voz, self.firestore) = (
            OpenAIDeMentira(como.openai), OpenverseDeMentira(), VozDeMentira(), FirestoreDeMentira())
        self.firestore.falha = como.firebase
        if como.voz_responde in ("recusada", "fora_do_ar"):
            self.voz.recusar("*", 400 if como.voz_responde == "recusada" else 503)
        self.openai.recusa_da_fala = {"chave_recusada": (401, "invalid_api_key"), "sem_credito": (429, "insufficient_quota")}.get(como.voz_responde)
        self.servidor_de_login = ChatGPTDeMentira()
        self.de_mentira += (self.servidor_de_login,)

    def _montar(self, como):
        do_modelo = dict(preparar_o_cenario(como.modelo, self.pasta, self.openai), **({"hoje": como.hoje} if como.hoje else {}))
        servicos = ServicosDeFora(
            openai=self.openai.base, openverse=self.openverse.base, voz=self.voz.base, firestore=self.firestore.base, chatgpt=self.servidor_de_login.base)
        fronteiras = Fronteiras(
            colecao=como.colecao, item_de_login=self.item, atualizacao=atualizacao_do_exemplo(self.pasta, como.atualizacao, como.ankiweb, self.logger),
            adaptador_de_imagem=como.adaptador_de_imagem, **do_modelo)
        return montar(Ambiente(self.dados, self.logger, configuracao.VERSAO), servicos, como.esperas(), fronteiras)

    def _ler_o_perfil(self):
        if self.falha_no_perfil:
            raise RuntimeError("perfil ilegível")
        return self.perfil

    def __enter__(self):
        for de_mentira in self.de_mentira:
            de_mentira.__enter__()
        if self.cofre_sem_escrita:
            os.chmod(self.chaves, 0o500)
        self.tela = preparar_o_pareamento(self.conexao.pareamento, self._com_tela, self._estado_do_pareamento)
        assert self.conexao.iniciar(), "a porta de teste devia estar livre"
        if self.situacao_do_chatgpt in ("entrando", "recusou", "nao_serve", "acabou"):
            situar_o_login(self.conexao, self.servidor_de_login, self.situacao_do_chatgpt)
        return self

    def __exit__(self, *erro):
        if self.cofre_sem_escrita:
            os.chmod(self.chaves, 0o700)
        self.conexao.parar()
        for de_mentira in self.de_mentira:
            de_mentira.__exit__(*erro)
        for handler in list(self.logger.handlers):
            handler.close()

    def pedir(self, metodo, caminho, **como):
        pedido = Pedido(**como)
        corpo_bruto = corpo_em_bytes(pedido)
        enviados = cabecalhos_do_pedido(pedido, corpo_bruto, self.conexao.pareamento.sessao, (metodo, caminho))
        conexao = http.client.HTTPConnection("127.0.0.1", self.conexao.porta, timeout=30)
        try:
            conexao.request(metodo, caminho, body=corpo_bruto, headers=enviados)
            resposta = conexao.getresponse()
            lido = resposta.read()
            registrar_a_resposta(metodo, caminho, resposta.status, lido)
            return resposta.status, dict(resposta.getheaders()), lido
        finally:
            conexao.close()

    def log(self):
        with open(os.path.join(self.logs, "complemento.log"), encoding="utf-8") as arquivo:
            return arquivo.read()


@contextlib.contextmanager
def conexao_do_exemplo(pasta, exemplo):
    contexto = exemplo["contexto"]
    if contexto.get("fila"):
        semear_a_fila(pasta, ler_o_contrato()["filas"][contexto["fila"]])
    with ConexaoNoTeste(
        pasta,
        perfil=contexto.get("perfil", "Usuário 1"),
        falha_no_perfil=contexto.get("falhaNoPerfil", False),
        colecao=colecao_do_exemplo(contexto),
        item=contexto.get("itemDeLogin", "desligado"),
        openai=contexto.get("openai", "aceita"),
        chave_na_conexao=contexto.get("chaveNaConexao"),
        cofre_sem_escrita=contexto.get("cofre") == "sem_escrita",
        versao_na_conexao=contexto.get('versaoNaConexao', 0),
        chave_apagada=contexto.get('chaveApagada', False),
        conta_na_conexao=contexto.get('contaNaConexao'),
        nao_enviada=contexto.get('naoEnviada', True),
        hora_na_conexao=contexto.get('emNaConexao', 0),
        firebase=contexto.get('firebase', 0),
        chatgpt=contexto.get("chatgpt"),
        perfil_marcado=contexto.get('perfilMarcado'),
        modelo=ler_o_contrato().get("modelos", {}).get(contexto.get("modelo")),
        voz_responde=contexto.get("voz", "aceita"),
        hoje=(lambda: date.fromisoformat(contexto["hoje"])) if contexto.get("hoje") else None,
        teto=contexto.get("tetoUsd"),
        atualizacao=contexto.get("atualizacao"),
        ankiweb=contexto.get("ankiweb"),
        pareado=contexto.get("pareado", True),
        tela=not contexto.get("semTela", False),
        estado_do_pareamento=contexto,
    ) as conexao:
        if 'chaveNaNuvem' in contexto:
            conexao.firestore.documentos['uid-teste'] = {
                'chave': {'stringValue': contexto['chaveNaNuvem']}, 'em': {'integerValue': str(contexto.get('emNaNuvem', 100))},
            }
        yield conexao
