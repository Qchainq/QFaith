// La aleatoriedad es la base de todo lo demás: nonces, claves y sales. Si
// esta función devolviera algo previsible, el cifrado dejaría de proteger
// aunque el resto estuviera bien.
import { generarBytesAleatorios, generarUuid } from '../aleatoriedad';

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
