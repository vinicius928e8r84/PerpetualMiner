"""As duas rotas da Fila que mudam um Envio já criado, vistas pelas funções (as tabelas de `test_envio_fila.py`): o Apagar tudo
(`POST /jobs/apagar-frases`, `Fila.apagar_as_frases`) em cada tipo de pedido da pasta e o Tentar de novo (`POST /jobs/retry`,
`Fila.tentar_de_novo`) em cada situação do Envio.

    python3.9 complemento/test_envio_fila_rotas.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.limite_do_plano import PLANO_NO_LIMITE
from complemento.teto_do_mes import NO_TETO
from complemento.test_envio_fila import FRASE, ID, LINHA, ORFAO, OUTRO, SEGUNDA, cartao, na_pasta, um_estado, um_pedido


class OApagarTudoNaPasta(unittest.TestCase):
    def pasta_com_tres_envios(self, pasta):
        pasta.com(um_pedido(ID, {"phraseId": FRASE, "line": LINHA, "keywords": ["keep running", "run"]}, {"phraseId": SEGUNDA, "line": "x : y"}),
                  um_estado(ID, "running", {"%d-0" % FRASE: cartao(FRASE, "text"), "%d-1" % FRASE: cartao(FRASE, "failed", "openai_rate_limited"),
                                            "%d-0" % SEGUNDA: cartao(SEGUNDA, "added")}, stage="generate_cards", waiting=NO_TETO,
                            progress={"done": 1, "total": 3}),
                  textos=("%d-0.txt" % FRASE, "%d-0.txt.123.novo" % FRASE, "nota.json")).na_fila(ID, OUTRO)
        pasta.com(um_pedido(OUTRO, {"phraseId": FRASE, "noAnki": {"%d-0" % FRASE: "added"}}),
                  um_estado(OUTRO, "completed", {"%d-0" % FRASE: cartao(FRASE, "added")}, successfulPhraseIds=[FRASE]), job_id=OUTRO)
        pasta.com(um_pedido(ORFAO, {"phraseId": FRASE, "line": LINHA}), job_id=ORFAO)
        pasta.gravar(os.path.join(pasta.dados.fila, "nao-e-um-id.json"), {"entries": [{"line": LINHA}]})
        pasta.gravar(os.path.join(pasta.dados.custos, ID, "costs.jsonl"), '{"usd": 0.01}\n')
        pasta.gravar(os.path.join(pasta.dados.custos, ID, "costs.jsonl.9.novo"), LINHA)
        pasta.gravar(os.path.join(pasta.dados.fila, "fila.json.7.novo"), LINHA)
        return pasta

    def test_de_cada_pedido_somem_as_linhas_e_os_textos_e_o_envio_que_andava_vai_a_failed_com_wiped(self):
        pasta = na_pasta(self, self.pasta_com_tres_envios)
        self.assertIsNone(pasta.fila.apagar_as_frases())
        self.assertTrue(pasta.fila.despertador.is_set())
        self.assertEqual(pasta.ler("fila"), dict(um_pedido(ID, {"phraseId": FRASE}, {"phraseId": SEGUNDA}), wiped=True))
        self.assertEqual(pasta.textos(), ["nota.json"])
        estado = pasta.ler("estado")
        self.assertEqual({chave: estado[chave] for chave in ("status", "stage", "lastError", "progress", "wiped", "cards")}, {
            "status": "failed", "stage": "failed", "lastError": "frases_apagadas", "progress": {}, "wiped": True,
            "cards": {"%d-0" % FRASE: cartao(FRASE, "pending"), "%d-1" % FRASE: cartao(FRASE, "failed", "openai_rate_limited"),
                      "%d-0" % SEGUNDA: cartao(SEGUNDA, "added")}})
        self.assertNotIn("waiting", estado)

    def test_o_envio_que_ja_terminou_fica_com_o_fim_e_o_pedido_orfao_perde_a_linha_sem_ganhar_estado(self):
        pasta = na_pasta(self, self.pasta_com_tres_envios)
        pasta.fila.apagar_as_frases()
        self.assertEqual(pasta.ler("fila", OUTRO), dict(um_pedido(OUTRO, {"phraseId": FRASE, "noAnki": {"%d-0" % FRASE: "added"}}), wiped=True))
        self.assertEqual(pasta.ler("estado", OUTRO), dict(um_estado(OUTRO, "completed", {"%d-0" % FRASE: cartao(FRASE, "added")},
                                                                    successfulPhraseIds=[FRASE]), wiped=True, updatedAt=pasta.ler("estado", OUTRO)["updatedAt"]))
        self.assertEqual(pasta.ler("fila", ORFAO), dict(um_pedido(ORFAO, {"phraseId": FRASE}), wiped=True))
        self.assertIsNone(pasta.ler("estado", ORFAO))

    def test_o_que_nao_e_frase_fica_e_os_provisorios_somem(self):
        pasta = na_pasta(self, self.pasta_com_tres_envios)
        antes = pasta.retrato()
        pasta.fila.apagar_as_frases()
        depois = pasta.retrato()
        for nome in ("fila/fila.json", "fila/nao-e-um-id.json", "custos/%s/costs.jsonl" % ID, "estado/%s/nota.json" % ID):
            self.assertEqual(depois[os.path.normpath(nome)], antes[os.path.normpath(nome)], nome)
        self.assertEqual([nome for nome in depois if nome.endswith(".novo")], [])

    def test_repetido_nao_grava_nada(self):
        pasta = na_pasta(self, self.pasta_com_tres_envios)
        pasta.fila.apagar_as_frases()
        antes = pasta.retrato()
        pasta.fila.apagar_as_frases()
        self.assertEqual(pasta.retrato(), antes)

    def test_o_texto_que_chegou_depois_do_apagar_tudo_sai_e_o_cartao_volta_a_pending_sem_mudar_o_fim(self):
        apagado = dict(um_pedido(ID, {"phraseId": FRASE}), wiped=True)
        estado = um_estado(ID, "failed", {"%d-0" % FRASE: cartao(FRASE, "text")}, lastError="frases_apagadas", wiped=True)
        pasta = na_pasta(self, lambda p: p.com(apagado, estado, ("%d-0.txt" % FRASE,)).na_fila(ID))
        antes = pasta.retrato()
        pasta.fila.apagar_as_frases()
        self.assertEqual(pasta.ler("fila"), apagado)
        self.assertEqual(pasta.retrato()[os.path.join("fila", ID + ".json")], antes[os.path.join("fila", ID + ".json")])
        self.assertEqual(pasta.textos(), [])
        self.assertEqual(pasta.ler("estado"), dict(estado, cards={"%d-0" % FRASE: cartao(FRASE, "pending")}, updatedAt=pasta.ler("estado")["updatedAt"]))

    def test_o_pedido_apagado_com_a_palavra_que_sobrou_perde_a_palavra(self):
        pasta = na_pasta(self, lambda p: p.com(dict(um_pedido(ID, {"phraseId": FRASE, "keywords": ["run"]}), wiped=True)))
        pasta.fila.apagar_as_frases()
        self.assertEqual(pasta.ler("fila"), dict(um_pedido(ID, {"phraseId": FRASE}), wiped=True))

    def test_sem_a_pasta_da_fila_nada_acontece(self):
        pasta = na_pasta(self, lambda p: p)
        os.rmdir(pasta.dados.fila)
        pasta.fila.apagar_as_frases()
        self.assertFalse(os.path.exists(pasta.dados.fila))


class OTentarDeNovo(unittest.TestCase):
    PEDIDO = um_pedido(ID, {"phraseId": FRASE, "line": LINHA, "keywords": ["keep running", "run"]}, {"phraseId": SEGUNDA, "line": "x : y", "keywords": ["x"]})
    CARTOES = {"%d-0" % FRASE: cartao(FRASE, "failed", "openai_rate_limited"), "%d-1" % FRASE: cartao(FRASE, "failed", "voice_failed"),
               "%d-0" % SEGUNDA: cartao(SEGUNDA, "added")}

    def tentar(self, job_id=ID, pedido=PEDIDO, estado=None, textos=()):
        pasta = na_pasta(self, lambda p: p.com(pedido, estado, textos).na_fila(ID))
        antes = pasta.retrato()
        resposta = pasta.fila.tentar_de_novo(job_id)
        return pasta, resposta, antes

    def test_o_envio_que_terminou_volta_a_fila_e_o_cartao_que_falhou_volta_a_text_se_o_texto_esta_pago(self):
        for status in ("failed", "partial", "completed"):
            with self.subTest(status):
                fim = um_estado(ID, status, self.CARTOES, lastError="openai_rate_limited", progress={"done": 3, "total": 3},
                                completedStages=["send_to_anki"], successfulPhraseIds=[SEGUNDA], failedPhraseIds=[FRASE])
                pasta, resposta, _ = self.tentar(estado=fim, textos=("%d-1.txt" % FRASE,))
                self.assertEqual(resposta, (200, {"jobId": ID, "status": "queued"}))
                self.assertTrue(pasta.fila.mudou.is_set())
                self.assertFalse(pasta.fila.despertador.is_set())
                estado = pasta.ler("estado")
                self.assertEqual(estado, dict(fim, status="queued", stage="queued", lastError=None, progress={}, updatedAt=estado["updatedAt"], cards={
                    "%d-0" % FRASE: cartao(FRASE, "pending"), "%d-1" % FRASE: cartao(FRASE, "text"), "%d-0" % SEGUNDA: cartao(SEGUNDA, "added")}))

    def test_o_envio_na_fila_ou_rodando_so_diz_o_status_e_o_que_espera_o_plano_e_acordado(self):
        for nome, estado, acorda in (
            ("na fila", um_estado(ID, "queued", self.CARTOES), False),
            ("rodando", um_estado(ID, "running", self.CARTOES, stage="generate_cards"), False),
            ("esperando o teto do mês", um_estado(ID, "running", self.CARTOES, stage="generate_cards", waiting=NO_TETO), False),
            ("esperando o plano", um_estado(ID, "running", self.CARTOES, stage="generate_cards", waiting=PLANO_NO_LIMITE), True),
        ):
            with self.subTest(nome):
                pasta, resposta, antes = self.tentar(estado=estado)
                self.assertEqual(resposta, (200, {"jobId": ID, "status": estado["status"]}))
                self.assertEqual((pasta.fila.despertador.is_set(), pasta.fila.mudou.is_set()), (acorda, False))
                self.assertEqual(pasta.retrato(), antes)

    def test_o_envio_apagado_e_recusado_sem_gravar(self):
        fim = um_estado(ID, "failed", self.CARTOES)
        for nome, pedido, estado in (
            ("o estado apagado", self.PEDIDO, dict(fim, wiped=True, lastError="frases_apagadas")),
            ("o pedido apagado", dict(self.PEDIDO, wiped=True), fim),
            ("o pedido apagado com o estado na fila", dict(self.PEDIDO, wiped=True), um_estado(ID, "queued", self.CARTOES)),
        ):
            with self.subTest(nome):
                pasta, resposta, antes = self.tentar(pedido=pedido, estado=estado)
                self.assertEqual(resposta, (409, {"error": "job_wiped"}))
                self.assertEqual((pasta.retrato(), pasta.fila.mudou.is_set()), (antes, False))

    def test_um_envio_que_nao_existe_e_404_sem_gravar(self):
        for nome, job_id in (("outro id", OUTRO), ("um id com caminho", "../" + ID)):
            with self.subTest(nome):
                pasta, resposta, antes = self.tentar(job_id=job_id, estado=um_estado(ID, "failed", self.CARTOES))
                self.assertEqual(resposta, (404, {"error": "job_not_found"}))
                self.assertEqual(pasta.retrato(), antes)

    def test_sem_o_estado_ele_e_refeito_do_pedido_e_o_envio_ja_esta_na_fila(self):
        pasta, resposta, _ = self.tentar()
        self.assertEqual(resposta, (200, {"jobId": ID, "status": "queued"}))
        self.assertEqual(pasta.ler("estado")["cards"], {
            "%d-0" % FRASE: cartao(FRASE, "pending"), "%d-1" % FRASE: cartao(FRASE, "pending"), "%d-0" % SEGUNDA: cartao(SEGUNDA, "pending")})
        self.assertFalse(pasta.fila.mudou.is_set())


if __name__ == "__main__":
    unittest.main()
