// Cómo se le cuenta a la persona el estado de su suscripción.
//
// **Esto no decide el acceso.** Lo decide `fn_tiene_acceso_premium` en la base
// de datos, y por eso las políticas del contenido de pago no consultan nada de
// aquí. Lo que se calcula en este archivo es qué mensaje ve la persona, que es
// otra cosa: puede equivocarse sin abrir nada, y el servidor sigue mandando.
//
// Se separa a propósito. Si la pantalla dedujera el acceso por su cuenta,
// tarde o temprano alguien la usaría para gobernar una decisión de verdad, y
// entonces bastaría con manipular la aplicación.
import type { EstadoSuscripcion, Suscripcion } from './repositorioSuscripcion';

/** Qué se le dice a la persona. Devuelve claves de i18n. */
export type MensajeAcceso =
  | 'suscripcion.estado.sinSuscripcion'
  | 'suscripcion.estado.prueba'
  | 'suscripcion.estado.activa'
  | 'suscripcion.estado.gracia'
  | 'suscripcion.estado.terminaPronto'
  | 'suscripcion.estado.caducada';

const VIVOS: readonly EstadoSuscripcion[] = ['trialing', 'active', 'grace'];

/**
 * ¿Debería la pantalla enseñar las funciones de pago?
 *
 * Es una previsión, no un permiso: si se equivoca de más, la persona verá una
 * pantalla que el servidor le negará; si se equivoca de menos, verá la oferta
 * de suscribirse teniéndola ya. Ninguna de las dos abre nada.
 */
export function pareceConAcceso(
  suscripcion: Suscripcion | null,
  ahora: Date = new Date(),
): boolean {
  if (suscripcion === null) return false;

  if (suscripcion.estado === 'grace') {
    return suscripcion.enGraciaHasta !== null && new Date(suscripcion.enGraciaHasta) > ahora;
  }

  // Cancelada con periodo pagado sin agotar: ya se pagó, así que se disfruta
  // hasta el final. Es la misma regla que aplica la base de datos.
  if (suscripcion.estado === 'canceled') {
    return suscripcion.renuevaEn !== null && new Date(suscripcion.renuevaEn) > ahora;
  }

  if (!VIVOS.includes(suscripcion.estado)) return false;

  return suscripcion.renuevaEn === null || new Date(suscripcion.renuevaEn) > ahora;
}

/**
 * Mensaje que resume la situación.
 *
 * Ninguno culpa a nadie ni mete prisa. Un pago rechazado se cuenta como lo que
 * es —algo que arreglar cuando pueda— y no como una amenaza: el invariante 12
 * vale también aquí, y en pagos la tentación de apretar es mayor que en
 * ningún otro sitio.
 */
export function mensajeDeAcceso(
  suscripcion: Suscripcion | null,
  ahora: Date = new Date(),
): MensajeAcceso {
  if (suscripcion === null) return 'suscripcion.estado.sinSuscripcion';
  if (!pareceConAcceso(suscripcion, ahora)) return 'suscripcion.estado.caducada';

  if (suscripcion.estado === 'grace') return 'suscripcion.estado.gracia';
  if (suscripcion.estado === 'trialing') return 'suscripcion.estado.prueba';
  // Cancelada o marcada para no renovar, pero todavía dentro del periodo.
  if (suscripcion.estado === 'canceled' || suscripcion.terminaAlAcabarElPeriodo) {
    return 'suscripcion.estado.terminaPronto';
  }
  return 'suscripcion.estado.activa';
}

/**
 * Funciones que **nunca** dependen de haber pagado.
 *
 * El Documento 14 lo dice dos veces: no bloquear la recuperación de datos por
 * falta de suscripción, y no eliminar contenido privado cuando expire. Están
 * escritas aquí para que la lista se pueda comprobar, y no repartidas en
 * comentarios por las pantallas.
 *
 * Lo que se pierde al caducar es acceso a funciones nuevas. Nunca lo ya
 * escrito, ni poder llevárselo, ni poder volver a entrar.
 */
export const SIEMPRE_DISPONIBLE = [
  'leer lo ya escrito',
  'escribir en el diario',
  'exportar el contenido',
  'restaurar la cuenta con la frase',
  'sincronizar entre dispositivos',
  'eliminar la cuenta',
] as const;
