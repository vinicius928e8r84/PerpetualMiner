"""A correção da Criação (#169) como qualquer adaptador de coleção a cumpre: as notas com uma “Frase escrita” que a IA ainda não leu, e o lugar onde a
correção fica (“Escrito antes” e “Correção”). Uma parte de `test_contrato_da_criacao.ContratoDaCriacao` (de onde vêm `adaptador`, `preparar`, `sincronizar`,
`com_notas_gravadas` e `escrita_da_nota`): o adaptador em memória e o do Anki passam pelos mesmos testes."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, tipo_de_nota  # noqa: E402

MENSAGEM = tipo_de_nota.MENSAGEM_DA_CRIACAO
INGLES = "PerpetualMiner::Inglês"


class ContratoDaCorrecao:
    def campos_da_nota(self, colecao, baralho=INGLES, posicao=0):
        return dict(colecao.cartoes_do_baralho(baralho)[posicao]["campos"])

    def test_a_frase_escrita_que_a_ia_ainda_nao_leu_sai_em_texto_com_a_frase_e_a_palavra_do_cartao(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "I gave up <b>sugar</b> & more\nlast year")
        self.assertEqual(colecao.frases_a_corrigir("en", 10), [
            {"guid": "g1", "escrita": "I gave up <b>sugar</b> & more\nlast year", "frase": "She gave up smoking", "palavra": "gave up"}])

    def test_uma_nota_sem_frase_escrita_ou_de_outro_tipo_de_nota_nao_sai(self):
        colecao = self.com_notas_gravadas()
        colecao.adicionar_nota("Default", "Básico", {"Frente": "a", "Verso": "b"}, [], "g-basico")
        self.assertEqual(colecao.frases_a_corrigir("en", 10), [])

    def test_depois_de_gravar_a_correcao_a_nota_deixa_de_sair_e_os_campos_dizem_o_que_foi_lido_e_o_que_a_ia_devolveu(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "I gave up suggar")
        self.assertTrue(colecao.gravar_correcao("g1", "I gave up suggar", "I gave up sugar."))
        campos = self.campos_da_nota(colecao)
        self.assertEqual((campos["Escrito antes"], campos["Correção"], campos["Frase escrita"]), ("I gave up suggar", "I gave up sugar.", "I gave up suggar"))
        self.assertEqual(colecao.frases_a_corrigir("en", 10), [])

    def test_a_correcao_vai_como_texto_e_nao_como_html(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "a <b> & b")
        colecao.gravar_correcao("g1", "a <b> & b", "a <b> & b.\nc")
        campos = self.campos_da_nota(colecao)
        self.assertEqual((campos["Escrito antes"], campos["Correção"]), ("a &lt;b&gt; &amp; b", "a &lt;b&gt; &amp; b.<br>c"))
        self.assertEqual(colecao.frases_a_corrigir("en", 10), [])

    def test_uma_frase_nova_escrita_depois_da_correcao_volta_a_sair_e_a_correcao_anterior_fica_ate_a_proxima(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "primeira")
        colecao.gravar_correcao("g1", "primeira", "Primeira.")
        colecao.gravar_frase_escrita("g1", "segunda")
        self.assertEqual([nota["escrita"] for nota in colecao.frases_a_corrigir("en", 10)], ["segunda"])
        self.assertEqual(self.campos_da_nota(colecao)["Correção"], "Primeira.")

    def test_a_frase_que_a_pessoa_reescreveu_enquanto_a_ia_corrigia_continua_pendente(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "primeira")
        colecao.gravar_frase_escrita("g1", "segunda")
        colecao.gravar_correcao("g1", "primeira", "Primeira.")
        self.assertEqual([nota["escrita"] for nota in colecao.frases_a_corrigir("en", 10)], ["segunda"])

    def test_o_limite_corta_a_lista_na_ordem_em_que_as_notas_foram_gravadas(self):
        colecao = self.com_notas_gravadas()
        for numero in range(2, 5):
            colecao.adicionar_nota(INGLES, "PerpetualMiner Inglês", {"Frase": "Frase %d" % numero, "Palavra": "w%d" % numero}, [], "g%d" % numero)
        for guid in ("g1", "g2", "g3", "g4"):
            colecao.gravar_frase_escrita(guid, "escrita " + guid)
        self.assertEqual([nota["guid"] for nota in colecao.frases_a_corrigir("en", 2)], ["g1", "g2"])

    def test_no_russo_a_nota_sai_so_para_o_idioma_dela(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}]})
        self.preparar(colecao)
        colecao.adicionar_nota("PerpetualMiner::Russo", "PerpetualMiner Russo", {"Frase": "Я не мальчик!", "Palavra": "мальчик"}, [], "g-ru")
        colecao.gravar_frase_escrita("g-ru", "Он мальчик.")
        self.assertEqual([nota["escrita"] for nota in colecao.frases_a_corrigir("ru", 10)], ["Он мальчик."])
        self.assertEqual(colecao.frases_a_corrigir("en", 10), [])

    def test_gravar_a_correcao_de_uma_nota_de_outro_tipo_ou_que_nao_existe_nao_muda_nada(self):
        colecao = self.adaptador(self.DESCRICAO)
        self.preparar(colecao)
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "g-basico")
        antes = colecao.cartoes_do_baralho("Inglês")
        self.assertFalse(colecao.gravar_correcao("g-basico", "x", "y"))
        self.assertFalse(colecao.gravar_correcao("g-que-nao-existe", "x", "y"))
        self.assertEqual(colecao.cartoes_do_baralho("Inglês"), antes)

    def test_durante_a_sincronizacao_nada_se_le_nem_se_grava_da_correcao(self):
        colecao = self.com_notas_gravadas()
        colecao.gravar_frase_escrita("g1", "escrita")
        self.sincronizar(colecao, True)
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            colecao.frases_a_corrigir("en", 10)
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            colecao.gravar_correcao("g1", "escrita", "Escrita.")
        self.sincronizar(colecao, False)
        self.assertEqual(self.campos_da_nota(colecao)["Correção"], "")
