"""A repetição de cada rota que muda o que a Conexão guarda, e a base velha (parte de `test_servidor.py`).

    python3.9 complemento/test_servidor_repeticao.py
"""

import contextlib
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import servidor
from test_harness import ORIGEM, RESPONDIDOS, conexao_do_exemplo, exemplos_do_contrato, sucesso
from complemento.test_comparar_com_o_contrato import igual_ao_do_contrato
from complemento.test_estado_guardado import estado_guardado
from complemento.test_matriz_de_rotas import MATRIZ
from complemento.test_pareamento_de_mentira import pedir_como_o_exemplo
from test_harness import tearDownModule


class RepeticaoDeCadaRotaQueMuda(unittest.TestCase):
    """Cada rota que muda o que a Conexão guarda é pedida de novo, e com a base velha, e o dono não se mexe à toa.

    `MATRIZ` diz quais rotas mudam (`muda`) e quais trazem a base (`versao`). O pedido é o de cada exemplo de sucesso (`200`)
    da rota no contrato, no contexto dele. Uma rota que muda o que fica guardado e não diz `muda: True` quebra.
    Os métodos `conferir_*` recebem as rotas, a matriz e os exemplos, para o teste da própria conferência usar uma rota inventada."""

    CHAVES_NOVAS = ("sk-proj-mudanca-nova-0001", "sk-proj-mudanca-nova-0002")

    def exemplos_de_sucesso(self, rota, exemplos):
        return [
            e for e in exemplos
            if (e["pedido"]["metodo"], e["pedido"]["caminho"]) == rota and sucesso(e["resposta"]["status"]) and e["contexto"].get("cofre") != "sem_escrita"
        ]

    def pedir_o_exemplo(self, conexao, exemplo, corpo=None):
        status, _, lido = pedir_como_o_exemplo(conexao, exemplo["pedido"], corpo)
        return status, json.loads(lido)

    def revisao(self, conexao):
        return conexao.conexao.cofre.documento("openai").get("versao", 0)

    def conferir_que_toda_rota_que_muda_diz(self, rotas, matriz, exemplos):
        for rota in sorted(rotas):
            if matriz[rota].get("muda"):
                self.assertTrue(self.exemplos_de_sucesso(rota, exemplos), "rota %s %s diz `muda: True` e não tem exemplo de sucesso no contrato" % rota)
                continue
            for exemplo in self.exemplos_de_sucesso(rota, exemplos):
                with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                    antes = estado_guardado(conexao)
                    self.pedir_o_exemplo(conexao, exemplo)
                    self.assertEqual(
                        antes, estado_guardado(conexao),
                        'a rota %s %s mudou o que a Conexão guarda no exemplo "%s" e MATRIZ (complemento/test_matriz_de_rotas.py) não diz `muda: True`: '
                        "diga também `versao: True` se o corpo traz a base." % (rota + (exemplo["nome"],)),
                    )

    def conferir_o_pedido_repetido(self, rotas, matriz, exemplos):
        """O `repetivel: false` do exemplo é a exceção já declarada, com o `porque`, e conferida por `confere_a_repeticao`.
        A resposta combinada vale salvo o que o contrato marca como variável (`<agora>`, `<url de autorização>`).
        O cliente que já leu a revisão nova a manda de volta ao reconfirmar: é a mesma chave, o mesmo arquivo."""
        for regra, exemplo in self.exemplos_repetiveis(rotas, matriz, exemplos):
            with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                primeiro = self.pedir_o_exemplo(conexao, exemplo)
                guardado = estado_guardado(conexao)
                self.conferir_o_mesmo_pedido_de_novo(conexao, exemplo, primeiro, guardado)
                if not regra.get("versao"):
                    continue
                if regra.get("muda_de_novo"):
                    self.conferir_que_reconfirmar_ainda_muda(conexao, exemplo, guardado)
                else:
                    self.conferir_que_reconfirmar_repete(conexao, exemplo, primeiro, guardado)

    def exemplos_repetiveis(self, rotas, matriz, exemplos):
        return [
            (matriz[rota], exemplo) for rota in sorted(rotas) if matriz[rota].get("muda")
            for exemplo in self.exemplos_de_sucesso(rota, exemplos) if exemplo.get("repetivel") is not False
        ]

    def corpo_na_base_atual(self, conexao, exemplo):
        return dict(exemplo["pedido"]["corpo"], versao=self.revisao(conexao))

    def conferir_o_mesmo_pedido_de_novo(self, conexao, exemplo, primeiro, guardado):
        nome = exemplo["nome"]
        status, segundo = self.pedir_o_exemplo(conexao, exemplo)
        combinada = exemplo["resposta"]["json"]
        mesma = segundo == primeiro[1] or (igual_ao_do_contrato(primeiro[1], combinada) and igual_ao_do_contrato(segundo, combinada))
        self.assertTrue(status == primeiro[0] and mesma, nome + ": o mesmo pedido de sucesso de novo respondeu outra coisa")
        self.assertEqual(guardado, estado_guardado(conexao), nome + ": o mesmo pedido de sucesso de novo mudou o que a Conexão guarda (o arquivo do dono)")

    def conferir_que_reconfirmar_ainda_muda(self, conexao, exemplo, guardado):
        self.pedir_o_exemplo(conexao, exemplo, self.corpo_na_base_atual(conexao, exemplo))
        self.assertNotEqual(guardado, estado_guardado(conexao), exemplo["nome"] + ": `muda_de_novo` está velho em MATRIZ: reconfirmar já não muda nada, tire a exceção")

    def conferir_que_reconfirmar_repete(self, conexao, exemplo, primeiro, guardado):
        de_novo = self.corpo_na_base_atual(conexao, exemplo)
        for _ in range(3):
            self.assertEqual(self.pedir_o_exemplo(conexao, exemplo, de_novo), primeiro, exemplo["nome"] + ": reconfirmar na base atual respondeu outra coisa")
            self.assertEqual(
                guardado, estado_guardado(conexao),
                exemplo["nome"] + ": reconfirmar na base atual mudou o que a Conexão guarda (a revisão avança a cada reconfirmação, v1→2→3→4)",
            )

    def conferir_a_base_velha(self, rotas, matriz, exemplos):
        """Duas mudanças mais novas (`CHAVES_NOVAS`): a base do exemplo deixa de ser nem a atual nem a anterior."""
        for rota in sorted(rotas):
            if not matriz[rota].get("versao"):
                continue
            for exemplo in self.exemplos_de_sucesso(rota, exemplos):
                with tempfile.TemporaryDirectory() as pasta, conexao_do_exemplo(pasta, exemplo) as conexao:
                    self.pedir_o_exemplo(conexao, exemplo)
                    cofre = conexao.conexao.cofre
                    for chave in self.CHAVES_NOVAS:
                        atual = cofre.documento("openai")
                        self.assertTrue(cofre.guardar("openai", chave, versao=atual.get("versao", 0), conta=atual.get("conta", "")))
                    guardado = estado_guardado(conexao)
                    status, corpo = self.pedir_o_exemplo(conexao, exemplo)
                    self.assertEqual(
                        (status, guardado), (409, estado_guardado(conexao)),
                        "%s: a base velha de %s %s tem que dar 409 sem mudar o que está guardado: respondeu %s %s" % ((exemplo["nome"],) + rota + (status, corpo)),
                    )

    def conferir_tudo(self, rotas, matriz, exemplos):
        self.conferir_que_toda_rota_que_muda_diz(rotas, matriz, exemplos)
        self.conferir_o_pedido_repetido(rotas, matriz, exemplos)
        self.conferir_a_base_velha(rotas, matriz, exemplos)

    def test_cada_rota_que_muda_repete_igual_e_recusa_a_base_velha(self):
        self.conferir_tudo(servidor.ROTAS, MATRIZ, exemplos_do_contrato())

    @contextlib.contextmanager
    def rota_inventada(self, tratador, **regra):
        """Uma rota que só existe aqui, com o exemplo de sucesso dela e a entrada em uma matriz; desfaz o que registrou."""
        rota = ("POST", "/rota/inventada")
        original, respondidos = dict(servidor.ROTAS), set(RESPONDIDOS)
        servidor.ROTAS[rota] = tratador
        exemplo = {
            "nome": "rota inventada", "contexto": {},
            "pedido": {"metodo": "POST", "caminho": rota[1], "origem": ORIGEM, "corpo": {"versao": 0}},
            "resposta": {"status": 200, "json": {"ok": True}},
        }
        matriz = {rota: dict({"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": []}, **regra)}
        try:
            yield {rota: tratador}, matriz, [exemplo]
        finally:
            servidor.ROTAS.clear()
            servidor.ROTAS.update(original)
            RESPONDIDOS.intersection_update(respondidos)

    @staticmethod
    def gravar_o_dono(conexao, chave, versao):
        """Escreve o arquivo do dono por conta própria, para a conferência não depender da `Cofre` que ela confere."""
        with open(os.path.join(conexao.cofre._pasta, "openai.json"), "w", encoding="utf-8") as arquivo:
            json.dump({"chave": chave, "conta": "", "versao": versao, "em": 1, "naoEnviada": True}, arquivo)

    @classmethod
    def grava_sempre(cls, conexao, corpo):
        """Muda o que fica guardado a cada pedido, sem olhar a base."""
        versao = conexao.cofre.documento("openai").get("versao", 0)
        cls.gravar_o_dono(conexao, "sk-proj-inventada-%d" % (versao + 1), versao + 1)
        return 200, {"ok": True}

    @classmethod
    def grava_uma_vez_e_cobra_a_base(cls, conexao, corpo):
        """Como a chave da IA: grava uma vez; o mesmo pedido de novo, ou a base atual, repete a resposta; a base velha dá 409."""
        atual = conexao.cofre.documento("openai")
        revisao = atual.get("versao", 0)
        if atual.get("chave") == "sk-proj-inventada-0001" and corpo["versao"] in (revisao - 1, revisao):
            return 200, {"ok": True}
        if corpo["versao"] != revisao:
            return 409, {"error": "stale_key_version"}
        cls.gravar_o_dono(conexao, "sk-proj-inventada-0001", revisao + 1)
        return 200, {"ok": True}

    def test_uma_rota_que_muda_sem_dizer_quebra_dizendo_o_que_declarar(self):
        with self.rota_inventada(self.grava_sempre) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, r"não diz `muda: True`"):
            self.conferir_que_toda_rota_que_muda_diz(rotas, matriz, exemplos)

    def test_uma_rota_que_diz_que_muda_e_repetida_muda_o_arquivo_quebra(self):
        with self.rota_inventada(self.grava_sempre, muda=True) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, "mudou o que a Conexão guarda"):
            self.conferir_o_pedido_repetido(rotas, matriz, exemplos)

    def test_uma_rota_que_aceita_a_base_velha_quebra(self):
        with self.rota_inventada(self.grava_sempre, muda=True, versao=True) as (rotas, matriz, exemplos), self.assertRaisesRegex(AssertionError, "409"):
            self.conferir_a_base_velha(rotas, matriz, exemplos)

    def test_uma_rota_que_grava_uma_vez_e_cobra_a_base_passa_em_tudo(self):
        with self.rota_inventada(self.grava_uma_vez_e_cobra_a_base, muda=True, versao=True) as (rotas, matriz, exemplos):
            self.conferir_tudo(rotas, matriz, exemplos)

    def test_a_excecao_muda_de_novo_que_ja_nao_muda_nada_acusa_que_esta_velha(self):
        with self.rota_inventada(self.grava_uma_vez_e_cobra_a_base, muda=True, versao=True, muda_de_novo="avança a revisão") as (rotas, matriz, exemplos):
            with self.assertRaisesRegex(AssertionError, "tire a exceção"):
                self.conferir_o_pedido_repetido(rotas, matriz, exemplos)

    def test_as_rotas_que_mudam_sao_as_que_guardam_algo_da_conexao(self):
        self.assertEqual(
            sorted(rota[1] for rota, regra in MATRIZ.items() if regra.get("muda")),
            ["/abrir-com-o-computador", "/anki/card-front", "/anki/card-preview", "/anki/note-types", "/anki/profile", "/anki/profiles", "/atualizacao/agora", "/custos/teto/definir", "/ia/chatgpt/entrar", "/ia/chatgpt/sair", "/ia/modelo/escolher", "/ia/openai/chave", "/ia/openai/chave/apagar", "/ia/openai/legado", "/ia/openai/sincronizar", "/jobs", "/jobs/apagar-frases", "/jobs/retry", "/jobs/usar-a-chave", "/pareamento/concluir"],
        )


if __name__ == "__main__":
    unittest.main()
