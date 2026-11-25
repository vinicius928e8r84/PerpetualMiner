import json
import os
import shutil
import shlex
import stat
import struct
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor, configuracao

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos.json")
with open(CONTRATO, encoding="utf-8") as _arquivo:
    DO_ABRIDOR = json.load(_arquivo)["abridor"]

HOST = DO_ABRIDOR["host"]
ANKI_NO_LUGAR = ("no_lugar", "nao_abre")
ORIGEM_DA_EXTENSAO = configuracao.ORIGENS_ACEITAS[0] + "/"
ONDE_O_CHROME_PROCURA_NO_WINDOWS = r"Software\Google\Chrome\NativeMessagingHosts"
ONDE_O_OPERA_PROCURA_NO_WINDOWS = r"Software\Google\Chrome\NativeMessagingHosts"
ANKI_DO_WINDOWS = r"C:\Users\Maria\AppData\Local\Programs\Anki\anki.exe"


def conversar(script, mensagem, ambiente=None):
    corpo = json.dumps(mensagem, separators=(",", ":")).encode("utf-8")
    saida = subprocess.run(
        ["sh", script, ORIGEM_DA_EXTENSAO],
        input=struct.pack("<I", len(corpo)) + corpo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        env=ambiente,
        check=True,
    ).stdout
    tamanho, = struct.unpack_from("<I", saida, 0)
    resposta = saida[4:4 + tamanho]
    assert len(saida) == 4 + tamanho, "o script escreveu algo além da resposta: %r" % (saida,)
    return json.loads(resposta.decode("utf-8"))


class OpenDeMentira:
    def __init__(self, pasta):
        self.caminho = os.path.join(pasta, "open-de-mentira")
        self.anotados = os.path.join(pasta, "open-recebeu.txt")
        self.consegue(True)

    def consegue(self, abrir):
        with open(self.caminho, "w", encoding="utf-8") as arquivo:
            arquivo.write('#!/bin/sh\nfor a in "$@"; do printf "%%s\\n" "$a"; done > "%s"\n%s'
                          % (self.anotados, "" if abrir else "exit 1\n"))
        os.chmod(self.caminho, 0o755)

    def recebeu(self):
        if not os.path.exists(self.anotados):
            return None
        with open(self.anotados, encoding="utf-8") as arquivo:
            return arquivo.read().splitlines()


class RegistroDeMentira:
    def __init__(self):
        self.valores = {}

    def gravar(self, chave, valor):
        self.valores[chave] = valor


class Pastas:
    def __init__(self, raiz):
        self.app = os.path.join(raiz, "Applications", "Anki.app")
        os.makedirs(os.path.join(self.app, "Contents", "MacOS"))
        self.abridor = os.path.join(raiz, "user_files", "abridor")
        self.hosts_do_chrome = os.path.join(raiz, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
        self.open = OpenDeMentira(raiz)
        self.ler_json = "/usr/bin/osascript"
        if sys.platform != "darwin":
            self.ler_json = os.path.join(raiz, "javascript-do-mac-em-node")
            with open(self.ler_json, "w", encoding="utf-8") as arquivo:
                arquivo.write("#!/bin/sh\nexec node -e " + shlex.quote(
                    "const fs = require('fs'), vm = require('vm'); "
                    "vm.runInThisContext(fs.readFileSync(0, 'utf8')); "
                    "process.stdout.write(run([process.argv[process.argv.length - 1]]) + '\\n');"
                ) + ' -- "$@"\n')
            os.chmod(self.ler_json, 0o700)


def abridor_do_mac(pastas, programa=None):
    return abridor.Abridor(
        sistema=abridor.NoMac({"Chrome": pastas.hosts_do_chrome}, abrir_com=pastas.open.caminho, ler_json_com=pastas.ler_json),
        pasta=pastas.abridor,
        programa=pastas.app if programa is None else programa,
    )


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


@unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
class NoMac(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.pastas = Pastas(self._raiz.name)

    def tearDown(self):
        self._raiz.cleanup()

    def escrever(self, perfil="Usuário 1"):
        abridor_do_mac(self.pastas).escrever(perfil)
        return os.path.join(self.pastas.abridor, "abrir-o-anki.sh")

    def test_escreve_o_script_e_registra_o_host_na_pasta_de_hosts_do_chrome(self):
        script = self.escrever()
        manifesto = ler_json(os.path.join(self.pastas.hosts_do_chrome, HOST + ".json"))
        self.assertEqual(manifesto, {
            "name": HOST,
            "description": "PerpetualMiner: abre o Anki para a Conexão com o Anki",
            "path": script,
            "type": "stdio",
            "allowed_origins": [ORIGEM_DA_EXTENSAO],
        })
        self.assertEqual(os.listdir(self.pastas.hosts_do_chrome), [HOST + ".json"])
        self.assertEqual(os.listdir(self.pastas.abridor), ["abrir-o-anki.sh"])

    def test_o_script_e_executavel_so_pelo_dono(self):
        script = self.escrever()
        modo = stat.S_IMODE(os.stat(script).st_mode)
        self.assertEqual(modo, 0o700)

    def test_o_script_responde_cada_exemplo_do_contrato(self):
        script = self.escrever()
        for exemplo in DO_ABRIDOR["exemplos"]:
            with self.subTest(exemplo["nome"]):
                contexto = exemplo["contexto"]["anki"]
                if contexto in ANKI_NO_LUGAR:
                    os.makedirs(self.pastas.app, exist_ok=True)
                elif os.path.exists(self.pastas.app):
                    shutil.rmtree(self.pastas.app)
                self.pastas.open.consegue(contexto != "nao_abre")
                resposta = conversar(script, exemplo["mensagem"])
                self.assertEqual(
                    resposta, exemplo["resposta"],
                    'O abridor e o contrato (complemento/contrato/exemplos.json › abridor) se separaram no exemplo "%s".'
                    % exemplo["nome"],
                )

    def test_so_a_acao_principal_exata_pode_abrir_o_anki(self):
        script = self.escrever()
        for mensagem in [
            {"acao": "abr ir"}, {"acao": "ABRIR"},
            {"acao": "fechar", "extra": {"acao": "abrir"}},
            {"acao": ["abrir"]}, [{"acao": "abrir"}],
        ]:
            with self.subTest(mensagem=mensagem):
                if os.path.exists(self.pastas.open.anotados):
                    os.remove(self.pastas.open.anotados)
                self.assertEqual(conversar(script, mensagem), {"erro": "acao_desconhecida"})
                self.assertIsNone(self.pastas.open.recebeu())

    def test_conferir_nao_abre_nada(self):
        script = self.escrever()
        conversar(script, {"acao": "conferir"})
        self.assertIsNone(self.pastas.open.recebeu())

    def test_abrir_abre_o_anki_no_perfil_anotado(self):
        script = self.escrever("Usuário 1")
        conversar(script, {"acao": "abrir"})
        self.assertEqual(self.pastas.open.recebeu(), ["-a", self.pastas.app, "--args", "-p", "Usuário 1"])

    def test_um_perfil_com_aspas_espacos_e_cifrao_chega_inteiro_ao_anki(self):
        perfil = "Ana's $HOME `x` \"casa\""
        script = self.escrever(perfil)
        conversar(script, {"acao": "abrir"})
        self.assertEqual(self.pastas.open.recebeu(), ["-a", self.pastas.app, "--args", "-p", perfil])

    def test_um_caminho_do_anki_com_a_marca_do_perfil_chega_inteiro_ao_open(self):
        app = os.path.join(self._raiz.name, "@PERFIL@", "Anki.app")
        os.makedirs(app)
        abridor_do_mac(self.pastas, programa=app).escrever("Usuário 1")
        conversar(os.path.join(self.pastas.abridor, "abrir-o-anki.sh"), {"acao": "abrir"})
        self.assertEqual(self.pastas.open.recebeu(), ["-a", app, "--args", "-p", "Usuário 1"])

    def test_sem_perfil_anotado_abre_o_anki_sem_escolher_perfil(self):
        script = self.escrever(None)
        conversar(script, {"acao": "abrir"})
        self.assertEqual(self.pastas.open.recebeu(), ["-a", self.pastas.app])

    def test_escrever_de_novo_troca_o_perfil_sem_duplicar_nada(self):
        self.escrever("Usuário 1")
        script = self.escrever("Maria")
        conversar(script, {"acao": "abrir"})
        self.assertEqual(self.pastas.open.recebeu()[-1], "Maria")
        self.assertEqual(os.listdir(self.pastas.hosts_do_chrome), [HOST + ".json"])
        self.assertEqual(os.listdir(self.pastas.abridor), ["abrir-o-anki.sh"])

    def test_nao_mexe_nos_hosts_de_outros_programas(self):
        os.makedirs(self.pastas.hosts_do_chrome)
        alheio = os.path.join(self.pastas.hosts_do_chrome, "com.outro.programa.json")
        with open(alheio, "w", encoding="utf-8") as arquivo:
            arquivo.write("{}")
        self.escrever()
        self.assertEqual(sorted(os.listdir(self.pastas.hosts_do_chrome)), sorted(["com.outro.programa.json", HOST + ".json"]))
        with open(alheio, encoding="utf-8") as arquivo:
            self.assertEqual(arquivo.read(), "{}")

    def test_sem_saber_onde_o_anki_esta_nao_escreve_nem_registra_nada(self):
        with self.assertRaises(abridor.AnkiNaoEncontrado):
            abridor_do_mac(self.pastas, programa="").escrever("Usuário 1")
        self.assertFalse(os.path.exists(self.pastas.abridor))
        self.assertFalse(os.path.exists(self.pastas.hosts_do_chrome))


class NoWindows(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.pasta = os.path.join(self._raiz.name, "user_files", "abridor")
        self.registro = RegistroDeMentira()

    def tearDown(self):
        self._raiz.cleanup()

    def escrever(self, perfil="Usuário 1", programa=ANKI_DO_WINDOWS):
        abridor.deste_computador(
            computador=abridor.Computador(plataforma="win32", ambiente={"ANKI_LAUNCHER": programa}, executavel=r"C:\x\python.exe"),
            pasta=self.pasta,
            registro=self.registro,
        ).escrever(perfil)

    def caminho(self, nome):
        return os.path.join(self.pasta, nome)

    def ps1(self):
        with open(self.caminho("abrir-o-anki.ps1"), "rb") as arquivo:
            return arquivo.read()

    def valor_do_ps1(self, variavel):
        for linha in self.ps1().decode("utf-8-sig").splitlines():
            if linha.startswith("$%s = " % variavel):
                valor = linha[len("$%s = " % variavel):]
                if valor == "$null":
                    return None
                self.assertTrue(valor.startswith("'") and valor.endswith("'"), linha)
                miolo = valor[1:-1]
                for aspa in "'\u2018\u2019\u201a\u201b":
                    miolo = miolo.replace(aspa * 2, aspa)
                return miolo
        self.fail("o .ps1 não tem $%s" % variavel)

    def test_escreve_o_bat_o_ps1_e_o_manifesto_na_pasta_do_abridor(self):
        self.escrever()
        self.assertEqual(sorted(os.listdir(self.pasta)), ["abrir-o-anki.bat", "abrir-o-anki.ps1", HOST + ".json"])
        manifesto = ler_json(self.caminho(HOST + ".json"))
        self.assertEqual(manifesto, {
            "name": HOST,
            "description": "PerpetualMiner: abre o Anki para a Conexão com o Anki",
            "path": self.caminho("abrir-o-anki.bat"),
            "type": "stdio",
            "allowed_origins": [ORIGEM_DA_EXTENSAO],
        })

    def test_registra_o_host_na_chave_do_chrome_do_usuario(self):
        self.escrever()
        self.assertEqual(
            self.registro.valores[ONDE_O_CHROME_PROCURA_NO_WINDOWS + "\\" + HOST], self.caminho(HOST + ".json"))

    def test_o_opera_acha_o_host_na_chave_onde_ele_procura(self):
        self.escrever()
        self.assertEqual(
            self.registro.valores[ONDE_O_OPERA_PROCURA_NO_WINDOWS + "\\" + HOST], self.caminho(HOST + ".json"))

    def test_so_grava_as_chaves_dos_hosts_e_nada_mais_no_registro(self):
        self.escrever()
        self.assertEqual(
            set(self.registro.valores),
            {ONDE_O_CHROME_PROCURA_NO_WINDOWS + "\\" + HOST, ONDE_O_OPERA_PROCURA_NO_WINDOWS + "\\" + HOST},
        )

    def test_o_bat_sai_da_pasta_do_abridor_e_so_chama_o_powershell_do_windows_com_o_ps1_ao_lado_e_nao_ecoa_nada(self):
        self.escrever()
        with open(self.caminho("abrir-o-anki.bat"), "rb") as arquivo:
            linhas = arquivo.read().decode("ascii").split("\r\n")
        comandos = [linha for linha in linhas if linha and not linha.lower().startswith("rem ")]
        self.assertEqual(comandos, [
            "@echo off",
            'cd /d "%SystemRoot%"',
            '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive '
            '-ExecutionPolicy Bypass -File "%~dp0abrir-o-anki.ps1"',
        ])

    def test_o_ps1_leva_o_caminho_do_anki_e_o_perfil(self):
        self.escrever("Usuário 1")
        self.assertEqual(self.valor_do_ps1("anki"), ANKI_DO_WINDOWS)
        self.assertEqual(self.valor_do_ps1("perfil"), "Usuário 1")

    def test_o_ps1_e_utf8_com_bom_para_o_powershell_do_windows_ler_os_acentos(self):
        self.escrever(programa=r"C:\Users\João\AppData\Local\Programs\Anki\anki.exe")
        self.assertTrue(self.ps1().startswith(b"\xef\xbb\xbf"))
        self.assertEqual(self.valor_do_ps1("anki"), r"C:\Users\João\AppData\Local\Programs\Anki\anki.exe")

    def test_um_perfil_com_aspas_retas_e_curvas_fica_inteiro_no_ps1(self):
        perfil = "Ana's ‘casa’ $env:PATH"
        self.escrever(perfil)
        self.assertEqual(self.valor_do_ps1("perfil"), perfil)

    def test_um_caminho_do_anki_com_a_marca_do_perfil_nao_deixa_o_perfil_virar_codigo(self):
        caminho = r"C:\@PERFIL@\Anki\anki.exe"
        perfil = "';calc;'"
        self.escrever(perfil, programa=caminho)
        self.assertEqual((self.valor_do_ps1("anki"), self.valor_do_ps1("perfil")), (caminho, perfil))

    def test_sem_perfil_anotado_o_ps1_nao_escolhe_perfil(self):
        self.escrever(None)
        self.assertIsNone(self.valor_do_ps1("perfil"))

    def test_sem_saber_onde_o_anki_esta_nao_escreve_nem_registra_nada(self):
        with self.assertRaises(abridor.AnkiNaoEncontrado):
            abridor.deste_computador(
                computador=abridor.Computador(plataforma="win32", ambiente={}, executavel=r"C:\Python39\python.exe", existe=lambda _: False),
                pasta=self.pasta, registro=self.registro,
            ).escrever("Usuário 1")
        self.assertFalse(os.path.exists(self.pasta))
        self.assertEqual(self.registro.valores, {})


class DesteComputador(unittest.TestCase):
    def test_no_mac_registra_na_pasta_de_hosts_do_chrome_do_usuario(self):
        este = abridor.deste_computador(
            computador=abridor.Computador(
                plataforma="darwin", ambiente={"HOME": "/Users/maria"}, executavel="/Applications/Anki.app/Contents/MacOS/anki"),
            pasta="/x/user_files/abridor",
        )
        self.assertEqual((este.sistema.nome, este.programa), ("mac", "/Applications/Anki.app"))
        self.assertEqual(este.sistema.onde_registrar, {
            "Chrome": "/Users/maria/Library/Application Support/Google/Chrome/NativeMessagingHosts",
        })

    def test_no_mac_com_o_abridor_novo_do_anki_acha_o_aplicativo_dele(self):
        este = abridor.deste_computador(
            computador=abridor.Computador(
                plataforma="darwin",
                ambiente={"HOME": "/Users/maria", "ANKI_LAUNCHER": "/Applications/Anki.app/Contents/MacOS/launcher"},
                executavel="/Users/maria/Library/Application Support/AnkiProgramFiles/.venv/bin/python",
            ),
            pasta="/x",
        )
        self.assertEqual(este.programa, "/Applications/Anki.app")

    def test_sem_o_anki_no_programa_que_roda_ele_e_procurado_onde_o_instalador_o_poe_no_disco(self):
        no_disco = {"/Applications/Anki.app", "C:\\Users\\maria\\AppData\\Local\\Programs\\Anki\\anki.exe"}
        achados = [
            abridor.deste_computador(
                computador=abridor.Computador(plataforma, dict(ambiente, HOME="/Users/maria"), "/usr/bin/python3", existe), pasta="/x",
                registro=RegistroDeMentira(),
            ).programa
            for plataforma, ambiente in (("darwin", {}), ("win32", {"LOCALAPPDATA": "C:\\Users\\maria\\AppData\\Local"}))
            for existe in (no_disco.__contains__, lambda _: False)
        ]
        self.assertEqual(achados, ["/Applications/Anki.app", None, "C:\\Users\\maria\\AppData\\Local\\Programs\\Anki\\anki.exe", None])

    def test_no_windows_registra_para_o_chrome_e_para_o_opera_na_chave_do_usuario(self):
        este = abridor.deste_computador(
            computador=abridor.Computador(plataforma="win32", ambiente={"ANKI_LAUNCHER": ANKI_DO_WINDOWS}, executavel="x"), pasta="C:\\x",
            registro=RegistroDeMentira(),
        )
        self.assertEqual((este.sistema.nome, este.programa), ("windows", ANKI_DO_WINDOWS))
        self.assertEqual(este.sistema.onde_registrar, {
            "Chrome": ONDE_O_CHROME_PROCURA_NO_WINDOWS,
            "Opera": ONDE_O_OPERA_PROCURA_NO_WINDOWS,
        })

    def test_em_outro_sistema_nao_ha_abridor(self):
        self.assertIsNone(abridor.deste_computador(computador=abridor.Computador(plataforma="linux", ambiente={}, executavel="/usr/bin/python3"), pasta="/x"))


if __name__ == "__main__":
    unittest.main()
