"""A chave da OpenAI vista de fora: o que atravessa o HTTP, o que fica no disco e o que o log guarda.

Roda no Python 3.9 (o do Anki do Mac) e no 3.13:
    python3.9 complemento/test_chave_da_openai.py
"""

import json
import os
import socket
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_servidor import ORIGEM, ConexaoNoTeste  # noqa: E402

CHAVE = "sk-proj-ChaveSecretaDeTeste0123456789-abcd"
OUTRA_CHAVE = "sk-proj-OutraChaveSecreta9876543210-wxyz"
OUTRA_ORIGEM = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def enviar(conexao, chave=CHAVE, **opcoes):
    return conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": chave}, **opcoes)


def estado(conexao):
    status, _, corpo = conexao.pedir("POST", "/ia/estado")
    return status, json.loads(corpo)


def tudo_em_disco(raiz):
    """(caminho relativo, bytes) de cada arquivo embaixo de `raiz`."""
    achados = []
    for pasta, _, arquivos in os.walk(raiz):
        for nome in arquivos:
            caminho = os.path.join(pasta, nome)
            with open(caminho, "rb") as arquivo:
                achados.append((os.path.relpath(caminho, raiz), arquivo.read()))
    return achados


class ChaveRecebida(unittest.TestCase):
    def test_chave_aceita_responde_so_os_4_ultimos_caracteres_e_a_conexao_passa_a_te_la(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = enviar(conexao)
            depois = estado(conexao)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True, "ultimos4": "abcd"}))
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "abcd"}}))

    def test_a_chave_inteira_nao_volta_em_resposta_nenhuma(self):
        with tempfile.TemporaryDirectory() as pasta:
            for comportamento in ("aceita", "recusa", "sem_credito", "org_nao_verificada", "fora_do_ar"):
                with self.subTest(comportamento), ConexaoNoTeste(pasta, openai=comportamento, chave_na_conexao="wxyz") as conexao:
                    respostas = [
                        enviar(conexao),
                        conexao.pedir("POST", "/ia/estado"),
                        conexao.pedir("POST", "/ia/openai/chave", corpo_bruto=CHAVE),
                        conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": CHAVE}, origem=OUTRA_ORIGEM),
                        conexao.pedir("GET", "/health"),
                    ]
                    for status, cabecalhos, corpo in respostas:
                        visto = corpo + json.dumps(cabecalhos).encode("utf-8")
                        self.assertNotIn(CHAVE.encode(), visto)
                        self.assertNotIn(CHAVE[:-4].encode(), visto)

    def test_chave_recusada_nao_e_guardada_e_nao_troca_a_que_ja_estava(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai="recusa", chave_na_conexao="wxyz") as conexao:
            status, _, _ = enviar(conexao, OUTRA_CHAVE)
            depois = estado(conexao)
        self.assertEqual(status, 401)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))

    def test_cada_erro_da_chave_tem_o_seu_codigo(self):
        esperado = {
            "recusa": (401, "openai_key_rejected"),
            "sem_credito": (402, "openai_no_credit"),
            "org_nao_verificada": (403, "openai_org_not_verified"),
            "fora_do_ar": (502, "openai_unreachable"),
            "limite_de_uso": (402, "openai_no_credit"),
            "limite_so_no_pago": (402, "openai_no_credit"),
            "pagamento_402_nos_modelos": (402, "openai_no_credit"),
            "pagamento_402_no_pago": (402, "openai_no_credit"),
        }
        for comportamento, (status_esperado, erro) in esperado.items():
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                status, _, corpo = enviar(conexao)
                sem_chave = estado(conexao)
            self.assertEqual((status, json.loads(corpo)), (status_esperado, {"error": erro}))
            self.assertEqual(sem_chave, (200, {"openai": {"configurada": False}}))

    def test_limite_de_uso_e_pagamento_recusado_nos_dois_pedidos_sao_sem_credito_e_nada_e_guardado(self):
        for comportamento in ("limite_de_uso", "limite_so_no_pago", "pagamento_402_nos_modelos", "pagamento_402_no_pago"):
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta:
                with ConexaoNoTeste(pasta, openai=comportamento, chave_na_conexao="wxyz") as conexao:
                    status, _, corpo = enviar(conexao, OUTRA_CHAVE)
                    depois = estado(conexao)
                    arquivos = tudo_em_disco(conexao.chaves)
                self.assertEqual((status, json.loads(corpo)), (402, {"error": "openai_no_credit"}))
                self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))
                self.assertFalse([nome for nome, dados in arquivos if OUTRA_CHAVE.encode() in dados])

    def test_limite_de_uso_sem_chave_antes_nao_deixa_chave_nenhuma(self):
        for comportamento in ("limite_de_uso", "limite_so_no_pago", "pagamento_402_nos_modelos", "pagamento_402_no_pago"):
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                enviar(conexao)
                depois = estado(conexao)
                arquivos = tudo_em_disco(conexao.chaves)
            self.assertEqual(depois, (200, {"openai": {"configurada": False}}))
            self.assertEqual(arquivos, [])

    def test_trocar_a_chave_guarda_a_nova(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao, CHAVE)
            enviar(conexao, OUTRA_CHAVE)
            depois = estado(conexao)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))

    def test_a_chave_vai_a_openai_so_como_credencial_do_pedido_de_conferencia(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            pedidos = list(conexao.openai.pedidos)
        self.assertTrue(pedidos)
        for metodo, caminho, autorizacao in pedidos:
            self.assertEqual(autorizacao, "Bearer " + CHAVE, "%s %s" % (metodo, caminho))

    def test_espaco_em_volta_da_chave_colada_nao_vira_parte_dela(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = enviar(conexao, "  " + CHAVE + "\n")
        self.assertEqual((status, json.loads(corpo)["ultimos4"]), (200, "abcd"))

    def test_a_chave_guardada_sobrevive_a_reiniciar_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as primeira:
                enviar(primeira)
            with ConexaoNoTeste(pasta) as segunda:
                depois = estado(segunda)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "abcd"}}))

    def test_corpo_grande_demais_e_recusado_sem_ir_a_openai(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = enviar(conexao, "sk-" + "a" * 100000)
            pedidos = list(conexao.openai.pedidos)
        self.assertEqual((status, pedidos), (400, []))


def apagar(conexao, **opcoes):
    return conexao.pedir("POST", "/ia/openai/chave/apagar", corpo={}, **opcoes)


class ChaveApagada(unittest.TestCase):
    """Trocar, Apagar e Apagar tudo na extensão (#154): a cópia da Conexão também sai, e do disco."""

    def test_apagar_tira_a_copia_da_conexao_e_o_arquivo_do_disco(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            status, _, corpo = apagar(conexao)
            depois = estado(conexao)
            arquivos = tudo_em_disco(pasta)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True}))
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))
        self.assertFalse([nome for nome, dados in arquivos if CHAVE.encode() in dados])

    def test_apagar_sem_chave_guardada_tambem_responde_que_esta_apagada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = apagar(conexao)
            depois = estado(conexao)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True}))
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))

    def test_a_chave_apagada_nao_volta_ao_reiniciar_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as primeira:
                enviar(primeira)
                apagar(primeira)
            with ConexaoNoTeste(pasta) as segunda:
                depois = estado(segunda)
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))

    def test_so_a_extensao_apaga_a_copia(self):
        for origem in ("https://exemplo.com", OUTRA_ORIGEM, None):
            with self.subTest(origem), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, chave_na_conexao="wxyz") as conexao:
                status, _, _ = apagar(conexao, origem=origem)
                depois = estado(conexao)
            self.assertEqual(status, 403)
            self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))


class QuemPodeEnviarAChave(unittest.TestCase):
    def test_de_outro_site_de_outra_extensao_ou_sem_origem_nada_e_guardado_nem_conferido(self):
        for origem in ("https://exemplo.com", OUTRA_ORIGEM, None):
            with self.subTest(origem), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                status, _, _ = enviar(conexao, origem=origem)
                guardada = estado(conexao)
                pedidos = list(conexao.openai.pedidos)
                arquivos = tudo_em_disco(conexao.chaves)
            self.assertEqual(status, 403)
            self.assertEqual(guardada, (200, {"openai": {"configurada": False}}))
            self.assertEqual((pedidos, arquivos), ([], []))

    def test_o_estado_da_ia_so_responde_a_extensao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, chave_na_conexao="wxyz") as conexao:
            respostas = [conexao.pedir("POST", "/ia/estado", origem=origem)[0] for origem in ("https://exemplo.com", OUTRA_ORIGEM, None)]
        self.assertEqual(respostas, [403, 403, 403])


class ChaveNoDisco(unittest.TestCase):
    def test_a_chave_fica_so_na_pasta_das_chaves_e_em_mais_nenhum_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            enviar(conexao, "sem forma de chave")
            conexao.pedir("POST", "/ia/openai/chave", corpo_bruto="{ quebrado " + CHAVE)
            arquivos = tudo_em_disco(pasta)
        com_a_chave = [nome for nome, dados in arquivos if CHAVE.encode() in dados]
        self.assertEqual(com_a_chave, [os.path.join("chaves", "openai.json")])

    @unittest.skipIf(os.name == "nt", "as permissões do Windows não são as do Unix")
    def test_o_arquivo_da_chave_so_o_dono_le(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            modo = stat.S_IMODE(os.stat(os.path.join(conexao.chaves, "openai.json")).st_mode)
        self.assertEqual(modo, 0o600)

    def test_nada_fica_pela_metade_quando_a_chave_e_trocada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            enviar(conexao, OUTRA_CHAVE)
            nomes = sorted(os.listdir(conexao.chaves))
        self.assertEqual(nomes, ["openai.json"])


class ChaveNoLog(unittest.TestCase):
    def test_a_chave_nunca_e_escrita_no_log_em_nenhum_caminho(self):
        with tempfile.TemporaryDirectory() as pasta:
            for comportamento in ("aceita", "recusa", "sem_credito", "org_nao_verificada", "fora_do_ar"):
                with ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                    enviar(conexao)
                    enviar(conexao, "sem forma de chave " + CHAVE)
                    conexao.pedir("POST", "/ia/openai/chave", corpo_bruto="{ quebrado " + CHAVE)
                    conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": CHAVE}, origem=OUTRA_ORIGEM)
            with ConexaoNoTeste(pasta) as conexao:
                os.chmod(conexao.chaves, 0o500)  # gravar falha: o erro interno também vai ao log
                try:
                    status, _, _ = enviar(conexao, OUTRA_CHAVE)
                finally:
                    os.chmod(conexao.chaves, 0o700)
                registrado = conexao.log()
        if os.name != "nt" and os.geteuid() != 0:
            self.assertEqual(status, 500)
            self.assertIn("Erro na rota POST /ia/openai/chave", registrado)
        for chave in (CHAVE, OUTRA_CHAVE):
            self.assertNotIn(chave, registrado)
            self.assertNotIn(chave[:-4], registrado)


class CorpoDoPedido(unittest.TestCase):
    def test_corpo_que_nao_e_um_objeto_json_e_pedido_invalido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            respostas = [
                conexao.pedir("POST", "/ia/openai/chave", corpo_bruto=bruto)[0]
                for bruto in ("", "[]", '"sk-x"', '{"chave": 3}', '{"outra": "coisa"}', "\xff")
            ]
        self.assertEqual(respostas, [400] * 6)

    def test_pedido_sem_content_length_nao_trava_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = conexao.pedir("POST", "/ia/estado")
            saude = conexao.pedir("GET", "/health")[0]
        self.assertEqual((status, saude), (200, 200))


class PedidoQueOProtocoloRecusa(unittest.TestCase):
    """A linha de um pedido malformado nunca volta na resposta de erro nem vai ao log, nem se ela for a chave."""

    LINHAS = (
        "%s\r\n\r\n",                    # uma palavra só: sintaxe ruim
        "GET /x %s\r\n\r\n",             # a “versão” é a chave
        "GET /%s HTTP/9.9\r\n\r\n",       # versão que o servidor não fala
        "%s /x HTTP/1.1\r\n\r\n",         # método que o servidor não tem
        "GET /x HTTP/1.1 %s\r\n\r\n",     # palavras demais
        "GET /x HTTP/1.1\r\n%s\r\n\r\n",  # linha de cabeçalho sem “:”
    )

    @staticmethod
    def _cru(conexao, texto):
        with socket.create_connection(("127.0.0.1", conexao.conexao.porta), timeout=5) as ligacao:
            ligacao.sendall(texto.encode("utf-8"))
            recebido = b""
            while True:
                try:
                    pedaco = ligacao.recv(4096)
                except socket.timeout:
                    break
                if not pedaco:
                    break
                recebido += pedaco
        return recebido

    def test_a_linha_recusada_nao_volta_na_resposta_nem_vai_ao_log(self):
        for modelo in self.LINHAS:
            with self.subTest(modelo), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                resposta = self._cru(conexao, modelo % CHAVE)
                registrado = conexao.log()
            self.assertTrue(resposta, "o servidor devia responder o erro")
            for pedaco in (CHAVE, CHAVE[:12]):
                self.assertNotIn(pedaco.encode(), resposta)
                self.assertNotIn(pedaco, registrado)

    def test_o_erro_de_protocolo_fica_registrado_sem_o_conteudo_do_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self._cru(conexao, CHAVE + "\r\n\r\n")
            registrado = conexao.log()
        self.assertIn("http: code 400, message Bad Request", registrado)


if __name__ == "__main__":
    unittest.main()
