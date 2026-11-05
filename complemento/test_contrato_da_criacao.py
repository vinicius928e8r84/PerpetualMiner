"""A criação dos tipos de nota e dos Baralhos (#161) como qualquer adaptador de coleção a cumpre: o tipo de nota próprio de cada idioma,
com todos os campos desde o nascimento, os Baralhos só de quem não tem nenhum, e nunca um repetido nem um Cartão antigo mexido.
Uma parte do contrato do adaptador (`test_colecao_em_memoria.ContratoDoAdaptadorDaColecao`, de onde vêm `adaptador` e `sincronizar`):
o adaptador em memória e o do Anki herdam esta parte e passam pelos mesmos testes.
"""

import os
import re
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, criacao_na_revisao, tipo_de_nota  # noqa: E402

# O que os níveis, a morfologia do russo, as frentes e a Criação vão usar (#138, “o nome exato dos campos é da construção”):
# mudar os campos depois força uma sincronização completa no Anki, então todos nascem juntos.
CAMPOS_DOS_DOIS = [
    "Frase", "Áudio da frase", "Palavra", "Áudio da palavra", "Pronúncia", "Tradução literal", "Tradução natural", "Contexto da cena",
    "Fonte", "Imagem",
    "Definição", "Outro exemplo",  # o Intermediário e o Avançado
    "Dica", "Frase com lacuna",  # a frente Lacuna
    "Frase escrita", "Escrito antes", "Correção",  # a frente Criação e a correção do próximo Envio
]
CAMPOS_SO_DO_INGLES = ["Significado simples", "Gatilho"]  # o Cartão de inglês de hoje, que o Avançado continua
CAMPOS_SO_DO_RUSSO = ["Sílaba forte", "Morfologia", "Explicação das cores", "Mesma raiz", "Raiz"]  # a morfologia do russo
ANKI_EM_INGLES = {"baralhos": [{"nome": "Default"}], "tiposDeNota": {"Basic": ["Front", "Back"]}}
SO_O_DEFAULT = {"baralhos": [{"nome": "Default"}]}


class ContratoDaCriacao:
    def preparar(self, colecao):
        return tipo_de_nota.preparar(colecao)

    def test_cada_idioma_ganha_o_tipo_de_nota_proprio_com_todos_os_campos_desde_o_nascimento(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.preparar(colecao)
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Inglês"), CAMPOS_DOS_DOIS + CAMPOS_SO_DO_INGLES)
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Russo"), CAMPOS_DOS_DOIS + CAMPOS_SO_DO_RUSSO)

    def test_repetir_nao_cria_tipo_de_nota_nem_baralho_repetido(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        primeira = self.preparar(colecao)
        baralhos_antes, tipos_antes = sorted(colecao.nomes_dos_baralhos()), self.todos_os_tipos(colecao)
        repetida = self.preparar(colecao)
        self.assertEqual((sorted(colecao.nomes_dos_baralhos()), self.todos_os_tipos(colecao)), (baralhos_antes, tipos_antes))
        self.assertEqual(primeira, {"tipos": {"en": True, "ru": True}, "baralhos": ["PerpetualMiner::Inglês", "PerpetualMiner::Russo"]})
        self.assertEqual(repetida, {"tipos": {"en": False, "ru": False}, "baralhos": []})

    def test_numa_instalacao_nova_os_dois_baralhos_nascem_dentro_do_baralho_perpetualminer(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.preparar(colecao)
        nomes = colecao.nomes_dos_baralhos()
        self.assertIn("PerpetualMiner::Inglês", nomes)
        self.assertIn("PerpetualMiner::Russo", nomes)

    def test_num_anki_em_portugues_o_baralho_padrao_se_chama_padrao_e_ainda_assim_e_uma_instalacao_nova(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Padrão"}], "baralhoPadrao": "Padrão", "tiposDeNota": {"Básico": ["Frente", "Verso"]}})
        resultado = self.preparar(colecao)
        self.assertEqual(resultado["baralhos"], ["PerpetualMiner::Inglês", "PerpetualMiner::Russo"])
        self.assertEqual(self.preparar(colecao)["baralhos"], [])

    def test_quem_ja_tem_baralho_fica_com_o_seu_e_nenhum_baralho_nosso_e_criado(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}, {"nome": "CIMV"}, {"nome": "RUSSIAN"}]})
        resultado = self.preparar(colecao)
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), ["CIMV", "Default", "RUSSIAN"])
        self.assertEqual(resultado["baralhos"], [])
        self.assertEqual(resultado["tipos"], {"en": True, "ru": True})  # o tipo de nota nasce para quem já tem baralho também

    def test_um_baralho_de_outro_nome_que_a_pessoa_ja_tem_basta_para_nao_criar_os_nossos(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}, {"nome": "Meu inglês"}]})
        self.assertEqual(self.preparar(colecao)["baralhos"], [])

    def test_os_cartoes_antigos_nao_sao_renomeados_convertidos_nem_apagados(self):
        colecao = self.adaptador(self.DESCRICAO)
        antes = {baralho: colecao.cartoes_do_baralho(baralho) for baralho in ("Inglês", "Inglês::Séries")}
        tipo_antes = colecao.tipo_de_nota("Básico")
        self.preparar(colecao)
        self.assertEqual({baralho: colecao.cartoes_do_baralho(baralho) for baralho in antes}, antes)
        self.assertEqual(colecao.tipo_de_nota("Básico"), tipo_antes)
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), ["Default", "Inglês", "Inglês::Séries", "Vazio"])

    def test_um_tipo_de_nota_que_ja_tem_o_nosso_nome_fica_como_a_pessoa_o_deixou(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}], "tiposDeNota": {"PerpetualMiner Inglês": ["Frase", "Meu campo"]}})
        resultado = self.preparar(colecao)
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Inglês"), ["Frase", "Meu campo"])
        self.assertEqual(resultado["tipos"], {"en": False, "ru": True})

    def test_um_anki_em_ingles_ganha_os_nossos_tipos_e_o_basic_dele_nao_e_tocado(self):
        colecao = self.adaptador(ANKI_EM_INGLES)
        self.preparar(colecao)
        self.assertEqual(colecao.tipo_de_nota("Basic"), ["Front", "Back"])
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Inglês")[0], "Frase")

    def test_sem_colecao_aberta_ou_sincronizando_nada_e_criado(self):
        fechada = self.adaptador_fechado()
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            self.preparar(fechada)
        colecao = self.adaptador(SO_O_DEFAULT)
        self.sincronizar(colecao, True)
        with self.assertRaises(baralhos.ColecaoIndisponivel) as erro:
            self.preparar(colecao)
        self.assertEqual(str(erro.exception), "anki_syncing")
        self.assertEqual(colecao.nomes_dos_baralhos(), ["Default"])
        self.sincronizar(colecao, False)
        self.assertEqual(self.preparar(colecao)["tipos"], {"en": True, "ru": True})

    def test_a_busca_de_duplicatas_reconhece_o_cartao_antigo_do_basico_e_o_novo_do_tipo_proprio(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}, {"nome": "Inglês", "notas": [{"frente": "She <b>gave up</b> smoking", "verso": "x"}]}]})
        self.preparar(colecao)
        frentes = ("Frase", "Frente", "Front")
        gravar = lambda guid, frase: colecao.gravar_cartao(  # noqa: E731
            "Inglês", "PerpetualMiner Inglês", {"Frase": frase}, [], guid, frentes, frase.casefold().replace("<b>", "").replace("</b>", ""),
            lambda valor: valor.casefold().replace("<b>", "").replace("</b>", ""))
        self.assertEqual(gravar("g1", "She <b>gave up</b> smoking"), "duplicate")  # o do dono, no Básico
        self.assertEqual(gravar("g2", "They keep running"), "added")
        self.assertEqual(gravar("g3", "They keep <b>running</b>"), "duplicate")  # o novo, no tipo próprio
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 2)

    def test_o_cartao_novo_do_tipo_proprio_chega_a_leitura_do_vocabulario_como_frente_e_palavra(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}]})
        self.preparar(colecao)
        colecao.adicionar_nota(
            "PerpetualMiner::Inglês", "PerpetualMiner Inglês", {"Frase": "She <b>gave up</b> smoking", "Palavra": "gave up – /ɡeɪv ʌp/"}, [], "g1")
        resposta = baralhos.vocabulario(colecao, "PerpetualMiner::Inglês", "en")
        self.assertEqual([palavra["word"] for palavra in resposta["words"] if palavra["type"] == "term"], ["gave up"])

    # -- a troca da frente (#166): só o modelo de Cartão do tipo de nota --

    def com_notas_gravadas(self):
        """Uma coleção preparada, com um Cartão do inglês já gravado (o que a troca de frente não pode tocar)."""
        colecao = self.adaptador(SO_O_DEFAULT)
        self.preparar(colecao)
        colecao.adicionar_nota(
            "PerpetualMiner::Inglês", "PerpetualMiner Inglês",
            {"Frase": "She <b>gave up</b> smoking", "Áudio da frase": "[sound:a.mp3]", "Palavra": "gave up"}, [], "g1")
        return colecao

    def a_colecao_toda(self, colecao):
        return (colecao.nomes_dos_baralhos(), {baralho: colecao.cartoes_do_baralho(baralho) for baralho in colecao.nomes_dos_baralhos()},
                {nome: colecao.tipo_de_nota(nome) for nome in ("PerpetualMiner Inglês", "PerpetualMiner Russo")})

    def test_trocar_para_a_lacuna_reescreve_so_o_modelo_sem_nota_nova_nem_campo_novo_nem_cartao_novo(self):
        colecao = self.com_notas_gravadas()
        antes = self.a_colecao_toda(colecao)
        self.assertTrue(tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna"))
        self.assertEqual(self.a_colecao_toda(colecao), antes)
        [modelo] = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.assertEqual(modelo, tipo_de_nota.definicao("en", frente="lacuna")["modelos"][0])
        self.assertEqual(modelo["nome"], "Lacuna")

    def test_a_frente_lacuna_tem_a_frase_com_lacuna_e_a_dica_e_nenhum_audio_e_o_verso_traz_a_frase_com_o_audio(self):
        colecao = self.com_notas_gravadas()
        tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna")
        [modelo] = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.assertIn("{{Frase com lacuna}}", modelo["frente"])
        self.assertIn("{{Dica}}", modelo["frente"])
        self.assertNotIn("Áudio da frase", modelo["frente"])
        self.assertIn("{{Áudio da frase}}", modelo["verso"])
        self.assertIn("{{Frase}}", modelo["verso"])
        self.assertNotIn("{{FrontSide}}", modelo["verso"])

    def test_a_frente_ouvir_primeiro_e_so_o_audio_da_frase_e_o_verso_mostra_a_frase(self):
        colecao = self.com_notas_gravadas()
        tipo_de_nota.trocar_a_frente(colecao, "en", "ouvir_primeiro")
        [modelo] = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.assertEqual(re.sub(r"<[^>]+>", "", modelo["frente"]).strip(), "{{Áudio da frase}}")
        self.assertIn("{{Frase}}", modelo["verso"])
        self.assertEqual(modelo["nome"], "Ouvir primeiro")

    def test_o_verso_de_todos_os_niveis_continua_em_qualquer_frente(self):
        colecao = self.com_notas_gravadas()
        padrao = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")[0]["verso"]
        for frente in tipo_de_nota.FRENTES:
            tipo_de_nota.trocar_a_frente(colecao, "en", frente)
            verso = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")[0]["verso"]
            with self.subTest(frente=frente):
                self.assertTrue(verso.endswith(padrao.split("<hr id=answer>")[1]))

    def test_voltar_para_a_frase_com_audio_devolve_o_modelo_que_a_conexao_cria(self):
        colecao = self.com_notas_gravadas()
        criado = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        tipo_de_nota.trocar_a_frente(colecao, "en", "ouvir_primeiro")
        self.assertTrue(tipo_de_nota.trocar_a_frente(colecao, "en", tipo_de_nota.FRENTE_PADRAO))
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"), criado)

    def test_repetir_a_troca_nao_muda_nada_e_diz_que_nao_mudou(self):
        colecao = self.com_notas_gravadas()
        self.assertTrue(tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna"))
        modelos = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.assertFalse(tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna"))
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"), modelos)

    def test_no_russo_o_verso_sem_a_frase_so_vale_na_frente_frase_com_audio_porque_nas_outras_a_frase_ainda_nao_foi_vista(self):
        colecao = self.com_notas_gravadas()
        verso = lambda: colecao.modelos_do_tipo_de_nota("PerpetualMiner Russo")[0]["verso"]  # noqa: E731
        self.assertIn("{{^Sílaba forte}}{{FrontSide}}", verso())
        for frente in ("ouvir_primeiro", "lacuna"):
            tipo_de_nota.trocar_a_frente(colecao, "ru", frente)
            with self.subTest(frente=frente):
                self.assertNotIn("{{^Sílaba forte}}", verso())
                self.assertIn("{{Frase}}", verso())
        tipo_de_nota.trocar_a_frente(colecao, "ru", tipo_de_nota.FRENTE_PADRAO)
        self.assertIn("{{^Sílaba forte}}{{FrontSide}}", verso())

    def test_cada_idioma_tem_a_sua_frente(self):
        colecao = self.com_notas_gravadas()
        tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna")
        tipo_de_nota.trocar_a_frente(colecao, "ru", "ouvir_primeiro")
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")[0]["nome"], "Lacuna")
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Russo")[0]["nome"], "Ouvir primeiro")

    def test_sem_o_tipo_de_nota_ele_nasce_ja_com_a_frente_escolhida(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.assertTrue(tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna"))
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")[0]["nome"], "Lacuna")
        self.assertIsNone(colecao.tipo_de_nota("PerpetualMiner Russo"))

    def test_um_tipo_de_nota_que_a_pessoa_mexeu_nao_e_regravado(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Default"}], "tiposDeNota": {"PerpetualMiner Inglês": ["Frase", "Meu campo"]}})
        antes = (colecao.tipo_de_nota("PerpetualMiner Inglês"), colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"))
        with self.assertRaises(baralhos.TipoDeNotaAlterado):
            tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna")
        self.assertEqual((colecao.tipo_de_nota("PerpetualMiner Inglês"), colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")), antes)

    def test_uma_frente_que_nao_existe_nao_muda_nada(self):
        colecao = self.com_notas_gravadas()
        antes = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        with self.assertRaises(KeyError):
            tipo_de_nota.trocar_a_frente(colecao, "en", "imagem_primeiro")
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"), antes)

    def test_sem_colecao_aberta_ou_sincronizando_a_frente_nao_troca(self):
        colecao = self.com_notas_gravadas()
        antes = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.sincronizar(colecao, True)
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna")
        self.sincronizar(colecao, False)
        self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"), antes)
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            tipo_de_nota.trocar_a_frente(self.adaptador_fechado(), "en", "lacuna")

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

    def todos_os_tipos(self, colecao):
        return sorted(nome for nome in ("Básico", "Basic", "PerpetualMiner Inglês", "PerpetualMiner Russo") if colecao.tipo_de_nota(nome) is not None)
