"""O Windows da passagem (#178): as entradas de início automático e o processo da Conexão de hoje. Nada aqui toca o sistema de quem roda o teste:
os comandos do Windows (`schtasks`, `reg`, `taskkill`) entram por um executor de mentira que guarda o que foi pedido, e a pasta Inicializar é
uma pasta temporária.

    python3.9 complemento/test_passagem_do_windows.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.passagem_do_windows import PassagemFalhou, SistemaDoWindows  # noqa: E402


class WindowsDeMentira:
    """`existe`: o que o Windows tem de tarefas e valores de Run. `recusa`: um comando que ele recusa (código 5, acesso negado)."""

    def __init__(self, existe=("tarefa", "vigia", "run"), recusa=None):
        self.existe, self.recusa, self.pedidos = set(existe), recusa, []

    def __call__(self, argumentos):
        self.pedidos.append(list(argumentos))
        programa, acao = argumentos[0], argumentos[1].lower()
        alvo = "vigia" if "PerpetualMinerAnkiBridgeWatchdog" in argumentos else "run" if programa == "reg" else "tarefa"
        if programa == "taskkill":
            return 5 if self.recusa == "taskkill" else 0
        if acao == "/query" or acao == "query":
            return 0 if alvo in self.existe else 1
        if self.recusa == alvo:
            return 5
        self.existe.discard(alvo)
        return 0


def pasta_inicializar(appdata):
    pasta = os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
    os.makedirs(pasta)
    return pasta


class ApagarOInicioAutomatico(unittest.TestCase):
    def test_apaga_as_tres_entradas_e_o_vigia_e_deixa_o_que_nao_e_da_conexao_de_hoje(self):
        with tempfile.TemporaryDirectory() as appdata:
            inicializar = pasta_inicializar(appdata)
            for nome in ("perpetualminer-anki-bridge.vbs", "perpetualminer-anki-bridge.cmd", "outro-programa.lnk"):
                open(os.path.join(inicializar, nome), "w").close()
            windows = WindowsDeMentira()
            apagados = SistemaDoWindows(ambiente={"APPDATA": appdata}, executar=windows).apagar_o_inicio_automatico()
            restou = os.listdir(inicializar)
        self.assertEqual(restou, ["outro-programa.lnk"])
        self.assertEqual(windows.existe, set())
        self.assertEqual(sorted(apagados), sorted(["tarefa", "run", "vigia", "perpetualminer-anki-bridge.cmd", "perpetualminer-anki-bridge.vbs"]))
        apagou = [p for p in windows.pedidos if p[1].lower() in ("/delete", "delete")]
        self.assertEqual(sorted(p[3] if p[0] == "schtasks" else "run" for p in apagou), ["PerpetualMinerAnkiBridge", "PerpetualMinerAnkiBridgeWatchdog", "run"])

    def test_o_que_ja_nao_existe_nao_e_apagado_nem_e_erro(self):
        with tempfile.TemporaryDirectory() as appdata:
            windows = WindowsDeMentira(existe=())
            apagados = SistemaDoWindows(ambiente={"APPDATA": appdata}, executar=windows).apagar_o_inicio_automatico()
        self.assertEqual(apagados, [])
        self.assertFalse([p for p in windows.pedidos if p[1].lower() in ("/delete", "delete")])

    def test_o_vigia_que_o_windows_nao_deixa_apagar_faz_a_passagem_parar_antes_do_processo(self):
        with tempfile.TemporaryDirectory() as appdata:
            sistema = SistemaDoWindows(ambiente={"APPDATA": appdata}, executar=WindowsDeMentira(recusa="vigia"))
            with self.assertRaises(PassagemFalhou):
                sistema.apagar_o_inicio_automatico()

    def test_o_lancador_que_nao_da_para_apagar_faz_a_passagem_parar(self):
        with tempfile.TemporaryDirectory() as appdata:
            inicializar = pasta_inicializar(appdata)
            os.mkdir(os.path.join(inicializar, "perpetualminer-anki-bridge.vbs"))  # uma pasta no lugar do arquivo: remover falha
            sistema = SistemaDoWindows(ambiente={"APPDATA": appdata}, executar=WindowsDeMentira(existe=()))
            with self.assertRaises(PassagemFalhou):
                sistema.apagar_o_inicio_automatico()


class PararOProcesso(unittest.TestCase):
    def test_encerra_so_o_processo_que_a_conexao_de_hoje_disse(self):
        windows = WindowsDeMentira()
        SistemaDoWindows(ambiente={}, executar=windows).parar(424242)
        self.assertEqual(windows.pedidos, [["taskkill", "/PID", "424242", "/F"]])

    def test_sem_um_numero_de_processo_de_verdade_nada_e_encerrado(self):
        windows = WindowsDeMentira()
        for pid in (None, 0, -1, "424242"):
            with self.assertRaises(PassagemFalhou):
                SistemaDoWindows(ambiente={}, executar=windows).parar(pid)
        self.assertEqual(windows.pedidos, [])

    def test_o_processo_que_o_windows_nao_encerra_levanta_para_a_porta_nao_ser_dada_por_livre(self):
        with self.assertRaises(PassagemFalhou):
            SistemaDoWindows(ambiente={}, executar=WindowsDeMentira(recusa="taskkill")).parar(424242)


if __name__ == "__main__":
    unittest.main()
