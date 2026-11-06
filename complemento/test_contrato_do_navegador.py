"""O “Abrir no Anki” (#173) como qualquer adaptador de coleção o cumpre: abrir o navegador do Anki na nota de um `guid`. Uma parte do contrato da prévia
(`test_contrato_da_previa.ContratoDaPrevia`, de onde vêm `adaptador` e `adaptador_fechado`), que o adaptador em memória e o do Anki herdam. Em
`navegador_aberto` cada um diz em que notas (pelo `guid`) o navegador foi aberto: o em memória as guarda, o do Anki lê o `aqt` de mentira (`test_no_anki`).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos  # noqa: E402
from complemento.test_contrato_da_criacao import SO_O_DEFAULT  # noqa: E402


class ContratoDoNavegador:
    def navegador_aberto(self, colecao):
        """Os `guid` das notas em que o navegador do Anki foi aberto, na ordem."""
        return list(colecao.navegador_aberto)

    def test_abrir_no_anki_abre_o_navegador_na_nota_do_guid(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        colecao.adicionar_nota("Default", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        self.assertTrue(colecao.abrir_no_navegador("guid-1"))
        self.assertEqual(self.navegador_aberto(colecao), ["guid-1"])

    def test_abrir_no_anki_numa_nota_que_a_colecao_nao_tem_nao_abre_nada(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.assertFalse(colecao.abrir_no_navegador("nao-existe"))
        self.assertEqual(self.navegador_aberto(colecao), [])

    def test_sem_colecao_aberta_o_navegador_nao_abre(self):
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            self.adaptador_fechado().abrir_no_navegador("guid-1")
