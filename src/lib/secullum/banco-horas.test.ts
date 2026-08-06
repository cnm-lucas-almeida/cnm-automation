// node --test src/lib/secullum/banco-horas.test.ts   (Node >= 22.6, roda TS direto)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularBancoHorasDeBatidas, type Batida } from './index.ts';

function dia(data: string, campos: Partial<Batida> = {}): Batida {
  return {
    Id: 1, FuncionarioId: 1, Data: `${data}T00:00:00`,
    Entrada1: null, Saida1: null, Entrada2: null, Saida2: null,
    Entrada3: null, Saida3: null, Entrada4: null, Saida4: null,
    Entrada5: null, Saida5: null,
    Folga: false, Neutro: false, Compensado: false, Refeicao: false, NBanco: false,
    MemoriaEntrada1: '08:00', MemoriaSaida1: '12:00',
    MemoriaEntrada2: '13:00', MemoriaSaida2: '17:00',
    ...campos,
  };
}

test('extra, atraso e saldo do período', () => {
  const banco = calcularBancoHorasDeBatidas([
    // +30min
    dia('2026-08-03', { Entrada1: '08:00', Saida1: '12:00', Entrada2: '13:00', Saida2: '17:30' }),
    // -60min
    dia('2026-08-04', { Entrada1: '09:00', Saida1: '12:00', Entrada2: '13:00', Saida2: '17:00' }),
    // dentro da tolerância de 10min: não conta
    dia('2026-08-05', { Entrada1: '08:05', Saida1: '12:00', Entrada2: '13:00', Saida2: '17:00' }),
  ]);

  assert.equal(banco.extrasMin, 30);
  assert.equal(banco.atrasosMin, 60);
  assert.equal(banco.saldoMin, -30);
  assert.equal(banco.temRegistro, true);
  assert.deepEqual(banco.diasDetalhe.map((d) => d.tipo), ['extra', 'atraso', 'neutro']);
});

test('dia justificado e folga não viram atraso', () => {
  const banco = calcularBancoHorasDeBatidas([
    dia('2026-08-06', { Entrada1: 'AT. MÉD' }),
    dia('2026-08-08', { Folga: true, MemoriaEntrada1: null, MemoriaSaida1: null, MemoriaEntrada2: null, MemoriaSaida2: null }),
  ]);

  assert.equal(banco.atrasosMin, 0);
  assert.equal(banco.saldoMin, 0);
  assert.equal(banco.diasDetalhe[0].tipo, 'justificado');
  assert.equal(banco.diasDetalhe[0].motivo, 'Atestado médico');
  assert.equal(banco.diasDetalhe[0].diffMin, 0);
});

test('período sem batida nenhuma', () => {
  assert.equal(calcularBancoHorasDeBatidas([]).temRegistro, false);
});
