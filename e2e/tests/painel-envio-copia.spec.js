'use strict';

const { test, expect } = require('../fixtures');
const { AGORA, INGLESAS, RUSSA, SACK, ARM, abrirPainel, resumo, envio, marcarEEnviar, enviosCriados } = require('../apoio-do-envio');

test.beforeEach(({ fakes }) => {
  fakes.anki.usarRelogio(() => AGORA);
});

// ─── A cópia das telas do Envio com a Conexão dentro do Anki (#142) ──────────

/**
 * Os textos à vista em `seletor` que não saem do catálogo da Voz, e os que chamam a Conexão de “complemento”. Um texto
 * sai do catálogo quando casa com um modelo dele (um valor de contagem só casa com um número), ou cada parte dele separada
 * por “ · ” casa; os nomes de `IDIOMAS` e o “Detalhes” do componente base também valem. O que está dentro do Detalhes é
 * a causa técnica (V3), não cópia: fica de fora.
 */
const COPIA_FORA_DO_CATALOGO = seletor => {
  const { CATALOGO_DA_VOZ, IDIOMAS } = PerpetualMiner;
  const modelos = [];
  const juntar = entrada => (typeof entrada === 'string' ? [entrada] : Object.values(entrada).flatMap(juntar));
  const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textos = Object.values(CATALOGO_DA_VOZ).flatMap(juntar);
  // Os valores que são números: os que escolhem singular ou plural em algum modelo, e os de contagem e posição.
  const numeros = new Set(['total', 'atual', 'inicio', 'fim', 'limite', 'pct', 'segundos',
    ...textos.flatMap(t => [...t.matchAll(/\{([^{}|]+)\|/g)].map(m => m[1]))]);
  for (const modelo of textos) {
    // `{n|frase|frases}` é uma das duas palavras; `{n}`, um número; outro `{valor}`, qualquer coisa.
    let fixo = '';
    const padrao = modelo.split(/(\{[^{}]*\})/).map(pedaco => {
      if (!/^\{.*\}$/.test(pedaco)) {
        fixo += pedaco;
        return escapar(pedaco);
      }
      const [nome, ...formas] = pedaco.slice(1, -1).split('|');
      fixo += formas.join('');
      if (formas.length) return `(?:${formas.map(escapar).join('|')})`;
      return numeros.has(nome) ? '\\d[\\d.,]*' : '.+?';
    }).join('');
    // Um modelo só de valores (“{nome} · {estado}”) casaria com qualquer texto: não prova nada.
    if (/\p{L}/u.test(fixo)) modelos.push(new RegExp(`^${padrao}$`, 'u'));
  }
  const doCatalogo = texto => modelos.some(m => m.test(texto));
  const permitidos = new Set([...Object.values(IDIOMAS), 'Detalhes']);
  const vale = texto => permitidos.has(texto) || doCatalogo(texto) || texto.split(' · ').every(doCatalogo);

  const fora = [];
  const complemento = [];
  for (const raiz of document.querySelectorAll(seletor)) {
    for (const no of [raiz, ...raiz.querySelectorAll('*')]) {
      if (no.closest('details pre') || !no.checkVisibility()) continue;
      const texto = [...no.childNodes].filter(f => f.nodeType === Node.TEXT_NODE).map(f => f.textContent).join('').replace(/\s+/g, ' ').trim();
      for (const rotulo of [texto, no.getAttribute('aria-label') || '', no.getAttribute('title') || ''].filter(Boolean)) {
        if (/complemento/i.test(rotulo)) complemento.push(rotulo);
        if (!vale(rotulo)) fora.push(rotulo);
      }
    }
  }
  return { fora, complemento };
};

async function copiaDoCatalogo(page, seletor) {
  // Exceção de teste: catálogo (CLAUDE.md § Testing): os modelos de texto vêm do próprio catálogo da Voz.
  await expect.poll(() => page.evaluate(COPIA_FORA_DO_CATALOGO, seletor)).toEqual({ fora: [], complemento: [] });
}

test('as telas do Envio com a Conexão dentro do Anki só dizem o que o catálogo da Voz tem, e chamam-na de Conexão com o Anki', async ({ page, extensao, fakes }) => {
  await extensao.gravarStorage({ frases: [...INGLESAS, RUSSA] });
  // Uma Conexão de antes do Envio (≤ 0.2.0) não tem a rota: o russo não começa, com o 404 em Detalhes.
  fakes.anki.recusarEnvios('ru', { status: 404, erro: 'not_found' });
  await abrirPainel(page, extensao);
  await marcarEEnviar(page, [SACK.texto, ARM.texto, RUSSA.texto]);
  const [ingles] = await enviosCriados(fakes, 1);

  // A coleção fechada ou sincronizando: a Conexão espera o Anki.
  fakes.anki.moverEnvio(ingles.jobId, { stage: 'wait_anki' });
  await expect(envio(page, 'Envio em inglês · 2 frases')).toContainText('Esperando o Anki');
  await expect(envio(page, 'Envio em russo · 1 frase')).toContainText('A Conexão com o Anki respondeu com erro.');
  await copiaDoCatalogo(page, '#modal-envio');

  // Um Cartão que não entrou (o código novo vai ao Detalhes) e o Continuar envio.
  fakes.anki.concluirEnvio(ingles.jobId, { falhas: [ARM.id] });
  await expect(envio(page, 'Envio em inglês · 2 frases').getByRole('button', { name: 'Continuar envio' })).toBeVisible();
  await copiaDoCatalogo(page, '#modal-envio');

  // O russo vai depois de a Conexão ser atualizada, e o resumo abre com o que não entrou.
  fakes.anki.aceitarEnvios('ru');
  await envio(page, 'Envio em russo · 1 frase').getByRole('button', { name: 'Tentar de novo' }).click();
  await expect.poll(() => fakes.anki.enviosEm('ru').length).toBe(1);
  const [russo] = fakes.anki.enviosEm('ru');
  fakes.anki.concluirEnvio(russo.jobId);
  await expect(resumo(page)).toHaveAccessibleName('Envio concluído em parte');
  await copiaDoCatalogo(page, '#modal-resumo');

  // O que ficou guardado: os dois Envios, cada um com o seu id na Conexão.
  const { pm_envio: guardado } = await extensao.lerStorage('pm_envio');
  expect(guardado.envios.map(e => [e.lang, e.jobId])).toEqual([['en', ingles.jobId], ['ru', russo.jobId]]);
  expect(fakes.anki.enviosEm('ru')).toHaveLength(1);
});
