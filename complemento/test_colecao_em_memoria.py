"""O adaptador da coleção em memória que os testes da Conexão usam no lugar do Anki, e o contrato que ele
tem em comum com o adaptador do Anki (`no_anki.py`): os dois passam pelos mesmos testes.

    python3.9 complemento/test_colecao_em_memoria.py

O que este arquivo tem de fora de `test_*` é só o adaptador; ele fica fora do `.ankiaddon` pelo nome.
"""

import hashlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos  # noqa: E402
from complemento.test_contrato_da_criacao import ContratoDaCriacao  # noqa: E402
from complemento.test_modelos_em_memoria import ModelosEmMemoria  # noqa: E402
from complemento.test_contrato_da_previa import ContratoDaPrevia  # noqa: E402
from complemento.test_contrato_do_perfil_fixo import ContratoDoPerfilFixo  # noqa: E402
from complemento.test_renderizador_de_mentira import PreviaEmMemoria  # noqa: E402


def guardar_na_midia(arquivos, nome, dados):
    """`col.media.write_data` do Anki: guarda `dados` em `arquivos` com o nome pedido e devolve o nome que ficou. Um arquivo de
    mesmo nome e conteúdo diferente já na coleção faz o Anki trocar o nome (`<nome>-<sha1 do conteúdo>.<extensão>`)."""
    if arquivos.get(nome, dados) != dados:
        base, ponto, extensao = nome.rpartition(".")
        nome = "%s-%s%s%s" % (base or extensao, hashlib.sha1(dados).hexdigest(), ponto if base else "", extensao if base else "")
    arquivos[nome] = dados
    return nome


class ColecaoEmMemoria(PreviaEmMemoria, ModelosEmMemoria):
    """A coleção de um perfil aberto, descrita como nos exemplos do contrato:

        { "baralhos": [ { "nome": "Inglês", "notas": [
            { "frente": "...", "verso": "...", "cartoes": [ { "tipo": 2, "intervalo": 30 } ] } ] } ] }

    Uma nota pode trazer `campos` ({ "Front": ..., "Back": ... }) no lugar de `frente` e `verso`, e um `guid` (a prévia a acha por ele).
    `ColecaoEmMemoria.fechada()` é o Anki na tela de perfis: só os perfis se leem.
    `perfil_aberto` é o perfil que a coleção aberta é (o primeiro de `perfis` se não for dito). A Conexão entra no perfil fixo
    sozinha com o Anki na tela de perfis (`entradas`) e o troca a pedido (`trocas`), como `no_anki.ColecaoDoAnki`.
    `"quebra": true` na descrição é uma coleção que levanta um erro inesperado ao ler (o `500` do contrato).
    `"tiposDeNota"` diz os tipos de nota e os campos de cada um (sem ele, o “Básico” com “Frente” e “Verso”); `"baralhoPadrao"`, o nome do Baralho
    que todo Anki tem (“Default”; “Padrão” num Anki em português).

    O lado de gravação guarda cada nota nova em `gravadas` (`{ baralho, tipo, campos, etiquetas, guid }`), para o teste
    conferir; `fechar()`/`abrir()` e `sincronizando` fazem a gravação levantar `ColecaoIndisponivel`, como no Anki.
    """

    def __init__(self, descricao=None, perfis=("Usuário 1",), aberta=True, perfil_aberto=None):
        self._perfis = list(perfis)
        self._aberta = aberta
        self._perfil_aberto = perfil_aberto or self._perfis[0]
        self._anki_inteiro = False
        self._fixo = None
        self.entradas = []  # os perfis em que a Conexão entrou sozinha (o Anki na tela de perfis)
        self.trocas = []  # (o perfil que estava aberto, o perfil aberto no lugar): o clique em “Abrir <perfil>”
        self._quebra = bool((descricao or {}).get("quebra"))
        self._padrao = (descricao or {}).get("baralhoPadrao", "Default")  # o nome do Baralho padrão segue o idioma do Anki (“Padrão” em português)
        self._tipos = {nome: list(campos) for nome, campos in ((descricao or {}).get("tiposDeNota") or {"Básico": ["Frente", "Verso"]}).items()}
        self._guids = set()
        self._cartoes_dos_tipos = {}  # o modelo de Cartão (frente, verso, css) dos tipos que a Conexão criou; os outros têm o do Anki
        self._notas = {}  # guid → { baralho, tipo_de_nota, campos } das notas que a Conexão gravou
        self.gravadas = []
        self.midia = {}  # a mídia da coleção: nome do arquivo → bytes
        self.sincronizando = False
        self._baralhos = {}
        proxima = 1700000000000
        for baralho in (descricao or {}).get("baralhos", []):
            cartoes = []
            for nota in baralho.get("notas", []):
                proxima += 1
                campos = list((nota.get("campos") or {"Frente": nota.get("frente", ""), "Verso": nota.get("verso", "")}).items())
                for cartao in nota.get("cartoes", [{"tipo": 0, "intervalo": 0}]):
                    cartoes.append({"nota": proxima, "campos": campos, "tipo": cartao["tipo"], "intervalo": cartao["intervalo"]})
                if nota.get("guid"):  # uma nota que o Envio gravou: a prévia a acha pelo `guid`
                    self._notas[nota["guid"]] = {"baralho": baralho["nome"], "tipo_de_nota": nota.get("tipo", "Básico"), "campos": dict(campos)}
            self._baralhos[baralho["nome"]] = cartoes
        self._proxima = proxima

    @classmethod
    def fechada(cls, perfis=("Usuário 1",)):
        return cls(perfis=perfis, aberta=False)

    def fechar(self):
        """O perfil fechado com o Anki sem ninguém para abri-lo: a Conexão não entra em perfil nenhum (o abridor, que abre o Anki, é do
        #150). A tela de perfis, onde ela pode entrar no perfil fixo, é `fechada()` (ou `aberta=False`); só `abrir()` traz o perfil de volta."""
        self._aberta = False
        self._anki_inteiro = True

    def abrir(self, perfil=None):
        self._aberta = True
        self._anki_inteiro = False
        self._perfil_aberto = perfil or self._perfil_aberto

    def perfil_aberto(self):
        return self._perfil_aberto if self._aberta else None

    def fixar_o_perfil(self, fixo):
        self._fixo = fixo

    def entrar_no_perfil_fixo(self):
        marcado = self._fixo.marcado() if self._fixo else None
        if self._aberta or self._anki_inteiro or marcado not in self._perfis:
            return False
        self.entradas.append(marcado)
        self.abrir(marcado)
        return True

    def trocar_para_o_perfil_fixo(self):
        marcado = self._fixo.marcado() if self._fixo else None
        if marcado not in self._perfis:
            return False
        if not self._aberta:
            return self.entrar_no_perfil_fixo()
        if self._perfil_aberto == marcado:
            return False
        self.trocas.append((self._perfil_aberto, marcado))
        self.abrir(marcado)
        return True

    def _exigir_aberta(self):
        if self._quebra:
            raise RuntimeError("coleção ilegível")
        if not self._aberta:
            raise baralhos.ColecaoIndisponivel("collection_not_open")

    def _exigir_gravavel(self):
        self._exigir_aberta()
        if self._fixo is not None:
            self._fixo.conferir(self._perfil_aberto, self._perfis)
        if self.sincronizando:
            raise baralhos.ColecaoIndisponivel("anki_syncing")

    def tipo_de_nota(self, nome):
        self._exigir_gravavel()
        campos = self._tipos.get(nome)
        return list(campos) if campos is not None else None

    def guids_existentes(self, guids):
        self._exigir_gravavel()
        return set(guids) & self._guids

    def adicionar_nota(self, baralho, tipo_de_nota, campos, etiquetas, guid, midia=None):
        self._exigir_gravavel()
        if guid in self._guids:
            return
        nomes = self._tipos.get(tipo_de_nota)
        if nomes is None or not set(campos) <= set(nomes):
            raise baralhos.TipoDeNotaAusente(tipo_de_nota)
        guardada = {}
        for nome, dados in (midia or {}).items():
            guardado = guardar_na_midia(self.midia, nome, dados)
            guardada[guardado] = dados
            campos = {campo: valor.replace("[sound:%s]" % nome, "[sound:%s]" % guardado) for campo, valor in campos.items()}
        self._proxima += 1
        valores = [(nome, campos.get(nome, "")) for nome in nomes]
        self._baralhos.setdefault(baralho, []).append({"nota": self._proxima, "campos": valores, "tipo": 0, "intervalo": 0})
        self._guids.add(guid)
        self._notas[guid] = {"baralho": baralho, "tipo_de_nota": tipo_de_nota, "campos": dict(valores), "id": self._proxima}
        self.gravadas.append({"baralho": baralho, "tipo": tipo_de_nota, "campos": dict(campos), "etiquetas": list(etiquetas), "guid": guid, "midia": guardada})

    def criar_tipo_de_nota(self, definicao):
        self._exigir_gravavel()
        if definicao["nome"] in self._tipos:
            return False
        self._tipos[definicao["nome"]] = list(definicao["campos"])
        self._cartoes_dos_tipos[definicao["nome"]] = dict(definicao["modelos"][0], css=definicao["css"])
        return True

    def criar_baralhos_da_instalacao_nova(self, nomes):
        self._exigir_gravavel()
        if any(nome != self._padrao for nome in self._baralhos):
            return []
        for nome in nomes:
            self._baralhos.setdefault(nome, [])
        return list(nomes)

    def gravar_cartao(self, baralho, tipo_de_nota, campos, etiquetas, guid, campos_da_frente, frente_normalizada, normalizar, midia=None):
        """O passo inteiro de gravar um Cartão (ver `no_anki.ColecaoDoAnki.gravar_cartao`): `"added"` ou `"duplicate"`."""
        self._exigir_gravavel()
        if guid in self._guids:
            return "added"
        frentes = (campos_da_frente,) if isinstance(campos_da_frente, str) else tuple(campos_da_frente)
        for cartao in self.cartoes_do_baralho(baralho):
            if any(nome in frentes and valor and normalizar(valor) == frente_normalizada for nome, valor in cartao["campos"]):
                return "duplicate"
        self.adicionar_nota(baralho, tipo_de_nota, campos, etiquetas, guid, midia)
        return "added"

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

    DESCRICAO = DESCRICAO

    def adaptador(self, descricao, perfis=("Usuário 1",), aberto=None):
        """O adaptador com a coleção do perfil `aberto` (o primeiro de `perfis` se não for dito)."""
        raise NotImplementedError

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        raise NotImplementedError

    def sincronizar(self, colecao, sincronizando):
        """O Anki começa (True) ou termina (False) uma sincronização."""
        raise NotImplementedError

    def midia_guardada(self, colecao):
        """A mídia que a coleção guarda: `{ nome do arquivo: bytes }`."""
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

    # O lado de gravação: o Envio grava cada Cartão por ele.

    def test_a_nota_gravada_fica_no_baralho_com_os_campos_do_tipo_de_nota(self):
        colecao = self.adaptador(DESCRICAO)
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "She <b>gave up</b>", "Verso": "give up"}, ["perpetual_miner"], "guid-1")
        frentes = [dict(cartao["campos"]).get("Frente") for cartao in colecao.cartoes_do_baralho("Inglês")]
        self.assertIn("She <b>gave up</b>", frentes)
        self.assertEqual(colecao.guids_existentes(["guid-1", "guid-2"]), {"guid-1"})

    def test_um_baralho_que_nao_existe_e_criado_pela_primeira_nota(self):
        colecao = self.adaptador(DESCRICAO)
        colecao.adicionar_nota("PerpetualMiner::Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        self.assertIn("PerpetualMiner::Inglês", colecao.nomes_dos_baralhos())
        self.assertEqual(len(colecao.cartoes_do_baralho("PerpetualMiner")), 1)

    def gravar_o_cartao(self, colecao, guid="guid-1", frente="a"):
        return colecao.gravar_cartao(
            "Inglês", "Básico", {"Frente": frente, "Verso": "b"}, [], guid, "Frente", frente.strip().lower(), lambda valor: valor.strip().lower())

    def test_gravar_o_cartao_de_novo_pelo_mesmo_guid_diz_added_sem_dobrar_nem_virar_duplicata(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        self.assertEqual((self.gravar_o_cartao(colecao), self.gravar_o_cartao(colecao)), ("added", "added"))
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 1)

    def test_a_frente_que_ja_esta_no_baralho_de_outra_nota_diz_duplicate_e_nada_e_gravado(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        self.gravar_o_cartao(colecao, "guid-1", "a")
        self.assertEqual(self.gravar_o_cartao(colecao, "guid-2", "A "), "duplicate")
        self.assertEqual(len(colecao.cartoes_do_baralho("Inglês")), 1)

    def test_o_tipo_de_nota_diz_os_campos_e_um_tipo_que_nao_existe_nao_grava(self):
        colecao = self.adaptador(DESCRICAO)
        self.assertEqual(colecao.tipo_de_nota("Básico"), ["Frente", "Verso"])
        self.assertIsNone(colecao.tipo_de_nota("Basic"))
        with self.assertRaises(baralhos.TipoDeNotaAusente):
            colecao.adicionar_nota("Inglês", "Basic", {"Front": "a", "Back": "b"}, [], "guid-1")
        self.assertEqual(colecao.guids_existentes(["guid-1"]), set())

    def gravar_com_midia(self, colecao, guid, frente, midia, tipo_de_nota="Básico"):
        return colecao.gravar_cartao(
            "Inglês", tipo_de_nota, {"Frente": frente, "Verso": "b"}, [], guid, "Frente", frente.strip().lower(), lambda valor: valor.strip().lower(), midia)

    def frentes(self, colecao):
        return [dict(cartao["campos"])["Frente"] for cartao in colecao.cartoes_do_baralho("Inglês")]

    def test_a_midia_gravada_com_a_nota_fica_na_colecao_com_o_nome_que_a_nota_cita(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        self.gravar_com_midia(colecao, "guid-1", "a [sound:pm1_phrase.mp3]", {"pm1_phrase.mp3": b"um"})
        self.assertEqual(self.midia_guardada(colecao), {"pm1_phrase.mp3": b"um"})
        self.assertEqual(self.frentes(colecao), ["a [sound:pm1_phrase.mp3]"])

    def test_o_nome_que_a_colecao_trocou_por_ter_outro_arquivo_com_ele_e_o_que_a_nota_cita(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        self.gravar_com_midia(colecao, "guid-1", "primeira [sound:x.mp3]", {"x.mp3": b"um"})
        self.gravar_com_midia(colecao, "guid-2", "segunda [sound:x.mp3]", {"x.mp3": b"dois"})
        guardada = self.midia_guardada(colecao)
        novo = next(nome for nome in guardada if nome != "x.mp3")
        self.assertEqual((guardada["x.mp3"], guardada[novo]), (b"um", b"dois"))
        self.assertEqual(self.frentes(colecao), ["primeira [sound:x.mp3]", "segunda [sound:%s]" % novo])

    def test_a_nota_que_ja_esta_na_colecao_ou_que_e_duplicata_nao_grava_midia(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        self.gravar_com_midia(colecao, "guid-1", "a", {})
        self.gravar_com_midia(colecao, "guid-1", "a", {"x.mp3": b"um"})
        self.gravar_com_midia(colecao, "guid-2", "A ", {"y.mp3": b"dois"})
        self.assertEqual(self.midia_guardada(colecao), {})

    def test_sem_o_tipo_de_nota_nenhuma_midia_fica_na_colecao(self):
        colecao = self.adaptador({"baralhos": [{"nome": "Inglês"}]})
        with self.assertRaises(baralhos.TipoDeNotaAusente):
            self.gravar_com_midia(colecao, "guid-1", "a", {"x.mp3": b"um"}, tipo_de_nota="Basic")
        self.assertEqual(self.midia_guardada(colecao), {})

    def test_gravar_de_novo_o_mesmo_guid_nao_dobra_a_nota(self):
        colecao = self.adaptador(DESCRICAO)
        for _ in range(2):
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1")
        frentes = [dict(cartao["campos"]).get("Frente") for cartao in colecao.cartoes_do_baralho("Inglês")]
        self.assertEqual(frentes.count("a"), 1)

    def test_sem_colecao_aberta_nada_se_grava(self):
        fechada = self.adaptador_fechado()
        for gravar in (lambda: fechada.tipo_de_nota("Básico"), lambda: fechada.guids_existentes(["g"]),
                       lambda: fechada.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "g")):
            with self.assertRaises(baralhos.ColecaoIndisponivel):
                gravar()

    def test_durante_a_sincronizacao_nada_se_grava(self):
        colecao = self.adaptador(DESCRICAO)
        self.sincronizar(colecao, True)
        with self.assertRaises(baralhos.ColecaoIndisponivel) as erro:
            colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "g")
        self.assertEqual(str(erro.exception), "anki_syncing")
        self.sincronizar(colecao, False)
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "g")
        self.assertEqual(colecao.guids_existentes(["g"]), {"g"})


class AdaptadorEmMemoria(ContratoDoAdaptadorDaColecao, ContratoDoPerfilFixo, ContratoDaCriacao, ContratoDaPrevia, unittest.TestCase):
    def adaptador(self, descricao, perfis=("Usuário 1",), aberto=None):
        return ColecaoEmMemoria(descricao, perfis=perfis, perfil_aberto=aberto)

    def sincronizar(self, colecao, sincronizando):
        colecao.sincronizando = sincronizando

    def midia_guardada(self, colecao):
        return dict(colecao.midia)

    def adaptador_fechado(self, perfis=("Usuário 1",)):
        return ColecaoEmMemoria.fechada(perfis=perfis)


if __name__ == "__main__":
    unittest.main()
