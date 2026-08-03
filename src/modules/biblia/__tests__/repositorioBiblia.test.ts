// El texto bíblico es el primer contenido del proyecto que **no** pasa por el
// motor de sincronización ni por el cifrado. Estas pruebas fijan esa
// diferencia y la forma de las consultas.
import type { ClienteRest } from '@shared/services/supabase/rest';

import { crearRepositorioBiblia } from '../repositories/repositorioBiblia';

function crearRest(respuestas: { estado: number; filas: unknown[] }[]) {
  const rutas: string[] = [];
  const rest = {
    peticion: jest.fn(async (parametros: Record<string, unknown>) => {
      rutas.push(parametros.ruta as string);
      return { ...(respuestas.shift() ?? { estado: 200, filas: [] }), codigo: null };
    }),
    comoError: jest.fn(() => new Error('fallo del servidor')),
  } as unknown as ClienteRest;
  return { rest, rutas };
}

describe('traducciones', () => {
  it('solo pide las activas', async () => {
    // Una traducción sin licencia válida se desactiva; no debe aparecer.
    const { rest, rutas } = crearRest([{ estado: 200, filas: [] }]);

    await crearRepositorioBiblia({ rest }).traducciones();

    expect(rutas[0]).toContain('is_active=eq.true');
  });

  it('traduce las filas al modelo del módulo', async () => {
    const { rest } = crearRest([
      {
        estado: 200,
        filas: [
          {
            id: 't1',
            code: 'rv1909',
            name: 'Reina-Valera 1909',
            language_code: 'es',
            offline_available: true,
          },
        ],
      },
    ]);

    const traducciones = await crearRepositorioBiblia({ rest }).traducciones();

    expect(traducciones).toEqual([
      {
        id: 't1',
        codigo: 'rv1909',
        nombre: 'Reina-Valera 1909',
        idioma: 'es',
        disponibleSinConexion: true,
      },
    ]);
  });

  it('propaga el fallo del servidor', async () => {
    const { rest } = crearRest([{ estado: 500, filas: [] }]);

    await expect(crearRepositorioBiblia({ rest }).traducciones()).rejects.toThrow();
  });
});

describe('libros', () => {
  it('los pide en el orden canónico, no alfabético', async () => {
    const { rest, rutas } = crearRest([{ estado: 200, filas: [] }]);

    await crearRepositorioBiblia({ rest }).libros('t1');

    expect(rutas[0]).toContain('order=book_order.asc');
  });

  it('un testamento desconocido no rompe la lectura', async () => {
    const { rest } = crearRest([
      {
        estado: 200,
        filas: [
          {
            book_code: 'JHN',
            book_name: 'Juan',
            testament: 'lo-que-sea',
            book_order: 43,
            chapter_count: 21,
          },
        ],
      },
    ]);

    const libros = await crearRepositorioBiblia({ rest }).libros('t1');

    expect(libros[0]?.testamento).toBe('antiguo');
  });
});

describe('capítulo', () => {
  it('pide los versículos del capítulo, en orden', async () => {
    const { rest, rutas } = crearRest([{ estado: 200, filas: [] }]);

    await crearRepositorioBiblia({ rest }).capitulo({
      traduccionId: 't1',
      libro: 'JHN',
      capitulo: 3,
    });

    expect(rutas[0]).toContain('book_code=eq.JHN');
    expect(rutas[0]).toContain('chapter_number=eq.3');
    expect(rutas[0]).toContain('order=verse_number.asc');
  });

  it('devuelve el texto tal cual: es público y no se descifra', async () => {
    const { rest } = crearRest([
      {
        estado: 200,
        filas: [
          { book_code: 'JHN', chapter_number: 3, verse_number: 16, verse_text: 'Texto de prueba.' },
        ],
      },
    ]);

    const versiculos = await crearRepositorioBiblia({ rest }).capitulo({
      traduccionId: 't1',
      libro: 'JHN',
      capitulo: 3,
    });

    expect(versiculos).toEqual([
      { libro: 'JHN', capitulo: 3, numero: 16, texto: 'Texto de prueba.' },
    ]);
  });

  it('escapa el código del libro en la consulta', async () => {
    const { rest, rutas } = crearRest([{ estado: 200, filas: [] }]);

    await crearRepositorioBiblia({ rest }).capitulo({
      traduccionId: 't1',
      libro: '1 SAM',
      capitulo: 1,
    });

    expect(rutas[0]).toContain('book_code=eq.1%20SAM');
  });
});
