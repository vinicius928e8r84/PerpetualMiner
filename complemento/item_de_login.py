import ntpath
import os
import plistlib
import posixpath
import struct
import tempfile

ROTULO_DO_MAC = "com.perpetualminer.abrir-o-anki"
NOME_DO_ATALHO = "Anki (PerpetualMiner).lnk"


class AnkiNaoEncontrado(Exception):
    pass


class ItemDeLogin:
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
        if not self.comando:
            raise AnkiNaoEncontrado("não se sabe como abrir o Anki neste computador")
        self._gravar(self._serializar(self.comando))

    def reescrever_se_difere(self):
        if not self.comando or not self.ligado():
            return False
        conteudo = self._serializar(self.comando)
        with open(self.caminho, "rb") as arquivo:
            if arquivo.read() == conteudo:
                return False
        self._gravar(conteudo)
        return True

    def _gravar(self, conteudo):
        os.makedirs(self.pasta, exist_ok=True)
        descritor, provisorio = tempfile.mkstemp(dir=self.pasta, suffix=".tmp")
        try:
            with os.fdopen(descritor, "wb") as arquivo:
                arquivo.write(conteudo)
            os.replace(provisorio, self.caminho)
        except BaseException:
            _apagar(provisorio)
            raise

    def desligar(self):
        _apagar(self.caminho)


def deste_computador(*, plataforma, ambiente, executavel, existe=os.path.exists):
    if plataforma == "darwin":
        pasta = posixpath.join(ambiente.get("HOME") or os.path.expanduser("~"), "Library", "LaunchAgents")
        return ItemDeLogin(sistema="mac", pasta=pasta, comando=_como_abrir_no_mac(ambiente, executavel))
    if plataforma == "win32":
        inicializar = ntpath.join(ambiente.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
        return ItemDeLogin(sistema="windows", pasta=inicializar, comando=programa_do_anki_no_windows(ambiente, executavel, existe))
    return None


def aplicativo_do_anki_no_mac(ambiente, executavel):
    for caminho in (ambiente.get("ANKI_LAUNCHER"), executavel):
        if caminho and ".app/" in caminho:
            return caminho[: caminho.index(".app/") + len(".app")]
    return None


def _como_abrir_no_mac(ambiente, executavel):
    aplicativo = aplicativo_do_anki_no_mac(ambiente, executavel)
    return ["/usr/bin/open", aplicativo] if aplicativo else ["/usr/bin/open", "-a", "Anki"]


def programa_do_anki_no_windows(ambiente, executavel, existe=os.path.exists):
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
        0x20, 0, 0, 0,
        0, 0, 1,
        0, 0, 0, 0,
    )
    pasta_de_trabalho = ntpath.dirname(alvo)
    return cabecalho + lista + _link_info(alvo) + _texto_do_atalho(pasta_de_trabalho) + b"\x00\x00\x00\x00"


_MEU_COMPUTADOR = bytes.fromhex("e04fd020ea3a6910a2d808002b30309d")
_NOME_EM_UNICODE = 0x04


def _tem_letra_de_unidade(unidade):
    return len(unidade) == 2 and unidade[1] == ":"


def _item_do_meu_computador():
    return struct.pack("<HBB", 20, 0x1F, 0x50) + _MEU_COMPUTADOR


def _item_da_unidade(unidade):
    return struct.pack("<HB", 25, 0x2F) + (unidade + "\\").encode("cp1252", "replace").ljust(22, b"\x00")


def _nome_do_item(parte):
    if not parte.isascii():
        return _NOME_EM_UNICODE, (parte + "\x00").encode("utf-16-le")
    nome = parte.encode("ascii") + b"\x00"
    return 0, nome + b"\x00" if len(nome) % 2 else nome


def _item_do_caminho(parte, eh_arquivo):
    marca_de_unicode, nome = _nome_do_item(parte)
    tipo = (0x32 if eh_arquivo else 0x31) | marca_de_unicode
    atributos = 0x20 if eh_arquivo else 0x10
    return struct.pack("<HBBIHHH", 14 + len(nome), tipo, 0, 0, 0x21, 0, atributos) + nome


def _lista_do_alvo(alvo):
    unidade, resto = ntpath.splitdrive(alvo)
    if not _tem_letra_de_unidade(unidade):
        return b""
    partes = [parte for parte in resto.split("\\") if parte]
    itens = [_item_do_meu_computador(), _item_da_unidade(unidade)]
    itens += [_item_do_caminho(parte, posicao == len(partes) - 1) for posicao, parte in enumerate(partes)]
    lista = b"".join(itens) + b"\x00\x00"
    return struct.pack("<H", len(lista)) + lista


def _link_info(alvo):
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
    codificado = texto.encode("utf-16-le")
    return struct.pack("<H", len(codificado) // 2) + codificado


_FORMATOS = {
    "mac": (ROTULO_DO_MAC + ".plist", _plist_do_mac),
    "windows": (NOME_DO_ATALHO, _atalho_do_windows),
}
