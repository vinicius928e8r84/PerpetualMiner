"""O motor de texto de `engine/` visto como o pacote `complemento.motor`: o mesmo código que o Anki roda (Python 3.9, sem PyYAML,
dotenv nem o SDK da OpenAI), conferido nos grupos 3.9 e 3.13 do complemento (C10 de `docs/design/envio-no-complemento.md`).

    python3.9 complemento/test_motor.py
"""

import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio, motor_do_envio  # noqa: E402
from complemento.test_imagens_de_mentira import JPEG_DE_MENTIRA, png_de  # noqa: E402
from complemento.test_openai_de_mentira import OpenAIDeMentira  # noqa: E402

SEM_AS_BIBLIOTECAS_DE_FORA = {"yaml": None, "dotenv": None, "openai": None, "httpx": None, "requests": None, "PIL": None, "gtts": None}


def configuracao_do_teste(motor, pasta):
    config = motor.config_loader.base_config()
    config["openai_api_key"] = "sk-proj-chave-do-teste-0000"
    pasta_do_motor = os.path.dirname(os.path.abspath(motor.config_loader.__file__))
    config["paths"]["prompts"] = {nome: os.path.join(pasta_do_motor, caminho) for nome, caminho in config["paths"]["prompts"].items()}
    config["paths"]["output_dir"] = os.path.join(pasta, "textos")
    config["paths"]["log_dir"] = os.path.join(pasta, "custos")
    return config


class OMotorComoPacote(unittest.TestCase):
    def test_a_configuracao_se_le_sem_pyyaml_nem_dotenv_e_o_tipo_de_nota_e_o_de_hoje(self):
        with mock.patch.dict(sys.modules, SEM_AS_BIBLIOTECAS_DE_FORA):
            motor = envio.motor_do_complemento()
            config = motor.config_loader.base_config()
        self.assertEqual((config["anki"]["note_type"], config["anki"]["fields"]), ("Básico", {"front": "Frente", "back": "Verso"}))  # o da Conexão de hoje (bridge)

    def test_as_imagens_do_motor_rodam_sem_pillow_requests_nem_o_sdk_e_so_o_que_precisa_converter_pede_um_adaptador(self):
        with mock.patch.dict(sys.modules, SEM_AS_BIBLIOTECAS_DE_FORA):
            motor = envio.motor_do_complemento()
            png, mime = motor.image_utils.normalize_image_bytes(png_de("a"), target_format="PNG")
            motor.image_utils.usar_adaptador(None)
            with self.assertRaises(motor.image_utils.UnsupportedImageFormatError):
                motor.image_utils.normalize_image_bytes(JPEG_DE_MENTIRA, target_format="PNG")
        self.assertEqual((png, mime), (png_de("a"), "image/png"))

    def test_o_envio_le_o_estilo_do_idioma_do_pedido_sem_as_bibliotecas_de_fora(self):
        fila = SimpleNamespace(dados=SimpleNamespace(raiz="sem-pasta-do-dono"), pasta_dos_textos=lambda job_id: "textos", pasta_dos_custos=lambda job_id: "custos")
        with mock.patch.dict(sys.modules, SEM_AS_BIBLIOTECAS_DE_FORA):
            motor = envio.motor_do_complemento()
            pedidos = {lang: {"lang": lang, "deckName": "x", "jobId": "j", "tts": {}} for lang in ("en", "ru")}
            configs = {lang: motor_do_envio.configuracao_do_motor(motor, fila, pedido, None) for lang, pedido in pedidos.items()}
        self.assertEqual(
            {lang: (c["anki"]["note_type"], c["estilo"]["nivel"], c["estilo"]["entrada"], os.path.basename(c["estilo"]["prompt"])) for lang, c in configs.items()},
            {"en": ("PerpetualMiner Inglês", "iniciante", "palavras", "en_iniciante.txt"), "ru": ("PerpetualMiner Russo", "iniciante", "frase", "ru_iniciante.txt")},
        )

    def test_uma_linha_com_duas_palavras_tem_dois_cartoes_e_a_linha_russa_um(self):
        motor = envio.motor_do_complemento()
        self.assertEqual(envio.cartoes_da_frase(motor, "en", "keep running | run : They keep running"), 2)
        self.assertEqual(envio.cartoes_da_frase(motor, "ru", "Я не мальчик! [Context: Série - Episódio 1]"), 1)
        self.assertEqual(envio.cartoes_da_frase(motor, "en", ""), 0)

    def test_o_motor_de_audio_importa_sem_a_gtts_e_diz_o_que_o_cartao_fala_e_com_que_sotaque(self):
        with mock.patch.dict(sys.modules, SEM_AS_BIBLIOTECAS_DE_FORA):
            motor = envio.motor_do_complemento()
            config = motor.config_loader.base_config()
            trabalho = motor.parser.get_card_jobs(motor.parser.parse_mining_line("give up : She gave up smoking"))[0]
            fala = motor.generate_audio.voices(trabalho, "Front: She *gave up* smoking\n\nBack: give up", config)
        self.assertEqual(fala, (("give up", "en", "com"), ("She gave up smoking", "en", "co.uk")))

    def test_gera_um_cartao_contra_a_openai_de_mentira_sem_o_sdk_e_o_chama_pelo_nome_que_o_envio_deu(self):
        with tempfile.TemporaryDirectory() as pasta, OpenAIDeMentira() as openai, mock.patch.dict(sys.modules, SEM_AS_BIBLIOTECAS_DE_FORA):
            motor = envio.motor_do_complemento()
            config = configuracao_do_teste(motor, pasta)
            falhas = {}
            entrada = motor.parser.parse_mining_line("give up : She gave up smoking")
            salvos = motor.generate_cards.run(
                [entrada], config, openai_base=openai.base, failures=falhas, card_stem=lambda trabalho, posicao: "17-%d" % posicao)
            with open(os.path.join(pasta, "textos", "17-0.txt"), encoding="utf-8") as arquivo:
                nota = motor.send_to_anki.card_fields(arquivo.read(), "en")
            with open(os.path.join(pasta, "custos", "costs.jsonl"), encoding="utf-8") as arquivo:
                custos = arquivo.read()
        self.assertEqual((salvos, falhas), (["17-0"], {}))
        self.assertIn("<b>give up</b>", nota["front"])
        self.assertEqual([p[0] for p in openai.chats], ["Bearer sk-proj-chave-do-teste-0000"])
        self.assertIn('"keyword": "17-0"', custos)
        self.assertNotIn("give up", custos)


if __name__ == "__main__":
    unittest.main()
