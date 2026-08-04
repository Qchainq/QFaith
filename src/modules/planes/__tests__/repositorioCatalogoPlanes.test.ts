// Forma de las peticiones al catálogo de planes.
//
// Lo que más importa aquí es lo que el cliente **no** manda: quién puede ver
// un plan lo decide la política de la migración 0017, no este archivo. Si el
// cliente filtrara por publicado o por contenido de pago, habría dos copias de
// la misma regla y el día que se separaran ganaría la de abajo sin que nadie
// se enterara — pero la de arriba seguiría dando una falsa sensación de
// seguridad al leer el código.
import { crearClienteRest } from '@shared/services/supabase/rest';

import { crearRepositorioCatalogoPlanes } from '../repositories/repositorioCatalogoPlanes';

interface Peticion {
  readonly url: string;
  readonly urlLegible: string;
}

function montar(respuestas: { estado: number; cuerpo: unknown }[] = []) {
  const peticiones: Peticion[] = [];

  const transporte = (async (url: string | URL | Request) => {
    peticiones.push({ url: String(url), urlLegible: decodeURIComponent(String(url)) });
    const siguiente = respuestas.shift() ?? { estado: 200, cuerpo: [] };
    return {
      status: siguiente.estado,
      text: async () => JSON.stringify(siguiente.cuerpo),
    } as Response;
  }) as typeof fetch;

  const rest = crearClienteRest({
    transporte,
    proveerToken: async () => 'token-de-prueba',
    url: 'https://ejemplo.supabase.co',
    claveAnonima: 'anonima',
  });

  return { peticiones, catalogo: crearRepositorioCatalogoPlanes(rest) };
}

const filaPlan = (extra: Record<string, unknown> = {}) => ({
  id: 'plan-1',
  creator_type: 'qfaith',
  title: 'Siete días sobre la ansiedad',
  description: null,
  language_code: 'es',
  duration_days: 7,
  is_premium: false,
  ...extra,
});

describe('quién decide qué se ve', () => {
  it('el cliente no filtra por publicado ni por contenido de pago', async () => {
    const { catalogo, peticiones } = montar();

    await catalogo.planes();

    // La política ya lo hace. Repetirlo aquí no añade protección —un cliente
    // manipulado se lo saltaría igual— y sí añade una segunda copia de la
    // regla que puede quedarse desfasada.
    //
    // Se busca el filtro, no el nombre: ambas columnas aparecen en el
    // `select` porque hay que leerlas, y comprobar solo el nombre daría rojo
    // por la razón equivocada.
    expect(peticiones[0]?.urlLegible).not.toContain('is_published=');
    expect(peticiones[0]?.urlLegible).not.toContain('is_premium=');
  });

  it('un plan de pago que la política sí devuelve se enseña marcado', async () => {
    // El día que exista la suscripción, el catálogo tiene que poder decir cuál
    // es de pago para que la pantalla lo distinga.
    const { catalogo } = montar([{ estado: 200, cuerpo: [filaPlan({ is_premium: true })] }]);

    expect((await catalogo.planes())[0]?.esDePago).toBe(true);
  });
});

describe('listar planes', () => {
  it('se ordenan por duración: es lo que la gente compara al elegir', async () => {
    const { catalogo, peticiones } = montar();

    await catalogo.planes();

    // Nunca por popularidad: no hay columna que la cuente, y no la habrá.
    expect(peticiones[0]?.urlLegible).toContain('order=duration_days.asc,title.asc');
  });

  it('el idioma se escapa antes de meterlo en el filtro', async () => {
    const { catalogo, peticiones } = montar();

    await catalogo.planes('es&select=*');

    expect(peticiones[0]?.url).not.toContain('es&select=*');
    expect(peticiones[0]?.url).toContain('es%26select');
  });

  it('sin idioma no manda el filtro en vez de mandarlo vacío', async () => {
    const { catalogo, peticiones } = montar();

    await catalogo.planes();

    // `language_code=eq.` sin valor no devolvería nada. La columna sí está
    // en el `select`: es lo que permite enseñar en qué idioma está el plan.
    expect(peticiones[0]?.urlLegible).not.toContain('language_code=eq.');
    expect(peticiones[0]?.urlLegible).toContain('language_code,');
  });

  it('sin identificadores no consulta nada', async () => {
    const { catalogo, peticiones } = montar();

    // Una lista vacía en `in.()` traería el catálogo entero.
    expect(await catalogo.planesPorId([])).toEqual([]);
    expect(peticiones).toHaveLength(0);
  });

  it('un plan que no existe devuelve null, no una ficha vacía', async () => {
    const { catalogo } = montar([{ estado: 200, cuerpo: [] }]);

    expect(await catalogo.plan('no-existe')).toBeNull();
  });

  it('un error del servidor no se convierte en catálogo vacío', async () => {
    // Un catálogo vacío se leería como «no hay planes», y la persona pensaría
    // que la aplicación no tiene nada que ofrecerle.
    const { catalogo } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(catalogo.planes()).rejects.toMatchObject({ name: 'ErrorApp' });
  });
});

describe('días de un plan', () => {
  const filaDia = (extra: Record<string, unknown> = {}) => ({
    id: 'dia-1',
    plan_id: 'plan-1',
    day_number: 1,
    title: 'No os angustiéis',
    content: 'Texto del día.',
    bible_references: [{ libro: 'MAT', capitulo: 6 }],
    reflection_questions: ['¿Qué te preocupa hoy?'],
    ...extra,
  });

  it('llegan en orden', async () => {
    const { catalogo, peticiones } = montar();

    await catalogo.dias('plan-1');

    expect(peticiones[0]?.urlLegible).toContain('order=day_number.asc');
  });

  it('las referencias se leen con su libro y capítulo', async () => {
    const { catalogo } = montar([{ estado: 200, cuerpo: [filaDia()] }]);

    expect((await catalogo.dias('plan-1'))[0]?.referencias).toEqual([
      { libro: 'MAT', capitulo: 6 },
    ]);
  });

  it('una referencia mal escrita se descarta sin tumbar el día', async () => {
    // El esquema solo obliga a que sea una lista; su interior no lo comprueba
    // nadie. Una entrada torcida en el catálogo no puede dejar sin leer a
    // quien abre ese día.
    const { catalogo } = montar([
      {
        estado: 200,
        cuerpo: [
          filaDia({
            bible_references: [
              { libro: 'MAT', capitulo: 6 },
              { libro: 'SAL' },
              'esto no es una referencia',
              null,
            ],
          }),
        ],
      },
    ]);

    const dia = (await catalogo.dias('plan-1'))[0];
    expect(dia?.referencias).toEqual([{ libro: 'MAT', capitulo: 6 }]);
    expect(dia?.titulo).toBe('No os angustiéis');
  });

  it('un jsonb que no es lista no rompe nada', async () => {
    const { catalogo } = montar([
      { estado: 200, cuerpo: [filaDia({ bible_references: { libro: 'MAT' } })] },
    ]);

    expect((await catalogo.dias('plan-1'))[0]?.referencias).toEqual([]);
  });

  it('los versículos concretos se conservan cuando están', async () => {
    const { catalogo } = montar([
      {
        estado: 200,
        cuerpo: [
          filaDia({
            bible_references: [
              { libro: 'MAT', capitulo: 6, versiculoInicial: 25, versiculoFinal: 34 },
            ],
          }),
        ],
      },
    ]);

    expect((await catalogo.dias('plan-1'))[0]?.referencias[0]).toEqual({
      libro: 'MAT',
      capitulo: 6,
      versiculoInicial: 25,
      versiculoFinal: 34,
    });
  });

  it('sin preguntas de reflexión devuelve una lista vacía', async () => {
    const { catalogo } = montar([
      { estado: 200, cuerpo: [filaDia({ reflection_questions: null })] },
    ]);

    expect((await catalogo.dias('plan-1'))[0]?.preguntas).toEqual([]);
  });

  it('una pregunta que no es texto se descarta', async () => {
    // Mismo caso que las referencias: el esquema no mira dentro del jsonb, y
    // una pregunta mal escrita en el catálogo acabaría pintada como «[object
    // Object]» delante de quien abre ese día.
    const { catalogo } = montar([
      {
        estado: 200,
        cuerpo: [
          filaDia({
            reflection_questions: ['¿Qué te preocupa hoy?', { texto: 'mal escrita' }, 42, null],
          }),
        ],
      },
    ]);

    expect((await catalogo.dias('plan-1'))[0]?.preguntas).toEqual(['¿Qué te preocupa hoy?']);
  });

  it('un título o un contenido vacíos no se enseñan como «null»', async () => {
    const { catalogo } = montar([
      { estado: 200, cuerpo: [filaDia({ title: null, content: null })] },
    ]);

    const dia = (await catalogo.dias('plan-1'))[0];
    expect(dia?.titulo).toBe('');
    expect(dia?.contenido).toBe('');
  });

  it('un autor desconocido no rompe la ficha', async () => {
    const { catalogo } = montar([
      { estado: 200, cuerpo: [filaPlan({ creator_type: 'lo-que-sea' })] },
    ]);

    expect((await catalogo.planes())[0]?.autor).toBe('qfaith');
  });
});
