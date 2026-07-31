// Verificación de que el usuario ha guardado su frase de recuperación.
//
// Sin esta comprobación mucha gente pulsa «continuar» sin anotar nada y
// descubre el problema cuando ya no tiene arreglo: si pierde la frase y el
// acceso a la cuenta, su contenido privado es irrecuperable por diseño.
//
// Se piden unas pocas palabras en posiciones al azar. No es un examen: es un
// recordatorio con consecuencias reales.
import { generarBytesAleatorios } from '@shared/services/crypto/aleatoriedad';

/** Número de palabras que se piden confirmar. */
export const PALABRAS_A_CONFIRMAR = 3;

export interface PosicionAConfirmar {
  /** Posición empezando en 1, que es como la ve el usuario. */
  readonly numero: number;
  readonly palabraEsperada: string;
}

/**
 * Elige posiciones distintas al azar.
 *
 * Usa la fuente criptográfica del sistema, no `Math.random`: aunque aquí no
 * protege un secreto, el proyecto no tiene dos fuentes de aleatoriedad.
 */
export function elegirPosiciones(
  frase: string,
  cuantas: number = PALABRAS_A_CONFIRMAR,
): readonly PosicionAConfirmar[] {
  // `''.split(/\s+/)` devuelve `['']`, no un array vacío, así que hay que
  // descartar los huecos antes de comprobar si queda alguna palabra.
  const palabras = frase
    .trim()
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0);
  if (palabras.length === 0 || cuantas <= 0) {
    return [];
  }

  const total = Math.min(cuantas, palabras.length);
  const elegidas = new Set<number>();
  const bytes = generarBytesAleatorios(total * 4);
  let cursor = 0;

  while (elegidas.size < total) {
    const byte = bytes[cursor % bytes.length] ?? 0;
    // Se recorre el resto de posiciones si la elegida ya estaba tomada, de
    // modo que el bucle siempre termina.
    let indice = byte % palabras.length;
    while (elegidas.has(indice)) {
      indice = (indice + 1) % palabras.length;
    }
    elegidas.add(indice);
    cursor += 1;
  }

  return [...elegidas]
    .sort((a, b) => a - b)
    .map((indice) => ({
      numero: indice + 1,
      palabraEsperada: palabras[indice] ?? '',
    }));
}

/** Compara tolerando espacios y mayúsculas, que es lo que teclea la gente. */
export function coincidePalabra(escrita: string, esperada: string): boolean {
  return escrita.trim().toLowerCase() === esperada.trim().toLowerCase();
}

export function verificacionCompleta(
  posiciones: readonly PosicionAConfirmar[],
  respuestas: Readonly<Record<number, string>>,
): boolean {
  if (posiciones.length === 0) {
    return false;
  }
  return posiciones.every((posicion) =>
    coincidePalabra(respuestas[posicion.numero] ?? '', posicion.palabraEsperada),
  );
}
