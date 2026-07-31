// Utilidades de codificación. Aisladas para que el resto del núcleo
// criptográfico trabaje siempre con `Uint8Array` y solo convierta a texto en
// el borde, al persistir.

const ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function aBase64(bytes: Uint8Array): string {
  let resultado = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    resultado += ALFABETO_BASE64[b0 >> 2];
    resultado += ALFABETO_BASE64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    resultado += b1 === undefined ? '=' : ALFABETO_BASE64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    resultado += b2 === undefined ? '=' : ALFABETO_BASE64[b2 & 0x3f];
  }
  return resultado;
}

export function desdeBase64(texto: string): Uint8Array {
  const limpio = texto.replace(/=+$/, '');
  const bytes = new Uint8Array((limpio.length * 3) / 4);
  let posicion = 0;
  let acumulador = 0;
  let bitsAcumulados = 0;

  for (const caracter of limpio) {
    const valor = ALFABETO_BASE64.indexOf(caracter);
    if (valor === -1) {
      throw new Error('base64 no válido');
    }
    acumulador = (acumulador << 6) | valor;
    bitsAcumulados += 6;
    if (bitsAcumulados >= 8) {
      bitsAcumulados -= 8;
      bytes[posicion] = (acumulador >> bitsAcumulados) & 0xff;
      posicion += 1;
    }
  }
  return bytes.subarray(0, posicion);
}

const codificadorTexto = new TextEncoder();
const decodificadorTexto = new TextDecoder();

export function aBytes(texto: string): Uint8Array {
  return codificadorTexto.encode(texto);
}

export function aTexto(bytes: Uint8Array): string {
  return decodificadorTexto.decode(bytes);
}

/**
 * Sobrescribe el contenido de un búfer con ceros.
 *
 * En JavaScript no se puede garantizar que el recolector de basura no haya
 * dejado copias, así que esto reduce la ventana de exposición pero no la
 * elimina. Se usa igualmente: es la práctica correcta y el coste es nulo.
 */
export function limpiar(bytes: Uint8Array): void {
  bytes.fill(0);
}
