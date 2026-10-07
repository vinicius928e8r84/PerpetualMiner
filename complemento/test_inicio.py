"""O complemento ao carregar: a pasta de dados, a Conexão no ar e a porta ocupada.

    python3.9 complemento/test_inicio.py
"""

import contextlib
import http.client
import io
import json
import os
import socket
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao, inicio, item_de_login  # noqa: E402
from complemento.test_openai_de_mentira import OpenAIDeMentira  # noqa: E402

ORIGEM = configuracao.ORIGENS_ACEITAS[0]


def saude(porta):
    pedido = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        pedido.request("GET", "/health", headers={"Origin": ORIGEM})
        resposta = pedido.getresponse()
        return resposta.status, json.loads(resposta.read())
    finally:
        pedido.close()


def _post(porta, caminho, corpo):
    pedido = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    try:
        pedido.request("POST", caminho, body=json.dumps(corpo), headers={"Origin": ORIGEM, "Content-Type": "application/json"})
        resposta = pedido.getresponse()
        return resposta.status, json.loads(resposta.read())
    finally:
        pedido.close()


def pedir_a_chave(porta, chave):
    return _post(porta, "/ia/openai/chave", {"chave": chave})


def estado_da_ia(porta):
    return _post(porta, "/ia/estado", {})[1]


def parar(conexao):
    if conexao is not None:
        conexao.parar()


class AoCarregarNoAnki(unittest.TestCase):
    def test_a_conexao_sobe_e_responde_a_saude_com_o_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta:
            conexao = inicio.iniciar(pasta, lambda: "Usuário 1", porta=0)
            try:
                status, corpo = saude(conexao.porta)
            finally:
                parar(conexao)
        self.assertEqual(status, 200)
        self.assertEqual(corpo, {"ok": True, "versao": configuracao.VERSAO, "perfil": "Usuário 1"})

    def test_user_files_ganha_as_pastas_da_fila_do_estado_dos_custos_dos_logs_e_das_chaves(self):
        with tempfile.TemporaryDirectory() as pasta:
            parar(inicio.iniciar(pasta, lambda: None, porta=0))
            criadas = sorted(os.listdir(os.path.join(pasta, "user_files")))
        self.assertEqual(criadas, ["chaves", "custos", "estado", "fila", "logs"])

    @unittest.skipIf(os.name == "nt", "as permissões do Windows não são as do Unix")
    def test_a_pasta_das_chaves_nasce_so_do_dono_mesmo_com_umask_aberta(self):
        antes = os.umask(0o000)
        try:
            with tempfile.TemporaryDirectory() as pasta:
                parar(inicio.iniciar(pasta, lambda: None, porta=0))
                modo = os.stat(os.path.join(pasta, "user_files", "chaves")).st_mode & 0o777
        finally:
            os.umask(antes)
        self.assertEqual(modo, 0o700)

    @unittest.skipIf(os.name == "nt", "as permissões do Windows não são as do Unix")
    def test_uma_pasta_das_chaves_que_ja_existia_aberta_passa_a_ser_so_do_dono(self):
        with tempfile.TemporaryDirectory() as pasta:
            antiga = os.path.join(pasta, "user_files", "chaves")
            os.makedirs(antiga)
            os.chmod(antiga, 0o755)
            parar(inicio.iniciar(pasta, lambda: None, porta=0))
            modo = os.stat(antiga).st_mode & 0o777
        self.assertEqual(modo, 0o700)

    def test_a_chave_que_a_extensao_manda_fica_em_user_files_chaves_e_a_conexao_a_reconhece_ao_reiniciar(self):
        chave = "sk-proj-DeTesteDoInicio0123456789-f00d"
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira("aceita") as openai:
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, openai_base=openai.base)
            try:
                enviada = pedir_a_chave(conexao.porta, chave)
            finally:
                parar(conexao)
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, openai_base=openai.base)
            try:
                estado = estado_da_ia(conexao.porta)
            finally:
                parar(conexao)
            guardada = os.path.exists(os.path.join(pasta, "user_files", "chaves", "openai.json"))
        self.assertEqual(enviada, (200, {"ok": True, "ultimos4": "f00d"}))
        self.assertEqual(estado, {"openai": {"configurada": True, "ultimos4": "f00d"}})
        self.assertTrue(guardada)

    def test_o_que_ja_estava_em_user_files_fica_como_estava(self):
        with tempfile.TemporaryDirectory() as pasta:
            fila = os.path.join(pasta, "user_files", "fila")
            os.makedirs(fila)
            with open(os.path.join(fila, "envio.json"), "w", encoding="utf-8") as arquivo:
                arquivo.write('{"jobId": "job-1"}')
            parar(inicio.iniciar(pasta, lambda: None, porta=0))
            with open(os.path.join(fila, "envio.json"), encoding="utf-8") as arquivo:
                guardado = arquivo.read()
        self.assertEqual(guardado, '{"jobId": "job-1"}')

    def test_a_conexao_que_sobe_escreve_o_item_de_login_no_lugar_que_o_inicio_deu_a_ela(self):
        with tempfile.TemporaryDirectory() as pasta:
            agentes = os.path.join(pasta, "agentes")
            item = item_de_login.ItemDeLogin(sistema="mac", pasta=agentes, comando=["/usr/bin/open", "-a", "Anki"])
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, item_de_login=item)
            try:
                pedido = http.client.HTTPConnection("127.0.0.1", conexao.porta, timeout=5)
                pedido.request("POST", "/abrir-com-o-computador", body='{"ligado": true}', headers={"Origin": ORIGEM})
                status = pedido.getresponse().status
                pedido.close()
            finally:
                parar(conexao)
            escritos = os.listdir(agentes)
        self.assertEqual((status, escritos), (200, ["com.perpetualminer.abrir-o-anki.plist"]))

    def test_com_a_porta_ocupada_o_complemento_fica_quieto_e_registra_o_motivo(self):
        ocupante = socket.socket()
        ocupante.bind(("127.0.0.1", 0))
        ocupante.listen(1)
        porta = ocupante.getsockname()[1]
        saida, erro = io.StringIO(), io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as pasta:
                with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
                    conexao = inicio.iniciar(pasta, lambda: None, porta=porta)
                with open(os.path.join(pasta, "user_files", "logs", "complemento.log"), encoding="utf-8") as arquivo:
                    registrado = arquivo.read()
        finally:
            ocupante.close()
        self.assertIsNone(conexao)
        self.assertIn("A porta %d está ocupada" % porta, registrado)
        self.assertEqual((saida.getvalue(), erro.getvalue()), ("", ""))

    def test_com_o_arquivo_de_log_indisponivel_a_conexao_sobe_e_nada_vai_ao_stderr(self):
        with tempfile.TemporaryDirectory() as pasta:
            os.makedirs(os.path.join(pasta, "user_files", "logs", "complemento.log"))  # uma pasta no lugar do arquivo
            erro = io.StringIO()
            with contextlib.redirect_stderr(erro):
                conexao = inicio.iniciar(pasta, lambda: "Usuário 1", porta=0)
                try:
                    status, corpo = saude(conexao.porta)
                    conexao.logger.error("um erro que não tem para onde ir")
                finally:
                    parar(conexao)
        self.assertEqual((status, corpo["perfil"]), (200, "Usuário 1"))
        self.assertEqual(erro.getvalue(), "")

    def test_falha_ao_preparar_a_pasta_de_dados_nao_levanta_erro(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo_no_lugar_da_pasta = os.path.join(pasta, "user_files")
            with open(arquivo_no_lugar_da_pasta, "w", encoding="utf-8") as arquivo:
                arquivo.write("não sou uma pasta")
            erro = io.StringIO()
            with contextlib.redirect_stderr(erro):
                conexao = inicio.iniciar(pasta, lambda: None, porta=0)
        self.assertIsNone(conexao)
        self.assertEqual(erro.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
