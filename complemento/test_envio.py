"""O Envio dentro da Conexão, visto de fora: o servidor real com a thread de trabalho ligada, a coleção em memória e a
OpenAI de mentira na fronteira HTTP. O que o teste confere é o que atravessa o HTTP e o que fica guardado (a coleção,
os arquivos da pasta de dados).

    python3.9 complemento/test_envio.py
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste, ler_o_contrato, semear_a_fila  # noqa: E402

CHAVE = "sk-proj-chave-do-envio-0000"
FIM = ("completed", "partial", "failed")
INGLES = {"baralhos": [{"nome": "Inglês"}]}


def pedido(job_id, *linhas, lang="en", baralho="Inglês"):
    return {
        "jobId": job_id, "lang": lang, "deckName": baralho, "imageSource": "1", "tts": {"wordTld": "com", "phraseTld": "co.uk"},
        "entries": [{"phraseId": 1760000000000 + numero, "line": linha} for numero, linha in enumerate(linhas)],
    }


ID = "11111111-2222-4333-8444-555555555555"
OUTRO_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa"


class EnvioNoTeste(ConexaoNoTeste):
    """A Conexão com a thread de trabalho ligada, uma chave guardada e a coleção dada."""

    def __init__(self, pasta, colecao=None, chave=CHAVE, **argumentos):
        argumentos.setdefault("trabalhando", True)
        super().__init__(pasta, colecao=colecao if colecao is not None else ColecaoEmMemoria(INGLES), **argumentos)
        if chave:
            with open(os.path.join(self.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"chave": chave, "conta": "", "versao": 1, "em": 1, "naoEnviada": True}, arquivo)

    def criar(self, corpo):
        status, _, resposta = self.pedir("POST", "/jobs", corpo=corpo)
        return status, json.loads(resposta)

    def estado(self, job_id):
        status, _, resposta = self.pedir("POST", "/jobs/get", corpo={"jobId": job_id})
        assert status == 200, resposta
        return json.loads(resposta)["state"]

    def esperar(self, job_id, condicao=lambda estado: estado["status"] in FIM, limite=15):
        fim = time.monotonic() + limite
        while time.monotonic() < fim:
            estado = self.estado(job_id)
            if condicao(estado):
                return estado
            time.sleep(0.02)
        raise AssertionError("o Envio não chegou lá: %s" % self.estado(job_id))

    def arquivos(self):
        lidos = {}
        for raiz, _, nomes in os.walk(self.pasta):
            for nome in nomes:
                caminho = os.path.join(raiz, nome)
                with open(caminho, "rb") as arquivo:
                    lidos[os.path.relpath(caminho, self.pasta)] = arquivo.read()
        return lidos


def chats(openai):
    """Os pedidos de texto que chegaram à OpenAI de mentira: (Authorization, corpo)."""
    return list(openai.chats)


class UmaFraseViraCartao(unittest.TestCase):
    def test_uma_frase_vira_um_cartao_de_texto_no_baralho_com_o_tipo_de_nota_e_os_campos_de_hoje(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            status, resposta = conexao.criar(pedido(ID, "gave up : She gave up smoking [Context: Série - The Office - S01E01]"))
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual((status, resposta), (201, {"jobId": ID, "status": "queued"}))
        self.assertEqual((estado["status"], estado["successfulPhraseIds"], estado["failedPhraseIds"]), ("completed", [1760000000000], []))
        self.assertEqual([(n["baralho"], n["tipo"], sorted(n["campos"])) for n in notas], [("Inglês", "Básico", ["Frente", "Verso"])])
        self.assertIn("<b>gave up</b>", notas[0]["campos"]["Frente"])
        self.assertTrue(notas[0]["campos"]["Verso"].startswith("gave up - /"))
        self.assertNotIn("[sound:", notas[0]["campos"]["Frente"] + notas[0]["campos"]["Verso"])
        self.assertEqual(notas[0]["etiquetas"], ["perpetual_miner", "série", "the_office", "s01e01"])
        self.assertEqual(list(estado["cards"].values()), [{"phraseId": 1760000000000, "keyword": "gave up", "status": "added", "error": None}])

    def test_o_baralho_que_ainda_nao_existe_e_criado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=ColecaoEmMemoria({"baralhos": []})) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking", baralho="PerpetualMiner::Inglês"))
            conexao.esperar(ID)
            baralhos = conexao.conexao.colecao.nomes_dos_baralhos()
        self.assertEqual(baralhos, ["PerpetualMiner::Inglês"])

    def test_uma_frase_russa_vira_um_cartao_com_a_frase_inteira(self):
        russo = ColecaoEmMemoria({"baralhos": [{"nome": "Русский"}]})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=russo) as conexao:
            conexao.criar(pedido(ID, "Я не мальчик! [Context: Série - Episódio 1]", lang="ru", baralho="Русский"))
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual(estado["status"], "completed")
        self.assertIn("Я не мальчик!", notas[0]["campos"]["Frente"])

    def test_uma_frase_com_duas_palavras_vira_dois_cartoes_e_so_conta_quando_os_dois_entram(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, "keep running | run : They keep running", "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            gravadas = len(conexao.conexao.colecao.gravadas)
        self.assertEqual(
            (estado["status"], estado["successfulPhraseIds"], estado["failedPhraseIds"], estado["lastError"]),
            ("partial", [1760000000001], [1760000000000], "openai_rate_limited"),
        )
        self.assertEqual(sorted(c["status"] for c in estado["cards"].values()), ["added", "added", "failed"])
        self.assertEqual(gravadas, 2)

    def test_a_frase_que_ja_esta_no_baralho_conta_como_duplicada_e_nao_e_gravada_de_novo(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "She <b>gave up</b> smoking", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "gave up : She gave up smoking"))
            estado = conexao.esperar(ID)
        self.assertEqual((estado["status"], estado["successfulPhraseIds"], estado["duplicatePhraseIds"]), ("completed", [1760000000000], [1760000000000]))
        self.assertEqual(colecao.gravadas, [])

    def test_com_o_chrome_fechado_o_envio_termina_sozinho_e_a_lista_traz_o_que_chegou(self):
        # Depois de criar, ninguém pergunta nada (o painel e o Chrome fechados); ao reabrir, a lista diz o que aconteceu.
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            fim = time.monotonic() + 15
            while not conexao.conexao.colecao.gravadas and time.monotonic() < fim:
                time.sleep(0.02)
            time.sleep(0.2)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
        self.assertEqual([(job["jobId"], job["status"], job["state"]["successfulPhraseIds"]) for job in lista], [(ID, "completed", [1760000000000])])


class AGravacaoEsperaOAnki(unittest.TestCase):
    def test_com_o_perfil_fechado_o_envio_espera_e_continua_quando_o_perfil_abre(self):
        colecao = ColecaoEmMemoria(INGLES)
        colecao.fechar()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            esperando = conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            time.sleep(0.2)
            ainda = conexao.estado(ID)
            colecao.abrir()
            estado = conexao.esperar(ID)
        self.assertEqual((esperando["status"], ainda["status"], ainda["stage"]), ("running", "running", "wait_anki"))
        self.assertEqual((estado["status"], len(colecao.gravadas)), ("completed", 1))

    def test_durante_a_sincronizacao_a_gravacao_espera_e_tenta_de_novo(self):
        colecao = ColecaoEmMemoria(INGLES)
        colecao.sincronizando = True
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            antes = len(colecao.gravadas)
            colecao.sincronizando = False
            estado = conexao.esperar(ID)
        self.assertEqual((antes, estado["status"], len(colecao.gravadas)), (0, "completed", 1))

    def test_sem_o_tipo_de_nota_de_hoje_o_envio_falha_antes_de_gastar_a_chave(self):
        colecao = ColecaoEmMemoria(dict(INGLES, tiposDeNota={"Basic": ["Front", "Back"]}))
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["lastError"], pedidos), ("failed", "note_type_missing", []))


class AChave(unittest.TestCase):
    def test_sem_chave_na_conexao_o_envio_falha_sem_pedir_nada_a_openai(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["lastError"], pedidos), ("failed", "openai_key_missing", []))

    def test_a_chave_recusada_para_o_envio_no_primeiro_cartao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("*", 401, "invalid_api_key")
            conexao.criar(pedido(ID, "give up : She gave up smoking", "keep running : They keep running"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["lastError"], len(pedidos)), ("failed", "openai_key_rejected", 1))
        self.assertEqual(sorted(c["status"] for c in estado["cards"].values()), ["failed", "pending"])

    def test_a_chave_vai_so_no_cabecalho_do_pedido_a_openai_e_em_nenhum_arquivo_log_ou_resposta(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 401, "invalid_api_key")
            conexao.criar(pedido(ID, "give up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            respostas = b"".join(conexao.pedir("POST", caminho, corpo=corpo)[2] for caminho, corpo in (
                ("/jobs/list", {}), ("/jobs/get", {"jobId": ID}), ("/jobs/debug-bundle", {"jobId": ID}), ("/analytics/jobs", {"lang": "all"})))
            arquivos = {nome: conteudo for nome, conteudo in conexao.arquivos().items() if not nome.startswith("chaves")}
            autorizacoes = {p[0] for p in chats(conexao.openai)}
        self.assertEqual(autorizacoes, {"Bearer " + CHAVE})
        for nome, conteudo in arquivos.items():
            self.assertNotIn(CHAVE.encode(), conteudo, nome)
        self.assertNotIn(CHAVE.encode(), respostas)
        self.assertNotIn(b"Incorrect API key", respostas)


class ARetomada(unittest.TestCase):
    def test_um_envio_interrompido_continua_de_onde_parou_sem_refazer_um_cartao_pronto(self):
        # A Conexão parou no meio: um Cartão já estava no Anki, outro tinha o texto pago e a nota gravada sem o estado gravado.
        fila = ler_o_contrato()["filas"]["um Envio que terminou em parte"]
        job = dict(fila[0]["job"])
        estado = json.loads(json.dumps(fila[0]["state"]))
        estado.update(status="running", stage="send_to_anki", successfulPhraseIds=[], failedPhraseIds=[], lastError=None)
        estado["cards"]["run__aab53287"].update(status="text", error=None)
        estado["cards"]["give_up__474901fc"].update(status="text")
        textos = {"run__aab53287": "## Anki Card\n\nFront: They *run*\n\nBack: run - /rʌn/\n",
                  "give_up__474901fc": "## Anki Card\n\nFront: She *gave up* smoking\n\nBack: give up - /ɡɪv ʌp/\n"}
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "They keep <b>running</b>", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, [{"job": job, "state": estado, "custos": [], "textos": textos}])
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "She <b>gave up</b> smoking", "Verso": "x"}, [],
                                   guid=_guid(job["jobId"], "give_up__474901fc"))
            colecao.gravadas.clear()
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                final = conexao.esperar(job["jobId"])
                pedidos = chats(conexao.openai)
        self.assertEqual(pedidos, [])
        self.assertEqual([n["campos"]["Frente"] for n in colecao.gravadas], ["They <b>run</b>"])
        self.assertEqual(
            {stem: c["status"] for stem, c in final["cards"].items()},
            {"keep_running__d32b3528": "added", "run__aab53287": "added", "give_up__474901fc": "added"},
        )
        self.assertEqual((final["status"], sorted(final["successfulPhraseIds"]), final["duplicatePhraseIds"]),
                         ("completed", [1760270400001, 1760270400002], []))

    def test_tentar_de_novo_refaz_so_o_cartao_que_falhou(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, "keep running | run : They keep running"))
            conexao.esperar(ID)
            antes = len(chats(conexao.openai))
            conexao.openai.recusar_o_chat_de("run", None, None)
            retomada = json.loads(conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})[2])
            estado = conexao.esperar(ID)
            depois = [p[1]["messages"][1]["content"] for p in chats(conexao.openai)[antes:]]
            gravadas = [n["campos"]["Verso"].split(" - ")[0] for n in conexao.conexao.colecao.gravadas]
        self.assertEqual(retomada, {"jobId": ID, "status": "queued"})
        self.assertEqual(estado["status"], "completed")
        self.assertEqual(len(depois), 1)
        self.assertIn("Target keyword for this card: run", depois[0])
        self.assertEqual(gravadas, ["keep running", "run"])

    def test_o_mesmo_pedido_de_criar_repetido_nao_cria_outro_envio_nem_paga_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            corpo = pedido(ID, "give up : She gave up smoking")
            conexao.criar(corpo)
            conexao.esperar(ID)
            de_novo = conexao.criar(corpo)
            outro = conexao.criar(dict(corpo, deckName="Outro"))
            time.sleep(0.2)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
            pedidos = chats(conexao.openai)
        self.assertEqual((de_novo, outro), ((201, {"jobId": ID, "status": "completed"}), (409, {"error": "job_conflict"})))
        self.assertEqual((len(lista), len(pedidos)), (1, 1))

    def test_dois_envios_rodam_um_depois_do_outro(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.criar(pedido(OUTRO_ID, "keep running : They keep running"))
            estados = [conexao.esperar(ID)["status"], conexao.esperar(OUTRO_ID)["status"]]
        self.assertEqual(estados, ["completed", "completed"])


class OsCustos(unittest.TestCase):
    def test_os_custos_de_cada_envio_ficam_na_pasta_de_dados_e_a_aba_custos_os_le(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            linhas = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]
            registros = conexao.arquivos()[os.path.join("custos", ID, "costs.jsonl")].decode("utf-8").splitlines()
        self.assertEqual([json.loads(r)["type"] for r in registros], ["tokens"])
        self.assertEqual(
            [(l["jobId"], l["status"], l["requestedCards"], l["successfulCards"], l["costs"]["cardUsd"], l["costs"]["totalUsd"]) for l in linhas],
            [(ID, "completed", 1, 1, 0.0045, 0.0045)],
        )


class OProcessoDoAnki(unittest.TestCase):
    def test_o_envio_que_falha_nao_escreve_na_saida_nem_no_erro_do_processo(self):
        saida, erro = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as pasta, contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            with EnvioNoTeste(pasta) as conexao:
                conexao.openai.recusar_o_chat_de("*", 503, None)
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
                estado = conexao.esperar(ID)
                registrado = conexao.log()
        self.assertEqual((estado["status"], estado["lastError"]), ("failed", "openai_unreachable"))
        self.assertEqual((saida.getvalue(), erro.getvalue()), ("", ""))
        self.assertIn(ID, registrado)


def _guid(job_id, stem):
    from complemento import envio

    return envio.guid_do_cartao(job_id, stem)


if __name__ == "__main__":
    unittest.main()
