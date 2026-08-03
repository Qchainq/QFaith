// Servidor en memoria que replica la semántica del esquema real: control de
// versión optimista, revisión monótona y borrado lógico.
//
// No sustituye a las pruebas contra PostgreSQL, que ya existen en
// `supabase/tests`. Sirve para ejercitar el motor de sincronización y el
// escenario de dos dispositivos sin depender de la red.
import type { SobreCifrado } from '@shared/services/crypto/tipos';
import type { Metadatos, OperacionSincronizacion } from '@shared/database/tipos';

import type {
  CambioEntrante,
  CambioSaliente,
  PuertoRemoto,
  ResultadoCambio,
} from '../puertoRemoto';

interface FilaServidor {
  readonly id: string;
  readonly tipoEntidad: string;
  sobre: SobreCifrado;
  metadatos: Metadatos;
  version: number;
  revision: number;
  eliminadoEn: string | null;
}

export interface ServidorEnMemoria extends PuertoRemoto {
  /** Estado bruto, tal y como lo vería alguien con acceso a la base. */
  filas(): readonly FilaServidor[];
  /** Simula la caída de la red. */
  desconectar(): void;
  conectar(): void;
}

export function crearServidorEnMemoria(): ServidorEnMemoria {
  const filas = new Map<string, FilaServidor>();
  let revisionActual = 0;
  let conectado = true;

  const clave = (tipoEntidad: string, id: string): string => `${tipoEntidad}:${id}`;

  function exigirConexion(): void {
    if (!conectado) {
      const error = new Error('sin conexión');
      error.name = 'ErrorRed';
      throw error;
    }
  }

  function aplicar(cambio: CambioSaliente): ResultadoCambio {
    const existente = filas.get(clave(cambio.tipoEntidad, cambio.id));

    if (existente !== undefined && existente.version !== cambio.versionBase) {
      // Otro dispositivo escribió antes. El servidor nunca decide por el
      // usuario: devuelve su versión y deja que el cliente resuelva.
      return {
        estado: 'conflicto',
        id: cambio.id,
        versionRemota: existente.version,
        sobreRemoto: existente.sobre,
        metadatosRemotos: existente.metadatos,
      };
    }

    revisionActual += 1;
    const version = (existente?.version ?? 0) + 1;
    const eliminadoEn =
      cambio.operacion === 'delete' ? new Date(revisionActual * 1000).toISOString() : null;

    filas.set(clave(cambio.tipoEntidad, cambio.id), {
      id: cambio.id,
      tipoEntidad: cambio.tipoEntidad,
      sobre: cambio.sobre,
      metadatos: cambio.metadatos,
      version,
      revision: revisionActual,
      eliminadoEn,
    });

    return { estado: 'aceptado', id: cambio.id, revision: revisionActual, version };
  }

  return {
    async enviar(cambios) {
      exigirConexion();
      return cambios.map(aplicar);
    },

    async descargar({ desdeRevision, limite }) {
      exigirConexion();
      const cambios: CambioEntrante[] = [...filas.values()]
        .filter((fila) => fila.revision > desdeRevision)
        .sort((a, b) => a.revision - b.revision)
        .slice(0, limite)
        .map((fila) => {
          const operacion: OperacionSincronizacion =
            fila.eliminadoEn !== null ? 'delete' : 'update';
          return {
            id: fila.id,
            tipoEntidad: fila.tipoEntidad,
            operacion,
            revision: fila.revision,
            version: fila.version,
            sobre: fila.sobre,
            metadatos: fila.metadatos,
            eliminadoEn: fila.eliminadoEn,
          };
        });

      const revisionFinal =
        cambios.length === 0
          ? desdeRevision
          : (cambios[cambios.length - 1]?.revision ?? desdeRevision);

      return { cambios, revisionFinal };
    },

    filas: () => [...filas.values()],
    desconectar: () => {
      conectado = false;
    },
    conectar: () => {
      conectado = true;
    },
  };
}
