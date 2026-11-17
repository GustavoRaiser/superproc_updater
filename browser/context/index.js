'use strict';
const tipos = require('./tipos');
const { criarTabRegistry, classificarPadrao } = require('./tab-registry');
const { criarContextBroker } = require('./context-broker');
const { dumpWorkspaceContext } = require('./dump');
const { montarMarkdown } = require('./markdown');
const { criarExportador, criarAtalhos } = require('./exportador');

module.exports = { ...tipos, criarTabRegistry, classificarPadrao, criarContextBroker, dumpWorkspaceContext, montarMarkdown, criarExportador, criarAtalhos };
