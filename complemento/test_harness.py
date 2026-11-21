"""O harness da Conexão com o Anki vista de fora: a Conexão real numa porta livre (`ConexaoNoTeste`), o contrato que os exemplos leem e o que
o servidor respondeu (apoio de `test_servidor.py`, `test_servidor_estados.py`, `test_servidor_repeticao.py` e dos testes que sobem a Conexão).

Não é teste: fica fora do `.ankiaddon` pelo nome. `tearDownModule` fica aqui e cada arquivo de teste de rotas o importa: ao fim do arquivo,
exige um exemplo do contrato para cada resposta registrada.
"""

import contextlib
import http.client
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_atualizacao import atualizacao_do_exemplo
from complemento import configuracao, pasta_de_dados, registro, servidor
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
    """O contrato inteiro: `exemplos.json` e os `exemplos-*.json` ao lado dele, juntos (o mesmo que `contrato/carregar.js` faz)."""
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
    """A coleção do contexto do exemplo: a que ele nomeia em `colecoes`, ou o Anki sem coleção aberta."""
    nome = contexto.get("colecao")
    perfis = tuple(contexto.get("perfis", ("Usuário 1",)))
    if not nome:
        return ColecaoEmMemoria.fechada(perfis=perfis)
    return ColecaoEmMemoria(ler_o_contrato()["colecoes"][nome], perfis=perfis, perfil_aberto=contexto.get("perfil"))


def sucesso(status):
    """O pedido deu certo: 200, ou 201 do Envio criado."""
    return 200 <= status < 300


def deve_repetir(exemplo):
    """Todo `POST` que dá 2xx é pedido uma segunda vez: igual na resposta e no que fica guardado, ou o exemplo declara
    `"repetivel": false` e o `porque` (e o teste exige que repetir de fato mude algo)."""
    return exemplo["pedido"]["metodo"] == "POST" and sucesso(exemplo["resposta"]["status"])


class ConexaoNoTeste:
    """A Conexão real numa porta livre, com o perfil que o teste escolher e uma OpenAI de mentira.

    `chave_na_conexao`: os 4 últimos caracteres de uma chave que a Conexão já guardava antes de o teste começar.
    `colecao`: o adaptador da coleção do Anki.
    `item`: o item de login de “Abrir o Anki com o computador” (`item_de_login_do_contexto`).
    `adaptador_de_imagem`: converte imagem no lugar do Qt do Anki.
    `trabalhando`: a thread do Envio ligada (`test_envio.py`; `espera_do_contato`: quanto ela espera a extensão, 0 aqui); desligada, os Envios ficam na fila.
    `chatgpt`: `conectada` (o arquivo do login já existe) ou o que `situar_o_login` arma.
    `perfil_marcado`: o perfil fixo que a Conexão marcou antes de o teste começar.
    `voz_responde` (o `voz` dos exemplos): `aceita`, `recusada` (o Google dá 400), `fora_do_ar` (503), `chave_recusada` ou `sem_credito` (a OpenAI).
    `modelo`: o cenário de `modelos` do contrato (#157); `hoje`: o relógio.
    `teto`: o teto do mês (#160) que a pessoa já tinha posto.
    `pareado`: o navegador de teste já se pareou, e `pedir` assina como ele.
    `cofre_sem_escrita`: gravar a cópia da chave falha, e a Conexão responde o erro interno.
    """

    def __init__(
        self,
        pasta,
        perfil="Usuário 1",
        origens=None,
        falha_no_perfil=False,
        colecao=None,
        item="desligado",
        openai="aceita",
        chave_na_conexao=None,
        cofre_sem_escrita=False,
        versao_na_conexao=0,
        chave_apagada=False,
        conta_na_conexao=None,
        nao_enviada=True,
        hora_na_conexao=0,
        firebase=0,
        trabalhando=False,
        espera_do_contato=0.0,
        chatgpt=None,
        perfil_marcado=None,
        adaptador_de_imagem=None,
        espera_do_plano=300,
        modelo=None,
        voz_responde="aceita",
        hoje=None,
        teto=None,
        atualizacao=None,
        ankiweb=None,
        espera_do_teto=60,
        pareado=True,
        tela=True,
        estado_do_pareamento=None,
    ):
        self.perfil = perfil
        self._com_tela, self._estado_do_pareamento = tela, estado_do_pareamento or {}
        self.situacao_do_chatgpt = chatgpt
        self.falha_no_perfil = falha_no_perfil
        self.pasta = pasta
        self.item = item_de_login_do_contexto(pasta, item)
        self.dados = pasta_de_dados.PastaDeDados(raiz=pasta, **{nome: os.path.join(pasta, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")})
        self.logs, self.chaves = self.dados.logs, self.dados.chaves
        for pasta_ in self.dados[1:]:
            os.makedirs(pasta_, exist_ok=True)
        antes = ChaveGuardadaAntes(chave_na_conexao, versao_na_conexao, chave_apagada, conta_na_conexao, hora_na_conexao, nao_enviada).no_arquivo()
        if antes is not None:
            with open(os.path.join(self.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                json.dump(antes, arquivo)
        if perfil_marcado is not None:
            with open(os.path.join(pasta, "perfil.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"perfil": perfil_marcado}, arquivo)
        self.de_mentira = (self.openai, self.openverse, self.voz, self.firestore) = (
            OpenAIDeMentira(openai), OpenverseDeMentira(), VozDeMentira(), FirestoreDeMentira())
        self.firestore.falha = firebase
        if voz_responde in ("recusada", "fora_do_ar"):
            self.voz.recusar("*", 400 if voz_responde == "recusada" else 503)
        self.openai.recusa_da_fala = {"chave_recusada": (401, "invalid_api_key"), "sem_credito": (429, "insufficient_quota")}.get(voz_responde)
        self.servidor_de_login = ChatGPTDeMentira()
        self.de_mentira += (self.servidor_de_login,)
        if chatgpt == "conectada":
            with open(os.path.join(self.chaves, "chatgpt.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"client_id": "oaiapp_x", "access_token": "acesso-x", "refresh_token": "renovacao-x", "expira_em": 4e9}, arquivo)
        self.cofre_sem_escrita = cofre_sem_escrita
        do_modelo = dict(preparar_o_cenario(modelo, pasta, self.openai), **({"hoje": hoje} if hoje else {}))
        if teto is not None:
            with open(os.path.join(pasta, "teto-do-mes.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"limitUsd": teto}, arquivo)
        if pareado:
            semear(os.path.join(pasta, "pareamento.json"))
        self.logger = registro.criar(self.logs)
        self.conexao = servidor.Conexao(
            atualizacao=atualizacao_do_exemplo(pasta, atualizacao, ankiweb, self.logger),
            porta=0,
            origens_aceitas=origens or configuracao.ORIGENS_ACEITAS,
            versao=configuracao.VERSAO,
            perfil_aberto=self._ler_o_perfil,
            logger=self.logger,
            dados=self.dados,
            colecao=colecao,
            item_de_login=self.item,
            openai_base=self.openai.base,
            openverse_base=self.openverse.base,
            adaptador_de_imagem=adaptador_de_imagem,
            voz_base=self.voz.base,
            firestore_base=self.firestore.base,
            chatgpt_base=self.servidor_de_login.base,
            intervalo_de_parada=0.005,
            trabalhando=trabalhando,
            intervalo_do_envio=0.01,
            espera_do_anki=0.01,
            esperas_da_openai=(0, 0),
            espera_do_plano=espera_do_plano,
            espera_do_teto=espera_do_teto,
            espera_do_contato=espera_do_contato,
            **do_modelo,
        )

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

    def pedir(self, metodo, caminho, origem=ORIGEM, cabecalhos=None, corpo=None, corpo_bruto=None, assinar=True):
        """`corpo` é um JSON (dict) ou, para o pedido quebrado, os bytes que seguem; `corpo_bruto` é o texto ou os bytes como vierem.
        Assinado como o navegador de teste pareado (`assinar=False`: como quem não se pareou); `cabecalhos` vêm por cima."""
        pedido = http.client.HTTPConnection("127.0.0.1", self.conexao.porta, timeout=30)
        enviados = {}
        if origem is not None:
            enviados["Origin"] = origem
        if corpo is not None:
            if isinstance(corpo, bytes):
                corpo_bruto = corpo
            else:
                corpo_bruto = json.dumps(corpo)
        if corpo_bruto is not None:
            enviados["Content-Type"] = "application/json"
            corpo_bruto = corpo_bruto.encode("utf-8") if isinstance(corpo_bruto, str) else corpo_bruto
        if assinar:
            enviados.update(cabecalhos_assinados(self.conexao.pareamento.sessao, metodo, caminho.split("?", 1)[0], corpo_bruto or b""))
        enviados.update(cabecalhos or {})
        try:
            pedido.request(metodo, caminho, body=corpo_bruto, headers=enviados)
            resposta = pedido.getresponse()
            lido = resposta.read()
            registrar_a_resposta(metodo, caminho, resposta.status, lido)
            return resposta.status, dict(resposta.getheaders()), lido
        finally:
            pedido.close()

    def log(self):
        with open(os.path.join(self.logs, "complemento.log"), encoding="utf-8") as arquivo:
            return arquivo.read()


@contextlib.contextmanager
def conexao_do_exemplo(pasta, exemplo):
    """A Conexão no contexto que o exemplo do contrato diz, já no ar; a nuvem de mentira já tem o que ele pede."""
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
