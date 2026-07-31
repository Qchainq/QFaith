// Única fuente de aleatoriedad del proyecto.
//
// Se apoya en el generador del sistema operativo a través de `expo-crypto`.
// Nunca usar `Math.random` para nada relacionado con seguridad: no es un
// generador criptográficamente seguro.
import * as Crypto from 'expo-crypto';

export function generarBytesAleatorios(longitud: number): Uint8Array {
  if (!Number.isInteger(longitud) || longitud <= 0) {
    throw new Error('La longitud debe ser un entero positivo');
  }
  return Crypto.getRandomBytes(longitud);
}

export function generarUuid(): string {
  return Crypto.randomUUID();
}
