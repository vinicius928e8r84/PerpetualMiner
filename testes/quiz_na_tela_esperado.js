'use strict';

module.exports = {
  perfil: {"cabecalho":["","",""],"tela":"b74849fed396fc9f"},
  primeira: {"cabecalho":["Pergunta 1 de 3","Sequência: 0","Pontos: 0"],"tela":"4fc2dd9d2749602b","botoes":[["Eu liguei pa","","",""],["Eu teria lig","","",""],["Eu vou ligar","","",""],["Eu não ligue","","",""],["Não sei","","",""]],"feedback":""},
  acertou: {"cabecalho":["Pergunta 1 de 3","Sequência: 1","Pontos: 101"],"tela":"e749f529d0725e02","botoes":[["Eu liguei pa","","desligado",""],["Eu teria lig","certa","desligado","true"],["Eu vou ligar","","desligado",""],["Eu não ligue","","desligado",""],["Não sei","","desligado",""]],"feedback":"Certo.","chamadas":[["saltar","quiz__sequencia"],["festa.acertou","Eu teria ligado mais cedo, mas meu celular descarregou.",1],["som.acerto",11],["saltar","quiz__placar"]],"atrasos":[1000]},
  escuta: {"cabecalho":["Pergunta 2 de 3","Sequência: 1","Pontos: 101"],"tela":"379b4db2bdf942ec","botoes":[["Ouvir de nov","","",""],["Você sabe a ","","",""],["Eu preciso c","","",""],["Você pode me","","",""],["A farmácia m","","",""],["Não sei","","",""]],"feedback":"","chamadas":[["Audio","data:audio/mpeg;base64,AAAA"],["play"]],"pedidos":[{"lang":"en","sotaque":"com","texto":"Could you tell me where the nearest pharmacy is?"}],"aviso":true},
  errou: {"cabecalho":["Pergunta 2 de 3","Sequência: 0","Pontos: 101"],"tela":"e95333e228a1461e","botoes":[["Ouvir de nov","","",""],["Você sabe a ","","desligado",""],["Eu preciso c","","desligado",""],["Você pode me","certa","desligado","true"],["A farmácia m","errada","desligado",""],["Não sei","","desligado",""]],"feedback":"Não foi essa. A certa está marcada.","chamadas":[["pause"]],"atrasos":[1000]},
  terceira: {"cabecalho":["Pergunta 3 de 3","Sequência: 0","Pontos: 101"],"tela":"ff6d5e688a153434","botoes":[["Ela consegui","","",""],["Ela não quis","","",""],["Ela perdeu o","","",""],["Ela não cons","","",""],["Não sei","","",""]],"feedback":""},
  nao_sei: {"cabecalho":["Pergunta 3 de 3","Sequência: 0","Pontos: 101"],"tela":"2fe51dec4d9a7605","botoes":[["Ela consegui","","desligado",""],["Ela não quis","","desligado",""],["Ela perdeu o","","desligado",""],["Ela não cons","certa","desligado","true"],["Não sei","","desligado",""]],"feedback":"A certa está marcada.","chamadas":[["som.naoSei"]]},
  resultado: {"cabecalho":["","","Pontos: 101"],"tela":"9ca7f7d138c8f46a","chamadas":[["ranking.montar","en","iniciante",1,3,1],["revelacao","iniciante"],["estilo.campo","en","iniciante"],["ranking.iniciar"]]},
  usou: {"usados":["iniciante"],"desligado":true},
  falhas_do_audio: {"sem conexão":{"aviso":"O áudio precisa da Conexão com o Anki ligada.","oculto":false,"esperado":"O áudio precisa da Conexão com o Anki ligada."},"Conexão antiga":{"aviso":"Atualize a Conexão com o Anki para ouvir as perguntas.","oculto":false,"esperado":"Atualize a Conexão com o Anki para ouvir as perguntas."},"outra falha":{"aviso":"Não deu para tocar o áudio. Tente de novo.","oculto":false,"esperado":"Não deu para tocar o áudio. Tente de novo."},"resposta sem áudio":{"aviso":"Não deu para tocar o áudio. Tente de novo.","oculto":false,"esperado":"Não deu para tocar o áudio. Tente de novo."}},
  recusa_de_tocar: {"aviso":"Não deu para tocar o áudio. Tente de novo.","oculto":false},
  ouvir_de_novo: {"chamadas":[["pause"],["Audio","data:audio/mpeg;base64,BBBB"],["play"]],"aviso":true,"pedidosNovos":0},
  sair: {"saidas":["en"],"chamadas":[["pause"]],"vivos":0},
  alfabeto: {"cabecalho":["","",""],"tela":"57545a213f16e231"},
  sem_alfabeto: {"cabecalho":["","",""],"tela":"0f7e1a0484cb36b3","chamadas":[["estilo.campo","ru","iniciante"]]},
  perfil_do_russo: {"cabecalho":["","",""],"tela":"ebd1c3bf1f5e420e"},
};
