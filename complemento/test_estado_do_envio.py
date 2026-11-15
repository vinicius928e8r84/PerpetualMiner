"""O estado gravado de um Envio como máquina de estados (`estado_do_envio.py`): a situação que o arquivo diz, a tabela das
transições, linha por linha, e o portão único (`Fila.mudar`) por onde todo escritor passa. O formato gravado não muda:
`esperando` é `running` com `waiting`, e `apagado` é o Envio com `wiped`. O desenho: `docs/design/envio-no-complemento.md` § 3.

    python3.9 complemento/test_estado_do_envio.py
"""

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import estado_do_envio as maquina  # noqa: E402
from complemento.estado_do_envio import (  # noqa: E402
    APAGADO, COMPLETED, ESPERANDO, FAILED, PARTIAL, QUEUED, RUNNING, TRANSICOES, TransicaoInvalida, coerente, conferir, retrato, situacao,
)
from complemento.test_envio import ID, LINHA, EnvioNoTeste, apagar_as_frases, arquivos_sem_o_log, chats, pedido  # noqa: E402

ESPERA = {"reason": "plan_limit"}
# Um estado gravado de cada situação, como o arquivo o diz.
DE_CADA = {
    QUEUED: {"status": "queued", "stage": "queued"},
    RUNNING: {"status": "running", "stage": "generate_cards"},
    ESPERANDO: {"status": "running", "stage": "generate_cards", "waiting": ESPERA},
    COMPLETED: {"status": "completed", "stage": "completed"},
    PARTIAL: {"status": "partial", "stage": "partial"},
    FAILED: {"status": "failed", "stage": "failed"},
    APAGADO: {"status": "failed", "stage": "failed", "wiped": True, "lastError": "frases_apagadas"},
}


def estado_de(nome):
    return dict(DE_CADA[nome], progress={}, cards={})


class ASituacaoQueOArquivoDiz(unittest.TestCase):
    def test_cada_estado_gravado_e_uma_situacao_so(self):
        for nome in DE_CADA:
            with self.subTest(nome):
                self.assertEqual(situacao(estado_de(nome)), nome)
                self.assertTrue(coerente(estado_de(nome)))

    def test_o_envio_que_terminou_e_depois_foi_apagado_tambem_e_apagado(self):
        for status in (COMPLETED, PARTIAL, FAILED):
            self.assertEqual(situacao({"status": status, "stage": status, "wiped": True}), APAGADO)

    def test_reservado_e_running_ainda_sem_etapa(self):
        self.assertEqual(situacao({"status": "running", "stage": "queued"}), RUNNING)
        self.assertTrue(coerente({"status": "running", "stage": "queued"}))

    def test_o_status_e_a_etapa_que_nao_dizem_a_mesma_coisa_nao_sao_um_estado(self):
        tortos = [
            {"status": "queued", "stage": "generate_cards"},
            {"status": "queued", "stage": "queued", "waiting": ESPERA},
            {"status": "running", "stage": "completed"},
            {"status": "failed", "stage": "generate_cards"},
            {"status": "completed", "stage": "completed", "waiting": ESPERA},
            {"status": "running", "stage": "generate_cards", "wiped": True},
            {"status": "failed", "stage": "generate_cards", "wiped": True},
        ]
        for torto in tortos:
            with self.subTest(torto):
                self.assertFalse(coerente(torto))

    def test_terminou_e_o_fim_coerente_e_o_apagado(self):
        self.assertEqual([nome for nome in DE_CADA if maquina.terminou(estado_de(nome))], [COMPLETED, PARTIAL, FAILED, APAGADO])
        self.assertFalse(maquina.terminou({"status": "failed", "stage": "generate_cards"}))


class ATabelaDasTransicoes(unittest.TestCase):
    VALEM = {
        (QUEUED, RUNNING), (QUEUED, APAGADO),
        (RUNNING, QUEUED), (RUNNING, ESPERANDO), (RUNNING, COMPLETED), (RUNNING, PARTIAL), (RUNNING, FAILED), (RUNNING, APAGADO),
        (ESPERANDO, RUNNING), (ESPERANDO, QUEUED), (ESPERANDO, COMPLETED), (ESPERANDO, PARTIAL), (ESPERANDO, FAILED), (ESPERANDO, APAGADO),
        (COMPLETED, QUEUED), (COMPLETED, APAGADO), (PARTIAL, QUEUED), (PARTIAL, APAGADO), (FAILED, QUEUED), (FAILED, APAGADO),
    }

    def test_a_tabela_e_esta(self):
        self.assertEqual({(de, para) for de, paras in TRANSICOES.items() for para in paras}, self.VALEM)
        self.assertEqual(sorted(TRANSICOES), sorted(DE_CADA))

    def test_cada_par_de_situacoes_passa_ou_e_recusado_pelo_portao(self):
        for de in DE_CADA:
            for para in DE_CADA:
                if de == para or de == APAGADO:
                    continue
                with self.subTest(de=de, para=para):
                    antes, depois = retrato(estado_de(de)), estado_de(para)
                    if (de, para) in self.VALEM:
                        conferir(antes, depois)
                        self.assertEqual(situacao(depois), para)
                    else:
                        with self.assertRaises(TransicaoInvalida):
                            conferir(antes, depois)

    def test_do_apagado_nao_se_sai_o_que_tentarem_mudar_volta_ao_que_era(self):
        for para in DE_CADA:
            with self.subTest(para):
                depois = dict(estado_de(para), cards={"1-0": {"status": "added"}})
                conferir(retrato(estado_de(APAGADO)), depois)
                self.assertEqual({k: depois.get(k) for k in ("status", "stage", "waiting", "wiped", "lastError")},
                                 {"status": "failed", "stage": "failed", "waiting": None, "wiped": True, "lastError": "frases_apagadas"})
                self.assertEqual(depois["cards"], {"1-0": {"status": "added"}})  # o Cartão que já estava indo ao Anki fica dito

    def test_a_mudanca_que_deixa_o_status_e_a_etapa_tortos_e_recusada(self):
        for de, torto in ((RUNNING, {"status": "running", "stage": "failed"}), (RUNNING, {"status": "completed", "stage": "send_to_anki"}),
                          (FAILED, {"status": "queued", "stage": "failed"}), (ESPERANDO, {"status": "failed", "stage": "failed", "waiting": ESPERA})):
            with self.subTest(torto), self.assertRaises(TransicaoInvalida):
                conferir(retrato(estado_de(de)), torto)

    def test_o_estado_torto_de_uma_versao_antiga_aceita_a_mudanca_que_nao_mexe_na_situacao(self):
        antigo = {"status": "failed", "stage": "generate_cards", "cards": {}}
        depois = dict(antigo, usingKey=True)
        conferir(retrato(antigo), depois)
        self.assertEqual(depois["usingKey"], True)


class CadaEventoLevaAUmEstadoCoerente(unittest.TestCase):
    def aplicar(self, de, evento):
        estado = estado_de(de)
        antes = retrato(estado)
        evento(estado)
        conferir(antes, estado)
        return estado

    def test_reservar(self):
        self.assertEqual(situacao(self.aplicar(QUEUED, maquina.reservar)), RUNNING)

    def test_devolver_a_fila_quando_a_conexao_sobe(self):
        for de in (RUNNING, ESPERANDO):
            estado = self.aplicar(de, maquina.devolver_a_fila)
            self.assertEqual((estado["status"], estado["stage"], estado.get("waiting")), ("queued", "queued", None))

    def test_tentar_de_novo(self):
        for de in (COMPLETED, PARTIAL, FAILED):
            estado = self.aplicar(de, maquina.repetir)
            self.assertEqual((estado["status"], estado["stage"], estado["lastError"], estado["progress"]), ("queued", "queued", None, {}))

    def test_terminar(self):
        for de in (RUNNING, ESPERANDO):
            for fim in (COMPLETED, PARTIAL, FAILED):
                estado = self.aplicar(de, lambda estado: maquina.terminar(estado, fim))
                self.assertEqual((estado["status"], estado["stage"], estado.get("waiting")), (fim, fim, None))

    def test_apagar(self):
        for de in (QUEUED, RUNNING, ESPERANDO):
            estado = self.aplicar(de, maquina.apagar)
            self.assertEqual((estado["status"], estado["stage"], estado["lastError"], estado["wiped"], estado.get("waiting")),
                             ("failed", "failed", "frases_apagadas", True, None))
        for de in (COMPLETED, PARTIAL, FAILED):  # o que terminou fica com o fim que teve
            estado = self.aplicar(de, maquina.apagar)
            self.assertEqual((estado["status"], estado["stage"], estado["wiped"]), (de, de, True))

    def test_o_evento_fora_de_hora_e_recusado(self):
        fora_de_hora = (
            (COMPLETED, maquina.reservar), (QUEUED, lambda e: maquina.terminar(e, COMPLETED)), (COMPLETED, lambda e: maquina.terminar(e, FAILED)),
            (QUEUED, lambda e: e.update(waiting=dict(ESPERA))), (FAILED, lambda e: e.update(stage="generate_cards")),
        )
        for de, evento in fora_de_hora:
            with self.subTest(de), self.assertRaises(TransicaoInvalida):
                self.aplicar(de, evento)


class Espia:
    """Anota cada estado que a fila grava e se a gravação veio de dentro do portão (`mudar`)."""

    def __init__(self, fila):
        self.gravados, self.fora_do_portao, self.dentro = [], [], 0
        gravar, mudar = fila._gravar_estado, fila.mudar

        def gravar_anotando(job_id, estado):
            self.gravados.append(json.loads(json.dumps(estado)))
            if not self.dentro:
                self.fora_do_portao.append((estado.get("status"), estado.get("stage")))
            return gravar(job_id, estado)

        def mudar_anotando(job_id, mudanca):
            self.dentro += 1
            try:
                return mudar(job_id, mudanca)
            finally:
                self.dentro -= 1

        fila._gravar_estado, fila.mudar = gravar_anotando, mudar_anotando


class TodoEscritorPassaPeloPortao(unittest.TestCase):
    def test_do_criar_ao_fim_ao_tentar_de_novo_e_ao_apagar_tudo_nenhum_estado_e_gravado_fora_do_portao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            espia = Espia(conexao.conexao.fila)  # a thread de trabalho ainda não tem o que pegar
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            conexao.criar(pedido(ID, "keep running | run : They keep running", "give up : She gave up smoking"))
            conexao.esperar(ID)  # partial
            conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            conexao.esperar(ID)
            apagar_as_frases(conexao)
        self.assertEqual(espia.fora_do_portao, [])
        self.assertGreaterEqual(len(espia.gravados), 6)
        situacoes = [situacao(estado) for estado in espia.gravados]
        for estado in espia.gravados:
            self.assertTrue(coerente(estado), (estado["status"], estado["stage"], estado.get("waiting"), estado.get("wiped")))
        for de, para in zip(situacoes, situacoes[1:]):
            self.assertTrue(de == para or para in TRANSICOES[de], (de, para))
        self.assertEqual([s for i, s in enumerate(situacoes) if i == 0 or situacoes[i - 1] != s],
                         [RUNNING, PARTIAL, QUEUED, RUNNING, PARTIAL, APAGADO])

    def test_a_conexao_que_sobe_devolve_a_fila_pelo_portao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                conexao.criar(pedido(ID, LINHA))
                conexao.conexao.fila.mudar(ID, maquina.reservar)  # a Conexão morreu com o Envio rodando e esperando
                conexao.conexao.fila.mudar(ID, lambda estado: estado.update(stage="generate_cards", waiting=dict(ESPERA)))
            with EnvioNoTeste(pasta, espera_do_contato=60.0) as conexao:  # sobe, e espera a extensão antes de pegar o Envio
                time.sleep(0.3)
                estado = conexao.conexao.fila.estado(ID)
        self.assertEqual((estado["status"], estado["stage"], estado.get("waiting")), ("queued", "queued", None))


class OApagadoETerminal(unittest.TestCase):
    def apagado(self, conexao, rodando=False):
        conexao.criar(pedido(ID, LINHA))
        if rodando:
            conexao.conexao.fila.mudar(ID, maquina.reservar)
        apagar_as_frases(conexao)

    def test_tentar_de_novo_um_envio_apagado_e_recusado_com_409_e_nada_e_gravado(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            self.apagado(conexao)
            antes = arquivos_sem_o_log(conexao)
            status, _, corpo = conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})
            depois = arquivos_sem_o_log(conexao)
        self.assertEqual((status, json.loads(corpo)), (409, {"error": "job_wiped"}))
        self.assertEqual(antes, depois)

    def test_a_thread_que_ainda_ia_gravar_a_etapa_nao_tira_o_envio_do_apagado(self):
        # O Apagar tudo chega entre a thread conferir o `wiped` e gravar a etapa: antes ficava `failed` com a etapa `generate_cards`.
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            self.apagado(conexao, rodando=True)
            fila = conexao.conexao.fila
            fila.mudar(ID, lambda estado: estado.update(stage="generate_cards", progress={"done": 0, "total": 1}))
            fila.mudar(ID, lambda estado: estado.update(waiting=dict(ESPERA)))
            fila.mudar(ID, lambda estado: maquina.terminar(estado, COMPLETED))
            estado = fila.estado(ID)
        self.assertEqual((estado["status"], estado["stage"], estado.get("waiting"), estado["wiped"], estado["lastError"], estado["progress"]),
                         ("failed", "failed", None, True, "frases_apagadas", {}))

    def test_o_envio_apagado_nunca_e_reservado_nem_volta_a_fila_quando_a_conexao_sobe(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, trabalhando=False) as conexao:
                self.apagado(conexao, rodando=True)
            with EnvioNoTeste(pasta) as conexao:
                conexao.pedir("POST", "/jobs/list", corpo={})  # a extensão apareceu: a thread pega o que houver na fila
                time.sleep(0.4)
                estado = conexao.conexao.fila.estado(ID)
                pedidos = len(chats(conexao.openai))
        self.assertEqual((estado["status"], estado["stage"], estado["wiped"], pedidos), ("failed", "failed", True, 0))


if __name__ == "__main__":
    unittest.main()
