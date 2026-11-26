#!/usr/bin/env python3

import argparse
import contextlib
import fcntl
import http.client
import json
import os
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", "..", "..", ".."))
sys.path.insert(0, RAIZ)

from complemento import anki_de_teste  # noqa: E402
from complemento.configuracao import PORTA as PORTA_DO_DONO  # noqa: E402

PREFIXO = "pm-anki-de-teste-"
VERSAO_DO_ANKI = "26.9.4"
LIBS_DE_TELA = ("libgl1", "libegl1", "libglvnd0", "libglx0", "libxtst6", "libxkbfile1")
ESPERA_DA_CONEXAO_S = 120
ABRIR_O_ANKI_EM_INGLES_SEM_PERGUNTAR_O_IDIOMA = "import aqt.profiles as p; p.ProfileManager.setDefaultLang = lambda self, i: self.setLang('en'); import aqt; aqt.run()"
ESPERA_PARA_FECHAR_S = 15


def casa():
    return os.environ.get("PM_ANKI_DE_TESTE_HOME") or os.path.join(os.path.expanduser("~"), ".cache", "pm-anki-de-teste")


def python_do_anki():
    return os.environ.get("PM_ANKI_PYTHON") or os.path.join(casa(), "venv", "bin", "python")


def bibliotecas_de_tela():
    return os.path.join(casa(), "libs", "usr", "lib", "x86_64-linux-gnu")


def porta_livre():
    while True:
        with socket.socket() as soquete:
            soquete.bind(("127.0.0.1", 0))
            porta = soquete.getsockname()[1]
        if porta != PORTA_DO_DONO:
            return porta


def mensagem(texto):
    print("anki-de-teste: " + texto, file=sys.stderr, flush=True)


@contextlib.contextmanager
def a_vez_do_anki_de_teste():
    caminho = os.environ.get("PM_ANKI_TRAVA") or os.path.join(tempfile.gettempdir(), "pm-anki-de-teste.lock")
    with open(caminho, "a") as trava:
        try:
            fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            mensagem("esperando a vez: outro Anki de teste está aberto (trava %s)" % caminho)
            fcntl.flock(trava, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(trava, fcntl.LOCK_UN)


class AnkiDeTeste:
    def __init__(self, porta):
        self.porta = porta
        self.raiz = tempfile.mkdtemp(prefix=PREFIXO)
        self.base = os.path.join(self.raiz, "base")
        self.complemento = os.path.join(self.base, "addons21", "perpetualminer")
        self.pasta = os.path.join(self.complemento, "user_files")
        self.processo = None

    def preparar_a_pasta(self):
        os.makedirs(self.complemento)
        open(os.path.join(self.base, anki_de_teste.MARCA), "w").close()
        os.makedirs(os.path.join(self.raiz, "home"))
        from complemento import empacotar

        pacote = empacotar.empacotar(os.path.join(self.raiz, "perpetualminer.ankiaddon"), mod=int(time.time()))
        with zipfile.ZipFile(pacote) as zip:
            zip.extractall(self.complemento)
        os.makedirs(self.pasta)
        from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, semear

        semear(os.path.join(self.pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))

    def chave_da_instancia(self):
        return "so-" + os.path.basename(self.raiz)

    def ambiente(self):
        ambiente = dict(os.environ)
        ambiente.update(
            ANKI_BASE=self.base,
            ANKI_SINGLE_INSTANCE_KEY=self.chave_da_instancia(),
            HOME=os.path.join(self.raiz, "home"),
            QT_QPA_PLATFORM="offscreen",
            QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu",
            **{anki_de_teste.VARIAVEL_DA_PORTA: str(self.porta)},
        )
        libs = bibliotecas_de_tela()
        if os.path.isdir(libs):
            ambiente["LD_LIBRARY_PATH"] = libs + os.pathsep + ambiente.get("LD_LIBRARY_PATH", "")
        return ambiente

    def comando(self):
        outro = os.environ.get("PM_ANKI_COMANDO")
        if outro:
            import shlex

            return shlex.split(outro)
        return [python_do_anki(), "-c", ABRIR_O_ANKI_EM_INGLES_SEM_PERGUNTAR_O_IDIOMA]

    def abrir(self):
        self.preparar_a_pasta()
        self.log = open(os.path.join(self.raiz, "anki.log"), "w")
        self.processo = subprocess.Popen(
            self.comando(), env=self.ambiente(), stdin=subprocess.DEVNULL, stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True
        )

    def respondeu(self):
        ligacao = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=2)
        try:
            ligacao.request("GET", "/health")
            return json.loads(ligacao.getresponse().read().decode("utf-8")).get("ok") is True
        except (OSError, http.client.HTTPException, ValueError, AttributeError):
            return False
        finally:
            ligacao.close()

    def esperar_a_conexao(self, limite_s):
        fim = time.monotonic() + limite_s
        while time.monotonic() < fim:
            if self.processo.poll() is not None:
                return "o Anki de teste fechou sozinho (saída %s)" % self.processo.returncode
            if self.respondeu():
                return None
            time.sleep(0.5)
        return "a Conexão não respondeu na porta %d em %d s" % (self.porta, limite_s)

    def o_que_ele_disse(self):
        trechos = []
        for nome, caminho in (("anki.log", os.path.join(self.raiz, "anki.log")), ("complemento.log", os.path.join(self.pasta, "logs", "complemento.log"))):
            try:
                with open(caminho, encoding="utf-8", errors="replace") as arquivo:
                    trechos.append("--- %s (fim) ---\n%s" % (nome, "".join(arquivo.readlines()[-20:])))
            except OSError:
                pass
        return "\n".join(trechos)

    def fechar(self):
        if self.processo is not None:
            _parar_o_grupo(self.processo)
        if getattr(self, "log", None) is not None:
            self.log.close()
        _apagar_so_a_nossa(self.raiz)
        self.apagar_o_soquete_da_instancia()

    def apagar_o_soquete_da_instancia(self):
        soquete = os.path.join(tempfile.gettempdir(), self.chave_da_instancia())
        if os.path.exists(soquete) and stat.S_ISSOCK(os.lstat(soquete).st_mode):
            os.remove(soquete)


def _parar_o_grupo(processo):
    grupo = processo.pid
    for sinal, espera in ((signal.SIGTERM, ESPERA_PARA_FECHAR_S), (signal.SIGKILL, 5)):
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(grupo, sinal)
        fim = time.monotonic() + espera
        while time.monotonic() < fim and _grupo_vivo(grupo, processo):
            time.sleep(0.1)
        if not _grupo_vivo(grupo, processo):
            return
    mensagem("o grupo %d do Anki de teste sobrou depois do KILL" % grupo)


def _grupo_vivo(grupo, processo):
    processo.poll()
    try:
        os.killpg(grupo, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _apagar_so_a_nossa(raiz):
    if _e_pasta_criada_aqui(raiz):
        shutil.rmtree(raiz)
    else:
        mensagem("não apaguei %s: não é uma pasta que este script criou" % raiz)


def _e_pasta_criada_aqui(raiz):
    pai, nome = os.path.split(os.path.realpath(raiz))
    if pai != os.path.realpath(tempfile.gettempdir()):
        return False
    if not nome.startswith(PREFIXO):
        return False
    return os.path.isfile(os.path.join(raiz, "base", anki_de_teste.MARCA))


def _sair_pelo_sinal(numero, quadro):
    raise SystemExit(128 + numero)


def rodar(argumentos):
    for sinal in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sinal, _sair_pelo_sinal)
    limite = float(os.environ.get("PM_ANKI_ESPERA_S") or ESPERA_DA_CONEXAO_S)
    with a_vez_do_anki_de_teste():
        anki = AnkiDeTeste(porta_livre())
        gravado = None
        try:
            anki.abrir()
            erro = anki.esperar_a_conexao(limite)
            if erro:
                mensagem(erro + "\n" + anki.o_que_ele_disse())
                return 1
            dados = {"porta": anki.porta, "pasta": anki.pasta, "base": anki.base}
            if argumentos.pronto:
                with open(argumentos.pronto, "w") as arquivo:
                    json.dump(dados, arquivo)
                gravado = argumentos.pronto
            mensagem("Anki de teste na porta %d, pasta %s" % (anki.porta, anki.raiz))
            if not argumentos.comando:
                signal.pause()
                return 0
            ambiente = dict(os.environ, PM_ANKI_PORTA=str(anki.porta), PM_ANKI_PASTA=anki.pasta)
            return subprocess.call(argumentos.comando, env=ambiente)
        finally:
            if gravado:
                with contextlib.suppress(OSError):
                    os.remove(gravado)
            anki.fechar()


def preparar():
    os.makedirs(casa(), exist_ok=True)
    venv = os.path.join(casa(), "venv")
    if not os.path.exists(python_do_anki()):
        subprocess.check_call(["uv", "venv", "--python", "3.13", venv])
    subprocess.check_call(["uv", "pip", "install", "--python", python_do_anki(), "aqt==" + VERSAO_DO_ANKI])
    if sys.platform.startswith("linux") and not os.path.isdir(bibliotecas_de_tela()):
        debs = os.path.join(casa(), "debs")
        os.makedirs(debs, exist_ok=True)
        subprocess.check_call(["apt-get", "download", *LIBS_DE_TELA], cwd=debs)
        for deb in sorted(os.listdir(debs)):
            subprocess.check_call(["dpkg", "-x", os.path.join(debs, deb), os.path.join(casa(), "libs")])
        shutil.rmtree(debs)
    mensagem("pronto: %s" % python_do_anki())
    return 0


def main(argv):
    analisador = argparse.ArgumentParser(description="Abre um Anki de teste (sem tela, porta livre, pasta descartável), roda o comando e o fecha.")
    analisador.add_argument("--pronto", help="arquivo onde gravar {porta, pasta, base} quando a Conexão responder; é apagado no fim")
    analisador.add_argument("comando", nargs="*", help="o que rodar com PM_ANKI_PORTA e PM_ANKI_PASTA; 'preparar' faz o venv do Anki e as bibliotecas de tela")
    argumentos = analisador.parse_args(argv)
    if argumentos.comando == ["preparar"] and not argumentos.pronto:
        return preparar()
    return rodar(argumentos)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
