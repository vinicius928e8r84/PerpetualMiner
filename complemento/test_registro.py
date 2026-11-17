"""O registro da Conexão não segura o arquivo de log: no Windows um arquivo aberto não se apaga, e o Remover da extensão ficava pela metade (#502).

    python3.9 complemento/test_registro.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import registro


def aberto(caminho):
    """Se este processo mantém o arquivo aberto: pela tabela de descritores onde há, e senão pela troca de nome, que o Windows recusa."""
    descritores = "/proc/self/fd"
    if os.path.isdir(descritores):
        alvo = os.path.realpath(caminho)
        return any(os.path.realpath(os.path.join(descritores, fd)) == alvo for fd in os.listdir(descritores))
    try:
        os.replace(caminho, caminho + ".troca")
    except OSError:
        return True
    os.replace(caminho + ".troca", caminho)
    return False


class OLogNaoSegura(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp()
        self.arquivo = os.path.join(self.pasta, "complemento.log")
        self.logger = registro.criar(self.pasta)
        self.addCleanup(registro.silencioso)

    def test_logo_depois_de_criado_o_arquivo_nao_esta_aberto(self):
        self.assertFalse(aberto(self.arquivo))

    def test_depois_de_gravar_o_arquivo_nao_fica_aberto(self):
        self.logger.info("uma linha")
        self.logger.error("outra linha")
        self.assertFalse(aberto(self.arquivo))

    def test_o_que_foi_gravado_continua_no_arquivo(self):
        self.logger.info("primeira")
        self.logger.info("segunda")
        with open(self.arquivo, encoding="utf-8") as lido:
            texto = lido.read()
        self.assertIn("primeira", texto)
        self.assertIn("segunda", texto)

    def test_a_pasta_com_o_log_pode_ser_apagada_com_a_conexao_no_ar(self):
        self.logger.info("uma linha")
        os.remove(self.arquivo)
        self.logger.info("depois de apagado")
        self.assertTrue(os.path.exists(self.arquivo))


if __name__ == "__main__":
    unittest.main()
