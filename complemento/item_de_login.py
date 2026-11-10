"""O item de login de “Abrir o Anki com o computador”: o que faz o Anki abrir quando a pessoa entra.

No Mac é um LaunchAgent (um `.plist` em `~/Library/LaunchAgents`); no Windows, um atalho na
pasta Inicializar. Ligar escreve o item, desligar o apaga; nada mais é tocado, e nenhum dos dois
roda nada na hora (o Mac só lê os LaunchAgents ao entrar, e o Windows só roda a Inicializar ao entrar).

Só a biblioteca padrão: o `.lnk` do Windows é escrito byte a byte (MS-SHLLINK), porque o Python do
Anki não tem COM nem se pode contar com o PowerShell. Leva a lista do alvo (`LinkTargetIDList`), o alvo (`LinkInfo`) e a pasta de
trabalho: sem a lista o Windows recusa o atalho (“não há aplicativos associados”).

O item nunca foi testado num Mac nem num Windows de verdade: os testes conferem o que fica no
disco, e o ensaio do dono confere o que o sistema faz com ele (`complemento/LEIA-ME.md`).
"""

import ntpath
import os
import plistlib
import posixpath
import struct
import tempfile

ROTULO_DO_MAC = "com.perpetualminer.abrir-o-anki"
# Um nome só dele: desligar nunca pode apagar o atalho do Anki que a própria pessoa pôs na pasta.
NOME_DO_ATALHO = "Anki (PerpetualMiner).lnk"


class AnkiNaoEncontrado(Exception):
    """Não se sabe onde o Anki está, então não há o que abrir no login."""


class ItemDeLogin:
    """O item numa `pasta`, para um `sistema` (`"mac"` ou `"windows"`) e um `comando` que abre o Anki.

    O `comando` é a lista de argumentos no Mac e o caminho do programa no Windows; `None` é que
    não se sabe como abrir o Anki.
    """

    def __init__(self, *, sistema, pasta, comando):
        if sistema not in _FORMATOS:
            raise ValueError("sistema sem item de login: %r" % (sistema,))
        self.sistema = sistema
        self.pasta = pasta
        self.comando = comando
        self._nome, self._serializar = _FORMATOS[sistema]

    @property
    def caminho(self):
        return os.path.join(self.pasta, self._nome)

    def ligado(self):
        return os.path.isfile(self.caminho)

    def ligar(self):
        """Escreve o item (troca o que já havia). Levanta `AnkiNaoEncontrado` ou o `OSError` da escrita."""
        if not self.comando:
            raise AnkiNaoEncontrado("não se sabe como abrir o Anki neste computador")
        conteudo = self._serializar(self.comando)
        os.makedirs(self.pasta, exist_ok=True)
        # Escreve ao lado e troca de uma vez: um item pela metade, no login, abriria nada ou algo errado.
        descritor, provisorio = tempfile.mkstemp(dir=self.pasta, suffix=".tmp")
        try:
            with os.fdopen(descritor, "wb") as arquivo:
                arquivo.write(conteudo)
            os.replace(provisorio, self.caminho)
        except BaseException:
            _apagar(provisorio)
            raise

    def desligar(self):
        """Apaga o item. Sem item não há o que fazer."""
        _apagar(self.caminho)


def deste_computador(*, plataforma, ambiente, executavel, existe=os.path.exists):
    """O item deste computador, pelo ambiente em que o complemento roda; `None` onde não há item (só Mac e Windows)."""
    if plataforma == "darwin":
        pasta = posixpath.join(ambiente.get("HOME") or os.path.expanduser("~"), "Library", "LaunchAgents")
        return ItemDeLogin(sistema="mac", pasta=pasta, comando=_como_abrir_no_mac(ambiente, executavel))
    if plataforma == "win32":
        inicializar = ntpath.join(ambiente.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
        return ItemDeLogin(sistema="windows", pasta=inicializar, comando=programa_do_anki_no_windows(ambiente, executavel, existe))
    return None


def aplicativo_do_anki_no_mac(ambiente, executavel):
    """O `.app` de onde o Anki roda (pelo abridor do Anki novo ou pelo programa que roda o complemento), ou None."""
    for caminho in (ambiente.get("ANKI_LAUNCHER"), executavel):
        if caminho and ".app/" in caminho:
            return caminho[: caminho.index(".app/") + len(".app")]
    return None


def _como_abrir_no_mac(ambiente, executavel):
    """Abre o aplicativo de onde o Anki roda; sem saber qual é, o aplicativo que o sistema conhece por “Anki”."""
    aplicativo = aplicativo_do_anki_no_mac(ambiente, executavel)
    return ["/usr/bin/open", aplicativo] if aplicativo else ["/usr/bin/open", "-a", "Anki"]


def programa_do_anki_no_windows(ambiente, executavel, existe=os.path.exists):
    """O programa do Anki: o abridor que o próprio Anki diz, o que roda o complemento, ou onde o instalador o põe."""
    abridor = ambiente.get("ANKI_LAUNCHER")
    if abridor:
        return abridor
    if executavel and ntpath.basename(executavel).lower() == "anki.exe":
        return executavel
    for variavel, subpasta in (("LOCALAPPDATA", ("Programs", "Anki")), ("PROGRAMFILES", ("Anki",))):
        if ambiente.get(variavel):
            candidato = ntpath.join(ambiente[variavel], *subpasta, "anki.exe")
            if existe(candidato):
                return candidato
    return None


def _apagar(caminho):
    try:
        os.remove(caminho)
    except FileNotFoundError:
        pass


def _plist_do_mac(comando):
    return plistlib.dumps({"Label": ROTULO_DO_MAC, "ProgramArguments": list(comando), "RunAtLoad": True})


# ─── O atalho do Windows (MS-SHLLINK) ──────────────────────────────────────────

_CLSID_DO_ATALHO = bytes.fromhex("0114020000000000c000000000000046")
_TEM_LISTA_DO_ALVO = 0x01
_TEM_LINK_INFO = 0x02
_TEM_PASTA_DE_TRABALHO = 0x10
_EM_UNICODE = 0x80
_DISCO_FIXO = 3


def _atalho_do_windows(alvo):
    lista = _lista_do_alvo(alvo)
    flags = _TEM_LINK_INFO | _TEM_PASTA_DE_TRABALHO | _EM_UNICODE | (_TEM_LISTA_DO_ALVO if lista else 0)
    cabecalho = struct.pack(
        "<I16sIIQQQIIIHHII",
        0x4C, _CLSID_DO_ATALHO, flags,
        0x20, 0, 0, 0,  # atributos (arquivo) e as três datas, sem valor
        0, 0, 1,        # tamanho do alvo e ícone sem valor; janela normal
        0, 0, 0, 0,     # tecla de atalho e reservados
    )
    pasta_de_trabalho = ntpath.dirname(alvo)
    return cabecalho + lista + _link_info(alvo) + _texto_do_atalho(pasta_de_trabalho) + b"\x00\x00\x00\x00"


_MEU_COMPUTADOR = bytes.fromhex("e04fd020ea3a6910a2d808002b30309d")


def _lista_do_alvo(alvo):
    """`LinkTargetIDList` (Meu Computador, a unidade, as pastas, o arquivo): o Windows não abre um `.lnk` que só tem o `LinkInfo`.

    Vazia (sem a lista) quando o alvo não começa por uma letra de unidade (caminho de rede).
    """
    unidade, resto = ntpath.splitdrive(alvo)
    if len(unidade) != 2 or unidade[1] != ":":
        return b""
    partes = [parte for parte in resto.split("\\") if parte]
    itens = [struct.pack("<HBB", 20, 0x1F, 0x50) + _MEU_COMPUTADOR]
    itens.append(struct.pack("<HB", 25, 0x2F) + (unidade + "\\").encode("cp1252", "replace").ljust(22, b"\x00"))
    for posicao, parte in enumerate(partes):
        eh_arquivo = posicao == len(partes) - 1
        nome = parte.encode("cp1252", "replace") + b"\x00"
        if len(nome) % 2:
            nome += b"\x00"
        itens.append(struct.pack("<HBBIHHH", 14 + len(nome), 0x32 if eh_arquivo else 0x31, 0, 0, 0x21, 0, 0x20 if eh_arquivo else 0x10) + nome)
    lista = b"".join(itens) + b"\x00\x00"
    return struct.pack("<H", len(lista)) + lista


def _link_info(alvo):
    """Onde o alvo está, em disco local; o texto vai também em Unicode, porque a página ANSI não guarda todo nome."""
    volume = struct.pack("<IIII", 17, _DISCO_FIXO, 0, 16) + b"\x00"
    alvo_ansi = alvo.encode("cp1252", "replace") + b"\x00"
    sufixo_ansi = b"\x00"
    alvo_unicode = (alvo + "\x00").encode("utf-16-le")
    sufixo_unicode = "\x00".encode("utf-16-le")

    tamanho_do_cabecalho = 0x24
    volume_em = tamanho_do_cabecalho
    alvo_em = volume_em + len(volume)
    sufixo_em = alvo_em + len(alvo_ansi)
    alvo_unicode_em = sufixo_em + len(sufixo_ansi)
    sufixo_unicode_em = alvo_unicode_em + len(alvo_unicode)
    total = sufixo_unicode_em + len(sufixo_unicode)
    cabecalho = struct.pack(
        "<9I", total, tamanho_do_cabecalho, 1, volume_em, alvo_em, 0, sufixo_em, alvo_unicode_em, sufixo_unicode_em
    )
    return cabecalho + volume + alvo_ansi + sufixo_ansi + alvo_unicode + sufixo_unicode


def _texto_do_atalho(texto):
    """Um texto de `StringData`: o tamanho é em unidades de UTF-16 (um caractere fora do plano básico vale duas)."""
    codificado = texto.encode("utf-16-le")
    return struct.pack("<H", len(codificado) // 2) + codificado


# O nome do item e como o escrever, por sistema.
_FORMATOS = {
    "mac": (ROTULO_DO_MAC + ".plist", _plist_do_mac),
    "windows": (NOME_DO_ATALHO, _atalho_do_windows),
}
