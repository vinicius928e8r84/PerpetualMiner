"""The real Conexão (complemento.servidor.Conexao) outside Anki, on a free port, with the repo's fake OpenAI
and Firestore. Writes {"porta", "pasta"} to argv[2] when ready; runs until killed. Usage: conexao-real.py <repo> <ready.json>"""
import json, logging, os, sys, tempfile, time
repo, pronto = sys.argv[1], sys.argv[2]
sys.path.insert(0, repo)
from complemento import servidor, configuracao, pasta_de_dados
from complemento.test_openai_de_mentira import OpenAIDeMentira, FirestoreDeMentira
pasta = tempfile.mkdtemp(prefix='conexao-real-')
dados = pasta_de_dados.preparar(pasta)          # without it the key folder is missing and every save is a 500
logging.basicConfig(filename=os.path.join(dados.logs, 'conexao.log'), level=logging.INFO)
with OpenAIDeMentira('aceita') as openai, FirestoreDeMentira() as firestore:   # the fakes answer only inside `with`
    c = servidor.Conexao(porta=0, origens_aceitas=configuracao.ORIGENS_ACEITAS, versao=configuracao.VERSAO,
                         perfil_aberto=lambda: 'Usuário 1', logger=logging.getLogger('conexao'),
                         pasta_das_chaves=dados.chaves, openai_base=openai.base, firestore_base=firestore.base)
    assert c.iniciar()
    with open(pronto, 'w') as f: json.dump({'porta': c.porta, 'pasta': dados.raiz}, f)
    while True: time.sleep(1)
