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
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor, configuracao, inicio, item_de_login  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_abridor import Pastas, RegistroDeMentira, abridor_do_mac, conversar  # noqa: E402
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
    def setUp(self):
        remendo = patch("complemento.inicio.abridores.deste_computador", side_effect=AssertionError("registro real proibido no teste"))
        self.fabrica_real = remendo.start()
        self.addCleanup(remendo.stop)
        self.addCleanup(self.fabrica_real.assert_not_called)

    def test_desativar_o_abridor_nao_descobre_nem_registra_host_no_mac_ou_no_windows(self):
        for plataforma in ("darwin", "win32"):
            with self.subTest(plataforma=plataforma), tempfile.TemporaryDirectory() as pasta:
                with patch.object(inicio.sys, "platform", plataforma):
                    conexao = inicio.iniciar(pasta, lambda: None, porta=0, abridor=None)
                    try:
                        self.assertIsNotNone(conexao)
                        self.assertEqual(saude(conexao.porta)[0], 200)
                        self.assertFalse(os.path.exists(os.path.join(pasta, "user_files", "abridor")))
                    finally:
                        parar(conexao)

    def test_a_conexao_sobe_e_responde_a_saude_com_o_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta:
            conexao = inicio.iniciar(pasta, lambda: "Usuário 1", porta=0, abridor=None)
            try:
                status, corpo = saude(conexao.porta)
            finally:
                parar(conexao)
        self.assertEqual(status, 200)
        self.assertEqual(corpo, {"ok": True, "versao": configuracao.VERSAO, "perfil": "Usuário 1"})

    def test_user_files_ganha_as_pastas_da_fila_do_estado_dos_custos_dos_logs_e_das_chaves(self):
        with tempfile.TemporaryDirectory() as pasta:
            parar(inicio.iniciar(pasta, lambda: None, porta=0, abridor=None))
            criadas = sorted(os.listdir(os.path.join(pasta, "user_files")))
        self.assertEqual(criadas, ["chaves", "custos", "estado", "fila", "logs"])

    @unittest.skipIf(os.name == "nt", "as permissões do Windows não são as do Unix")
    def test_a_pasta_das_chaves_nasce_so_do_dono_mesmo_com_umask_aberta(self):
        antes = os.umask(0o000)
        try:
            with tempfile.TemporaryDirectory() as pasta:
                parar(inicio.iniciar(pasta, lambda: None, porta=0, abridor=None))
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
            parar(inicio.iniciar(pasta, lambda: None, porta=0, abridor=None))
            modo = os.stat(antiga).st_mode & 0o777
        self.assertEqual(modo, 0o700)

    def test_a_chave_que_a_extensao_manda_fica_em_user_files_chaves_e_a_conexao_a_reconhece_ao_reiniciar(self):
        chave = "sk-proj-DeTesteDoInicio0123456789-f00d"
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira("aceita") as openai:
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, openai_base=openai.base, abridor=None)
            try:
                enviada = pedir_a_chave(conexao.porta, chave)
            finally:
                parar(conexao)
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, openai_base=openai.base, abridor=None)
            try:
                estado = estado_da_ia(conexao.porta)
            finally:
                parar(conexao)
            guardada = os.path.exists(os.path.join(pasta, "user_files", "chaves", "openai.json"))
        self.assertEqual(enviada, (200, {"ok": True, "ultimos4": "f00d"}))
        self.assertEqual(estado, {"openai": {"configurada": True, "ultimos4": "f00d", "conta": "", "versao": 1, "naoEnviada": True}})
        self.assertTrue(guardada)

    def test_o_que_ja_estava_em_user_files_fica_como_estava(self):
        with tempfile.TemporaryDirectory() as pasta:
            fila = os.path.join(pasta, "user_files", "fila")
            os.makedirs(fila)
            with open(os.path.join(fila, "envio.json"), "w", encoding="utf-8") as arquivo:
                arquivo.write('{"jobId": "job-1"}')
            parar(inicio.iniciar(pasta, lambda: None, porta=0, abridor=None))
            with open(os.path.join(fila, "envio.json"), encoding="utf-8") as arquivo:
                guardado = arquivo.read()
        self.assertEqual(guardado, '{"jobId": "job-1"}')

    def test_a_conexao_que_sobe_escreve_o_item_de_login_no_lugar_que_o_inicio_deu_a_ela(self):
        with tempfile.TemporaryDirectory() as pasta:
            agentes = os.path.join(pasta, "agentes")
            item = item_de_login.ItemDeLogin(sistema="mac", pasta=agentes, comando=["/usr/bin/open", "-a", "Anki"])
            conexao = inicio.iniciar(pasta, lambda: None, porta=0, item_de_login=item, abridor=None)
            try:
                pedido = http.client.HTTPConnection("127.0.0.1", conexao.porta, timeout=5)
                pedido.request("POST", "/abrir-com-o-computador", body='{"ligado": true}', headers={"Origin": ORIGEM})
                status = pedido.getresponse().status
                pedido.close()
            finally:
                parar(conexao)
            escritos = os.listdir(agentes)
        self.assertEqual((status, escritos), (200, ["com.perpetualminer.abrir-o-anki.plist"]))

    @unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
    def test_ao_carregar_escreve_o_abridor_e_o_registra_para_o_chrome(self):
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            conexao = inicio.iniciar(os.path.join(raiz, "complemento"), lambda: None, porta=0, abridor=abridor_do_mac(pastas))
            parar(conexao)
            registrados = os.listdir(pastas.hosts_do_chrome)
            resposta = conversar(os.path.join(pastas.abridor, "abrir-o-anki.sh"), {"acao": "conferir"})
        self.assertEqual((registrados, resposta), (["com.perpetualminer.abridor.json"], {"achou": True}))

    @unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
    def test_quando_um_perfil_abre_o_abridor_passa_a_abrir_o_anki_nesse_perfil(self):
        ganchos = []
        perfil = {"aberto": None}
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            conexao = inicio.iniciar(
                os.path.join(raiz, "complemento"), lambda: perfil["aberto"], porta=0,
                abridor=abridor_do_mac(pastas), ao_abrir_o_perfil=ganchos.append,
            )
            parar(conexao)
            perfil["aberto"] = "Maria"
            for gancho in ganchos:
                gancho()
            conversar(os.path.join(pastas.abridor, "abrir-o-anki.sh"), {"acao": "abrir"})
            recebeu = pastas.open.recebeu()
        self.assertEqual(recebeu, ["-a", pastas.app, "--args", "-p", "Maria"])

    @unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
    def test_o_abridor_abre_o_anki_no_perfil_marcado_mesmo_depois_de_outro_perfil_abrir(self):
        ganchos = []
        perfil = {"aberto": None}
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            conexao = inicio.iniciar(
                os.path.join(raiz, "complemento"), lambda: perfil["aberto"], porta=0,
                abridor=abridor_do_mac(pastas), ao_abrir_o_perfil=ganchos.append,
            )
            parar(conexao)
            for aberto in ("Maria", "Joana"):  # a Maria estava aberta na primeira conexão; depois a Joana abre
                perfil["aberto"] = aberto
                for gancho in ganchos:
                    gancho()
            conversar(os.path.join(pastas.abridor, "abrir-o-anki.sh"), {"acao": "abrir"})
            recebeu = pastas.open.recebeu()
        self.assertEqual(recebeu, ["-a", pastas.app, "--args", "-p", "Maria"])

    @unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
    def test_escolher_outro_perfil_marcado_faz_o_abridor_abrir_o_anki_nele(self):
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            colecao = ColecaoEmMemoria(perfis=("Maria", "Joana"))
            conexao = inicio.iniciar(
                os.path.join(raiz, "complemento"), lambda: "Maria", porta=0, colecao=colecao, abridor=abridor_do_mac(pastas),
            )
            try:
                escolha = _post(conexao.porta, "/anki/profile", {"profile": "Joana"})
            finally:
                parar(conexao)
            conversar(os.path.join(pastas.abridor, "abrir-o-anki.sh"), {"acao": "abrir"})
            recebeu = pastas.open.recebeu()
        self.assertEqual(escolha, (200, {"ok": True, "marked": "Joana"}))
        self.assertEqual(recebeu, ["-a", pastas.app, "--args", "-p", "Joana"])

    @unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
    def test_o_perfil_marcado_que_o_anki_ja_nao_tem_deixa_o_abridor_sem_perfil_para_o_anki_abrir_na_tela_de_perfis(self):
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            os.makedirs(os.path.join(raiz, "complemento", "user_files"))
            with open(os.path.join(raiz, "complemento", "user_files", "perfil.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"perfil": "Ana"}, arquivo)  # marcado antes; a Ana foi apagada ou renomeada no Anki
            colecao = ColecaoEmMemoria(perfis=("Beto", "Carla"), perfil_aberto="Beto")
            conexao = inicio.iniciar(
                os.path.join(raiz, "complemento"), lambda: "Beto", porta=0, colecao=colecao, abridor=abridor_do_mac(pastas),
            )
            parar(conexao)
            conversar(os.path.join(pastas.abridor, "abrir-o-anki.sh"), {"acao": "abrir"})
            recebeu = pastas.open.recebeu()
        self.assertEqual(recebeu, ["-a", pastas.app])

    def test_sem_saber_onde_o_anki_esta_a_conexao_sobe_assim_mesmo_e_o_log_diz_por_que_nao_ha_abridor(self):
        with tempfile.TemporaryDirectory() as raiz:
            pastas = Pastas(raiz)
            pasta = os.path.join(raiz, "complemento")
            erro = io.StringIO()
            with contextlib.redirect_stderr(erro):
                conexao = inicio.iniciar(pasta, lambda: None, porta=0, abridor=abridor_do_mac(pastas, programa=""))
                try:
                    status, _ = saude(conexao.porta)
                finally:
                    parar(conexao)
            with open(os.path.join(pasta, "user_files", "logs", "complemento.log"), encoding="utf-8") as arquivo:
                registrado = arquivo.read()
            registrou = os.path.exists(pastas.hosts_do_chrome)
        self.assertEqual((status, registrou, erro.getvalue()), (200, False, ""))
        self.assertIn("O abridor não foi escrito", registrado)

    def test_um_gancho_de_perfil_que_falha_ao_registrar_nao_derruba_a_conexao(self):
        def gancho_quebrado(_):
            raise ImportError("sem aqt")

        with tempfile.TemporaryDirectory() as raiz:
            conexao = inicio.iniciar(
                os.path.join(raiz, "complemento"), lambda: None, porta=0,
                abridor=abridor_do_mac(Pastas(raiz)), ao_abrir_o_perfil=gancho_quebrado,
            )
            try:
                status, _ = saude(conexao.porta)
            finally:
                parar(conexao)
        self.assertEqual(status, 200)

    def test_com_a_porta_ocupada_o_complemento_fica_quieto_e_registra_o_motivo(self):
        ocupante = socket.socket()
        ocupante.bind(("127.0.0.1", 0))
        ocupante.listen(1)
        porta = ocupante.getsockname()[1]
        saida, erro = io.StringIO(), io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as pasta:
                with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
                    conexao = inicio.iniciar(pasta, lambda: None, porta=porta, abridor=None)
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
                conexao = inicio.iniciar(pasta, lambda: "Usuário 1", porta=0, abridor=None)
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
                conexao = inicio.iniciar(pasta, lambda: None, porta=0, abridor=None)
        self.assertIsNone(conexao)
        self.assertEqual(erro.getvalue(), "")


class InicioDeProducaoIsolado(unittest.TestCase):
    def test_abridor_omitido_usa_a_fabrica_mas_o_ensaio_so_registra_em_destinos_temporarios(self):
        for sistema in ("mac", "windows"):
            with self.subTest(sistema=sistema), tempfile.TemporaryDirectory() as raiz:
                pastas = Pastas(raiz)
                registro = RegistroDeMentira()
                injetado = abridor_do_mac(pastas) if sistema == "mac" else abridor.Abridor(
                    sistema="windows", pasta=pastas.abridor, programa=os.path.join(raiz, "anki.exe"),
                    onde_registrar={"Chrome": "HKCU-de-mentira"}, registro=registro,
                )
                with patch("complemento.inicio.abridores.deste_computador", return_value=injetado) as fabrica:
                    conexao = inicio.iniciar(os.path.join(raiz, "complemento"), lambda: None, porta=0)
                    try:
                        self.assertIsNotNone(conexao)
                        fabrica.assert_called_once()
                        self.assertTrue(fabrica.call_args.kwargs["pasta"].startswith(raiz + os.sep))
                        manifesto = (os.path.join(pastas.hosts_do_chrome, abridor.NOME_DO_HOST + ".json")
                                     if sistema == "mac" else next(iter(registro.valores.values())))
                        self.assertTrue(manifesto.startswith(raiz + os.sep))
                        with open(manifesto, encoding="utf-8") as arquivo:
                            self.assertTrue(json.load(arquivo)["path"].startswith(raiz + os.sep))
                    finally:
                        parar(conexao)


class OAbridorDesteComputador(unittest.TestCase):
    def test_o_abridor_anota_o_programa_que_roda_o_anki_e_a_pasta_do_complemento(self):
        with tempfile.TemporaryDirectory() as pasta, patch("complemento.inicio.abridores.deste_computador", return_value=None) as deste:
            parar(inicio.iniciar(pasta, lambda: None, porta=0, item_de_login=item_de_login.ItemDeLogin(sistema="mac", pasta=pasta, comando=None)))
        self.assertEqual((deste.call_args.kwargs["executavel"], deste.call_args.kwargs["complemento"]), (sys.executable, pasta))


if __name__ == "__main__":
    unittest.main()
