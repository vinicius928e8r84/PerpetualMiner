import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import registro


class RegistroTest(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.pasta, True)
        self.logs = os.path.join(self.pasta, "user_files", "logs")
        os.makedirs(self.logs)
        self.logger = registro.criar(self.logs)
        self.addCleanup(lambda: [self.logger.removeHandler(h) or h.close() for h in list(self.logger.handlers)])

    def _abertos(self):
        return [h for h in self.logger.handlers if getattr(h, "stream", None) is not None]

    def test_o_arquivo_do_log_nao_fica_aberto_depois_de_gravar_um_registro(self):
        self.logger.info("um registro")
        self.assertEqual(self._abertos(), [])

    def test_o_arquivo_do_log_nao_fica_aberto_nem_logo_depois_de_criar_o_logger(self):
        self.assertEqual(self._abertos(), [])

    def test_cada_registro_chega_ao_arquivo_mesmo_com_o_arquivo_fechado_entre_eles(self):
        self.logger.info("primeiro")
        self.logger.warning("segundo")
        with open(os.path.join(self.logs, "complemento.log"), encoding="utf-8") as lido:
            texto = lido.read()
        self.assertIn("primeiro", texto)
        self.assertIn("segundo", texto)
        self.assertEqual(self._abertos(), [])

    def test_a_rotacao_continua_e_tambem_deixa_o_arquivo_fechado(self):
        self.logger.info("x" * 1000)
        for _ in range(700):
            self.logger.info("y" * 1000)
        self.assertTrue(os.path.exists(os.path.join(self.logs, "complemento.log.1")))
        self.assertEqual(self._abertos(), [])

    def test_a_pasta_de_user_files_se_remove_inteira_logo_depois_de_gravar_sem_nada_aberto(self):
        self.logger.error("erro qualquer")
        self.assertEqual(self._abertos(), [])
        for h in list(self.logger.handlers):
            self.logger.removeHandler(h)
            h.close()
        shutil.rmtree(os.path.join(self.pasta, "user_files"))
        self.assertFalse(os.path.exists(os.path.join(self.pasta, "user_files")))


if __name__ == "__main__":
    unittest.main()
