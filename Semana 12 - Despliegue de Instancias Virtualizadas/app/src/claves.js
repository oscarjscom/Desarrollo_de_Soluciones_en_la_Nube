// Cifrado de claves con scrypt (incluido en Node). Es asíncrono: el cálculo se hace en otros hilos y
// no bloquea el servidor, que sigue atendiendo peticiones mientras tanto (importante con muchos inicios de sesión a la vez).
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const COSTO = 16384; // N de scrypt (2^14)
const LARGO = 32;

async function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const derivada = await scrypt(clave, sal, LARGO, { N: COSTO });
  return `scrypt$${COSTO}$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

async function compararClave(clave, almacenado) {
  const [tipo, costo, salHex, hashHex] = String(almacenado).split('$');
  if (tipo !== 'scrypt') return false;
  const esperada = Buffer.from(hashHex, 'hex');
  const derivada = await scrypt(clave, Buffer.from(salHex, 'hex'), esperada.length, { N: Number(costo) });
  return crypto.timingSafeEqual(derivada, esperada);
}

module.exports = { hashClave, compararClave };
