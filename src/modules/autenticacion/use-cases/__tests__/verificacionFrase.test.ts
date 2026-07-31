import {
  coincidePalabra,
  elegirPosiciones,
  PALABRAS_A_CONFIRMAR,
  verificacionCompleta,
} from '../verificacionFrase';

// Frase ficticia con 24 palabras distintas, para poder comprobar posiciones.
const FRASE = Array.from({ length: 24 }, (_, i) => `palabra${i + 1}`).join(' ');

describe('elección de posiciones', () => {
  it('elige el número pedido, sin repetir y en orden ascendente', () => {
    const posiciones = elegirPosiciones(FRASE);

    expect(posiciones).toHaveLength(PALABRAS_A_CONFIRMAR);
    const numeros = posiciones.map((posicion) => posicion.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
  });

  it('las posiciones se numeran desde uno y apuntan a la palabra correcta', () => {
    const palabras = FRASE.split(' ');
    elegirPosiciones(FRASE, 24).forEach((posicion) => {
      expect(posicion.numero).toBeGreaterThanOrEqual(1);
      expect(posicion.numero).toBeLessThanOrEqual(24);
      expect(posicion.palabraEsperada).toBe(palabras[posicion.numero - 1]);
    });
  });

  it('no se queda bloqueada aunque se pidan más palabras de las que hay', () => {
    const posiciones = elegirPosiciones('una dos tres', 10);
    expect(posiciones).toHaveLength(3);
  });

  it('devuelve vacío ante entradas sin sentido', () => {
    expect(elegirPosiciones('')).toHaveLength(0);
    expect(elegirPosiciones(FRASE, 0)).toHaveLength(0);
  });

  it('varía entre llamadas, así que no siempre pide las mismas', () => {
    const muestras = new Set(
      Array.from({ length: 25 }, () =>
        elegirPosiciones(FRASE)
          .map((posicion) => posicion.numero)
          .join('-'),
      ),
    );
    expect(muestras.size).toBeGreaterThan(1);
  });
});

describe('comparación de palabras', () => {
  it('tolera espacios y mayúsculas', () => {
    expect(coincidePalabra('  Abandon ', 'abandon')).toBe(true);
    expect(coincidePalabra('ABANDON', 'abandon')).toBe(true);
  });

  it('no acepta una palabra distinta ni una vacía', () => {
    expect(coincidePalabra('ability', 'abandon')).toBe(false);
    expect(coincidePalabra('', 'abandon')).toBe(false);
  });
});

describe('verificación completa', () => {
  const posiciones = [
    { numero: 2, palabraEsperada: 'palabra2' },
    { numero: 7, palabraEsperada: 'palabra7' },
  ] as const;

  it('acepta cuando todas las respuestas coinciden', () => {
    expect(verificacionCompleta(posiciones, { 2: 'palabra2', 7: ' PALABRA7 ' })).toBe(true);
  });

  it('rechaza si falta una respuesta o alguna es incorrecta', () => {
    expect(verificacionCompleta(posiciones, { 2: 'palabra2' })).toBe(false);
    expect(verificacionCompleta(posiciones, { 2: 'palabra2', 7: 'otra' })).toBe(false);
  });

  it('rechaza si no hay nada que verificar, para no dar por buena una pantalla vacía', () => {
    expect(verificacionCompleta([], {})).toBe(false);
  });
});
