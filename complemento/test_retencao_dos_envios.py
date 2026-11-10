"""A retenção dos Envios terminados (#243), com pastas reais de Envios feitos pela Conexão: passado o prazo somem a fila e o estado do Envio,
os custos ficam (e a aba Custos e o teto do mês somam igual), e nada em andamento, pausado ou duvidoso é tocado.

    python3.9 complemento/test_retencao_dos_envios.py
"""

import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import retencao_dos_envios, trabalhador  # noqa: E402
from complemento.gravacao_de_json import gravar_json  # noqa: E402
from complemento.test_envio import ID, LINHA, OUTRO_ID, PALAVRA, EnvioNoTeste, arquivos_sem_o_log, pedido  # noqa: E402

PRAZO = timedelta(days=retencao_dos_envios.PRAZO_EM_DIAS)


def arquivo_do_estado(conexao, job_id):
    return os.path.join(conexao.pasta, "estado", job_id + ".json")


def ler_estado(conexao, job_id):
    with open(arquivo_do_estado(conexao, job_id), encoding="utf-8") as arquivo:
        return json.load(arquivo)


def mudar_estado(conexao, job_id, **campos):
    estado = ler_estado(conexao, job_id)
    estado.update(campos)
    gravar_json(arquivo_do_estado(conexao, job_id), estado)  # inteiro de uma vez: a thread de trabalho lê o estado enquanto o teste o muda


def terminado(conexao, job_id, linha=LINHA):
    conexao.criar(pedido(job_id, linha))
    return conexao.esperar(job_id)["updatedAt"]


def envelhecer(conexao, job_id, dias):
    """Recua a última atividade do Envio; devolve o instante dela."""
    quando = (datetime.now().astimezone() - timedelta(days=dias)).isoformat(timespec="seconds")
    mudar_estado(conexao, job_id, updatedAt=quando)
    return datetime.fromisoformat(quando)


def linhas_dos_custos(conexao):
    return json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]


class UmEnvioTerminadoEVelho(unittest.TestCase):
    def test_o_pedido_o_estado_e_a_entrada_na_fila_somem_e_os_custos_ficam_como_eram(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 31)
            antes, linhas_antes, gasto_antes = arquivos_sem_o_log(conexao), linhas_dos_custos(conexao), conexao.conexao.teto.gasto()
            apagados = retencao_dos_envios.reter(conexao.conexao.fila)
            depois, linhas_depois, gasto_depois = arquivos_sem_o_log(conexao), linhas_dos_custos(conexao), conexao.conexao.teto.gasto()
            na_fila = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
        self.assertEqual(apagados, [ID])
        self.assertEqual(sorted(nome for nome in antes if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID))),
                         [os.path.join("estado", ID + ".json"), os.path.join("fila", ID + ".json")])
        self.assertEqual([nome for nome in depois if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID))], [])
        self.assertEqual(json.loads(depois[os.path.join("fila", "fila.json")]), {"jobs": []})
        self.assertEqual(na_fila, [])
        self.assertEqual(
            {nome: dados for nome, dados in depois.items() if nome.startswith("custos" + os.sep) and not nome.endswith("ficha.json")},
            {nome: dados for nome, dados in antes.items() if nome.startswith("custos" + os.sep)})
        self.assertTrue(linhas_antes[0]["costs"]["totalUsd"] > 0)
        self.assertEqual(linhas_depois, linhas_antes)
        self.assertEqual(gasto_depois, gasto_antes)

    def test_a_ficha_que_fica_nos_custos_nao_tem_a_palavra_nem_a_frase(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 31)
            retencao_dos_envios.reter(conexao.conexao.fila)
            todos = b"".join(arquivos_sem_o_log(conexao).values()).decode("utf-8", "replace")
            ficha = arquivos_sem_o_log(conexao)[os.path.join("custos", ID, "ficha.json")].decode("utf-8")
        self.assertIn('"requestedCards": 1', ficha)
        for trecho in (PALAVRA, "zorblax", "bubbled all night"):
            self.assertNotIn(trecho, todos)

    def test_o_prazo_e_de_trinta_dias_exatos_29_dias_e_23_horas_ainda_nao_apaga(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            ultima = envelhecer(conexao, ID, 5)
            fila = conexao.conexao.fila
            quase = retencao_dos_envios.reter(fila, ultima + PRAZO - timedelta(hours=1))
            ainda_la = os.path.exists(os.path.join(pasta, "fila", ID + ".json"))
            no_dia = retencao_dos_envios.reter(fila, ultima + PRAZO)
        self.assertEqual((quase, ainda_la, no_dia), ([], True, [ID]))
        self.assertEqual(retencao_dos_envios.PRAZO_EM_DIAS, 30)

    def test_duas_rodadas_seguidas_dao_o_mesmo_disco_da_primeira(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            fila = conexao.conexao.fila
            primeira = retencao_dos_envios.reter(fila)
            depois_da_primeira = arquivos_sem_o_log(conexao)
            segunda = retencao_dos_envios.reter(fila)
            depois_da_segunda = arquivos_sem_o_log(conexao)
        self.assertEqual((primeira, segunda), ([ID], []))
        self.assertEqual(depois_da_segunda, depois_da_primeira)

    def test_o_envio_que_a_retencao_apagou_volta_a_ser_criado_se_o_mesmo_pedido_chega(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            retencao_dos_envios.reter(conexao.conexao.fila)
            status, resposta = conexao.criar(pedido(ID, LINHA))
            conexao.esperar(ID)
            linhas = linhas_dos_custos(conexao)
        self.assertEqual((status, resposta["jobId"]), (201, ID))
        self.assertEqual([linha["jobId"] for linha in linhas], [ID])


class OQueNaoSai(unittest.TestCase):
    def test_o_envio_em_andamento_na_fila_pausado_ou_esperando_o_anki_nao_e_tocado_por_velho_que_seja(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            ids = [ID, OUTRO_ID, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee"]
            for job_id in ids:
                conexao.criar(pedido(job_id, LINHA))
                envelhecer(conexao, job_id, 400)
            mudar_estado(conexao, ids[1], status="running", stage="generate_cards")
            mudar_estado(conexao, ids[2], status="running", stage="wait_anki", waiting="profile")
            mudar_estado(conexao, ids[3], status="completed", stage="completed", waiting="plan")
            antes = arquivos_sem_o_log(conexao)
            apagados = retencao_dos_envios.reter(conexao.conexao.fila)
            depois = arquivos_sem_o_log(conexao)
        self.assertEqual(apagados, [])
        self.assertEqual(depois, antes)

    def test_o_envio_de_estado_duvidoso_fica(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            ids = {nome: id_ for nome, id_ in zip(("ilegivel", "sem_data", "futuro", "texto_pago", "sem_estado"), (
                "11111111-0000-4000-8000-000000000001", "11111111-0000-4000-8000-000000000002", "11111111-0000-4000-8000-000000000003",
                "11111111-0000-4000-8000-000000000004", "11111111-0000-4000-8000-000000000005"))}
            for job_id in ids.values():
                terminado(conexao, job_id)
                envelhecer(conexao, job_id, 90)
            conexao.conexao.parar()
            with open(arquivo_do_estado(conexao, ids["ilegivel"]), "w", encoding="utf-8") as arquivo:
                arquivo.write("{ isto não é json")
            mudar_estado(conexao, ids["sem_data"], updatedAt="ontem à tarde")
            mudar_estado(conexao, ids["futuro"], updatedAt=(datetime.now().astimezone() + timedelta(days=90)).isoformat())
            os.makedirs(os.path.join(pasta, "estado", ids["texto_pago"]), exist_ok=True)
            with open(os.path.join(pasta, "estado", ids["texto_pago"], "1-0.txt"), "w", encoding="utf-8") as arquivo:
                arquivo.write("texto já pago")
            os.remove(arquivo_do_estado(conexao, ids["sem_estado"]))
            antes = arquivos_sem_o_log(conexao)
            apagados = retencao_dos_envios.reter(conexao.conexao.fila)
            depois = arquivos_sem_o_log(conexao)
        self.assertEqual(apagados, [])
        self.assertEqual(depois, antes)

    def test_so_o_velho_sai_quando_ha_um_novo_do_lado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            terminado(conexao, OUTRO_ID)
            envelhecer(conexao, ID, 31)
            envelhecer(conexao, OUTRO_ID, 29)
            apagados = retencao_dos_envios.reter(conexao.conexao.fila)
            fila = arquivos_sem_o_log(conexao)[os.path.join("fila", "fila.json")]
        self.assertEqual(apagados, [ID])
        self.assertEqual([item["jobId"] for item in json.loads(fila)["jobs"]], [OUTRO_ID])


class UmErroDeDisco(unittest.TestCase):
    def test_o_erro_num_envio_nao_derruba_a_rodada_nem_os_outros_e_a_proxima_rodada_termina(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            terminado(conexao, OUTRO_ID)
            envelhecer(conexao, ID, 40)
            envelhecer(conexao, OUTRO_ID, 40)
            fila = conexao.conexao.fila
            fila.logger = mock.Mock()
            apagar = retencao_dos_envios.apagar

            def disco_cheio_no_pedido_do_primeiro(caminho):
                if caminho == fila._arquivo_do_pedido(ID):
                    raise PermissionError(13, "sem permissão", caminho)
                return apagar(caminho)

            with mock.patch.object(retencao_dos_envios, "apagar", disco_cheio_no_pedido_do_primeiro):
                primeira = retencao_dos_envios.reter(fila)
            estado_do_primeiro = ler_estado(conexao, ID)["status"]
            estado_do_outro = os.path.exists(arquivo_do_estado(conexao, OUTRO_ID))
            registro = " ".join(str(chamada) for chamada in fila.logger.method_calls)
            segunda = retencao_dos_envios.reter(fila)
            sobrou = [nome for nome in arquivos_sem_o_log(conexao) if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID))]
            linhas = linhas_dos_custos(conexao)
        self.assertEqual((primeira, estado_do_primeiro, estado_do_outro), ([OUTRO_ID], "completed", False))
        self.assertIn(ID, registro)
        self.assertIn("PermissionError", registro)
        for trecho in (PALAVRA, "zorblax", "bubbled"):
            self.assertNotIn(trecho, registro)
        self.assertEqual((segunda, sobrou), ([ID], []))
        self.assertEqual(sorted(linha["jobId"] for linha in linhas), sorted([ID, OUTRO_ID]))

    def test_o_estado_que_ficou_para_tras_porque_o_apagar_falhou_sai_na_proxima_rodada(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            fila = conexao.conexao.fila
            fila.logger = mock.Mock()
            apagar = retencao_dos_envios.apagar

            def antivirus_trava_o_estado(caminho):
                if caminho == fila._arquivo_do_estado(ID):
                    raise PermissionError(13, "arquivo em uso", caminho)
                return apagar(caminho)

            with mock.patch.object(retencao_dos_envios, "apagar", antivirus_trava_o_estado):
                primeira = retencao_dos_envios.reter(fila)
            sobrou = sorted(nome for nome in arquivos_sem_o_log(conexao) if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID)))
            segunda = retencao_dos_envios.reter(fila)
            depois = sorted(nome for nome in arquivos_sem_o_log(conexao) if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID)))
            linhas = linhas_dos_custos(conexao)
        self.assertEqual((primeira, sobrou), ([], [os.path.join("estado", ID + ".json")]))
        self.assertEqual((segunda, depois), ([ID], []))
        self.assertEqual([linha["jobId"] for linha in linhas], [ID])

    def test_uma_pasta_dentro_da_pasta_do_estado_nao_derruba_a_rodada_nem_os_outros(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            terminado(conexao, OUTRO_ID)
            envelhecer(conexao, ID, 40)
            envelhecer(conexao, OUTRO_ID, 40)
            fila = conexao.conexao.fila
            fila.logger = mock.Mock()
            os.makedirs(os.path.join(fila.pasta_dos_textos(ID), "sub"))
            primeira = retencao_dos_envios.reter(fila)
            registro = " ".join(str(chamada) for chamada in fila.logger.method_calls)
            estado_ficou = os.path.exists(arquivo_do_estado(conexao, ID))
        self.assertEqual(primeira, [OUTRO_ID])
        self.assertIn(ID, registro)  # o tipo do erro muda de sistema para sistema (IsADirectoryError no Linux, PermissionError no Mac e no Windows)
        self.assertIn("warning", registro)
        self.assertTrue(estado_ficou)

    def test_a_ficha_que_nao_grava_deixa_o_envio_inteiro_no_lugar(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            antes = arquivos_sem_o_log(conexao)
            with mock.patch.object(retencao_dos_envios, "gravar_json", side_effect=OSError(28, "disco cheio")):
                apagados = retencao_dos_envios.reter(conexao.conexao.fila)
            depois = arquivos_sem_o_log(conexao)
        self.assertEqual(apagados, [])
        self.assertEqual(depois, antes)


class UmLinkNoLugarDaPasta(unittest.TestCase):
    def test_o_link_para_uma_pasta_de_fora_sai_sozinho_e_o_que_ele_aponta_fica(self):
        with tempfile.TemporaryDirectory() as pasta, tempfile.TemporaryDirectory() as fora, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            fila = conexao.conexao.fila
            for nome in ("1-0.txt", "outro.json", "qualquer"):
                with open(os.path.join(fora, nome), "w", encoding="utf-8") as arquivo:
                    arquivo.write("do usuário, fora da Conexão")
            os.rmdir(fila.pasta_dos_textos(ID))  # a pasta vazia que o Envio deixa
            try:
                os.symlink(fora, fila.pasta_dos_textos(ID), target_is_directory=True)
            except (OSError, NotImplementedError, AttributeError):
                self.skipTest("este sistema não cria link simbólico")
            apagados = retencao_dos_envios.reter(fila)
            sobrou = sorted(os.listdir(fora))
            depois = [nome for nome in arquivos_sem_o_log(conexao) if nome.startswith(("fila" + os.sep + ID, "estado" + os.sep + ID))]
            linhas = linhas_dos_custos(conexao)
        self.assertEqual(apagados, [ID])
        self.assertEqual(sobrou, ["1-0.txt", "outro.json", "qualquer"])
        self.assertEqual(depois, [])
        self.assertFalse(os.path.lexists(fila.pasta_dos_textos(ID)))
        self.assertEqual([linha["jobId"] for linha in linhas], [ID])

    def test_a_juncao_que_o_islink_nao_ve_tambem_sai_sozinha(self):
        with tempfile.TemporaryDirectory() as pasta, tempfile.TemporaryDirectory() as fora, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            fila = conexao.conexao.fila
            with open(os.path.join(fora, "marca.txt"), "w", encoding="utf-8") as arquivo:
                arquivo.write("do usuário, fora da Conexão")
            os.rmdir(fila.pasta_dos_textos(ID))
            try:
                os.symlink(fora, fila.pasta_dos_textos(ID), target_is_directory=True)
            except (OSError, NotImplementedError, AttributeError):
                self.skipTest("este sistema não cria link simbólico")
            with mock.patch("os.path.islink", return_value=False):  # como no Windows com uma junção, no Python 3.9 e 3.13
                apagados = retencao_dos_envios.reter(fila)
            sobrou = sorted(os.listdir(fora))
        self.assertEqual(apagados, [ID])
        self.assertEqual(sobrou, ["marca.txt"])
        self.assertFalse(os.path.lexists(fila.pasta_dos_textos(ID)))

    def test_o_link_para_uma_pasta_com_texto_pago_nao_e_lido_e_o_envio_sai(self):
        with tempfile.TemporaryDirectory() as pasta, tempfile.TemporaryDirectory() as fora, EnvioNoTeste(pasta) as conexao:
            terminado(conexao, ID)
            envelhecer(conexao, ID, 40)
            fila = conexao.conexao.fila
            with open(os.path.join(fora, "1-0.txt"), "w", encoding="utf-8") as arquivo:
                arquivo.write("texto de outra pasta")
            os.rmdir(fila.pasta_dos_textos(ID))
            try:
                os.symlink(fora, fila.pasta_dos_textos(ID), target_is_directory=True)
            except (OSError, NotImplementedError, AttributeError):
                self.skipTest("este sistema não cria link simbólico")
            apagados = retencao_dos_envios.reter(fila)
            sobrou = os.listdir(fora)
        self.assertEqual((apagados, sobrou), ([ID], ["1-0.txt"]))


class QuandoARetencaoRoda(unittest.TestCase):
    def test_ao_subir_a_conexao_apaga_o_envio_velho_sem_esperar_a_extensao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta) as conexao:
                terminado(conexao, ID)
                envelhecer(conexao, ID, 45)
            with EnvioNoTeste(pasta, espera_do_contato=60.0) as conexao:
                fim = time.monotonic() + 15
                while os.path.exists(arquivo_do_estado(conexao, ID)) and time.monotonic() < fim:
                    time.sleep(0.02)
                nomes = list(arquivos_sem_o_log(conexao))
        self.assertEqual(sorted(nome for nome in nomes if ID in nome), [os.path.join("custos", ID, "costs.jsonl"), os.path.join("custos", ID, "ficha.json")])

    def test_depois_de_subir_a_rodada_volta_a_cada_seis_horas_na_mesma_thread_do_envio(self):
        trabalho = mock.Mock()
        relogio = mock.Mock(side_effect=[100.0, 100.0 + 3600, 100.0 + 6 * 3600 - 1, 100.0 + 6 * 3600])
        work = trabalhador.Trabalhador(trabalho)
        self.assertEqual(trabalhador.RETENCAO_A_CADA_S, 6 * 60 * 60)
        with mock.patch.object(trabalhador.retencao_dos_envios, "reter") as reter, mock.patch.object(trabalhador.time, "monotonic", relogio):
            for _ in range(2):
                work._reter_se_for_a_hora()  # sobe (100) e uma hora depois: só a primeira roda
            work._reter_se_for_a_hora()  # 5 h 59 min depois do começo: ainda não
            work._reter_se_for_a_hora()  # 6 h depois: roda
        self.assertEqual(reter.call_count, 2)


if __name__ == "__main__":
    unittest.main()
