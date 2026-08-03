// Cómo se escribe una referencia es lo que la hace reconocible. Un fallo aquí
// no rompe nada, pero deja al usuario sin saber a qué pasaje pertenece su nota.
import { formatearReferencia } from '../models/biblia';

describe('formato de una referencia', () => {
  it('un capítulo entero se escribe sin versículo', () => {
    expect(
      formatearReferencia('Juan', { capitulo: 3, versiculoInicio: null, versiculoFin: null }),
    ).toBe('Juan 3');
  });

  it('un versículo suelto lleva su número', () => {
    expect(
      formatearReferencia('Juan', { capitulo: 3, versiculoInicio: 16, versiculoFin: 16 }),
    ).toBe('Juan 3:16');
  });

  it('un rango se escribe con guion', () => {
    expect(
      formatearReferencia('Juan', { capitulo: 3, versiculoInicio: 16, versiculoFin: 18 }),
    ).toBe('Juan 3:16-18');
  });

  it('un inicio sin fin no arrastra un guion suelto', () => {
    expect(
      formatearReferencia('Salmos', { capitulo: 23, versiculoInicio: 1, versiculoFin: null }),
    ).toBe('Salmos 23:1');
  });
});
