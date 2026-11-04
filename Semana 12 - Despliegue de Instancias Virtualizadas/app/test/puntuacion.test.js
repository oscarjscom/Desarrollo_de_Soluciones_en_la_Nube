// Pruebas unitarias del sistema de puntuación. Se ejecutan con: npm test   (usa el ejecutor de Node, sin dependencias)
const test = require('node:test');
const assert = require('node:assert/strict');
const { puntosBase, esAnticipada, puntuarUsuario } = require('../src/puntuacion');

const r = (l, v) => ({ golesLocal: l, golesVisitante: v });
const HORA = 3600 * 1000;

test('Regla 1: resultado exacto da 5 puntos', () => {
  const b = puntosBase(r(2, 1), r(2, 1));
  assert.equal(b.puntos, 5);
  assert.equal(b.exacto, true);
});

test('Regla 2: ganador correcto sin marcador exacto da 3 puntos', () => {
  const b = puntosBase(r(1, 0), r(3, 0)); // gana el local en ambos, diferencia distinta
  assert.equal(b.puntos, 3);
  assert.equal(b.exacto, false);
});

test('Regla 3: diferencia de goles correcta suma 2 (predice 3-1, termina 2-0)', () => {
  const b = puntosBase(r(3, 1), r(2, 0));
  assert.equal(b.ganador, true);
  assert.equal(b.diferencia, true);
  assert.equal(b.puntos, 5); // 3 por ganador + 2 por diferencia
});

test('Empate acertado con otro marcador: ganador (empate) + diferencia 0 = 5', () => {
  assert.equal(puntosBase(r(1, 1), r(0, 0)).puntos, 5);
});

test('Ganador incorrecto da 0 puntos', () => {
  assert.equal(puntosBase(r(2, 0), r(0, 1)).puntos, 0);
  assert.equal(puntosBase(r(1, 1), r(1, 0)).puntos, 0);
});

test('Regla 5: anticipada solo con más de 24 horas', () => {
  const inicio = new Date('2026-06-20T18:00:00Z');
  assert.equal(esAnticipada(new Date(inicio - 25 * HORA), inicio), true);
  assert.equal(esAnticipada(new Date(inicio - 24 * HORA), inicio), false); // exactamente 24 h no cuenta
  assert.equal(esAnticipada(new Date(inicio - 10 * 60 * 1000), inicio), false); // último minuto (10 min)
});

// Utilidad: partido finalizado n con resultado 2-0, a 1 día + n horas del inicio del torneo
const partido = (id, dia) => ({ id, inicio: new Date(Date.UTC(2026, 5, dia, 18)), golesLocal: 2, golesVisitante: 0 });
const pred = (id, l, v, horasAntes, dia) => [id, { golesLocal: l, golesVisitante: v, registrada: new Date(Date.UTC(2026, 5, dia, 18) - horasAntes * HORA) }];

test('Regla 4: racha, +2 al tercer acierto seguido y otra vez al sexto', () => {
  const partidos = [1, 2, 3, 4, 5, 6].map((i) => partido(i, 10 + i));
  // Todas con ganador correcto (1-0 vs 2-0: ganador 3, diferencia no) y registradas tarde (sin bonus de anticipación)
  const preds = new Map([1, 2, 3, 4, 5, 6].map((i) => pred(i, 1, 0, 1, 10 + i)));
  const res = puntuarUsuario(partidos, preds);
  assert.equal(res.total, 6 * 3 + 2 + 2); // 18 base + 2 (3er acierto) + 2 (6to acierto)
  assert.equal(res.mejorRacha, 6);
});

test('Regla 4: un fallo o un partido sin predicción corta la racha', () => {
  const partidos = [1, 2, 3, 4, 5].map((i) => partido(i, 10 + i));
  const preds = new Map([
    pred(1, 1, 0, 1, 11), pred(2, 1, 0, 1, 12), pred(3, 0, 2, 1, 13), // el 3 falla
    pred(4, 1, 0, 1, 14), pred(5, 1, 0, 1, 15),
  ]);
  const res = puntuarUsuario(partidos, preds);
  assert.equal(res.total, 4 * 3); // sin ningún bonus de racha
  const sinPred = puntuarUsuario(partidos, new Map([pred(1, 1, 0, 1, 11), pred(2, 1, 0, 1, 12), pred(4, 1, 0, 1, 14), pred(5, 1, 0, 1, 15)]));
  assert.equal(sinPred.total, 4 * 3);
});

test('Regla 5 en un partido: +1 si fue anticipada y ganó puntos; sin puntos base no hay bonus', () => {
  const p = [partido(1, 15)];
  assert.equal(puntuarUsuario(p, new Map([pred(1, 2, 0, 30, 15)])).total, 5 + 1); // exacto + anticipada
  assert.equal(puntuarUsuario(p, new Map([pred(1, 2, 0, 0.1, 15)])).total, 5); // último minuto: solo base
  assert.equal(puntuarUsuario(p, new Map([pred(1, 0, 3, 30, 15)])).total, 0); // fallo anticipado: 0
});

test('Combinación: exacto + anticipada + racha en el mismo partido', () => {
  const partidos = [1, 2, 3].map((i) => partido(i, 10 + i));
  const preds = new Map([1, 2, 3].map((i) => pred(i, 2, 0, 48, 10 + i)));
  const res = puntuarUsuario(partidos, preds);
  assert.equal(res.total, 3 * (5 + 1) + 2); // 3 exactos anticipados + bonus de racha
  assert.equal(res.exactos, 3);
});
