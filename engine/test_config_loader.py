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

    def test_o_env_le_cada_nome_e_valor_sem_export_sem_espacos_e_sem_o_par_de_aspas_e_o_ultimo_vale(self):
        linhas = [
            "",
            "   ",
            "# OPENAI_API_KEY=sk-comentada",
            "   # COMENTARIO=com espacos antes",
            "SEM_IGUAL",
            "SIMPLES=valor",
            "  ESPACOS  =  com espacos  ",
            "export EXPORTADA=e1",
            "  export    EXPORTADA_COM_ESPACOS  = e2",
            "exportJUNTO=e3",
            "export=e4",
            'DUPLAS="entre aspas"',
            "SIMPLES_ASPAS='entre aspas simples'",
            "MISTURADAS=\"abre e fecha outra'",
            "UMA_ASPA='",
            'SO_DUAS=""',
            "ASPAS_DENTRO=a'b'c",
            "IGUAL_NO_VALOR=a=b=c",
            "VAZIA=",
            "=sem nome",
            "REPETIDA=primeira",
            "REPETIDA=segunda",
            "COM_HASH=valor # nao e comentario",
        ]
        with tempfile.TemporaryDirectory() as pasta:
            env = Path(pasta) / ".env"
            env.write_text("\n".join(linhas) + "\n", encoding="utf-8")
            lido = config_loader._ler_env(env)
        self.assertEqual(lido, {
            "SIMPLES": "valor",
            "ESPACOS": "com espacos",
            "EXPORTADA": "e1",
            "EXPORTADA_COM_ESPACOS": "e2",
            "exportJUNTO": "e3",
            "export": "e4",
            "DUPLAS": "entre aspas",
            "SIMPLES_ASPAS": "entre aspas simples",
            "MISTURADAS": "\"abre e fecha outra'",
            "UMA_ASPA": "'",
            "SO_DUAS": "",
            "ASPAS_DENTRO": "a'b'c",
            "IGUAL_NO_VALOR": "a=b=c",
            "VAZIA": "",
            "": "sem nome",
            "REPETIDA": "segunda",
            "COM_HASH": "valor # nao e comentario",
        })

    def test_um_env_que_nao_existe_ou_nao_e_arquivo_nao_tem_nada(self):
        with tempfile.TemporaryDirectory() as pasta:
            self.assertEqual((config_loader._ler_env(Path(pasta) / "falta.env"), config_loader._ler_env(Path(pasta))), ({}, {}))

    def test_a_chave_vazia_ou_entre_aspas_vazias_no_env_e_chave_que_falta(self):
        for linha in ("OPENAI_API_KEY=", 'OPENAI_API_KEY=""', "export OPENAI_API_KEY=''"):
            with self.subTest(linha=linha), tempfile.TemporaryDirectory() as pasta, mock.patch.dict(os.environ, {}, clear=True):
                env = Path(pasta) / ".env"
                env.write_text(linha + "\n", encoding="utf-8")
                with self.assertRaisesRegex(EnvironmentError, "OPENAI_API_KEY"):
                    config_loader.load_config(env_file=env)

    def test_a_chave_exportada_e_entre_aspas_simples_no_env_vale(self):
        with tempfile.TemporaryDirectory() as pasta, mock.patch.dict(os.environ, {}, clear=True):
            env = Path(pasta) / ".env"
            env.write_text("  export  OPENAI_API_KEY = 'sk-exportada'  \n", encoding="utf-8")
            self.assertEqual(config_loader.load_config(env_file=env)["openai_api_key"], "sk-exportada")

    def test_cada_leitura_e_uma_copia_nova(self):
        primeira = config_loader.base_config()
        primeira["anki"]["deck_name"] = "mudado"
        self.assertNotEqual(config_loader.base_config()["anki"]["deck_name"], "mudado")


if __name__ == "__main__":
    unittest.main()
