// Casos límite del motor de sincronización: rechazos del servidor, lotes,
// silencios y resolución fusionada. Son los caminos que en producción
// aparecen justo cuando algo va mal, así que conviene tenerlos cubiertos.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import type { AlmacenLocal } from '@shared/database/tipos';
import {
  cifrar,
  crearClaveContenido,
  derivarClaves,
  descifrar,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, SobreCifrado, VinculoRegistro } from '@shared/services/crypto/tipos';

import { crearMotorSincronizacion } from '../motorSincronizacion';
import type { PuertoRemoto, ResultadoCambio } from '../puertoRemoto';
import { crearServidorEnMemoria } from './servidorEnMemoria';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const TIPO = 'journal_entries';

function relojIncremental() {
  let instante = 0;
  return () => {
    instante += 1;
    return new Date(instante * 1000).toISOString();
  };
}

function material(): { clave: ClaveContenido; claveHash: Uint8Array } {
  return {
    clave: crearClaveContenido('diario'),
    claveHash: derivarClaves(generarClaveMaestra()).claveHash,
  };
}

function vinculoDe(entidadId: string): VinculoRegistro {
  return { usuarioId: USUARIO, tipoEntidad: TIPO, entidadId };
}

function sobreDe(
  mat: { clave: ClaveContenido; claveHash: Uint8Array },
  entidadId: string,
  contenido: string,
): SobreCifrado {
  return cifrar({
    contenido,
    clave: mat.clave,
    claveHash: mat.claveHash,
    vinculo: vinculoDe(entidadId),
  });
}

function montar(remoto: PuertoRemoto, almacen: AlmacenLocal = crearAlmacenEnMemoria()) {
  return {
    almacen,
    motor: crearMotorSincronizacion({
      almacen,
      remoto,
      usuarioId: USUARIO,
      dispositivoId: 'movil-1',
      tamanoLote: 2,
      ahora: relojIncremental(),
    }),
  };
}

const ID = '22222222-2222-4222-8222-222222222222';

describe('rechazos del servidor', () => {
  function servidorQueRechaza(reintentable: boolean): PuertoRemoto {
    return {
      enviar: async (cambios) =>
        cambios.map<ResultadoCambio>((cambio) => ({
          estado: 'rechazado',
          id: cambio.id,
          motivo: 'prueba',
          reintentable,
        })),
      descargar: async ({ desdeRevision }) => ({ cambios: [], revisionFinal: desdeRevision }),
    };
  }

  it('un rechazo reintentable deja el registro pendiente para el siguiente intento', async () => {
    const mat = material();
    const { almacen, motor } = montar(servidorQueRechaza(true));

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'texto'),
    });
    const resumen = await motor.sincronizar();

    expect(resumen.rechazados).toBe(1);
    expect((await almacen.obtener(TIPO, ID))?.estado).toBe('pendiente');
    // Y sigue en la cola: no se ha perdido.
    expect(await almacen.pendientesDeEnvio()).toHaveLength(1);
  });

  it('un rechazo definitivo no se descarta en silencio: queda marcado', async () => {
    const mat = material();
    const { almacen, motor } = montar(servidorQueRechaza(false));

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'texto'),
    });
    await motor.sincronizar();

    expect((await almacen.obtener(TIPO, ID))?.estado).toBe('conflicto');
  });
});

describe('el servidor no se pronuncia sobre un cambio', () => {
  it('el registro queda pendiente en lugar de darse por enviado', async () => {
    const mat = material();
    const mudo: PuertoRemoto = {
      enviar: async () => [],
      descargar: async ({ desdeRevision }) => ({ cambios: [], revisionFinal: desdeRevision }),
    };
    const { almacen, motor } = montar(mudo);

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'texto'),
    });
    const resumen = await motor.sincronizar();

    expect(resumen.enviados).toBe(0);
    expect((await almacen.obtener(TIPO, ID))?.estado).toBe('pendiente');
  });
});

describe('lotes', () => {
  it('trocea la cola sin perder ningún cambio', async () => {
    const mat = material();
    const servidor = crearServidorEnMemoria();
    const { motor } = montar(servidor);

    const ids = Array.from({ length: 5 }, (_, i) => `3333333${i}-3333-4333-8333-333333333333`);
    for (const id of ids) {
      await motor.registrarCambioLocal({
        id,
        tipoEntidad: TIPO,
        sobre: sobreDe(mat, id, `texto ${id}`),
      });
    }

    const resumen = await motor.sincronizar();

    expect(resumen.enviados).toBe(5);
    expect(servidor.filas()).toHaveLength(5);
  });
});

describe('eliminación', () => {
  it('eliminar algo que no existe en local no hace nada', async () => {
    const { motor } = montar(crearServidorEnMemoria());
    expect(await motor.registrarEliminacionLocal(TIPO, 'inexistente')).toBeNull();
  });
});

describe('resolución de conflictos', () => {
  async function provocarConflicto() {
    const mat = material();
    const servidor = crearServidorEnMemoria();
    const movil = montar(servidor);
    const tablet = montar(servidor);

    await movil.motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'original'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    await movil.motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'del móvil'),
    });
    await tablet.motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'de la tablet'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    return { mat, tablet };
  }

  it('acepta una versión fusionada preparada por el módulo', async () => {
    const { mat, tablet } = await provocarConflicto();
    const [conflicto] = await tablet.motor.conflictosPendientes();

    const fusionado = sobreDe(mat, ID, 'del móvil y de la tablet');
    await tablet.motor.resolverConflicto({
      conflictoId: conflicto!.id,
      eleccion: 'fusionado',
      sobreFusionado: fusionado,
    });

    const registro = await tablet.almacen.obtener(TIPO, ID);
    expect(registro?.estado).toBe('modificado');
    expect(descifrar({ sobre: registro!.sobre, clave: mat.clave, vinculo: vinculoDe(ID) })).toBe(
      'del móvil y de la tablet',
    );
    expect(await tablet.motor.conflictosPendientes()).toHaveLength(0);
  });

  it('sin sobre fusionado se conserva la versión local, que es lo menos destructivo', async () => {
    const { mat, tablet } = await provocarConflicto();
    const [conflicto] = await tablet.motor.conflictosPendientes();

    await tablet.motor.resolverConflicto({ conflictoId: conflicto!.id, eleccion: 'fusionado' });

    const registro = await tablet.almacen.obtener(TIPO, ID);
    expect(descifrar({ sobre: registro!.sobre, clave: mat.clave, vinculo: vinculoDe(ID) })).toBe(
      'de la tablet',
    );
  });

  it('resolver un conflicto que ya no existe no rompe nada', async () => {
    const { tablet } = await provocarConflicto();
    await expect(
      tablet.motor.resolverConflicto({ conflictoId: 'inexistente', eleccion: 'conservar_local' }),
    ).resolves.toBeUndefined();
  });

  it('si el registro desapareció, el conflicto se descarta', async () => {
    const { tablet } = await provocarConflicto();
    const [conflicto] = await tablet.motor.conflictosPendientes();

    await tablet.almacen.vaciar();
    await tablet.almacen.guardarConflicto(conflicto!);

    await tablet.motor.resolverConflicto({
      conflictoId: conflicto!.id,
      eleccion: 'conservar_local',
    });

    expect(await tablet.motor.conflictosPendientes()).toHaveLength(0);
  });
});

describe('lo que baja del servidor no pisa lo que aún no ha subido', () => {
  // El invariante 5 tiene dos caras y esta es la que faltaba. La otra —el
  // servidor rechaza nuestro envío por conflicto— sí estaba cubierta; esta,
  // que es la peligrosa, no lo estaba: aquí nadie rechaza nada, el cambio
  // llega y **se guarda encima** si no hay quien lo pare.
  //
  // La historia es esta. Alguien escribe en su diario en un avión, sin
  // conexión. Esa misma entrada la había editado por la mañana desde la
  // tableta. Al aterrizar, la aplicación sincroniza y baja la versión de la
  // tableta. Sin esta guarda, lo que escribió en el avión desaparece: no hay
  // aviso, no hay conflicto, no hay forma de recuperarlo.

  /** Un cambio remoto sobre `ID`, listo para bajar. */
  const remotoQueEnvia = (sobre: SobreCifrado): PuertoRemoto => ({
    enviar: async () => [],
    descargar: async () => ({
      cambios: [
        {
          id: ID,
          tipoEntidad: TIPO,
          operacion: 'update',
          revision: 9,
          version: 5,
          sobre,
          metadatos: {},
          eliminadoEn: null,
        },
      ],
      revisionFinal: 9,
    }),
  });

  it('se marca conflicto en vez de sobrescribir', async () => {
    const mat = material();
    const enElAvion = sobreDe(mat, ID, 'Lo que escribí sin conexión.');
    const enLaTableta = sobreDe(mat, ID, 'Lo que escribí por la mañana.');
    const almacen = crearAlmacenEnMemoria();
    const { motor } = montar(remotoQueEnvia(enLaTableta), almacen);

    // Escrito en local y todavía sin enviar.
    await motor.registrarCambioLocal({ id: ID, tipoEntidad: TIPO, sobre: enElAvion });

    const resumen = await motor.sincronizar();

    expect(resumen.conflictos).toBe(1);
    expect(resumen.recibidos).toBe(0);
    expect((await almacen.obtener(TIPO, ID))?.estado).toBe('conflicto');
  });

  it('y lo escrito sin conexión sigue estando, entero', async () => {
    // La comprobación que de verdad importa: no que el estado diga
    // «conflicto», sino que el texto siga ahí y se pueda leer.
    const mat = material();
    const EN_EL_AVION = 'Lo que escribí sin conexión.';
    const almacen = crearAlmacenEnMemoria();
    const { motor } = montar(
      remotoQueEnvia(sobreDe(mat, ID, 'Lo que escribí por la mañana.')),
      almacen,
    );

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, EN_EL_AVION),
    });
    await motor.sincronizar();

    const registro = await almacen.obtener(TIPO, ID);
    if (registro === null) throw new Error('el registro desapareció');
    expect(descifrar({ sobre: registro.sobre, clave: mat.clave, vinculo: vinculoDe(ID) })).toBe(
      EN_EL_AVION,
    );
  });

  it('y la versión de la tableta tampoco se pierde: se guarda para elegir', async () => {
    // Conservar las dos es lo que permite que la persona decida. Quedarse
    // solo con la local sería el mismo error al revés.
    const mat = material();
    const EN_LA_TABLETA = 'Lo que escribí por la mañana.';
    const almacen = crearAlmacenEnMemoria();
    const { motor } = montar(remotoQueEnvia(sobreDe(mat, ID, EN_LA_TABLETA)), almacen);

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'Lo que escribí sin conexión.'),
    });
    await motor.sincronizar();

    const conflicto = (await motor.conflictosPendientes())[0];
    if (conflicto === undefined) throw new Error('no se guardó el conflicto');
    expect(
      descifrar({ sobre: conflicto.sobreRemoto, clave: mat.clave, vinculo: vinculoDe(ID) }),
    ).toBe(EN_LA_TABLETA);
  });

  it('si no hay nada sin enviar, el cambio entrante sí se aplica', async () => {
    // El otro lado de la regla, y hace falta: una guarda que marcara
    // conflicto siempre dejaría la sincronización sin servir para nada, y
    // esta prueba fallaría en cuanto alguien la escribiera así.
    const mat = material();
    const DEL_SERVIDOR = 'Lo que llega del otro dispositivo.';
    const almacen = crearAlmacenEnMemoria();
    const { motor } = montar(remotoQueEnvia(sobreDe(mat, ID, DEL_SERVIDOR)), almacen);

    const resumen = await motor.sincronizar();

    expect(resumen.conflictos).toBe(0);
    expect(resumen.recibidos).toBe(1);
    const registro = await almacen.obtener(TIPO, ID);
    if (registro === null) throw new Error('el cambio entrante no se guardó');
    expect(registro.estado).toBe('sincronizado');
    expect(descifrar({ sobre: registro.sobre, clave: mat.clave, vinculo: vinculoDe(ID) })).toBe(
      DEL_SERVIDOR,
    );
  });
});

describe('descarga de cambios', () => {
  it('un cambio ya conocido no se vuelve a aplicar', async () => {
    const mat = material();
    const servidor = crearServidorEnMemoria();
    const { almacen, motor } = montar(servidor);

    await motor.registrarCambioLocal({
      id: ID,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'texto'),
    });
    await motor.sincronizar();
    const registro = await almacen.obtener(TIPO, ID);

    // Se rebobina el cursor **de verdad**. Antes esto lo decía un comentario
    // y no lo hacía nadie: la segunda vuelta no descargaba nada, así que la
    // prueba pasaba sin llegar a ejercitar la guarda que dice comprobar.
    await almacen.escribirCursorSincronizacion(0);
    const segunda = await motor.sincronizar();

    expect(segunda.recibidos).toBe(0);
    expect((await almacen.obtener(TIPO, ID))?.version).toBe(registro?.version);
    expect((await almacen.obtener(TIPO, ID))?.actualizadoEn).toBe(registro?.actualizadoEn);
  });

  it('la revisión que ya tenemos se descarta, no solo las anteriores', async () => {
    // La comparación es «mayor o igual». Con «mayor» a secas, el cambio con
    // la misma revisión que ya guardamos se vuelve a aplicar, y con él se
    // pisa el registro local: es un fallo de uno con pérdida de datos detrás.
    const mat = material();
    const sobreRemoto = sobreDe(mat, ID, 'lo que hay en el servidor');
    const remoto: PuertoRemoto = {
      enviar: async () => [],
      descargar: async () => ({
        cambios: [
          {
            id: ID,
            tipoEntidad: TIPO,
            operacion: 'update',
            revision: 5,
            version: 9,
            sobre: sobreRemoto,
            metadatos: {},
            eliminadoEn: null,
          },
        ],
        revisionFinal: 5,
      }),
    };
    const almacen = crearAlmacenEnMemoria();
    const { motor } = montar(remoto, almacen);

    // Ya conocemos exactamente esa revisión.
    await almacen.guardar({
      id: ID,
      usuarioId: USUARIO,
      tipoEntidad: TIPO,
      sobre: sobreDe(mat, ID, 'lo que ya teníamos'),
      metadatos: {},
      version: 4,
      revisionRemota: 5,
      estado: 'sincronizado',
      creadoEn: '2026-01-01T00:00:00.000Z',
      actualizadoEn: '2026-01-01T00:00:00.000Z',
      eliminadoEn: null,
      dispositivoId: 'movil-1',
    });

    const resumen = await motor.sincronizar();

    expect(resumen.recibidos).toBe(0);
    expect((await almacen.obtener(TIPO, ID))?.version).toBe(4);
  });

  it('el cursor avanza, o cada sincronización se descargaría entera', async () => {
    // Sin avanzar, la aplicación vuelve a bajar todo el historial en cada
    // vuelta: en una cuenta de años eso es la batería y los datos de alguien.
    const remoto: PuertoRemoto = {
      enviar: async () => [],
      descargar: async () => ({ cambios: [], revisionFinal: 42 }),
    };
    const { almacen, motor } = montar(remoto);

    const resumen = await motor.sincronizar();

    expect(await almacen.leerCursorSincronizacion()).toBe(42);
    expect(resumen.revisionFinal).toBe(42);
  });

  it('un borrado remoto de algo que no tenemos en local se ignora', async () => {
    const remoto: PuertoRemoto = {
      enviar: async () => [],
      descargar: async () => ({
        cambios: [
          {
            id: 'desconocido',
            tipoEntidad: TIPO,
            operacion: 'delete',
            revision: 5,
            version: 2,
            sobre: null,
            metadatos: {},
            eliminadoEn: new Date(0).toISOString(),
          },
        ],
        revisionFinal: 5,
      }),
    };
    const { almacen, motor } = montar(remoto);

    const resumen = await motor.sincronizar();

    expect(resumen.recibidos).toBe(0);
    expect(await almacen.listar(TIPO, { incluirEliminados: true })).toHaveLength(0);
  });

  it('un cambio sin sobre y sin borrado se ignora en lugar de crear una fila vacía', async () => {
    const remoto: PuertoRemoto = {
      enviar: async () => [],
      descargar: async () => ({
        cambios: [
          {
            id: ID,
            tipoEntidad: TIPO,
            operacion: 'update',
            revision: 7,
            version: 3,
            sobre: null,
            metadatos: {},
            eliminadoEn: null,
          },
        ],
        revisionFinal: 7,
      }),
    };
    const { almacen, motor } = montar(remoto);

    await motor.sincronizar();

    expect(await almacen.obtener(TIPO, ID)).toBeNull();
  });
});
