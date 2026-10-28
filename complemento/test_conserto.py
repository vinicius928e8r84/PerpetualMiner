"""O abridor que conserta sozinho (#152): fecha à força o Anki que não responde, liga o complemento desativado e reinicia.

    python3.9 complemento/test_conserto.py

O script do Mac roda de verdade (`sh`), numa pasta temporária, com os programas de mentira no lugar de `ps`, `curl`, `kill`,
`sleep`, `date` e `open`: todos anotam o que receberam num registro só, na ordem em que o script os chamou, e o relógio de
mentira só anda quando o script manda dormir. Assim os testes conferem a **ordem** (esperar 30 s, fechar, abrir) sem esperar,
e a edição do `meta.json` do Anki acontece numa pasta temporária. Nenhum processo de verdade é fechado, nenhum Anki é aberto.

O que o Mac e o Windows de verdade fazem com isto (fechar à força, ligar pelo `meta.json`) só o ensaio do dono vê
(`complemento/LEIA-ME.md`, riscos 3 e 12 do #138). O `.ps1` do Windows só roda onde houver `pwsh`.
"""

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor, conserto_do_anki  # noqa: E402
from complemento.test_abridor import ANKI_DO_WINDOWS, Pastas, RegistroDeMentira, conversar  # noqa: E402

PID = 4242
COMANDO_DO_ANKI = "/Applications/Anki.app/Contents/MacOS/anki"
CONSERTAR = {"acao": "consertar"}

CONTRATO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos-do-conserto.json")
with open(CONTRATO, encoding="utf-8") as _arquivo:
    EXEMPLOS = json.load(_arquivo)["conserto"]["exemplos"]

META_DESATIVADO = {"name": "PerpetualMiner", "mod": 1760000000, "disabled": True, "config": {"porta": 8766, "lista": ["a", "b"]}}


def programa(caminho, corpo):
    with open(caminho, "w", encoding="utf-8") as arquivo:
        arquivo.write("#!/bin/sh\n" + corpo)
    os.chmod(caminho, 0o755)


class Mundo:
    """O computador de mentira: o Anki (um pid), a Conexão, o relógio e a pasta do complemento com o `meta.json`."""

    def __init__(self, raiz):
        self.pastas = Pastas(raiz)
        self.estado = os.path.join(raiz, "mundo")
        os.makedirs(self.estado)
        self.complemento = os.path.join(raiz, "Anki2", "addons21", "perpetualminer")
        os.makedirs(self.complemento)
        with open(os.path.join(self.complemento, "__init__.py"), "w", encoding="utf-8") as arquivo:
            arquivo.write("")
        self.meta = os.path.join(self.complemento, "meta.json")
        self.registro = os.path.join(self.estado, "eventos.log")
        self.programas = {nome: os.path.join(self.estado, nome) for nome in ("ps", "curl", "kill", "sleep", "date", "open")}
        e = self.estado
        programa(self.programas["date"], 'cat "%s/relogio"\n' % e)
        programa(self.programas["sleep"],
                 'echo "sleep $1" >> "%s"\nprintf %%s $(( $(cat "%s/relogio") + $1 )) > "%s/relogio"\n' % (self.registro, e, e))
        programa(self.programas["ps"],
                 'echo "ps $*" >> "%s"\n[ -f "%s/vivo" ] || exit 1\n'
                 'if [ -f "%s/fecha_em" ] && [ "$(cat "%s/relogio")" -ge "$(cat "%s/fecha_em")" ]; then rm -f "%s/vivo"; exit 1; fi\n'
                 'cat "%s/comando"\n' % ((self.registro, e) + (e,) * 5))
        programa(self.programas["curl"],
                 'echo "curl $*" >> "%s"\n[ -f "%s/responde_a_partir_de" ] && [ "$(cat "%s/relogio")" -ge "$(cat "%s/responde_a_partir_de")" ] && exit 0\nexit 28\n'
                 % (self.registro, e, e, e))
        programa(self.programas["kill"],
                 'echo "kill $*" >> "%s"\n[ "$1" = "$(cat "%s/resiste_a" 2>/dev/null)" ] && exit 0\nrm -f "%s/vivo"\n' % (self.registro, e, e))
        programa(self.programas["open"],
                 'echo "open $*" >> "%s"\n[ -f "%s/nao_abre" ] && exit 1\ntouch "%s/vivo"\n' % (self.registro, e, e))
        self.escrever_estado("relogio", "1000")
        self.anki_aberto()

    def escrever_estado(self, nome, valor):
        with open(os.path.join(self.estado, nome), "w", encoding="utf-8") as arquivo:
            arquivo.write(valor)

    def anki_aberto(self, comando=COMANDO_DO_ANKI):
        self.escrever_estado("vivo", "")
        self.escrever_estado("comando", comando + "\n")

    def anki_fechado(self):
        os.remove(os.path.join(self.estado, "vivo"))

    def conexao_responde_em(self, segundos):
        self.escrever_estado("responde_a_partir_de", str(1000 + segundos))

    def pessoa_fecha_o_anki_em(self, segundos):
        self.escrever_estado("fecha_em", str(1000 + segundos))

    def kill_nao_funciona_com(self, sinal):
        self.escrever_estado("resiste_a", sinal)

    def open_nao_abre(self):
        self.escrever_estado("nao_abre", "")

    def meta_com(self, texto):
        with open(self.meta, "w", encoding="utf-8") as arquivo:
            arquivo.write(texto if isinstance(texto, str) else json.dumps(texto, indent=4))

    def meta_atual(self):
        with open(self.meta, encoding="utf-8") as arquivo:
            return arquivo.read()

    def eventos(self):
        if not os.path.exists(self.registro):
            return []
        with open(self.registro, encoding="utf-8") as arquivo:
            return arquivo.read().splitlines()

    def passos(self):
        """O que o script fez, na ordem: as esperas juntas (`esperou N s`), cada `kill` e cada `open` (o `ps` e o `curl` ficam de fora)."""
        passos = []
        for linha in self.eventos():
            if linha.startswith("sleep "):
                segundos = int(linha.split()[1])
                if passos and passos[-1].startswith("esperou "):
                    segundos += int(passos.pop().split()[1])
                passos.append("esperou %d s" % segundos)
            elif linha.startswith(("kill ", "open ")):
                passos.append(linha)
        return passos

    def abridor(self, perfil="Usuário 1", **conserto):
        a = abridor.Abridor(
            sistema="mac",
            pasta=self.pastas.abridor,
            programa=self.pastas.app,
            onde_registrar={"Chrome": self.pastas.hosts_do_chrome},
            abrir_com=self.programas["open"],
            ler_json_com=self.pastas.ler_json,
            conserto=conserto_do_anki.Conserto(
                pid=PID, executavel=COMANDO_DO_ANKI, complemento=self.complemento,
                programas={nome: self.programas[nome] for nome in ("ps", "curl", "kill", "sleep", "date")},
                **conserto),
        )
        a.escrever(perfil)
        return os.path.join(self.pastas.abridor, "abrir-o-anki.sh")

    def consertar(self, perfil="Usuário 1", **conserto):
        return conversar(self.abridor(perfil, **conserto), CONSERTAR)


@unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
class NoMac(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.mundo = Mundo(self._raiz.name)

    def tearDown(self):
        self._raiz.cleanup()

    def test_anki_fechado_pela_pessoa_continua_fechado_sem_fechar_nem_abrir_nada(self):
        self.mundo.anki_fechado()
        self.assertEqual(self.mundo.consertar(), {"situacao": "fechado"})
        self.assertEqual(self.mundo.passos(), [])

    def test_um_pid_que_virou_outro_programa_nao_e_fechado(self):
        self.mundo.anki_aberto(comando="/usr/bin/vim notas.txt")
        self.assertEqual(self.mundo.consertar(), {"situacao": "fechado"})
        self.assertEqual(self.mundo.passos(), [])

    def test_conexao_que_responde_logo_nao_fecha_nem_abre_nada(self):
        self.mundo.conexao_responde_em(0)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})
        self.assertEqual(self.mundo.passos(), [])

    def test_anki_que_demora_a_responder_mas_responde_antes_dos_30_s_nao_e_fechado(self):
        self.mundo.conexao_responde_em(10)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})
        self.assertEqual(self.mundo.passos(), ["esperou 10 s"])

    def test_sem_resposta_espera_30_s_fecha_a_forca_e_abre_de_novo_nesta_ordem(self):
        self.assertEqual(self.mundo.consertar(), {"situacao": "reiniciado"})
        self.assertEqual(self.mundo.passos(), [
            "esperou 30 s",
            "kill -KILL %d" % PID,
            "open -a %s --args -p Usuário 1" % self.mundo.pastas.app,
        ])

    def test_a_espera_e_a_que_o_abridor_recebe_e_os_testes_nao_esperam_de_verdade(self):
        self.assertEqual(self.mundo.consertar(espera_s=12), {"situacao": "reiniciado"})
        self.assertEqual(self.mundo.passos()[0], "esperou 12 s")

    def test_o_padrao_da_espera_e_de_30_s(self):
        self.assertEqual(conserto_do_anki.Conserto().espera_s, 30)

    def test_reabre_sem_escolher_perfil_quando_nenhum_foi_marcado(self):
        self.assertEqual(self.mundo.consertar(perfil=None), {"situacao": "reiniciado"})
        self.assertEqual(self.mundo.passos()[-1], "open -a %s" % self.mundo.pastas.app)

    def test_a_pessoa_que_fecha_o_anki_durante_a_espera_nao_ve_o_anki_reaberto(self):
        self.mundo.pessoa_fecha_o_anki_em(8)
        self.assertEqual(self.mundo.consertar(), {"situacao": "fechado"})
        self.assertEqual(self.mundo.passos(), ["esperou 8 s"])

    def test_anki_que_nao_fecha_nem_a_forca_nao_e_aberto_de_novo(self):
        self.mundo.kill_nao_funciona_com("-KILL")
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "nao_fechou"})
        self.assertNotIn("open", " ".join(self.mundo.passos()))

    def test_anki_que_fecha_e_nao_abre_de_novo_e_falha_com_o_motivo(self):
        self.mundo.open_nao_abre()
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "nao_abriu"})
        self.assertEqual(self.mundo.passos()[1], "kill -KILL %d" % PID)

    def test_complemento_desativado_fecha_pelo_caminho_normal_liga_no_meta_e_abre_nesta_ordem(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.assertEqual(self.mundo.consertar(), {"situacao": "ligado"})
        self.assertEqual(self.mundo.passos(), [
            "kill -TERM %d" % PID,
            "open -a %s --args -p Usuário 1" % self.mundo.pastas.app,
        ])
        self.assertNotIn("-KILL", " ".join(self.mundo.eventos()))

    def test_ligar_so_vira_a_marca_desativado_e_deixa_o_resto_do_meta_json_como_estava(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.consertar()
        self.assertEqual(json.loads(self.mundo.meta_atual()), dict(META_DESATIVADO, disabled=False))

    def test_guarda_o_meta_json_de_antes_byte_a_byte_ao_lado_do_abridor(self):
        antes = json.dumps(META_DESATIVADO, indent=4) + "\n"
        self.mundo.meta_com(antes)
        self.mundo.consertar()
        copia = os.path.join(self.mundo.pastas.abridor, "meta.json.antes")
        with open(copia, encoding="utf-8") as arquivo:
            self.assertEqual(arquivo.read(), antes)

    def test_nao_deixa_arquivo_provisorio_para_tras_ao_gravar_o_meta_json(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.consertar()
        self.assertEqual(sorted(os.listdir(self.mundo.complemento)), ["__init__.py", "meta.json"])
        self.assertEqual(sorted(os.listdir(self.mundo.pastas.abridor)), ["abrir-o-anki.sh", "meta.json.antes"])

    def test_complemento_desativado_que_o_anki_nao_deixa_fechar_nao_mexe_no_meta_json(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.kill_nao_funciona_com("-TERM")
        antes = self.mundo.meta_atual()
        self.assertEqual(self.mundo.consertar(espera_s=6), {"situacao": "falhou", "motivo": "nao_fechou"})
        self.assertEqual(self.mundo.meta_atual(), antes)
        self.assertNotIn("open", " ".join(self.mundo.passos()))

    def test_meta_json_ilegivel_nao_e_escrito_e_o_anki_nao_e_tocado(self):
        self.mundo.meta_com("{isto não é json")
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "meta_ilegivel"})
        self.assertEqual(self.mundo.meta_atual(), "{isto não é json")
        self.assertEqual(self.mundo.passos(), [])

    def test_complemento_ligado_no_meta_json_nao_reescreve_nada(self):
        self.mundo.meta_com(dict(META_DESATIVADO, disabled=False))
        antes = self.mundo.meta_atual()
        self.mundo.conexao_responde_em(0)
        self.mundo.consertar()
        self.assertEqual(self.mundo.meta_atual(), antes)
        self.assertEqual(os.listdir(self.mundo.pastas.abridor), ["abrir-o-anki.sh"])

    def test_um_disabled_dentro_da_config_nao_conta_como_complemento_desativado(self):
        self.mundo.meta_com({"name": "PerpetualMiner", "config": {"disabled": True}})
        self.mundo.conexao_responde_em(0)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})

    def test_sem_meta_json_o_anki_conta_o_complemento_como_ligado(self):
        self.mundo.conexao_responde_em(0)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})

    def test_complemento_que_sumiu_da_pasta_do_anki_nao_fecha_nem_abre_nada(self):
        os.remove(os.path.join(self.mundo.complemento, "__init__.py"))
        self.assertEqual(self.mundo.consertar(), {"situacao": "sumiu"})
        self.assertEqual(self.mundo.passos(), [])

    def test_pergunta_a_conexao_pela_rota_que_so_responde_com_a_thread_principal_do_anki(self):
        self.mundo.conexao_responde_em(0)
        self.mundo.consertar()
        curl = [linha for linha in self.mundo.eventos() if linha.startswith("curl ")][0]
        self.assertIn("-X POST", curl)
        self.assertIn("http://127.0.0.1:8766/anki/profiles", curl)
        self.assertIn("Origin: chrome-extension://ohpoogiccjmdgilgegholdidgfhjkadf", curl)

    def test_o_script_responde_cada_exemplo_do_contrato(self):
        for exemplo in EXEMPLOS:
            with self.subTest(exemplo["nome"]):
                mundo = Mundo(tempfile.mkdtemp(dir=self._raiz.name))
                situacao = exemplo["contexto"]["conserto"]
                if situacao == "anki_fechado":
                    mundo.anki_fechado()
                elif situacao == "conexao_responde":
                    mundo.conexao_responde_em(0)
                elif situacao == "complemento_desativado":
                    mundo.meta_com(META_DESATIVADO)
                elif situacao == "complemento_sumiu":
                    os.remove(os.path.join(mundo.complemento, "__init__.py"))
                elif situacao == "anki_nao_fecha":
                    mundo.kill_nao_funciona_com("-KILL")
                elif situacao == "anki_nao_abre":
                    mundo.open_nao_abre()
                elif situacao == "meta_ilegivel":
                    mundo.meta_com("{")
                self.assertEqual(
                    conversar(mundo.abridor(), exemplo["mensagem"]), exemplo["resposta"],
                    'O abridor e o contrato (complemento/contrato/exemplos-do-conserto.json) se separaram no exemplo "%s".' % exemplo["nome"],
                )

    def test_consertar_so_vale_como_acao_principal_exata(self):
        script = self.mundo.abridor()
        for mensagem in [{"acao": "Consertar"}, {"acao": "consertar "}, {"acao": ["consertar"]}, {"x": {"acao": "consertar"}}]:
            with self.subTest(mensagem=mensagem):
                self.assertEqual(conversar(script, mensagem), {"erro": "acao_desconhecida"})
        self.assertEqual(self.mundo.passos(), [])

    def test_conferir_e_abrir_continuam_iguais(self):
        script = self.mundo.abridor()
        self.assertEqual(conversar(script, {"acao": "conferir"}), {"achou": True})
        self.assertEqual(conversar(script, {"acao": "abrir"}), {"achou": True, "abriu": True})
        self.assertEqual(self.mundo.passos(), ["open -a %s --args -p Usuário 1" % self.mundo.pastas.app])

    def test_um_abridor_sem_os_dados_do_conserto_nunca_fecha_nada(self):
        a = abridor.Abridor(
            sistema="mac", pasta=self.mundo.pastas.abridor, programa=self.mundo.pastas.app,
            onde_registrar={"Chrome": self.mundo.pastas.hosts_do_chrome}, abrir_com=self.mundo.programas["open"],
            ler_json_com=self.mundo.pastas.ler_json,
        )
        a.escrever("Usuário 1")
        resposta = conversar(os.path.join(self.mundo.pastas.abridor, "abrir-o-anki.sh"), CONSERTAR)
        self.assertEqual(resposta, {"situacao": "fechado"})
        self.assertEqual(self.mundo.passos(), [])

    def test_um_caminho_do_anki_com_aspas_e_cifrao_chega_inteiro_a_comparacao_do_processo(self):
        comando = "/Applications/Anki's $HOME.app/Contents/MacOS/anki"
        self.mundo.anki_aberto(comando=comando + " --flag")
        script = abridor.Abridor(
            sistema="mac", pasta=self.mundo.pastas.abridor, programa=self.mundo.pastas.app,
            onde_registrar={"Chrome": self.mundo.pastas.hosts_do_chrome}, abrir_com=self.mundo.programas["open"],
            ler_json_com=self.mundo.pastas.ler_json,
            conserto=conserto_do_anki.Conserto(
                pid=PID, executavel=comando, complemento=self.mundo.complemento, espera_s=2,
                programas={nome: self.mundo.programas[nome] for nome in ("ps", "curl", "kill", "sleep", "date")}),
        )
        script.escrever(None)
        resposta = conversar(os.path.join(self.mundo.pastas.abridor, "abrir-o-anki.sh"), CONSERTAR)
        self.assertEqual(resposta, {"situacao": "reiniciado"})


class NoWindows(unittest.TestCase):
    """O `.ps1` do Windows só se confere por inspeção aqui; onde houver `pwsh` ele ainda roda o caso que não toca em nada."""

    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.pasta = os.path.join(self._raiz.name, "user_files", "abridor")
        self.complemento = r"C:\Users\Maria\AppData\Roaming\Anki2\addons21\perpetualminer"
        abridor.deste_computador(
            plataforma="win32", ambiente={"ANKI_LAUNCHER": ANKI_DO_WINDOWS}, executavel=r"C:\Anki\pythonw.exe",
            pasta=self.pasta, registro=RegistroDeMentira(), pid=777, complemento=self.complemento,
        ).escrever("Usuário 1")
        with open(os.path.join(self.pasta, "abrir-o-anki.ps1"), "rb") as arquivo:
            self.ps1 = arquivo.read().decode("utf-8-sig")

    def tearDown(self):
        self._raiz.cleanup()

    def valor(self, variavel):
        for linha in self.ps1.splitlines():
            if linha.startswith("$%s = " % variavel):
                return linha[len("$%s = " % variavel):]
        self.fail("o .ps1 não tem $%s" % variavel)

    def test_o_ps1_leva_o_pid_o_programa_a_pasta_do_complemento_e_a_espera(self):
        self.assertEqual(self.valor("pidDoAnki"), "777")
        self.assertEqual(self.valor("programaDoAnki"), r"'C:\Anki\pythonw.exe'")
        self.assertEqual(self.valor("complemento"), "'%s'" % self.complemento)
        self.assertEqual(self.valor("espera"), "30")

    def test_o_ps1_so_fecha_o_processo_que_o_complemento_anotou(self):
        self.assertIn("Get-Process -Id $pidDoAnki", self.ps1)
        self.assertIn("-ieq $programaDoAnki", self.ps1)
        self.assertEqual(self.ps1.count("Stop-Process"), 1)
        self.assertIn("Stop-Process -Id $pidDoAnki -Force", self.ps1)
        self.assertNotIn("Get-Process -Name", self.ps1)
        self.assertNotIn("taskkill", self.ps1.lower())

    def test_o_ps1_fecha_pelo_caminho_normal_para_ligar_o_complemento_e_a_forca_so_depois_da_espera(self):
        self.assertIn("CloseMainWindow()", self.ps1)
        corpo = self.ps1[self.ps1.index("function Consertar"):]
        self.assertLess(corpo.index("Start-Sleep"), corpo.index("Stop-Process"))

    def test_o_ps1_guarda_o_meta_json_de_antes_e_troca_o_arquivo_de_uma_vez(self):
        self.assertIn("meta.json.antes", self.ps1)
        self.assertIn("Move-Item", self.ps1)

    @unittest.skipUnless(shutil.which("pwsh"), "o .ps1 só roda onde houver PowerShell (pwsh)")
    def test_o_ps1_responde_acao_desconhecida_a_uma_mensagem_que_nao_conhece(self):
        import struct
        corpo = b'{"acao":"fechar"}'
        saida = subprocess.run(
            ["pwsh", "-NoProfile", "-NonInteractive", "-File", os.path.join(self.pasta, "abrir-o-anki.ps1")],
            input=struct.pack("<I", len(corpo)) + corpo, stdout=subprocess.PIPE, timeout=60, check=True).stdout
        self.assertEqual(json.loads(saida[4:].decode("utf-8")), {"erro": "acao_desconhecida"})


if __name__ == "__main__":
    unittest.main()
