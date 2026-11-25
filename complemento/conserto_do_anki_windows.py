FUNCOES_DO_PS1 = r"""
# A pasta onde o Anki nasce: o Chrome roda o abridor com `user_files\abridor` como diretório corrente, e o Anki que herdasse essa
# pasta a seguraria aberta (o Remover da Conexão e a atualização dela falham com WinError 32). A pasta da pessoa, ou a do Windows.
function PastaDoAnki {
  foreach ($pasta in @([Environment]::GetFolderPath('UserProfile'), $env:SystemRoot)) {
    if ($pasta -and (Test-Path -LiteralPath $pasta -PathType Container)) { return $pasta }
  }
  return $null
}
function AbrirOAnki {
  if (-not (Test-Path -LiteralPath $anki -PathType Leaf)) { return $false }
  try {
    # O Windows não deixa aspas num nome de pasta, e o perfil do Anki é uma pasta: as aspas em volta bastam.
    $abertura = @{ FilePath = $anki }
    if ($perfil) { $abertura.ArgumentList = ('-p "' + $perfil + '"') }
    $pasta = PastaDoAnki
    if ($pasta) { $abertura.WorkingDirectory = $pasta }
    Start-Process @abertura
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
# O launcher ($anki, o programa que o abridor abre) de cada processo dado: o pai direto dele, se for esse programa e tiver nascido
# antes. Ele não é um processo do Anki para o `ProcessosDoAnki` (o path é outro), e quando o Anki é fechado à força ele fica vivo,
# sem filhos, para sempre. Guarda o pid e a hora em que nasceu (o pid de um processo que saiu pode ser reusado).
function LaunchersDoAnki($doAnki) {
  $achados = @()
  try {
    $tabela = @{}
    foreach ($p in @(Get-CimInstance Win32_Process)) { $tabela[[int]$p.ProcessId] = $p }
    foreach ($processo in $doAnki) {
      $filho = $tabela[[int]$processo.Id]
      if (-not $filho) { continue }
      $pai = $tabela[[int]$filho.ParentProcessId]
      if (-not $pai -or $pai.ExecutablePath -ine $anki) { continue }
      if ($pai.CreationDate -and $filho.CreationDate -and $pai.CreationDate -gt $filho.CreationDate) { continue }
      if (@($achados | Where-Object { $_.Id -eq [int]$pai.ProcessId }).Count -eq 0) { $achados += [pscustomobject]@{ Id = [int]$pai.ProcessId; Criado = $pai.CreationDate } }
    }
  } catch { return @() }
  return $achados
}
# Depois que o Anki fechado à força saiu: encerra o launcher que sobrou, mas só o que ainda é o mesmo processo (mesmo programa, mesma
# hora de nascimento) e não tem mais nenhum filho vivo.
function EncerrarLaunchersOrfaos($launchers) {
  try {
    $tabela = @(Get-CimInstance Win32_Process)
    foreach ($launcher in $launchers) {
      $vivo = @($tabela | Where-Object { [int]$_.ProcessId -eq $launcher.Id })
      if ($vivo.Count -eq 0 -or $vivo[0].ExecutablePath -ine $anki) { continue }
      if ($launcher.Criado -and $vivo[0].CreationDate -ne $launcher.Criado) { continue }
      if (@($tabela | Where-Object { [int]$_.ParentProcessId -eq $launcher.Id }).Count -gt 0) { continue }
      try { Stop-Process -Id $launcher.Id -Force -ErrorAction Stop } catch {}
    }
  } catch {}
}
# Só volta 200 com a thread principal do Anki viva (o /health responde mesmo com o Anki travado).
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
  $launchers = @(LaunchersDoAnki @(ProcessosDoAnki))
  $recebeu = 0
  foreach ($dono in $donos) { try { Stop-Process -Id $dono -Force -ErrorAction Stop; $recebeu++ } catch {} }
  if ($recebeu -eq 0) { NinguemRecebeu; return }
  if (-not (EsperarOAnkiSair 10)) { Falhou 'nao_fechou'; return }
  EncerrarLaunchersOrfaos $launchers
  if (-not (AbrirOAnki)) { Falhou 'nao_abriu'; return }
  Responder ([ordered]@{ situacao = 'reiniciado' })
}
"""
