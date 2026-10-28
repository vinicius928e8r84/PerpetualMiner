"""O perfil fixo (#149) como qualquer adaptador de coleção o cumpre: os Cartões só entram no perfil marcado, e a Conexão entra nele
ou o abre a pedido. Uma parte do contrato do adaptador (`test_colecao_em_memoria.ContratoDoAdaptadorDaColecao`, de onde vêm
`DESCRICAO`, `adaptador` e `adaptador_fechado`): o adaptador em memória e o do Anki herdam as duas e passam pelos mesmos testes.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, perfil  # noqa: E402


class ContratoDoPerfilFixo:
    def perfil_fixo(self, marcado=None):
        """O perfil fixo numa pasta temporária, com `marcado` já marcado (ou nada marcado)."""
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        fixo = perfil.PerfilFixo(os.path.join(pasta.name, "perfil.json"))
        if marcado:
            fixo.marcar(marcado)
        return fixo

    # O perfil fixo (#149): os Cartões só entram no perfil marcado.

    def gravar_uma_nota(self, colecao):
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")

    def test_a_gravacao_e_recusada_com_outro_perfil_aberto_e_nada_e_gravado_nele(self):
        colecao = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        operacoes = (
            lambda: colecao.tipo_de_nota("Básico"),
            lambda: colecao.guids_existentes(["guid-1"]),
            lambda: self.gravar_uma_nota(colecao),
            lambda: self.gravar_o_cartao(colecao),
        )
        for operacao in operacoes:
            with self.assertRaises(baralhos.OutroPerfil) as erro:
                operacao()
            self.assertEqual((str(erro.exception), erro.exception.aberto, erro.exception.marcado), ("anki_other_profile", "Beto", "Ana"))
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 4)  # a leitura segue; nada foi gravado

    def test_a_gravacao_vale_no_perfil_marcado(self):
        colecao = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Ana")
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        self.gravar_uma_nota(colecao)
        self.assertEqual(colecao.guids_existentes(["guid-1"]), {"guid-1"})

    def test_o_perfil_marcado_que_o_anki_nao_tem_mais_recusa_a_gravacao_em_qualquer_perfil(self):
        colecao = self.adaptador(self.DESCRICAO, perfis=("Beto",), aberto="Beto")
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        with self.assertRaises(baralhos.PerfilSumiu) as erro:
            self.gravar_uma_nota(colecao)
        self.assertEqual((str(erro.exception), erro.exception.marcado), ("anki_profile_missing", "Ana"))
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 4)

    def test_o_primeiro_perfil_em_que_se_grava_fica_marcado_e_o_outro_depois_e_recusado(self):
        fixo = self.perfil_fixo()
        colecao = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Ana")
        colecao.fixar_o_perfil(fixo)
        self.gravar_uma_nota(colecao)
        self.assertEqual(fixo.marcado(), "Ana")
        outro = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        outro.fixar_o_perfil(fixo)
        with self.assertRaises(baralhos.OutroPerfil):
            self.gravar_uma_nota(outro)

    def test_com_o_anki_na_tela_de_perfis_a_conexao_entra_no_perfil_marcado(self):
        colecao = self.adaptador_fechado(perfis=("Ana", "Beto"))
        colecao.fixar_o_perfil(self.perfil_fixo("Beto"))
        self.assertIsNone(colecao.perfil_aberto())
        self.assertTrue(colecao.entrar_no_perfil_fixo())
        self.assertEqual(colecao.perfil_aberto(), "Beto")

    def test_com_um_perfil_aberto_a_conexao_nunca_entra_sozinha_em_outro(self):
        colecao = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        self.assertFalse(colecao.entrar_no_perfil_fixo())
        self.assertEqual(colecao.perfil_aberto(), "Beto")

    def test_sem_perfil_marcado_ou_com_o_marcado_apagado_a_conexao_nao_entra_em_perfil_nenhum(self):
        for marcado in (None, "Ana"):
            with self.subTest(marcado=marcado):
                colecao = self.adaptador_fechado(perfis=("Beto",))
                colecao.fixar_o_perfil(self.perfil_fixo(marcado))
                self.assertFalse(colecao.entrar_no_perfil_fixo())
                self.assertIsNone(colecao.perfil_aberto())

    def test_o_clique_em_abrir_o_perfil_troca_o_perfil_aberto_pelo_marcado(self):
        colecao = self.adaptador(self.DESCRICAO, perfis=("Ana", "Beto"), aberto="Beto")
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        self.assertTrue(colecao.trocar_para_o_perfil_fixo())
        self.assertEqual(colecao.perfil_aberto(), "Ana")
        self.assertFalse(colecao.trocar_para_o_perfil_fixo())  # já é o marcado: nada a fazer

    def test_o_clique_em_abrir_o_perfil_com_o_anki_na_tela_de_perfis_entra_no_marcado(self):
        colecao = self.adaptador_fechado(perfis=("Ana", "Beto"))
        colecao.fixar_o_perfil(self.perfil_fixo("Ana"))
        self.assertTrue(colecao.trocar_para_o_perfil_fixo())
        self.assertEqual(colecao.perfil_aberto(), "Ana")
