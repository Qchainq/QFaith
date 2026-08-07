// Subrayados y marcadores, con el motor y el cifrado reales.
//
// Aquí hay una frontera de privacidad que conviene ver comprobada por los dos
// lados: **el servidor sabe qué pasajes te interesan y no sabe qué piensas de
// ellos.** La referencia va en claro —hace falta para pintar un capítulo sin
// descifrarlo todo— y lo que escribes al subrayar, no.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  cifrar,
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { subrayadosDe } from '../models/biblia';
import {
  crearRepositorioMarcasBiblicas,
  TIPO_MARCADOR,
  TIPO_SUBRAYADO,
} from '../repositories/repositorioMarcasBiblicas';

const USUARIO = 'usuario-1';
const TRADUCCION = 'traduccion-1';
const NOTA = 'Esto lo leí la noche que murió mi madre.';

const salmo = (extra: Record<string, unknown> = {}) => ({
  traduccionId: TRADUCCION,
  libro: 'SAL',
  capitulo: 88,
  versiculoInicio: 3,
  versiculoFin: 5,
  estilo: 'amarillo' as const,
  ...extra,
});

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('notaBiblica');

  // Reloj controlado. Sin él, dos marcas creadas en el mismo milisegundo
  // empatan al ordenar y la prueba pasaría con cualquier orden: el clásico
  // verde que no comprueba nada.
  let tic = 0;
  const ahora = (): string => new Date(Date.UTC(2026, 7, 1) + tic++ * 1000).toISOString();

  const motor = crearMotorSincronizacion({
    almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
    ahora,
  });

  return {
    almacen,
    motor,
    clave,
    hash: derivadas.claveHash,
    repositorio: crearRepositorioMarcasBiblicas({
      almacen,
      usuarioId: USUARIO,
      motor,
      claveNotas: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

describe('la frontera de lo que el servidor ve', () => {
  it('la nota del subrayado no llega en claro al almacén', async () => {
    const { repositorio, almacen } = montar();

    await repositorio.subrayar(salmo({ nota: NOTA }));

    const registros = await almacen.listar(TIPO_SUBRAYADO);
    expect(JSON.stringify(registros)).not.toContain(NOTA);
    expect(JSON.stringify(registros)).not.toContain('mi madre');
  });

  it('la referencia sí queda en claro, y es a propósito', async () => {
    // Sin ella habría que descifrar todos los subrayados de una persona para
    // pintar un capítulo. Es un compromiso consciente, no un descuido, y
    // conviene que esté escrito en una prueba y no solo en un comentario.
    const { repositorio, almacen } = montar();

    await repositorio.subrayar(salmo({ nota: NOTA }));

    const metadatos = (await almacen.listar(TIPO_SUBRAYADO))[0]?.metadatos;
    expect(metadatos).toMatchObject({
      book_code: 'SAL',
      chapter_number: 88,
      verse_start: 3,
      verse_end: 5,
      highlight_style: 'amarillo',
    });
  });

  it('la nota se vuelve a leer descifrada', async () => {
    const { repositorio } = montar();

    const subrayado = await repositorio.subrayar(salmo({ nota: NOTA }));

    expect(subrayado.nota).toBe(NOTA);
  });
});

describe('subrayar', () => {
  it('un pasaje sin nota es lo normal y no es un error', async () => {
    const { repositorio } = montar();

    const subrayado = await repositorio.subrayar(salmo());

    expect(subrayado.nota).toBe('');
    expect(subrayado.estilo).toBe('amarillo');
  });

  it('seleccionar de abajo arriba marca el mismo trozo', async () => {
    // Arrastrar del versículo 8 al 3 es tan normal como al revés, y el esquema
    // exige que el final no sea menor que el principio. Sin corregirlo, la
    // persona vería un error que no entendería.
    const { repositorio } = montar();

    const subrayado = await repositorio.subrayar(salmo({ versiculoInicio: 8, versiculoFin: 3 }));

    expect(subrayado.versiculoInicio).toBe(3);
    expect(subrayado.versiculoFin).toBe(8);
  });

  it('el mismo pasaje con el mismo color dos veces es un solo subrayado', async () => {
    const { repositorio, almacen } = montar();

    const primero = await repositorio.subrayar(salmo());
    const segundo = await repositorio.subrayar(salmo());

    // El esquema lo prohíbe con un índice único: sin reconocerlo aquí, el
    // segundo solo reventaría al sincronizar.
    expect(segundo.id).toBe(primero.id);
    expect(await almacen.listar(TIPO_SUBRAYADO)).toHaveLength(1);
  });

  it('volver a subrayarlo no borra lo que había escrito', async () => {
    // Es un gesto que se hace sin pensar; perder por él una nota sería una
    // pérdida silenciosa (invariante 5).
    const { repositorio } = montar();

    await repositorio.subrayar(salmo({ nota: NOTA }));
    const segundo = await repositorio.subrayar(salmo());

    expect(segundo.nota).toBe(NOTA);
  });

  it('pero escribir algo nuevo sí lo cambia', async () => {
    const { repositorio } = montar();

    await repositorio.subrayar(salmo({ nota: NOTA }));
    const segundo = await repositorio.subrayar(salmo({ nota: 'Lo entendí de otra forma.' }));

    expect(segundo.nota).toBe('Lo entendí de otra forma.');
  });

  it('el mismo pasaje con otro color son dos subrayados', async () => {
    const { repositorio } = montar();

    await repositorio.subrayar(salmo());
    await repositorio.subrayar(salmo({ estilo: 'azul' }));

    // Son dos rotuladores distintos sobre el mismo papel.
    expect(
      await repositorio.delCapitulo({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 }),
    ).toHaveLength(2);
  });

  it('los que se solapan no se funden', async () => {
    const { repositorio } = montar();

    await repositorio.subrayar(salmo({ versiculoInicio: 3, versiculoFin: 5 }));
    await repositorio.subrayar(salmo({ versiculoInicio: 4, versiculoFin: 6, estilo: 'verde' }));

    // Fundirlos en un 3-6 cambiaría lo que marcó y se llevaría la nota de uno
    // de los dos.
    const delCapitulo = await repositorio.delCapitulo({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });
    expect(delCapitulo.map((s) => [s.versiculoInicio, s.versiculoFin])).toEqual([
      [3, 5],
      [4, 6],
    ]);
  });
});

describe('leer un capítulo', () => {
  it('solo trae los de ese capítulo y esa traducción', async () => {
    const { repositorio, almacen } = montar();

    // Mismo pasaje y mismo color en cuatro sitios distintos, que es el caso
    // que de verdad separa un filtro correcto de uno que ignora un campo.
    const enSalmo88 = await repositorio.subrayar(salmo());
    const enSalmo89 = await repositorio.subrayar(salmo({ capitulo: 89 }));
    const enJob = await repositorio.subrayar(salmo({ libro: 'JOB' }));
    const enOtraTraduccion = await repositorio.subrayar(salmo({ traduccionId: 'otra' }));

    // Cuatro marcas distintas, no una reutilizada. Comprobarlo importa porque
    // `subrayar` busca el duplicado con este mismo filtro: si el filtro
    // ignorara un campo, marcar Job 88 **reutilizaría** el subrayado del
    // Salmo 88 en lugar de crear el suyo, y entonces contar lo que devuelve
    // el capítulo seguiría dando uno. El fallo no sería una lista mal
    // filtrada: sería una marca de la persona que se pierde.
    expect(new Set([enSalmo88.id, enSalmo89.id, enJob.id, enOtraTraduccion.id]).size).toBe(4);
    expect(await almacen.listar(TIPO_SUBRAYADO)).toHaveLength(4);

    // La traducción importa: el versículo 3 de un capítulo no cae en el mismo
    // sitio en dos traducciones distintas.
    const de = async (p: { traduccionId?: string; libro?: string; capitulo?: number }) =>
      repositorio.delCapitulo({
        traduccionId: p.traduccionId ?? TRADUCCION,
        libro: p.libro ?? 'SAL',
        capitulo: p.capitulo ?? 88,
      });

    expect((await de({})).map((s) => s.id)).toEqual([enSalmo88.id]);
    expect((await de({ capitulo: 89 })).map((s) => s.id)).toEqual([enSalmo89.id]);
    expect((await de({ libro: 'JOB' })).map((s) => s.id)).toEqual([enJob.id]);
    expect((await de({ traduccionId: 'otra' })).map((s) => s.id)).toEqual([enOtraTraduccion.id]);
  });

  it('llegan del más antiguo al más reciente, para pintarlos superpuestos', async () => {
    const { repositorio } = montar();

    const primero = await repositorio.subrayar(salmo());
    const segundo = await repositorio.subrayar(salmo({ estilo: 'verde' }));

    // Lo último que marcó queda encima, como con dos rotuladores sobre papel.
    const delCapitulo = await repositorio.delCapitulo({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });
    expect(delCapitulo.map((s) => s.id)).toEqual([primero.id, segundo.id]);
  });

  it('un versículo puede llevar varios subrayados encima', async () => {
    const { repositorio } = montar();

    await repositorio.subrayar(salmo({ versiculoInicio: 3, versiculoFin: 5 }));
    await repositorio.subrayar(salmo({ versiculoInicio: 4, versiculoFin: 6, estilo: 'verde' }));
    const delCapitulo = await repositorio.delCapitulo({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });

    expect(subrayadosDe(delCapitulo, 4)).toHaveLength(2);
    expect(subrayadosDe(delCapitulo, 3)).toHaveLength(1);
    expect(subrayadosDe(delCapitulo, 9)).toHaveLength(0);
  });

  it('no descifra los subrayados de otros capítulos', async () => {
    // La referencia va en claro justamente para esto, y así lo dice la
    // cabecera del repositorio. Escrito al revés —descifrar todo y luego
    // filtrar— la pantalla daba el mismo resultado y costaba tanto como
    // subrayados tuviera la persona en la Biblia entera: unos 375 ms con tres
    // mil, en un servidor. Contando las veces que se pide la clave se ve la
    // diferencia, que en el resultado no se ve.
    const montado = montar();
    let vecesQueSePidioLaClave = 0;
    const repositorio = crearRepositorioMarcasBiblicas({
      almacen: montado.almacen,
      usuarioId: USUARIO,
      motor: montado.motor,
      claveNotas: () => {
        vecesQueSePidioLaClave += 1;
        return montado.clave;
      },
      claveHash: () => montado.hash,
    });

    await repositorio.subrayar(salmo({ nota: NOTA }));
    for (let capitulo = 89; capitulo < 99; capitulo += 1) {
      await repositorio.subrayar(salmo({ capitulo, nota: NOTA }));
    }

    vecesQueSePidioLaClave = 0;
    await repositorio.delCapitulo({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 });

    expect(vecesQueSePidioLaClave).toBe(1);
  });
});

describe('quitar un subrayado', () => {
  it('desaparece del capítulo', async () => {
    const { repositorio } = montar();
    const subrayado = await repositorio.subrayar(salmo());

    await repositorio.quitarSubrayado(subrayado.id);

    expect(
      await repositorio.delCapitulo({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 }),
    ).toHaveLength(0);
    expect(await repositorio.subrayado(subrayado.id)).toBeNull();
  });

  it('el sitio queda libre para volver a subrayarlo', async () => {
    const { repositorio } = montar();
    const primero = await repositorio.subrayar(salmo({ nota: NOTA }));
    await repositorio.quitarSubrayado(primero.id);

    const segundo = await repositorio.subrayar(salmo());

    // Es un subrayado nuevo, no el de antes resucitado: lo que se quitó está
    // en la papelera y no debe volver por la puerta de atrás.
    expect(segundo.id).not.toBe(primero.id);
    expect(segundo.nota).toBe('');
  });
});

describe('marcadores', () => {
  it('se marca un capítulo sin versículo', async () => {
    const { repositorio } = montar();

    const marcador = await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });

    expect(marcador.versiculo).toBeNull();
  });

  it('no lleva nada cifrado dentro porque no hay nada que escribir', async () => {
    const { repositorio, almacen } = montar();

    await repositorio.marcar({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 });

    const registro = (await almacen.listar(TIPO_MARCADOR))[0];
    expect(registro?.metadatos).toMatchObject({ book_code: 'SAL', chapter_number: 88 });
  });

  it('marcar dos veces el mismo sitio es marcarlo una', async () => {
    const { repositorio } = montar();

    const primero = await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });
    const segundo = await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });

    expect(segundo.id).toBe(primero.id);
    expect(await repositorio.marcadores()).toHaveLength(1);
  });

  it('el capítulo entero y un versículo suyo son sitios distintos', async () => {
    // «Dejé de leer en Salmos 88» y «quiero volver al 88:14» son dos cosas.
    const { repositorio } = montar();

    await repositorio.marcar({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 });
    await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
      versiculo: 14,
    });

    expect(await repositorio.marcadores()).toHaveLength(2);
  });

  it('el último sitio marcado va primero', async () => {
    const { repositorio } = montar();

    await repositorio.marcar({ traduccionId: TRADUCCION, libro: 'SAL', capitulo: 88 });
    const ultimo = await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'JOB',
      capitulo: 3,
    });

    // Es a donde querrá volver.
    expect((await repositorio.marcadores())[0]?.id).toBe(ultimo.id);
  });

  it('quitarlo lo saca de la lista', async () => {
    const { repositorio } = montar();
    const marcador = await repositorio.marcar({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });

    await repositorio.quitarMarcador(marcador.id);

    expect(await repositorio.marcadores()).toHaveLength(0);
  });
});

describe('repasar lo subrayado', () => {
  it('llegan todos, del más reciente al más antiguo', async () => {
    const { repositorio } = montar();

    await repositorio.subrayar(salmo());
    const ultimo = await repositorio.subrayar(salmo({ libro: 'JOB', capitulo: 3 }));

    expect((await repositorio.todosLosSubrayados())[0]?.id).toBe(ultimo.id);
    expect(await repositorio.todosLosSubrayados()).toHaveLength(2);
  });
});

describe('lo que llega de otra versión de la aplicación', () => {
  it('un estilo desconocido no hace desaparecer el subrayado', async () => {
    // Si una versión posterior añade un color y la persona lo usa en su
    // teléfono nuevo, el viejo lo recibe al sincronizar. Descartarlo haría
    // desaparecer de la pantalla algo que ella marcó, sin aviso.
    const { repositorio, almacen, motor, clave, hash } = montar();
    const id = 'subrayado-del-futuro';

    await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_SUBRAYADO,
      sobre: cifrar({
        contenido: JSON.stringify({ nota: '' }),
        clave,
        claveHash: hash,
        vinculo: { usuarioId: USUARIO, tipoEntidad: TIPO_SUBRAYADO, entidadId: id },
      }),
      metadatos: {
        translation_id: TRADUCCION,
        book_code: 'SAL',
        chapter_number: 88,
        verse_start: 3,
        verse_end: 5,
        highlight_style: 'morado',
      },
    });

    const delCapitulo = await repositorio.delCapitulo({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });

    expect(delCapitulo).toHaveLength(1);
    // Feo pero honesto: la marca sigue estando.
    expect(delCapitulo[0]?.estilo).toBe('subrayado');
    expect(await almacen.listar(TIPO_SUBRAYADO)).toHaveLength(1);
  });
});

describe('dos subrayados del mismo color en un capítulo', () => {
  it('en versículos distintos son dos, no uno', async () => {
    // Es lo que hace cualquiera al subrayar dos versículos sueltos de un
    // salmo con el mismo rotulador.
    const { repositorio } = montar();

    await repositorio.subrayar(salmo({ versiculoInicio: 3, versiculoFin: 5 }));
    await repositorio.subrayar(salmo({ versiculoInicio: 10, versiculoFin: 12 }));

    const delCapitulo = await repositorio.delCapitulo({
      traduccionId: TRADUCCION,
      libro: 'SAL',
      capitulo: 88,
    });
    expect(delCapitulo).toHaveLength(2);
  });
});
