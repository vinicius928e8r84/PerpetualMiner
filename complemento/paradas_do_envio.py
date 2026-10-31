"""Os dois jeitos de o trabalho de um Envio parar no meio, sem falhar nenhum Cartão (levantados pela thread de trabalho)."""


class Interrompido(Exception):
    """A Conexão está parando (o Anki fecha): o Envio fica `running` e volta à fila quando ela subir de novo."""


class Apagado(Exception):
    """O Apagar tudo veio com o Envio andando: ele para onde está (o estado já diz `failed` com `wiped`)."""
