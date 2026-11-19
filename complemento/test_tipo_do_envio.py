"""O tipo de nota de um Envio (C4) sem o Envio: conferido uma vez no começo, ele é um valor do Envio, e a nota de cada Cartão é posta nele.
A coleção é a em memória; o caminho inteiro está em `test_envio_tipo_de_nota.py` e `test_tipo_proprio.py`.

    python3.9 complemento/test_tipo_do_envio.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.tipo_do_envio import TipoDoEnvio

RUSSO = {"lang": "ru", "deckName": "Русский"}


def conferir(colecao, pedido):
    leituras = []

    def com_a_colecao(leitura):
        leituras.append(leitura)
        return leitura()

    return TipoDoEnvio.conferir(colecao, pedido, com_a_colecao), leituras


class OTipoDoEnvio(unittest.TestCase):
    def test_o_tipo_da_conexao_que_falta_e_criado_pela_espera_do_anki_e_serve(self):
        colecao = ColecaoEmMemoria()
        tipo, leituras = conferir(colecao, RUSSO)
        definicao = tipo_de_nota.definicao("ru")
        self.assertEqual((tipo.nome, tipo.serve, len(leituras)), (definicao["nome"], True, 1))
        self.assertEqual(colecao.tipo_de_nota(definicao["nome"]), definicao["campos"])

    def test_no_tipo_da_conexao_de_antes_de_um_campo_opcional_o_texto_dele_vai_para_o_campo_de_reserva(self):
        definicao = tipo_de_nota.definicao("ru")
        (opcional, reserva), = definicao["opcionais"].items()
        colecao = ColecaoEmMemoria()
        colecao.criar_tipo_de_nota(dict(definicao, campos=[campo for campo in definicao["campos"] if campo != opcional]))
        tipo, _ = conferir(colecao, RUSSO)
        nota = {"campos": {"Frase": "Я не мальчик!", opcional: "simples", reserva: "definição"}, "etiquetas": []}
        nome, frentes, posta = tipo.nota_no_tipo(("Frase",), nota)
        self.assertTrue(tipo.serve)
        self.assertEqual((nome, frentes), (definicao["nome"], ("Frase",)))
        self.assertEqual(posta["campos"], {"Frase": "Я не мальчик!", reserva: "definição<br>simples"})
        self.assertEqual(nota["campos"][opcional], "simples")

    def test_no_tipo_da_conexao_com_todos_os_campos_a_nota_fica_como_veio(self):
        definicao = tipo_de_nota.definicao("ru")
        (opcional, reserva), = definicao["opcionais"].items()
        tipo, _ = conferir(ColecaoEmMemoria(), RUSSO)
        nota = {"campos": {opcional: "simples", reserva: "definição"}, "etiquetas": []}
        self.assertEqual(tipo.nota_no_tipo(("Frase",), nota)[2], nota)

    def test_o_tipo_da_pessoa_que_nao_existe_nao_serve_e_nunca_e_criado(self):
        colecao = ColecaoEmMemoria()
        pedido = dict(RUSSO, tipoProprio={"nome": "Meu tipo", "mapa": {"frase": "Frente"}})
        tipo, _ = conferir(colecao, pedido)
        self.assertEqual((tipo.nome, tipo.serve, colecao.tipo_de_nota("Meu tipo")), ("Meu tipo", False, None))


if __name__ == "__main__":
    unittest.main()
