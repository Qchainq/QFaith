// Puerto del sistema de notificaciones.
//
// Separa la política —que es toda de QFaith y se puede probar— de la API del
// sistema operativo, que no se puede ejecutar fuera de un teléfono. Es la
// misma división que entre `almacenamientoExpo` y `sistemaDeArchivosExpo`, y
// por el mismo motivo.
//
// El puerto habla de **avisos ya decididos**: cuándo suena, qué claves de
// texto lleva y a dónde va. Nunca recibe el contenido de la persona, porque
// para cuando algo llega aquí el catálogo cerrado ya eligió el texto. Un
// puerto que aceptara `titulo: string` invitaría a saltarse todo lo anterior
// desde el sitio donde más a mano está el texto de verdad.
import type { Ruta } from './cargaRemota';
import type { Categoria } from './politica';

/** Permiso del sistema para mostrar notificaciones. */
export const PERMISOS = ['concedido', 'denegado', 'sinDecidir'] as const;
export type Permiso = (typeof PERMISOS)[number];

/** Un aviso listo para programar. Sin texto libre: solo claves. */
export interface AvisoProgramable {
  /**
   * Identificador estable. Programar dos veces el mismo sustituye, no suma.
   *
   * Lo genera `identificadorDeAviso`, y es lo que hace idempotentes a las
   * tareas de fondo (Documento 13).
   */
  readonly id: string;
  readonly categoria: Categoria;
  readonly claveTitulo: string;
  readonly claveCuerpo: string;
  readonly instante: Date;
  /** A dónde lleva al tocarlo. De la lista cerrada. */
  readonly ruta: Ruta;
  /** Identificador opaco de la entidad, para poder abrirla. Nunca contenido. */
  readonly entidadId: string;
}

export interface PuertoNotificaciones {
  permisoActual(): Promise<Permiso>;
  /** Pide el permiso del sistema. Solo se llama tras explicar para qué. */
  pedirPermiso(): Promise<Permiso>;

  programar(aviso: AvisoProgramable): Promise<void>;
  cancelar(id: string): Promise<void>;
  /** Los que hay programados ahora, para poder reprogramar sin duplicar. */
  programados(): Promise<readonly string[]>;
  cancelarTodos(): Promise<void>;

  /** Token de push de este dispositivo, o `null` si no hay. */
  tokenPush(): Promise<string | null>;
}

/**
 * Implementación vacía, para cuando no hay sistema debajo.
 *
 * Se usa en las pruebas de otras capas y en cualquier entorno sin
 * notificaciones. **Devuelve `denegado`, no `concedido`**: sin sistema
 * debajo, un permiso concedido haría creer a la aplicación que sus avisos
 * llegan cuando no llega ninguno, y eso es peor que no tenerlos.
 */
export const notificacionesNoDisponibles: PuertoNotificaciones = {
  permisoActual: async () => 'denegado',
  pedirPermiso: async () => 'denegado',
  programar: async () => undefined,
  cancelar: async () => undefined,
  programados: async () => [],
  cancelarTodos: async () => undefined,
  tokenPush: async () => null,
};
