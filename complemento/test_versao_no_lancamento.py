"""No push da main a versão ainda não foi dada: os 2 testes que a cobram ficam para o commit de versão e para o lançamento.

    python3.9 complemento/test_versao_no_lancamento.py
"""

import os
import subprocess
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from complemento.test_pacote import CONFERE_A_VERSAO
from complemento.test_versao_no_merge import EPOCA, Casa, ambiente, git, mudar_o_codigo


class AVersaoFicaParaOLancamento(Casa):

    TESTES = (
        "complemento.test_pacote.VersaoDoComplemento." + CONFERE_A_VERSAO,
        "complemento.test_pacote.ArquivoQueVaiNoPacoteDaExtensao",
    )

    def uma_pr_de_codigo(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")

    def rodar(self, **extras):
        return subprocess.run(
            [sys.executable, "-m", "unittest", "-v", *self.TESTES],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(**extras),
        )

    def test_no_push_da_main_os_dois_testes_ficam_para_o_lancamento(self):
        self.uma_pr_de_codigo()
        resultado = self.rodar(PM_VERSAO_NO_LANCAMENTO="1")
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        self.assertEqual(resultado.stderr.count("... skipped"), 2, resultado.stderr)
        self.assertIn("conferida no lançamento", resultado.stderr)

    def test_no_lancamento_o_codigo_mudado_sem_versao_falha(self):
        self.uma_pr_de_codigo()
        resultado = self.rodar()
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("python3 complemento/versao_no_merge.py na main", resultado.stderr)

    def test_os_testes_do_commit_de_versao_nao_herdam_o_ambiente_do_push(self):
        self.uma_pr_de_codigo()
        sai_com_3_se_herdou = "import os; raise SystemExit(3 if 'PM_VERSAO_NO_LANCAMENTO' in os.environ else 0)"
        resultado = subprocess.run(
            [sys.executable, os.path.join(self.repo, "complemento", "versao_no_merge.py"), "--testes", '%s -c "%s"' % (sys.executable, sai_com_3_se_herdou)],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(SOURCE_DATE_EPOCH=EPOCA, PM_VERSAO_NO_LANCAMENTO="1"),
        )
        self.assertEqual(resultado.returncode, 0, resultado.stderr)


class OPacoteComOAmbienteDoPush(unittest.TestCase):

    def test_o_test_pacote_inteiro_passa(self):
        resultado = subprocess.run(
            [sys.executable, "-m", "unittest", "complemento.test_pacote"],
            cwd=os.path.dirname(AQUI), capture_output=True, text=True, env=ambiente(PM_VERSAO_NO_LANCAMENTO="1"),
        )
        self.assertEqual(resultado.returncode, 0, resultado.stderr)


if __name__ == "__main__":
    unittest.main()
