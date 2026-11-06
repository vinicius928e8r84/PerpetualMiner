"""O gancho da revisão da frente Criação (#168) como qualquer adaptador de coleção o cumpre: a frase que a página do Cartão manda vai para o campo
“Frase escrita” da nota em revisão. Uma parte de `test_contrato_da_criacao.ContratoDaCriacao` (de onde vêm `adaptador`, `preparar`, `sincronizar` e
`com_notas_gravadas`): o adaptador em memória e o do Anki passam pelos mesmos testes."""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import criacao_na_revisao, tipo_de_nota  # noqa: E402

SO_O_DEFAULT = {"baralhos": [{"nome": "Default"}]}


class ContratoDoGanchoDaCriacao:
    # -- a frente Criação (#168): o gancho da revisão grava a frase no campo da nota --

    def na_revisao(self, colecao, guid, mensagem):
        """A página do Cartão manda `mensagem` (`pycmd`) durante a revisão da nota de `guid`; devolve o que o gancho responde. O adaptador do Anki roda na thread principal."""
        contexto = types.SimpleNamespace(card=types.SimpleNamespace(note=lambda: types.SimpleNamespace(guid=guid)))
        return self.na_thread_principal(lambda: criacao_na_revisao.gancho(colecao)((False, None), mensagem, contexto))

    def na_thread_principal(self, funcao):
        return funcao()

    def escrita_da_nota(self, colecao, baralho="PerpetualMiner::Inglês"):
        return dict(colecao.cartoes_do_baralho(baralho)[0]["campos"]).get("Frase escrita", "")

    def test_o_gancho_da_revisao_grava_a_frase_escrita_no_campo_da_nota_e_as_outras_notas_nao_mudam(self):
        colecao = self.com_notas_gravadas()
        colecao.adicionar_nota("PerpetualMiner::Inglês", "PerpetualMiner Inglês", {"Frase": "Outra", "Palavra": "outra"}, [], "g2")
        outra_antes = dict(colecao.cartoes_do_baralho("PerpetualMiner::Inglês")[1]["campos"])
        self.assertEqual(self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "I gave up sugar last year."), (True, None))
        self.assertEqual(self.escrita_da_nota(colecao), "I gave up sugar last year.")
        self.assertEqual(dict(colecao.cartoes_do_baralho("PerpetualMiner::Inglês")[1]["campos"]), outra_antes)

    def test_a_segunda_frase_escrita_na_mesma_nota_troca_a_primeira(self):
        colecao = self.com_notas_gravadas()
        self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "primeira")
        self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "segunda")
        self.assertEqual(self.escrita_da_nota(colecao), "segunda")

    def test_a_frase_escrita_vai_como_texto_e_nao_como_html(self):
        colecao = self.com_notas_gravadas()
        self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "<b>gave up</b> & more\nlinha dois")
        self.assertEqual(self.escrita_da_nota(colecao), "&lt;b&gt;gave up&lt;/b&gt; &amp; more<br>linha dois")

    def test_a_frase_escrita_tem_limite_de_tamanho(self):
        colecao = self.com_notas_gravadas()
        self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "a" * 5000)
        self.assertEqual(len(self.escrita_da_nota(colecao)), 2000)

    def test_uma_nota_de_outro_tipo_de_nota_nao_recebe_a_frase(self):
        colecao = self.adaptador(self.DESCRICAO)
        self.preparar(colecao)
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "g-basico")
        antes = colecao.cartoes_do_baralho("Inglês")
        self.na_revisao(colecao, "g-basico", tipo_de_nota.MENSAGEM_DA_CRIACAO + "frase")
        self.na_revisao(colecao, "g-que-nao-existe", tipo_de_nota.MENSAGEM_DA_CRIACAO + "frase")
        self.assertEqual(colecao.cartoes_do_baralho("Inglês"), antes)

    def test_uma_mensagem_que_nao_e_da_criacao_passa_sem_ser_tratada(self):
        colecao = self.com_notas_gravadas()
        self.assertEqual(self.na_revisao(colecao, "g1", "ans"), (False, None))
        self.assertEqual(self.escrita_da_nota(colecao), "")

    def test_durante_a_sincronizacao_a_frase_nao_e_gravada_e_a_revisao_segue(self):
        colecao = self.com_notas_gravadas()
        self.sincronizar(colecao, True)
        self.assertEqual(self.na_revisao(colecao, "g1", tipo_de_nota.MENSAGEM_DA_CRIACAO + "frase"), (True, None))
        self.sincronizar(colecao, False)
        self.assertEqual(self.escrita_da_nota(colecao), "")

    def test_no_russo_a_frase_vai_para_o_campo_do_tipo_do_russo(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.preparar(colecao)
        colecao.adicionar_nota("PerpetualMiner::Russo", "PerpetualMiner Russo", {"Frase": "Я не мальчик!", "Palavra": "мальчик"}, [], "g-ru")
        self.na_revisao(colecao, "g-ru", tipo_de_nota.MENSAGEM_DA_CRIACAO + "Он мальчик.")
        self.assertEqual(self.escrita_da_nota(colecao, "PerpetualMiner::Russo"), "Он мальчик.")
