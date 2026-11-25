'use strict';

const id = 'sem-codescene-no-repositorio';

const conserto = 'Tire a diretiva do CodeScene e a configuração dele do repositório: a nota do Code Health sobe refatorando de verdade, não calando o medidor '
  + 'nem trocando as regras dele. Um caso que o dono aprovou leva, na própria linha: `exceção sem-codescene-no-repositorio até AAAA-MM-DD, '
  + 'aprovada por <pessoa>: <motivo>`.';

const DIRETIVA = new RegExp(`${'@'}codescene`, 'i');
const ARQUIVO_DE_CODIGO = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|css|html|sh|ya?ml)$|^scripts\/ganchos\/[^./]+$/;
const CONFIGURACAO = /^(?:\.codescene\/|(?:.*\/)?code-health-rules\.json$)/;

const ehConfiguracao = arquivo => CONFIGURACAO.test(arquivo);

const seAplica = arquivo => ehConfiguracao(arquivo) || ARQUIVO_DE_CODIGO.test(arquivo);

function verificar(arquivo, fonte) {
  if (ehConfiguracao(arquivo)) return [{ linha: 1, detalhe: 'configuração do CodeScene no repositório (.codescene/ ou code-health-rules.json)' }];
  const achados = [];
  fonte.split('\n').forEach((texto, indice) => {
    if (DIRETIVA.test(texto)) achados.push({ linha: indice + 1, detalhe: 'diretiva do CodeScene no código' });
  });
  return achados;
}

module.exports = { id, conserto, seAplica, verificar };
