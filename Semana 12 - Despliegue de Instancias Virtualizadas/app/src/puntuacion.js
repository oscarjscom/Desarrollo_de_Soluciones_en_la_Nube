// Sistema de puntuación del Mundial. Funciones puras: no tocan la base de datos, así se pueden probar solas.
//
// Reglas (según el laboratorio):
//   1. Resultado exacto ............ 5 puntos
//   2. Ganador (o empate) correcto .. 3 puntos (aunque no acierte el marcador)
//   3. Diferencia de goles correcta . 2 puntos (aunque no acierte el marcador)
//   4. Racha: por cada 3 partidos consecutivos acertados (al menos el ganador): +2
//   5. Predicción anticipada: registrada con más de 24 h de anticipación: +1
//
// Interpretación usada (documentada en el informe):
//   - Si el marcador es exacto, el partido da 5 puntos en total.
//   - Si no es exacto, se suman el ganador correcto (3) y la diferencia correcta (2).
//   - La racha cuenta partidos finalizados en orden de fecha; un partido sin predicción o con ganador
//     incorrecto corta la racha. Cada 3, 6, 9... aciertos seguidos suma +2 en ese partido.
//   - El punto por anticipación solo se da si la predicción ganó puntos base (evita sumar por predecir "al azar").

const PUNTOS = { exacto: 5, ganador: 3, diferencia: 2, rachaCada: 3, rachaBonus: 2, anticipada: 1 };
const HORAS_ANTICIPACION = 24;

const signo = (a, b) => Math.sign(a - b);

// Puntos base de una predicción contra el resultado real.
function puntosBase(pred, real) {
  const exacto = pred.golesLocal === real.golesLocal && pred.golesVisitante === real.golesVisitante;
  const ganador = signo(pred.golesLocal, pred.golesVisitante) === signo(real.golesLocal, real.golesVisitante);
  const diferencia = pred.golesLocal - pred.golesVisitante === real.golesLocal - real.golesVisitante;
  let puntos = 0;
  if (exacto) puntos = PUNTOS.exacto;
  else puntos = (ganador ? PUNTOS.ganador : 0) + (diferencia ? PUNTOS.diferencia : 0);
  return { exacto, ganador, diferencia, puntos };
}

// ¿Se registró con más de 24 horas de anticipación?
function esAnticipada(registrada, inicio) {
  return new Date(inicio).getTime() - new Date(registrada).getTime() > HORAS_ANTICIPACION * 3600 * 1000;
}

// partidos: finalizados, ordenados por fecha. predicciones: Map(partidoId -> predicción) de UN usuario.
function puntuarUsuario(partidos, predicciones) {
  let total = 0, aciertos = 0, exactos = 0, racha = 0, mejorRacha = 0, jugadas = 0;
  const detalle = [];
  for (const p of partidos) {
    const pred = predicciones.get(p.id);
    if (!pred) {
      racha = 0;
      detalle.push({ partidoId: p.id, base: 0, racha: 0, anticipada: 0, total: 0, sinPrediccion: true });
      continue;
    }
    jugadas++;
    const b = puntosBase(pred, p);
    let bonusRacha = 0, bonusAnticipada = 0;
    if (b.ganador) {
      aciertos++;
      racha++;
      mejorRacha = Math.max(mejorRacha, racha);
      if (racha % PUNTOS.rachaCada === 0) bonusRacha = PUNTOS.rachaBonus;
    } else {
      racha = 0;
    }
    if (b.exacto) exactos++;
    if (b.puntos > 0 && esAnticipada(pred.registrada, p.inicio)) bonusAnticipada = PUNTOS.anticipada;
    const subtotal = b.puntos + bonusRacha + bonusAnticipada;
    total += subtotal;
    detalle.push({ partidoId: p.id, base: b.puntos, racha: bonusRacha, anticipada: bonusAnticipada, total: subtotal, exacto: b.exacto });
  }
  return { total, aciertos, exactos, jugadas, mejorRacha, detalle };
}

module.exports = { PUNTOS, HORAS_ANTICIPACION, puntosBase, esAnticipada, puntuarUsuario };
