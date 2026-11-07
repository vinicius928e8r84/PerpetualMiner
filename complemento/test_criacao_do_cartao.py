"""A frente Criação (#168) vista de fora: o Cartão que o Anki desenha (a coleção em memória e o renderizador de mentira) e o catálogo da Voz. O que o
script do modelo faz na página é provado por `complemento/test_modelo_da_criacao.js`; o gancho que grava a frase, por `test_contrato_da_criacao.py` (nos dois adaptadores).

    python3.9 complemento/test_criacao_do_cartao.py
"""

import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import SO_O_DEFAULT  # noqa: E402

CATALOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "design", "voz", "catalogo-textos.json")
INGLES = "PerpetualMiner Inglês"
CAMPOS = {"Frase": "She <b>gave up</b> smoking", "Áudio da frase": "[sound:frase.mp3]", "Palavra": "gave up", "Áudio da palavra": "[sound:palavra.mp3]",
          "Dica": "Ela parou de fumar.", "Tradução natural": "Ela parou de fumar."}


def cartao(lang="en", campos=CAMPOS):
    colecao = ColecaoEmMemoria(SO_O_DEFAULT)
    tipo_de_nota.trocar_a_frente(colecao, lang, "criacao")
    return colecao.cartao_renderizado(tipo_de_nota.definicao(lang)["nome"], campos)


class FrenteCriacao(unittest.TestCase):
    def test_a_frente_mostra_a_palavra_com_o_audio_a_dica_e_o_pedido_e_nao_entrega_a_frase(self):
        frente = cartao()["frente"]
        for esperado in ("gave up", "[anki:play:q:0]", "Ela parou de fumar.", "Escreva uma frase sua com esta palavra", 'id="perpetualminer-escrita"'):
            self.assertIn(esperado, frente)
        self.assertNotIn("She", frente)
        self.assertNotIn("frase.mp3", frente)

    def test_o_verso_traz_o_lugar_do_que_a_pessoa_escreveu_ao_lado_do_exemplo_com_o_audio_da_frase(self):
        verso = cartao()["verso"]
        for esperado in ("Você escreveu", "✓ usou a palavra", "Exemplo", "She <b>gave up</b> smoking", 'id="perpetualminer-texto"', 'id="perpetualminer-usou" hidden'):
            self.assertIn(esperado, verso)
        self.assertNotIn("<textarea", verso)  # o campo de escrever é da frente; o verso não o repete

    def test_a_palavra_a_raiz_e_a_frase_gravada_chegam_ao_script_como_texto(self):
        verso = cartao("ru", {"Frase": "Она приходила", "Palavra": "<b>приходила</b>", "Raiz": "ход", "Frase escrita": "Он приходит &amp; уходит"})["verso"]
        self.assertIn('<span id="perpetualminer-palavra" hidden>приходила</span>', verso)
        self.assertIn('<span id="perpetualminer-raiz" hidden>ход</span>', verso)
        self.assertIn('<span id="perpetualminer-gravada" hidden>Он приходит & уходит</span>', verso)

    def test_o_verso_mostra_da_ultima_vez_voce_escreveu_e_a_correcao_so_depois_que_a_ia_corrigiu(self):
        sem = cartao()["verso"]
        com = cartao(campos=dict(CAMPOS, **{"Escrito antes": "I gave up suggar", "Correção": "I gave up sugar."}))["verso"]
        self.assertNotIn("Da última vez você escreveu", sem)
        self.assertNotIn("→", sem)
        corrigido = re.search(r'<div class="ultima-vez">(.*?)</div>', com, re.S).group(1)
        self.assertEqual(re.sub(r"<[^>]+>", "", corrigido), "Da última vez você escreveu I gave up suggar → I gave up sugar.")

    def test_o_verso_do_nivel_continua_depois_do_exemplo(self):
        verso = cartao()["verso"]
        self.assertIn("Ela parou de fumar.", verso.split('<hr id=answer>')[1])

    def test_o_script_do_modelo_e_o_arquivo_do_script_sem_os_comentarios(self):
        modelo = tipo_de_nota.definicao("en", frente="criacao")["modelos"][0]
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelo_da_criacao.js"), encoding="utf-8") as arquivo:
            codigo = [linha for linha in arquivo.read().splitlines() if not linha.lstrip().startswith("//")]
        for lado in (modelo["frente"], modelo["verso"]):
            self.assertIn("\n".join(codigo), lado)
            self.assertNotIn("{{", "\n".join(codigo))  # o Anki leria como campo

    def test_o_estilo_da_criacao_so_entra_no_tipo_de_nota_com_essa_frente(self):
        self.assertIn("#perpetualminer-escrita", tipo_de_nota.definicao("en", frente="criacao")["css"])
        for frente in ("frase_com_audio", "ouvir_primeiro", "lacuna"):
            self.assertEqual(tipo_de_nota.definicao("en", frente=frente)["css"], tipo_de_nota.CSS)

    def test_as_outras_frentes_nao_levam_script(self):
        for frente in ("frase_com_audio", "ouvir_primeiro", "lacuna"):
            modelo = tipo_de_nota.definicao("en", frente=frente)["modelos"][0]
            self.assertNotIn("<script", modelo["frente"] + modelo["verso"])

    def test_o_texto_do_cartao_e_o_aprovado_no_catalogo_da_voz(self):
        with open(CATALOGO, encoding="utf-8") as arquivo:
            catalogo = json.load(arquivo)
        aprovados = {chave: catalogo["BRG-44.cartao" + chave.capitalize()] for chave in tipo_de_nota.TEXTOS_DA_CRIACAO}
        self.assertEqual(aprovados, tipo_de_nota.TEXTOS_DA_CRIACAO)

    def test_o_nome_do_modelo_e_criacao_e_a_frente_e_uma_das_que_a_extensao_manda(self):
        self.assertEqual(tipo_de_nota.definicao("en", frente="criacao")["modelos"][0]["nome"], "Criação")
        self.assertIn("criacao", tipo_de_nota.FRENTES)
        self.assertTrue(re.fullmatch(r"[a-z_]+", "criacao"))


if __name__ == "__main__":
    unittest.main()
