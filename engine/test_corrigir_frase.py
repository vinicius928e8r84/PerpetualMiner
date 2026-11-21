"""The correction of a sentence the Criação front kept (#169), seen from the engine: it asks through the `pedir` it is given
(the Conexão's IA dos cartões pays and records the cost) and never reads a credential from the config."""

import tempfile
import unittest
from pathlib import Path

import corrigir_frase


def _config(raiz: Path) -> dict:
    prompt = raiz / "correcao.txt"
    prompt.write_text("  correction prompt  \n", encoding="utf-8")
    return {"openai": {"chat_model": "gpt-4o"}, "paths": {"prompts": {"correcao_da_criacao": str(prompt)}, "log_dir": str(raiz / "log")}}


NOTA = {"palavra": "give up", "frase": "She gave up", "escrita": "She give up"}


class CorrigirPeloPedir(unittest.TestCase):
    def test_a_correcao_pede_com_o_prompt_e_a_frase_e_devolve_a_frase_sem_aspas(self):
        pedidos = []
        with tempfile.TemporaryDirectory() as pasta:
            corrigida = corrigir_frase.corrigir(
                _config(Path(pasta)), lambda sistema, mensagem, rotulo: pedidos.append((sistema, mensagem, rotulo)) or '"She gave up the job."',
                {"palavra": "give up", "frase": "She gave up smoking", "escrita": "She give up the job"})
            sem_custo = not (Path(pasta) / "log").exists()
        self.assertEqual(corrigida, "She gave up the job.")
        self.assertEqual(pedidos, [("correction prompt", "Word: give up\nExample sentence: She gave up smoking\nLearner's sentence: She give up the job", "")])
        self.assertTrue(sem_custo)

    def test_sem_resposta_a_correcao_e_vazia(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.assertEqual(corrigir_frase.corrigir(_config(Path(pasta)), lambda *_: None, NOTA), "")

    def test_so_a_mesma_aspa_dos_dois_lados_sai_e_uma_aspa_sozinha_fica(self):
        respostas = {'"': '"', "'She gave up.'": "She gave up.", "“She gave up.”": "“She gave up.”", "”She gave up.”": "She gave up.",
                     "\"She gave up.'": "\"She gave up.'", "«She gave up.«": "«She gave up.«"}
        with tempfile.TemporaryDirectory() as pasta:
            corrigidas = {resposta: corrigir_frase.corrigir(_config(Path(pasta)), lambda *_, r=resposta: r, NOTA) for resposta in respostas}
        self.assertEqual(corrigidas, respostas)


if __name__ == "__main__":
    unittest.main()
