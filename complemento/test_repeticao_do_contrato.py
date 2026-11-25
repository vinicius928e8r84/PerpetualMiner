import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_estado_guardado import PedidoFeito, confere_a_repeticao


class RepeticaoDoContrato(unittest.TestCase):
    EXEMPLO = {"nome": "ligar", "resposta": {"status": 200, "json": {"ok": True, "em": "<agora>"}}}
    GUARDADO = {"arquivos": {"a": b"1"}, "nuvem": {}}
    PRIMEIRO = PedidoFeito((200, {}, b""), GUARDADO)

    def segundo(self, status=200, corpo=b'{"ok": true, "em": "2026-10-12T10:00:00Z"}', guardado=GUARDADO):
        return PedidoFeito((status, {}, corpo), guardado)

    def test_resposta_igual_salvo_o_instante_e_estado_igual_passa(self):
        confere_a_repeticao(self, self.EXEMPLO, self.PRIMEIRO, self.segundo())

    def test_outra_resposta_sem_a_excecao_declarada_acusa_e_diz_como_declarar(self):
        with self.assertRaisesRegex(AssertionError, "repetivel"):
            confere_a_repeticao(self, self.EXEMPLO, self.PRIMEIRO, self.segundo(corpo=b'{"ok": false, "em": "2026-10-12T10:00:00Z"}'))

    def test_outro_status_sem_a_excecao_declarada_acusa(self):
        with self.assertRaisesRegex(AssertionError, "status"):
            confere_a_repeticao(self, self.EXEMPLO, self.PRIMEIRO, self.segundo(status=409))

    def test_estado_guardado_que_muda_sem_a_excecao_declarada_acusa(self):
        with self.assertRaisesRegex(AssertionError, "guardou"):
            confere_a_repeticao(self, self.EXEMPLO, self.PRIMEIRO, self.segundo(guardado={"arquivos": {"a": b"2"}, "nuvem": {}}))

    def test_a_excecao_declarada_com_motivo_e_que_de_fato_muda_algo_passa(self):
        exemplo = dict(self.EXEMPLO, repetivel=False, porque="a versão sobe")
        confere_a_repeticao(self, exemplo, self.PRIMEIRO, self.segundo(status=409))

    def test_a_excecao_sem_motivo_acusa(self):
        with self.assertRaisesRegex(AssertionError, "porque"):
            confere_a_repeticao(self, dict(self.EXEMPLO, repetivel=False), self.PRIMEIRO, self.segundo(status=409))

    def test_a_excecao_que_repetida_nao_muda_nada_acusa_que_esta_velha(self):
        exemplo = dict(self.EXEMPLO, repetivel=False, porque="a versão sobe")
        with self.assertRaisesRegex(AssertionError, "tire a exceção"):
            confere_a_repeticao(self, exemplo, self.PRIMEIRO, self.segundo())


if __name__ == "__main__":
    unittest.main()
