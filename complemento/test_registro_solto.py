"""O log da Conexão não fica aberto entre um registro e outro (#501).

No Windows um arquivo aberto em `user_files` impede o `backupUserFiles` do Anki (que renomeia a pasta): o diálogo “Atualizar Extensões” do
próprio Anki falha calado, `PermissionError: [WinError 5]`. Aqui o `backupUserFiles` é o do Anki 2.1.50 (`os.rename` da pasta), com a
regra do Windows posta à mão: renomear uma pasta com um arquivo aberto dentro levanta `PermissionError`.

    python3.9 complemento/test_registro_solto.py
"""

import logging
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import registro


def arquivos_abertos_em(pasta):
    """Os arquivos que este processo mantém abertos dentro de `pasta` (Linux: /proc/self/fd; o que o Windows trancaria)."""
    raiz = os.path.realpath(pasta) + os.sep
    achados = []
    for fd in os.listdir("/proc/self/fd"):
        try:
            alvo = os.path.realpath(os.readlink("/proc/self/fd/" + fd))
        except OSError:
            continue
        if alvo.startswith(raiz):
            achados.append(alvo)
    return achados


class RegistroSoltoTest(unittest.TestCase):
    def setUp(self):
        self._pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self._pasta.cleanup)
        self.addon = os.path.join(self._pasta.name, "1108882947")
        self.logs = os.path.join(self.addon, "user_files", "logs")
        os.makedirs(self.logs)
        self.logger = registro.criar(self.logs)
        self.addCleanup(lambda: [self.logger.removeHandler(h) or h.close() for h in list(self.logger.handlers)])

    def backup_user_files_do_anki_2150_no_windows(self):
        """`aqt.addons.AddonManager.backupUserFiles`: renomeia `user_files` para `files_backup`; o Windows recusa com um arquivo aberto dentro."""
        origem = os.path.join(self.addon, "user_files")
        destino = os.path.join(self.addon, "files_backup")
        if arquivos_abertos_em(origem):
            raise PermissionError(5, "Acesso negado", origem, None, destino)
        os.rename(origem, destino)

    @unittest.skipUnless(os.path.isdir("/proc/self/fd"), "a conferência dos arquivos abertos lê /proc")
    def test_depois_de_gravar_no_log_o_backup_do_user_files_do_anki_passa(self):
        self.logger.info("o Anki abriu e a Conexão registrou")
        self.logger.warning("As funções do Anki que a atualização usa mudaram: fica o diálogo do Anki")
        self.backup_user_files_do_anki_2150_no_windows()
        with open(os.path.join(self.addon, "files_backup", "logs", "complemento.log"), encoding="utf-8") as lido:
            texto = lido.read()
        self.assertIn("o Anki abriu", texto)
        self.assertIn("fica o diálogo do Anki", texto)

    def test_nenhum_handler_de_arquivo_segura_o_arquivo_entre_um_registro_e_outro(self):
        self.logger.info("um")
        self.logger.error("dois")
        abertos = [h for h in self.logger.handlers if getattr(h, "stream", None) is not None]
        self.assertEqual(abertos, [])

    def test_o_log_continua_acumulando_os_registros_na_ordem(self):
        for numero in range(5):
            self.logger.info("registro %d", numero)
        with open(os.path.join(self.logs, "complemento.log"), encoding="utf-8") as lido:
            linhas = [linha.split(" INFO ", 1)[1].strip() for linha in lido]
        self.assertEqual(linhas, ["registro %d" % n for n in range(5)])

    def test_a_rotacao_por_tamanho_continua_e_tambem_nao_deixa_nada_aberto(self):
        for handler in self.logger.handlers:
            handler.maxBytes = 200
        for numero in range(20):
            self.logger.info("registro comprido o bastante para girar o arquivo %d", numero)
        self.assertTrue(os.path.exists(os.path.join(self.logs, "complemento.log.1")))
        self.assertEqual([h for h in self.logger.handlers if getattr(h, "stream", None) is not None], [])

    def test_um_erro_de_disco_ao_gravar_nao_sai_para_o_anki(self):
        with mock.patch.object(logging.FileHandler, "_open", side_effect=PermissionError("trancado")):
            self.logger.info("sem lugar para gravar")

    def test_um_log_que_nao_abre_devolve_o_logger_silencioso(self):
        pasta = os.path.join(self._pasta.name, "outra")
        os.makedirs(os.path.join(pasta, "complemento.log"))
        for handler in list(self.logger.handlers):
            self.logger.removeHandler(handler)
            handler.close()
        logger = registro.criar(pasta)
        self.assertEqual([h for h in logger.handlers if isinstance(h, logging.FileHandler)], [])
        self.assertTrue(all(isinstance(h, logging.NullHandler) for h in logger.handlers))


if __name__ == "__main__":
    unittest.main()
