"""A configuração do motor lida sem PyYAML e sem dotenv: o arquivo `config.json` e a chave de onde ela vier."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import config_loader


class ConfiguracaoDoMotor(unittest.TestCase):
    def test_a_chave_dada_pela_conexao_vale_sem_olhar_o_ambiente_nem_o_env(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-do-ambiente"}):
            config = config_loader.load_config(openai_api_key="sk-da-conexao")
        self.assertEqual(config["openai_api_key"], "sk-da-conexao")

    def test_o_tipo_de_nota_e_os_campos_continuam_os_de_hoje(self):
        config = config_loader.load_config(openai_api_key="sk-x")
        self.assertEqual(
            (config["anki"]["note_type"], config["anki"]["fields"], config["languages"]["ru"]["note_type"]),
            ("Básico", {"front": "Frente", "back": "Verso"}, "Básico"),
        )
        self.assertEqual(config["paths"]["prompts"], {"en_card": "prompts/en_card.txt", "ru_card": "prompts/ru_card.txt", "correcao_da_criacao": "prompts/correcao_da_criacao.txt"})

    def test_sem_chave_dada_a_chave_vem_do_ambiente(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-do-ambiente"}):
            self.assertEqual(config_loader.load_config()["openai_api_key"], "sk-do-ambiente")

    def test_sem_chave_no_ambiente_ela_vem_do_env_ao_lado_do_motor_sem_mudar_o_ambiente(self):
        with tempfile.TemporaryDirectory() as pasta:
            env = Path(pasta) / ".env"
            env.write_text('# comentário\nOUTRA=1\nOPENAI_API_KEY="sk-do-arquivo"\n', encoding="utf-8")
            with mock.patch.dict(os.environ, {}, clear=True):
                config = config_loader.load_config(env_file=env)
                ambiente = dict(os.environ)
        self.assertEqual((config["openai_api_key"], ambiente), ("sk-do-arquivo", {}))

    def test_sem_chave_em_lugar_nenhum_o_erro_diz_onde_por(self):
        with tempfile.TemporaryDirectory() as pasta, mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(EnvironmentError, "OPENAI_API_KEY"):
                config_loader.load_config(env_file=Path(pasta) / ".env")

    def test_a_base_da_configuracao_e_o_json_sem_a_chave(self):
        base = config_loader.base_config()
        with open(Path(config_loader.__file__).parent / "config.json", encoding="utf-8") as arquivo:
            self.assertEqual(base, json.load(arquivo))
        self.assertNotIn("openai_api_key", base)

    def test_um_endereco_no_config_json_nao_desvia_a_chave_para_outro_lugar(self):
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = Path(pasta) / "config.json"
            arquivo.write_text(json.dumps({"openai": {"image_model": "m"}, "openai_base": "http://outro.exemplo", "openverse_base": "http://outro.exemplo"}), encoding="utf-8")
            with mock.patch.object(config_loader, "CONFIG_PATH", arquivo):
                config = config_loader.load_config(openai_api_key="sk-x")
        self.assertEqual(config, {"openai": {"image_model": "m"}, "openai_api_key": "sk-x"})

    def test_cada_leitura_e_uma_copia_nova(self):
        primeira = config_loader.base_config()
        primeira["anki"]["deck_name"] = "mudado"
        self.assertNotEqual(config_loader.base_config()["anki"]["deck_name"], "mudado")


if __name__ == "__main__":
    unittest.main()
