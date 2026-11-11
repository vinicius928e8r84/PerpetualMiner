"""O Envio pelo adaptador do Anki, do `POST /jobs` à nota e à mídia no sqlite da coleção de mentira, com a OpenAI, a voz do Google e o Openverse
de mentira na fronteira HTTP.

    python3.9 complemento/test_no_anki_envio.py
"""

import os
import re
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import no_anki  # noqa: E402
from complemento.test_pareamento_de_mentira import ao_carregar_pareado, pedir_como_a_extensao  # noqa: E402
from complemento.test_colecao_em_memoria import DESCRICAO  # noqa: E402
from complemento.test_imagens_de_mentira import OpenverseDeMentira, png_de  # noqa: E402
from complemento.test_no_anki import AnkiComColecaoDeMentira, SemRegistroReal, ler_pelo_http  # noqa: E402


class EnvioGravadoNoAnki(SemRegistroReal, unittest.TestCase):
    """O Envio pelo adaptador do Anki, do `POST /jobs` à nota no sqlite da coleção, com a OpenAI de mentira."""

    def test_uma_frase_vira_nota_com_o_audio_e_a_foto_na_colecao_gravada_pela_thread_principal(self):
        from complemento.test_openai_de_mentira import OpenAIDeMentira
        from complemento.test_voz_de_mentira import VozDeMentira

        anki = AnkiComColecaoDeMentira(DESCRICAO)
        self.addCleanup(anki.encerrar)
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai, VozDeMentira() as voz, \
                OpenverseDeMentira({"keep going": ["rua-1"]}) as openverse:
            conexao = ao_carregar_pareado(
                anki, pasta, porta=0, abridor=None, ao_sincronizar=lambda colecao: None, openai_base=openai.base,
                openverse_base=openverse.base, voz_base=voz.base)
            try:
                conexao.cofre.guardar("openai", "sk-proj-chave-do-anki-0000")
                job = "11111111-2222-4333-8444-555555555555"
                ler_pelo_http(conexao.porta, "/jobs", {"jobId": job, "lang": "en", "deckName": "Inglês",
                                                       "entries": [{"phraseId": 1, "line": "keep going : They keep going"}]})
                fim = time.monotonic() + 10
                while ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]["status"] not in ("completed", "partial", "failed"):
                    self.assertLess(time.monotonic(), fim)
                    time.sleep(0.02)
                estado = ler_pelo_http(conexao.porta, "/jobs/get", {"jobId": job})[1]["state"]
            finally:
                conexao.parar()
        self.assertEqual(estado["status"], "completed")
        notas = anki.col.notas_gravadas()
        sons = re.findall(r"\[sound:([^\]]+)\]", notas[0][0])
        imagens = re.findall(r'<img src="([^"]+)">', notas[0][0])
        self.assertEqual([re.sub(r"<span[^>]*>|</span>", "", flds.split("\x1f")[0]) for flds, _, _ in notas], ["They <b>keep going</b>"])
        self.assertEqual((len(sons), len(imagens)), (2, 1))
        self.assertEqual(sorted(anki.col.arquivos_de_midia), sorted(sons + imagens))
        self.assertEqual(anki.col.arquivos_de_midia[imagens[0]], png_de("rua-1"))
        self.assertEqual(anki.col.fora_da_principal, [])


if __name__ == "__main__":
    unittest.main()
