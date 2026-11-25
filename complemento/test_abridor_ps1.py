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

from complemento import abridor
from complemento.test_abridor import ANKI_NO_LUGAR, DO_ABRIDOR, RegistroDeMentira


@unittest.skipUnless(shutil.which("pwsh") and os.name == "posix", "o .ps1 só roda aqui onde houver PowerShell (pwsh) num sistema POSIX")
class OPs1NoPowerShell(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.addCleanup(self._raiz.cleanup)
        self.anki = os.path.join(self._raiz.name, "anki.exe")
        self.anotados = os.path.join(self._raiz.name, "anki-recebeu.txt")
        self.diretorio = os.path.join(self._raiz.name, "anki-diretorio.txt")
        self.pasta = os.path.join(self._raiz.name, "abridor")

    def escrever(self, perfil="Usuário 1"):
        abridor.Abridor(
            sistema=abridor.NoWindows({}, RegistroDeMentira()), pasta=self.pasta, programa=self.anki,
        ).escrever(perfil)

    def anki_no_lugar(self, abre):
        with open(self.anki, "w", encoding="utf-8") as arquivo:
            arquivo.write('#!/bin/sh\nfor a in "$@"; do printf "%%s\\n" "$a"; done > "%s"\npwd -P > "%s"\n' % (self.anotados, self.diretorio))
        os.chmod(self.anki, 0o755 if abre else 0o644)

    def anki_sumiu(self):
        if os.path.exists(self.anki):
            os.remove(self.anki)

    def conversar(self, mensagem, diretorio=None):
        if os.path.exists(self.anotados):
            os.remove(self.anotados)
        corpo = json.dumps(mensagem, separators=(",", ":")).encode("utf-8")
        saida = subprocess.run(
            ["pwsh", "-NoProfile", "-NonInteractive", "-File", os.path.join(self.pasta, "abrir-o-anki.ps1")],
            input=struct.pack("<I", len(corpo)) + corpo, stdout=subprocess.PIPE, timeout=60, check=True, cwd=diretorio,
        ).stdout
        tamanho, = struct.unpack_from("<I", saida, 0)
        self.assertEqual(len(saida), 4 + tamanho)
        return json.loads(saida[4:].decode("utf-8"))

    def recebeu(self):
        fim = time.monotonic() + 10
        while not os.path.exists(self.anotados) and time.monotonic() < fim:
            time.sleep(0.05)
        if not os.path.exists(self.anotados):
            return None
        time.sleep(0.2)
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

    def test_o_anki_aberto_nao_herda_a_pasta_do_abridor_como_diretorio_corrente(self):
        self.escrever()
        self.anki_no_lugar(abre=True)
        self.assertEqual(self.conversar({"acao": "abrir"}, diretorio=self.pasta), {"achou": True, "abriu": True})
        self.assertIsNotNone(self.recebeu())
        with open(self.diretorio, encoding="utf-8") as arquivo:
            diretorio_do_anki = arquivo.read().strip()
        self.assertNotEqual(diretorio_do_anki, os.path.realpath(self.pasta))

    def test_conferir_nao_abre_o_anki(self):
        self.escrever()
        self.anki_no_lugar(abre=True)
        self.assertEqual(self.conversar({"acao": "conferir"}), {"achou": True})
        self.assertIsNone(self.recebeu())


if __name__ == "__main__":
    unittest.main()
