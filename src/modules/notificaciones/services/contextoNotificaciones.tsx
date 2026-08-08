// Raíz de composición de las notificaciones.
//
// Es el único sitio donde se junta el servicio con el adaptador del sistema
// operativo. Las pantallas piden el servicio a este contexto y nunca lo
// construyen: si lo construyeran, cada una elegiría su propio puerto y la
// política dejaría de ser una sola.
//
// ── Por qué las preferencias llegan por función y no por valor ────────────
//
// El servicio las lee **en cada operación**. Cambian mientras la aplicación
// está abierta —se apaga el interruptor, se cambia el horario de silencio, se
// vuela a otro país y cambia la zona horaria— y un valor capturado al montar
// el proveedor seguiría programando con el de antes.
//
// ── La zona horaria se pregunta al sistema, no se guarda ──────────────────
//
// Guardarla sería recordar dónde estuvo la persona la última vez. Preguntarla
// da la de ahora, que es la única que sirve para decidir qué son «las diez de
// la mañana».
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { crearNotificacionesExpo } from '@shared/services/notificaciones/notificacionesExpo';
import {
  crearServicioNotificaciones,
  PREFERENCIAS_POR_DEFECTO,
  type Preferencias,
  type ServicioNotificaciones,
} from '@shared/services/notificaciones/servicioNotificaciones';
import type { Consumo } from '@shared/services/notificaciones/politica';
import type { PuertoNotificaciones } from '@shared/services/notificaciones/puertoNotificaciones';

const Contexto = createContext<ServicioNotificaciones | undefined>(undefined);

export interface PropsProveedorNotificaciones {
  readonly children: ReactNode;
  /** Traduce las claves del catálogo. El sistema muestra el texto tal cual. */
  readonly traducir: (clave: string) => string;
  readonly preferencias: () => Preferencias;
  readonly consumo: () => Consumo;
  /** Para las pruebas: sustituye el adaptador del sistema operativo. */
  readonly puerto?: PuertoNotificaciones;
}

export function ProveedorNotificaciones({
  children,
  traducir,
  preferencias,
  consumo,
  puerto,
}: PropsProveedorNotificaciones) {
  const servicio = useMemo(
    () =>
      crearServicioNotificaciones({
        puerto: puerto ?? crearNotificacionesExpo(traducir),
        preferencias,
        consumo,
      }),
    [puerto, traducir, preferencias, consumo],
  );

  return <Contexto.Provider value={servicio}>{children}</Contexto.Provider>;
}

export function useNotificaciones(): ServicioNotificaciones {
  const servicio = useContext(Contexto);
  if (servicio === undefined) {
    throw new Error('useNotificaciones debe usarse dentro de ProveedorNotificaciones');
  }
  return servicio;
}

/** La zona horaria de ahora mismo, según el sistema. Ver la cabecera. */
export const zonaHorariaActual = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * Preferencias a partir de lo que el perfil guarda.
 *
 * El perfil solo guarda hoy el interruptor general; lo demás son los valores
 * por defecto, que son los discretos. Cuando la pantalla de ajustes ofrezca
 * el resto —vista previa, horario de silencio, límites— se leerán de ahí, y
 * el resto del sistema no se entera porque pasa por esta única función.
 */
export function preferenciasDesdePerfil(parametros: {
  readonly notificacionesActivas: boolean;
  readonly zonaHoraria?: string;
}): Preferencias {
  return {
    ...PREFERENCIAS_POR_DEFECTO(parametros.zonaHoraria ?? zonaHorariaActual()),
    activas: parametros.notificacionesActivas,
  };
}
