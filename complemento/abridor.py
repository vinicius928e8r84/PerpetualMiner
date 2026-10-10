"""O abridor: o script pequeno que deixa a extensão abrir o Anki fechado (#118, #147).

A Conexão escreve o script com o caminho do Anki e o perfil (`.sh` no Mac; no Windows, um `.bat` que
chama o `.ps1` ao lado) e o registra como host de Native Messaging do Chrome e do Opera. A extensão o
chama por `chrome.runtime.sendNativeMessage` (a permissão `nativeMessaging` é opcional, pedida no passo
Abrir o Anki sozinho), e nada fica ligado em segundo plano: o navegador roda o script, ele responde uma
vez e sai.

O perfil é o do último perfil aberto neste Anki (reescrito a cada `profile_did_open`; ao carregar, nenhum, e o
script abre o Anki sem `-p`). O perfil fixo da primeira conexão (história 19 do #138) é de outro ticket, e troca isto.

O script só sabe duas coisas, pelas mensagens de `contrato/exemplos.json` › `abridor`:

- `conferir`: responde se o Anki está no lugar anotado (`{"achou": …}`), sem abrir nem fechar nada;
- `abrir`: abre o Anki, no perfil anotado se houver (`-p "<perfil>"`), e responde se abriu.

Qualquer outra mensagem é `{"erro": "acao_desconhecida"}`. Reiniciar, fechar à força e ligar o complemento
desativado (#102) não são deste arquivo.

Onde se registra:

- **Mac**: o manifesto do host na pasta de hosts do Chrome do usuário
  (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts`); o script fica em `user_files/abridor`. Só o
  Chrome: o critério do #147 pede o Opera no Windows, e onde o Opera do Mac procura não foi conferido.
- **Windows**: o script, o `.ps1` e o manifesto em `user_files/abridor`, e o caminho do manifesto no valor
  padrão de `HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\<host>`. No ensaio W4 de
  2026-10-10, o Opera GX 136 num Windows real encontrou e chamou o host registrado só nessa chave HKCU do Chrome.
  Isso não confirma outros builds do Opera. A ajuda do Opera (“Passing Messages in Extensions”) cita HKLM,
  não HKCU: a evidência de HKCU é o ensaio real, não essa documentação. `ONDE_REGISTRAR_NO_WINDOWS`
  mantém a entrada do Opera para ajustar o destino caso outro ensaio mostre uma chave diferente.

Só a biblioteca padrão. A escrita é de uma vez (escreve ao lado e troca), e reescrever troca o perfil sem
duplicar nada. O que o Chrome e o Opera fazem com o host só o ensaio do dono confere (riscos 1 e 2 do #138).
"""

import json
import ntpath
import os
import posixpath
import re
import shlex
import tempfile

from .configuracao import ORIGENS_ACEITAS
from .item_de_login import AnkiNaoEncontrado, aplicativo_do_anki_no_mac, programa_do_anki_no_windows

NOME_DO_HOST = "com.perpetualminer.abridor"
DESCRICAO = "PerpetualMiner: abre o Anki para a Conexão com o Anki"

# Chave do usuário: Chrome; Opera GX 136 confirmado no Windows real (W4), sem generalizar a outros builds.
ONDE_REGISTRAR_NO_WINDOWS = {
    "Chrome": r"Software\Google\Chrome\NativeMessagingHosts",
    "Opera": r"Software\Google\Chrome\NativeMessagingHosts",
}

SCRIPT_DO_MAC = "abrir-o-anki.sh"
BAT_DO_WINDOWS = "abrir-o-anki.bat"
PS1_DO_WINDOWS = "abrir-o-anki.ps1"

__all__ = ["Abridor", "AnkiNaoEncontrado", "RegistroDoWindows", "deste_computador", "NOME_DO_HOST"]


class RegistroDoWindows:
    """O `HKEY_CURRENT_USER` de verdade: só existe no Windows (os testes usam um de mentira)."""

    def gravar(self, chave, valor):
        import winreg

        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, chave, 0, winreg.KEY_WRITE) as aberta:
            winreg.SetValueEx(aberta, "", 0, winreg.REG_SZ, valor)


class Abridor:
    """O abridor de um `sistema` (`"mac"` ou `"windows"`), escrito em `pasta`, para o Anki em `programa`.

    `onde_registrar` diz, por navegador, a pasta de hosts (Mac) ou a chave do registro (Windows, gravada
    por `registro`). `abrir_com` é o `open` do Mac (os testes trocam por um programa que anota o que recebeu).
    """

    def __init__(self, *, sistema, pasta, programa, onde_registrar, registro=None, abrir_com="/usr/bin/open", ler_json_com="/usr/bin/osascript"):
        if sistema not in ("mac", "windows"):
            raise ValueError("sistema sem abridor: %r" % (sistema,))
        self.sistema = sistema
        self.pasta = pasta
        self.programa = programa
        self.onde_registrar = onde_registrar
        self.registro = registro
        self.abrir_com = abrir_com
        self.ler_json_com = ler_json_com

    def escrever(self, perfil):
        """Escreve o script com o `perfil` (None: abre sem escolher perfil) e registra o host.

        Levanta `AnkiNaoEncontrado` (nada é escrito) ou o `OSError` da escrita.
        """
        if not self.programa:
            raise AnkiNaoEncontrado("não se sabe onde o Anki está neste computador")
        os.makedirs(self.pasta, exist_ok=True)
        if self.sistema == "mac":
            script = os.path.join(self.pasta, SCRIPT_DO_MAC)
            _gravar(script, _script_do_mac(self.programa, perfil, self.abrir_com, self.ler_json_com).encode("utf-8"), modo=0o700)
            for pasta_de_hosts in _sem_repetir(self.onde_registrar.values()):
                os.makedirs(pasta_de_hosts, exist_ok=True)
                _gravar(os.path.join(pasta_de_hosts, NOME_DO_HOST + ".json"), _manifesto(script))
        else:
            script = os.path.join(self.pasta, BAT_DO_WINDOWS)
            _gravar(os.path.join(self.pasta, PS1_DO_WINDOWS), b"\xef\xbb\xbf" + _ps1(self.programa, perfil).encode("utf-8"))
            _gravar(script, _BAT.encode("ascii"))
            manifesto = os.path.join(self.pasta, NOME_DO_HOST + ".json")
            _gravar(manifesto, _manifesto(script))
            for chave in _sem_repetir(self.onde_registrar.values()):
                self.registro.gravar(chave + "\\" + NOME_DO_HOST, manifesto)


def deste_computador(*, plataforma, ambiente, executavel, pasta, registro=None, existe=os.path.exists):
    """O abridor deste computador, escrito em `pasta`; `None` onde não há (só Mac e Windows)."""
    if plataforma == "darwin":
        casa = ambiente.get("HOME") or os.path.expanduser("~")
        hosts = posixpath.join(casa, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")
        programa = aplicativo_do_anki_no_mac(ambiente, executavel)
        if programa is None and existe("/Applications/Anki.app"):
            programa = "/Applications/Anki.app"
        return Abridor(sistema="mac", pasta=pasta, programa=programa, onde_registrar={"Chrome": hosts})
    if plataforma == "win32":
        return Abridor(
            sistema="windows",
            pasta=pasta,
            programa=programa_do_anki_no_windows(ambiente, executavel, existe),
            onde_registrar=dict(ONDE_REGISTRAR_NO_WINDOWS),
            registro=registro if registro is not None else RegistroDoWindows(),
        )
    return None


def _sem_repetir(valores):
    vistos = []
    for valor in valores:
        if valor not in vistos:
            vistos.append(valor)
    return vistos


def _gravar(caminho, conteudo, modo=None):
    """Escreve ao lado e troca de uma vez: o navegador nunca roda um script pela metade."""
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
    """O manifesto do host: só a extensão PerpetualMiner pode chamá-lo."""
    return (json.dumps({
        "name": NOME_DO_HOST,
        "description": DESCRICAO,
        "path": script,
        "type": "stdio",
        "allowed_origins": [origem + "/" for origem in ORIGENS_ACEITAS],
    }, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


# ─── O script do Mac ───────────────────────────────────────────────────────────

_MODELO_DO_MAC = r"""#!/bin/sh
# PerpetualMiner: o abridor do Anki, um host de Native Messaging do Chrome.
# A Conexão com o Anki escreve este arquivo quando o Anki abre e quando um perfil abre: não edite.
# Só a extensão PerpetualMiner o chama, e ele só faz duas coisas:
#   conferir  responde se o Anki está no lugar abaixo, sem abrir nem fechar nada;
#   abrir     abre o Anki (no perfil abaixo, se houver).
ANKI=@ANKI@
PERFIL=@PERFIL@
ABRIR=@ABRIR@
LER_JSON=@LERJSON@

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
        && (mensagem.acao === 'conferir' || mensagem.acao === 'abrir')) return mensagem.acao;
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
case "$acao" in
  conferir)
    responder "{\"achou\":$achou}" ;;
  abrir)
    abriu=false
    if [ "$achou" = true ]; then
      if [ -n "$PERFIL" ]; then
        "$ABRIR" -a "$ANKI" --args -p "$PERFIL" </dev/null >/dev/null 2>&1 && abriu=true
      else
        "$ABRIR" -a "$ANKI" </dev/null >/dev/null 2>&1 && abriu=true
      fi
    fi
    responder "{\"achou\":$achou,\"abriu\":$abriu}" ;;
  *)
    responder '{"erro":"acao_desconhecida"}' ;;
esac
"""


def _preencher(modelo, valores):
    """Troca cada `@NOME@` do modelo numa passada só: um valor que traz `@PERFIL@` (num caminho, num perfil) nunca é trocado de novo."""
    return re.sub(r"@([A-Z]+)@", lambda marca: valores[marca.group(1)], modelo)


def _script_do_mac(aplicativo, perfil, abrir_com, ler_json_com):
    return _preencher(_MODELO_DO_MAC, {
        "ANKI": shlex.quote(aplicativo),
        "PERFIL": shlex.quote(perfil or ""),
        "ABRIR": shlex.quote(abrir_com),
        "LERJSON": shlex.quote(ler_json_com),
    })


# ─── O script do Windows ───────────────────────────────────────────────────────

# O `.bat` é o que o Chrome roda (pelo cmd.exe). Ele só chama o PowerShell do próprio Windows, pelo caminho
# completo, com o `.ps1` que está ao lado: a conversa do Native Messaging tem bytes que o cmd não lê.
# `-ExecutionPolicy Bypass` vale só para este processo: a política padrão do Windows (Restricted) não roda nenhum
# `.ps1`, nem o nosso. Uma política de grupo da máquina ainda vence, e então o passo diz que o abridor não respondeu.
# Só ASCII: o cmd lê o `.bat` na página de código do console, e os caminhos com acento ficam no `.ps1`.
_BAT = "\r\n".join([
    "@echo off",
    "rem PerpetualMiner: o abridor do Anki (host de Native Messaging do Chrome e do Opera).",
    "rem A Conexao com o Anki escreve este arquivo quando o Anki abre: nao edite. O que ele faz esta no .ps1 ao lado.",
    '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive '
    '-ExecutionPolicy Bypass -File "%~dp0' + PS1_DO_WINDOWS + '"',
    "",
])

_MODELO_DO_PS1 = r"""# PerpetualMiner: o abridor do Anki, um host de Native Messaging do Chrome e do Opera.
# A Conexão com o Anki escreve este arquivo quando o Anki abre e quando um perfil abre: não edite.
# Só a extensão PerpetualMiner o chama (pelo .bat ao lado), e ele só faz duas coisas:
#   conferir  responde se o Anki está no lugar abaixo, sem abrir nem fechar nada;
#   abrir     abre o Anki (no perfil abaixo, se houver).
$anki = @ANKI@
$perfil = @PERFIL@

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

$achou = Test-Path -LiteralPath $anki -PathType Leaf
if ($acao -ceq 'conferir') {
  Responder ([ordered]@{ achou = $achou })
} elseif ($acao -ceq 'abrir') {
  $abriu = $false
  if ($achou) {
    try {
      # O Windows não deixa aspas num nome de pasta, e o perfil do Anki é uma pasta: as aspas em volta bastam.
      if ($perfil) { Start-Process -FilePath $anki -ArgumentList ('-p "' + $perfil + '"') } else { Start-Process -FilePath $anki }
      $abriu = $true
    } catch { }
  }
  Responder ([ordered]@{ achou = $achou; abriu = $abriu })
} else {
  Responder ([ordered]@{ erro = 'acao_desconhecida' })
}
"""


def _texto_do_powershell(texto):
    """Um texto entre aspas simples do PowerShell: nada dentro se expande, e cada aspa (também as curvas, que o
    PowerShell aceita como aspa simples) vai dobrada."""
    for aspa in "'‘’‚‛":
        texto = texto.replace(aspa, aspa * 2)
    return "'" + texto + "'"


def _ps1(programa, perfil):
    return _preencher(_MODELO_DO_PS1, {
        "ANKI": _texto_do_powershell(programa),
        "PERFIL": "$null" if perfil is None else _texto_do_powershell(perfil),
    }).replace("\n", "\r\n")
