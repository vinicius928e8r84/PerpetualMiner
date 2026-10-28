"""A cópia das telas de dentro do Anki (#175), pelo ID do catálogo da Voz (`docs/design/voz/README.md`).

O complemento só tem a biblioteca padrão e não carrega o `lib/voz/catalogo.js` da extensão: estes são os textos dos IDs que ele usa, e
`test_janela.py` confere cada um com o retrato `docs/design/voz/catalogo-textos.json`. Texto novo de tela entra primeiro no catálogo.

Os modelos são os da extensão (`lib/voz/texto.js`): `{nome}` troca pelo valor (número em PT-BR, “1.284”) e `{n|singular|plural}` escolhe pelo valor.
"""

import re

TEXTOS = {
    "ANK-01.parado": "PerpetualMiner…",
    "ANK-01.enviando": "PerpetualMiner · {feitos} de {total}",
    "ANK-02.titulo": "PerpetualMiner",
    "ANK-02.conexao": "Conexão com o Anki",
    "ANK-02.ligada": "Ligada",
    "ANK-02.desligada": "Desligada. O motivo está no registro da pasta user_files (Ferramentas › Complementos › Ver arquivos).",
    "ANK-02.versao": "Versão",
    "ANK-02.perfil": "Perfil",
    "ANK-02.semPerfil": "Nenhum perfil aberto",
    "ANK-02.envio": "Envio",
    "ANK-02.semEnvio": "Nenhum Envio ainda",
    "ANK-02.progresso": "{feitos} de {total} {total|cartão|cartões}",
    "ANK-02.baralho": "Baralho {baralho}",
    "ANK-02.erro": "Último erro",
    "ANK-02.semErro": "Nenhum erro",
    "ANK-02.falhou": "{n} {n|cartão não entrou|cartões não entraram} no Baralho {baralho} · {codigo}",
    "ANK-02.fechar": "Fechar",
    "ANK-03.comecou": "Enviando {total} {total|cartão|cartões} ao Baralho {baralho}",
    "ANK-03.terminou": "{n} {n|cartão enviado|cartões enviados} ao Baralho {baralho}",
    "ANK-03.naoTerminou": "O Envio ao Baralho {baralho} não terminou",
    "ENV-07.naFila": "Na fila",
    "ENV-07.criandoCartoes": "Criando cartões",
    "ENV-07.preparandoImagens": "Preparando imagens",
    "ENV-07.gerandoAudio": "Gerando áudio",
    "ENV-07.escolhendoImagens": "Escolhendo imagens",
    "ENV-07.esperandoOAnki": "Esperando o Anki",
    "ENV-07.enviandoAoAnki": "Enviando ao Anki",
    "ENV-07.concluido": "Concluído",
    "ENV-07.concluidoEmParte": "Concluído em parte",
    "ENV-07.falhou": "Não concluído",
    "ENV-10.jaEstavam": "{n} já {n|estava|estavam} lá",
    "ENV-10.naoEntraram": "{n} não {n|entrou|entraram}",
}

_MODELO = re.compile(r"\{([^{}]+)\}")


def _preencher(modelo, valores, id_):
    def trocar(achado):
        nome, *formas = achado.group(1).split("|")
        valor = valores[nome]  # KeyError: falta o valor, como o erro da extensão
        if formas:
            if not isinstance(valor, int):
                raise TypeError("o valor %r do texto %s escolhe o plural, então precisa ser número" % (nome, id_))
            return formas[0] if abs(valor) == 1 else formas[1]
        return "{:,}".format(valor).replace(",", ".") if isinstance(valor, int) else str(valor)

    return _MODELO.sub(trocar, modelo)


def texto(id_, **valores):
    """O texto do catálogo com os valores no lugar: `texto("ANK-03.terminou", n=12, baralho="Inglês")`. ID fora do catálogo: KeyError."""
    return _preencher(TEXTOS[id_], valores, id_)
