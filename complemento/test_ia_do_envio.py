"""A porta da IA dos cartões presa a um Envio (C4), sem o Envio: quem paga com o Usar a minha chave lido a cada pedido, e o teto do mês e o
limite do plano vistos pela porta. O lado do Envio de cada espera é um roteiro; o caminho inteiro está em `test_limite_do_plano.py` e
`test_teto_do_mes.py`.

    python3.9 complemento/test_ia_do_envio.py
"""

import logging
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.ia_do_envio import IaDoEnvio, SemQuemPague
from complemento.modelo_dos_cartoes import CHAVE, PARADO, PLANO, Pagador

LOGGER = logging.getLogger("test_ia_do_envio")
LOGGER.addHandler(logging.NullHandler())
LOGGER.propagate = False


class EsperaDeRoteiro:
    """O lado do Envio das esperas: guarda o que a porta disse e esperou; `pela_chave` é o Usar a minha chave de cada leitura."""

    job_id = "j1"

    def __init__(self, *pela_chave):
        self.feito, self.leituras = [], list(pela_chave) or [False]

    def pela_chave(self):
        return self.leituras.pop(0) if len(self.leituras) > 1 else self.leituras[0]

    def limpar_o_despertador(self):
        self.feito.append("limpar")

    def dizer(self, espera):
        self.feito.append(("dizer", espera))

    def esperar(self, espera, segundos):
        self.feito.append(("esperar", espera, segundos))


class IaDeRoteiro:
    """A `IaDosCartoes` de um teste: o pagador do texto é o de `pagadores` por ordem; guarda o Usar a minha chave de cada pedido."""

    def __init__(self, *pagadores):
        self.pagadores, self.pedidos = list(pagadores), []

    def para_o_texto(self, pela_chave=False):
        self.pedidos.append(("texto", pela_chave))
        return self.pagadores.pop(0)

    def pedido_do_texto(self, pagador, config, etapa="texto"):
        return lambda sistema, mensagem, rotulo: (pagador.quem, etapa)

    def para_a_imagem(self, pela_chave=False):
        self.pedidos.append(("imagem", pela_chave))
        return "juiz", "presa"


class TetoDeRoteiro:
    def __init__(self, *chegou):
        self.respostas = list(chegou)

    def chegou(self):
        return self.respostas.pop(0)


class QuemPaga(unittest.TestCase):
    def test_o_usar_a_minha_chave_e_lido_do_envio_a_cada_pedido_do_texto_e_da_imagem(self):
        ia = IaDeRoteiro(Pagador(PLANO, {}, None), Pagador(CHAVE, {}, None))
        porta = IaDoEnvio(ia, EsperaDeRoteiro(False, True, True), LOGGER)
        primeiro = porta.pedido_do_texto({})("s", "m", "1-0")
        segundo = porta.pedido_do_texto({}, "correcao")("s", "m", "1-0")
        porta.para_a_imagem()
        self.assertEqual((primeiro, segundo), ((PLANO, "texto"), (CHAVE, "correcao")))
        self.assertEqual(ia.pedidos, [("texto", False), ("texto", True), ("imagem", True)])

    def test_sem_quem_pague_o_texto_a_porta_levanta_o_motivo_e_nao_monta_o_pedido(self):
        porta = IaDoEnvio(IaDeRoteiro(Pagador(PARADO, None, "openai_key_missing")), EsperaDeRoteiro(), LOGGER)
        with self.assertRaises(SemQuemPague) as parado:
            porta.pedido_do_texto({})
        self.assertEqual(parado.exception.codigo, "openai_key_missing")


class AsEsperasPelaPorta(unittest.TestCase):
    def test_no_teto_a_porta_espera_ate_ele_deixar_de_valer_e_depois_o_estado_deixa_de_dizer_que_espera(self):
        espera = EsperaDeRoteiro()
        IaDoEnvio(IaDeRoteiro(), espera, LOGGER, teto=TetoDeRoteiro(True, True, False), espera_do_teto=7).conferir_o_teto()
        no_teto = ("esperar", {"reason": "monthly_cap"}, 7)
        self.assertEqual(espera.feito, ["limpar", no_teto, "limpar", no_teto, "limpar", ("dizer", None)])

    def test_abaixo_do_teto_ou_sem_teto_nada_espera_nem_muda_no_estado(self):
        abaixo, sem_teto = EsperaDeRoteiro(), EsperaDeRoteiro()
        IaDoEnvio(IaDeRoteiro(), abaixo, LOGGER, teto=TetoDeRoteiro(False)).conferir_o_teto()
        IaDoEnvio(IaDeRoteiro(), sem_teto, LOGGER).conferir_o_teto()
        self.assertEqual((abaixo.feito, sem_teto.feito), (["limpar"], []))

    def test_o_plano_no_limite_e_uma_espera_que_o_estado_diz_e_dura_a_espera_do_plano(self):
        espera = EsperaDeRoteiro()
        IaDoEnvio(IaDeRoteiro(), espera, LOGGER, espera_do_plano=11).esperar_o_plano()
        self.assertEqual(espera.feito, ["limpar", ("esperar", {"reason": "plan_limit"}, 11)])

    def test_sem_esperas_dadas_o_teto_e_conferido_a_cada_60_s_e_o_plano_espera_300_s(self):
        no_teto, no_plano = EsperaDeRoteiro(), EsperaDeRoteiro()
        IaDoEnvio(IaDeRoteiro(), no_teto, LOGGER, teto=TetoDeRoteiro(True, False)).conferir_o_teto()
        IaDoEnvio(IaDeRoteiro(), no_plano, LOGGER).esperar_o_plano()
        self.assertEqual((no_teto.feito[1], no_plano.feito[1]), (("esperar", {"reason": "monthly_cap"}, 60), ("esperar", {"reason": "plan_limit"}, 300)))


if __name__ == "__main__":
    unittest.main()
