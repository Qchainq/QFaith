// Adaptador de plataforma sobre `expo-notifications`. Es el que corre en el
// dispositivo.
//
// Aquí no hay política: solo la traducción entre el puerto y la API de la
// biblioteca. Cuándo suena, qué se ve y si se puede enviar lo deciden
// `servicioNotificaciones`, `contenidoVisible` y `politica`, que sí se
// prueban. Es la misma división que entre `ejecutorExpo` y `almacenSqlite`, y
// por el mismo motivo: esto no se puede ejecutar fuera de un teléfono.
//
// ── Lo que sí es una decisión, y por eso está escrita ─────────────────────
//
// El cuerpo del aviso viaja **ya traducido** porque el sistema operativo lo
// muestra tal cual, y llega aquí desde el catálogo cerrado: este archivo no
// lo compone ni lo modifica.
//
// En `data` va lo mínimo para poder abrir lo que el aviso señala —la ruta y
// el identificador opaco— y nada más. Ese objeto lo guarda el sistema
// operativo junto con la notificación programada, así que vale la misma regla
// que para un push: lo que se meta ahí queda fuera del alcance de QFaith.
import * as Notificaciones from 'expo-notifications';

import type { AvisoProgramable, Permiso, PuertoNotificaciones } from './puertoNotificaciones';

const comoPermiso = (estado: Notificaciones.PermissionStatus): Permiso => {
  if (estado === 'granted') return 'concedido';
  if (estado === 'denied') return 'denegado';
  return 'sinDecidir';
};

/**
 * Traduce cada aviso al formato del sistema.
 *
 * `traducir` la inyecta quien construye el adaptador: la traducción vive en
 * la capa de presentación y este servicio no debe conocerla, pero el texto
 * tiene que llegar traducido porque lo pinta el sistema operativo.
 */
export function crearNotificacionesExpo(traducir: (clave: string) => string): PuertoNotificaciones {
  return {
    async permisoActual() {
      const { status } = await Notificaciones.getPermissionsAsync();
      return comoPermiso(status);
    },

    async pedirPermiso() {
      const { status } = await Notificaciones.requestPermissionsAsync();
      return comoPermiso(status);
    },

    async programar(aviso: AvisoProgramable) {
      await Notificaciones.scheduleNotificationAsync({
        // El identificador estable es lo que hace que reprogramar sustituya
        // en lugar de sumar (Documento 13: las tareas de fondo son idempotentes).
        identifier: aviso.id,
        content: {
          title: traducir(aviso.claveTitulo),
          body: traducir(aviso.claveCuerpo),
          // Solo lo necesario para abrir. Ver la cabecera.
          data: { ruta: aviso.ruta, entidadId: aviso.entidadId, categoria: aviso.categoria },
        },
        trigger: { type: Notificaciones.SchedulableTriggerInputTypes.DATE, date: aviso.instante },
      });
    },

    async cancelar(id: string) {
      await Notificaciones.cancelScheduledNotificationAsync(id);
    },

    async programados() {
      const programadas = await Notificaciones.getAllScheduledNotificationsAsync();
      return programadas.map((programada) => programada.identifier);
    },

    async cancelarTodos() {
      await Notificaciones.cancelAllScheduledNotificationsAsync();
    },

    async tokenPush() {
      try {
        const { data } = await Notificaciones.getDevicePushTokenAsync();
        return data;
      } catch {
        // Sin servicios de push —un emulador, un teléfono sin Google— no hay
        // token y no es un error: los avisos locales siguen funcionando, que
        // son la mayoría.
        return null;
      }
    },
  };
}
