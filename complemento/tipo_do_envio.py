"""O tipo de nota de um Envio: o da Conexão (um por idioma, criado se falta) ou o que a pessoa já tem (#165, `tipo_proprio.py`). Parte do `Trabalho`
(`envio.py`): usa `colecao`, `logger`, `_com_a_colecao` e `_terminar` dele."""

from . import tipo_de_nota, tipo_proprio


class TipoDoEnvio:
    def _o_tipo_do_envio(self, job_id, pedido):
        """`(nome do tipo de nota, se ele serve ao Cartão)`. O da Conexão é criado se falta; o da pessoa só se confere (nunca é criado nem mudado): ele tem de existir
        e ter os campos do mapeamento, a Frase e a resposta em campos diferentes. Levanta `Apagado` se as Frases foram apagadas no meio."""
        proprio = pedido.get("tipoProprio")
        if proprio:
            nomes = self._com_a_colecao(job_id, lambda: self.colecao.tipo_de_nota(proprio["nome"]))
            return proprio["nome"], nomes is not None and tipo_proprio.recusa(proprio, nomes) is None
        tipo = tipo_de_nota.definicao(pedido["lang"], pedido.get("nivel"))
        nomes = self._com_a_colecao(job_id, lambda: tipo_de_nota.garantir(self.colecao, tipo))
        return tipo["nome"], nomes is not None and set(tipo["campos_do_cartao"]) <= set(nomes)

    @staticmethod
    def _a_nota_no_tipo(pedido, tipo, frentes, nota):
        """`(tipo, frentes, nota)` do Cartão no tipo da pessoa, se o pedido tem um: a Frase está onde o mapa a pôs e cada parte no campo dela."""
        proprio = pedido.get("tipoProprio")
        if not proprio:
            return tipo, frentes, nota
        campos = tipo_proprio.campos_do_tipo_proprio(nota["campos"], pedido["lang"], pedido.get("nivel"), proprio["mapa"])
        return proprio["nome"], (proprio["mapa"]["frase"],), dict(nota, campos=campos)
