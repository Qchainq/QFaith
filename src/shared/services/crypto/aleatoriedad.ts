// Única fuente de aleatoriedad del proyecto.
//
// Se apoya en el generador del sistema operativo a través de `expo-crypto`.
// Nunca usar `Math.random` para nada relacionado con seguridad: no es un
// generador criptográficamente seguro.
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

import { aBytes } from './codificacion';

export function generarBytesAleatorios(longitud: number): Uint8Array {
  if (!Number.isInteger(longitud) || longitud <= 0) {
    throw new Error('La longitud debe ser un entero positivo');
  }
  return Crypto.getRandomBytes(longitud);
}

export function generarUuid(): string {
  return Crypto.randomUUID();
}

/**
 * UUID derivado de un texto, siempre el mismo para la misma entrada.
 *
 * No es aleatorio y no debe usarse donde haga falta imprevisibilidad. Sirve
 * para identificadores que **tienen que coincidir entre dispositivos sin
 * coordinarse**: la ficha de la Biblioteca de Vida de una entrada del diario,
 * por ejemplo, que dos dispositivos deben calcular igual para no duplicarla.
 *
 * Sigue la forma de un UUID de versión 5: hash del texto, con los bits de
 * versión y variante fijados.
 */
export function generarUuidDesde(texto: string): string {
  const hex = [...sha256(aBytes(texto)).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  // Se ajustan los dígitos de versión y variante sobre la cadena, no sobre el
  // array: indexar bytes obligaría a un valor por defecto que nunca se usa y
  // dejaría ramas imposibles de probar.
  const versionado = `${hex.slice(0, 12)}5${hex.slice(13, 16)}`;
  // `charAt` siempre devuelve una cadena, así que no hace falta un valor por
  // defecto para un índice que nunca puede salirse.
  const variante = '89ab'.charAt(Number.parseInt(hex.slice(16, 17), 16) % 4);

  return [
    versionado.slice(0, 8),
    versionado.slice(8, 12),
    versionado.slice(12, 16),
    `${variante}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
