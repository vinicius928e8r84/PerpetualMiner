"""O que o contrato confere na repetição de um POST: o estado guardado e a resposta (apoio de `test_servidor.py`)."""

import json
import os

from complemento.test_comparar_com_o_contrato import igual_ao_do_contrato


def estado_guardado(conexao):
    """Tudo o que o teste enxerga de guardado: os arquivos da pasta da Conexão (menos o log) e os documentos da nuvem de mentira.

    A coleção (`ColecaoEmMemoria`) e as chamadas à OpenAI ficam de fora de propósito: as rotas do contrato que as tocam só as leem
    (ou só conferem a chave), e quem grava na coleção é o Envio (`gravar_cartao`, em `envio.py`), que os `test_envio*.py` cobrem.
    Quando uma rota do contrato passar a escrever no Anki, ou a gravar por chamada repetida à OpenAI ou ao Firestore, inclua aqui."""
    arquivos = {}
    for pasta, _, nomes in os.walk(conexao.pasta):
        for nome in nomes:
            caminho = os.path.join(pasta, nome)
            if os.path.relpath(caminho, conexao.pasta) != os.path.join("logs", "complemento.log"):
                with open(caminho, "rb") as arquivo:
                    arquivos[os.path.relpath(caminho, conexao.pasta)] = arquivo.read()
    return {"arquivos": arquivos, "nuvem": json.loads(json.dumps(conexao.firestore.documentos))}


def confere_a_repeticao(caso, exemplo, primeiro, guardado, segundo, guardado_depois):
    """O mesmo POST de novo: a mesma resposta (salvo o instante) e nada novo guardado, ou a exceção que o exemplo declara."""
    status, _, corpo = segundo
    igual = status == primeiro[0] and igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"])
    intacto = guardado == guardado_depois
    if exemplo.get("repetivel") is False:
        caso.assertTrue(exemplo.get("porque"), 'O exemplo "%s" diz "repetivel": false sem o `porque`.' % exemplo["nome"])
        caso.assertFalse(
            igual and intacto,
            'O exemplo "%s" diz "repetivel": false, mas pedido duas vezes dá a mesma resposta e o mesmo estado: tire a exceção.' % exemplo["nome"],
        )
        return
    caso.assertEqual(status, primeiro[0], 'O mesmo POST de novo mudou o status no exemplo "%s".' % exemplo["nome"])
    caso.assertTrue(
        igual_ao_do_contrato(json.loads(corpo), exemplo["resposta"]["json"]),
        'O mesmo POST de novo respondeu outra coisa no exemplo "%s": %s. Se repetir de propósito muda a resposta ou o estado, '
        'declare no exemplo `"repetivel": false, "porque": …` (complemento/contrato/LEIA-ME.md).' % (exemplo["nome"], corpo.decode("utf-8")),
    )
    caso.assertEqual(
        guardado, guardado_depois,
        'O mesmo POST de novo mudou o que a Conexão guardou no exemplo "%s". Se é de propósito, declare '
        '`"repetivel": false, "porque": …` no exemplo (complemento/contrato/LEIA-ME.md).' % exemplo["nome"],
    )
