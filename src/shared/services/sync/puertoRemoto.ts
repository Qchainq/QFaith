// Contrato con el servidor.
//
// El motor de sincronización habla solo con esta interfaz, nunca con
// Supabase directamente. Así la lógica se puede probar sin red y el
// proveedor se puede cambiar sin tocarla.
import type { SobreCifrado } from '@shared/services/crypto/tipos';
import type { Metadatos, OperacionSincronizacion } from '@shared/database/tipos';

/** Cambio que el dispositivo quiere subir. */
export interface CambioSaliente {
  readonly id: string;
  readonly tipoEntidad: string;
  readonly operacion: OperacionSincronizacion;
  readonly sobre: SobreCifrado;
  readonly metadatos: Metadatos;
  /**
   * Versión sobre la que se basó este cambio. El servidor la compara con la
   * que tiene: si no coinciden, otro dispositivo escribió primero.
   */
  readonly versionBase: number;
  readonly dispositivoId: string | null;
}

export type ResultadoCambio =
  | {
      readonly estado: 'aceptado';
      readonly id: string;
      readonly revision: number;
      readonly version: number;
    }
  | {
      readonly estado: 'conflicto';
      readonly id: string;
      readonly versionRemota: number;
      readonly sobreRemoto: SobreCifrado;
      readonly metadatosRemotos: Metadatos;
    }
  | {
      readonly estado: 'rechazado';
      readonly id: string;
      readonly motivo: string;
      readonly reintentable: boolean;
    };

/** Cambio que llega desde el servidor. */
export interface CambioEntrante {
  readonly id: string;
  readonly tipoEntidad: string;
  readonly operacion: OperacionSincronizacion;
  readonly revision: number;
  readonly version: number;
  readonly sobre: SobreCifrado | null;
  readonly metadatos: Metadatos;
  readonly eliminadoEn: string | null;
}

export interface PuertoRemoto {
  /** Sube un lote de cambios y devuelve el resultado de cada uno. */
  enviar(cambios: readonly CambioSaliente[]): Promise<readonly ResultadoCambio[]>;
  /** Descarga los cambios posteriores a una revisión. */
  descargar(parametros: {
    readonly desdeRevision: number;
    readonly limite: number;
  }): Promise<{ readonly cambios: readonly CambioEntrante[]; readonly revisionFinal: number }>;
}
