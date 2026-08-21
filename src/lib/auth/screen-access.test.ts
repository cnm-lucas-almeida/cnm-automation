// node --test src/lib/auth/screen-access.test.ts   (Node >= 22.6, roda TS direto)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathAllowed } from './screen-access.ts';

test('tela liberada libera também a API que ela consome', () => {
  const rh = ['/secullum/ponto-d1', '/financeiro/dre'];
  assert.ok(pathAllowed('/financeiro/dre', rh));
  assert.ok(pathAllowed('/api/dre', rh));
  assert.ok(pathAllowed('/api/dre/balancete', rh));
  assert.ok(pathAllowed('/api/dre/ir-csll', rh));
  // DRE não dá acesso a outras telas do grupo Financeiro
  assert.equal(pathAllowed('/financeiro/quadro-comercial', rh), false);
  assert.equal(pathAllowed('/api/quadro-comercial', rh), false);
});

test('API de projeção só com a tela de projeção', () => {
  assert.ok(pathAllowed('/api/dre/projecao', ['/financeiro/projecao']));
  assert.equal(pathAllowed('/api/dre', ['/financeiro/projecao']), false);
});

test('sem permissão nenhuma nada passa', () => {
  assert.equal(pathAllowed('/api/dre', []), false);
  assert.equal(pathAllowed('/financeiro/dre', ['/vendas']), false);
});
