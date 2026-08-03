// Implementación de `PuertoRemoto` contra Supabase.
//
// El motor de sincronización no sabe que Supabase existe: habla con la
// interfaz. Todo lo que este archivo hace es traducir entre el modelo del
// motor y las filas de PostgREST, y garantizar dos cosas que el motor da por
// supuestas:
//
//   · El control de concurrencia optimista. Cada escritura lleva el filtro
//     `version=eq.<versión sobre la que se basó>`. Si otro dispositivo
//     escribió primero, la fila ya no coincide, PostgREST devuelve cero
//     filas y aquí se convierte en conflicto. Sin ese filtro, el último en
//     escribir borraría el trabajo del otro sin que nadie se enterara
//     (invariante 5).
//
//   · La idempotencia. Reenviar un cambio cuya respuesta se perdió no debe
//     duplicar nada ni marcar un conflicto falso. Antes de dar por perdida
//     una escritura se comprueba si en realidad ya había llegado.
import type { Metadatos, OperacionSincronizacion, ValorMetadato } from '@shared/database/tipos';
import type { SobreCifrado } from '@shared/services/crypto/tipos';
import type {
  CambioEntrante,
  CambioSaliente,
  PuertoRemoto,
  ResultadoCambio,
} from '@shared/services/sync/puertoRemoto';

import { crearClienteRest, type OpcionesRest } from './rest';

/**
 * Qué tabla respalda cada tipo de entidad y qué columnas suyas son metadatos
 * en claro.
 *
 * Los metadatos son lo único que el servidor puede leer: sirven para ordenar
 * y filtrar sin descifrar. Todo lo demás viaja dentro de `encrypted_payload`.
 * Añadir una entidad en la Fase 2 es añadir una entrada aquí.
 */
interface MapeoEntidad {
  readonly tabla: string;
  readonly columnasMetadatos: readonly string[];
}

export const MAPEO_ENTIDADES: Readonly<Record<string, MapeoEntidad>> = {
  journal_entries: {
    tabla: 'journal_entries',
    columnasMetadatos: ['entry_type', 'entry_date', 'is_favorite', 'is_ark_protected'],
  },
  prayers: {
    tabla: 'prayers',
    columnasMetadatos: [
      'status',
      'visibility',
      'category_code',
      'reminder_enabled',
      'next_reminder_at',
      'answered_at',
      'archived_at',
    ],
  },
  prayer_updates: {
    tabla: 'prayer_updates',
    // La petición a la que pertenece es lo único que el servidor necesita
    // saber: el texto del avance va dentro del sobre.
    columnasMetadatos: ['prayer_id'],
  },
  habits: {
    tabla: 'habits',
    columnasMetadatos: [
      'category_code',
      'frequency',
      'schedule_config',
      'start_date',
      'end_date',
      'reminder_enabled',
      'reminder_time',
      'is_active',
      'sort_order',
    ],
  },
  habit_logs: {
    tabla: 'habit_logs',
    columnasMetadatos: ['habit_id', 'completion_date', 'completed', 'completed_at'],
  },
  life_library_items: {
    tabla: 'life_library_items',
    // Solo la referencia al registro de origen. De qué trata va cifrado.
    columnasMetadatos: ['source_type', 'source_id', 'occurred_at', 'is_favorite'],
  },
  bible_notes: {
    tabla: 'bible_notes',
    // La referencia queda en claro para poder mostrar la nota junto a su
    // pasaje sin descargar y descifrar todas las notas de la persona.
    columnasMetadatos: [
      'translation_id',
      'book_code',
      'chapter_number',
      'verse_start',
      'verse_end',
    ],
  },
};

const COLUMNAS_COMUNES = [
  'id',
  'user_id',
  'version',
  'sync_revision',
  'deleted_at',
  'last_modified_device_id',
  'encrypted_payload',
  'encryption_version',
  'key_id',
  'nonce',
  'content_hash',
] as const;

interface FilaRemota {
  readonly id: string;
  readonly version: number;
  readonly sync_revision: number;
  readonly deleted_at: string | null;
  readonly encrypted_payload: string;
  readonly encryption_version: number;
  readonly key_id: string;
  readonly nonce: string;
  readonly content_hash: string | null;
  readonly [columna: string]: ValorMetadato | undefined;
}

function mapeoDe(tipoEntidad: string): MapeoEntidad {
  const mapeo = MAPEO_ENTIDADES[tipoEntidad];
  if (mapeo === undefined) {
    throw new Error(`Tipo de entidad sin mapeo: ${tipoEntidad}`);
  }
  return mapeo;
}

const seleccion = (mapeo: MapeoEntidad): string =>
  [...COLUMNAS_COMUNES, ...mapeo.columnasMetadatos].join(',');

function sobreDe(fila: FilaRemota): SobreCifrado {
  return {
    encryptedPayload: fila.encrypted_payload,
    encryptionVersion: fila.encryption_version,
    keyId: fila.key_id,
    nonce: fila.nonce,
    contentHash: fila.content_hash ?? '',
  };
}

function metadatosDe(fila: FilaRemota, mapeo: MapeoEntidad): Metadatos {
  const metadatos: Record<string, ValorMetadato> = {};
  for (const columna of mapeo.columnasMetadatos) {
    const valor = fila[columna];
    if (valor !== undefined) {
      metadatos[columna] = valor;
    }
  }
  return metadatos;
}

function cambioEntranteDe(fila: FilaRemota, tipoEntidad: string): CambioEntrante {
  const mapeo = mapeoDe(tipoEntidad);
  // El borrado es siempre lógico: una fila con `deleted_at` es una baja que
  // los demás dispositivos deben retirar de su vista.
  const operacion: OperacionSincronizacion = fila.deleted_at !== null ? 'delete' : 'update';
  return {
    id: fila.id,
    tipoEntidad,
    operacion,
    revision: fila.sync_revision,
    version: fila.version,
    sobre: sobreDe(fila),
    metadatos: metadatosDe(fila, mapeo),
    eliminadoEn: fila.deleted_at,
  };
}

export interface OpcionesPuertoSupabase extends OpcionesRest {
  readonly usuarioId: string;
  /** Inyectable para que las pruebas no dependan del reloj real. */
  readonly ahora?: () => string;
}

export function crearPuertoRemotoSupabase(opciones: OpcionesPuertoSupabase): PuertoRemoto {
  const rest = crearClienteRest(opciones);
  const ahora = opciones.ahora ?? (() => new Date().toISOString());

  function filaDe(cambio: CambioSaliente): Record<string, ValorMetadato> {
    const mapeo = mapeoDe(cambio.tipoEntidad);
    const fila: Record<string, ValorMetadato> = {
      id: cambio.id,
      user_id: opciones.usuarioId,
      encrypted_payload: cambio.sobre.encryptedPayload,
      encryption_version: cambio.sobre.encryptionVersion,
      key_id: cambio.sobre.keyId,
      nonce: cambio.sobre.nonce,
      content_hash: cambio.sobre.contentHash,
      last_modified_device_id: cambio.dispositivoId,
    };
    for (const columna of mapeo.columnasMetadatos) {
      const valor = cambio.metadatos[columna];
      if (valor !== undefined) {
        fila[columna] = valor;
      }
    }
    return fila;
  }

  async function leerRemota(tipoEntidad: string, id: string): Promise<FilaRemota | null> {
    const mapeo = mapeoDe(tipoEntidad);
    const respuesta = await rest.peticion<FilaRemota>({
      metodo: 'GET',
      ruta: `/${mapeo.tabla}?id=eq.${encodeURIComponent(id)}&select=${seleccion(mapeo)}`,
    });
    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, `leer:${mapeo.tabla}`);
    }
    return respuesta.filas[0] ?? null;
  }

  /**
   * Decide qué hacer cuando una escritura no afectó a ninguna fila.
   *
   * Puede ser un conflicto real o el reenvío de algo que ya llegó: si la
   * respuesta se perdió, el motor lo reintenta y la fila remota ya trae
   * nuestro cambio. Distinguirlos importa, porque marcar un conflicto falso
   * obliga al usuario a resolver algo que nunca ocurrió.
   */
  async function desenlaceSinFilas(cambio: CambioSaliente): Promise<ResultadoCambio> {
    const remota = await leerRemota(cambio.tipoEntidad, cambio.id);

    if (remota === null) {
      // Nada que actualizar: la creación nunca llegó o la fila no es
      // alcanzable para este usuario. No tiene sentido reintentarlo igual.
      return {
        estado: 'rechazado',
        id: cambio.id,
        motivo: 'ausente',
        reintentable: false,
      };
    }

    const yaEsNuestro =
      remota.version === cambio.versionBase + 1 &&
      remota.content_hash === cambio.sobre.contentHash &&
      (cambio.operacion === 'delete') === (remota.deleted_at !== null);

    if (yaEsNuestro) {
      return {
        estado: 'aceptado',
        id: cambio.id,
        revision: remota.sync_revision,
        version: remota.version,
      };
    }

    return {
      estado: 'conflicto',
      id: cambio.id,
      versionRemota: remota.version,
      sobreRemoto: sobreDe(remota),
      metadatosRemotos: metadatosDe(remota, mapeoDe(cambio.tipoEntidad)),
    };
  }

  async function aplicar(cambio: CambioSaliente): Promise<ResultadoCambio> {
    const mapeo = mapeoDe(cambio.tipoEntidad);

    if (cambio.operacion === 'create') {
      const respuesta = await rest.peticion<FilaRemota>({
        metodo: 'POST',
        ruta: `/${mapeo.tabla}?select=${seleccion(mapeo)}`,
        cuerpo: filaDe(cambio),
        prefer: 'return=representation',
      });

      // 23505 es clave duplicada: la fila ya existe. Casi siempre es el
      // reenvío de una creación cuya respuesta se perdió.
      if (respuesta.codigo === '23505' || respuesta.estado === 409) {
        return desenlaceSinFilas(cambio);
      }
      if (respuesta.estado >= 400) {
        throw rest.comoError(respuesta, `crear:${mapeo.tabla}`);
      }

      const fila = respuesta.filas[0];
      if (fila === undefined) {
        return desenlaceSinFilas(cambio);
      }
      return {
        estado: 'aceptado',
        id: cambio.id,
        revision: fila.sync_revision,
        version: fila.version,
      };
    }

    // Actualización y borrado comparten camino: los dos son un PATCH con el
    // filtro de versión. El borrado solo añade la marca temporal.
    const cuerpo = filaDe(cambio);
    // `id` y `user_id` no se reescriben: van en el filtro y en las políticas.
    delete cuerpo.id;
    delete cuerpo.user_id;
    if (cambio.operacion === 'delete') {
      cuerpo.deleted_at = ahora();
    }

    const respuesta = await rest.peticion<FilaRemota>({
      metodo: 'PATCH',
      ruta:
        `/${mapeo.tabla}?id=eq.${encodeURIComponent(cambio.id)}` +
        `&version=eq.${cambio.versionBase}&select=${seleccion(mapeo)}`,
      cuerpo,
      prefer: 'return=representation',
    });

    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, `actualizar:${mapeo.tabla}`);
    }

    const fila = respuesta.filas[0];
    if (fila === undefined) {
      return desenlaceSinFilas(cambio);
    }
    return {
      estado: 'aceptado',
      id: cambio.id,
      revision: fila.sync_revision,
      version: fila.version,
    };
  }

  return {
    async enviar(cambios) {
      // En serie y en el orden que da el motor: eliminar, actualizar, crear.
      // En paralelo, dos cambios de la misma entidad podrían aplicarse al
      // revés y resucitar algo que el usuario había borrado.
      const resultados: ResultadoCambio[] = [];
      for (const cambio of cambios) {
        resultados.push(await aplicar(cambio));
      }
      return resultados;
    },

    async descargar({ desdeRevision, limite }) {
      // Se pide `limite` de cada tabla y luego se recorta la unión. Como cada
      // consulta trae las revisiones más bajas de su tabla, el prefijo global
      // más bajo está necesariamente dentro de lo descargado.
      const porTabla = await Promise.all(
        Object.entries(MAPEO_ENTIDADES).map(async ([tipoEntidad, mapeo]) => {
          const respuesta = await rest.peticion<FilaRemota>({
            metodo: 'GET',
            ruta:
              `/${mapeo.tabla}?sync_revision=gt.${desdeRevision}` +
              `&select=${seleccion(mapeo)}&order=sync_revision.asc&limit=${limite}`,
          });
          if (respuesta.estado >= 400) {
            throw rest.comoError(respuesta, `descargar:${mapeo.tabla}`);
          }
          return respuesta.filas.map((fila) => cambioEntranteDe(fila, tipoEntidad));
        }),
      );

      const cambios = porTabla
        .flat()
        .sort((a, b) => a.revision - b.revision)
        .slice(0, limite);

      const ultimo = cambios[cambios.length - 1];
      return {
        cambios,
        revisionFinal: ultimo === undefined ? desdeRevision : ultimo.revision,
      };
    },
  };
}
