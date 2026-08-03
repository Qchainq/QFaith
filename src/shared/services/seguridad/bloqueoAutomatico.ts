// Bloqueo automático por inactividad.
//
// Lo que protege esto es concreto: un teléfono desbloqueado encima de una
// mesa. Las claves de contenido viven en memoria mientras la sesión está
// abierta, así que cualquiera que coja el móvil lee el diario. Bloquear las
// descarta de memoria y obliga a volver a identificarse.
//
// Tres decisiones:
//
//   1. **La cuenta corre desde la última actividad, no desde que se abrió la
//      aplicación.** Alguien que lleva veinte minutos escribiendo no debería
//      encontrarse la pantalla bloqueada a media frase.
//
//   2. **Salir a segundo plano bloquea de inmediato si el plazo es corto.**
//      El caso que importa —dejar el móvil y que otro lo coja— pasa
//      justamente cuando la aplicación no está en pantalla.
//
//   3. **`0` significa «no bloquear por inactividad»**, y es una elección
//      legítima: en un dispositivo personal que ya tiene PIN, un segundo
//      bloqueo puede ser suficiente motivo para que alguien deje de escribir.
//      La seguridad que molesta demasiado se acaba desactivando entera.
//
// Este archivo no toca el reloj ni el ciclo de vida de la aplicación: recibe
// los dos como datos. Así se puede probar sin simular el sistema operativo,
// que es donde estas cosas suelen fallar sin que nadie se entere.

/** Segundos permitidos por el esquema (`user_settings.auto_lock_seconds`). */
export const MINIMO_SEGUNDOS = 0;
export const MAXIMO_SEGUNDOS = 3600;

export interface EstadoBloqueo {
  /** Instante de la última actividad, en milisegundos. */
  readonly ultimaActividadMs: number;
  /** Plazo configurado. `0` desactiva el bloqueo por inactividad. */
  readonly segundosDeEspera: number;
}

/**
 * ¿Toca bloquear?
 *
 * Se compara con `>=` a propósito: con un plazo de 60 segundos, a los 60
 * segundos exactos ya se bloquea. Redondear a favor de dejar abierto sería
 * regalar un margen que nadie pidió.
 */
export function debeBloquear(estado: EstadoBloqueo, ahoraMs: number): boolean {
  if (estado.segundosDeEspera <= 0) return false;

  // Un reloj que va hacia atrás —cambio de hora, ajuste del sistema— no puede
  // servir para mantener la sesión abierta indefinidamente. Ante una lectura
  // incoherente se bloquea, que es el lado seguro.
  if (ahoraMs < estado.ultimaActividadMs) return true;

  return ahoraMs - estado.ultimaActividadMs >= estado.segundosDeEspera * 1000;
}

/** Milisegundos que faltan, o `null` si el bloqueo por inactividad está apagado. */
export function tiempoRestanteMs(estado: EstadoBloqueo, ahoraMs: number): number | null {
  if (estado.segundosDeEspera <= 0) return null;
  const restante = estado.ultimaActividadMs + estado.segundosDeEspera * 1000 - ahoraMs;
  return restante > 0 ? restante : 0;
}

/**
 * ¿Bloquear al volver a primer plano?
 *
 * Con el bloqueo por inactividad apagado, no. Con él encendido, se aplica el
 * mismo plazo que en primer plano: el tiempo en segundo plano cuenta igual.
 * Tratarlo aparte llevaría a la trampa de siempre —«solo he salido un momento
 * a mirar un mensaje»— que es exactamente cuando el móvil cambia de manos.
 */
export function debeBloquearAlVolver(
  estado: EstadoBloqueo,
  ahoraMs: number,
  segundosDeGraciaEnSegundoPlano = 0,
): boolean {
  if (estado.segundosDeEspera <= 0) return false;
  if (ahoraMs < estado.ultimaActividadMs) return true;

  const transcurrido = ahoraMs - estado.ultimaActividadMs;
  const permitido = Math.min(estado.segundosDeEspera, segundosDeGraciaEnSegundoPlano) * 1000;
  return transcurrido >= permitido;
}

/** Normaliza el valor recibido del servidor al rango que acepta el esquema. */
export function segundosValidos(valor: number): number {
  if (!Number.isFinite(valor)) return MINIMO_SEGUNDOS;
  return Math.min(MAXIMO_SEGUNDOS, Math.max(MINIMO_SEGUNDOS, Math.trunc(valor)));
}
