// Raíz de composición de las notificaciones.
//
// Es el único sitio donde se junta el servicio con el adaptador del sistema
// operativo. Las pantallas piden el servicio a este contexto y nunca lo
// construyen: si lo construyeran, cada una elegiría su propio puerto y la
// política dejaría de ser una sola.
//
// ── Por qué las preferencias van en una referencia ────────────────────────
//
// El servicio las lee **en cada operación**, y el servicio se construye una
// vez. Si se le pasara el valor, seguiría programando con el de cuando se
// montó el proveedor: con el interruptor de hace media hora, con el horario
// de silencio de antes de cambiarlo, con la zona horaria de antes del vuelo.
// La referencia se actualiza en cada render y el servicio siempre lee la
// última.
//
// ── La zona horaria se pregunta, no se guarda ─────────────────────────────
//
// Guardarla sería recordar dónde estuvo la persona la última vez.
// Preguntarla da la de ahora, que es la única que sirve para decidir qué son
// «las diez de la mañana».
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

import { useAjustes } from '@modules/perfil/hooks/usePerfil';
import { crearNotificacionesExpo } from '@shared/services/notificaciones/notificacionesExpo';
import type { Consumo } from '@shared/services/notificaciones/politica';
import type { PuertoNotificaciones } from '@shared/services/notificaciones/puertoNotificaciones';
import {
  crearServicioNotificaciones,
  PREFERENCIAS_POR_DEFECTO,
  type Preferencias,
  type ServicioNotificaciones,
} from '@shared/services/notificaciones/servicioNotificaciones';

const Contexto = createContext<ServicioNotificaciones | undefined>(undefined);

/** La zona horaria de ahora mismo, según el sistema. Ver la cabecera. */
export const zonaHorariaActual = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * Preferencias a partir de lo que el perfil guarda.
 *
 * El perfil guarda hoy el interruptor general; lo demás son los valores por
 * defecto, que son los discretos. Cuando la pantalla de ajustes ofrezca el
 * resto —vista previa, horario de silencio, límites— se leerá de ahí, y el
 * resto del sistema no se entera porque pasa por esta única función.
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

/**
 * Cuánto se ha enviado ya.
 *
 * **Todo a cero, y es una limitación conocida.** Llevar la cuenta exige
 * guardar cuántos avisos se han mostrado hoy, y eso todavía no existe en
 * ninguna parte. Mientras no exista, el techo diario del Documento 13 no
 * llega a morder: los recordatorios de hábitos son uno por hábito y al día,
 * así que en la práctica no se roza, pero conviene tenerlo escrito aquí y no
 * descubierto dentro de un año.
 *
 * Se deja a cero en lugar de inventar una cuenta: un número falso haría que
 * el límite cortara avisos que sí tocaban.
 */
const SIN_CONSUMO: Consumo = {
  espiritualesHoy: 0,
  resumenesHoy: 0,
  promocionalesEstaSemana: 0,
};

export interface PropsProveedorNotificaciones {
  readonly children: ReactNode;
  /** Traduce las claves del catálogo. El sistema muestra el texto tal cual. */
  readonly traducir: (clave: string) => string;
  /** Para las pruebas: sustituye el adaptador del sistema operativo. */
  readonly puerto?: PuertoNotificaciones;
  /** Para las pruebas: sustituye la lectura del perfil. */
  readonly preferencias?: Preferencias;
}

export function ProveedorNotificaciones({
  children,
  traducir,
  puerto,
  preferencias,
}: PropsProveedorNotificaciones) {
  const ajustes = useAjustes();

  // Mientras los ajustes no han cargado se toma el valor discreto: programar
  // con un interruptor que quizá esté apagado es peor que tardar un segundo.
  const actuales =
    preferencias ??
    preferenciasDesdePerfil({ notificacionesActivas: ajustes.data?.notificaciones ?? false });

  const referencia = useRef(actuales);
  referencia.current = actuales;

  const servicio = useMemo(
    () =>
      crearServicioNotificaciones({
        puerto: puerto ?? crearNotificacionesExpo(traducir),
        preferencias: () => referencia.current,
        consumo: () => SIN_CONSUMO,
      }),
    [puerto, traducir],
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
