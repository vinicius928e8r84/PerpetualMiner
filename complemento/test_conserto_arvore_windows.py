"""O `consertar` do Windows acha o Anki pela árvore de processos (#152): o Anki do instalador novo (launcher) roda como
`anki.exe` → `pythonw.exe` do `.venv` (um redirecionador, o `sys.executable` que o complemento anota) → `pythonw.exe` do
CPython (o filho, com a mesma linha de comando, que é quem ouve a porta da Conexão).

    python3.9 complemento/test_conserto_arvore_windows.py

Roda o `.ps1` do abridor de verdade, no `pwsh`, num mundo de mentira: `Get-Process`, `Get-CimInstance`, `Get-NetTCPConnection`,
`Stop-Process`, `Start-Process` e `Invoke-WebRequest` são trocados por uma tabela de processos que o teste escreve; nenhum processo
real é lido nem sinalizado. Onde não houver `pwsh`, os testes são pulados, menos quando `EXIGIR_PWSH=1` (o CI): aí a falta
do `pwsh` faz cada teste falhar, e o job não passa sem ter provado o `.ps1`.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor, conserto_do_anki  # noqa: E402
from complemento.test_abridor import ANKI_DO_WINDOWS, RegistroDeMentira  # noqa: E402

LAUNCHER = r"C:\Users\Maria\AppData\Local\Programs\Anki\anki.exe"
REDIRECIONADOR = r"C:\Users\Maria\AppData\Local\AnkiProgramFiles\.venv\Scripts\pythonw.exe"
CPYTHON = r"C:\Users\Maria\AppData\Local\AnkiProgramFiles\python\cpython-3.13.5-windows-x86_64-none\pythonw.exe"
LINHA_DO_AQT = '"%s" -c "import aqt, sys; sys.argv[0]=\'Anki\'; aqt.run()"'
OUTRA_LINHA = '"%s" -c "import time; time.sleep(99999)"'
LINHA_DO_LAUNCHER = '"%s" -b "C:\\pm283\\anki-base" -l pt_BR -p Teste-A' % LAUNCHER

PWSH = shutil.which("pwsh")
EXIGIR_PWSH = os.environ.get("EXIGIR_PWSH") == "1"

# O prefácio do mundo de mentira. `$mundo` é a tabela (pid, ppid, caminho, linha de comando, criação, se ouve a porta, se
# sai junto com o filho); cada cmdlet que lê ou sinaliza processo lê ou muda a tabela.
PREFACIO = r"""
$ErrorActionPreference = 'Stop'
$global:mundo = [System.Collections.ArrayList]@($mundoJson | ConvertFrom-Json)
$global:sinais = [System.Collections.ArrayList]@()
$global:aberturas = [System.Collections.ArrayList]@()
$global:respostas = [System.Collections.ArrayList]@()
function Get-Process {
  [CmdletBinding()] param([int[]]$Id)
  foreach ($p in @($global:mundo)) {
    $o = [pscustomobject]@{ Id = [int]$p.pid; Path = $p.caminho }
    Add-Member -InputObject $o -MemberType ScriptMethod -Name CloseMainWindow -Value { return $true }
    $o
  }
}
function Get-CimInstance {
  param([Parameter(Position = 0)][string]$ClassName)
  foreach ($p in @($global:mundo)) {
    $criado = $null
    if ($p.criado) { $criado = [datetime]::Parse($p.criado) }
    [pscustomobject]@{ ProcessId = [int]$p.pid; ParentProcessId = [int]$p.ppid; CommandLine = $p.linha; ExecutablePath = $p.caminho; CreationDate = $criado }
  }
}
function Get-NetTCPConnection {
  [CmdletBinding()] param([int]$LocalPort, [string]$State)
  foreach ($p in @($global:mundo | Where-Object { $_.ouve })) { [pscustomobject]@{ LocalPort = $LocalPort; State = 'Listen'; OwningProcess = [uint32]$p.pid } }
}
function Stop-Process {
  [CmdletBinding()] param([int]$Id, [switch]$Force)
  $alvo = @($global:mundo | Where-Object { [int]$_.pid -eq $Id })
  if ($alvo.Count -eq 0) { throw 'sem esse processo' }
  [void]$global:sinais.Add($Id)
  $morre = @($Id)
  $atual = $alvo[0]
  while ($atual -and $atual.ppid) {
    $pai = @($global:mundo | Where-Object { [int]$_.pid -eq [int]$atual.ppid })
    if ($pai.Count -eq 0 -or -not $pai[0].sai_com_o_filho) { break }
    $morre += [int]$pai[0].pid
    $atual = $pai[0]
  }
  foreach ($m in $morre) { foreach ($p in @($global:mundo | Where-Object { [int]$_.pid -eq $m })) { $global:mundo.Remove($p) } }
}
function Start-Process { param($FilePath, $ArgumentList) [void]$global:aberturas.Add([string]$ArgumentList) }
function Invoke-WebRequest { throw 'a Conexão não responde' }
function Responder($resposta) { [void]$global:respostas.Add(($resposta | ConvertTo-Json -Compress)) }
function Start-Sleep { param($Seconds) }
"""


def _modelo(executavel):
    """O trecho do `.ps1` com as variáveis e as funções (sem a leitura do Native Messaging), para o `pwsh` rodar."""
    conserto = conserto_do_anki.Conserto(executavel=executavel, complemento="C:\\nada", porta=8766, espera_s=0)
    variaveis = conserto_do_anki.variaveis_do_ps1(conserto, "C:\\nada\\abridor", abridor._texto_do_powershell)
    return variaveis, conserto_do_anki.FUNCOES_DO_PS1


def processo(pid, ppid, caminho, linha, ouve=False, sai_com_o_filho=False, criado="2026-10-29T10:00:00"):
    return {"pid": pid, "ppid": ppid, "caminho": caminho, "linha": linha, "ouve": ouve, "sai_com_o_filho": sai_com_o_filho, "criado": criado}


def anki_do_launcher(porta_no_filho=True):
    """anki.exe (25340) → redirecionador (25384) → CPython (1648), o do PC do dono."""
    return [
        processo(25340, 4000, LAUNCHER, LINHA_DO_LAUNCHER),
        processo(25384, 25340, REDIRECIONADOR, LINHA_DO_AQT % REDIRECIONADOR, sai_com_o_filho=True, criado="2026-10-29T10:00:01"),
        processo(1648, 25384, CPYTHON, LINHA_DO_AQT % CPYTHON, ouve=porta_no_filho, criado="2026-10-29T10:00:02"),
    ]


@unittest.skipUnless(PWSH or EXIGIR_PWSH, "o .ps1 só roda onde houver PowerShell (pwsh)")
class AnkiDoLauncherNoWindows(unittest.TestCase):
    def setUp(self):
        if not PWSH:
            self.fail("EXIGIR_PWSH=1, mas não há pwsh no PATH: o .ps1 do Conserto ficaria sem prova")

    def rodar(self, mundo, executavel=REDIRECIONADOR, chamadas="Consertar"):
        variaveis, funcoes = _modelo(executavel)
        anki_existe = tempfile.NamedTemporaryFile(suffix=".exe", delete=False)
        anki_existe.close()
        self.addCleanup(os.unlink, anki_existe.name)
        programa = "\n".join([
            "$mundoJson = @'\n%s\n'@" % json.dumps(mundo),
            PREFACIO,
            variaveis,
            "$anki = '%s'" % anki_existe.name,
            "$perfil = 'Teste-A'",
            funcoes,
            chamadas,
            "[pscustomobject]@{ respostas = @($global:respostas); sinais = @($global:sinais); aberturas = @($global:aberturas); vivos = @($global:mundo | ForEach-Object { [int]$_.pid }) } | ConvertTo-Json -Compress -Depth 4",
        ])
        with tempfile.TemporaryDirectory() as casa:
            arquivo = os.path.join(casa, "mundo.ps1")
            with open(arquivo, "wb") as escrito:
                escrito.write(b"\xef\xbb\xbf" + programa.encode("utf-8"))
            saida = subprocess.run(
                [PWSH, "-NoProfile", "-NonInteractive", "-File", arquivo], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=120, env=dict(os.environ, HOME=casa, DOTNET_CLI_HOME=casa))
        self.assertEqual(saida.returncode, 0, saida.stderr.decode("utf-8", "replace"))
        return json.loads(saida.stdout.decode("utf-8").strip().splitlines()[-1])

    def reparar(self, mundo, executavel=REDIRECIONADOR):
        """O `Consertar` de um Anki que não responde (a espera é zero). Devolve a situação, os sinais e as aberturas."""
        # O `__init__.py` do complemento tem de existir para o Consertar passar do `sumiu`.
        with tempfile.TemporaryDirectory() as complemento:
            shutil.copyfile(os.devnull, os.path.join(complemento, "__init__.py"))
            chamadas = "$complemento = '%s'\nConsertar" % complemento
            feito = self.rodar(mundo, executavel, chamadas)
        resposta = json.loads(feito["respostas"][0]) if feito["respostas"] else {}
        return resposta, feito

    def test_o_ouvinte_que_e_o_filho_cpython_do_redirecionador_e_reconhecido_e_so_ele_recebe_o_sinal(self):
        resposta, feito = self.reparar(anki_do_launcher())
        self.assertEqual(resposta, {"situacao": "reiniciado"})
        self.assertEqual(feito["sinais"], [1648])
        self.assertEqual(len(feito["aberturas"]), 1)
        self.assertIn(25340, feito["vivos"])   # o launcher não é do Anki que o script reconhece: não é sinalizado

    def test_o_filho_cuja_linha_de_comando_e_identica_a_do_pai_inclusive_o_programa_tambem_e_reconhecido(self):
        mundo = anki_do_launcher()
        mundo[2]["linha"] = mundo[1]["linha"]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "reiniciado"})
        self.assertEqual(feito["sinais"], [1648])

    def test_o_anki_do_launcher_e_visto_como_rodando_o_redirecionador_e_o_filho_cpython(self):
        feito = self.rodar(anki_do_launcher(), chamadas="[void]$global:respostas.Add((@(ProcessosDoAnki | ForEach-Object { $_.Id }) -join ','))")
        self.assertEqual(feito["respostas"], ["25384,1648"])

    def test_o_ouvinte_cuja_arvore_nao_tem_o_programa_do_anki_e_recusado_e_nada_e_sinalizado(self):
        mundo = [
            processo(25340, 4000, LAUNCHER, LINHA_DO_LAUNCHER),
            processo(25384, 25340, REDIRECIONADOR, LINHA_DO_AQT % REDIRECIONADOR, sai_com_o_filho=True),
            # outro Python, fora da árvore do Anki, com a linha do aqt.run(), é quem ouve a porta
            processo(777, 600, CPYTHON, LINHA_DO_AQT % CPYTHON, ouve=True),
            processo(600, 500, r"C:\Windows\explorer.exe", "explorer.exe"),
        ]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual((feito["sinais"], feito["aberturas"]), ([], []))

    def test_o_python_vizinho_que_divide_o_redirecionador_fora_da_arvore_do_anki_nao_e_sinalizado(self):
        mundo = anki_do_launcher() + [
            processo(300, 4001, REDIRECIONADOR, OUTRA_LINHA % REDIRECIONADOR, sai_com_o_filho=True),
            processo(301, 300, CPYTHON, OUTRA_LINHA % CPYTHON),
        ]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(feito["sinais"], [1648])
        self.assertIn(300, feito["vivos"])
        self.assertIn(301, feito["vivos"])

    def test_o_python_vizinho_do_redirecionador_que_ouve_a_porta_sem_ser_o_anki_e_recusado(self):
        # sem Anki na porta: o vizinho (mesmo programa, outro código) ouve; o filho dele não é o aqt.run()
        mundo = anki_do_launcher(porta_no_filho=False) + [
            processo(300, 4001, REDIRECIONADOR, OUTRA_LINHA % REDIRECIONADOR, sai_com_o_filho=True),
            processo(301, 300, CPYTHON, OUTRA_LINHA % CPYTHON, ouve=True),
        ]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(feito["sinais"], [])

    def test_o_filho_com_a_linha_do_aqt_mas_de_um_pai_com_outra_linha_nao_e_do_anki(self):
        mundo = [
            processo(300, 4001, REDIRECIONADOR, OUTRA_LINHA % REDIRECIONADOR),
            processo(301, 300, CPYTHON, LINHA_DO_AQT % CPYTHON, ouve=True),
        ]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(feito["sinais"], [])

    def test_so_o_nome_do_programa_nao_basta_o_pythonw_de_outra_pasta_que_ouve_a_porta_e_recusado(self):
        mundo = anki_do_launcher(porta_no_filho=False) + [
            processo(900, 4002, r"C:\Python313\pythonw.exe", LINHA_DO_AQT % r"C:\Python313\pythonw.exe", ouve=True),
        ]
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(feito["sinais"], [])

    def test_o_pai_que_e_um_pid_reusado_criado_depois_do_filho_nao_vale(self):
        mundo = anki_do_launcher()
        mundo[1]["criado"] = "2026-10-29T10:05:00"   # o "pai" nasceu depois do filho: o pid do pai verdadeiro foi reusado
        resposta, feito = self.reparar(mundo)
        self.assertEqual(resposta, {"situacao": "falhou", "motivo": "conexao_fora"})
        self.assertEqual(feito["sinais"], [])

    def test_o_anki_cujo_programa_anotado_e_o_proprio_ouvinte_continua_reconhecido(self):
        mundo = [processo(50, 4000, CPYTHON, LINHA_DO_AQT % CPYTHON, ouve=True)]
        resposta, feito = self.reparar(mundo, executavel=CPYTHON)
        self.assertEqual(resposta, {"situacao": "reiniciado"})
        self.assertEqual(feito["sinais"], [50])


class SemPwshOCiNaoPassaEmSilencio(unittest.TestCase):
    """O CI exige `pwsh` (`EXIGIR_PWSH=1`): pulado não é prova."""

    def rodar_sem_pwsh(self, **ambiente):
        pasta_vazia = tempfile.mkdtemp()
        self.addCleanup(os.rmdir, pasta_vazia)
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env = {"PATH": pasta_vazia, **ambiente}
        return subprocess.run(
            [sys.executable, "-m", "unittest", "complemento.test_conserto_arvore_windows.AnkiDoLauncherNoWindows"],
            cwd=raiz, env=env, capture_output=True, text=True,
        )

    def test_exigir_pwsh_sem_pwsh_falha_em_vez_de_pular(self):
        resultado = self.rodar_sem_pwsh(EXIGIR_PWSH="1")
        self.assertNotEqual(resultado.returncode, 0, resultado.stderr)
        self.assertIn("EXIGIR_PWSH=1", resultado.stderr)
        self.assertNotIn("skipped", resultado.stderr)

    def test_sem_exigir_pwsh_e_sem_pwsh_os_testes_sao_pulados(self):
        resultado = self.rodar_sem_pwsh()
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        self.assertIn("skipped", resultado.stderr)


if __name__ == "__main__":
    unittest.main()
