"""The real Conexão (complemento.servidor.Conexao) outside Anki, on a free port, with the repo's fake OpenAI
and Firestore and an in-memory collection (Baralhos "Inglês" and "Русский", the note type "Básico" with "Frente" and "Verso"; the Envio adds its own note type per language),
with the Envio's worker thread on. Logs like the product (`registro.criar`): `<pasta>/logs/complemento.log`. Writes {"porta", "pasta"} to argv[2] when ready; runs until killed.
Usage: conexao-real.py <repo> <ready.json>"""
import json, sys, tempfile, time
repo, pronto = sys.argv[1], sys.argv[2]
sys.path.insert(0, repo)
from complemento import servidor, configuracao, pasta_de_dados, registro
from complemento.test_openai_de_mentira import OpenAIDeMentira, FirestoreDeMentira
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
pasta = tempfile.mkdtemp(prefix='conexao-real-')
dados = pasta_de_dados.preparar(pasta)          # without it the key folder is missing and every save is a 500
logger = registro.criar(dados.logs)             # the product's logger: <pasta>/logs/complemento.log, the file a "no key in the log" proof must read
with OpenAIDeMentira('aceita') as openai, FirestoreDeMentira() as firestore:   # the fakes answer only inside `with`
    c = servidor.Conexao(porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO,
                         perfil_aberto=lambda: 'Usuário 1', logger=logger,
                         dados=dados, openai_base=openai.base, firestore_base=firestore.base,
                         colecao=ColecaoEmMemoria({'baralhos': [{'nome': 'Inglês'}, {'nome': 'Русский'}]}))
    assert c.iniciar()
    with open(pronto, 'w') as f: json.dump({'porta': c.porta, 'pasta': dados.raiz}, f)
    while True: time.sleep(1)
