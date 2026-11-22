"""O tipo de nota de um Envio: o da Conexão (um por idioma, criado se falta) ou o que a pessoa já tem (#165, `tipo_proprio.py`). O `Trabalho` (`envio.py`)
o confere uma vez no começo do Envio (`TipoDoEnvio.conferir`) e põe nele a nota de cada Cartão (`nota_no_tipo`)."""

from . import tipo_de_nota, tipo_proprio


class TipoDoEnvio:
    """`nome` é o tipo de nota, `serve` se ele tem os campos do Cartão; `campos` são os do tipo da Conexão como está na coleção (None no da pessoa)."""

    def __init__(self, pedido, nome, serve, campos=None):
        self.pedido, self.nome, self.serve, self.campos = pedido, nome, serve, campos

    @classmethod
    def conferir(cls, colecao, pedido, com_a_colecao):
        """O tipo do Envio, lido pela espera do Anki (`com_a_colecao(leitura)`). O da Conexão é criado se falta; o da pessoa só se confere (nunca é criado
        nem mudado): ele tem de existir e ter os campos do mapeamento, a Frase e a resposta em campos diferentes. Levanta `Apagado` se as Frases foram
        apagadas no meio."""
        proprio = pedido.get("tipoProprio")
        if proprio:
            nomes = com_a_colecao(lambda: colecao.tipo_de_nota(proprio["nome"]))
            return cls(pedido, proprio["nome"], nomes is not None and tipo_proprio.recusa(proprio, nomes) is None)
        tipo = tipo_de_nota.definicao(pedido["lang"], pedido.get("nivel"))
        nomes = com_a_colecao(lambda: tipo_de_nota.garantir(colecao, tipo))
        campos = set(nomes or ())
        return cls(pedido, tipo["nome"], nomes is not None and set(tipo["campos_do_cartao"]) - set(tipo["opcionais"]) <= campos, campos)

    def nota_no_tipo(self, frentes, nota):
        """`(o nome do tipo, frentes, nota)` do Cartão no tipo do Envio. No da pessoa, a Frase está onde o mapa a pôs e cada parte no campo dela. No tipo da
        Conexão que a pessoa já tinha antes de um campo opcional, o texto desse campo vai para o campo de reserva (depois do que ele já tem), em vez de o
        Envio falhar."""
        pedido = self.pedido
        proprio = pedido.get("tipoProprio")
        if not proprio:
            return self.nome, frentes, dict(nota, campos=self._campos_no_tipo_da_conexao(nota["campos"]))
        campos = tipo_proprio.campos_do_tipo_proprio(nota["campos"], pedido["lang"], pedido.get("nivel"), proprio["mapa"])
        return proprio["nome"], (proprio["mapa"]["frase"],), dict(nota, campos=campos)

    def _falta_no_tipo(self, campo):
        return self.campos is not None and campo not in self.campos

    def _campos_no_tipo_da_conexao(self, campos_da_nota):
        campos = dict(campos_da_nota)
        for campo, reserva in tipo_de_nota.definicao(self.pedido["lang"], self.pedido.get("nivel"))["opcionais"].items():
            if campo in campos and self._falta_no_tipo(campo):
                texto = campos.pop(campo)
                campos[reserva] = campos[reserva] + "<br>" + texto if campos.get(reserva) else texto
        return campos
