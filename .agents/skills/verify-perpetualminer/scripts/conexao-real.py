import json, os, sys, tempfile, time
repo, pronto = sys.argv[1], sys.argv[2]
sys.path.insert(0, repo)
from complemento import servidor, configuracao, pasta_de_dados, registro
from complemento.test_openai_de_mentira import OpenAIDeMentira, FirestoreDeMentira
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_pareamento_de_mentira import CLIENTE, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, semear
pasta = tempfile.mkdtemp(prefix='conexao-real-')
dados = pasta_de_dados.preparar(pasta)
logger = registro.criar(dados.logs)
semear(os.path.join(dados.raiz, 'pareamento.json'), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
with OpenAIDeMentira('aceita') as openai, FirestoreDeMentira() as firestore:
    c = servidor.Conexao(porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO,
                         perfil_aberto=lambda: 'Usuário 1', logger=logger,
                         dados=dados, openai_base=openai.base, firestore_base=firestore.base,
                         colecao=ColecaoEmMemoria({'baralhos': [{'nome': 'Inglês'}, {'nome': 'Русский'}]}))
    assert c.iniciar()
    with open(pronto, 'w') as f: json.dump({'porta': c.porta, 'pasta': dados.raiz}, f)
    while True: time.sleep(1)
