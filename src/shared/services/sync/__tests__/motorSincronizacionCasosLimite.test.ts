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

    // Se rebobina el cursor: el servidor devolverá cambios ya vistos.
    const registro = await almacen.obtener(TIPO, ID);
    const segunda = await motor.sincronizar();

    expect(segunda.recibidos).toBe(0);
    expect((await almacen.obtener(TIPO, ID))?.version).toBe(registro?.version);
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
