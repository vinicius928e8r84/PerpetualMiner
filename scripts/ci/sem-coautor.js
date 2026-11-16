'use strict';

const fs = require('fs');
const { semCoautoresDeFora } = require('./autoria.js');

process.stdout.write(semCoautoresDeFora(fs.readFileSync(0, 'latin1')), 'latin1');
