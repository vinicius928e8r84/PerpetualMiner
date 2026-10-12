"""O `.ankiaddon`: o que o Anki encontra ao instalar o arquivo.

    python3.9 complemento/test_pacote.py
"""

import importlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from complemento import configuracao, empacotar  # noqa: E402


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

    def test_dois_empacotamentos_do_mesmo_codigo_dao_os_mesmos_bytes(self):
        servidor = os.path.join(AQUI, "servidor.py")
        horas = os.stat(servidor)
        with tempfile.TemporaryDirectory() as pasta:
            primeiro = empacotar.empacotar(os.path.join(pasta, "a.ankiaddon"), mod=1700000000)
            try:
                os.utime(servidor, (horas.st_atime, horas.st_mtime + 3600))
                segundo = empacotar.empacotar(os.path.join(pasta, "b.ankiaddon"), mod=1700000000)
            finally:
                os.utime(servidor, (horas.st_atime, horas.st_mtime))
            with open(primeiro, "rb") as a, open(segundo, "rb") as b:
                self.assertEqual(a.read(), b.read())
            with zipfile.ZipFile(primeiro) as pacote:
                for entrada in pacote.infolist():
                    self.assertEqual(entrada.date_time, empacotar.DATA_FIXA, entrada.filename)
                    self.assertEqual(entrada.create_system, empacotar.SISTEMA_FIXO, entrada.filename)
                    self.assertEqual(entrada.external_attr, empacotar.PERMISSOES_FIXAS, entrada.filename)


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


CONFERE_A_VERSAO = "test_as_fontes_de_hoje_sao_as_que_a_versao_do_complemento_registrou"


class VersaoDoComplemento(unittest.TestCase):
    """`versoes.json` guarda o hash das fontes do pacote (comentários inclusos: são bytes que o Anki instala) por `VERSAO`.
    Mudou o código sem subir a versão, o teste falha; subiu a versão, ela entra no arquivo com o hash novo."""

    def test_as_fontes_de_hoje_sao_as_que_a_versao_do_complemento_registrou(self):
        with open(os.path.join(AQUI, "versoes.json"), encoding="utf-8") as arquivo:
            registradas = json.load(arquivo)
        hoje = empacotar.hash_das_fontes()
        if configuracao.VERSAO not in registradas:
            self.fail(
                "a VERSAO %s não está em complemento/versoes.json: registre-a com o hash das fontes, %s"
                % (configuracao.VERSAO, hoje)
            )
        self.assertEqual(
            registradas[configuracao.VERSAO], hoje,
            "as fontes do complemento mudaram e a VERSAO continua %s: suba a VERSAO em complemento/configuracao.py "
            "e registre-a em complemento/versoes.json com o hash %s" % (configuracao.VERSAO, hoje),
        )

    def rodar_numa_copia(self, mudar):
        with tempfile.TemporaryDirectory() as pasta:
            copia = os.path.join(pasta, "complemento")
            shutil.copytree(AQUI, copia, ignore=shutil.ignore_patterns("__pycache__", "user_files"))
            mudar(copia)
            return subprocess.run(
                [sys.executable, "-m", "unittest", "complemento.test_pacote.VersaoDoComplemento." + CONFERE_A_VERSAO],
                cwd=pasta, capture_output=True, text=True,
            )

    def test_mudar_um_arquivo_do_pacote_sem_subir_a_versao_falha_pedindo_para_subi_la(self):
        def acrescentar_um_comentario(copia):
            with open(os.path.join(copia, "servidor.py"), "a", encoding="utf-8") as arquivo:
                arquivo.write("# um comentário também muda o que o Anki instala\n")

        resultado = self.rodar_numa_copia(acrescentar_um_comentario)
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("suba a VERSAO", resultado.stderr)

    def test_subir_a_versao_sem_registrar_o_hash_falha_dizendo_o_hash(self):
        def subir(copia):
            caminho = os.path.join(copia, "configuracao.py")
            with open(caminho, encoding="utf-8") as arquivo:
                codigo = arquivo.read()
            with open(caminho, "w", encoding="utf-8") as arquivo:
                arquivo.write(codigo.replace(configuracao.VERSAO, "9.9.9"))

        resultado = self.rodar_numa_copia(subir)
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("a VERSAO 9.9.9 não está em complemento/versoes.json", resultado.stderr)

    def test_subir_a_versao_e_registrar_o_hash_passa(self):
        def subir_e_registrar(copia):
            caminho = os.path.join(copia, "configuracao.py")
            with open(caminho, encoding="utf-8") as arquivo:
                codigo = arquivo.read()
            with open(caminho, "w", encoding="utf-8") as arquivo:
                arquivo.write(codigo.replace(configuracao.VERSAO, "9.9.9"))
            hash_novo = subprocess.run(
                [sys.executable, "-c", "from complemento import empacotar; print(empacotar.hash_das_fontes())"],
                cwd=os.path.dirname(copia), capture_output=True, text=True, check=True,
            ).stdout.strip()
            with open(os.path.join(copia, "versoes.json"), "w", encoding="utf-8") as arquivo:
                json.dump({configuracao.VERSAO: "x", "9.9.9": hash_novo}, arquivo)

        resultado = self.rodar_numa_copia(subir_e_registrar)
        self.assertEqual(resultado.returncode, 0, resultado.stderr)

    def test_o_arquivo_de_versoes_nao_entra_no_pacote_nem_no_hash(self):
        with tempfile.TemporaryDirectory() as pasta:
            antes = empacotar.hash_das_fontes()
            nomes = zipfile.ZipFile(empacotar.empacotar(os.path.join(pasta, "a.ankiaddon"))).namelist()
        self.assertNotIn("versoes.json", nomes)
        self.assertEqual(antes, empacotar.hash_das_fontes())


class HoraDoEmpacotamento(unittest.TestCase):
    """Rodado duas vezes sem `mod=` nem variável, o script dá os mesmos bytes: o `mod` só sobe quando o código muda."""

    def setUp(self):
        self.pasta = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.pasta)
        self.copia = os.path.join(self.pasta, "complemento")
        shutil.copytree(AQUI, self.copia, ignore=shutil.ignore_patterns("__pycache__", "user_files"))
        os.makedirs(os.path.join(self.pasta, "conexao"))
        self.entregue = os.path.join(self.pasta, "conexao", "perpetualminer.ankiaddon")
        shutil.copy(ARQUIVO_NO_PACOTE_DA_EXTENSAO, self.entregue)
        with zipfile.ZipFile(self.entregue) as pacote:
            self.mod_entregue = json.loads(pacote.read("manifest.json"))["mod"]

    def empacotar(self, nome, **variaveis):
        ambiente = {k: v for k, v in os.environ.items() if k != "SOURCE_DATE_EPOCH"}
        ambiente.update(variaveis)
        destino = os.path.join(self.pasta, nome)
        resultado = subprocess.run(
            [sys.executable, os.path.join(self.copia, "empacotar.py"), destino],
            cwd=self.pasta, capture_output=True, text=True, env=ambiente,
        )
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        with open(destino, "rb") as arquivo:
            return arquivo.read()

    def mudar_o_codigo(self):
        shutil.copy(os.path.join(self.copia, "registro.py"), os.path.join(self.copia, "servidor.py"))

    def mod_de(self, bytes_do_pacote):
        with zipfile.ZipFile(io.BytesIO(bytes_do_pacote)) as pacote:
            return json.loads(pacote.read("manifest.json"))["mod"]

    def test_rodado_duas_vezes_sem_variavel_da_os_mesmos_bytes(self):
        primeiro = self.empacotar("a.ankiaddon")
        time.sleep(1.1)
        segundo = self.empacotar("b.ankiaddon")
        self.assertEqual(primeiro, segundo)

    def test_o_codigo_igual_ao_arquivo_da_extensao_guarda_o_mod_dele(self):
        self.assertEqual(self.mod_de(self.empacotar("a.ankiaddon")), self.mod_entregue)

    def test_mudou_o_codigo_o_mod_sobe_para_a_hora_do_empacotamento(self):
        self.mudar_o_codigo()
        antes = int(time.time())
        novo = self.mod_de(self.empacotar("a.ankiaddon"))
        self.assertGreaterEqual(novo, antes)
        self.assertGreater(novo, self.mod_entregue)

    def test_sem_arquivo_da_extensao_o_mod_e_a_hora_do_empacotamento(self):
        os.remove(self.entregue)
        antes = int(time.time())
        self.assertGreaterEqual(self.mod_de(self.empacotar("a.ankiaddon")), antes)

    def test_source_date_epoch_fixa_o_mod(self):
        fixo = self.empacotar("a.ankiaddon", SOURCE_DATE_EPOCH="1700000000")
        self.assertEqual(self.mod_de(fixo), 1700000000)
        self.mudar_o_codigo()
        self.assertEqual(self.mod_de(self.empacotar("b.ankiaddon", SOURCE_DATE_EPOCH="1700000000")), 1700000000)


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
