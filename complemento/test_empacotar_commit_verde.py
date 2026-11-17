"""A conferência de commit verde do `empacotar.py` (`scripts/ci/commit-verde.js`): ver `docs/commit-verde.md`."""

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

    def _conferir(self, pasta, modo):
        with mock.patch.dict(os.environ, {"PM_COMMIT_VERDE": modo}), mock.patch("sys.stderr", io.StringIO()) as erro:
            return empacotar.conferir_commit_verde(pasta), erro.getvalue()

    def test_commit_sem_tag_de_verde_e_recusado_quando_a_regra_exige(self):
        pasta, _ = self._repositorio()
        passou, _ = self._conferir(pasta, "exigir")
        self.assertFalse(passou)

    def test_commit_sem_tag_de_verde_so_avisa_por_padrao(self):
        pasta, _ = self._repositorio()
        passou, _ = self._conferir(pasta, "avisar")
        self.assertTrue(passou)

    def test_commit_com_tag_de_verde_passa_mesmo_quando_a_regra_exige(self):
        pasta, git = self._repositorio()
        git("tag", "verde/2026-11-17-abcdef0")
        passou, _ = self._conferir(pasta, "exigir")
        self.assertTrue(passou)

    def test_o_programa_recusa_antes_de_escrever_o_pacote_quando_a_regra_exige(self):
        pasta, _ = self._repositorio()
        destino = os.path.join(pasta, "saida", "x.ankiaddon")
        with mock.patch.dict(os.environ, {"PM_COMMIT_VERDE": "exigir", "GIT_DIR": os.path.join(pasta, ".git")}):
            saiu = subprocess.run([sys.executable, empacotar.__file__, destino], capture_output=True, text=True)
        self.assertEqual(saiu.returncode, 1)
        self.assertFalse(os.path.exists(destino))


if __name__ == "__main__":
    unittest.main()
