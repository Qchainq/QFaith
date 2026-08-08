// El hook que mantiene los avisos al día.
//
// Es lo que faltaba para que el servicio hiciera algo: alguien que le diga
// «esto es lo que hay ahora». Se dispara cuando cambia lo que puede cambiar
// el resultado —los hábitos y las preferencias—, que son las situaciones que
// el Documento 13 enumera: cambio de horario, de preferencias, de estado de
// un hábito, de zona horaria.
//
// ── Por qué es un efecto y no una mutación ────────────────────────────────
//
// Porque no es algo que la persona pida, sino una consecuencia de otra cosa
// que pidió. Quien pausa un hábito no está pidiendo «reprograma mis avisos»;
// está pausando un hábito, y que los avisos se ajusten es lo que espera sin
// tener que pensarlo.
import { useEffect, useRef, useState } from 'react';

import { useHabitos } from '@modules/habitos/hooks/useHabitos';
import type { Permiso } from '@shared/services/notificaciones/puertoNotificaciones';

import { useNotificaciones } from '../services/contextoNotificaciones';
import { recordatoriosDeHabitos } from '../use-cases/recordatoriosDeHabitos';

/**
 * Mantiene programado lo que corresponde a los hábitos de ahora.
 *
 * `activas` entra como parámetro y no se lee del perfil aquí para que el
 * efecto se vuelva a lanzar cuando cambie: el servicio lee las preferencias
 * por su cuenta, pero React necesita saber que algo cambió.
 */
export function useRecordatoriosDeHabitos(activas: boolean): void {
  const servicio = useNotificaciones();
  const consulta = useHabitos();
  const habitos = consulta.data?.habitos;

  // El último conjunto programado, para no repetir trabajo en cada render.
  // Reprogramar es idempotente, así que repetirlo no rompería nada; lo que
  // evita esto es hablar con el sistema operativo sin motivo, y en un
  // teléfono eso es batería.
  const ultimo = useRef<string>('');

  useEffect(() => {
    if (habitos === undefined) return;

    const pedidos = recordatoriosDeHabitos(habitos);
    const huella = JSON.stringify([activas, pedidos]);
    if (huella === ultimo.current) return;
    ultimo.current = huella;

    // Sin esperar: un fallo del sistema de notificaciones no puede tumbar la
    // pantalla de hábitos, y no hay nada que enseñar si sale mal. El servicio
    // ya se traga sus errores.
    void servicio.reprogramar(pedidos);
  }, [servicio, habitos, activas]);
}

/**
 * El permiso del sistema, sin pedirlo.
 *
 * `null` mientras se consulta. Pedirlo es otra acción y la decide una
 * pantalla: el Documento 13 exige explicar para qué antes de que salga el
 * diálogo, porque quien lo ve sin contexto dice que no y no hay segunda
 * oportunidad.
 */
export function usePermisoNotificaciones(): Permiso | null {
  const servicio = useNotificaciones();
  const [permiso, ponerPermiso] = useState<Permiso | null>(null);

  useEffect(() => {
    let vigente = true;
    void servicio.permiso().then((valor) => {
      // Si la pantalla se desmontó mientras se consultaba, no se toca estado
      // que ya no existe.
      if (vigente) ponerPermiso(valor);
    });
    return () => {
      vigente = false;
    };
  }, [servicio]);

  return permiso;
}
