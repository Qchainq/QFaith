// Modelo de la base local.
//
// Todo registro sincronizable vive aquí con su sobre cifrado y su estado de
// sincronización. La base local guarda exactamente lo mismo que el servidor:
// nunca texto en claro (Documento 7, «la base de datos local permanece
// cifrada»).
import type { SobreCifrado } from '@shared/services/crypto/tipos';

/**
 * Valor que puede llevar un metadato.
 *
 * Admite objetos y listas porque algunas columnas del esquema son `jsonb`
 * —la configuración de repetición de un hábito, por ejemplo—. Sigue siendo
 * **todo lo que el servidor puede leer**: nada sensible entra aquí.
 */
export type ValorMetadato =
  | string
  | number
  | boolean
  | null
  | readonly ValorMetadato[]
  | { readonly [clave: string]: ValorMetadato };

export type Metadatos = Readonly<Record<string, ValorMetadato>>;

/** Los seis estados del Documento 7. */
export const ESTADOS_SINCRONIZACION = [
  'nuevo',
  'modificado',
  'sincronizado',
  'pendiente',
  'eliminado',
  'conflicto',
] as const;

export type EstadoSincronizacion = (typeof ESTADOS_SINCRONIZACION)[number];

export type OperacionSincronizacion = 'create' | 'update' | 'delete';

/** Fila tal y como se almacena en el dispositivo. */
export interface RegistroLocal {
  readonly id: string;
  readonly usuarioId: string;
  readonly tipoEntidad: string;
  readonly sobre: SobreCifrado;
  /** Metadatos no sensibles que el servidor sí necesita para indexar. */
  readonly metadatos: Metadatos;
  readonly version: number;
  /** Última revisión conocida del servidor para este registro. */
  readonly revisionRemota: number;
  readonly estado: EstadoSincronizacion;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
  readonly eliminadoEn: string | null;
  readonly dispositivoId: string | null;
}

/** Conflicto pendiente de decisión del usuario. */
export interface ConflictoLocal {
  readonly id: string;
  readonly usuarioId: string;
  readonly tipoEntidad: string;
  readonly entidadId: string;
  readonly versionLocal: number;
  readonly versionRemota: number;
  /** Ambas versiones se conservan cifradas hasta que el usuario decide. */
  readonly sobreLocal: SobreCifrado;
  readonly sobreRemoto: SobreCifrado;
  readonly creadoEn: string;
}

/**
 * Puerto de persistencia local.
 *
 * Existe como interfaz para que la lógica de sincronización se pueda probar
 * sin un dispositivo: en las pruebas se usa la implementación en memoria y
 * en el dispositivo la de SQLite.
 */
export interface AlmacenLocal {
  guardar(registro: RegistroLocal): Promise<void>;
  obtener(tipoEntidad: string, id: string): Promise<RegistroLocal | null>;
  listar(
    tipoEntidad: string,
    opciones?: { readonly incluirEliminados?: boolean },
  ): Promise<readonly RegistroLocal[]>;
  /** Registros con cambios sin enviar, en el orden en que deben enviarse. */
  pendientesDeEnvio(): Promise<readonly RegistroLocal[]>;
  guardarConflicto(conflicto: ConflictoLocal): Promise<void>;
  listarConflictos(): Promise<readonly ConflictoLocal[]>;
  eliminarConflicto(id: string): Promise<void>;
  /** Última revisión del servidor que este dispositivo ya ha descargado. */
  leerCursorSincronizacion(): Promise<number>;
  escribirCursorSincronizacion(revision: number): Promise<void>;
  vaciar(): Promise<void>;
}
