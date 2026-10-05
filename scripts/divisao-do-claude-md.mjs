// A divisão do CLAUDE.md em skills, como função pura: o texto do CLAUDE.md inteiro entra,
// o CLAUDE.md enxuto e o texto de cada SKILL.md saem. Quem lê e escreve arquivos é
// `scripts/dividir-claude-md.mjs`; quem confere que nada se perdeu é
// `scripts/verificar-divisao-do-claude-md.mjs`, que usa `normalizar` daqui para saber
// quais mudanças de texto são ponteiros corrigidos e quais não são.

export const MARCA_DO_CORPO = 'Notes moved unchanged from';
export const TITULO_DOS_ATALHOS = '### Surfaces: one skill each';
export const PREFIXO_DOS_LINKS = '../../../'; // de .agents/skills/<nome>/ até a raiz do repositório

// Cada skill: as seções (### …) do CLAUDE.md que ela recebe, na ordem em que ficam.
export const SKILLS = [
  {
    nome: 'boas-vindas',
    titulo: 'Boas-vindas and Configuração pela metade',
    superficie: 'the Boas-vindas (`painel-boas-vindas.js`) or the “Configuração pela metade” reminder (`lib/configuracao.js`, `painel-lembrete.js`)',
    secoes: ['### Boas-vindas', '### Configuração pela metade'],
  },
  {
    nome: 'configuracoes',
    titulo: 'Configurações',
    superficie: 'the Configurações area of the panel: Chave do Gemini, Zona de perigo, Atalhos and Conta & sync (`painel-chave.js`, `painel-perigo.js`, `painel-atalhos.js`, `lib/atalhos.js`, `painel-conta.js`)',
    secoes: ['### Chave do Gemini', '### Shortcuts', '### Account'],
  },
  {
    nome: 'popup',
    titulo: 'Popup (Cockpit)',
    superficie: 'the toolbar popup (`popup.html/js/css`)',
    secoes: ['### Popup (Cockpit)'],
  },
  {
    nome: 'painel-frases',
    titulo: 'Frases list and Minerar frases',
    superficie: 'the Frases list of the panel or the Minerar frases menu (`painel.js`, `painel.css`)',
    secoes: ['### Frases list', '### Minerar frases'],
  },
  {
    nome: 'painel-anki',
    titulo: 'Conexão com o Anki area',
    superficie: 'the Conexão com o Anki area of the panel: Custos, first connection, Baralhos e termos, Vocabulário, Reparar Anki, Ajustes de envio and the Envio ao Anki (`painel-anki*.js`, `painel-ajustes.js`, `painel-envio.js`, `lib/ajustes-de-envio.js`)',
    secoes: ['### Conexão com o Anki', '### Baralhos e termos', '### Ajustes de envio', '### Envio ao Anki'],
  },
  {
    nome: 'minerar-foto',
    titulo: 'Minerar de uma foto',
    superficie: 'Minerar de uma foto (`bookreader.html/js/css`)',
    secoes: ['### Minerar de uma foto'],
  },
  {
    nome: 'veio-componentes',
    titulo: 'Veio base components',
    superficie: 'the Veio base components (`veio/componentes.css`, `veio/componentes.js`) or any surface that uses them',
    secoes: ['### Base components'],
  },
  {
    nome: 'overlay',
    titulo: 'Overlay',
    superficie: 'the in-page overlay and what drives it from the page: `overlay.js`, `overlay.css` (the floating button and the feedback pill) and `content.js` (reading the caption and the selection, and the answer on screen)',
    secoes: ['### Overlay'],
  },
];
// Os marcadores com fixtures, fakes, páginas e referências visuais, tirados de ## Testing.
export const E2E = {
  nome: 'e2e-suite',
  origem: 'Testing',
  titulo: 'e2e suite: fixtures, fakes, test pages and visual references',
  superficie: 'the e2e suite (`e2e/fixtures.js`, `e2e/fakes/`, `e2e/pages/`, `e2e/vitrine/`) or any `e2e/tests/*-visual.spec.js` reference',
  inicio: '- `e2e/fixtures.js`',
  fim: '- `HEADED=1 npm test`',
};

// Para onde cada seção citada em um “See “X”” foi.
const SECAO_PARA_SKILL = {
  'Overlay': 'overlay', 'Popup (Cockpit)': 'popup', 'Account (Conta & sync)': 'configuracoes',
  'Shortcuts (Atalhos)': 'configuracoes', 'Boas-vindas': 'boas-vindas',
  'Chave do Gemini and Zona de perigo': 'configuracoes', 'Conexão com o Anki': 'painel-anki',
  'Baralhos e termos, Vocabulário and Reparar Anki': 'painel-anki', 'Ajustes de envio': 'painel-anki',
  'Envio ao Anki': 'painel-anki', 'Minerar de uma foto': 'minerar-foto', 'Configuração pela metade': 'boas-vindas',
  'Minerar frases': 'painel-frases', 'Base components': 'veio-componentes',
};

// Referências a outra seção que não seguem o padrão “See “X” below”: cada uma ganha um destino
// explícito. Cada `antes` tem de aparecer no texto que se divide (se alguém o reescrever, a divisão
// falha e esta lista é atualizada, em vez de deixar um ponteiro sem destino).
export const REESCRITAS_FIXAS = [
  { antes: 'the one exception to the danger rule below,', depois: 'the one exception to the danger rule in the `veio-componentes` skill,' },
  { antes: '(see “Firebase / Firestore Sync”)', depois: '(see “Firebase / Firestore Sync” in `CLAUDE.md`)' },
  { antes: 'see Cross-Frame Communication)', depois: 'see Cross-Frame Communication in `CLAUDE.md`)' },
];

// O mesmo, para as linhas que ficam no CLAUDE.md: o arquivo que dirige uma superfície aponta para a skill.
export const REESCRITAS_NO_CLAUDE = [
  { antes: 'mines subtitles and selections, and drives the overlay |', depois: 'mines subtitles and selections, and drives the overlay. See “Overlay” in the `overlay` skill |' },
];

const EM_SKILL = / in the `[a-z0-9-]+` skill/g;
const LINK_RELATIVO = /\]\((?!https?:|mailto:|#|\.\.\/|\/)([^)\s]+)\)/g;

/** Uma linha de uma skill (ou do CLAUDE.md que ficou) com os ponteiros que mudaram de lugar corrigidos. */
export function corrigirLinha(linha, nomeDaSkill) {
  let nova = linha.replace(/([Ss]ee )“([^”]+)”( below)?/g, (m, ver, nome) => {
    const alvo = SECAO_PARA_SKILL[nome];
    return !alvo || alvo === nomeDaSkill ? m : `${ver}“${nome}” in the \`${alvo}\` skill`;
  });
  for (const { antes, depois } of nomeDaSkill ? REESCRITAS_FIXAS : REESCRITAS_NO_CLAUDE) nova = nova.replaceAll(antes, depois);
  if (nomeDaSkill) nova = nova.replace(LINK_RELATIVO, (m, alvo) => `](${PREFIXO_DOS_LINKS}${alvo})`);
  return nova;
}

/** A linha sem as correções de ponteiro: o que a verificação compara. */
export function normalizar(linha) {
  let l = linha.trim().replace(/\s+/g, ' ');
  for (const { antes, depois } of [...REESCRITAS_FIXAS, ...REESCRITAS_NO_CLAUDE]) l = l.replaceAll(depois, antes);
  return l
    .replace(EM_SKILL, '')
    .replace(/([Ss]ee “[^”]+”) below/g, '$1')
    .replaceAll(`](${PREFIXO_DOS_LINKS}`, '](');
}

const linhaDeTitulo = (linha, dentroDeCodigo) => !dentroDeCodigo && /^#{2,3} /.test(linha);

/** A descrição que o Claude Code mostra: uma frase, sem depender de como o YAML trata `: `. */
export function descricaoDaSkill(s) {
  return `Use when changing or reviewing ${s.superficie}. Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests).`;
}

/** O cabeçalho YAML: a descrição entre aspas duplas (JSON é YAML válido), então `: ` dentro dela não quebra. */
export function cabecalhoYaml(s) {
  return ['---', `name: ${s.nome}`, `description: ${JSON.stringify(descricaoDaSkill(s))}`, '---'];
}

/**
 * @param {string} original o CLAUDE.md inteiro
 * @returns {{ claude: string, skills: Record<string, string> }}
 */
export function dividir(original) {
  const linhas = original.split('\n');
  if (linhas.includes(TITULO_DOS_ATALHOS)) throw new Error('this CLAUDE.md is already split (it has the “Surfaces” list); pass the whole one');

  let cerca = false;
  const inicios = [];
  linhas.forEach((l, i) => {
    if (/^```/.test(l)) cerca = !cerca;
    if (linhaDeTitulo(l, cerca)) inicios.push(i);
  });
  const secoes = inicios.map((ini, k) => ({ ini, fim: k + 1 < inicios.length ? inicios[k + 1] : linhas.length, titulo: linhas[ini] }));

  const blocos = new Map(SKILLS.map(s => [s.nome, []]));
  const removidas = new Set();
  for (const s of SKILLS) {
    for (const prefixo of s.secoes) {
      const achadas = secoes.filter(x => x.titulo.startsWith(prefixo));
      if (achadas.length !== 1) throw new Error(`“${prefixo}”: expected one section, found ${achadas.length}`);
      const [x] = achadas;
      let fim = x.fim;
      while (fim > x.ini && linhas[fim - 1].trim() === '') fim--; // as linhas em branco do fim ficam
      blocos.get(s.nome).push(linhas.slice(x.ini, fim));
      for (let i = x.ini; i < x.fim; i++) removidas.add(i);
    }
  }

  const iFixtures = linhas.findIndex(l => l.startsWith(E2E.inicio));
  const iHeaded = linhas.findIndex(l => l.startsWith(E2E.fim));
  if (iFixtures < 0 || iHeaded < iFixtures) throw new Error(`the e2e bullets (“${E2E.inicio}” … “${E2E.fim}”) were not found`);
  const blocoE2e = linhas.slice(iFixtures, iHeaded);
  for (let i = iFixtures; i < iHeaded; i++) removidas.add(i);

  // cada reescrita fixa tem de acertar em algum lugar do texto que vai para as skills
  const textoDasSkills = [...blocos.values()].flat(2).concat(blocoE2e).join('\n');
  for (const { antes } of REESCRITAS_FIXAS) {
    if (!textoDasSkills.includes(antes)) throw new Error(`pointer not found, update REESCRITAS_FIXAS: ${antes}`);
  }

  const textoQueFica = linhas.filter((_, i) => !removidas.has(i)).join('\n');
  for (const { antes } of REESCRITAS_NO_CLAUDE) {
    if (!textoQueFica.includes(antes)) throw new Error(`pointer not found, update REESCRITAS_NO_CLAUDE: ${antes}`);
  }

  // o que fica no CLAUDE.md: tudo menos o que saiu, com os ponteiros da tabela corrigidos
  const restante = linhas.filter((_, i) => !removidas.has(i)).map(l => corrigirLinha(l, null));
  const primeiroRemovido = Math.min(...secoes.map(x => x.ini).filter(i => removidas.has(i)));
  const posicao = linhas.slice(0, primeiroRemovido).filter((_, i) => !removidas.has(i)).length;
  const caminho = nome => `.claude/skills/${nome}/SKILL.md`;
  restante.splice(posicao, 0,
    TITULO_DOS_ATALHOS,
    '',
    'The architecture of each surface lives in a project skill, not here. **Open the skill when your change touches that surface, and when you review a diff that does** (`CODING_STANDARDS.md` says so too).',
    '',
    ...SKILLS.map(s => `- ${s.titulo}: \`${caminho(s.nome)}\``),
    `- e2e fixtures, fakes, test pages and visual references: \`${caminho(E2E.nome)}\` (see Testing below)`,
    '');

  const iHeadedNovo = restante.findIndex(l => l.startsWith(E2E.fim));
  restante.splice(iHeadedNovo, 0,
    `- The fixtures (\`e2e/fixtures.js\`), the fakes (\`e2e/fakes/\`), the local test pages (\`e2e/pages/\`), the Veio showcase (\`e2e/vitrine/\`) and the list of visual references (\`tests/*-visual.spec.js\`) are described in the \`${E2E.nome}\` skill: \`${caminho(E2E.nome)}\`. Open it before adding or changing an e2e test.`);

  // a linha da tabela de arquivos das três ferramentas da divisão, logo depois da de `scripts/`
  const iScripts = restante.findIndex(l => l.startsWith('| `scripts/` |'));
  if (iScripts < 0) throw new Error('the `scripts/` row of the Files table was not found');
  restante.splice(iScripts + 1, 0,
    '| `scripts/dividir-claude-md.mjs`, `scripts/verificar-divisao-do-claude-md.mjs`, `scripts/divisao-do-claude-md.mjs`, `scripts/test_divisao_do_claude_md.mjs` | The split of this file into the surface skills (`.agents/skills/`, linked from `.claude/skills/`). `node scripts/dividir-claude-md.mjs <CLAUDE.md inteiro>` redoes it (only needed when a merge brings an unsplit `CLAUDE.md`, see `--help`); `node scripts/verificar-divisao-do-claude-md.mjs --base <ref>` proves nothing was lost and that every skill is valid YAML with working links; the `divisao-` module holds the section → skill table both read |');

  const claude = restante.filter((l, i) => !(l === '' && restante[i - 1] === '')).join('\n');

  const skills = {};
  const montar = (s, corpo) => {
    skills[s.nome] = [
      ...cabecalhoYaml(s), '',
      `# ${s.titulo}`, '',
      `${MARCA_DO_CORPO} \`CLAUDE.md\` § ${s.origem || 'Architecture'}. \`CLAUDE.md\` keeps the file table and the rules that cross surfaces.`, '',
      ...corpo, '',
    ].join('\n');
  };
  for (const s of SKILLS) {
    montar(s, blocos.get(s.nome).flatMap((b, k) => [...(k ? [''] : []), ...b.map(l => corrigirLinha(l, s.nome))]));
  }
  montar(E2E, blocoE2e.map(l => corrigirLinha(l, E2E.nome)));
  return { claude, skills };
}
