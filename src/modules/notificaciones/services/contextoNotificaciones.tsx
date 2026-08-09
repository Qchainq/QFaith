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
import type { Ajustes } from '@modules/perfil/models/perfil';
import { crearNotificacionesExpo } from '@shared/services/notificaciones/notificacionesExpo';
import { limitesValidos, type Consumo } from '@shared/services/notificaciones/politica';
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
 * Único punto de traducción entre los ajustes —que son del perfil y viajan
 * con la persona— y lo que la política de notificaciones necesita. Que sea
 * uno solo es lo que permitió añadir la vista previa, el horario de silencio
 * y los techos sin que el servicio ni las pantallas se enteraran.
 */
export function preferenciasDesdePerfil(parametros: {
  readonly ajustes?: Ajustes;
  readonly zonaHoraria?: string;
}): Preferencias {
  const base = PREFERENCIAS_POR_DEFECTO(parametros.zonaHoraria ?? zonaHorariaActual());
  const ajustes = parametros.ajustes;
  // Mientras la consulta no ha traído nada se usan los discretos: programar
  // con un interruptor que quizá esté apagado es peor que tardar un segundo.
  if (ajustes === undefined) return base;

  return {
    ...base,
    activas: ajustes.notificaciones,
    detalle: ajustes.detalleNotificacion,
    silencio: { desdeMinuto: ajustes.silencioDesde, hastaMinuto: ajustes.silencioHasta },
    // Se recortan aquí aunque el caso de uso ya lo haga al guardar: es la
    // última puerta antes de programar, y lo que llega del servidor no tiene
    // por qué haber pasado por el caso de uso.
    limites: limitesValidos({
      espiritualesAlDia: ajustes.maxEspiritualesAlDia,
      resumenesAlDia: ajustes.maxResumenesAlDia,
      promocionalesALaSemana: ajustes.maxPromocionalesALaSemana,
    }),
    aceptaPromocionales: ajustes.aceptaPromocionales,
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

  const actuales =
    preferencias ??
    preferenciasDesdePerfil(ajustes.data === undefined ? {} : { ajustes: ajustes.data });

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
