"""O adaptador da coleção em memória que os testes da Conexão usam no lugar do Anki, e o contrato que ele
tem em comum com o adaptador do Anki (`no_anki.py`): os dois passam pelos mesmos testes.

    python3.9 complemento/test_colecao_em_memoria.py

O que este arquivo tem de fora de `test_*` é só o adaptador; ele fica fora do `.ankiaddon` pelo nome.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos  # noqa: E402


class ColecaoEmMemoria:
    """A coleção de um perfil aberto, descrita como nos exemplos do contrato:

        { "baralhos": [ { "nome": "Inglês", "notas": [
            { "frente": "...", "verso": "...", "cartoes": [ { "tipo": 2, "intervalo": 30 } ] } ] } ] }

    Uma nota pode trazer `campos` ({ "Front": ..., "Back": ... }) no lugar de `frente` e `verso`.
    `ColecaoEmMemoria.fechada()` é o Anki na tela de perfis: só os perfis se leem.
    `"quebra": true` na descrição é uma coleção que levanta um erro inesperado ao ler (o `500` do contrato).
    """

    def __init__(self, descricao=None, perfis=("Usuário 1",), aberta=True):
        self._perfis = list(perfis)
        self._aberta = aberta
        self._quebra = bool((descricao or {}).get("quebra"))
        self._baralhos = {}
        proxima = 1700000000000
        for baralho in (descricao or {}).get("baralhos", []):
            cartoes = []
            for nota in baralho.get("notas", []):
                proxima += 1
                campos = list((nota.get("campos") or {"Frente": nota.get("frente", ""), "Verso": nota.get("verso", "")}).items())
                for cartao in nota.get("cartoes", [{"tipo": 0, "intervalo": 0}]):
                    cartoes.append({"nota": proxima, "campos": campos, "tipo": cartao["tipo"], "intervalo": cartao["intervalo"]})
            self._baralhos[baralho["nome"]] = cartoes

    @classmethod
    def fechada(cls, perfis=("Usuário 1",)):
        return cls(perfis=perfis, aberta=False)

    def _exigir_aberta(self):
        if self._quebra:
            raise RuntimeError("coleção ilegível")
        if not self._aberta:
            raise baralhos.ColecaoIndisponivel("collection_not_open")

    def perfis(self):
        return list(self._perfis)

    def nomes_dos_baralhos(self):
        self._exigir_aberta()
        return list(self._baralhos)

    def cartoes_do_baralho(self, nome):
        self._exigir_aberta()
        return [
            cartao
            for baralho, cartoes in self._baralhos.items()
            if baralho == nome or baralho.startswith(nome + "::")
            for cartao in cartoes
        ]


DESCRICAO = {
    "baralhos": [
        {"nome": "Default"},
        {"nome": "Inglês", "notas": [
            {"frente": "She <b>gave up</b> smoking", "verso": "<b>give up</b> /ɡɪv ʌp/", "cartoes": [{"tipo": 2, "intervalo": 40}]},
            {"frente": "I gave her the book", "verso": "give /ɡɪv/", "cartoes": [{"tipo": 0, "intervalo": 0}]},
        ]},
        {"nome": "Inglês::Séries", "notas": [
            {"frente": "They keep running", "verso": "run /rʌn/", "cartoes": [{"tipo": 1, "intervalo": 0}, {"tipo": 2, "intervalo": 5}]},
        ]},
        {"nome": "Vazio"},
    ]
}


class ContratoDoAdaptadorDaColecao:
    """O que qualquer adaptador de coleção tem de fazer; as subclasses dizem como montá-lo."""

    def adaptador(self, descricao, perfis=("Usuário 1",)):
        raise NotImplementedError

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        raise NotImplementedError

    def test_lista_todos_os_baralhos_com_dois_pontos_entre_os_niveis(self):
        self.assertEqual(
            sorted(self.adaptador(DESCRICAO).nomes_dos_baralhos()), ["Default", "Inglês", "Inglês::Séries", "Vazio"]
        )

    def test_os_cartoes_de_um_baralho_incluem_os_dos_subbaralhos(self):
        cartoes = self.adaptador(DESCRICAO).cartoes_do_baralho("Inglês")
        self.assertEqual(sorted((cartao["tipo"], cartao["intervalo"]) for cartao in cartoes), [(0, 0), (1, 0), (2, 5), (2, 40)])

    def test_cada_cartao_traz_os_campos_da_nota_na_ordem_e_o_id_da_nota(self):
        colecao = self.adaptador(DESCRICAO)
        cartoes = colecao.cartoes_do_baralho("Inglês::Séries")
        self.assertEqual([cartao["campos"] for cartao in cartoes], [[("Frente", "They keep running"), ("Verso", "run /rʌn/")]] * 2)
        self.assertEqual(len({cartao["nota"] for cartao in cartoes}), 1)

    def test_um_baralho_que_nao_existe_nao_tem_cartoes(self):
        self.assertEqual(self.adaptador(DESCRICAO).cartoes_do_baralho("Alemão"), [])

    def test_a_lista_de_perfis_le_se_mesmo_sem_colecao_aberta(self):
        self.assertEqual(self.adaptador_fechado(perfis=("Maria", "João")).perfis(), ["Maria", "João"])

    def test_sem_colecao_aberta_nem_os_baralhos_nem_os_cartoes_se_leem(self):
        fechada = self.adaptador_fechado()
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            fechada.nomes_dos_baralhos()
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            fechada.cartoes_do_baralho("Inglês")


class AdaptadorEmMemoria(ContratoDoAdaptadorDaColecao, unittest.TestCase):
    def adaptador(self, descricao, perfis=("Usuário 1",)):
        return ColecaoEmMemoria(descricao, perfis=perfis)

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        return ColecaoEmMemoria.fechada(perfis=perfis)


if __name__ == "__main__":
    unittest.main()
