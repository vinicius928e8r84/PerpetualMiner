import json
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio, fila_do_envio
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_envio import (
    ID, INGLES, LINHA, SENTINELAS, EnvioNoTeste, apagar_as_frases, arquivos_sem_o_log, chats, pedido)


def Morte():
    return SystemExit("a Conexão morreu aqui")


class Fronteiras:
    def __init__(self, morrer_em=None):
        self.morrer_em = morrer_em
        self.contadas = 0
        self.morta = False
        self.trava = threading.Lock()

    def passar(self):
        with self.trava:
            if self.morta:
                raise Morte()
            if self.morrer_em is not None and self.contadas == self.morrer_em:
                self.morta = True
                raise Morte()
            self.contadas += 1

    def ligadas(self):
        gravar_json, apagar = envio._gravar_json, envio._apagar
        motor = envio.motor_do_complemento().generate_cards
        gravar_texto = motor._write_card
        gravar_cartao = ColecaoEmMemoria.gravar_cartao
        fronteiras = self

        def _gravar_json(*argumentos):
            fronteiras.passar()
            return gravar_json(*argumentos)

        def _apagar(caminho):
            if os.path.exists(caminho):
                fronteiras.passar()
            return apagar(caminho)

        def _write_card(*argumentos):
            fronteiras.passar()
            return gravar_texto(*argumentos)

        def gravar(colecao, *argumentos):
            fronteiras.passar()
            return gravar_cartao(colecao, *argumentos)

        return [
            mock.patch.object(envio, "_gravar_json", _gravar_json), mock.patch.object(envio, "_apagar", _apagar),
            mock.patch.object(fila_do_envio, "_gravar_json", _gravar_json), mock.patch.object(fila_do_envio, "_apagar", _apagar),
            mock.patch.object(motor, "_write_card", _write_card), mock.patch.object(ColecaoEmMemoria, "gravar_cartao", gravar),
        ]

    def __enter__(self):
        self._patches = self.ligadas()
        for patch in self._patches:
            patch.start()
        return self

    def __exit__(self, *erro):
        for patch in self._patches:
            patch.stop()


def dois_cartoes():
    return pedido(ID, "give up : She gave up smoking", "late : Better late than never")


def tentar(funcao, *argumentos):
    try:
        return funcao(*argumentos)
    except (OSError, ValueError, Exception) as erro:  # noqa: BLE001
        return ("sem resposta", type(erro).__name__)


def esperar_ate(condicao, limite=6):
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        if condicao():
            return True
        time.sleep(0.02)
    return False


def ler_estado(pasta):
    caminho = os.path.join(pasta, "estado", ID + ".json")
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, ValueError):
        return {}


def ler_a_fila(pasta):
    try:
        with open(os.path.join(pasta, "fila", "fila.json"), encoding="utf-8") as arquivo:
            return json.load(arquivo)["jobs"]
    except (OSError, ValueError):
        return []


def sobras_da_frase(pasta):
    sobras = []
    for raiz, _, nomes in os.walk(pasta):
        for nome in nomes:
            caminho = os.path.join(raiz, nome)
            if nome.endswith((".txt", ".novo")) and "chaves" not in raiz:
                sobras.append(os.path.relpath(caminho, pasta))
    try:
        with open(os.path.join(pasta, "fila", ID + ".json"), encoding="utf-8") as arquivo:
            sobras += ["linha de %s" % e["phraseId"] for e in json.load(arquivo)["entries"] if "line" in e]
    except (OSError, ValueError):
        pass
    return sorted(sobras)


def palavra_da_nota(nota):
    return nota["campos"]["Palavra"].split(" - ")[0]


def pedidos_sobre(palavra, pedidos):
    return [pedido_ for pedido_ in pedidos if "Target keyword for this card: %s" % palavra in pedido_ or palavra + " : " in pedido_]


def tem_pedido_e_estado(pasta):
    return os.path.exists(os.path.join(pasta, "fila", ID + ".json")) and os.path.exists(os.path.join(pasta, "estado", ID + ".json"))


def provisorios_fora_das_chaves(pasta):
    provisorios = []
    for raiz, _, nomes in os.walk(pasta):
        provisorios += [os.path.join(raiz, nome) for nome in nomes if nome.endswith(".novo") and "chaves" not in raiz]
    return provisorios


class MorteAoRenomear:
    def __init__(self, morrer_em):
        self.morrer_em = morrer_em
        self.renomear = os.replace
        self.contadas = []
        self.morta = []

    def __call__(self, origem, destino, *argumentos, **nomeados):
        if not str(origem).endswith(".novo"):
            return self.renomear(origem, destino, *argumentos, **nomeados)
        if self.morta or len(self.contadas) == self.morrer_em:
            self.morta.append(origem)
            raise Morte()
        self.contadas.append(origem)
        return self.renomear(origem, destino, *argumentos, **nomeados)


class AMorteEmCadaGravacaoDoCriarEDoTrabalho(unittest.TestCase):
    def rodar(self, morrer_em):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            fronteiras = Fronteiras(morrer_em)
            with fronteiras:
                with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                    tentar(conexao.criar, dois_cartoes())
                    esperar_ate(lambda: fronteiras.morta or ler_estado(pasta).get("status") in envio.FIM)
                    time.sleep(0.15)
            gravadas_ao_morrer = {nota["guid"]: palavra_da_nota(nota) for nota in colecao.gravadas}
            na_fila_ao_morrer = ler_a_fila(pasta)
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                time.sleep(0.15)
                na_fila_na_subida = ler_a_fila(pasta)
                resposta = conexao.criar(dois_cartoes())
                conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
                estado = conexao.esperar(ID)
                depois = [p[1]["messages"][1]["content"] for p in chats(conexao.openai)]
                fila = ler_a_fila(pasta)
                sem_encalhar = tem_pedido_e_estado(pasta)
                restos = sobras_da_frase(pasta)
        rotulo = "morrendo na gravação %s" % morrer_em
        self.assertEqual(resposta[0], 201, "%s: o mesmo corpo não pode dar 409 nem erro" % rotulo)
        self.assertEqual((estado["status"], sorted(estado["successfulPhraseIds"])), ("completed", [1760000000000, 1760000000001]), rotulo)
        self.assertEqual(restos, [], "%s: terminado o Envio, a Frase e o texto pago não ficam em user_files" % rotulo)
        self.assertEqual(estado["duplicatePhraseIds"], [], "%s: a nota que o próprio Envio gravou não é duplicata" % rotulo)
        self.assertEqual([item["jobId"] for item in fila], [ID], "%s: o Envio entra na fila uma vez" % rotulo)
        self.assertTrue(sem_encalhar, "%s: id encalhado (a fila tem um id sem pedido ou sem estado)" % rotulo)
        self.assertEqual(sorted(palavra_da_nota(nota) for nota in colecao.gravadas), ["give up", "late"], rotulo)
        for guid, palavra in gravadas_ao_morrer.items():
            self.assertFalse(pedidos_sobre(palavra, depois), "%s: a OpenAI foi chamada de novo para %r, que já estava no Anki" % (rotulo, palavra))
        self.assertEqual(na_fila_na_subida, na_fila_ao_morrer, "%s: a Conexão que sobe não põe na fila um pedido que ninguém acompanha" % rotulo)
        return fronteiras.contadas

    def test_em_cada_gravacao_do_criar_e_do_trabalho_a_conexao_morre_sobe_e_o_mesmo_corpo_termina_sem_gastar_de_novo(self):
        total = self.rodar(None)
        self.assertGreater(total, 12, "o contador de gravações devia ver o criar, o trabalho e as notas")
        for ponto in range(total):
            with self.subTest(gravacao=ponto):
                self.rodar(ponto)


class AMorteEmCadaGravacaoDoApagarTudo(unittest.TestCase):
    def preparar_o_envio_com_a_frase_na_conexao(self, pasta, colecao):
        with EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.antes_de_responder = lambda metodo, autorizacao: colecao.fechar()
            conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            antes = arquivos_sem_o_log(conexao)
        self.assertGreaterEqual(sum(1 for c in antes.values() if SENTINELAS[0].encode() in c), 2)

    def rodar(self, morrer_em):
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            self.preparar_o_envio_com_a_frase_na_conexao(pasta, colecao)
            fronteiras = Fronteiras(morrer_em)
            with fronteiras:
                with EnvioNoTeste(pasta, colecao=colecao, trabalhando=False) as conexao:
                    tentar(apagar_as_frases, conexao)
            colecao.abrir()
            with EnvioNoTeste(pasta, colecao=colecao, trabalhando=False) as conexao:
                primeira = apagar_as_frases(conexao)
                antes = arquivos_sem_o_log(conexao)
                segunda = apagar_as_frases(conexao)
                depois = arquivos_sem_o_log(conexao)
            with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                resposta = conexao.criar(pedido(ID, LINHA))
                retomada = json.loads(conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})[2])
                time.sleep(0.3)
                estado = conexao.estado(ID)
                pedidos = chats(conexao.openai)
                final = arquivos_sem_o_log(conexao)
        rotulo = "morrendo na gravação %s do Apagar tudo" % morrer_em
        self.assertEqual((primeira, segunda), ((200, {"ok": True}), (200, {"ok": True})), rotulo)
        self.assertEqual(antes, depois, "%s: repetido não grava nada" % rotulo)
        self.assertEqual(resposta[0], 201, "%s: o mesmo corpo depois do Apagar tudo não pode dar 409" % rotulo)
        self.assertEqual((estado["status"], estado["wiped"], retomada, pedidos, colecao.gravadas), ("failed", True, {"error": "job_wiped"}, [], []), rotulo)
        for sentinela in SENTINELAS:
            for nome, conteudo in final.items():
                self.assertNotIn(sentinela.encode(), conteudo, "%s: %s em %s" % (rotulo, sentinela, nome))
        return fronteiras.contadas

    def test_em_cada_gravacao_do_apagar_tudo_a_conexao_morre_sobe_e_pedir_de_novo_termina_sem_deixar_a_frase(self):
        total = self.rodar(None)
        self.assertGreaterEqual(total, 3)
        for ponto in range(total):
            with self.subTest(gravacao=ponto):
                self.rodar(ponto)


class AMorteDepoisDoArquivoProvisorioEAntesDoRenomear(unittest.TestCase):
    def rodar(self, morrer_em):
        replace = MorteAoRenomear(morrer_em)
        colecao = ColecaoEmMemoria(INGLES)
        with tempfile.TemporaryDirectory() as pasta:
            with mock.patch.object(os, "replace", replace):
                with EnvioNoTeste(pasta, colecao=colecao) as conexao:
                    tentar(conexao.criar, dois_cartoes())
                    esperar_ate(lambda: replace.morta or ler_estado(pasta).get("status") in envio.FIM)
                    time.sleep(0.15)
            provisorios = provisorios_fora_das_chaves(pasta)
            with EnvioNoTeste(pasta, colecao=colecao, trabalhando=False) as conexao:
                apagar_as_frases(conexao)
                restos = arquivos_sem_o_log(conexao)
        return len(replace.contadas) if morrer_em is None else (provisorios, restos)

    def test_em_cada_renomeacao_a_morte_deixa_o_provisorio_e_o_apagar_tudo_o_leva(self):
        total = self.rodar(None)
        self.assertGreater(total, 4)
        for ponto in range(total):
            with self.subTest(renomear=ponto):
                provisorios, restos = self.rodar(ponto)
                for sentinela in SENTINELAS:
                    for nome, conteudo in restos.items():
                        self.assertNotIn(sentinela.encode(), conteudo, "%s em %s" % (sentinela, nome))
                self.assertEqual([nome for nome in restos if nome.endswith(".novo") and not nome.startswith("chaves") and nome != "perfil.json.novo"], [])
                self.assertTrue(provisorios, "a prova só vale se a morte deixou o provisório")


if __name__ == "__main__":
    unittest.main()
