import json
import os
import sys
import unittest
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from complemento import test_versao_no_merge as base  # noqa: E402
from complemento import versao_no_merge  # noqa: E402


class VersaoRespeitaOsLimites(base.Casa):

    def pedir(self, reservadas, *argumentos):
        base.escrever(self.repo, "complemento/versoes-reservadas.json", json.dumps(reservadas) + "\n")
        base.mudar_o_codigo(self.repo)
        base.git(self.repo, "commit", "-qam", "uma PR de Conexão")
        antes = base.git(self.repo, "rev-parse", "HEAD")
        resultado = base.dar_a_versao(self.repo, *argumentos)
        self.assertNotEqual(resultado.returncode, 0, resultado.stdout)
        self.assertEqual(base.git(self.repo, "rev-parse", "HEAD"), antes)
        self.assertEqual(base.git(self.repo, "status", "--porcelain"), "")
        return resultado.stderr

    def test_versao_nao_passa_por_baixo_do_teto_de_acima_de(self):
        prometida, teto = base.a_frente(self.repo, 1), base.a_frente(self.repo, 3)
        erro = self.pedir([prometida], "--versao", prometida, "--acima-de", teto)
        self.assertIn(prometida, erro)
        self.assertIn(teto, erro)

    def test_versao_acima_do_teto_de_acima_de_e_dada(self):
        prometida, teto = base.a_frente(self.repo, 5), base.a_frente(self.repo, 3)
        base.escrever(self.repo, "complemento/versoes-reservadas.json", json.dumps([prometida]) + "\n")
        base.mudar_o_codigo(self.repo)
        base.git(self.repo, "commit", "-qam", "uma PR de Conexão")
        resultado = base.dar_a_versao(self.repo, "--versao", prometida, "--acima-de", teto)
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertEqual(base.versao_de(self.repo), prometida)

    def test_versao_recusa_um_numero_abaixo_do_maior_ja_registrado(self):
        baixa, publicada = base.a_frente(self.repo, 1), base.a_frente(self.repo, 3)
        registradas = json.loads(base.ler(self.repo, "complemento/versoes.json"))
        registradas[publicada] = "f" * 64
        base.escrever(self.repo, "complemento/versoes.json", json.dumps(registradas, indent=2) + "\n")
        erro = self.pedir([baixa], "--versao", baixa)
        self.assertIn(baixa, erro)
        self.assertIn(publicada, erro)


class RecusaDaVersaoPedida(unittest.TestCase):

    def recusa(self, pedida, reservadas, registradas, acima_de=None):
        with mock.patch.object(versao_no_merge, "reservadas", return_value=reservadas):
            return versao_no_merge.recusa_da_versao_pedida(pedida, registradas, acima_de)

    def test_numero_reservado_acima_do_maior_registrado_nao_e_recusado(self):
        self.assertIsNone(self.recusa("0.4.12", ["0.4.12"], {"0.4.9": "a", "0.4.10": "b"}))

    def test_numero_fora_da_lista_de_reservadas_e_recusado(self):
        self.assertIn("versoes-reservadas.json", self.recusa("0.4.12", [], {"0.4.10": "b"}))

    def test_numero_ja_registrado_e_recusado(self):
        self.assertIn("versoes-reservadas.json", self.recusa("0.4.10", ["0.4.10"], {"0.4.10": "b"}))

    def test_numero_abaixo_do_maior_registrado_e_comparado_como_numero(self):
        self.assertIn("0.4.10", self.recusa("0.4.9", ["0.4.9"], {"0.4.10": "b"}))

    def test_numero_no_teto_de_acima_de_e_recusado(self):
        self.assertIn("--acima-de 0.4.12", self.recusa("0.4.12", ["0.4.12"], {"0.4.10": "b"}, "0.4.12"))


if __name__ == "__main__":
    unittest.main()
