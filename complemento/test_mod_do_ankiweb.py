"""O `mod` que o AnkiWeb devolveu depois do upload vai para o arquivo da extensão (`versao_no_merge.py --mod-do-ankiweb`, #503).

    python3.9 complemento/test_mod_do_ankiweb.py
"""

import json
import os
import subprocess
import sys
import unittest
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from complemento.test_pacote import CONFERE_A_VERSAO
from complemento.test_versao_no_merge import Casa, EPOCA, ambiente, dar_a_versao, git, ler, mudar_o_codigo, versao_de


class OModDoAnkiWebVaiParaOArquivoDaExtensao(Casa):
    MOD_DO_ANKIWEB = int(EPOCA) + 2956

    def versao_dada(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        self.assertEqual(dar_a_versao(self.repo).returncode, 0)

    def mod_do_arquivo(self):
        with zipfile.ZipFile(os.path.join(self.repo, "conexao", "perpetualminer.ankiaddon")) as pacote:
            return json.loads(pacote.read("manifest.json"))["mod"]

    def test_o_mod_que_o_ankiweb_devolveu_refaz_so_o_arquivo_da_extensao_num_commit(self):
        self.versao_dada()
        versao, registradas = versao_de(self.repo), ler(self.repo, "complemento/versoes.json")
        antes = git(self.repo, "rev-list", "--count", "HEAD")
        resultado = dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.MOD_DO_ANKIWEB))
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertEqual(int(git(self.repo, "rev-list", "--count", "HEAD")), int(antes) + 1)
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s"), "Conexão %s: versão dada no merge: mod do AnkiWeb" % versao)
        self.assertEqual(git(self.repo, "show", "--name-only", "--format=", "HEAD"), "conexao/perpetualminer.ankiaddon")
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        self.assertEqual(self.mod_do_arquivo(), self.MOD_DO_ANKIWEB)
        self.assertEqual(versao_de(self.repo), versao)
        self.assertEqual(ler(self.repo, "complemento/versoes.json"), registradas)

    def test_o_arquivo_refeito_tem_os_bytes_de_um_empacotamento_com_esse_mod(self):
        self.versao_dada()
        dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.MOD_DO_ANKIWEB))
        refeito = os.path.join(self.pasta, "refeito.ankiaddon")
        subprocess.run(
            [sys.executable, os.path.join(self.repo, "complemento", "empacotar.py"), refeito],
            cwd=self.repo, capture_output=True, text=True, check=True, env=ambiente(SOURCE_DATE_EPOCH=str(self.MOD_DO_ANKIWEB)),
        )
        self.assertEqual(ler(self.repo, "conexao/perpetualminer.ankiaddon", "rb"), ler(self.pasta, os.path.basename(refeito), "rb"))

    def test_o_arquivo_refeito_continua_instalando_o_codigo_de_hoje_e_o_mod_nao_volta(self):
        self.versao_dada()
        dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.MOD_DO_ANKIWEB))
        resultado = subprocess.run(
            [sys.executable, "-m", "unittest", "complemento.test_pacote.VersaoDoComplemento." + CONFERE_A_VERSAO,
             "complemento.test_pacote.ArquivoQueVaiNoPacoteDaExtensao"],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(),
        )
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        refeito = os.path.join(self.pasta, "de-novo.ankiaddon")
        subprocess.run([sys.executable, os.path.join(self.repo, "complemento", "empacotar.py"), refeito], cwd=self.repo, check=True, capture_output=True, env=ambiente())
        self.assertEqual(ler(self.repo, "conexao/perpetualminer.ankiaddon", "rb"), ler(self.pasta, os.path.basename(refeito), "rb"))

    def test_com_o_mod_que_o_arquivo_ja_tem_nao_ha_o_que_refazer(self):
        self.versao_dada()
        antes = git(self.repo, "rev-parse", "HEAD")
        resultado = dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.mod_do_arquivo()))
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertIn("nada a fazer", resultado.stdout)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), antes)

    def test_um_mod_anterior_ao_do_arquivo_e_recusado_porque_o_upload_vem_depois_do_empacotamento(self):
        self.versao_dada()
        antes = git(self.repo, "rev-parse", "HEAD")
        resultado = dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.mod_do_arquivo() - 1))
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("--mod-do-ankiweb", resultado.stderr)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), antes)
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")

    def test_com_o_codigo_sem_versao_o_script_recusa_em_vez_de_refazer_o_arquivo(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        antes = git(self.repo, "rev-parse", "HEAD")
        resultado = dar_a_versao(self.repo, "--mod-do-ankiweb", str(self.MOD_DO_ANKIWEB))
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("--mod-do-ankiweb", resultado.stderr)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), antes)
        self.assertEqual(self.mod_do_arquivo(), int(EPOCA))


if __name__ == "__main__":
    unittest.main()
