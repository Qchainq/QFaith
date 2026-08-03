// El clasificador corre en el dispositivo, sobre texto ya descifrado. Es una
// heurística simple y se equivocará: lo que estas pruebas fijan es que su
// comportamiento sea predecible y que no invente etiquetas.
import { clasificar } from '../use-cases/clasificador';

describe('temas reconocidos', () => {
  it('reconoce un tema por su palabra', () => {
    expect(clasificar('Hoy pude perdonar a mi jefe')).toContain('perdon');
  });

  it('no le afectan los acentos ni las mayúsculas', () => {
    expect(clasificar('ANSIÓS por lo de mañana')).toContain('ansiedad');
    expect(clasificar('ansios por lo de manana')).toContain('ansiedad');
  });

  it('reconoce varios temas en el mismo texto', () => {
    const temas = clasificar('Con mi familia sentí mucho gozo y gratitud');

    expect(temas).toContain('familia');
    expect(temas).toContain('gozo');
  });

  it('funciona también en inglés', () => {
    expect(clasificar('I felt anxiety about my family')).toEqual(
      expect.arrayContaining(['ansiedad', 'familia']),
    );
  });
});

describe('cuando no reconoce nada', () => {
  it('devuelve una lista vacía en vez de inventar una etiqueta', () => {
    // Una ficha sin tema es válida. Rellenar el hueco con algo aproximado
    // sería peor que dejarlo vacío: los temas acompañan, no diagnostican.
    expect(clasificar('qwerty zxcvb')).toEqual([]);
  });

  it('un texto vacío no da temas', () => {
    expect(clasificar('')).toEqual([]);
  });
});

describe('estabilidad', () => {
  it('el mismo texto da siempre el mismo resultado', () => {
    const texto = 'Perdón y esperanza para mi familia';

    expect(clasificar(texto)).toEqual(clasificar(texto));
  });

  it('los temas salen siempre en el mismo orden', () => {
    // El orden es el del catálogo, no el de aparición: así dos dispositivos
    // producen fichas idénticas y no generan un conflicto por nada.
    expect(clasificar('familia y perdón')).toEqual(['perdon', 'familia']);
  });
});
