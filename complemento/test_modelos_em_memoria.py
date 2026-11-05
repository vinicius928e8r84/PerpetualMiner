"""Os modelos de Cartão do adaptador da coleção em memória (#166, a troca da frente): o que `test_colecao_em_memoria.ColecaoEmMemoria` guarda em `_cartoes_dos_tipos`
(`{ nome, frente, verso, css }` dos tipos que a Conexão criou) lido e reescrito como `no_anki.ColecaoDoAnki` faz com o `models` do Anki. Não é teste: fica fora do
`.ankiaddon` pelo nome."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos  # noqa: E402


class ModelosEmMemoria:
    def modelos_do_tipo_de_nota(self, nome):
        self._exigir_gravavel()
        cartao = self._cartoes_dos_tipos.get(nome)
        return None if nome not in self._tipos else [{chave: cartao[chave] for chave in ("nome", "frente", "verso")}] if cartao else []

    def trocar_o_modelo(self, nome, modelo, css):
        self._exigir_gravavel()
        if nome not in self._tipos:
            raise baralhos.TipoDeNotaAusente(nome)
        if nome not in self._cartoes_dos_tipos:  # um tipo da pessoa, sem o modelo da Conexão
            raise baralhos.TipoDeNotaAlterado(nome)
        novo = dict(modelo, css=css)
        mudou = self._cartoes_dos_tipos[nome] != novo
        self._cartoes_dos_tipos[nome] = novo
        return mudou
