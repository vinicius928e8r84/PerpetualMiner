"""O que o abridor faz quando a Conexão não responde: consertar sem clique (#152, #102).

`{"acao": "consertar"}` (`abridor.py` escreve o script; aqui moram os trechos dele e o que ele precisa saber). A resposta é
sempre `{"situacao": …}`:

- `fechado`: o Anki não está rodando quando o `consertar` começa. A pessoa o fechou, e **um Anki fechado continua fechado**: nada é
  fechado, e a extensão, que o pediu, é quem decide abrir.
- `fechou`: o Anki rodava quando o `consertar` começou e a pessoa o fechou durante a espera (ou ele saiu antes de o abridor
  conseguir sinalizá-lo): nada é aberto, nem a extensão deve abrir.
- `respondeu`: a Conexão respondeu antes dos 30 s. Nada a consertar.
- `reiniciado`: o Anki não respondeu em 30 s; o abridor o fechou à força e o abriu de novo.
- `ligado`: o Anki tinha desativado a Conexão (`disabled` no `meta.json`); o abridor fechou o Anki pelo caminho normal, ligou
  o complemento e abriu o Anki.
- `sumiu`: a pasta do complemento não tem mais o complemento.
- `falhou`, com `motivo`: `nao_fechou`, `nao_abriu`, `meta_ilegivel`, `meta_nao_gravou` ou `conexao_fora` (o Anki roda e não é ele
  quem ouve a porta da Conexão: outro programa a ocupa, ou a Conexão não subiu. O Anki está saudável e **nada é fechado**).

O que o abridor sabe do Anki vem do próprio Anki: quem escreve o script é o complemento, dentro do Anki, e anota o programa
(`sys.executable`) que roda o Anki. Só os processos que rodam exatamente esse programa **agora** (a lista de processos, lida a
cada passo, só os da própria pessoa) são fechados e, no Windows do instalador novo, também o filho CPython desse programa
(`FilhosDoAnki`, pela árvore de processos). Nunca se procura por nome (`pkill anki`), e um `pid` anotado não serviria,
porque com a Conexão desativada o Anki reabre sem o complemento e o `pid` do script já é de um Anki que saiu. Só se fecha à força
o Anki que **trava de verdade**: todo processo que ouve a porta da Conexão tem que ser do Anki (Mac: `lsof`; Windows:
`Get-NetTCPConnection`), senão é `conexao_fora` e nada é morto (também quando outro programa divide a porta com o Anki), e a força
vai só aos pids que ouvem a porta, não a todo processo que roda o programa do Anki. E só se abre o Anki depois que ao menos um
processo recebeu o sinal (no Windows, `CloseMainWindow()` devolveu verdadeiro): se nenhum recebeu porque o Anki já tinha saído, é
`fechou`. Perguntar se a Conexão responde é pedir a lista de perfis (`POST /anki/profiles`), que só volta com a thread principal do
Anki viva: o `/health` responde mesmo com o Anki travado.

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
    "lsof": "/usr/sbin/lsof",
    "id": "/usr/bin/id",
}
NOME_DA_COPIA = "meta.json.antes"


class Conserto:
    """O que o abridor precisa saber do Anki que o escreveu para consertá-lo. Sem `executavel`, ele nunca fecha nada.

    `espera_s` é a espera sem resposta antes de fechar à força (os testes passam menos, com o relógio de mentira);
    `programas` troca `ps`, `curl`, `kill`, `sleep`, `date`, `lsof` e `id` do Mac (os testes passam os de mentira).
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
        ("PORTA", str(int(conserto.porta))),
    ] + [(nome.upper(), caminho) for nome, caminho in sorted(conserto.programas.items())]
    return "\n".join("%s=%s" % (nome, shlex.quote(valor)) for nome, valor in valores) + '\nMETA="$COMPLEMENTO/meta.json"'


FUNCOES_DO_MAC = r"""
# consertar: os processos da própria pessoa que rodam agora o programa que a Conexão anotou (EXECUTAVEL, o do Anki), e só eles.
anki_pids() {
  [ -n "$EXECUTAVEL" ] || return 0
  "$PS" -x -U "$("$ID" -u)" -ww -o pid= -o command= 2>/dev/null | while read -r pid comando; do
    case "$comando" in
      "$EXECUTAVEL"|"$EXECUTAVEL "*) echo "$pid" ;;
    esac
  done
}
anki_rodando() { [ -n "$(anki_pids)" ]; }
# Manda o sinal ($1) aos pids que vierem depois; só dá certo (0) se algum recebeu.
sinalizar() {
  sinal=$1; shift; recebeu=1
  for pid in "$@"; do "$KILL" "$sinal" "$pid" >/dev/null 2>&1 && recebeu=0; done
  return $recebeu
}
# Os pids que ouvem a porta da Conexão, se TODOS são do Anki. Outro programa na porta (mesmo dividindo-a com o Anki), ou ninguém,
# não é um Anki travado: sem saída, e nada é morto.
donos_da_conexao() {
  pids=$(anki_pids); donos=
  for ouvinte in $("$LSOF" -nP -iTCP:"$PORTA" -sTCP:LISTEN -t 2>/dev/null); do
    do_anki=1
    for pid in $pids; do [ "$ouvinte" = "$pid" ] && do_anki=0; done
    [ $do_anki = 0 ] || return 1
    case " $donos " in *" $ouvinte "*) ;; *) donos="$donos $ouvinte" ;; esac
  done
  [ -n "$donos" ] && echo $donos
}
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
fechou() { responder '{"situacao":"fechou"}'; }
# Nenhum processo recebeu o sinal: ou o Anki já tinha saído (a pessoa o fechou) ou o sinal não o alcança.
ninguem_recebeu() { if anki_rodando; then falhou nao_fechou; else fechou; fi; }
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
  sinalizar -TERM $(anki_pids) || { ninguem_recebeu; return; }
  esperar_o_anki_sair "$ESPERA" || { falhou nao_fechou; return; }
  guardar_o_meta || { falhou meta_nao_gravou; return; }
  abrir_o_anki || { falhou nao_abriu; return; }
  responder '{"situacao":"ligado"}'
}
# Sem resposta por ESPERA segundos: fecha à força e abre, mas só os pids que são donos da porta da Conexão (o Anki travado de verdade).
# Um Anki que a pessoa fechou no meio da espera continua fechado (fechou).
reiniciar_o_que_travou() {
  inicio=$(agora)
  while :; do
    anki_rodando || { fechou; return; }
    conexao_responde && { responder '{"situacao":"respondeu"}'; return; }
    [ $(( $(agora) - inicio )) -ge "$ESPERA" ] && break
    "$SLEEP" 2
  done
  anki_rodando || { fechou; return; }
  donos=$(donos_da_conexao) || { if anki_rodando; then falhou conexao_fora; else fechou; fi; return; }
  sinalizar -KILL $donos || { ninguem_recebeu; return; }
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
        "$porta = " + str(int(conserto.porta)),
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

# consertar: os processos que rodam agora o programa que a Conexão anotou ($programaDoAnki, o do Anki), e os filhos dele que são o
# mesmo Anki, e só eles. No Anki do instalador novo o programa anotado é o redirecionador do .venv (pythonw.exe), que roda o
# CPython de verdade como filho, com os mesmos argumentos (`-c "import aqt, sys; ...; aqt.run()"`), e é o filho quem ouve a porta
# da Conexão. Um filho é do Anki quando os argumentos dele são os do aqt.run(), são iguais aos do pai, e o pai (na cadeia, de filho
# a pai, todos com esses argumentos) é um processo do programa anotado e nasceu antes dele (o pid de um pai que saiu pode ter sido
# reusado). Nome do programa sozinho, ou a linha do aqt.run() sozinha, não bastam. Sem ler a tabela de processos, vale só o programa.
# Os argumentos de uma linha de comando: o que vem depois do programa (o primeiro item, entre aspas ou não).
function ArgumentosDaLinha($linha) {
  $linha = ([string]$linha).Trim()
  if ($linha.StartsWith('"')) { $fim = $linha.IndexOf('"', 1); if ($fim -lt 0) { return '' }; return $linha.Substring($fim + 1).Trim() }
  $espaco = $linha.IndexOf(' ')
  if ($espaco -lt 0) { return '' }
  return $linha.Substring($espaco + 1).Trim()
}
function FilhosDoAnki($doPrograma, $todos) {
  $filhos = @()
  try {
    $tabela = @{}
    foreach ($p in @(Get-CimInstance Win32_Process)) { $tabela[[int]$p.ProcessId] = $p }
    $ids = @($doPrograma | ForEach-Object { [int]$_.Id })
    foreach ($candidato in $todos) {
      $id = [int]$candidato.Id
      if ($ids -contains $id -or -not $tabela.ContainsKey($id)) { continue }
      $linha = ArgumentosDaLinha $tabela[$id].CommandLine
      if ($linha -cnotmatch 'aqt\.run\(\)') { continue }
      $atual = $tabela[$id]; $n = 0
      while ($n -lt 8) {
        $pai = [int]$atual.ParentProcessId
        if ($pai -le 0 -or -not $tabela.ContainsKey($pai)) { break }
        $acima = $tabela[$pai]
        if ((ArgumentosDaLinha $acima.CommandLine) -cne $linha) { break }
        if ($acima.CreationDate -and $atual.CreationDate -and $acima.CreationDate -gt $atual.CreationDate) { break }
        if ($ids -contains $pai) { $filhos += $candidato; break }
        $atual = $acima; $n++
      }
    }
  } catch { return @() }
  return $filhos
}
function ProcessosDoAnki {
  if (-not $programaDoAnki) { return @() }
  $todos = @(Get-Process -ErrorAction SilentlyContinue)
  $doPrograma = @($todos | Where-Object { try { $_.Path -ieq $programaDoAnki } catch { $false } })
  if ($doPrograma.Count -eq 0) { return @() }
  return @($doPrograma) + @(FilhosDoAnki $doPrograma $todos)
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
# Os pids que ouvem a porta da Conexão, se TODOS são do Anki. Outro programa na porta (mesmo dividindo-a com o Anki), ou ninguém,
# não é um Anki travado: nada volta, e nada é morto.
function DonosDaConexao {
  try {
    $donos = @(Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction Stop | ForEach-Object { [int]$_.OwningProcess } | Select-Object -Unique)
    $pidsDoAnki = @(ProcessosDoAnki | ForEach-Object { $_.Id })
    foreach ($dono in $donos) { if ($pidsDoAnki -notcontains $dono) { return @() } }
    return $donos
  } catch { return @() }
}
function Falhou($motivo) { Responder ([ordered]@{ situacao = 'falhou'; motivo = $motivo }) }
function Fechou { Responder ([ordered]@{ situacao = 'fechou' }) }
# Nenhum processo recebeu o sinal: ou o Anki já tinha saído (a pessoa o fechou) ou o sinal não o alcança.
function NinguemRecebeu { if (AnkiRodando) { Falhou 'nao_fechou' } else { Fechou } }

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
    $achados = @(ProcessosDoAnki)
    if ($achados.Count -eq 0) { Fechou; return }
    $recebeu = 0
    foreach ($processo in $achados) { try { if ($processo.CloseMainWindow()) { $recebeu++ } } catch {} }
    if ($recebeu -eq 0) { NinguemRecebeu; return }
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
  # Sem resposta por $espera segundos: fecha à força e abre, mas só os pids que são donos da porta da Conexão (o Anki travado de verdade).
  # Um Anki que a pessoa fechou no meio da espera continua fechado (fechou).
  $inicio = Get-Date
  while ($true) {
    if (-not (AnkiRodando)) { Fechou; return }
    if (ConexaoResponde) { Responder ([ordered]@{ situacao = 'respondeu' }); return }
    if (((Get-Date) - $inicio).TotalSeconds -ge $espera) { break }
    Start-Sleep -Seconds 2
  }
  if (-not (AnkiRodando)) { Fechou; return }
  $donos = @(DonosDaConexao)
  if ($donos.Count -eq 0) { if (AnkiRodando) { Falhou 'conexao_fora' } else { Fechou }; return }
  $recebeu = 0
  foreach ($dono in $donos) { try { Stop-Process -Id $dono -Force -ErrorAction Stop; $recebeu++ } catch {} }
  if ($recebeu -eq 0) { NinguemRecebeu; return }
  if (-not (EsperarOAnkiSair 10)) { Falhou 'nao_fechou'; return }
  if (-not (AbrirOAnki)) { Falhou 'nao_abriu'; return }
  Responder ([ordered]@{ situacao = 'reiniciado' })
}
"""
