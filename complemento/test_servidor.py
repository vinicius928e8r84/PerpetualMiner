"""A Conexão com o Anki vista de fora: o servidor real, sem Anki e sem Qt.

Roda no Python 3.9 (o do Anki do Mac) e no 3.13:
    python3.9 complemento/test_servidor.py
"""

import contextlib
import http.client
import io
import json
import os
import re
import socket
import sys
import tempfile
import threading
import unittest
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, configuracao, envio, item_de_login, pasta_de_dados, registro, servidor  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_openai_de_mentira import OpenAIDeMentira, FirestoreDeMentira  # noqa: E402

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos.json")
ORIGEM = configuracao.ORIGENS_ACEITAS[0]
VARIAVEIS_DE_PROXY = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy")


# Tudo o que o servidor real respondeu, neste arquivo, a uma rota que ele tem: (método, caminho, status, `error`).
# `tearDownModule` exige um exemplo do contrato para cada um. A recusa de origem (403) é a mesma em toda rota e
# o que não é rota (404, OPTIONS) é do contrato de origem, não de uma rota; ficam de fora.
RESPONDIDOS = set()


def registrar_a_resposta(metodo, caminho, status, corpo):
    if (metodo, caminho.split("?", 1)[0]) not in servidor.ROTAS or status == 403:
        return
    try:
        erro = json.loads(corpo).get("error")
    except (ValueError, AttributeError):
        erro = None
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
        return json.load(arquivo)


def exemplos_do_contrato():
    return ler_o_contrato()["exemplos"]


def colecao_do_exemplo(contexto):
    """A coleção do contexto do exemplo: a que ele nomeia em `colecoes`, ou o Anki sem coleção aberta."""
    nome = contexto.get("colecao")
    return ColecaoEmMemoria(ler_o_contrato()["colecoes"][nome]) if nome else ColecaoEmMemoria.fechada()


def igual_ao_do_contrato(obtido, esperado):
    """O JSON obtido é o do contrato; `"<agora>"` no contrato é qualquer instante ISO 8601 (Z)."""
    if esperado == "<agora>":
        return isinstance(obtido, str) and bool(re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z", obtido))
    if isinstance(esperado, dict):
        return isinstance(obtido, dict) and obtido.keys() == esperado.keys() and all(igual_ao_do_contrato(obtido[k], v) for k, v in esperado.items())
    if isinstance(esperado, list):
        return isinstance(obtido, list) and len(obtido) == len(esperado) and all(igual_ao_do_contrato(o, e) for o, e in zip(obtido, esperado))
    return obtido == esperado


def sucesso(status):
    """O pedido deu certo: 200, ou 201 do Envio criado."""
    return 200 <= status < 300


def deve_repetir(exemplo):
    """Todo `POST` que dá 2xx é pedido uma segunda vez: igual na resposta e no que fica guardado, ou o exemplo declara
    `"repetivel": false` e o `porque` (e o teste exige que repetir de fato mude algo)."""
    return exemplo["pedido"]["metodo"] == "POST" and sucesso(exemplo["resposta"]["status"])


def estado_guardado(conexao):
    """Tudo o que o teste enxerga de guardado: os arquivos da pasta da Conexão (menos o log) e os documentos da nuvem de mentira."""
    arquivos = {}
    for pasta, _, nomes in os.walk(conexao.pasta):
        for nome in nomes:
            caminho = os.path.join(pasta, nome)
            if os.path.relpath(caminho, conexao.pasta) != os.path.join("logs", "complemento.log"):
                with open(caminho, "rb") as arquivo:
                    arquivos[os.path.relpath(caminho, conexao.pasta)] = arquivo.read()
    return {"arquivos": arquivos, "nuvem": json.loads(json.dumps(conexao.firestore.documentos))}


def confere_a_repeticao(caso, exemplo, primeiro, guardado, segundo, guardado_depois):
    """O mesmo POST de novo: a mesma resposta (salvo o instante) e nada novo guardado, ou a exceção que o exemplo declara."""
    status, _, corpo = segundo
    igual = status == primeiro[0] and igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"])
    intacto = guardado == guardado_depois
    if exemplo.get("repetivel") is False:
        caso.assertTrue(exemplo.get("porque"), 'O exemplo "%s" diz "repetivel": false sem o `porque`.' % exemplo["nome"])
        caso.assertFalse(
            igual and intacto,
            'O exemplo "%s" diz "repetivel": false, mas pedido duas vezes dá a mesma resposta e o mesmo estado: tire a exceção.' % exemplo["nome"],
        )
        return
    caso.assertEqual(status, primeiro[0], 'O mesmo POST de novo mudou o status no exemplo "%s".' % exemplo["nome"])
    caso.assertTrue(
        igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"]),
        'O mesmo POST de novo respondeu outra coisa no exemplo "%s": %s. Se repetir de propósito muda a resposta ou o estado, '
        'declare no exemplo `"repetivel": false, "porque": …` (complemento/contrato/LEIA-ME.md).' % (exemplo["nome"], corpo.decode("utf-8")),
    )
    caso.assertEqual(
        guardado, guardado_depois,
        'O mesmo POST de novo mudou o que a Conexão guardou no exemplo "%s". Se é de propósito, declare '
        '`"repetivel": false, "porque": …` no exemplo (complemento/contrato/LEIA-ME.md).' % exemplo["nome"],
    )


def _item_de_login_do_contexto(pasta, situacao):
    """O item de login na situação que o contrato diz (`itemDeLogin`): numa pasta do teste, nunca na do computador."""
    comando = ["/usr/bin/open", "/Applications/Anki.app"]
    if situacao == "indisponivel":
        return None
    if situacao == "sem_anki":
        return item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(pasta, "agentes"), comando=None)
    if situacao == "falha":
        ocupada = os.path.join(pasta, "ocupada")
        with open(ocupada, "wb") as arquivo:
            arquivo.write(b"x")
        return item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(ocupada, "agentes"), comando=comando)
    item = item_de_login.ItemDeLogin(sistema="mac", pasta=os.path.join(pasta, "agentes"), comando=comando)
    if situacao == "ligado":
        item.ligar()
    return item


def semear_a_fila(pasta, fila):
    """Os Envios que a Conexão já tinha (`filas` do contrato): os arquivos de `envio.py`, como a Conexão os deixa.

    Cada Envio é `{ job, state, custos, textos? }` (`textos`: `{ stem: texto }` já pagos)."""
    ordem = []
    for envio_ in fila:
        job, estado = envio_["job"], envio_["state"]
        job_id = job["jobId"]
        sem_hora = {chave: valor for chave, valor in job.items() if chave != "createdAt"}
        pedido = dict(job, corpoSha256=envio.impressao(sem_hora))
        for nome, dados in ((os.path.join("fila", job_id + ".json"), pedido), (os.path.join("estado", job_id + ".json"), estado)):
            os.makedirs(os.path.dirname(os.path.join(pasta, nome)), exist_ok=True)
            with open(os.path.join(pasta, nome), "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, ensure_ascii=False, indent=2)
        for stem, texto in (envio_.get("textos") or {}).items():
            os.makedirs(os.path.join(pasta, "estado", job_id), exist_ok=True)
            with open(os.path.join(pasta, "estado", job_id, stem + ".txt"), "w", encoding="utf-8") as arquivo:
                arquivo.write(texto)
        if envio_.get("custos"):
            os.makedirs(os.path.join(pasta, "custos", job_id), exist_ok=True)
            with open(os.path.join(pasta, "custos", job_id, "costs.jsonl"), "w", encoding="utf-8") as arquivo:
                arquivo.writelines(json.dumps(registro, ensure_ascii=False) + "\n" for registro in envio_["custos"])
        ordem.append({"jobId": job_id, "lang": job["lang"], "createdAt": job["createdAt"]})
    os.makedirs(os.path.join(pasta, "fila"), exist_ok=True)
    with open(os.path.join(pasta, "fila", "fila.json"), "w", encoding="utf-8") as arquivo:
        json.dump({"jobs": ordem}, arquivo, ensure_ascii=False, indent=2)


class ConexaoNoTeste:
    """A Conexão real numa porta livre, com o perfil que o teste escolher e uma OpenAI de mentira no lugar da de verdade.

    `chave_na_conexao`: os 4 últimos caracteres de uma chave que a Conexão já guardava antes de o teste começar.
    `colecao`: o adaptador da coleção do Anki que a Conexão lê (sem ele, não há o que ler).
    `item`: a situação do item de login de “Abrir o Anki com o computador” (ver `_item_de_login_do_contexto`).
    `trabalhando`: a thread de trabalho do Envio ligada (`test_envio.py`); desligada, os Envios ficam na fila como estão.
    `espera_do_contato`: quanto a thread espera, depois de subir, o primeiro pedido de Envio da extensão (nos testes, nada: 0).
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
    ):
        self.perfil = perfil
        self.falha_no_perfil = falha_no_perfil
        self.pasta = pasta
        self.item = _item_de_login_do_contexto(pasta, item)
        self.dados = pasta_de_dados.PastaDeDados(raiz=pasta, **{nome: os.path.join(pasta, nome) for nome in ("fila", "estado", "custos", "logs", "chaves")})
        self.logs, self.chaves = self.dados.logs, self.dados.chaves
        for pasta_ in self.dados[1:]:
            os.makedirs(pasta_, exist_ok=True)
        if chave_na_conexao is not None:
            with open(os.path.join(self.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"chave": "sk-proj-guardada-antes-" + chave_na_conexao}, arquivo)
        if versao_na_conexao:
            with open(os.path.join(self.chaves, 'openai.json'), 'w', encoding='utf-8') as arquivo:
                dados = {'versao': versao_na_conexao, 'chave': '' if chave_apagada else None}
                if chave_na_conexao and not chave_apagada:
                    dados['chave'] = 'sk-proj-guardada-antes-' + chave_na_conexao
                json.dump(dados, arquivo)
        if conta_na_conexao is not None:
            caminho = os.path.join(self.chaves, 'openai.json')
            with open(caminho, 'w', encoding='utf-8') as arquivo:
                json.dump({'chave': 'sk-proj-guardada-antes-' + chave_na_conexao if chave_na_conexao else '',
                    'versao': versao_na_conexao, 'conta': conta_na_conexao, 'em': hora_na_conexao, 'naoEnviada': nao_enviada}, arquivo)
        self.openai = OpenAIDeMentira(openai)
        self.firestore = FirestoreDeMentira()
        self.firestore.falha = firebase
        self.cofre_sem_escrita = cofre_sem_escrita
        self.logger = registro.criar(self.logs)
        self.conexao = servidor.Conexao(
            porta=0,
            origens_aceitas=origens or configuracao.ORIGENS_ACEITAS,
            versao=configuracao.VERSAO,
            perfil_aberto=self._ler_o_perfil,
            logger=self.logger,
            dados=self.dados,
            colecao=colecao,
            item_de_login=self.item,
            openai_base=self.openai.base,
            firestore_base=self.firestore.base,
            intervalo_de_parada=0.005,
            trabalhando=trabalhando,
            intervalo_do_envio=0.01,
            espera_do_anki=0.01,
            esperas_da_openai=(0, 0),
            espera_do_contato=espera_do_contato,
        )

    def _ler_o_perfil(self):
        if self.falha_no_perfil:
            raise RuntimeError("perfil ilegível")
        return self.perfil

    def __enter__(self):
        self.openai.__enter__()
        self.firestore.__enter__()
        if self.cofre_sem_escrita:
            os.chmod(self.chaves, 0o500)  # gravar a cópia da chave falha: a Conexão responde o erro interno
        assert self.conexao.iniciar(), "a porta de teste devia estar livre"
        return self

    def __exit__(self, *erro):
        if self.cofre_sem_escrita:
            os.chmod(self.chaves, 0o700)
        self.conexao.parar()
        self.openai.__exit__(*erro)
        self.firestore.__exit__(*erro)
        for handler in list(self.logger.handlers):
            handler.close()

    def pedir(self, metodo, caminho, origem=ORIGEM, cabecalhos=None, corpo=None, corpo_bruto=None):
        """`corpo` é um JSON (dict) ou, para o pedido quebrado, os bytes que seguem; `corpo_bruto` é o texto ou os bytes como vierem."""
        pedido = http.client.HTTPConnection("127.0.0.1", self.conexao.porta, timeout=30)
        enviados = dict(cabecalhos or {})
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
    ) as conexao:
        if 'chaveNaNuvem' in contexto:
            conexao.firestore.documentos['uid-teste'] = {
                'chave': {'stringValue': contexto['chaveNaNuvem']}, 'em': {'integerValue': str(contexto.get('emNaNuvem', 100))},
            }
        yield conexao


class ContratoDaConexao(unittest.TestCase):
    def test_cada_exemplo_do_contrato_tem_a_resposta_combinada(self):
        for exemplo in exemplos_do_contrato():
            with self.subTest(exemplo["nome"]), tempfile.TemporaryDirectory() as pasta:
                contexto = exemplo["contexto"]
                if contexto.get("cofre") == "sem_escrita" and (os.name == "nt" or os.geteuid() == 0):
                    self.skipTest("quem é root, ou o Windows, grava onde a pasta é só de leitura")
                with conexao_do_exemplo(pasta, exemplo) as conexao:
                    pedido = exemplo["pedido"]
                    status, _, corpo = conexao.pedir(
                        pedido["metodo"], pedido["caminho"], pedido["origem"],
                        corpo=pedido.get("corpo"), corpo_bruto=pedido.get("corpoBruto"),
                    )
                    guardado = estado_guardado(conexao)
                    segundo = conexao.pedir(
                        pedido["metodo"], pedido["caminho"], pedido["origem"],
                        corpo=pedido.get("corpo"), corpo_bruto=pedido.get("corpoBruto"),
                    ) if deve_repetir(exemplo) else None
                    guardado_depois = estado_guardado(conexao) if segundo else None
                self.assertEqual(status, exemplo["resposta"]["status"])
                self.assertTrue(
                    igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"]),
                    'O complemento e o contrato (complemento/contrato/exemplos.json) se separaram no exemplo "%s". '
                    "Se a mudança é de propósito, atualize o exemplo; o fake da Conexão do e2e lê o mesmo arquivo."
                    % exemplo["nome"] + " Obtido: %s" % corpo.decode("utf-8"),
                )
                if segundo:
                    confere_a_repeticao(self, exemplo, (status, corpo), guardado, segundo, guardado_depois)

    def test_o_contrato_tem_a_origem_da_extensao_que_o_complemento_aceita(self):
        with open(CONTRATO, encoding="utf-8") as arquivo:
            self.assertEqual(json.load(arquivo)["origemDaExtensao"], ORIGEM)


class RepeticaoDoContrato(unittest.TestCase):
    """O que a conferência de “o mesmo POST de novo” aceita e o que ela acusa."""

    EXEMPLO = {"nome": "ligar", "resposta": {"status": 200, "json": {"ok": True, "em": "<agora>"}}}
    GUARDADO = {"arquivos": {"a": b"1"}, "nuvem": {}}

    def segundo(self, status=200, corpo=b'{"ok": true, "em": "2026-10-12T10:00:00Z"}'):
        return status, {}, corpo

    def test_resposta_igual_salvo_o_instante_e_estado_igual_passa(self):
        confere_a_repeticao(self, self.EXEMPLO, (200, b""), self.GUARDADO, self.segundo(), dict(self.GUARDADO))

    def test_outra_resposta_sem_a_excecao_declarada_acusa_e_diz_como_declarar(self):
        with self.assertRaisesRegex(AssertionError, "repetivel"):
            confere_a_repeticao(self, self.EXEMPLO, (200, b""), self.GUARDADO, self.segundo(corpo=b'{"ok": false, "em": "2026-10-12T10:00:00Z"}'), self.GUARDADO)

    def test_outro_status_sem_a_excecao_declarada_acusa(self):
        with self.assertRaisesRegex(AssertionError, "status"):
            confere_a_repeticao(self, self.EXEMPLO, (200, b""), self.GUARDADO, self.segundo(status=409), self.GUARDADO)

    def test_estado_guardado_que_muda_sem_a_excecao_declarada_acusa(self):
        with self.assertRaisesRegex(AssertionError, "guardou"):
            confere_a_repeticao(self, self.EXEMPLO, (200, b""), self.GUARDADO, self.segundo(), {"arquivos": {"a": b"2"}, "nuvem": {}})

    def test_a_excecao_declarada_com_motivo_e_que_de_fato_muda_algo_passa(self):
        exemplo = dict(self.EXEMPLO, repetivel=False, porque="a versão sobe")
        confere_a_repeticao(self, exemplo, (200, b""), self.GUARDADO, self.segundo(status=409), self.GUARDADO)

    def test_a_excecao_sem_motivo_acusa(self):
        with self.assertRaisesRegex(AssertionError, "porque"):
            confere_a_repeticao(self, dict(self.EXEMPLO, repetivel=False), (200, b""), self.GUARDADO, self.segundo(status=409), self.GUARDADO)

    def test_a_excecao_que_repetida_nao_muda_nada_acusa_que_esta_velha(self):
        exemplo = dict(self.EXEMPLO, repetivel=False, porque="a versão sobe")
        with self.assertRaisesRegex(AssertionError, "tire a exceção"):
            confere_a_repeticao(self, exemplo, (200, b""), self.GUARDADO, self.segundo(), dict(self.GUARDADO))


# Cada rota do servidor, declarada à parte dos exemplos, para a matriz de estados pedir a rota de verdade:
#   corpo         o corpo mínimo que ela aceita (None: sem corpo);
#   status        o que ela responde a esse corpo com o Anki saudável (200 se não disser);
#   le_a_colecao  lê a coleção do Anki: com a coleção que quebra responde 500, sem coleção aberta responde 503;
#   le_o_perfil   lê o perfil aberto: com o perfil ilegível responde 500;
#   recusas       cada validação do pedido: (corpo, status, `error`), com a coleção aberta;
#   muda          a rota muda o que a Conexão guarda (a chave, o item de login): `RepeticaoDeCadaRotaQueMuda` a pede de novo e
#                 com a base velha, e uma rota que muda sem dizer isso quebra;
#   versao        o corpo traz a base (`versao`) do que ela muda: a base velha tem que dar 409, sem mudar nada;
#   muda_de_novo  o motivo (texto) de pedir de novo com a base atual poder mudar o que fica guardado de propósito.
# Uma rota nova entra aqui dizendo o que faz: uma que não lê a coleção nem o perfil (a chave da IA, por exemplo)
# responde o mesmo `status` em todos os estados do Anki.
MATRIZ = {
    ('POST', '/ia/openai/sincronizar'): {
        'corpo': {'uid': 'uid-teste', 'token': 'token-ficticio', 'versao': 1}, 'muda': True, 'versao': True,
        'le_a_colecao': False, 'le_o_perfil': False, 'recusas': [({}, 400, 'invalid_request')],
    },
    ('POST', '/ia/openai/legado'): {
        'corpo': {'chave': '', 'conta': 'uid-teste', 'em': 100, 'versao': 0}, 'muda': True, 'versao': True,
        'le_a_colecao': False, 'le_o_perfil': False, 'recusas': [({}, 400, 'invalid_request')],
        'status': 409,
    },
    ("GET", "/health"): {"corpo": None, "le_a_colecao": False, "le_o_perfil": True, "recusas": []},
    ("POST", "/anki/decks"): {"corpo": {}, "le_a_colecao": True, "le_o_perfil": False, "recusas": []},
    ("POST", "/anki/stats/decks"): {
        "corpo": {"decks": [{"deckName": "Inglês", "lang": "en"}]},
        "le_a_colecao": True,
        "le_o_perfil": False,
        "recusas": [({}, 400, "decks_required")],
    },
    # A chave da IA (PR 191): não lê a coleção nem o perfil. O corpo mínimo não traz a `chave`, então o pedido é recusado em todo estado.
    ("POST", "/ia/estado"): {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
    # Apagar a cópia da chave (#154): não lê a coleção nem o perfil, e apagar o que não existe também é 200.
    ("POST", "/ia/openai/chave/apagar"): {
        "corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": [], "muda": True, "versao": True,
        # `Cofre.reentrega` só reconhece como repetição na base atual uma chave não vazia (`chave and moderna`, d6b9289).
        "muda_de_novo": "apagar de novo na base atual avança a revisão e a hora: `Cofre.reentrega` só reconhece a repetição de uma chave não vazia",
    },
    ("POST", "/ia/openai/chave"): {
        "corpo": {},
        "status": 400,
        "muda": True,
        "versao": True,
        "le_a_colecao": False,
        "le_o_perfil": False,
        "recusas": [({"chave": "x"}, 401, "openai_key_rejected")],
    },
    # O item de login de “Abrir o Anki com o computador” (PR 189): não lê a coleção nem o perfil, e escreve só na pasta do teste.
    ("POST", "/abrir-com-o-computador/estado"): {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
    ("POST", "/abrir-com-o-computador"): {
        "corpo": {"ligado": True},
        "muda": True,
        "le_a_colecao": False,
        "le_o_perfil": False,
        "recusas": [({"ligado": "sim"}, 400, "invalid_request")],
    },
    ("POST", "/anki/vocabulary"): {
        "corpo": {"deck": "Inglês", "lang": "en"},
        "le_a_colecao": True,
        "le_o_perfil": False,
        "recusas": [({"lang": "en"}, 400, "deck_required"), ({"deck": "Inglês", "lang": "fr"}, 400, "invalid_lang")],
    },
    # O Envio (#142): a fila é da Conexão, não da coleção nem do perfil (quem lê e grava a coleção é a thread de trabalho).
    # Criar e tentar de novo mudam a fila; repetidos, respondem igual e não gravam nada (o `jobId` é a chave).
    ("POST", "/jobs"): {
        "corpo": {"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": "Inglês", "entries": [{"phraseId": 1, "line": "give up : She gave up smoking"}]},
        "status": 201, "muda": True, "le_a_colecao": False, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_job_id"), ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "de"}, 400, "invalid_lang"),
                    ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": ""}, 400, "invalid_request"),
                    ({"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": "Inglês", "entries": []}, 400, "entries_required")],
    },
    ("POST", "/jobs/list"): {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
    ("POST", "/jobs/get"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, "le_a_colecao": False, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/jobs/retry"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, "muda": True, "le_a_colecao": False, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    # O Apagar tudo (CFG-17) tira as Frases que a Conexão guarda: não lê a coleção nem o perfil; repetido, nada muda.
    ("POST", "/jobs/apagar-frases"): {"corpo": {}, "muda": True, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
    ("POST", "/jobs/debug-bundle"): {
        "corpo": {"jobId": "00000000-0000-4000-8000-000000000000"}, "status": 404, "le_a_colecao": False, "le_o_perfil": False,
        "recusas": [({}, 400, "invalid_job_id")],
    },
    ("POST", "/analytics/jobs"): {"corpo": {"lang": "all"}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
}


class QuebradaAoLer(ColecaoEmMemoria):
    """O Anki que levanta um erro inesperado ao ler a coleção."""

    def __init__(self):
        super().__init__({"quebra": True, "baralhos": []})


class EstadosDeCadaRota(unittest.TestCase):
    """Cada rota que o servidor tem é pedida de verdade, por HTTP, em cada estado em que o Anki pode estar.

    Não depende dos exemplos do contrato: o que o servidor responde fica registrado (`registrar_a_resposta`) e,
    no fim do arquivo, `tearDownModule` exige um exemplo para cada resposta. Tirar um exemplo, ou uma rota
    nova que responde um estado que ninguém escreveu, quebra por aqui, dizendo o estado.
    Os métodos `conferir_*` recebem a matriz e as rotas, para o teste da própria matriz usar uma rota inventada."""

    def conferir_que_toda_rota_esta_na_matriz(self, rotas, matriz):
        sem_entrada = sorted(rota for rota in rotas if rota not in matriz)
        self.assertEqual(sem_entrada, [], "rota nova sem entrada em MATRIZ (complemento/test_servidor.py): diga o corpo, se lê a coleção e o perfil, e as recusas dela")

    def pedir_cada_rota(self, conexao, rotas, matriz):
        return {rota: conexao.pedir(rota[0], rota[1], corpo=matriz[rota]["corpo"]) for rota in sorted(rotas)}

    def conferir_a_colecao_que_quebra(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(io.StringIO()), ConexaoNoTeste(pasta, colecao=QuebradaAoLer()) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}), rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_sem_a_colecao_aberta(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
                self.assertTrue(json.loads(corpo)["error"].endswith("_unavailable"), rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_o_perfil_que_nao_se_le(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(io.StringIO()), ConexaoNoTeste(pasta, falha_no_perfil=True) as conexao:
            respostas = self.pedir_cada_rota(conexao, rotas, matriz)
        for rota, (status, _, corpo) in respostas.items():
            if matriz[rota]["le_o_perfil"]:
                self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}), rota)
            elif matriz[rota]["le_a_colecao"]:
                self.assertEqual(status, 503, rota)
            else:
                self.assertEqual(status, matriz[rota].get("status", 200), rota)

    def conferir_as_recusas_de_cada_rota(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(ler_o_contrato()["colecoes"]["inglês com subbaralho"])) as conexao:
            for rota in sorted(rotas):
                for corpo, status_esperado, erro_esperado in matriz[rota]["recusas"]:
                    status, _, resposta = conexao.pedir(rota[0], rota[1], corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (status_esperado, {"error": erro_esperado}), (rota, corpo))

    def conferir_o_corpo_que_nao_e_um_objeto_json(self, rotas, matriz):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for metodo, caminho in sorted(rotas):
                status, _, corpo = conexao.pedir(metodo, caminho, corpo=b"{isto nao e json")
                self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}), (metodo, caminho))

    def conferir_tudo(self, rotas, matriz):
        self.conferir_que_toda_rota_esta_na_matriz(rotas, matriz)
        self.conferir_a_colecao_que_quebra(rotas, matriz)
        self.conferir_sem_a_colecao_aberta(rotas, matriz)
        self.conferir_o_perfil_que_nao_se_le(rotas, matriz)
        self.conferir_as_recusas_de_cada_rota(rotas, matriz)
        self.conferir_o_corpo_que_nao_e_um_objeto_json(rotas, matriz)

    def test_cada_rota_do_servidor_em_cada_estado_do_anki(self):
        self.conferir_tudo(servidor.ROTAS, MATRIZ)

    def test_uma_rota_nova_sem_entrada_na_matriz_quebra_dizendo_o_que_declarar(self):
        rotas = dict(servidor.ROTAS)
        rotas[("POST", "/rota/inventada")] = lambda conexao, corpo: (200, {"ok": True})
        with self.assertRaisesRegex(AssertionError, r"rota nova sem entrada em MATRIZ.*se lê a coleção"):
            self.conferir_que_toda_rota_esta_na_matriz(rotas, MATRIZ)

    def test_uma_rota_que_nao_le_a_colecao_responde_200_em_todos_os_estados_dela(self):
        # Como a de estado da chave de IA (PR 191): não toca a coleção nem o perfil, e o corpo `{}` basta.
        rota = ("POST", "/rota/inventada")
        original, respondidos = dict(servidor.ROTAS), set(RESPONDIDOS)
        servidor.ROTAS[rota] = lambda conexao, corpo: (200, {"configurada": False})
        try:
            matriz = dict(MATRIZ)
            matriz[rota] = {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []}
            self.conferir_tudo(servidor.ROTAS, matriz)
        finally:
            servidor.ROTAS.clear()
            servidor.ROTAS.update(original)
            RESPONDIDOS.intersection_update(respondidos)  # a rota inventada não é do contrato


class RepeticaoDeCadaRotaQueMuda(unittest.TestCase):
    """Cada rota que muda o que a Conexão guarda é pedida de novo, e com a base velha, e o dono não se mexe à toa.

    `MATRIZ` diz quais rotas mudam (`muda`) e quais trazem a base (`versao`). O pedido é o de cada exemplo de sucesso (`200`)
    da rota no contrato, no contexto dele. Uma rota que muda o que fica guardado e não diz `muda: True` quebra.
    Os métodos `conferir_*` recebem as rotas, a matriz e os exemplos, para o teste da própria conferência usar uma rota inventada."""

    CHAVES_NOVAS = ("sk-proj-mudanca-nova-0001", "sk-proj-mudanca-nova-0002")

    def exemplos_de_sucesso(self, rota, exemplos):
        return [
            e for e in exemplos
            if (e["pedido"]["metodo"], e["pedido"]["caminho"]) == rota and sucesso(e["resposta"]["status"]) and e["contexto"].get("cofre") != "sem_escrita"
        ]

    def pedir_o_exemplo(self, conexao, exemplo, corpo=None):
        pedido = exemplo["pedido"]
        status, _, lido = conexao.pedir(pedido["metodo"], pedido["caminho"], pedido["origem"], corpo=corpo if corpo is not None else pedido.get("corpo"))
        return status, json.loads(lido)

    def revisao(self, conexao):
        return conexao.conexao.cofre.documento("openai").get("versao", 0)

    def conferir_que_toda_rota_que_muda_diz(self, rotas, matriz, exemplos):
        for rota in sorted(rotas):
            if matriz[rota].get("muda"):
                self.assertTrue(self.exemplos_de_sucesso(rota, exemplos), "rota %s %s diz `muda: True` e não tem exemplo de sucesso no contrato para ser pedida de novo" % rota)
                continue
            for exemplo in self.exemplos_de_sucesso(rota, exemplos):
                with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                    antes = estado_guardado(conexao)
                    self.pedir_o_exemplo(conexao, exemplo)
                    self.assertEqual(
                        antes, estado_guardado(conexao),
                        'a rota %s %s mudou o que a Conexão guarda no exemplo "%s" e MATRIZ (complemento/test_servidor.py) não diz `muda: True`: '
                        "diga também `versao: True` se o corpo traz a base." % (rota + (exemplo["nome"],)),
                    )

    def conferir_o_pedido_repetido(self, rotas, matriz, exemplos):
        for rota in sorted(rotas):
            if not matriz[rota].get("muda"):
                continue
            for exemplo in self.exemplos_de_sucesso(rota, exemplos):
                nome = exemplo["nome"]
                if exemplo.get("repetivel") is False:
                    continue  # a exceção já declarada, com o `porque`, e conferida por `confere_a_repeticao`
                with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                    primeiro = self.pedir_o_exemplo(conexao, exemplo)
                    guardado = estado_guardado(conexao)
                    self.assertEqual(self.pedir_o_exemplo(conexao, exemplo), primeiro, nome + ": o mesmo pedido de sucesso de novo respondeu outra coisa")
                    self.assertEqual(guardado, estado_guardado(conexao), nome + ": o mesmo pedido de sucesso de novo mudou o que a Conexão guarda (o arquivo do dono)")
                    if not matriz[rota].get("versao"):
                        continue
                    # O cliente que já leu a revisão nova a manda de volta ao reconfirmar: é a mesma chave, o mesmo arquivo.
                    de_novo = dict(exemplo["pedido"]["corpo"], versao=self.revisao(conexao))
                    if matriz[rota].get("muda_de_novo"):
                        self.pedir_o_exemplo(conexao, exemplo, de_novo)
                        self.assertNotEqual(guardado, estado_guardado(conexao), nome + ": `muda_de_novo` está velho em MATRIZ: reconfirmar na base atual já não muda nada, tire a exceção")
                        continue
                    for _ in range(3):
                        self.assertEqual(self.pedir_o_exemplo(conexao, exemplo, de_novo), primeiro, nome + ": reconfirmar na base atual respondeu outra coisa")
                        self.assertEqual(
                            guardado, estado_guardado(conexao),
                            nome + ": reconfirmar na base atual mudou o que a Conexão guarda (a revisão avança a cada reconfirmação, v1→2→3→4)",
                        )

    def conferir_a_base_velha(self, rotas, matriz, exemplos):
        for rota in sorted(rotas):
            if not matriz[rota].get("versao"):
                continue
            for exemplo in self.exemplos_de_sucesso(rota, exemplos):
                with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                    self.pedir_o_exemplo(conexao, exemplo)
                    cofre = conexao.conexao.cofre
                    for chave in self.CHAVES_NOVAS:  # duas mudanças mais novas: a base do exemplo deixa de ser nem a atual nem a anterior
                        atual = cofre.documento("openai")
                        self.assertTrue(cofre.guardar("openai", chave, versao=atual.get("versao", 0), conta=atual.get("conta", "")))
                    guardado = estado_guardado(conexao)
                    status, corpo = self.pedir_o_exemplo(conexao, exemplo)
                    self.assertEqual(
                        (status, guardado), (409, estado_guardado(conexao)),
                        "%s: a base velha de %s %s tem que dar 409 sem mudar o que está guardado: respondeu %s %s" % ((exemplo["nome"],) + rota + (status, corpo)),
                    )

    def conferir_tudo(self, rotas, matriz, exemplos):
        self.conferir_que_toda_rota_que_muda_diz(rotas, matriz, exemplos)
        self.conferir_o_pedido_repetido(rotas, matriz, exemplos)
        self.conferir_a_base_velha(rotas, matriz, exemplos)

    def test_cada_rota_que_muda_repete_igual_e_recusa_a_base_velha(self):
        self.conferir_tudo(servidor.ROTAS, MATRIZ, exemplos_do_contrato())

    @contextlib.contextmanager
    def rota_inventada(self, tratador, **regra):
        """Uma rota que só existe aqui, com o exemplo de sucesso dela e a entrada em uma matriz; desfaz o que registrou."""
        rota = ("POST", "/rota/inventada")
        original, respondidos = dict(servidor.ROTAS), set(RESPONDIDOS)
        servidor.ROTAS[rota] = tratador
        exemplo = {
            "nome": "rota inventada", "contexto": {},
            "pedido": {"metodo": "POST", "caminho": rota[1], "origem": ORIGEM, "corpo": {"versao": 0}},
            "resposta": {"status": 200, "json": {"ok": True}},
        }
        matriz = {rota: dict({"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []}, **regra)}
        try:
            yield {rota: tratador}, matriz, [exemplo]
        finally:
            servidor.ROTAS.clear()
            servidor.ROTAS.update(original)
            RESPONDIDOS.intersection_update(respondidos)  # a rota inventada não é do contrato

    @staticmethod
    def gravar_o_dono(conexao, chave, versao):
        """Escreve o arquivo do dono por conta própria, para a conferência não depender da `Cofre` que ela confere."""
        with open(os.path.join(conexao.cofre._pasta, "openai.json"), "w", encoding="utf-8") as arquivo:
            json.dump({"chave": chave, "conta": "", "versao": versao, "em": 1, "naoEnviada": True}, arquivo)

    @classmethod
    def grava_sempre(cls, conexao, corpo):
        """Muda o que fica guardado a cada pedido, sem olhar a base."""
        versao = conexao.cofre.documento("openai").get("versao", 0)
        cls.gravar_o_dono(conexao, "sk-proj-inventada-%d" % (versao + 1), versao + 1)
        return 200, {"ok": True}

    @classmethod
    def grava_uma_vez_e_cobra_a_base(cls, conexao, corpo):
        """Como a chave da IA: grava uma vez; o mesmo pedido de novo, ou a base atual, repete a resposta; a base velha dá 409."""
        atual = conexao.cofre.documento("openai")
        revisao = atual.get("versao", 0)
        if atual.get("chave") == "sk-proj-inventada-0001" and corpo["versao"] in (revisao - 1, revisao):
            return 200, {"ok": True}
        if corpo["versao"] != revisao:
            return 409, {"error": "stale_key_version"}
        cls.gravar_o_dono(conexao, "sk-proj-inventada-0001", revisao + 1)
        return 200, {"ok": True}

    def test_uma_rota_que_muda_sem_dizer_quebra_dizendo_o_que_declarar(self):
        with self.rota_inventada(self.grava_sempre) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, r"não diz `muda: True`"):
            self.conferir_que_toda_rota_que_muda_diz(rotas, matriz, exemplos)

    def test_uma_rota_que_diz_que_muda_e_repetida_muda_o_arquivo_quebra(self):
        with self.rota_inventada(self.grava_sempre, muda=True) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, "mudou o que a Conexão guarda"):
            self.conferir_o_pedido_repetido(rotas, matriz, exemplos)

    def test_uma_rota_que_aceita_a_base_velha_quebra(self):
        with self.rota_inventada(self.grava_sempre, muda=True, versao=True) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, "409"):
            self.conferir_a_base_velha(rotas, matriz, exemplos)

    def test_uma_rota_que_grava_uma_vez_e_cobra_a_base_passa_em_tudo(self):
        with self.rota_inventada(self.grava_uma_vez_e_cobra_a_base, muda=True, versao=True) as (rotas, matriz, exemplos):
            self.conferir_tudo(rotas, matriz, exemplos)

    def test_a_excecao_muda_de_novo_que_ja_nao_muda_nada_acusa_que_esta_velha(self):
        with self.rota_inventada(self.grava_uma_vez_e_cobra_a_base, muda=True, versao=True, muda_de_novo="avança a revisão") as (rotas, matriz, exemplos):
            with self.assertRaisesRegex(AssertionError, "tire a exceção"):
                self.conferir_o_pedido_repetido(rotas, matriz, exemplos)

    def test_as_rotas_que_mudam_sao_as_da_chave_do_item_de_login_e_do_envio(self):
        self.assertEqual(
            sorted(rota[1] for rota, regra in MATRIZ.items() if regra.get("muda")),
            ["/abrir-com-o-computador", "/ia/openai/chave", "/ia/openai/chave/apagar", "/ia/openai/legado", "/ia/openai/sincronizar", "/jobs", "/jobs/apagar-frases", "/jobs/retry"],
        )


class SaudeDaConexao(unittest.TestCase):
    def test_saude_traz_a_versao_do_complemento_e_o_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil="Maria") as conexao:
            status, _, corpo = conexao.pedir("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(corpo), {"ok": True, "versao": configuracao.VERSAO, "perfil": "Maria"})

    def test_saude_acompanha_o_perfil_que_o_anki_abre_depois(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, perfil=None) as conexao:
            antes = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
            conexao.perfil = "Maria"
            depois = json.loads(conexao.pedir("GET", "/health")[2])["perfil"]
        self.assertEqual((antes, depois), (None, "Maria"))


class LeituraDaColecao(unittest.TestCase):
    """O que a extensão lê dos Baralhos, além dos exemplos do contrato."""

    DECKS = {"decks": [{"deckName": "Inglês", "lang": "en"}]}

    def com_a_colecao(self, pasta, **argumentos):
        return ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(ler_o_contrato()["colecoes"]["inglês com subbaralho"]), **argumentos)

    def test_um_corpo_que_nao_e_um_objeto_json_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            respostas = [conexao.pedir("POST", "/anki/vocabulary", corpo=corpo) for corpo in (b"{isto nao e json", b"[1, 2]", b"\xff\xfe")]
        for status, _, corpo in respostas:
            self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}))

    def test_um_corpo_maior_que_o_limite_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            status, _, corpo = conexao.pedir(
                "POST", "/anki/stats/decks", corpo=json.dumps({"decks": [{"deckName": "x" * (servidor.LIMITE_DO_CORPO + 1), "lang": "en"}]}).encode("utf-8")
            )
        self.assertEqual((status, json.loads(corpo)), (400, {"error": "invalid_json"}))

    def test_os_numeros_pedidos_voltam_na_ordem_pedida_sem_repetir(self):
        pedidos = [{"deckName": "Vazio", "lang": "en"}, {"deckName": "Inglês", "lang": "en"}, {"deckName": "vazio", "lang": "en"}]
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/stats/decks", corpo={"decks": pedidos})
        self.assertEqual([baralho["deckName"] for baralho in json.loads(corpo)["decks"]], ["Vazio", "Inglês"])

    def test_o_vocabulario_vem_paginado_pelo_limite_e_pelo_deslocamento(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, inteiro = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en"})
            _, _, pagina = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "limit": 3, "offset": 2})
        todas = json.loads(inteiro)["words"]
        self.assertEqual(json.loads(pagina)["words"], todas[2:5])
        self.assertEqual(json.loads(pagina)["totalWords"], len(todas))

    def test_um_limite_e_um_deslocamento_que_nao_sao_numeros_voltam_ao_padrao(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            for ruim in ({"a": 1}, [3], "muitos"):
                with self.subTest(ruim):
                    status, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "limit": ruim, "offset": ruim})
                    filtros = json.loads(corpo)["filters"]
                    self.assertEqual((status, filtros["limit"], filtros["offset"]), (200, baralhos.LIMITE_PADRAO, 0))

    def test_limite_conhecido_um_cliente_fora_do_navegador_que_declara_a_origem_da_extensao_recebe_o_vocabulario(self):
        """Documenta o que o contrato (LEIA-ME, “Quem o complemento atende”, item 3) já diz: o `Origin` não é
        autenticação. Um programa local, ou uma extensão que consiga pôr esse cabeçalho, lê os Baralhos como a extensão.
        Sem a origem, ou com a de outro site ou de outra extensão, nada é lido (os exemplos do contrato). O reforço
        (uma credencial de pareamento) é o ticket #192, antes do lançamento; quando entrar, este teste passa a exigir a credencial."""
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", "/anki/vocabulary", origem=ORIGEM, corpo={"deck": "Inglês", "lang": "en"})
            sem_a_origem = conexao.pedir("POST", "/anki/vocabulary", origem=None, corpo={"deck": "Inglês", "lang": "en"})[0]
        self.assertEqual((status, json.loads(corpo)["totalWords"], sem_a_origem), (200, 12, 403))

    def test_o_vocabulario_filtra_pela_situacao_do_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, self.com_a_colecao(pasta) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Inglês", "lang": "en", "status": "new"})
        self.assertEqual({palavra["status"] for palavra in json.loads(corpo)["words"]}, {"new"})

    def test_o_vocabulario_do_russo_ignora_o_contexto_entre_colchetes_e_o_yo(self):
        russo = {"baralhos": [{"nome": "Русский", "notas": [{"frente": "Ёлка стоит [Context: série]", "verso": "", "cartoes": [{"tipo": 2, "intervalo": 30}]}]}]}
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria(russo)) as conexao:
            _, _, corpo = conexao.pedir("POST", "/anki/vocabulary", corpo={"deck": "Русский", "lang": "ru"})
        self.assertEqual(
            [(palavra["word"], palavra["type"]) for palavra in json.loads(corpo)["words"]],
            [("елка стоит", "term"), ("елка", "word"), ("стоит", "word")],
        )

    def test_a_colecao_que_quebra_vira_erro_interno_no_log_e_nao_no_anki(self):
        class Quebrada(ColecaoEmMemoria):
            def nomes_dos_baralhos(self):
                raise RuntimeError("coleção ilegível")

        saida, erro = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            with ConexaoNoTeste(pasta, colecao=Quebrada()) as conexao:
                status, _, corpo = conexao.pedir("POST", "/anki/decks", corpo={})
                registrado = conexao.log()
        self.assertEqual((status, json.loads(corpo)), (500, {"error": "internal_error"}))
        self.assertIn("coleção ilegível", registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue()), ("", ""))

    def test_uma_conexao_sem_adaptador_da_colecao_diz_que_nao_ha_o_que_ler(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", "/anki/decks", corpo={})
        self.assertEqual((status, json.loads(corpo)["error"]), (503, "anki_decks_unavailable"))


class AbrirOAnkiComOComputador(unittest.TestCase):
    """O que o pedido deixa no disco: o item de login escrito ou apagado, e só a extensão o pede."""

    ROTA = "/abrir-com-o-computador"

    def itens(self, conexao):
        pasta = conexao.item.pasta
        return sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []

    def test_ligar_escreve_o_item_e_desligar_o_apaga(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            antes = self.itens(conexao)
            conexao.pedir("POST", self.ROTA, corpo={"ligado": True})
            ligado = self.itens(conexao)
            estado = json.loads(conexao.pedir("POST", self.ROTA + "/estado", corpo={})[2])
            conexao.pedir("POST", self.ROTA, corpo={"ligado": False})
            depois = self.itens(conexao)
        self.assertEqual((antes, ligado, depois), ([], ["com.perpetualminer.abrir-o-anki.plist"], []))
        self.assertEqual(estado, {"ok": True, "ligado": True})

    def test_a_pergunta_pelo_estado_nao_escreve_nem_apaga_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, item="ligado") as conexao:
            conexao.pedir("POST", self.ROTA + "/estado", corpo={})
            ainda = self.itens(conexao)
        self.assertEqual(ainda, ["com.perpetualminer.abrir-o-anki.plist"])

    def test_outro_site_ou_outra_extensao_nao_liga_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for origem in (None, "https://exemplo.com", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"):
                with self.subTest(origem):
                    status, _, _ = conexao.pedir("POST", self.ROTA, origem=origem, corpo={"ligado": True})
                    self.assertEqual(status, 403)
            self.assertEqual(self.itens(conexao), [])

    def test_ler_o_estado_exige_a_origem_da_extensao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = conexao.pedir("GET", self.ROTA + "/estado", origem=None)
        self.assertEqual(status, 403)

    def test_corpo_que_nao_e_json_e_recusado_sem_escrever_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", self.ROTA, corpo=b"isto nao e json")
            itens = self.itens(conexao)
        self.assertEqual((status, json.loads(corpo), itens), (400, {"error": "invalid_json"}, []))

    def test_corpo_sem_ligado_e_recusado_sem_escrever_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for corpo in ({}, {"ligado": 1}, {"ligado": None}):
                with self.subTest(corpo):
                    status, _, resposta = conexao.pedir("POST", self.ROTA, corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (400, {"error": "invalid_request"}))
            self.assertEqual(self.itens(conexao), [])

    def test_a_falha_ao_escrever_vai_ao_log_do_complemento(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, item="falha") as conexao:
            conexao.pedir("POST", self.ROTA, corpo={"ligado": True})
            registrado = conexao.log()
        self.assertIn("Abrir o Anki com o computador", registrado)


class OrigemDosPedidos(unittest.TestCase):
    def test_a_extensao_recebe_a_resposta_com_a_origem_dela_liberada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            _, cabecalhos, _ = conexao.pedir("GET", "/health")
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)

    def test_saude_sem_origem_responde_so_a_versao_e_o_perfil(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem=None)
        self.assertEqual(status, 200)
        self.assertEqual(sorted(json.loads(corpo)), ["ok", "perfil", "versao"])
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)

    def test_sem_origem_nada_alem_da_saude_e_atendido_com_ou_sem_sec_fetch_site(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for cabecalhos in ({}, {"Sec-Fetch-Site": "none"}):
                for metodo, caminho in (("GET", "/jobs"), ("GET", "/health/"), ("POST", "/health"), ("POST", "/jobs"), ("OPTIONS", "/health")):
                    with self.subTest("%s %s %s" % (metodo, caminho, cabecalhos)):
                        status, _, corpo = conexao.pedir(metodo, caminho, origem=None, cabecalhos=cabecalhos)
                        self.assertEqual((status, json.loads(corpo) if corpo else None), (403, {"error": "origin_not_allowed"}))

    def test_todo_verbo_passa_pela_mesma_autorizacao_de_origem(self):
        verbos = ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "FOO")
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            for verbo in verbos:
                for descricao, origem in (("sem origem", None), ("com origem de outro site", "https://exemplo.com")):
                    with self.subTest("%s %s" % (verbo, descricao)):
                        status, cabecalhos, corpo = conexao.pedir(verbo, "/jobs", origem=origem)
                        self.assertEqual(status, 403)
                        self.assertEqual(corpo, b"" if verbo == "HEAD" else b'{"error": "origin_not_allowed"}')
                        self.assertNotIn("text/html", cabecalhos.get("Content-Type", ""))
                with self.subTest("%s com a origem da extensão numa rota que não existe" % verbo):
                    status, _, _ = conexao.pedir(verbo, "/nao-existe")
                    self.assertEqual(status, 404 if verbo != "OPTIONS" else 204)

    def test_com_a_origem_de_outra_extensao_nada_e_atendido_nem_a_saude(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            outra = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            respostas = [conexao.pedir(m, c, origem=outra)[0] for m, c in (("GET", "/health"), ("GET", "/jobs"), ("POST", "/jobs"))]
        self.assertEqual(respostas, [403, 403, 403])

    def test_origem_de_outro_site_nao_recebe_a_origem_liberada_nem_dado_algum(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, corpo = conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)
        self.assertNotIn(b"versao", corpo)

    def test_pedido_de_verificacao_previa_da_extensao_e_respondido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir(
                "OPTIONS",
                "/health",
                cabecalhos={"Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"},
            )
        self.assertEqual(status, 204)
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Origin"), ORIGEM)
        self.assertIn("POST", cabecalhos.get("Access-Control-Allow-Methods", ""))
        self.assertEqual(cabecalhos.get("Access-Control-Allow-Private-Network"), "true")

    def test_pedido_de_verificacao_previa_de_outro_site_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, cabecalhos, _ = conexao.pedir("OPTIONS", "/health", origem="https://exemplo.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", cabecalhos)


class ProcessoDoAnki(unittest.TestCase):
    """Dentro do Anki a Conexão não mexe no processo e nenhum erro abre o diálogo dele."""

    def estado_do_processo(self):
        return {
            "proxy": {nome: os.environ.get(nome) for nome in VARIAVEIS_DE_PROXY},
            "stdout": sys.stdout,
            "stderr": sys.stderr,
            "excepthook": sys.excepthook,
            "thread_excepthook": threading.excepthook,
            "avisos": list(warnings.filters),
            "mostrar_aviso": warnings.showwarning,
            "tempo_do_socket": socket.getdefaulttimeout(),
        }

    def test_subir_atender_e_parar_nao_troca_proxy_stdout_stderr_excepthook_nem_avisos(self):
        antes = self.estado_do_processo()
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                conexao.pedir("GET", "/health")
                conexao.pedir("GET", "/nao-existe")
                conexao.pedir("GET", "/health", origem="https://exemplo.com")
        self.assertEqual(self.estado_do_processo(), antes)

    def test_erro_dentro_de_uma_rota_vai_ao_log_do_complemento_e_a_nenhum_outro_lugar(self):
        chamadas_do_excepthook = []
        original = sys.excepthook
        sys.excepthook = lambda *dados: chamadas_do_excepthook.append(dados)
        saida, erro = io.StringIO(), io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as pasta:
                with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
                    with ConexaoNoTeste(pasta, falha_no_perfil=True) as conexao:
                        conexao.pedir("GET", "/health")  # a resposta 500 é o exemplo do contrato
                        registrado = conexao.log()
        finally:
            sys.excepthook = original
        self.assertIn("perfil ilegível", registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue(), chamadas_do_excepthook), ("", "", []))

    def erro_ao_atender(self, conexao, erro):
        """Entrega ao servidor real um erro de pedido, como o `socketserver` faz, e devolve o que o log ganhou."""
        antes = conexao.log()
        try:
            raise erro
        except Exception:
            conexao.conexao._servidor.handle_error(None, ("127.0.0.1", 50000))
        return conexao.log()[len(antes):]

    def test_o_anki_fechando_nao_enche_o_log_de_erros(self):
        original = sys.excepthook
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                sys.excepthook = None  # o interpretador no fim: nenhuma thread nova nasce
                try:
                    acrescentado = self.erro_ao_atender(conexao, RuntimeError("sys.excepthook is None"))
                finally:
                    sys.excepthook = original
        self.assertEqual(acrescentado, "")

    def test_cliente_que_fecha_a_conexao_antes_da_resposta_nao_vira_erro_com_traceback(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                acrescentado = self.erro_ao_atender(conexao, BrokenPipeError(32, "Broken pipe"))
        self.assertNotIn("Traceback", acrescentado)
        self.assertNotIn("ERROR", acrescentado)

    def test_erro_de_verdade_ao_atender_continua_no_log_com_o_traceback(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                acrescentado = self.erro_ao_atender(conexao, ValueError("falha de verdade"))
        self.assertIn("ERROR Erro ao atender", acrescentado)
        self.assertIn("falha de verdade", acrescentado)

    def test_pedido_quebrado_vai_ao_log_e_nao_ao_stderr(self):
        erro = io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stderr(erro):
            with ConexaoNoTeste(pasta) as conexao:
                bruto = socket.create_connection(("127.0.0.1", conexao.conexao.porta), timeout=5)
                bruto.sendall(b"\x16\x03\x01 isto nao e http\r\n\r\n")
                bruto.recv(4096)
                bruto.close()
                conexao.pedir("GET", "/health")
                registrado = conexao.log()
        self.assertEqual(erro.getvalue(), "")
        self.assertIn("http: code 400, message Bad Request", registrado)  # o texto da biblioteca, sem a linha do pedido
        self.assertNotIn("isto nao e http", registrado)


if __name__ == "__main__":
    unittest.main()
