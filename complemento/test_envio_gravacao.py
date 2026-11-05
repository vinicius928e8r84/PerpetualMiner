"""A gravação dos arquivos do Envio (`gravacao_de_json.gravar_json`) com várias threads no mesmo arquivo.

    python3.9 complemento/test_envio_gravacao.py
"""

import json
import os
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio, gravacao_de_json  # noqa: E402

THREADS = 4


class DuasGravacoesDoMesmoArquivo(unittest.TestCase):
    def test_threads_gravando_o_mesmo_arquivo_ao_mesmo_tempo_nao_se_atropelam(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = os.path.join(pasta, "estado", "job.json")
            todas_escreveram = threading.Barrier(THREADS, timeout=10)
            dump = json.dump

            def dump_que_espera_as_outras(dados, arquivo, **opcoes):
                dump(dados, arquivo, **opcoes)
                arquivo.flush()
                todas_escreveram.wait()  # todas já escreveram o provisório antes de qualquer uma renomear

            erros = []

            def gravar(numero):
                try:
                    gravacao_de_json.gravar_json(caminho, {"quem": numero})
                except BaseException as erro:  # noqa: BLE001
                    erros.append(erro)

            with mock.patch.object(gravacao_de_json.json, "dump", dump_que_espera_as_outras):
                threads = [threading.Thread(target=gravar, args=(n,)) for n in range(THREADS)]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join()

            self.assertEqual(erros, [])
            with open(caminho, encoding="utf-8") as arquivo:
                self.assertIn(json.load(arquivo)["quem"], range(THREADS))
            self.assertEqual(os.listdir(os.path.dirname(caminho)), ["job.json"])

    def test_gravacao_que_falha_nao_deixa_o_provisorio(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = os.path.join(pasta, "job.json")
            with self.assertRaises(TypeError):
                gravacao_de_json.gravar_json(caminho, {"x": object()})
            self.assertEqual(os.listdir(pasta), [])


if __name__ == "__main__":
    unittest.main()
