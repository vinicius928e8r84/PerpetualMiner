"""O pareamento da Conexão com o Anki, visto de fora (#192): o código, o segredo e a prova da Conexão.

O servidor é o real, por HTTP, sem Anki e sem Qt (a janela do Anki é `TelaDeMentira`). O que cada teste confere é o que a extensão e um
cliente hostil enxergam: o status, o JSON, os cabeçalhos e o que fica em disco e no log. Os exemplos do contrato
(`contrato/exemplos-do-pareamento.json`) dizem cada resposta; aqui estão os caminhos que um exemplo só não mostra. O porteiro, a prova da
resposta e o desconectar estão em `test_pareamento_porteiro.py`.

    python3.9 complemento/test_pareamento.py
"""

import base64
import hmac
import logging
import os
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pareamento  # noqa: E402
from complemento.test_pareamento_de_mentira import (  # noqa: E402
    CLIENTE, CODIGO, DESAFIO, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, UM_CLIENTE_NOVO, VETOR, TelaDeMentira, arquivo_do_pareamento, bytes_de, cabecalhos_assinados,
    comecar, concluir, json_de, semear,
)
from complemento.test_servidor import ConexaoNoTeste  # noqa: E402


class OVetorDeAssinatura(unittest.TestCase):
    """A mesma conta que o WebCrypto faz na extensão (`test_pareamento_do_anki.js` confere o mesmo vetor)."""

    def test_o_vetor_do_contrato_da_a_mesma_assinatura_que_o_webcrypto_deu(self):
        assinatura = pareamento.assinatura_do_pedido(
            base64.b64decode(VETOR["segredo"]), VETOR["sessao"], VETOR["nonce"], VETOR["metodo"], VETOR["caminho"], VETOR["corpo"].encode("utf-8"))
        self.assertEqual(assinatura, VETOR["assinatura"])

    def test_os_tres_usos_do_segredo_nunca_dao_a_mesma_prova(self):
        segredo = b"s" * 32
        provas = {
            pareamento.assinatura_do_pedido(segredo, "sessao", "nonce-00", "POST", "/x", b"{}"),
            pareamento.prova_da_resposta(segredo, "sessao", "nonce-00", 200, b"{}"),
            pareamento.prova_do_servidor(segredo, "nonce-00", "sessao"),
        }
        self.assertEqual(len(provas), 3)


class ComecarOPareamento(unittest.TestCase):
    def test_o_codigo_aparece_na_janela_do_anki_e_nunca_na_resposta_http_nem_no_log(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            status, cabecalhos, corpo = comecar(conexao)
            sem_assinar = conexao.pedir("POST", "/pareamento/comecar", corpo={}, assinar=False)
            tela, log = conexao.tela.codigo, conexao.log()
            todas = repr((status, cabecalhos, corpo, sem_assinar)) + log
        self.assertEqual((status, json_de(corpo), tela), (200, {"ok": True}, "K7M-4PX"))
        self.assertEqual(sem_assinar[0], 200)  # o pareamento não exige a assinatura que ele existe para dar
        for forma in (CODIGO, "K7M-4PX"):
            self.assertNotIn(forma, todas)

    def test_comecar_de_novo_com_o_codigo_pendente_mostra_o_mesmo_codigo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            comecar(conexao, codigo="OUTRO1")
            codigos = conexao.tela.codigos
        self.assertEqual(codigos, ["K7M-4PX", "K7M-4PX"])

    def test_sem_a_janela_do_anki_nao_ha_onde_mostrar_o_codigo_e_a_resposta_diz_isso(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False, tela=False) as conexao:
            status, _, corpo = conexao.pedir("POST", "/pareamento/comecar", corpo={})
        self.assertEqual((status, json_de(corpo)), (503, {"error": "pairing_unavailable"}))

    def test_a_janela_que_quebra_nao_deixa_um_codigo_que_ninguem_ve(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            conexao.tela.quebra = True
            status, _, corpo = conexao.pedir("POST", "/pareamento/comecar", corpo={})
            conexao.tela.quebra = False
            conexao.conexao.pareamento.sortear = lambda: "OUTRO1"
            conexao.pedir("POST", "/pareamento/comecar", corpo={})
            codigo = conexao.tela.codigo
            erro_no_log = "o Qt mudou" in conexao.log()
        self.assertEqual((status, json_de(corpo), codigo, erro_no_log), (503, {"error": "pairing_unavailable"}, "OUT-RO1", True))

    def test_cancelar_no_anki_mata_o_codigo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            conexao.tela.cancelar()
            status, resposta, _ = concluir(conexao)
            arquivo = os.path.exists(os.path.join(pasta, "pareamento.json"))
        self.assertEqual((status, resposta, arquivo), (410, {"error": "pairing_code_expired"}, False))


class ConcluirOPareamento(unittest.TestCase):
    def test_o_codigo_certo_grava_o_navegador_e_entrega_o_segredo_so_nesta_resposta(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            status, resposta, cabecalhos = concluir(conexao, codigo="k7m 4px")  # o painel manda o que a pessoa digitou: caixa e separador não contam
            guardado = arquivo_do_pareamento(conexao)
            modo = stat.S_IMODE(os.stat(os.path.join(pasta, "pareamento.json")).st_mode)
            fechou, conectados = conexao.tela.fechou, conexao.tela.conectados
            log = conexao.log()
        self.assertEqual(status, 200)
        self.assertEqual(resposta["cliente"], UM_CLIENTE_NOVO)
        self.assertEqual(len(base64.b64decode(resposta["segredo"], validate=True)), 32)
        self.assertEqual([(c["cliente"], c["segredo"], c["nome"]) for c in guardado["clientes"]], [(UM_CLIENTE_NOVO, resposta["segredo"], "Chrome")])
        self.assertEqual(guardado["versao"], 1)
        self.assertEqual((fechou, conectados), (1, 1))
        self.assertEqual(cabecalhos["Cache-Control"], "no-store")
        self.assertNotIn(resposta["segredo"], log)
        if os.name != "nt":
            self.assertEqual(modo, 0o600)

    def test_o_segredo_entregue_assina_pedidos_que_a_conexao_aceita(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            _, resposta, _ = concluir(conexao)
            segredo = base64.b64decode(resposta["segredo"])
            conferir = json_de(conexao.pedir("POST", "/pareamento/conferir", corpo={"cliente": UM_CLIENTE_NOVO, "desafio": DESAFIO})[2])
            cabecalhos = cabecalhos_assinados(conferir["sessao"], "POST", "/ia/estado", b"{}", cliente=UM_CLIENTE_NOVO, segredo=segredo)
            status, _, _ = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)
        self.assertEqual(status, 200)

    def test_a_resposta_perdida_e_repetida_com_o_mesmo_codigo_e_navegador_e_entrega_o_mesmo_segredo_sem_regravar(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            primeiro = concluir(conexao)
            antes = bytes_de(os.path.join(pasta, "pareamento.json"))
            segundo = concluir(conexao)
            depois = bytes_de(os.path.join(pasta, "pareamento.json"))
        self.assertEqual((segundo[0], segundo[1]), (primeiro[0], primeiro[1]))
        self.assertEqual(antes, depois)

    def test_outro_navegador_com_um_codigo_ja_usado_recebe_409_e_nada_e_gravado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            concluir(conexao)
            status, resposta, _ = concluir(conexao, cliente=OUTRO_CLIENTE)
            clientes = [c["cliente"] for c in arquivo_do_pareamento(conexao)["clientes"]]
        self.assertEqual((status, resposta, clientes), (409, {"error": "pairing_code_used"}, [UM_CLIENTE_NOVO]))

    def test_cinco_erros_matam_o_codigo_e_o_certo_depois_ja_nao_vale(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            respostas = [concluir(conexao, codigo="AAA-AAA")[:2] for _ in range(5)]
            certo = concluir(conexao)[:2]
            fechou = conexao.tela.fechou
            arquivo = os.path.exists(os.path.join(pasta, "pareamento.json"))
        self.assertEqual(respostas, [
            (401, {"error": "pairing_code_wrong", "restam": 4}), (401, {"error": "pairing_code_wrong", "restam": 3}),
            (401, {"error": "pairing_code_wrong", "restam": 2}), (401, {"error": "pairing_code_wrong", "restam": 1}),
            (410, {"error": "pairing_code_expired"}),
        ])
        self.assertEqual((certo, fechou, arquivo), ((410, {"error": "pairing_code_expired"}), 1, False))

    def test_recomecar_nao_devolve_as_tentativas_ao_mesmo_codigo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            concluir(conexao, codigo="AAA-AAA")
            concluir(conexao, codigo="AAA-AAA")
            comecar(conexao)
            restam = concluir(conexao, codigo="AAA-AAA")[1]["restam"]
        self.assertEqual(restam, 2)

    def test_o_codigo_errado_nao_grava_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            concluir(conexao, codigo="AAA-AAA")
            existe = os.path.exists(os.path.join(pasta, "pareamento.json"))
        self.assertFalse(existe)

    def test_so_cinco_navegadores_ficam_e_o_mais_antigo_sai(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            ids = ["00000000-0000-4000-8000-00000000000%d" % n for n in range(6)]
            for cliente in ids:
                comecar(conexao)
                self.assertEqual(concluir(conexao, cliente=cliente)[0], 200)
            ficaram = [c["cliente"] for c in arquivo_do_pareamento(conexao)["clientes"]]
        self.assertEqual(ficaram, ids[1:])

    def test_parear_de_novo_o_mesmo_navegador_substitui_o_segredo_dele(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            primeiro = concluir(conexao)[1]["segredo"]
            comecar(conexao, codigo="BBBBBB")
            segundo = concluir(conexao, codigo="BBB-BBB")[1]["segredo"]
            clientes = arquivo_do_pareamento(conexao)["clientes"]
        self.assertEqual(([c["segredo"] for c in clientes], primeiro != segundo), ([segundo], True))

    def test_o_codigo_vale_ate_o_ultimo_segundo_e_depois_disso_nao_vale_e_a_janela_fecha(self):
        relogio = [1000.0]
        with tempfile.TemporaryDirectory() as pasta:
            tela = TelaDeMentira()
            p = pareamento.Pareamento(os.path.join(pasta, "pareamento.json"), logging.getLogger("teste"), relogio=lambda: relogio[0], na_tela=tela,
                                      sortear=lambda: CODIGO)
            try:
                p.comecar()
                relogio[0] += pareamento.VALIDADE_DO_CODIGO_S - 1
                ainda_vale = p.concluir("K7M-4PX", UM_CLIENTE_NOVO, "")[0]
                p.comecar()
                relogio[0] += pareamento.VALIDADE_DO_CODIGO_S + 1
                p.expirar()
                fechou = tela.fechou
                depois = p.concluir("K7M-4PX", OUTRO_CLIENTE, "")
            finally:
                p.parar()
        self.assertEqual((ainda_vale, depois, fechou), (200, (410, {"error": "pairing_code_expired"}), 2))

    def test_o_codigo_vence_em_cinco_minutos(self):
        self.assertEqual(pareamento.VALIDADE_DO_CODIGO_S, 300)
        self.assertEqual(pareamento.TENTATIVAS, 5)

    def test_o_codigo_so_usa_o_alfabeto_sem_ambiguidade(self):
        codigos = {pareamento.sortear_o_codigo() for _ in range(200)}
        self.assertTrue(all(len(c) == 6 and set(c) <= set(pareamento.ALFABETO) for c in codigos))
        self.assertTrue(set("01OIL").isdisjoint(pareamento.ALFABETO))

    def test_um_nome_enorme_ou_um_navegador_que_nao_e_uuid_e_recusado_sem_gastar_tentativa(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            recusas = [
                conexao.pedir("POST", "/pareamento/concluir", corpo={"codigo": "AAA-AAA", "cliente": "x", "nome": "a"})[0],
                conexao.pedir("POST", "/pareamento/concluir", corpo={"codigo": "AAA-AAA", "cliente": UM_CLIENTE_NOVO, "nome": "n" * 61})[0],
            ]
            restam = concluir(conexao, codigo="AAA-AAA")[1]["restam"]
        self.assertEqual((recusas, restam), ([400, 400], 4))


class ConferirAConexao(unittest.TestCase):
    def conferir(self, conexao, cliente=CLIENTE, desafio=DESAFIO):
        status, cabecalhos, corpo = conexao.pedir("POST", "/pareamento/conferir", corpo={"cliente": cliente, "desafio": desafio}, assinar=False)
        return status, json_de(corpo), cabecalhos

    def test_a_prova_so_sai_de_quem_tem_o_segredo_do_navegador(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, resposta, _ = self.conferir(conexao)
            sessao = conexao.conexao.pareamento.sessao
        self.assertEqual(status, 200)
        self.assertEqual(resposta["sessao"], sessao)
        self.assertTrue(hmac.compare_digest(resposta["prova"], pareamento.prova_do_servidor(SEGREDO, DESAFIO, sessao)))

    def test_um_navegador_que_a_conexao_nao_conhece_recebe_401_e_nenhuma_prova(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            status, resposta, cabecalhos = self.conferir(conexao)
        self.assertEqual((status, resposta), (401, {"error": "pairing_required"}))
        self.assertNotIn(pareamento.CABECALHO_DA_PROVA, cabecalhos)

    def test_a_prova_de_outro_desafio_ou_de_outro_navegador_e_outra(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
            a = self.conferir(conexao)[1]["prova"]
            b = self.conferir(conexao, desafio="outro-desafio-0123456789abcdef")[1]["prova"]
            c = self.conferir(conexao, cliente=OUTRO_CLIENTE)[1]["prova"]
        self.assertEqual(len({a, b, c}), 3)

    def test_a_sessao_muda_a_cada_subida_da_conexao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                antes = conexao.conexao.pareamento.sessao
                cabecalhos_velhos = cabecalhos_assinados(antes, "POST", "/ia/estado", b"{}")
            with ConexaoNoTeste(pasta) as conexao:
                depois = conexao.conexao.pareamento.sessao
                status, _, corpo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos_velhos)
        self.assertNotEqual(antes, depois)
        self.assertEqual((status, json_de(corpo)), (401, {"error": "session_expired"}))


if __name__ == "__main__":
    unittest.main()
