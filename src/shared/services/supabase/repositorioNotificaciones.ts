// Avisos que vienen del servidor.
//
// **Aquí no hay método para crear una notificación.** No existe porque el
// cliente no puede: las escribe el servidor con la clave de servicio, y si
// pudiera hacerlo el cliente cualquiera se fabricaría un aviso de seguridad
// falso a nombre de otro. Lo único que hace este archivo es leerlas y
// marcarlas como leídas.
//
// Los recordatorios espirituales —hábitos, oración, devocional, lectura— no
// pasan por aquí en absoluto: se programan en el dispositivo con
// notificaciones locales, para que su contenido nunca salga.
import type { ClienteRest } from './rest';

export interface FilaNotificacion {
  readonly id: string;
  readonly notification_type: string;
  readonly generic_title: string;
  readonly generic_body: string | null;
  readonly action_route: string | null;
  readonly action_reference_id: string | null;
  readonly priority: string;
  readonly created_at: string;
  readonly read_at: string | null;
}

const COLUMNAS =
  'id,notification_type,generic_title,generic_body,action_route,' +
  'action_reference_id,priority,created_at,read_at';

export function crearRepositorioNotificaciones(rest: ClienteRest) {
  async function listar(usuarioId: string): Promise<readonly FilaNotificacion[]> {
    const respuesta = await rest.peticion<FilaNotificacion>({
      metodo: 'GET',
      ruta: `/notifications?user_id=eq.${usuarioId}&select=${COLUMNAS}&order=created_at.desc`,
    });
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, 'leer:notifications');
    return respuesta.filas;
  }

  async function marcarLeida(parametros: {
    readonly usuarioId: string;
    readonly notificacionId: string;
  }): Promise<FilaNotificacion | null> {
    const respuesta = await rest.peticion<FilaNotificacion>({
      metodo: 'PATCH',
      ruta:
        `/notifications?id=eq.${parametros.notificacionId}` +
        `&user_id=eq.${parametros.usuarioId}&select=${COLUMNAS}`,
      cuerpo: { read_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, 'marcar:notifications');
    return respuesta.filas[0] ?? null;
  }

  /**
   * Guarda el token push del dispositivo.
   *
   * Va en `devices` y no en el perfil: es del dispositivo, se revoca con él y
   * se borra al cerrar sesión. **Nunca aparece en un log.**
   */
  async function guardarTokenPush(parametros: {
    readonly usuarioId: string;
    readonly dispositivoId: string;
    readonly token: string | null;
  }): Promise<void> {
    const respuesta = await rest.peticion({
      metodo: 'PATCH',
      ruta:
        `/devices?id=eq.${parametros.dispositivoId}&user_id=eq.${parametros.usuarioId}` +
        '&select=id',
      cuerpo: {
        push_token: parametros.token,
        push_updated_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    });
    if (respuesta.estado >= 400) {
      // El contexto no incluye el token: un error tampoco puede filtrarlo.
      throw rest.comoError(respuesta, 'guardar:push_token');
    }
  }

  return { listar, marcarLeida, guardarTokenPush };
}

export type RepositorioNotificaciones = ReturnType<typeof crearRepositorioNotificaciones>;
