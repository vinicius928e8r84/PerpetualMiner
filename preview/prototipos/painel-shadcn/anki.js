'use strict';

// Conexão com o Anki, a base: o que a tela guarda e as contas de Custos, que saem dos Envios de dados.js somados
// aqui, como o painel soma os da Conexão. As abas estão em anki-custos.js, anki-baralhos.js e anki-ajustes.js, os
// passos de ligar em anki-primeira.js e a tela em anki-tela.js.

(function (PS) {
  const { plural, dinheiro } = PS;
  const AGORA = new Date('2026-09-18T12:00:00');
  const dia = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  const PERIODOS = { hoje: [dia(AGORA), dia(AGORA)], mes: ['2026-09-01', dia(AGORA)], tudo: ['', ''] };

  const visao = {
    periodo: 'mes', de: PERIODOS.mes[0], ate: PERIODOS.mes[1], idiomaDosCustos: 'todos', envio: null, quatroCasas: false, ids: false, detalhes: false,
    idiomaDosBaralhos: 'en', idiomaDoVocabulario: 'en', tipo: '', status: '', busca: '', item: null,
    ajusteAberto: 'en', previa: 'verso', passo: 1, temAnki: null, abridor: 'parado', atualizando: false, conectando: false,
  };

  const situacao = () => PS.estado.estado;
  const ligada = () => !['desligada', 'primeira'].includes(situacao()) && !visao.conectando;

  // ---------- Contas de Custos ----------
  const custoDe = envio => Object.values(envio.custos).reduce((soma, valor) => soma + valor, 0);
  const dataDe = envio => new Date(AGORA.getTime() - envio.horas * 3600e3);
  function quandoFoi(envio) {   // ENV-08
    if (envio.horas < 1) return 'agora';
    if (envio.horas < 12) return `há ${envio.horas} h`;
    if (envio.horas < 36) return 'ontem';
    return `há ${Math.round(envio.horas / 24)} dias`;
  }
  const valor = (numero, { minimo = true } = {}) => {
    const casas = visao.quatroCasas ? 4 : 2;
    if (minimo && !visao.quatroCasas && numero > 0 && numero < 0.005) return `&lt; ${dinheiro(0.01)}`;   // BRG-26
    return dinheiro(numero, casas);
  };

  function enviosDoPeriodo(idioma = visao.idiomaDosCustos) {
    if (situacao() === 'vazio') return [];
    return PS.dados.envios.filter(envio => {
      const quando = dia(dataDe(envio));
      return (!visao.de || quando >= visao.de) && (!visao.ate || quando <= visao.ate) && (idioma === 'todos' || envio.idioma === idioma);
    });
  }
  const somar = (lista, campo) => lista.reduce((soma, item) => soma + campo(item), 0);

  const ESTADOS_DO_ENVIO = {
    concluido: { rotulo: 'Concluído', selo: 'sucesso', ponto: 'sucesso' },
    'em-parte': { rotulo: 'Concluído em parte', selo: 'aviso', ponto: 'aviso' },
    falhou: { rotulo: 'Não concluído', selo: 'perigo', ponto: 'perigo' },
  };
  const tituloDoEnvio = envio => `Envio em ${PS.idiomaEm(envio.idioma)} · ${envio.pedidas} ${plural(envio.pedidas, 'frase', 'frases')}`;

  PS.partesDoAnki = { AGORA, dia, PERIODOS, visao, situacao, ligada, custoDe, dataDe, quandoFoi, valor, enviosDoPeriodo, somar, ESTADOS_DO_ENVIO, tituloDoEnvio, corpos: {} };
})(window.PS);
