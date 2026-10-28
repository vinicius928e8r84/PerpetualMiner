"""O que o abridor faz quando a Conexão não responde: consertar sem clique (#152, #102).

`{"acao": "consertar"}` (`abridor.py` escreve o script; aqui moram os trechos dele e o que ele precisa saber). A resposta é
sempre `{"situacao": …}`:

- `fechado`: o Anki não está rodando. A pessoa o fechou, e **um Anki fechado continua fechado**: nada é aberto nem fechado.
- `respondeu`: a Conexão respondeu antes dos 30 s. Nada a consertar.
- `reiniciado`: o Anki não respondeu em 30 s; o abridor o fechou à força e o abriu de novo.
- `ligado`: o Anki tinha desativado a Conexão (`disabled` no `meta.json`); o abridor fechou o Anki pelo caminho normal, ligou
  o complemento e abriu o Anki.
- `sumiu`: a pasta do complemento não tem mais o complemento.
- `falhou`, com `motivo`: `nao_fechou`, `nao_abriu`, `meta_ilegivel` ou `meta_nao_gravou`.

O que o abridor sabe do Anki vem do próprio Anki: quem escreve o script é o complemento, dentro do Anki, e anota o programa
(`sys.executable`) que roda o Anki. Só os processos que rodam exatamente esse programa **agora** (a lista de processos, lida a
cada passo) são fechados: nunca se procura por nome (`pkill anki`), e um `pid` anotado não serviria, porque com a Conexão
desativada o Anki reabre sem o complemento e o `pid` do script já é de um Anki que saiu. Antes de fechar à força o abridor
confere de novo que o Anki ainda roda (uma pessoa que o fechou durante a espera o encontra fechado). Perguntar se a Conexão
responde é pedir a lista de perfis (`POST /anki/profiles`), que só volta com a thread principal do Anki viva: o `/health`
responde mesmo com o Anki travado.

O `meta.json` só tem uma marca mexida, a `disabled` do topo: o resto fica como estava. O de antes fica em
`user_files/abridor/meta.json.antes`, e a troca é de uma vez (escreve ao lado e troca). Fechar o Anki **antes** de mexer no
arquivo evita que ele regrave o dele por cima.

Custo aceito pelo dono: fechar à força pode perder o Cartão que a pessoa estava editando. Fechar à força e ligar pelo
`meta.json` não foram testados num Mac nem num Windows de verdade (risco 3 do #138): os testes (`test_conserto.py`) rodam o
script do Mac com programas de mentira, e o `.ps1` do Windows só se confere por inspeção.
"""

import shlex

from .configuracao import ENDERECO, ORIGENS_ACEITAS, PORTA

ESPERA_PADRAO_S = 30
PROGRAMAS_DO_MAC = {
    "ps": "/bin/ps",
    "curl": "/usr/bin/curl",
    "kill": "/bin/kill",
    "sleep": "/bin/sleep",
    "date": "/bin/date",
}
NOME_DA_COPIA = "meta.json.antes"


class Conserto:
    """O que o abridor precisa saber do Anki que o escreveu para consertá-lo. Sem `executavel`, ele nunca fecha nada.

    `espera_s` é a espera sem resposta antes de fechar à força (os testes passam menos, com o relógio de mentira);
    `programas` troca `ps`, `curl`, `kill`, `sleep` e `date` do Mac (os testes passam os de mentira).
    """

    def __init__(self, *, executavel=None, complemento=None, porta=PORTA, espera_s=ESPERA_PADRAO_S, programas=None):
        self.executavel = executavel
        self.complemento = complemento
        self.porta = porta
        self.espera_s = espera_s
        self.programas = dict(PROGRAMAS_DO_MAC, **(programas or {}))

    @property
    def url(self):
        return "http://%s:%d/anki/profiles" % (ENDERECO, self.porta)

    @property
    def origem(self):
        return ORIGENS_ACEITAS[0]


def variaveis_do_mac(conserto, pasta_do_abridor):
    """As linhas `NOME=valor` do script do Mac."""
    valores = [
        ("EXECUTAVEL", conserto.executavel or ""),
        ("COMPLEMENTO", conserto.complemento or ""),
        ("COPIA", pasta_do_abridor + "/" + NOME_DA_COPIA),
        ("URL", conserto.url),
        ("ORIGEM", conserto.origem),
        ("ESPERA", str(int(conserto.espera_s))),
    ] + [(nome.upper(), caminho) for nome, caminho in sorted(conserto.programas.items())]
    return "\n".join("%s=%s" % (nome, shlex.quote(valor)) for nome, valor in valores) + '\nMETA="$COMPLEMENTO/meta.json"'


FUNCOES_DO_MAC = r"""
# consertar: os processos que rodam agora o programa que a Conexão anotou (EXECUTAVEL, o do Anki), e só eles.
anki_pids() {
  [ -n "$EXECUTAVEL" ] || return 0
  "$PS" -axww -o pid= -o command= 2>/dev/null | while read -r pid comando; do
    case "$comando" in
      "$EXECUTAVEL"|"$EXECUTAVEL "*) echo "$pid" ;;
    esac
  done
}
anki_rodando() { [ -n "$(anki_pids)" ]; }
sinalizar_o_anki() { for pid in $(anki_pids); do "$KILL" "$1" "$pid" >/dev/null 2>&1; done; }
agora() { "$DATE" +%s; }
# A lista de perfis só volta com a thread principal do Anki viva (o /health responde mesmo com o Anki travado).
conexao_responde() {
  "$CURL" -s -f -m 3 -o /dev/null -X POST -H "Origin: $ORIGEM" -H 'Content-Type: application/json' -d '{}' "$URL" </dev/null >/dev/null 2>&1
}
esperar_o_anki_sair() {
  inicio=$(agora)
  while anki_rodando; do
    [ $(( $(agora) - inicio )) -ge "$1" ] && return 1
    "$SLEEP" 2
  done
  return 0
}
falhou() { responder "{\"situacao\":\"falhou\",\"motivo\":\"$1\"}"; }
# O meta.json do Anki: "ligado" (nada a ligar), vazio (ilegível) ou o conteúdo novo, só com o disabled do topo desligado.
estado_do_meta() {
  [ -f "$META" ] || { printf ligado; return; }
  "$LER_JSON" -l JavaScript - "$(cat "$META" 2>/dev/null)" 2>/dev/null <<'JSON'
function run(argumentos) {
  try {
    var meta = JSON.parse(argumentos[0]);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
    if (meta.disabled !== true) return 'ligado';
    meta.disabled = false;
    return JSON.stringify(meta, null, 2);
  } catch (erro) {}
  return '';
}
JSON
}
guardar_o_meta() {
  cat "$META" > "$COPIA.novo" 2>/dev/null && mv -f "$COPIA.novo" "$COPIA" \
    && printf '%s\n' "$novo" > "$META.novo" && mv -f "$META.novo" "$META" && return 0
  rm -f "$COPIA.novo" "$META.novo"
  return 1
}
# O complemento desativado: fecha o Anki pelo caminho normal (nunca à força), liga e abre.
ligar_e_reiniciar() {
  sinalizar_o_anki -TERM
  esperar_o_anki_sair "$ESPERA" || { falhou nao_fechou; return; }
  guardar_o_meta || { falhou meta_nao_gravou; return; }
  abrir_o_anki || { falhou nao_abriu; return; }
  responder '{"situacao":"ligado"}'
}
# Sem resposta por ESPERA segundos: fecha à força e abre. Um Anki que a pessoa fechou no meio da espera continua fechado.
reiniciar_o_que_travou() {
  inicio=$(agora)
  while :; do
    anki_rodando || { responder '{"situacao":"fechado"}'; return; }
    conexao_responde && { responder '{"situacao":"respondeu"}'; return; }
    [ $(( $(agora) - inicio )) -ge "$ESPERA" ] && break
    "$SLEEP" 2
  done
  sinalizar_o_anki -KILL
  esperar_o_anki_sair 10 || { falhou nao_fechou; return; }
  abrir_o_anki || { falhou nao_abriu; return; }
  responder '{"situacao":"reiniciado"}'
}
consertar() {
  anki_rodando || { responder '{"situacao":"fechado"}'; return; }
  [ -f "$COMPLEMENTO/__init__.py" ] || { responder '{"situacao":"sumiu"}'; return; }
  novo=$(estado_do_meta)
  case "$novo" in
    '') falhou meta_ilegivel ;;
    ligado) reiniciar_o_que_travou ;;
    *) ligar_e_reiniciar ;;
  esac
}
"""


def variaveis_do_ps1(conserto, pasta_do_abridor, texto_do_powershell):
    """As linhas `$nome = valor` do `.ps1`; `texto_do_powershell` põe um texto entre aspas simples."""
    return "\n".join([
        "$programaDoAnki = " + texto_do_powershell(conserto.executavel or ""),
        "$complemento = " + texto_do_powershell(conserto.complemento or ""),
        "$copia = " + texto_do_powershell(pasta_do_abridor + "\\" + NOME_DA_COPIA),
        "$url = " + texto_do_powershell(conserto.url),
        "$origem = " + texto_do_powershell(conserto.origem),
        "$espera = " + str(int(conserto.espera_s)),
    ])


FUNCOES_DO_PS1 = r"""
function AbrirOAnki {
  if (-not (Test-Path -LiteralPath $anki -PathType Leaf)) { return $false }
  try {
    # O Windows não deixa aspas num nome de pasta, e o perfil do Anki é uma pasta: as aspas em volta bastam.
    if ($perfil) { Start-Process -FilePath $anki -ArgumentList ('-p "' + $perfil + '"') } else { Start-Process -FilePath $anki }
    return $true
  } catch { return $false }
}

# consertar: os processos que rodam agora o programa que a Conexão anotou ($programaDoAnki, o do Anki), e só eles.
function ProcessosDoAnki {
  if (-not $programaDoAnki) { return @() }
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $programaDoAnki } catch { $false } })
}
function AnkiRodando { return (@(ProcessosDoAnki).Count -gt 0) }
# A lista de perfis só volta com a thread principal do Anki viva (o /health responde mesmo com o Anki travado).
function ConexaoResponde {
  try {
    $resposta = Invoke-WebRequest -Uri $url -Method Post -Body '{}' -ContentType 'application/json' -Headers @{ Origin = $origem } -UseBasicParsing -TimeoutSec 3
    return ($resposta.StatusCode -eq 200)
  } catch { return $false }
}
function EsperarOAnkiSair($segundos) {
  $inicio = Get-Date
  while (AnkiRodando) {
    if (((Get-Date) - $inicio).TotalSeconds -ge $segundos) { return $false }
    Start-Sleep -Seconds 1
  }
  return $true
}
function Falhou($motivo) { Responder ([ordered]@{ situacao = 'falhou'; motivo = $motivo }) }

function Consertar {
  if (-not (AnkiRodando)) { Responder ([ordered]@{ situacao = 'fechado' }); return }
  if (-not (Test-Path -LiteralPath (Join-Path $complemento '__init__.py') -PathType Leaf)) { Responder ([ordered]@{ situacao = 'sumiu' }); return }
  $metaCaminho = Join-Path $complemento 'meta.json'
  $novo = $null
  if (Test-Path -LiteralPath $metaCaminho -PathType Leaf) {
    try {
      $meta = [IO.File]::ReadAllText($metaCaminho, [Text.Encoding]::UTF8) | ConvertFrom-Json
      if ($meta -isnot [System.Management.Automation.PSCustomObject]) { throw 'meta' }
      if ($meta.disabled -eq $true) { $meta.disabled = $false; $novo = $meta | ConvertTo-Json -Depth 32 }
    } catch { Falhou 'meta_ilegivel'; return }
  }
  if ($null -ne $novo) {
    # O complemento desativado: fecha o Anki pelo caminho normal (nunca à força), guarda o meta.json de antes, liga e abre.
    foreach ($processo in ProcessosDoAnki) { [void]$processo.CloseMainWindow() }
    if (-not (EsperarOAnkiSair $espera)) { Falhou 'nao_fechou'; return }
    try {
      [IO.File]::Copy($metaCaminho, $copia, $true)
      $provisorio = $metaCaminho + '.novo'
      [IO.File]::WriteAllText($provisorio, $novo, (New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath $provisorio -Destination $metaCaminho -Force
    } catch { Falhou 'meta_nao_gravou'; return }
    if (-not (AbrirOAnki)) { Falhou 'nao_abriu'; return }
    Responder ([ordered]@{ situacao = 'ligado' })
    return
  }
  # Sem resposta por $espera segundos: fecha à força e abre. Um Anki que a pessoa fechou no meio da espera continua fechado.
  $inicio = Get-Date
  while ($true) {
    if (-not (AnkiRodando)) { Responder ([ordered]@{ situacao = 'fechado' }); return }
    if (ConexaoResponde) { Responder ([ordered]@{ situacao = 'respondeu' }); return }
    if (((Get-Date) - $inicio).TotalSeconds -ge $espera) { break }
    Start-Sleep -Seconds 2
  }
  ProcessosDoAnki | Stop-Process -Force -ErrorAction SilentlyContinue
  if (-not (EsperarOAnkiSair 10)) { Falhou 'nao_fechou'; return }
  if (-not (AbrirOAnki)) { Falhou 'nao_abriu'; return }
  Responder ([ordered]@{ situacao = 'reiniciado' })
}
"""
