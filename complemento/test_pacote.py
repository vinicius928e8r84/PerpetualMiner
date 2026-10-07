"""O `.ankiaddon`: o que o Anki encontra ao instalar o arquivo.

    python3.9 complemento/test_pacote.py
"""

import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from complemento import empacotar  # noqa: E402


RAIZ = os.path.dirname(AQUI)
ARQUIVO_NO_PACOTE_DA_EXTENSAO = os.path.join(RAIZ, "conexao", "perpetualminer.ankiaddon")


class ArquivoDoComplemento(unittest.TestCase):
    def empacotado(self, pasta, mod=1700000000):
        destino = empacotar.empacotar(os.path.join(pasta, "perpetualminer.ankiaddon"), mod=mod)
        return zipfile.ZipFile(destino)

    def test_o_manifesto_fica_na_raiz_com_o_pacote_o_nome_e_a_hora_do_empacotamento(self):
        with tempfile.TemporaryDirectory() as pasta:
            pacote = self.empacotado(pasta)
            manifesto = json.loads(pacote.read("manifest.json"))
            pacote.close()
        self.assertEqual(manifesto["package"], "perpetualminer")
        self.assertEqual(manifesto["name"], "PerpetualMiner")
        self.assertEqual(manifesto["mod"], 1700000000)
        self.assertEqual(manifesto["min_point_version"], 50)

    def test_o_arquivo_leva_o_codigo_e_deixa_de_fora_testes_exemplos_dados_e_cache(self):
        dados = os.path.join(AQUI, "user_files")
        existia = os.path.isdir(dados)
        os.makedirs(os.path.join(dados, "logs"), exist_ok=True)
        try:
            with tempfile.TemporaryDirectory() as pasta:
                pacote = self.empacotado(pasta)
                nomes = pacote.namelist()
                pacote.close()
        finally:
            if not existia:
                shutil.rmtree(dados)
        self.assertIn("__init__.py", nomes)
        self.assertIn("servidor.py", nomes)
        for nome in nomes:
            self.assertFalse(nome.startswith(("test_", "contrato/", "user_files/")), "não devia entrar: " + nome)
            self.assertNotIn("__pycache__", nome)
            self.assertNotEqual(nome, "empacotar.py")

    def test_a_chave_guardada_no_computador_nao_vai_no_arquivo_que_sobe_ao_ankiweb(self):
        chave = "sk-proj-GuardadaNoComputador-1234"
        chaves = os.path.join(AQUI, "user_files", "chaves")
        existia = os.path.isdir(os.path.join(AQUI, "user_files"))
        os.makedirs(chaves, exist_ok=True)
        arquivo_da_chave = os.path.join(chaves, "openai.json")
        with open(arquivo_da_chave, "w", encoding="utf-8") as arquivo:
            json.dump({"chave": chave}, arquivo)
        try:
            with tempfile.TemporaryDirectory() as pasta:
                pacote = self.empacotado(pasta)
                conteudo = b"".join(pacote.read(nome) for nome in pacote.namelist())
                pacote.close()
        finally:
            os.remove(arquivo_da_chave)
            if not existia:
                shutil.rmtree(os.path.join(AQUI, "user_files"))
        self.assertNotIn(chave.encode(), conteudo)

    def test_empacotar_numa_copia_limpa_cria_a_pasta_dist_e_o_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            copia = os.path.join(pasta, "complemento")
            shutil.copytree(AQUI, copia, ignore=shutil.ignore_patterns("__pycache__", "user_files"))
            resultado = subprocess.run(
                [sys.executable, os.path.join(copia, "empacotar.py")], cwd=pasta, capture_output=True, text=True
            )
            arquivo = os.path.join(pasta, "dist", "perpetualminer.ankiaddon")
            self.assertEqual(resultado.returncode, 0, resultado.stderr)
            self.assertTrue(zipfile.is_zipfile(arquivo))

    def test_o_codigo_instalado_carrega_pelo_nome_da_pasta_que_o_anki_der_a_ele(self):
        with tempfile.TemporaryDirectory() as pasta:
            pacote = self.empacotado(pasta)
            instalado = os.path.join(pasta, "addons21", "123456789")
            pacote.extractall(instalado)
            pacote.close()
            sys.path.insert(0, os.path.dirname(instalado))
            try:
                inicio = importlib.import_module("123456789.inicio")
                self.assertTrue(callable(inicio.iniciar))
            finally:
                sys.path.remove(os.path.dirname(instalado))
                for nome in [n for n in sys.modules if n == "123456789" or n.startswith("123456789.")]:
                    del sys.modules[nome]


class ArquivoQueVaiNoPacoteDaExtensao(unittest.TestCase):
    """A extensão entrega o `.ankiaddon` num link de download (`conexao/perpetualminer.ankiaddon`, sem
    permissão nova). Ele não pode ficar para trás do código do complemento: quem mexe aqui o refaz com
    `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`."""

    def test_o_arquivo_da_extensao_instala_o_complemento_de_hoje(self):
        self.assertTrue(
            os.path.isfile(ARQUIVO_NO_PACOTE_DA_EXTENSAO),
            "falta conexao/perpetualminer.ankiaddon: python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon",
        )
        with zipfile.ZipFile(ARQUIVO_NO_PACOTE_DA_EXTENSAO) as entregue, tempfile.TemporaryDirectory() as pasta:
            de_hoje = zipfile.ZipFile(empacotar.empacotar(os.path.join(pasta, "hoje.ankiaddon")))
            self.assertEqual(
                sorted(entregue.namelist()), sorted(de_hoje.namelist()),
                "o arquivo da extensão tem outros arquivos: python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon",
            )
            for nome in entregue.namelist():
                if nome == "manifest.json":
                    continue
                self.assertEqual(
                    entregue.read(nome), de_hoje.read(nome),
                    nome + " mudou: python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon",
                )
            manifesto = json.loads(entregue.read("manifest.json"))
            esperado = json.loads(de_hoje.read("manifest.json"))
            for campo in ("package", "name", "min_point_version"):
                self.assertEqual(manifesto[campo], esperado[campo])
            self.assertGreater(manifesto["mod"], 0)
            de_hoje.close()


if __name__ == "__main__":
    unittest.main()
