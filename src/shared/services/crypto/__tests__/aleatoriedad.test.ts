// La aleatoriedad es la base de todo lo demás: nonces, claves y sales. Si
// esta función devolviera algo previsible, el cifrado dejaría de proteger
// aunque el resto estuviera bien.
import { generarBytesAleatorios, generarUuid, generarUuidDesde } from '../aleatoriedad';

describe('generación de bytes', () => {
  it('devuelve la longitud pedida', () => {
    [1, 16, 24, 32, 64].forEach((longitud) => {
      expect(generarBytesAleatorios(longitud)).toHaveLength(longitud);
    });
  });

  it('no repite: dos llamadas seguidas dan valores distintos', () => {
    const muestras = new Set(
      Array.from({ length: 50 }, () => generarBytesAleatorios(16).join(',')),
    );
    expect(muestras.size).toBe(50);
  });

  it('rechaza longitudes que no tienen sentido en lugar de devolver algo vacío', () => {
    [0, -1, 1.5, Number.NaN].forEach((longitud) => {
      expect(() => generarBytesAleatorios(longitud)).toThrow();
    });
  });
});

describe('identificadores', () => {
  it('genera UUID con formato válido y sin repetir', () => {
    const uuids = Array.from({ length: 100 }, () => generarUuid());

    uuids.forEach((uuid) => {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
    expect(new Set(uuids).size).toBe(100);
  });
});

describe('UUID derivado de un texto', () => {
  it('tiene forma de UUID de versión 5', () => {
    const uuid = generarUuidDesde('biblioteca/diario/abc');

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('el mismo texto da siempre el mismo identificador', () => {
    // Es lo que permite que dos dispositivos calculen la misma ficha sin
    // coordinarse y no la dupliquen al sincronizar.
    expect(generarUuidDesde('mismo')).toBe(generarUuidDesde('mismo'));
  });

  it('textos distintos dan identificadores distintos', () => {
    expect(generarUuidDesde('uno')).not.toBe(generarUuidDesde('otro'));
  });

  it('un texto vacío también produce un identificador válido', () => {
    expect(generarUuidDesde('')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no sirve como fuente de aleatoriedad: es predecible a propósito', () => {
    const uno = generarUuidDesde('predecible');
    const dos = generarUuidDesde('predecible');

    expect(uno).toBe(dos);
    expect(uno).not.toBe(generarUuid());
  });
});
