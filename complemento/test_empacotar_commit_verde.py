"""A conferência de commit verde do `empacotar.py` (`scripts/ci/commit-verde.js`)."""

import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import empacotar


class ConferenciaDoCommitVerde(unittest.TestCase):
    """O `.ankiaddon` só deve sair de um commit que a suíte completa da main marcou com a tag `verde/*`."""

    def _repositorio(self):
        pasta = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, pasta, True)
        git = lambda *args: subprocess.run(["git", "-C", pasta, "-c", "user.name=t", "-c", "user.email=t@t", *args], check=True, capture_output=True)
        git("init", "-q")
        git("commit", "-q", "--allow-empty", "-m", "um")
        return pasta, git

    def _ambiente(self, modo, **mais):
        sem_variavel = {chave: valor for chave, valor in os.environ.items() if chave != "PM_COMMIT_VERDE"}
        if modo:
            sem_variavel["PM_COMMIT_VERDE"] = modo
        return mock.patch.dict(os.environ, {**sem_variavel, **mais}, clear=True)

    def _conferir(self, pasta, modo):
        with self._ambiente(modo), mock.patch("sys.stderr", io.StringIO()) as erro:
            return empacotar.conferir_commit_verde(pasta), erro.getvalue()

    def test_commit_sem_tag_de_verde_e_recusado_por_padrao(self):
        pasta, _ = self._repositorio()
        passou, aviso = self._conferir(pasta, None)
        self.assertFalse(passou)
        self.assertIn("sem registro de verde", aviso)

    def test_commit_sem_tag_de_verde_e_recusado_quando_a_regra_exige(self):
        pasta, _ = self._repositorio()
        passou, _ = self._conferir(pasta, "exigir")
        self.assertFalse(passou)

    def test_commit_sem_tag_de_verde_so_avisa_quando_quem_chama_pede(self):
        pasta, _ = self._repositorio()
        passou, aviso = self._conferir(pasta, "avisar")
        self.assertTrue(passou)
        self.assertIn("sem registro de verde", aviso)

    def test_ignorar_pula_a_conferencia(self):
        pasta, _ = self._repositorio()
        passou, aviso = self._conferir(pasta, "ignorar")
        self.assertTrue(passou)
        self.assertEqual(aviso, "")

    def test_commit_com_tag_de_verde_passa_por_padrao(self):
        pasta, git = self._repositorio()
        git("tag", "verde/2026-11-17-abcdef0")
        passou, _ = self._conferir(pasta, None)
        self.assertTrue(passou)

    def test_arquivo_novo_fora_do_commit_marcado_e_recusado(self):
        pasta, git = self._repositorio()
        git("tag", "verde/2026-11-17-abcdef0")
        shutil.copy(os.path.abspath(__file__), os.path.join(pasta, "arquivo_novo"))
        passou, _ = self._conferir(pasta, None)
        self.assertFalse(passou)

    def test_o_programa_recusa_antes_de_escrever_o_pacote_por_padrao(self):
        pasta, _ = self._repositorio()
        destino = os.path.join(pasta, "saida", "x.ankiaddon")
        with self._ambiente(None, GIT_DIR=os.path.join(pasta, ".git")):
            saiu = subprocess.run([sys.executable, empacotar.__file__, destino], capture_output=True, text=True)
        self.assertEqual(saiu.returncode, 1)
        self.assertFalse(os.path.exists(destino))


if __name__ == "__main__":
    unittest.main()
