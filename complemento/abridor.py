import json
import ntpath
import os
import posixpath
import re
import shlex
import tempfile
from collections import namedtuple

from . import conserto_do_anki
from .configuracao import ORIGENS_ACEITAS, PORTA
from .item_de_login import AnkiNaoEncontrado, aplicativo_do_anki_no_mac, programa_do_anki_no_windows

NOME_DO_HOST = "com.perpetualminer.abridor"
DESCRICAO = "PerpetualMiner: abre o Anki para a Conexão com o Anki"

ONDE_REGISTRAR_NO_WINDOWS = {
    "Chrome": r"Software\Google\Chrome\NativeMessagingHosts",
    "Opera": r"Software\Google\Chrome\NativeMessagingHosts",
}

SCRIPT_DO_MAC = "abrir-o-anki.sh"
BAT_DO_WINDOWS = "abrir-o-anki.bat"
PS1_DO_WINDOWS = "abrir-o-anki.ps1"

__all__ = ["Abridor", "AnkiNaoEncontrado", "Computador", "NoMac", "NoWindows", "RegistroDoWindows", "deste_computador", "NOME_DO_HOST"]


class RegistroDoWindows:
    def gravar(self, chave, valor):
        import winreg

        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, chave, 0, winreg.KEY_WRITE) as aberta:
            winreg.SetValueEx(aberta, "", 0, winreg.REG_SZ, valor)


class NoMac:
    nome = "mac"

    def __init__(self, onde_registrar, abrir_com="/usr/bin/open", ler_json_com="/usr/bin/osascript"):
        self.onde_registrar, self.abrir_com, self.ler_json_com = onde_registrar, abrir_com, ler_json_com

    def escrever(self, abridor, perfil):
        script = os.path.join(abridor.pasta, SCRIPT_DO_MAC)
        _gravar(script, _script_do_mac(abridor, self, perfil).encode("utf-8"), modo=0o700)
        for pasta_de_hosts in _sem_repetir(self.onde_registrar.values()):
            os.makedirs(pasta_de_hosts, exist_ok=True)
            _gravar(os.path.join(pasta_de_hosts, NOME_DO_HOST + ".json"), _manifesto(script))


class NoWindows:
    nome = "windows"

    def __init__(self, onde_registrar, registro):
        self.onde_registrar, self.registro = onde_registrar, registro

    def escrever(self, abridor, perfil):
        script = os.path.join(abridor.pasta, BAT_DO_WINDOWS)
        _gravar(os.path.join(abridor.pasta, PS1_DO_WINDOWS), b"\xef\xbb\xbf" + _ps1(abridor, perfil).encode("utf-8"))
        _gravar(script, _BAT.encode("ascii"))
        manifesto = os.path.join(abridor.pasta, NOME_DO_HOST + ".json")
        _gravar(manifesto, _manifesto(script))
        for chave in _sem_repetir(self.onde_registrar.values()):
            self.registro.gravar(chave + "\\" + NOME_DO_HOST, manifesto)


class Abridor:
    def __init__(self, *, sistema, pasta, programa, conserto=None):
        self.sistema = sistema
        self.pasta = pasta
        self.programa = programa
        self.conserto = conserto or conserto_do_anki.Conserto()

    def escrever(self, perfil):
        if not self.programa:
            raise AnkiNaoEncontrado("não se sabe onde o Anki está neste computador")
        os.makedirs(self.pasta, exist_ok=True)
        self.sistema.escrever(self, perfil)


class Computador(namedtuple("Computador", "plataforma ambiente executavel existe", defaults=(os.path.exists,))):
    pass


def deste_computador(*, computador, pasta, complemento=None, registro=None, porta=PORTA):
    plataforma, ambiente, executavel, existe = computador
    conserto = conserto_do_anki.Conserto(executavel=executavel, complemento=complemento, conexao=conserto_do_anki.ConexaoEsperada(porta=porta))
    if plataforma == "darwin":
        casa = ambiente.get("HOME") or os.path.expanduser("~")
        hosts = posixpath.join(casa, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
        programa = aplicativo_do_anki_no_mac(ambiente, executavel)
        if programa is None and existe("/Applications/Anki.app"):
            programa = "/Applications/Anki.app"
        return Abridor(sistema=NoMac({"Chrome": hosts}), pasta=pasta, programa=programa, conserto=conserto)
    if plataforma == "win32":
        return Abridor(
            sistema=NoWindows(dict(ONDE_REGISTRAR_NO_WINDOWS), registro if registro is not None else RegistroDoWindows()),
            pasta=pasta,
            programa=programa_do_anki_no_windows(ambiente, executavel, existe),
            conserto=conserto,
        )
    return None


def _sem_repetir(valores):
    vistos = []
    for valor in valores:
        if valor not in vistos:
            vistos.append(valor)
    return vistos


def _gravar(caminho, conteudo, modo=None):
    pasta = os.path.dirname(caminho)
    descritor, provisorio = tempfile.mkstemp(dir=pasta, suffix=".tmp")
    try:
        with os.fdopen(descritor, "wb") as arquivo:
            arquivo.write(conteudo)
        if modo is not None:
            os.chmod(provisorio, modo)
        os.replace(provisorio, caminho)
    except BaseException:
        try:
            os.remove(provisorio)
        except FileNotFoundError:
            pass
        raise


def _manifesto(script):
    return (json.dumps({
        "name": NOME_DO_HOST,
        "description": DESCRICAO,
        "path": script,
        "type": "stdio",
        "allowed_origins": [origem + "/" for origem in ORIGENS_ACEITAS],
    }, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


_MODELO_DO_MAC = r"""#!/bin/sh
# PerpetualMiner: o abridor do Anki, um host de Native Messaging do Chrome.
# A Conexão com o Anki escreve este arquivo quando o Anki abre e quando um perfil abre: não edite.
# Só a extensão PerpetualMiner o chama, e ele só faz três coisas:
#   conferir   responde se o Anki está no lugar abaixo, sem abrir nem fechar nada;
#   abrir      abre o Anki (no perfil abaixo, se houver);
#   consertar  fecha à força o Anki que não responde e abre de novo, ou liga o complemento desativado (conserto_do_anki.py).
ANKI=@ANKI@
PERFIL=@PERFIL@
ABRIR=@ABRIR@
LER_JSON=@LERJSON@
@DADOS@

# A mensagem do Chrome: 4 bytes com o tamanho e o JSON (as nossas são curtas; o resto é ignorado).
tamanho=$(dd bs=1 count=4 2>/dev/null | od -An -tu4 | tr -d ' \n')
case "$tamanho" in ''|*[!0-9]*) tamanho=0 ;; esac
[ "$tamanho" -gt 4096 ] && tamanho=0
mensagem=$(dd bs=1 count="$tamanho" 2>/dev/null)
# O JavaScript do próprio macOS lê JSON, não código. A mensagem é um argumento de run,
# nunca interpolada no programa: só uma string na chave principal acao vale.
acao=$("$LER_JSON" -l JavaScript - "$mensagem" 2>/dev/null <<'JSON'
function run(argumentos) {
  try {
    var mensagem = JSON.parse(argumentos[0]);
    if (mensagem && typeof mensagem === 'object' && !Array.isArray(mensagem)
        && (mensagem.acao === 'conferir' || mensagem.acao === 'abrir' || mensagem.acao === 'consertar')) return mensagem.acao;
  } catch (erro) {}
  return 'acao_desconhecida';
}
JSON
)

# A resposta, do mesmo jeito: o tamanho (as respostas são curtas e só ASCII: um byte basta) e o JSON.
responder() {
  printf "\\$(printf '%03o' "${#1}")\\000\\000\\000"
  printf '%s' "$1"
}

if [ -d "$ANKI" ]; then achou=true; else achou=false; fi
abrir_o_anki() {
  [ "$achou" = true ] || return 1
  if [ -n "$PERFIL" ]; then
    "$ABRIR" -a "$ANKI" --args -p "$PERFIL" </dev/null >/dev/null 2>&1
  else
    "$ABRIR" -a "$ANKI" </dev/null >/dev/null 2>&1
  fi
}
@FUNCOES@
case "$acao" in
  conferir)
    responder "{\"achou\":$achou}" ;;
  abrir)
    abriu=false
    abrir_o_anki && abriu=true
    responder "{\"achou\":$achou,\"abriu\":$abriu}" ;;
  consertar)
    consertar ;;
  *)
    responder '{"erro":"acao_desconhecida"}' ;;
esac
"""


def _preencher(modelo, valores):
    return re.sub(r"@([A-Z]+)@", lambda marca: valores[marca.group(1)], modelo)


def _script_do_mac(abridor, mac, perfil):
    return _preencher(_MODELO_DO_MAC, {
        "DADOS": conserto_do_anki.variaveis_do_mac(abridor.conserto, abridor.pasta),
        "FUNCOES": conserto_do_anki.FUNCOES_DO_MAC,
        "ANKI": shlex.quote(abridor.programa),
        "PERFIL": shlex.quote(perfil or ""),
        "ABRIR": shlex.quote(mac.abrir_com),
        "LERJSON": shlex.quote(mac.ler_json_com),
    })


_BAT = "\r\n".join([
    "@echo off",
    "rem PerpetualMiner: o abridor do Anki (host de Native Messaging do Chrome e do Opera).",
    "rem A Conexao com o Anki escreve este arquivo quando o Anki abre: nao edite. O que ele faz esta no .ps1 ao lado.",
    "rem O Chrome roda este arquivo dentro da pasta do abridor: sai dela, para o Anki aberto nao segurar a pasta (Remover e atualizar).",
    'cd /d "%SystemRoot%"',
    '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive '
    '-ExecutionPolicy Bypass -File "%~dp0' + PS1_DO_WINDOWS + '"',
    "",
])

_MODELO_DO_PS1 = r"""# PerpetualMiner: o abridor do Anki, um host de Native Messaging do Chrome e do Opera.
# A Conexão com o Anki escreve este arquivo quando o Anki abre e quando um perfil abre: não edite.
# Só a extensão PerpetualMiner o chama (pelo .bat ao lado), e ele só faz três coisas:
#   conferir   responde se o Anki está no lugar abaixo, sem abrir nem fechar nada;
#   abrir      abre o Anki (no perfil abaixo, se houver);
#   consertar  fecha à força o Anki que não responde e abre de novo, ou liga o complemento desativado (conserto_do_anki.py).
$anki = @ANKI@
$perfil = @PERFIL@
@DADOS@

$ErrorActionPreference = 'Stop'

# A mensagem do Chrome: 4 bytes com o tamanho e o JSON (as nossas são curtas; o resto é ignorado).
$entrada = [Console]::OpenStandardInput()
$cabecalho = New-Object byte[] 4
$lidos = 0
while ($lidos -lt 4) { $n = $entrada.Read($cabecalho, $lidos, 4 - $lidos); if ($n -le 0) { break }; $lidos += $n }
$tamanho = 0
if ($lidos -eq 4) { $tamanho = [BitConverter]::ToInt32($cabecalho, 0) }
if ($tamanho -lt 0 -or $tamanho -gt 4096) { $tamanho = 0 }
$corpo = New-Object byte[] $tamanho
$lidos = 0
while ($lidos -lt $tamanho) { $n = $entrada.Read($corpo, $lidos, $tamanho - $lidos); if ($n -le 0) { break }; $lidos += $n }
$acao = $null
try {
  $json = [Text.Encoding]::UTF8.GetString($corpo)
  if ($json.TrimStart().StartsWith('{')) {
    $mensagem = $json | ConvertFrom-Json
    if ($mensagem -is [System.Management.Automation.PSCustomObject] -and
        $mensagem.PSObject.Properties.Name -ccontains 'acao' -and $mensagem.acao -is [string]) {
      $acao = $mensagem.acao
    }
  }
} catch { }

# A resposta, do mesmo jeito: o tamanho em 4 bytes e o JSON.
function Responder($resposta) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($resposta | ConvertTo-Json -Compress))
  $saida = [Console]::OpenStandardOutput()
  $saida.Write([BitConverter]::GetBytes([int32]$bytes.Length), 0, 4)
  $saida.Write($bytes, 0, $bytes.Length)
  $saida.Flush()
}

@FUNCOES@

$achou = Test-Path -LiteralPath $anki -PathType Leaf
if ($acao -ceq 'conferir') {
  Responder ([ordered]@{ achou = $achou })
} elseif ($acao -ceq 'abrir') {
  Responder ([ordered]@{ achou = $achou; abriu = [bool](AbrirOAnki) })
} elseif ($acao -ceq 'consertar') {
  Consertar
} else {
  Responder ([ordered]@{ erro = 'acao_desconhecida' })
}
"""


def _texto_do_powershell(texto):
    for aspa in "'‘’‚‛":
        texto = texto.replace(aspa, aspa * 2)
    return "'" + texto + "'"


def _ps1(abridor, perfil):
    return _preencher(_MODELO_DO_PS1, {
        "DADOS": conserto_do_anki.variaveis_do_ps1(abridor.conserto, abridor.pasta, _texto_do_powershell),
        "FUNCOES": conserto_do_anki.FUNCOES_DO_PS1,
        "ANKI": _texto_do_powershell(abridor.programa),
        "PERFIL": "$null" if perfil is None else _texto_do_powershell(perfil),
    }).replace("\n", "\r\n")
