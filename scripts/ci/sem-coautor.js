'use strict';

// O filtro do comando de conserto que scripts/ci/autoria.js dá quando um co-autor barra: a mensagem de um commit entra
// pelo stdin e sai sem as linhas dos co-autores de fora; os outros bytes saem como entraram (latin1 é byte a byte).
// É um arquivo à parte para falhar sem estrago numa base que ainda não o tem: o node não o acha, nada sai, o
// git commit recusa a mensagem vazia e o rebase para. Uso: git log -1 --format=%B | node scripts/ci/sem-coautor.js

const fs = require('fs');
const { semCoautoresDeFora } = require('./autoria.js');

process.stdout.write(semCoautoresDeFora(fs.readFileSync(0, 'latin1')), 'latin1');
