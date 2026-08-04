// Contexto de sincronización para las pruebas de módulo.
//
// No es una suite: es el doble que montaban por su cuenta las diez pruebas de
// módulo, repitiendo la misma construcción. Vive aquí para que añadir una
// pieza al contexto —el cubo de archivos, por ejemplo— sea un cambio en un
// sitio y no en diez.
//
// El almacenamiento de archivos es en memoria: las pruebas de pantalla no
// deben tocar el disco ni la red, y lo que se comprueba de verdad sobre
// archivos está en las pruebas del repositorio.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import type { AlmacenLocal } from '@shared/database/tipos';
import {
  crearAlmacenamientoEnMemoria,
  type AlmacenamientoRemoto,
} from '@shared/services/storage/puertoAlmacenamiento';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import type { PuertoRemoto } from '@shared/services/sync/puertoRemoto';

import type { Sincronizacion } from '../services/contextoSincronizacion';

/** Cubo en memoria. Recuerda lo que se le sube para poder comprobarlo. */
export function crearCuboEnMemoria(): AlmacenamientoRemoto & {
  readonly contenidos: Map<string, Uint8Array>;
} {
  const contenidos = new Map<string, Uint8Array>();
  return {
    contenidos,
    subir: async ({ ruta, contenido }) => {
      contenidos.set(ruta, Uint8Array.from(contenido));
    },
    descargar: async (ruta) => {
      const contenido = contenidos.get(ruta);
      if (contenido === undefined) throw new Error('no está en el cubo');
      return Uint8Array.from(contenido);
    },
    borrar: async (ruta) => {
      contenidos.delete(ruta);
    },
  };
}

export function crearSincronizacionDePrueba(parametros: {
  readonly usuarioId: string;
  readonly remoto: PuertoRemoto;
  readonly dispositivoId?: string;
  readonly almacen?: AlmacenLocal;
}): Sincronizacion {
  const almacen = parametros.almacen ?? crearAlmacenEnMemoria();

  return {
    almacen,
    usuarioId: parametros.usuarioId,
    almacenamientoRemoto: crearCuboEnMemoria(),
    almacenamientoLocal: crearAlmacenamientoEnMemoria(),
    motor: crearMotorSincronizacion({
      almacen,
      remoto: parametros.remoto,
      usuarioId: parametros.usuarioId,
      dispositivoId: parametros.dispositivoId ?? 'dispositivo-1',
    }),
  };
}
