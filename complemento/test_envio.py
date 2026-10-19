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
        self.assertEqual(list(estado["cards"].values()), [{"phraseId": 1760000000000, "status": "added", "error": None}])
        self.assertEqual(list(estado["cards"]), ["1760000000000-0"])

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

    def test_a_gravacao_que_o_anki_ocupado_atrasou_da_uma_nota_so_e_o_cartao_fica_added_nao_duplicate(self):
        from complemento import baralhos

        class AtrasaAPrimeira(ColecaoEmMemoria):
            """A primeira gravação roda (a nota entra) mas o Anki só responde depois dos 10 s: a thread de trabalho desistiu."""

            atrasou = False

            def gravar_cartao(self, *argumentos):
                resultado = super().gravar_cartao(*argumentos)
                if not self.atrasou:
                    self.atrasou = True
                    raise baralhos.ColecaoIndisponivel("anki_busy")
                return resultado

        colecao = AtrasaAPrimeira(INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"], estado["duplicatePhraseIds"]), ("completed", "added", []))
        self.assertEqual((len(colecao.gravadas), len(pedidos)), (1, 1))

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

    def test_quando_a_chave_e_recusada_no_meio_os_textos_ja_pagos_vao_ao_anki(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 401, "invalid_api_key")
            conexao.criar(pedido(ID, "gave up : She gave up smoking", "run : They run", "late : Better late than never"))
            estado = conexao.esperar(ID)
            gravadas = [n["campos"]["Verso"].split(" - ")[0] for n in conexao.conexao.colecao.gravadas]
        self.assertEqual((estado["status"], estado["lastError"], estado["successfulPhraseIds"]), ("partial", "openai_key_rejected", [1760000000000]))
        self.assertEqual(gravadas, ["gave up"])
        self.assertEqual(sorted(c["status"] for c in estado["cards"].values()), ["added", "failed", "pending"])

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
        estado["cards"]["1760270400001-1"].update(status="text", error=None)
        estado["cards"]["1760270400002-0"].update(status="text")
        textos = {"1760270400001-1": "## Anki Card\n\nFront: They *run*\n\nBack: run - /rʌn/\n",
                  "1760270400002-0": "## Anki Card\n\nFront: She *gave up* smoking\n\nBack: give up - /ɡɪv ʌp/\n"}
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "They keep <b>running</b>", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta:
            semear_a_fila(pasta, [{"job": job, "state": estado, "custos": [], "textos": textos}])
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "She <b>gave up</b> smoking", "Verso": "x"}, [],
                                   guid=_guid(job["jobId"], "1760270400002-0"))
            colecao.gravadas.clear()
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                final = conexao.esperar(job["jobId"])
                pedidos = chats(conexao.openai)
        self.assertEqual(pedidos, [])
        self.assertEqual([n["campos"]["Frente"] for n in colecao.gravadas], ["They <b>run</b>"])
        self.assertEqual(
            {stem: c["status"] for stem, c in final["cards"].items()},
            {"1760270400001-0": "added", "1760270400001-1": "added", "1760270400002-0": "added"},
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

    def test_o_pedido_gravado_sem_entrar_na_fila_entra_quando_o_painel_pede_de_novo(self):
        # A Conexão parou entre gravar o pedido e pô-lo na fila; o painel manda o mesmo pedido de novo.
        corpo = pedido(ID, "gave up : She gave up smoking")
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(corpo)
            with open(os.path.join(pasta, "fila", "fila.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"jobs": []}, arquivo)
            with EnvioNoTeste(pasta) as conexao:
                de_novo = conexao.criar(corpo)
                estado = conexao.esperar(ID)
        self.assertEqual((de_novo[0], estado["status"]), (201, "completed"))

    def test_uma_frase_sem_um_id_inteiro_e_recusada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            for ruim in (True, "12", 1.5, None):
                corpo = pedido(ID, "gave up : She gave up smoking")
                corpo["entries"][0]["phraseId"] = ruim
                self.assertEqual(conexao.criar(corpo), (400, {"error": "entries_required"}), ruim)
            self.assertEqual(json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"], [])

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


PALAVRA = "zymurgyxq"
FRASE = "The zymurgyxq vat bubbled all night"
LINHA = "%s : %s [Context: Série - Cervejaria zorblax - S01E01]" % (PALAVRA, FRASE)
SENTINELAS = (PALAVRA, "zymurgyxq vat", "zorblax", "bubbled all night")


def listar(conexao):
    return json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]


def apagar_as_frases(conexao):
    status, _, resposta = conexao.pedir("POST", "/jobs/apagar-frases", corpo={})
    return status, json.loads(resposta)


def arquivos_sem_o_log(conexao):
    return {nome: conteudo for nome, conteudo in conexao.arquivos().items() if not nome.endswith("complemento.log") and not nome.startswith("chaves")}


class OCartaoTemIdentidadePropria(unittest.TestCase):
    def test_duas_frases_com_o_mesmo_texto_viram_dois_cartoes_dois_guids_e_o_segundo_e_duplicado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            corpo = pedido(ID, "give up : She gave up smoking", "give up : She gave up smoking")
            conexao.criar(corpo)
            estado = conexao.esperar(ID)
            notas = conexao.conexao.colecao.gravadas
        self.assertEqual(sorted(estado["cards"]), ["1760000000000-0", "1760000000001-0"])
        self.assertEqual([c["status"] for _, c in sorted(estado["cards"].items())], ["added", "duplicate"])
        self.assertEqual((len(notas), estado["status"], estado["duplicatePhraseIds"]), (1, "completed", [1760000000001]))

    def test_o_mesmo_phrase_id_repetido_no_corpo_vale_uma_vez(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            corpo = pedido(ID, "give up : She gave up smoking")
            corpo["entries"].append(dict(corpo["entries"][0], line="outra : linha"))
            conexao.criar(corpo)
            estado = conexao.esperar(ID)
            pedidos = chats(conexao.openai)
        self.assertEqual((list(estado["cards"]), len(pedidos)), (["1760000000000-0"], 1))


class OStatusMoraNoEstado(unittest.TestCase):
    def test_um_fila_json_com_status_velho_nao_muda_o_que_a_lista_e_a_retomada_dizem(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta) as conexao:
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
                conexao.esperar(ID)
                caminho = os.path.join(pasta, "fila", "fila.json")
                with open(caminho, encoding="utf-8") as arquivo:
                    fila = json.load(arquivo)
                fila["jobs"][0].update(status="failed", updatedAt="1999-01-01T00:00:00Z")
                with open(caminho, "w", encoding="utf-8") as arquivo:
                    json.dump(fila, arquivo)
                lista = listar(conexao)
                pedidos_antes = len(chats(conexao.openai))
            with EnvioNoTeste(pasta) as conexao:
                time.sleep(0.2)
                depois = conexao.estado(ID)
                pedidos_depois = len(chats(conexao.openai))
        self.assertEqual([(j["status"], j["state"]["status"]) for j in lista], [("completed", "completed")])
        self.assertEqual((depois["status"], pedidos_antes, pedidos_depois), ("completed", 1, 0))

    def test_a_fila_nao_guarda_o_status_de_nenhum_envio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            fila = json.loads(conexao.arquivos()[os.path.join("fila", "fila.json")])
        self.assertEqual([sorted(item) for item in fila["jobs"]], [["createdAt", "jobId", "lang"]])


class OCriarInterrompido(unittest.TestCase):
    def semear_o_criar_que_parou(self, pasta, ate):
        """Os arquivos que o criar já tinha gravado quando a Conexão morreu: 'pedido', 'estado' (sem a fila)."""
        with EnvioNoTeste(pasta, trabalhando=False) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
        os.remove(os.path.join(pasta, "fila", "fila.json"))
        if ate == "pedido":
            os.remove(os.path.join(pasta, "estado", ID + ".json"))

    def test_o_mesmo_corpo_termina_o_criar_que_parou_em_cada_ponto_e_o_envio_roda(self):
        for ate in ("pedido", "estado"):
            with self.subTest(ate), tempfile.TemporaryDirectory() as pasta:
                self.semear_o_criar_que_parou(pasta, ate)
                with EnvioNoTeste(pasta) as conexao:
                    time.sleep(0.2)
                    sem_o_corpo = listar(conexao)
                    resposta = conexao.criar(pedido(ID, "give up : She gave up smoking"))
                    estado = conexao.esperar(ID)
                self.assertEqual(sem_o_corpo, [], "a Conexão que sobe não põe na fila um pedido que ninguém acompanha")
                self.assertEqual(resposta[0], 201)
                self.assertEqual((estado["status"], list(estado["cards"])), ("completed", ["1760000000000-0"]))

    def test_outro_corpo_com_o_mesmo_id_e_409_em_cada_ponto(self):
        for ate in ("pedido", "estado"):
            with self.subTest(ate), tempfile.TemporaryDirectory() as pasta:
                self.semear_o_criar_que_parou(pasta, ate)
                with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                    resposta = conexao.criar(pedido(ID, "outra : coisa"))
                self.assertEqual(resposta, (409, {"error": "job_conflict"}))

    def test_um_id_da_fila_sem_estado_tem_o_estado_refeito_na_subida_e_o_envio_roda_sem_pagar_de_novo(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
                conexao.esperar(ID)
            os.remove(os.path.join(pasta, "estado", ID + ".json"))
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                estado = conexao.esperar(ID)
                pedidos = chats(conexao.openai)
        # A Frase já tinha chegado ao Anki (a linha virou só `noAnki`): o estado refeito a diz, e nada se paga nem se grava de novo.
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"], pedidos), ("completed", "added", []))
        self.assertEqual(len(colecao.gravadas), 1)

    def test_um_id_da_fila_sem_estado_e_sem_pedido_sai_da_fila_e_o_log_diz_por_que(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
            os.remove(os.path.join(pasta, "estado", ID + ".json"))
            os.remove(os.path.join(pasta, "fila", ID + ".json"))
            with EnvioNoTeste(pasta) as conexao:
                time.sleep(0.2)
                lista = listar(conexao)
                registrado = conexao.log()
        self.assertEqual(lista, [])
        self.assertIn("saiu da fila", registrado)

    def test_o_mesmo_corpo_depois_do_fim_e_depois_do_apagar_tudo_e_201_sem_gravar_nada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            corpo = pedido(ID, "give up : She gave up smoking")
            conexao.criar(corpo)
            conexao.esperar(ID)
            time.sleep(0.1)
            antes = arquivos_sem_o_log(conexao)
            depois_do_fim = conexao.criar(corpo)
            apagar_as_frases(conexao)
            antes_do_apagar_de_novo = arquivos_sem_o_log(conexao)
            depois_do_apagar = conexao.criar(corpo)
            final = arquivos_sem_o_log(conexao)
            pedidos = len(chats(conexao.openai))
        self.assertEqual(depois_do_fim, (201, {"jobId": ID, "status": "completed"}))
        self.assertEqual(depois_do_apagar, (201, {"jobId": ID, "status": "completed"}))
        self.assertEqual(final, antes_do_apagar_de_novo)
        self.assertEqual(pedidos, 1)


class AChaveDuranteOEnvio(unittest.TestCase):
    def test_trocar_a_chave_no_meio_faz_o_cartao_seguinte_usar_a_nova(self):
        nova = "sk-proj-chave-nova-1111"
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            def trocar(metodo, autorizacao):
                if len(conexao.openai.chats) == 0 and not getattr(trocar, "feito", False):
                    trocar.feito = True
                    with open(os.path.join(conexao.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                        json.dump({"chave": nova, "conta": "", "versao": 2, "em": 2, "naoEnviada": True}, arquivo)

            conexao.openai.antes_de_responder = trocar
            conexao.criar(pedido(ID, "give up : She gave up smoking", "keep running : They keep running"))
            conexao.esperar(ID)
            autorizacoes = [p[0] for p in chats(conexao.openai)]
        self.assertEqual(autorizacoes, ["Bearer " + CHAVE, "Bearer " + nova])

    def test_apagar_a_chave_no_meio_para_o_envio_com_chave_ausente_e_nenhum_pedido_depois(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            def apagar(metodo, autorizacao):
                caminho = os.path.join(conexao.chaves, "openai.json")
                if os.path.exists(caminho):
                    os.remove(caminho)

            conexao.openai.antes_de_responder = apagar
            conexao.criar(pedido(ID, "give up : She gave up smoking", "keep running : They keep running", "late : Better late than never"))
            estado = conexao.esperar(ID)
            pedidos = len(chats(conexao.openai))
        self.assertEqual((estado["status"], estado["lastError"], pedidos), ("partial", "openai_key_missing", 1))
        self.assertEqual(sorted(c["status"] for c in estado["cards"].values()), ["added", "pending", "pending"])


class OGuidAntesDoTexto(unittest.TestCase):
    def test_um_cartao_cuja_nota_ja_esta_no_anki_nao_gera_texto_nem_chama_a_openai(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, colecao=colecao, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "x", "Verso": "y"}, [], _guid(ID, "1760000000000-0"))
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                estado = conexao.esperar(ID)
                pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado["cards"]["1760000000000-0"]["status"], pedidos), ("completed", "added", []))

    def test_um_cartao_sem_a_linha_e_sem_nota_falha_sem_gerar_nada(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, "give up : She gave up smoking"))
                apagar_as_frases(conexao)
            with EnvioNoTeste(pasta) as conexao:
                time.sleep(0.2)
                estado = conexao.estado(ID)
                pedidos = chats(conexao.openai)
        self.assertEqual((estado["status"], estado.get("wiped"), pedidos), ("failed", True, []))


class OApagarTudo(unittest.TestCase):
    def test_o_apagar_tudo_tira_as_linhas_e_os_textos_e_deixa_o_estado_e_os_custos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, "keep running | run : They keep running", "give up : She gave up smoking"))
            parcial = conexao.esperar(ID)
            antes = arquivos_sem_o_log(conexao)
            resposta = apagar_as_frases(conexao)
            depois = arquivos_sem_o_log(conexao)
            estado = conexao.estado(ID)
            job = json.loads(conexao.pedir("POST", "/jobs/get", corpo={"jobId": ID})[2])["job"]
        self.assertEqual(resposta, (200, {"ok": True}))
        self.assertEqual(parcial["status"], "partial")
        self.assertEqual([nome for nome in depois if nome.endswith(".txt")], [])
        self.assertTrue(all("line" not in entrada for entrada in job["entries"]))
        self.assertEqual([entrada["phraseId"] for entrada in job["entries"]], [1760000000000, 1760000000001])
        self.assertEqual(sorted(estado["cards"]), ["1760000000000-0", "1760000000000-1", "1760000000001-0"])
        self.assertTrue(estado["wiped"])
        self.assertIn(os.path.join("custos", ID, "costs.jsonl"), depois)

    def test_repetido_responde_igual_e_nao_grava_nada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            primeira = apagar_as_frases(conexao)
            antes = arquivos_sem_o_log(conexao)
            segunda = apagar_as_frases(conexao)
            depois = arquivos_sem_o_log(conexao)
        self.assertEqual((primeira, segunda), ((200, {"ok": True}), (200, {"ok": True})))
        self.assertEqual(antes, depois)

    def test_um_envio_andando_para_antes_do_proximo_cartao_e_vai_a_failed_com_wiped(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            def apagar(metodo, autorizacao):
                if len(conexao.openai.chats) == 0 and not getattr(apagar, "feito", False):
                    apagar.feito = True
                    apagar_as_frases(conexao)

            conexao.openai.antes_de_responder = apagar
            conexao.criar(pedido(ID, "give up : She gave up smoking", "keep running : They keep running"))
            estado = conexao.esperar(ID)
            time.sleep(0.2)
            pedidos = len(chats(conexao.openai))
            arquivos = arquivos_sem_o_log(conexao)
        self.assertEqual((estado["status"], estado["wiped"], pedidos), ("failed", True, 1))
        self.assertEqual([nome for nome in arquivos if nome.endswith(".txt")], [])
        self.assertEqual(sorted(c["status"] for c in estado["cards"].values()), ["pending", "pending"])

    def test_tentar_de_novo_um_envio_apagado_responde_o_estado_e_nao_grava_nada_em_qualquer_status(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, "keep running | run : They keep running", "give up : She gave up smoking"))
            conexao.esperar(ID)  # partial
            apagar_as_frases(conexao)
            antes = arquivos_sem_o_log(conexao)
            pedidos = len(chats(conexao.openai))
            resposta = json.loads(conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})[2])
            time.sleep(0.2)
            depois = arquivos_sem_o_log(conexao)
            final = len(chats(conexao.openai))
        self.assertEqual(resposta, {"jobId": ID, "status": "partial"})
        self.assertEqual((antes, pedidos), (depois, final))

    def test_o_pedido_orfao_sem_estado_e_sem_fila_tambem_perde_a_frase(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
            os.remove(os.path.join(pasta, "fila", "fila.json"))
            os.remove(os.path.join(pasta, "estado", ID + ".json"))
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                apagar_as_frases(conexao)
                restos = [nome for nome, conteudo in conexao.arquivos().items() if any(sentinela.encode() in conteudo for sentinela in SENTINELAS)]
        self.assertEqual(restos, [])


class AFraseNaoSobreviveAoApagarTudo(unittest.TestCase):
    def test_a_palavra_e_a_frase_unicas_nao_estao_em_user_files_no_log_nem_no_pacote_depois_do_apagar_tudo(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            # O Anki fecha com o texto já pago e a linha ainda no pedido: é onde a Frase mais mora na Conexão.
            conexao.openai.antes_de_responder = lambda metodo, autorizacao: colecao.fechar()
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            onde_estava = sorted(nome for nome, conteudo in arquivos_sem_o_log(conexao).items() if PALAVRA.encode() in conteudo)
            apagar_as_frases(conexao)
            colecao.abrir()
            time.sleep(0.3)
            arquivos = arquivos_sem_o_log(conexao)
            registrado = conexao.log().encode()
            respostas = b"".join(
                conexao.pedir("POST", caminho, corpo=corpo)[2]
                for caminho, corpo in (("/jobs/get", {"jobId": ID}), ("/jobs/debug-bundle", {"jobId": ID}))
            ) + conexao.pedir("POST", "/jobs/list", corpo={})[2] + conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2]
            gravadas = colecao.gravadas
        self.assertEqual(len(onde_estava), 2, "a prova só vale se a Frase estava na Conexão antes: %s" % onde_estava)
        for sentinela in SENTINELAS:
            for nome, conteudo in arquivos.items():
                self.assertNotIn(sentinela.encode(), conteudo, "%s em %s" % (sentinela, nome))
            self.assertNotIn(sentinela.encode(), registrado, "%s no complemento.log" % sentinela)
            self.assertNotIn(sentinela.encode(), respostas, "%s numa resposta" % sentinela)
        self.assertEqual(gravadas, [], "o Envio apagado não grava mais nada")

    def test_o_apagar_tudo_com_o_cartao_pago_esperando_o_anki_nao_conta_como_falha_ao_gravar(self):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.antes_de_responder = lambda metodo, autorizacao: colecao.fechar()
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            apagar_as_frases(conexao)
            time.sleep(0.3)
            estado = conexao.estado(ID)
            registrado = conexao.log()
        erros = {cartao["error"] for cartao in estado["cards"].values()}
        self.assertEqual((estado["status"], estado["lastError"], estado["wiped"]), ("failed", "frases_apagadas", True))
        self.assertNotIn("anki_write_failed", erros)
        self.assertNotIn("o Anki não gravou o Cartão", registrado)

    def test_o_provisorio_novo_de_qualquer_pasta_tambem_perde_a_palavra_e_a_frase_no_apagar_tudo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            conexao.criar(pedido(ID, LINHA))
            with open(os.path.join(pasta, "fila", ID + ".json"), "rb") as arquivo:
                conteudo = arquivo.read()
            sobras = [("fila", ID + ".json.novo"), ("fila", "fila.json.novo"), ("estado", ID + ".json.novo"),
                      ("estado", ID, "1.txt.novo"), ("custos", ID, "custos.jsonl.novo")]
            for partes in sobras:
                caminho = os.path.join(pasta, *partes)
                os.makedirs(os.path.dirname(caminho), exist_ok=True)
                with open(caminho, "wb") as arquivo:
                    arquivo.write(conteudo)
            apagar_as_frases(conexao)
            restos = [nome for nome, c in conexao.arquivos().items() if nome.endswith(".novo") or PALAVRA.encode() in c]
        self.assertEqual(restos, [])

    def test_o_envio_que_nem_chegou_a_apagar_nao_poe_a_palavra_no_log_no_estado_nem_nos_custos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("*", 503, None)
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID)
            conexao.openai.recusar_o_chat_de("*", None, None)
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            conexao.esperar(ID, lambda e: e["status"] == "completed")
            time.sleep(0.2)
            arquivos = arquivos_sem_o_log(conexao)
            registrado = conexao.log()
            pacote = conexao.pedir("POST", "/jobs/debug-bundle", corpo={"jobId": ID})[2]
        com_a_palavra = [nome for nome, conteudo in arquivos.items() if PALAVRA.encode() in conteudo and nome.startswith(("estado", "custos"))]
        self.assertEqual(com_a_palavra, [])
        self.assertNotIn(PALAVRA, registrado)
        self.assertNotIn(PALAVRA.encode(), pacote)
        self.assertNotIn(FRASE.encode(), pacote)


class OIdNasRotas(unittest.TestCase):
    def test_um_id_fora_de_uuid_e_404_ao_achar_e_so_um_id_com_caminho_ou_sem_texto_e_400(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            for caminho in ("/jobs/get", "/jobs/retry", "/jobs/debug-bundle"):
                respostas = [conexao.pedir("POST", caminho, corpo={"jobId": ruim})[0] for ruim in ("job-do-bridge_1", "abc", "x" * 200)]
                recusadas = [conexao.pedir("POST", caminho, corpo={"jobId": ruim})[0] for ruim in ("../x", "a/b", "a\\b", 7, None)]
                self.assertEqual((respostas, recusadas), ([404, 404, 404], [400] * 5), caminho)


SCRIPT_QUE_SAI_COM_O_PEDIDO_PENDENTE = r"""
import os, sys, time
sys.path.insert(0, %(raiz)r)
from complemento.test_envio import EnvioNoTeste, pedido, ID
conexao = EnvioNoTeste(%(pasta)r)
conexao.__enter__()
conexao.openai.antes_de_responder = lambda metodo, autorizacao: time.sleep(120)
conexao.criar(pedido(ID, "give up : She gave up smoking"))
fim = time.monotonic() + 15
while not conexao.openai.pedidos and time.monotonic() < fim:
    time.sleep(0.01)
print("pendente" if conexao.openai.pedidos else "sem pedido", flush=True)
sys.exit(0)  # ninguem chama `parar()`: o Anki fecha e o processo acaba
"""


class FecharOAnkiNoMeioDoEnvio(unittest.TestCase):
    def test_o_processo_acaba_com_um_pedido_de_120_s_a_openai_pendente_sem_esperar_a_thread_de_trabalho(self):
        import subprocess

        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with tempfile.TemporaryDirectory() as pasta:
            inicio = time.monotonic()
            resultado = subprocess.run(
                [sys.executable, "-c", SCRIPT_QUE_SAI_COM_O_PEDIDO_PENDENTE % {"raiz": raiz, "pasta": pasta}],
                capture_output=True, text=True, timeout=60)
            duracao = time.monotonic() - inicio
        self.assertEqual((resultado.returncode, resultado.stdout.strip()), (0, "pendente"), resultado.stderr)
        self.assertLess(duracao, 20, "a thread de trabalho segurou o fim do processo")


def _guid(job_id, stem):
    from complemento import envio

    return envio.guid_do_cartao(job_id, stem)


if __name__ == "__main__":
    unittest.main()
