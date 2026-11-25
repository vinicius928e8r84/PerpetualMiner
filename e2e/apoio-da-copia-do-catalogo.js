'use strict';

const { expect } = require('@playwright/test');

function catalogoNaPagina() {
  const { CATALOGO_DA_VOZ, IDIOMAS } = PerpetualMiner;
  const juntar = entrada => (typeof entrada === 'string' ? [entrada] : Object.values(entrada).flatMap(juntar));
  return { textos: Object.values(CATALOGO_DA_VOZ).flatMap(juntar), idiomas: Object.values(IDIOMAS) };
}

function rotulosVisiveisNaPagina(seletor) {
  const rotulosDo = no => {
    const proprio = [...no.childNodes].filter(f => f.nodeType === Node.TEXT_NODE).map(f => f.textContent).join('').replace(/\s+/g, ' ').trim();
    return [proprio, no.getAttribute('aria-label') || '', no.getAttribute('title') || ''].filter(Boolean);
  };
  const visivel = no => !no.closest('details pre') && no.checkVisibility();
  const nosDe = raiz => [raiz, ...raiz.querySelectorAll('*')];
  return [...document.querySelectorAll(seletor)].flatMap(nosDe).filter(visivel).flatMap(rotulosDo);
}

const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ehMarcador = pedaco => /^\{.*\}$/.test(pedaco);

const NUMEROS_DA_VOZ = ['total', 'atual', 'inicio', 'fim', 'limite', 'pct', 'segundos'];

function nomesDeNumero(textos) {
  const doModelo = texto => [...texto.matchAll(/\{([^{}|]+)\|/g)].map(m => m[1]);
  return new Set([...NUMEROS_DA_VOZ, ...textos.flatMap(doModelo)]);
}

function parteDoModelo(pedaco, numeros) {
  if (!ehMarcador(pedaco)) return { fixo: pedaco, padrao: escapar(pedaco) };
  const [nome, ...formas] = pedaco.slice(1, -1).split('|');
  const fixo = formas.join('');
  if (formas.length) return { fixo, padrao: `(?:${formas.map(escapar).join('|')})` };
  return { fixo, padrao: numeros.has(nome) ? '\\d[\\d.,]*' : '.+?' };
}

function padraoDoModelo(modelo, numeros) {
  const partes = modelo.split(/(\{[^{}]*\})/).map(pedaco => parteDoModelo(pedaco, numeros));
  if (!/\p{L}/u.test(partes.map(p => p.fixo).join(''))) return null;
  return new RegExp(`^${partes.map(p => p.padrao).join('')}$`, 'u');
}

function juizDoCatalogo({ textos, idiomas }) {
  const numeros = nomesDeNumero(textos);
  const padroes = textos.map(modelo => padraoDoModelo(modelo, numeros)).filter(Boolean);
  const permitidos = new Set([...idiomas, 'Detalhes']);
  const doCatalogo = texto => padroes.some(p => p.test(texto));
  const valeInteiro = texto => permitidos.has(texto) || doCatalogo(texto);
  return texto => valeInteiro(texto) || texto.split(' · ').every(doCatalogo);
}

async function copiaForaDoCatalogo(page, seletor) {
  const vale = juizDoCatalogo(await page.evaluate(catalogoNaPagina));
  const rotulos = await page.evaluate(rotulosVisiveisNaPagina, seletor);
  return { fora: rotulos.filter(rotulo => !vale(rotulo)), complemento: rotulos.filter(rotulo => /complemento/i.test(rotulo)) };
}

async function copiaDoCatalogo(page, seletor) {
  await expect.poll(() => copiaForaDoCatalogo(page, seletor)).toEqual({ fora: [], complemento: [] });
}

module.exports = { copiaDoCatalogo };
