"""O `Pareamento.concluir` por dentro (#745): cada desfecho, o que fica no arquivo e o que a janela do Anki vê.

`test_pareamento.py` prova o `concluir` por HTTP; aqui o `Pareamento` roda sozinho, com relógio de mentira, para fixar o que o
HTTP não mostra: o arquivo `pareamento.json` depois de cada desfecho (navegadores e revogados), a contagem de códigos esgotados,
o aviso de conectado e os registros do log. Serve de rede para quem corta o método.

    python3.9 complemento/test_pareamento_concluir.py
"""

import base64
import json
import logging
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pareamento
from complemento.test_pareamento_de_mentira import CLIENTE, CODIGO, OUTRO_CLIENTE, SEGREDO, UM_CLIENTE_NOVO, TelaDeMentira, semear

OUTROS = ["%08d-aaaa-4bbb-8ccc-dddddddddddd" % n for n in range(1, 8)]


class LogDeMentira(logging.Handler):
    def __init__(self):
        super().__init__()
        self.linhas = []

    def emit(self, registro):
        self.linhas.append((registro.levelname, registro.getMessage()))


class Cenario:
    def __init__(self, pasta, com_tela=True):
        self.arquivo = os.path.join(pasta, "pareamento.json")
        self.hora = [1000.0]
        self.tela = TelaDeMentira() if com_tela else None
        self.log = LogDeMentira()
        logger = logging.getLogger("pareamento-concluir-de-mentira")
        logger.handlers = [self.log]
        logger.propagate = False
        logger.setLevel(logging.DEBUG)
        self.p = pareamento.Pareamento(self.arquivo, logger, relogio=lambda: self.hora[0], na_tela=self.tela, sortear=lambda: CODIGO)

    def arquivo_lido(self):
        with open(self.arquivo, encoding="utf-8") as arquivo:
            return json.load(arquivo)

    def clientes(self):
        return [linha["cliente"] for linha in self.arquivo_lido()["clientes"]]

    def revogados(self):
        return [linha["cliente"] for linha in self.arquivo_lido().get("revogados", [])]


def gastar_um_codigo(p, cliente):
    p.comecar()
    for _ in range(pareamento.TENTATIVAS):
        p.concluir("AAA-AAA", cliente, "")


class ConcluirPorDentro(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta.cleanup)
        self.c = Cenario(self.pasta.name)
        self.addCleanup(self.c.p.parar)

    def test_o_codigo_certo_grava_o_navegador_fecha_a_janela_avisa_que_conectou_e_loga(self):
        self.c.p.comecar()
        status, corpo = self.c.p.concluir("k7m-4px", UM_CLIENTE_NOVO, "Meu Chrome")
        arquivo = self.c.arquivo_lido()
        self.assertEqual((status, set(corpo), corpo["cliente"]), (200, {"cliente", "segredo"}, UM_CLIENTE_NOVO))
        self.assertEqual(len(base64.b64decode(corpo["segredo"])), 32)
        self.assertEqual([(l["cliente"], l["segredo"], l["nome"]) for l in arquivo["clientes"]], [(UM_CLIENTE_NOVO, corpo["segredo"], "Meu Chrome")])
        self.assertEqual((arquivo["versao"], arquivo["revogados"], self.c.tela.fechou, self.c.tela.conectados), (1, [], 1, 1))
        self.assertIn(("INFO", "Pareamento: um navegador foi conectado"), self.c.log.linhas)

    def test_a_resposta_repetida_no_prazo_devolve_o_mesmo_segredo_e_nao_regrava_nem_avisa_de_novo(self):
        self.c.p.comecar()
        primeiro = self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        antes = self.c.arquivo_lido()
        segundo = self.c.p.concluir("K7M 4PX", UM_CLIENTE_NOVO, "outro nome")
        self.assertEqual((segundo, self.c.arquivo_lido(), self.c.tela.conectados), (primeiro, antes, 1))

    def test_depois_do_prazo_a_resposta_repetida_ja_nao_vale(self):
        self.c.p.comecar()
        self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        self.c.hora[0] += pareamento.VALIDADE_DO_CODIGO_S + 1
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, ""), (410, {"error": "pairing_code_expired"}))

    def test_sem_o_segredo_no_arquivo_a_resposta_repetida_nao_o_devolve_de_novo(self):
        self.c.p.comecar()
        self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        semear(self.c.arquivo, [])
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, ""), (410, {"error": "pairing_code_expired"}))
        self.assertEqual(self.c.clientes(), [])

    def test_outro_navegador_com_o_codigo_ja_usado_recebe_409_e_o_arquivo_fica_como_estava(self):
        self.c.p.comecar()
        self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        antes = self.c.arquivo_lido()
        self.assertEqual(self.c.p.concluir(CODIGO, OUTRO_CLIENTE, ""), (409, {"error": "pairing_code_used"}))
        self.assertEqual(self.c.arquivo_lido(), antes)

    def test_sem_codigo_pendente_o_resultado_e_410_e_nada_e_gravado(self):
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, ""), (410, {"error": "pairing_code_expired"}))
        self.assertFalse(os.path.exists(self.c.arquivo))

    def test_cada_erro_conta_uma_tentativa_e_diz_quantas_restam(self):
        self.c.p.comecar()
        respostas = [self.c.p.concluir("AAA-AAA", UM_CLIENTE_NOVO, "") for _ in range(pareamento.TENTATIVAS - 1)]
        self.assertEqual([r[0] for r in respostas], [401] * 4)
        self.assertEqual([r[1]["restam"] for r in respostas], [4, 3, 2, 1])
        self.assertEqual(respostas[0][1], {"error": "pairing_code_wrong", "restam": 4})

    def test_a_quinta_tentativa_errada_mata_o_codigo_fecha_a_janela_e_o_certo_depois_ja_nao_vale(self):
        self.c.p.comecar()
        ultimo = [self.c.p.concluir("AAA-AAA", UM_CLIENTE_NOVO, "") for _ in range(pareamento.TENTATIVAS)][-1]
        depois = self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        self.assertEqual((ultimo, depois), ((410, {"error": "pairing_code_expired"}),) * 2)
        self.assertEqual((self.c.tela.fechou, self.c.tela.conectados, os.path.exists(self.c.arquivo)), (1, 0, False))

    def test_tres_codigos_esgotados_bloqueiam_o_codigo_novo_e_parear_zera_a_conta(self):
        for _ in range(pareamento.CODIGOS_ESGOTADOS_PARA_BLOQUEAR - 1):
            gastar_um_codigo(self.c.p, UM_CLIENTE_NOVO)
        self.c.p.comecar()
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")[0], 200)
        for _ in range(pareamento.CODIGOS_ESGOTADOS_PARA_BLOQUEAR - 1):
            gastar_um_codigo(self.c.p, OUTRO_CLIENTE)
        self.assertEqual(self.c.p.comecar(), (200, {"ok": True}))

    def test_o_terceiro_codigo_esgotado_trava_o_comecar_e_avisa_no_log(self):
        for _ in range(pareamento.CODIGOS_ESGOTADOS_PARA_BLOQUEAR):
            gastar_um_codigo(self.c.p, UM_CLIENTE_NOVO)
        self.assertEqual(self.c.p.comecar(), (429, {"error": "pairing_locked"}))
        avisos = [texto for nivel, texto in self.c.log.linhas if nivel == "WARNING"]
        self.assertEqual(avisos, ["Pareamento: 3 códigos gastaram as tentativas; nenhum código novo por 15 minutos"])

    def test_o_sexto_navegador_despeja_o_mais_antigo_para_os_revogados(self):
        semear(self.c.arquivo, [(c, SEGREDO) for c in OUTROS[:pareamento.MAXIMO_DE_NAVEGADORES]])
        self.c.p.comecar()
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")[0], 200)
        self.assertEqual(self.c.clientes(), OUTROS[1:5] + [UM_CLIENTE_NOVO])
        self.assertEqual(self.c.revogados(), [OUTROS[0]])
        self.assertEqual(self.c.p.conferir(OUTROS[0], "d" * 20)[1]["error"], "pairing_revoked")

    def test_parear_de_novo_um_navegador_revogado_tira_ele_dos_revogados_e_troca_o_segredo(self):
        semear(self.c.arquivo, [(CLIENTE, SEGREDO)])
        self.c.p.desconectar()
        self.assertEqual((self.c.clientes(), self.c.revogados()), ([], [CLIENTE]))
        self.c.p.comecar()
        _, corpo = self.c.p.concluir(CODIGO, CLIENTE, "")
        self.assertEqual((self.c.clientes(), self.c.revogados()), ([CLIENTE], []))
        self.assertNotEqual(base64.b64decode(corpo["segredo"]), SEGREDO)

    def test_o_aviso_de_conectado_que_quebra_nao_desfaz_o_pareamento_e_vai_para_o_log(self):
        self.c.tela.conectou = lambda: (_ for _ in ()).throw(RuntimeError("o Qt mudou"))
        self.c.p.comecar()
        status, corpo = self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        self.assertEqual((status, self.c.clientes()), (200, [UM_CLIENTE_NOVO]))
        self.assertIn(("ERROR", "Pareamento: o aviso de conectado não saiu"), self.c.log.linhas)

    def test_a_janela_que_some_depois_de_comecar_nao_impede_de_concluir(self):
        self.c.p.comecar()
        self.c.p.na_tela = None
        status, _ = self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, "")
        self.assertEqual((status, self.c.clientes()), (200, [UM_CLIENTE_NOVO]))

    def test_o_codigo_vencido_responde_410_mesmo_que_o_relogio_de_vencer_nao_tenha_rodado(self):
        self.c.p.comecar()
        self.c.hora[0] += pareamento.VALIDADE_DO_CODIGO_S
        self.assertEqual(self.c.p.concluir(CODIGO, UM_CLIENTE_NOVO, ""), (410, {"error": "pairing_code_expired"}))
        self.assertEqual(self.c.tela.fechou, 1)

    def test_concluir_certo_para_o_navegador_ja_pareado_troca_o_segredo_dele_sem_duplicar(self):
        semear(self.c.arquivo, [(CLIENTE, SEGREDO), (OUTRO_CLIENTE, SEGREDO)])
        self.c.p.comecar()
        self.c.p.concluir(CODIGO, CLIENTE, "")
        self.assertEqual(self.c.clientes(), [OUTRO_CLIENTE, CLIENTE])
        self.assertEqual(self.c.revogados(), [])


if __name__ == "__main__":
    unittest.main()
