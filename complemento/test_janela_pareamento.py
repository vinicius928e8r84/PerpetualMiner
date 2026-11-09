"""O pareamento na janela do Anki (#192): o diálogo do código, o aviso de conectado e o Desconectar navegadores, pela fronteira `janela.ligar`.

O Qt é o de mentira de `test_janela.QtDeMentira`; a Conexão é a de verdade (o pareamento por HTTP). A tela do Anki de verdade é o ensaio do dono.

    python3.9 complemento/test_janela_pareamento.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import janela  # noqa: E402
from complemento.test_janela import QtDeMentira, a_janela  # noqa: E402
from complemento.test_pareamento_de_mentira import UM_CLIENTE_NOVO, comecar, concluir  # noqa: E402
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402


def ligado(conexao, perfil="Usuário 1"):
    qt = QtDeMentira()
    janela.ligar(object(), a_janela(conexao, perfil=perfil), qt, "perpetualminer", conexao.logger)
    return qt


class OCodigoApareceNoAnki(unittest.TestCase):
    def test_comecar_abre_o_dialogo_com_o_texto_aprovado_e_o_codigo_nao_volta_pelo_http(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False, tela=False) as conexao:
            qt = ligado(conexao)
            status, _, corpo = comecar(conexao)
        (texto, cancelar, _), = qt.codigos
        self.assertEqual(texto, "Código para conectar o PerpetualMiner: K7M-4PX. Vale por 5 minutos")
        self.assertEqual((cancelar, status, json.loads(corpo)), ("Cancelar", 200, {"ok": True}))
        self.assertNotIn("K7M", corpo.decode("utf-8"))

    def test_o_cancelar_do_dialogo_mata_o_codigo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False, tela=False) as conexao:
            qt = ligado(conexao)
            comecar(conexao)
            qt.codigos[0][2]()
            status, resposta, _ = concluir(conexao)
        self.assertEqual((status, resposta), (410, {"error": "pairing_code_expired"}))

    def test_o_codigo_certo_fecha_o_dialogo_e_diz_que_o_navegador_conectou(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False, tela=False) as conexao:
            qt = ligado(conexao)
            comecar(conexao)
            status = concluir(conexao)[0]
        self.assertEqual((status, qt.fechados, qt.avisos), (200, 1, ["PerpetualMiner conectado"]))

    def test_o_codigo_nunca_vai_para_o_aviso_nem_para_o_estado_da_janela(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False, tela=False) as conexao:
            qt = ligado(conexao)
            comecar(conexao)
            concluir(conexao)
            estado = a_janela(conexao).estado()
        self.assertNotIn("K7M", repr(estado) + " ".join(qt.avisos))

    def test_sem_conexao_a_janela_nao_tem_onde_ligar_o_pareamento_e_nada_levanta(self):
        qt = QtDeMentira()
        janela.ligar(object(), janela.Janela(None, lambda: None, "0.4.25", __import__("logging").getLogger("t")), qt, "perpetualminer", __import__("logging").getLogger("t"))
        self.assertEqual(qt.codigos, [])


class OBotaoDesconectarNavegadores(unittest.TestCase):
    def test_a_janela_conta_os_navegadores_conectados_e_o_botao_os_desconecta(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            qt = ligado(conexao)
            qt.itens[0].clicar()
            antes = qt.janelas[0].navegadores
            qt.desconectar()
            qt.itens[0].clicar()
            depois = qt.janelas[1].navegadores
            status, _, _ = conexao.pedir("POST", "/ia/estado", corpo={})
        self.assertEqual((antes, depois, status), (1, 0, 401))

    def test_desconectar_sem_navegador_nao_levanta_e_diz_zero(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            self.assertEqual(a_janela(conexao).desconectar_navegadores(), 0)

    def test_um_arquivo_de_pareamento_que_nao_se_le_e_zero_navegadores_e_vai_ao_registro_uma_vez(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            a = a_janela(conexao)
            conexao.conexao.pareamento.quantos = lambda: (_ for _ in ()).throw(OSError("disco"))
            primeiro, segundo = a.estado().navegadores, a.estado().navegadores
            registros = conexao.log().count("A janela não leu os navegadores conectados")
        self.assertEqual((primeiro, segundo, registros), (0, 0, 1))


if __name__ == "__main__":
    unittest.main()
