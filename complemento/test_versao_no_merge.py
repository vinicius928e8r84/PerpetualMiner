"""A versão da Conexão é dada na hora do merge, num commit só (`versao_no_merge.py`).

    python3.9 complemento/test_versao_no_merge.py
"""

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

from complemento import configuracao, empacotar, versao_no_merge  # noqa: E402
from complemento.test_pacote import CONFERE_A_VERSAO, copiar_o_complemento  # noqa: E402

RAIZ = os.path.dirname(AQUI)
EPOCA = "1700000000"
ARQUIVOS_DA_VERSAO = (
    "complemento/configuracao.py",
    "complemento/versoes.json",
    "complemento/contrato/exemplos.json",
    "complemento/contrato/exemplos-da-atualizacao.json",
    "complemento/contrato/exemplos-do-diagnostico.json",
    "conexao/perpetualminer.ankiaddon",
)


def ambiente(**extra):
    """O ambiente de quem roda o CI de uma PR leva `PM_VERSAO_BASE`; as cópias daqui escolhem o seu."""
    return dict({k: v for k, v in os.environ.items() if k not in ("PM_VERSAO_BASE", "SOURCE_DATE_EPOCH")}, **extra)


def git(pasta, *args):
    return subprocess.run(["git", "-C", pasta, *args], capture_output=True, text=True, check=True).stdout.strip()


def ler(pasta, relativo, modo="r"):
    with open(os.path.join(pasta, *relativo.split("/")), modo, **({} if "b" in modo else {"encoding": "utf-8"})) as arquivo:
        return arquivo.read()


def escrever(pasta, relativo, texto):
    with open(os.path.join(pasta, *relativo.split("/")), "w", encoding="utf-8", newline="") as arquivo:
        arquivo.write(texto)


def mudar_o_codigo(pasta):
    """O que uma PR de Conexão faz sem mexer na versão: muda um arquivo do pacote (um comentário basta)."""
    with open(os.path.join(pasta, "complemento", "modelo_da_criacao.js"), "a", encoding="utf-8", newline="") as arquivo:
        arquivo.write("// um comentário também muda o que o Anki instala\n")


def repositorio(pasta):
    """Uma cópia do repositório (complemento, engine e o arquivo da extensão) com um commit só."""
    copiar_o_complemento(pasta)
    os.makedirs(os.path.join(pasta, "conexao"))
    shutil.copy(os.path.join(RAIZ, "conexao", "perpetualminer.ankiaddon"), os.path.join(pasta, "conexao"))
    for oculto in (".gitattributes", ".gitignore"):
        shutil.copy(os.path.join(RAIZ, oculto), pasta)
    escrever(pasta, "complemento/versoes-reservadas.json", "[]\n")
    git(pasta, "init", "-q", "-b", "main")
    git(pasta, "config", "user.email", "versao@teste")
    git(pasta, "config", "user.name", "versao")
    git(pasta, "add", ".")
    git(pasta, "commit", "-q", "-m", "a main")
    return pasta


def proxima_depois(versao):
    *resto, patch = versao.split(".")
    return ".".join(resto + [str(int(patch) + 1)])


def dar_a_versao(pasta, *argumentos, **extras):
    return subprocess.run(
        [sys.executable, os.path.join(pasta, "complemento", "versao_no_merge.py"), "--sem-testes", *argumentos],
        cwd=pasta, capture_output=True, text=True, env=ambiente(SOURCE_DATE_EPOCH=EPOCA, **extras),
    )


class Casa(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.pasta)
        self.repo = repositorio(self.pasta)


class QuemMudouOCodigoRecebeAProximaVersao(Casa):

    def test_o_codigo_mudou_e_o_script_da_a_proxima_versao_num_commit_so(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        antes = git(self.repo, "rev-list", "--count", "HEAD")
        velha = configuracao.VERSAO
        nova = proxima_depois(velha)
        resultado = dar_a_versao(self.repo)
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertEqual(int(git(self.repo, "rev-list", "--count", "HEAD")), int(antes) + 1)
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s"), "Conexão %s: versão dada no merge" % nova)
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        self.assertIn('VERSAO = "%s"' % nova, ler(self.repo, "complemento/configuracao.py"))
        for exemplo in ("exemplos", "exemplos-da-atualizacao", "exemplos-do-diagnostico"):
            texto = ler(self.repo, "complemento/contrato/%s.json" % exemplo)
            self.assertNotIn('"%s"' % velha, texto)
            self.assertIn('"%s"' % nova, texto)
        mudados = set(git(self.repo, "show", "--name-only", "--format=", "HEAD").splitlines())
        self.assertEqual(mudados, set(ARQUIVOS_DA_VERSAO))

    def test_o_commit_de_versao_passa_nos_testes_que_cobram_o_pacote_e_o_hash(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        self.assertEqual(dar_a_versao(self.repo).returncode, 0)
        resultado = subprocess.run(
            [sys.executable, "-m", "unittest", "complemento.test_pacote.VersaoDoComplemento." + CONFERE_A_VERSAO,
             "complemento.test_pacote.ArquivoQueVaiNoPacoteDaExtensao"],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(),
        )
        self.assertEqual(resultado.returncode, 0, resultado.stderr)

    def test_o_hash_registrado_e_o_das_fontes_e_o_arquivo_da_extensao_leva_a_hora_pedida(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        dar_a_versao(self.repo)
        registradas = json.loads(ler(self.repo, "complemento/versoes.json"))
        nova = proxima_depois(configuracao.VERSAO)
        hash_das_fontes = subprocess.run(
            [sys.executable, "-c", "from complemento import empacotar; print(empacotar.hash_das_fontes())"],
            cwd=self.repo, capture_output=True, text=True, check=True,
        ).stdout.strip()
        self.assertEqual(registradas[nova], hash_das_fontes)
        with zipfile.ZipFile(os.path.join(self.repo, "conexao", "perpetualminer.ankiaddon")) as pacote:
            self.assertEqual(json.loads(pacote.read("manifest.json"))["mod"], int(EPOCA))

    def test_o_pacote_e_o_mesmo_que_o_fluxo_de_hoje_gera_para_a_mesma_versao_byte_a_byte(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        velha = configuracao.VERSAO
        nova = proxima_depois(velha)
        with tempfile.TemporaryDirectory() as outra:
            # O fluxo de hoje, à mão: sobe a VERSAO, troca o número nos exemplos, registra o hash e refaz o arquivo.
            a_mao = repositorio(outra)
            mudar_o_codigo(a_mao)
            codigo = ler(a_mao, "complemento/configuracao.py")
            escrever(a_mao, "complemento/configuracao.py", codigo.replace('VERSAO = "%s"' % velha, 'VERSAO = "%s"' % nova))
            for exemplo in ("exemplos", "exemplos-da-atualizacao", "exemplos-do-diagnostico"):
                caminho = "complemento/contrato/%s.json" % exemplo
                escrever(a_mao, caminho, ler(a_mao, caminho).replace('"%s"' % velha, '"%s"' % nova))
            hash_novo = subprocess.run(
                [sys.executable, "-c", "from complemento import empacotar; print(empacotar.hash_das_fontes())"],
                cwd=a_mao, capture_output=True, text=True, check=True,
            ).stdout.strip()
            registradas = ler(a_mao, "complemento/versoes.json")
            escrever(a_mao, "complemento/versoes.json", registradas[:-len("\n}\n")] + ',\n  "%s": "%s"\n}\n' % (nova, hash_novo))
            subprocess.run(
                [sys.executable, os.path.join(a_mao, "complemento", "empacotar.py"), os.path.join(a_mao, "conexao", "perpetualminer.ankiaddon")],
                cwd=a_mao, capture_output=True, text=True, check=True, env=ambiente(SOURCE_DATE_EPOCH=EPOCA),
            )
            self.assertEqual(dar_a_versao(self.repo).returncode, 0)
            for relativo in ARQUIVOS_DA_VERSAO:
                self.assertEqual(ler(self.repo, relativo, "rb"), ler(a_mao, relativo, "rb"), relativo)

    def test_sem_mudanca_no_codigo_nao_ha_o_que_versionar(self):
        resultado = dar_a_versao(self.repo)
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertIn("nada a fazer", resultado.stdout)
        self.assertEqual(git(self.repo, "rev-list", "--count", "HEAD"), "1")

    def test_depois_de_dada_a_versao_rodar_de_novo_nao_faz_outro_commit(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        dar_a_versao(self.repo)
        segundo = dar_a_versao(self.repo)
        self.assertEqual(segundo.returncode, 0, segundo.stdout + segundo.stderr)
        self.assertEqual(git(self.repo, "rev-list", "--count", "HEAD"), "3")

    def test_a_sequencia_continua_do_maior_numero_de_versoes_json(self):
        registradas = json.loads(ler(self.repo, "complemento/versoes.json"))
        registradas["0.4.33"] = "f" * 64  # a PR que chegou antes e já leva o seu número
        escrever(self.repo, "complemento/versoes.json", json.dumps(registradas, indent=2) + "\n")
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR com número")
        resultado = dar_a_versao(self.repo)
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
        self.assertIn('VERSAO = "0.4.34"', ler(self.repo, "complemento/configuracao.py"))

    def test_acima_de_reserva_os_numeros_que_as_prs_abertas_ja_levam(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        self.assertEqual(dar_a_versao(self.repo, "--acima-de", "0.4.40").returncode, 0)
        self.assertIn('VERSAO = "0.4.41"', ler(self.repo, "complemento/configuracao.py"))

    def test_os_numeros_reservados_nunca_sao_dados_sem_precisar_de_bandeira(self):
        escrever(self.repo, "complemento/versoes-reservadas.json", '["0.4.28", "0.4.32", "0.4.33", "0.4.34"]\n')
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão, com PRs abertas que já levam número")
        self.assertEqual(dar_a_versao(self.repo).returncode, 0)
        self.assertIn('VERSAO = "0.4.35"', ler(self.repo, "complemento/configuracao.py"))

    def test_o_commit_de_versao_leva_so_os_arquivos_da_versao_mesmo_com_outro_no_indice(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        escrever(self.repo, "README.md", "de carona\n")
        git(self.repo, "add", "README.md")
        self.assertEqual(dar_a_versao(self.repo).returncode, 0)
        self.assertEqual(set(git(self.repo, "show", "--name-only", "--format=", "HEAD").splitlines()), set(ARQUIVOS_DA_VERSAO))
        self.assertEqual(git(self.repo, "status", "--porcelain"), "A  README.md")

    def test_o_arquivo_das_reservadas_nao_entra_no_pacote(self):
        self.assertNotIn("versoes-reservadas.json", empacotar.arquivos_do_pacote())

    def test_os_numeros_comparam_como_numeros_e_nao_como_texto(self):
        self.assertEqual(versao_no_merge.proxima(["0.4.9", "0.4.10", "0.3.30"]), "0.4.11")
        self.assertEqual(versao_no_merge.proxima(["0.4.9"], acima_de="0.4.12"), "0.4.13")

    def test_o_script_nao_entra_no_pacote_nem_no_hash(self):
        self.assertNotIn("versao_no_merge.py", empacotar.arquivos_do_pacote())


class QuemNaoPodeSerVersionado(Casa):

    def test_testes_que_falham_desfazem_tudo_e_nao_deixam_commit(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")
        antes = git(self.repo, "rev-parse", "HEAD")
        resultado = subprocess.run(
            [sys.executable, os.path.join(self.repo, "complemento", "versao_no_merge.py"), "--testes", sys.executable + " -c 'raise SystemExit(3)'"],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(SOURCE_DATE_EPOCH=EPOCA),
        )
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("testes", resultado.stderr)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), antes)
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")

    def test_com_mudanca_nao_commitada_no_complemento_o_script_recusa(self):
        mudar_o_codigo(self.repo)
        resultado = dar_a_versao(self.repo)
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("não commitada", resultado.stderr)
        self.assertEqual(git(self.repo, "rev-list", "--count", "HEAD"), "1")


class AVersaoVemNoMerge(Casa):
    """Numa PR que não mexe na versão, o teste do hash e o do arquivo da extensão não cobram o que só o commit de versão faz."""

    def rodar(self, *testes, **extras):
        return subprocess.run(
            [sys.executable, "-m", "unittest", "-v", *testes],
            cwd=self.repo, capture_output=True, text=True, env=ambiente(**extras),
        )

    TESTES = (
        "complemento.test_pacote.VersaoDoComplemento." + CONFERE_A_VERSAO,
        "complemento.test_pacote.ArquivoQueVaiNoPacoteDaExtensao",
    )

    def uma_pr_de_codigo(self):
        mudar_o_codigo(self.repo)
        git(self.repo, "commit", "-qam", "uma PR de Conexão")

    def test_pr_que_so_muda_o_codigo_passa_com_os_dois_testes_pulados(self):
        self.uma_pr_de_codigo()
        resultado = self.rodar(*self.TESTES, PM_VERSAO_BASE="HEAD~1")
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        self.assertEqual(resultado.stderr.count("... skipped"), 2, resultado.stderr)
        self.assertIn("a versão é dada no merge", resultado.stderr)

    def test_na_main_e_no_commit_de_versao_o_codigo_mudado_sem_versao_falha(self):
        self.uma_pr_de_codigo()
        resultado = self.rodar(*self.TESTES)
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("python3 complemento/versao_no_merge.py na main", resultado.stderr)
        self.assertNotIn("suba a VERSAO", resultado.stderr)

    def test_pr_que_ja_leva_numero_continua_conferida(self):
        self.uma_pr_de_codigo()
        caminho = "complemento/configuracao.py"
        escrever(self.repo, caminho, ler(self.repo, caminho).replace(configuracao.VERSAO, "9.9.9"))
        git(self.repo, "commit", "-qam", "uma PR com número")
        resultado = self.rodar(*self.TESTES, PM_VERSAO_BASE="HEAD~2")
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("a VERSAO 9.9.9 não está em complemento/versoes.json", resultado.stderr)

    def test_a_main_que_andou_e_deu_versao_depois_da_branch_nao_tira_a_dispensa(self):
        git(self.repo, "checkout", "-q", "-b", "pr")
        self.uma_pr_de_codigo()
        git(self.repo, "checkout", "-q", "main")
        caminho = "complemento/configuracao.py"
        escrever(self.repo, caminho, ler(self.repo, caminho).replace(configuracao.VERSAO, "9.9.9"))
        git(self.repo, "commit", "-qam", "a main deu uma versão")
        git(self.repo, "checkout", "-q", "pr")
        resultado = self.rodar(*self.TESTES, PM_VERSAO_BASE="main")
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        self.assertEqual(resultado.stderr.count("... skipped"), 2, resultado.stderr)

    def test_pr_que_so_refaz_o_arquivo_da_extensao_continua_conferida(self):
        self.uma_pr_de_codigo()
        subprocess.run(
            [sys.executable, os.path.join(self.repo, "complemento", "empacotar.py"), os.path.join(self.repo, "conexao", "perpetualminer.ankiaddon")],
            cwd=self.repo, capture_output=True, text=True, check=True,
        )
        git(self.repo, "commit", "-qam", "refez o arquivo à mão")
        resultado = self.rodar(*self.TESTES, PM_VERSAO_BASE="HEAD~2")
        self.assertNotEqual(resultado.returncode, 0)
        self.assertIn("versao_no_merge.py", resultado.stderr)


if __name__ == "__main__":
    unittest.main()
