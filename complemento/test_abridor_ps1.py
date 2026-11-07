"""O `.ps1` do abridor do Windows, rodado de verdade no PowerShell (`pwsh`) pelos exemplos do contrato (#235).

    python3.9 complemento/test_abridor_ps1.py

Mesma conferência que o `NoMac` de `test_abridor.py` faz com o `.sh`: cada exemplo de
`contrato/exemplos.json` › `abridor`, `abrir` incluído. O Anki é um programa de mentira na pasta temporária, que
anota os argumentos que recebeu; nada fora da pasta temporária roda. Sem `pwsh` (ou fora de um sistema POSIX,
onde o Anki de mentira é um script `sh`) o teste é pulado.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import abridor  # noqa: E402
from complemento.test_abridor import ANKI_NO_LUGAR, DO_ABRIDOR, RegistroDeMentira  # noqa: E402


@unittest.skipUnless(shutil.which("pwsh") and os.name == "posix", "o .ps1 só roda aqui onde houver PowerShell (pwsh) num sistema POSIX")
class OPs1NoPowerShell(unittest.TestCase):
    """Onde há `pwsh`, o `.ps1` responde os exemplos do contrato (o Windows roda o PowerShell 5.1).

    O Anki do `.ps1` é um programa de mentira na pasta temporária, que anota os argumentos que recebeu: o `abrir` do
    `.ps1` o inicia como inicia o Anki (`Start-Process`). Sem permissão de execução ele não inicia: é o sistema sem
    conseguir abrir o Anki.
    """

    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.addCleanup(self._raiz.cleanup)
        self.anki = os.path.join(self._raiz.name, "anki.exe")
        self.anotados = os.path.join(self._raiz.name, "anki-recebeu.txt")
        self.pasta = os.path.join(self._raiz.name, "abridor")

    def escrever(self, perfil="Usuário 1"):
        abridor.Abridor(
            sistema="windows", pasta=self.pasta, programa=self.anki, onde_registrar={}, registro=RegistroDeMentira(),
        ).escrever(perfil)

    def anki_no_lugar(self, abre):
        """Põe o Anki de mentira no lugar; com `abre` falso o sistema não consegue executá-lo."""
        with open(self.anki, "w", encoding="utf-8") as arquivo:
            arquivo.write('#!/bin/sh\nfor a in "$@"; do printf "%%s\\n" "$a"; done > "%s"\n' % self.anotados)
        os.chmod(self.anki, 0o755 if abre else 0o644)

    def anki_sumiu(self):
        if os.path.exists(self.anki):
            os.remove(self.anki)

    def conversar(self, mensagem):
        if os.path.exists(self.anotados):
            os.remove(self.anotados)
        corpo = json.dumps(mensagem, separators=(",", ":")).encode("utf-8")
        saida = subprocess.run(
            ["pwsh", "-NoProfile", "-NonInteractive", "-File", os.path.join(self.pasta, "abrir-o-anki.ps1")],
            input=struct.pack("<I", len(corpo)) + corpo, stdout=subprocess.PIPE, timeout=60, check=True,
        ).stdout
        tamanho, = struct.unpack_from("<I", saida, 0)
        self.assertEqual(len(saida), 4 + tamanho)
        return json.loads(saida[4:].decode("utf-8"))

    def recebeu(self):
        """Os argumentos que o Anki de mentira anotou (ele roda depois da resposta: espera um pouco); None se não rodou."""
        fim = time.monotonic() + 10
        while not os.path.exists(self.anotados) and time.monotonic() < fim:
            time.sleep(0.05)
        if not os.path.exists(self.anotados):
            return None
        time.sleep(0.2)  # o Anki de mentira anota de uma vez; dá tempo de ele terminar a escrita
        with open(self.anotados, encoding="utf-8") as arquivo:
            return arquivo.read().splitlines()

    def test_o_ps1_responde_cada_exemplo_do_contrato(self):
        self.escrever()
        for exemplo in DO_ABRIDOR["exemplos"]:
            with self.subTest(exemplo["nome"]):
                contexto = exemplo["contexto"]["anki"]
                if contexto in ANKI_NO_LUGAR:
                    self.anki_no_lugar(abre=contexto != "nao_abre")
                else:
                    self.anki_sumiu()
                self.assertEqual(
                    self.conversar(exemplo["mensagem"]), exemplo["resposta"],
                    'O .ps1 e o contrato (complemento/contrato/exemplos.json › abridor) se separaram no exemplo "%s".'
                    % exemplo["nome"],
                )

    def test_abrir_abre_o_anki_no_perfil_anotado(self):
        self.escrever("Usuário 1")
        self.anki_no_lugar(abre=True)
        self.assertEqual(self.conversar({"acao": "abrir"}), {"achou": True, "abriu": True})
        self.assertEqual(self.recebeu(), ["-p", "Usuário 1"])

    def test_sem_perfil_anotado_abrir_abre_o_anki_sem_escolher_perfil(self):
        self.escrever(None)
        self.anki_no_lugar(abre=True)
        self.assertEqual(self.conversar({"acao": "abrir"}), {"achou": True, "abriu": True})
        self.assertEqual(self.recebeu(), [])

    def test_conferir_nao_abre_o_anki(self):
        self.escrever()
        self.anki_no_lugar(abre=True)
        self.assertEqual(self.conversar({"acao": "conferir"}), {"achou": True})
        self.assertIsNone(self.recebeu())


if __name__ == "__main__":
    unittest.main()
