"""As imagens do Cartão (busca, juiz, triagem, geração e a escolha de qual vale) rodam só com a biblioteca padrão: é o que o Anki tem."""

import subprocess
import sys
import unittest
from pathlib import Path


class ImagensSemBibliotecas(unittest.TestCase):
    def test_os_modulos_de_imagem_importam_sem_openai_requests_httpx_pillow_nem_rich(self):
        codigo = (
            "import sys, warnings\n"
            "for nome in ('openai', 'requests', 'httpx', 'PIL', 'rich', 'gtts', 'yaml', 'dotenv'): sys.modules[nome] = None\n"
            "antes = list(warnings.filters)\n"
            "import google_images, image_guard, image_judge, generate_images, image_utils, image_pipeline, image_queries, extract_prompts\n"
            "print(antes == list(warnings.filters))"
        )
        feito = subprocess.run([sys.executable, "-c", codigo], cwd=str(Path(__file__).parent), capture_output=True, text=True)
        self.assertEqual((feito.stdout.strip(), feito.stderr), ("True", ""))


if __name__ == "__main__":
    unittest.main()
