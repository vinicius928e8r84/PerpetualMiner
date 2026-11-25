import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos
from complemento.test_contrato_da_criacao import SO_O_DEFAULT
from complemento.nota_a_gravar import NotaAGravar


class ContratoDoNavegador:
    def navegador_aberto(self, colecao):
        return list(colecao.navegador_aberto)

    def test_abrir_no_anki_abre_o_navegador_na_nota_do_guid(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        colecao.adicionar_nota(NotaAGravar("Default", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1"))
        self.assertTrue(colecao.abrir_no_navegador("guid-1"))
        self.assertEqual(self.navegador_aberto(colecao), ["guid-1"])

    def test_abrir_no_anki_numa_nota_que_a_colecao_nao_tem_nao_abre_nada(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.assertFalse(colecao.abrir_no_navegador("nao-existe"))
        self.assertEqual(self.navegador_aberto(colecao), [])

    def test_sem_colecao_aberta_o_navegador_nao_abre(self):
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            self.adaptador_fechado().abrir_no_navegador("guid-1")
