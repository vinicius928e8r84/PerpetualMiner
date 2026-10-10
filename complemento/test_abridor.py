"""O abridor: o script que a Conexão deixa no computador e registra como host de Native Messaging (#147).

    python3.9 complemento/test_abridor.py

Tudo roda numa pasta temporária: o script, o manifesto do host e o registro (a pasta de hosts do
Chrome no Mac; no Windows, um registro de mentira no lugar do `winreg`). O script do Mac roda de
verdade (`sh`), com a mensagem que o Chrome manda, pelos exemplos do contrato
(`contrato/exemplos.json` › `abridor`); o `open` do Mac é trocado por um programa que anota o que
recebeu. O do Windows (PowerShell) só roda onde houver `pwsh`; aqui se confere o que fica no disco.

O que o Chrome e o Opera fazem com o host registrado (achar, chamar, abrir o Anki sem pergunta) só o
dono vê, no ensaio dele (`complemento/LEIA-ME.md`, riscos 1 e 2 do #138).
"""

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

from complemento import abridor, configuracao  # noqa: E402

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos.json")
with open(CONTRATO, encoding="utf-8") as _arquivo:
    DO_ABRIDOR = json.load(_arquivo)["abridor"]

HOST = DO_ABRIDOR["host"]
ORIGEM_DA_EXTENSAO = configuracao.ORIGENS_ACEITAS[0] + "/"
# Opera GX 136 encontrou/chamou o host só na chave HKCU do Chrome no Windows real (W4, 2026-10-10).
# A ajuda do Opera cita HKLM, não HKCU; esta constante segue o ensaio, não confirma outros builds.
ONDE_O_CHROME_PROCURA_NO_WINDOWS = r"Software\Google\Chrome\NativeMessagingHosts"
ONDE_O_OPERA_PROCURA_NO_WINDOWS = r"Software\Google\Chrome\NativeMessagingHosts"
ANKI_DO_WINDOWS = r"C:\Users\Maria\AppData\Local\Programs\Anki\anki.exe"


def conversar(script, mensagem, ambiente=None):
    """Fala com o script como o Chrome fala: 4 bytes de tamanho (little-endian), o JSON; lê uma resposta do mesmo jeito."""
    corpo = json.dumps(mensagem, separators=(",", ":")).encode("utf-8")  # como o Chrome serializa
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
    """No lugar do `/usr/bin/open` do Mac: um programa que anota os argumentos que recebeu, um por linha."""

    def __init__(self, pasta):
        self.caminho = os.path.join(pasta, "open-de-mentira")
        self.anotados = os.path.join(pasta, "open-recebeu.txt")
        with open(self.caminho, "w", encoding="utf-8") as arquivo:
            arquivo.write('#!/bin/sh\nfor a in "$@"; do printf "%%s\\n" "$a"; done > "%s"\n' % self.anotados)
        os.chmod(self.caminho, 0o755)

    def recebeu(self):
        if not os.path.exists(self.anotados):
            return None
        with open(self.anotados, encoding="utf-8") as arquivo:
            return arquivo.read().splitlines()


class RegistroDeMentira:
    """O `HKEY_CURRENT_USER` do Windows: cada chave e o valor padrão dela."""

    def __init__(self):
        self.valores = {}

    def gravar(self, chave, valor):
        self.valores[chave] = valor


class Pastas:
    """Uma raiz temporária com o Anki do Mac (um `.app`), a pasta do abridor e a pasta de hosts do Chrome."""

    def __init__(self, raiz):
        self.app = os.path.join(raiz, "Applications", "Anki.app")
        os.makedirs(os.path.join(self.app, "Contents", "MacOS"))
        self.abridor = os.path.join(raiz, "user_files", "abridor")
        self.hosts_do_chrome = os.path.join(raiz, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
        self.open = OpenDeMentira(raiz)
        self.ler_json = "/usr/bin/osascript"
        if sys.platform != "darwin":
            # No Linux só a CLI do JXA é adaptada: o mesmo programa JavaScript recebe a
            # mesma mensagem e faz JSON.parse de verdade. Não substituímos o parser.
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
        sistema="mac",
        pasta=pastas.abridor,
        programa=pastas.app if programa is None else programa,
        onde_registrar={"Chrome": pastas.hosts_do_chrome},
        abrir_com=pastas.open.caminho,
        ler_json_com=pastas.ler_json,
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
                if exemplo["contexto"]["anki"] == "no_lugar":
                    os.makedirs(self.pastas.app, exist_ok=True)
                else:
                    shutil.rmtree(self.pastas.app)
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
            plataforma="win32",
            ambiente={"ANKI_LAUNCHER": programa},
            executavel=r"C:\x\python.exe",
            pasta=self.pasta,
            registro=self.registro,
        ).escrever(perfil)

    def caminho(self, nome):
        return os.path.join(self.pasta, nome)

    def ps1(self):
        with open(self.caminho("abrir-o-anki.ps1"), "rb") as arquivo:
            return arquivo.read()

    def valor_do_ps1(self, variavel):
        """O texto de `$variavel = '...'` no `.ps1`, como o PowerShell o lê (`''` é uma aspa)."""
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

    def test_o_bat_so_chama_o_powershell_do_windows_com_o_ps1_ao_lado_e_nao_ecoa_nada(self):
        self.escrever()
        with open(self.caminho("abrir-o-anki.bat"), "rb") as arquivo:
            linhas = arquivo.read().decode("ascii").split("\r\n")
        comandos = [linha for linha in linhas if linha and not linha.lower().startswith("rem ")]
        self.assertEqual(comandos, [
            "@echo off",
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
                plataforma="win32", ambiente={}, executavel=r"C:\Python39\python.exe",
                pasta=self.pasta, registro=self.registro, existe=lambda _: False,
            ).escrever("Usuário 1")
        self.assertFalse(os.path.exists(self.pasta))
        self.assertEqual(self.registro.valores, {})


@unittest.skipUnless(shutil.which("pwsh"), "o .ps1 só roda onde houver PowerShell (pwsh)")
class OPs1NoPowerShell(unittest.TestCase):
    """Onde há `pwsh`, o `.ps1` responde os exemplos do contrato (o Windows roda o PowerShell 5.1)."""

    def test_o_ps1_responde_cada_exemplo_de_conferir_do_contrato(self):
        with tempfile.TemporaryDirectory() as raiz:
            anki = os.path.join(raiz, "anki.exe")
            pasta = os.path.join(raiz, "abridor")
            abridor.Abridor(
                sistema="windows", pasta=pasta, programa=anki, onde_registrar={}, registro=RegistroDeMentira(),
            ).escrever("Usuário 1")
            for exemplo in DO_ABRIDOR["exemplos"]:
                if exemplo["mensagem"] == {"acao": "abrir"}:
                    continue  # abrir rodaria um programa: só o ensaio do dono
                with self.subTest(exemplo["nome"]):
                    if exemplo["contexto"]["anki"] == "no_lugar":
                        open(anki, "wb").close()
                    elif os.path.exists(anki):
                        os.remove(anki)
                    corpo = json.dumps(exemplo["mensagem"], separators=(",", ":")).encode("utf-8")
                    saida = subprocess.run(
                        ["pwsh", "-NoProfile", "-NonInteractive", "-File", os.path.join(pasta, "abrir-o-anki.ps1")],
                        input=struct.pack("<I", len(corpo)) + corpo, stdout=subprocess.PIPE, timeout=60, check=True,
                    ).stdout
                    tamanho, = struct.unpack_from("<I", saida, 0)
                    self.assertEqual(len(saida), 4 + tamanho)
                    self.assertEqual(json.loads(saida[4:].decode("utf-8")), exemplo["resposta"])


class DesteComputador(unittest.TestCase):
    """Onde cada sistema registra o host e como acha o Anki, pelo ambiente em que o complemento roda."""

    def test_no_mac_registra_na_pasta_de_hosts_do_chrome_do_usuario(self):
        este = abridor.deste_computador(
            plataforma="darwin", ambiente={"HOME": "/Users/maria"},
            executavel="/Applications/Anki.app/Contents/MacOS/anki", pasta="/x/user_files/abridor",
        )
        self.assertEqual((este.sistema, este.programa), ("mac", "/Applications/Anki.app"))
        self.assertEqual(este.onde_registrar, {
            "Chrome": "/Users/maria/Library/Application Support/Google/Chrome/NativeMessagingHosts",
        })

    def test_no_mac_com_o_abridor_novo_do_anki_acha_o_aplicativo_dele(self):
        este = abridor.deste_computador(
            plataforma="darwin",
            ambiente={"HOME": "/Users/maria", "ANKI_LAUNCHER": "/Applications/Anki.app/Contents/MacOS/launcher"},
            executavel="/Users/maria/Library/Application Support/AnkiProgramFiles/.venv/bin/python",
            pasta="/x",
        )
        self.assertEqual(este.programa, "/Applications/Anki.app")

    def test_no_windows_registra_para_o_chrome_e_para_o_opera_na_chave_do_usuario(self):
        este = abridor.deste_computador(
            plataforma="win32", ambiente={"ANKI_LAUNCHER": ANKI_DO_WINDOWS}, executavel="x", pasta="C:\\x",
            registro=RegistroDeMentira(),
        )
        self.assertEqual((este.sistema, este.programa), ("windows", ANKI_DO_WINDOWS))
        self.assertEqual(este.onde_registrar, {
            "Chrome": ONDE_O_CHROME_PROCURA_NO_WINDOWS,
            "Opera": ONDE_O_OPERA_PROCURA_NO_WINDOWS,
        })

    def test_em_outro_sistema_nao_ha_abridor(self):
        self.assertIsNone(abridor.deste_computador(plataforma="linux", ambiente={}, executavel="/usr/bin/python3", pasta="/x"))


if __name__ == "__main__":
    unittest.main()
