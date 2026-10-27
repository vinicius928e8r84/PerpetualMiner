"""O `mw` do Anki de mentira que os testes do adaptador (`no_anki.py`) usam: o que o complemento lê dele (`pm.name`, `pm.profiles`,
`col`), a thread principal (`taskman.run_on_main`), uma coleção sobre um sqlite de verdade e as funções de perfil que a Conexão
chama (`pm.load`, `onOpenProfile`, `unloadProfile`, `showProfileManager`; `passos` anota a ordem). Não é teste: fica fora do
`.ankiaddon` pelo nome.
"""

import queue
import sqlite3
import threading
import types

from complemento.test_colecao_em_memoria import guardar_na_midia


class AnkiDeMentira:
    """O que o complemento lê do `mw`: `pm.name` (o perfil que o gerente guarda) e `col` (a coleção aberta)."""

    def __init__(self):
        self.pm = types.SimpleNamespace(name=None)
        self.col = None

    def selecionar_na_janela_de_perfis(self, nome):
        self.pm.name, self.col = nome, None  # `pm.load(nome)` guarda o nome sem abrir a coleção

    def abrir(self, nome):
        self.pm.name, self.col = nome, object()

    def fechar_o_perfil(self):
        self.col = None  # volta à janela de perfis; o gerente ainda lembra o nome


class ThreadPrincipalDeMentira:
    """A thread principal do Anki: `run_on_main` roda a função nela, como o `taskman` do Anki."""

    def __init__(self):
        self._tarefas = queue.Queue()
        self.thread = threading.Thread(target=self._rodar, name="principal-do-anki", daemon=True)
        self.thread.start()
        self.parada = False
        self.livre = threading.Event()  # limpo: a thread principal está ocupada e as tarefas esperam a vez
        self.livre.set()

    def _rodar(self):
        while True:
            tarefa = self._tarefas.get()
            if tarefa is None:
                return
            self.livre.wait()
            if not self.parada:
                tarefa()

    def run_on_main(self, funcao):
        self._tarefas.put(funcao)

    def encerrar(self):
        self._tarefas.put(None)


class NotaDeMentira:
    """A nota nova de `col.new_note`: os campos por nome (um nome que o tipo não tem é `KeyError`, como no Anki)."""

    def __init__(self, modelo, nomes):
        self.modelo, self._valores = modelo, {nome: "" for nome in nomes}
        self.tags, self.guid = [], None

    def __setitem__(self, nome, valor):
        if nome not in self._valores:
            raise KeyError(nome)
        self._valores[nome] = valor

    def valores(self):
        return list(self._valores.values())


class ColecaoDoAnkiDeMentira:
    """O que o adaptador usa de `mw.col`, sobre um sqlite de verdade (as tabelas `cards` e `notes` do Anki, só com as
    colunas que o Anki tem e o complemento lê ou grava): `decks.all_names_and_ids` e `decks.id` (que cria o Baralho),
    `models.get` e `models.by_name`, `new_note`, `add_note` e `db.all`. Toda chamada fora da thread principal fica anotada."""

    def __init__(self, descricao, thread_principal):
        self._principal = thread_principal
        self.fora_da_principal = []
        self._sqlite = sqlite3.connect(":memory:", check_same_thread=False)
        self._sqlite.executescript(
            "create table notes (id integer primary key, mid integer, flds text, guid text, tags text);"
            "create table cards (id integer primary key, nid integer, did integer, odid integer, type integer, ivl integer);"
        )
        self._baralhos, self._modelos = [], {}
        proxima = 1700000000000
        for indice, baralho in enumerate(descricao["baralhos"], start=1):
            self._baralhos.append(types.SimpleNamespace(id=indice, name=baralho["nome"]))
            for nota in baralho.get("notas", []):
                proxima += 1
                campos = list((nota.get("campos") or {"Frente": nota["frente"], "Verso": nota["verso"]}).items())
                modelo = self._modelos.setdefault(tuple(nome for nome, _ in campos), len(self._modelos) + 1)
                self._sqlite.execute("insert into notes (id, mid, flds) values (?, ?, ?)", (proxima, modelo, "\x1f".join(valor for _, valor in campos)))
                for cartao in nota["cartoes"]:
                    self._sqlite.execute(
                        "insert into cards (nid, did, odid, type, ivl) values (?, ?, 0, ?, ?)", (proxima, indice, cartao["tipo"], cartao["intervalo"])
                    )
        self._modelos.setdefault(("Frente", "Verso"), len(self._modelos) + 1)
        self._nomes_dos_modelos = {"Básico": ("Frente", "Verso")}
        self.decks = types.SimpleNamespace(all_names_and_ids=self._conferido(lambda: list(self._baralhos)), id=self._conferido(self._id_do_baralho))
        self.models = types.SimpleNamespace(get=self._conferido(self._modelo), by_name=self._conferido(self._modelo_por_nome))
        self.db = types.SimpleNamespace(all=self._conferido(lambda sql, *args: [list(linha) for linha in self._sqlite.execute(sql, args)]))
        self.new_note = self._conferido(lambda modelo: NotaDeMentira(modelo["id"], modelo["nomes"]))
        self.add_note = self._conferido(self._adicionar)
        self.arquivos_de_midia = {}
        self.media = types.SimpleNamespace(write_data=self._conferido(lambda nome, dados: guardar_na_midia(self.arquivos_de_midia, nome, dados)))

    def _conferido(self, funcao):
        def chamada(*argumentos):
            if threading.current_thread() is not self._principal.thread:
                self.fora_da_principal.append(threading.current_thread().name)
            return funcao(*argumentos)

        return chamada

    def _id_do_baralho(self, nome):
        existente = next((baralho for baralho in self._baralhos if baralho.name == nome), None)
        if existente is None:
            existente = types.SimpleNamespace(id=len(self._baralhos) + 1, name=nome)
            self._baralhos.append(existente)
        return existente.id

    def _modelo_por_nome(self, nome):
        nomes = self._nomes_dos_modelos.get(nome)
        if nomes is None:
            return None
        return dict(self._modelo(self._modelos[nomes]), id=self._modelos[nomes], nomes=nomes)

    def _adicionar(self, nota, id_do_baralho):
        cursor = self._sqlite.execute(
            "insert into notes (mid, flds, guid, tags) values (?, ?, ?, ?)", (nota.modelo, "\x1f".join(nota.valores()), nota.guid, " ".join(nota.tags))
        )
        self._sqlite.execute("insert into cards (nid, did, odid, type, ivl) values (?, ?, 0, 0, 0)", (cursor.lastrowid, id_do_baralho))

    def notas_gravadas(self):
        return [list(linha) for linha in self._sqlite.execute("select flds, guid, tags from notes where guid is not null order by id")]

    def _modelo(self, id_do_modelo):
        nomes = next((nomes for nomes, id_ in self._modelos.items() if id_ == id_do_modelo), None)
        if nomes is None:
            return None
        return {"flds": [{"name": nome, "ord": posicao} for posicao, nome in enumerate(nomes)]}


class AnkiComColecaoDeMentira(AnkiDeMentira):
    """Um `mw` com perfis, a thread principal e, quando há descrição, a coleção do perfil aberto."""

    def __init__(self, descricao=None, perfis=("Usuário 1",), aberto=None):
        super().__init__()
        self.taskman = ThreadPrincipalDeMentira()
        self._perfis = list(perfis)
        self.pm.profiles = self._perfis_do_gerente
        self.pm.load = self._carregar_o_perfil
        self.descricao = descricao
        self.state = "profileManager"
        self.profileDiag = object()  # a janela de perfis
        self.janela_modal = None  # um diálogo modal aberto (o “Excluir” da janela de perfis, por exemplo)
        self.janela_ativa = self.profileDiag
        self.app = types.SimpleNamespace(activeModalWidget=lambda: self.janela_modal, activeWindow=lambda: self.janela_modal or self.janela_ativa)
        self.fechamentos_adiados = None  # com uma lista, o `unloadProfile` só guarda o que fazer depois (a sincronização ao fechar demora)
        self.passos = []  # o que a Conexão pediu ao Anki, na ordem: o teste confere o caminho que ela fez
        if descricao is not None:
            self.abrir(aberto or perfis[0])

    # As funções de perfil do Anki que a Conexão chama (aqt/main.py): só na thread principal.
    def _carregar_o_perfil(self, nome):
        self.passos.append(("pm.load", nome))
        if nome not in self._perfis:
            return False
        self.pm.name = nome
        return True

    def onOpenProfile(self, *, callback=None):
        self.passos.append(("onOpenProfile", self.pm.name))
        self.abrir(self.pm.name)
        self.state = "deckBrowser"

    def unloadProfile(self, depois):
        self.passos.append(("unloadProfile", self.pm.name))
        if self.fechamentos_adiados is not None:
            self.fechamentos_adiados.append(depois)
            return
        self.fechar_o_perfil()  # o Anki sincroniza ao fechar e só então chama `depois`
        depois()

    def terminar_o_fechamento(self):
        """A sincronização ao fechar terminou: o perfil fecha e o `depois` do `unloadProfile` roda, na thread principal."""
        depois, pronto = self.fechamentos_adiados.pop(), threading.Event()

        def terminar():
            self.fechar_o_perfil()
            depois()
            pronto.set()

        self.taskman.run_on_main(terminar)
        assert pronto.wait(5)

    def showProfileManager(self):
        self.passos.append(("showProfileManager", None))
        self.state = "profileManager"

    def encerrar(self):
        """Desliga a thread principal de mentira e fecha o sqlite da coleção."""
        self.taskman.encerrar()
        self._fechar_o_sqlite()

    def _perfis_do_gerente(self):
        """O gerente de perfis do Anki lê um sqlite criado na thread principal: de outra thread, ele recusa."""
        if threading.current_thread() is not self.taskman.thread:
            raise sqlite3.ProgrammingError("SQLite objects created in a thread can only be used in that same thread")
        return list(self._perfis)

    def fechar_o_perfil(self):
        self._fechar_o_sqlite()
        super().fechar_o_perfil()

    def _fechar_o_sqlite(self):
        if hasattr(self.col, "_sqlite"):
            self.col._sqlite.close()

    def abrir(self, nome):
        self._fechar_o_sqlite()
        super().abrir(nome)
        self.col = ColecaoDoAnkiDeMentira(self.descricao, self.taskman) if self.descricao is not None else object()
