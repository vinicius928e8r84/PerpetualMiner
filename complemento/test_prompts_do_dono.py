"""Os prompts do dono (#178), vistos de fora: o complemento traz os prompts padrão; um arquivo do dono na pasta de prompts da pasta de dados
(`user_files/prompts`) vale no lugar do padrão, e apagar o arquivo volta ao padrão. O que se confere é o prompt que chega à OpenAI de mentira.

    python3.9 complemento/test_prompts_do_dono.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
DO_DONO = "Escreva o Cartão do meu jeito, só em português.\n"
FRASE = "gave up : She gave up smoking"


def prompt_do_padrao(nome):
    with open(os.path.join(AQUI, "..", "engine", "prompts", nome), encoding="utf-8") as arquivo:
        return arquivo.read().strip()


def prompt_enviado(conexao, id_, linha=FRASE, **argumentos):
    """O prompt de sistema que a OpenAI de mentira recebeu para o Envio."""
    antes = len(conexao.openai.chats)
    conexao.criar(pedido(id_, linha, **argumentos))
    conexao.esperar(id_)
    return conexao.openai.chats[antes][1]["messages"][0]["content"].strip()


class OsPromptsPadraoVemNoComplemento(unittest.TestCase):
    def test_sem_arquivo_do_dono_o_cartao_de_ingles_e_o_de_russo_saem_com_o_prompt_padrao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            ingles = prompt_enviado(conexao, ID)
            russo = prompt_enviado(conexao, OUTRO_ID, "Я не мальчик!", lang="ru")
        self.assertEqual(ingles, prompt_do_padrao("en_iniciante.txt"))
        self.assertEqual(russo, prompt_do_padrao("ru_iniciante.txt"))


class OArquivoDoDonoValeNoLugarDoPadrao(unittest.TestCase):
    def escrever(self, pasta, nome, texto):
        os.makedirs(os.path.join(pasta, "prompts"), exist_ok=True)
        with open(os.path.join(pasta, "prompts", nome), "w", encoding="utf-8") as arquivo:
            arquivo.write(texto)

    def test_o_arquivo_do_dono_com_o_nome_do_prompt_vale_no_lugar_do_padrao_so_para_aquele_idioma(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            self.escrever(pasta, "en_iniciante.txt", DO_DONO)
            ingles = prompt_enviado(conexao, ID)
            russo = prompt_enviado(conexao, OUTRO_ID, "Я не мальчик!", lang="ru")
        self.assertEqual(ingles, DO_DONO.strip())
        self.assertEqual(russo, prompt_do_padrao("ru_iniciante.txt"))

    def test_apagar_o_arquivo_do_dono_volta_ao_prompt_padrao_no_envio_seguinte(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            self.escrever(pasta, "en_iniciante.txt", DO_DONO)
            com_o_arquivo = prompt_enviado(conexao, ID)
            os.remove(os.path.join(pasta, "prompts", "en_iniciante.txt"))
            sem_o_arquivo = prompt_enviado(conexao, OUTRO_ID, "late : She is late")
        self.assertEqual((com_o_arquivo, sem_o_arquivo), (DO_DONO.strip(), prompt_do_padrao("en_iniciante.txt")))

    def test_um_arquivo_do_dono_vazio_nao_deixa_o_cartao_sem_prompt(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            self.escrever(pasta, "en_iniciante.txt", "  \n")
            self.assertEqual(prompt_enviado(conexao, ID), prompt_do_padrao("en_iniciante.txt"))

    def test_editar_o_arquivo_do_dono_vale_no_envio_seguinte_sem_reiniciar_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            self.escrever(pasta, "en_iniciante.txt", DO_DONO)
            primeiro = prompt_enviado(conexao, ID)
            self.escrever(pasta, "en_iniciante.txt", "Outra versão do meu prompt.\n")
            segundo = prompt_enviado(conexao, OUTRO_ID, "late : She is late")
        self.assertEqual((primeiro, segundo), (DO_DONO.strip(), "Outra versão do meu prompt."))


if __name__ == "__main__":
    unittest.main()
