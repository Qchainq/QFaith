// Perfil, preferencias y dispositivos.
//
// Es el único contenido del usuario que **no va cifrado**, y conviene decir
// por qué: el idioma, el tema, la zona horaria o si las notificaciones están
// activas no son vida espiritual. El servidor los necesita en claro para
// enviar un recordatorio a la hora correcta y en el idioma correcto, y
// cifrarlos obligaría a descifrar en el servidor, que es justo lo que el
// invariante 1 impide.
//
// La frontera es la del Documento 5: **si la persona lo escribió o lo grabó,
// se cifra.** Un interruptor de tema no lo escribió nadie.
//
// Lo que nunca entra aquí: PIN, claves, tokens ni nada derivado de ellos.
import type { ClienteRest } from './rest';

export interface FilaPerfil {
  readonly id: string;
  readonly display_name: string | null;
  readonly language_code: string;
  readonly timezone: string;
  readonly country_code: string | null;
  readonly birth_year: number | null;
  readonly onboarding_completed: boolean;
}

export interface FilaAjustes {
  readonly user_id: string;
  readonly theme: string;
  readonly font_scale: number;
  readonly notifications_enabled: boolean;
  readonly analytics_enabled: boolean;
  readonly biometric_lock_enabled: boolean;
  readonly auto_lock_seconds: number;
  readonly cloud_backup_enabled: boolean;
  readonly wifi_only_downloads: boolean;
}

export interface FilaDispositivo {
  readonly id: string;
  readonly device_name: string | null;
  readonly platform: string;
  readonly status: string;
  readonly last_seen_at: string | null;
  readonly revoked_at: string | null;
}

export interface FilaEliminacion {
  readonly id: string;
  readonly requested_at: string;
  readonly scheduled_for: string;
  readonly status: string;
}

const COLUMNAS_PERFIL =
  'id,display_name,language_code,timezone,country_code,birth_year,onboarding_completed';
const COLUMNAS_AJUSTES =
  'user_id,theme,font_scale,notifications_enabled,analytics_enabled,' +
  'biometric_lock_enabled,auto_lock_seconds,cloud_backup_enabled,wifi_only_downloads';
const COLUMNAS_DISPOSITIVO = 'id,device_name,platform,status,last_seen_at,revoked_at';
const COLUMNAS_ELIMINACION = 'id,requested_at,scheduled_for,status';

export function crearRepositorioPerfil(rest: ClienteRest) {
  async function exigir<T>(
    respuesta: { estado: number; filas: readonly T[]; codigo: string | null },
    contexto: string,
  ): Promise<readonly T[]> {
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, contexto);
    return respuesta.filas;
  }

  async function leerPerfil(usuarioId: string): Promise<FilaPerfil | null> {
    const respuesta = await rest.peticion<FilaPerfil>({
      metodo: 'GET',
      ruta: `/profiles?id=eq.${usuarioId}&select=${COLUMNAS_PERFIL}`,
    });
    return (await exigir(respuesta, 'leer:profiles'))[0] ?? null;
  }

  async function guardarPerfil(parametros: {
    readonly usuarioId: string;
    readonly nombre: string | null;
    readonly idioma: string;
    readonly zonaHoraria: string;
    readonly pais: string | null;
    readonly anoNacimiento: number | null;
  }): Promise<FilaPerfil> {
    const respuesta = await rest.peticion<FilaPerfil>({
      metodo: 'POST',
      ruta: `/profiles?on_conflict=id&select=${COLUMNAS_PERFIL}`,
      cuerpo: {
        id: parametros.usuarioId,
        display_name: parametros.nombre,
        language_code: parametros.idioma,
        timezone: parametros.zonaHoraria,
        country_code: parametros.pais,
        birth_year: parametros.anoNacimiento,
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });

    const fila = (await exigir(respuesta, 'guardar:profiles'))[0];
    if (fila === undefined) {
      throw rest.comoError(
        { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
        'guardar:profiles',
      );
    }
    return fila;
  }

  async function leerAjustes(usuarioId: string): Promise<FilaAjustes | null> {
    const respuesta = await rest.peticion<FilaAjustes>({
      metodo: 'GET',
      ruta: `/user_settings?user_id=eq.${usuarioId}&select=${COLUMNAS_AJUSTES}`,
    });
    return (await exigir(respuesta, 'leer:user_settings'))[0] ?? null;
  }

  async function guardarAjustes(
    usuarioId: string,
    cambios: Readonly<Record<string, string | number | boolean>>,
  ): Promise<FilaAjustes> {
    const respuesta = await rest.peticion<FilaAjustes>({
      metodo: 'POST',
      ruta: `/user_settings?on_conflict=user_id&select=${COLUMNAS_AJUSTES}`,
      cuerpo: { user_id: usuarioId, ...cambios },
      prefer: 'resolution=merge-duplicates,return=representation',
    });

    const fila = (await exigir(respuesta, 'guardar:user_settings'))[0];
    if (fila === undefined) {
      throw rest.comoError(
        { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
        'guardar:user_settings',
      );
    }
    return fila;
  }

  async function listarDispositivos(usuarioId: string): Promise<readonly FilaDispositivo[]> {
    const respuesta = await rest.peticion<FilaDispositivo>({
      metodo: 'GET',
      ruta:
        `/devices?user_id=eq.${usuarioId}&select=${COLUMNAS_DISPOSITIVO}` +
        '&order=last_seen_at.desc.nullslast',
    });
    return exigir(respuesta, 'leer:devices');
  }

  /**
   * Revoca un dispositivo.
   *
   * No se borra la fila: se marca. El Documento 5 pide que un dispositivo
   * revocado **no pueda sincronizar**, y para eso el servidor tiene que
   * seguir sabiendo que existe y que está revocado. Borrarlo lo dejaría
   * indistinguible de uno nuevo, y volvería a darse de alta solo con abrir la
   * aplicación.
   */
  async function revocarDispositivo(parametros: {
    readonly usuarioId: string;
    readonly dispositivoId: string;
  }): Promise<FilaDispositivo | null> {
    const respuesta = await rest.peticion<FilaDispositivo>({
      metodo: 'PATCH',
      ruta:
        `/devices?id=eq.${parametros.dispositivoId}&user_id=eq.${parametros.usuarioId}` +
        `&select=${COLUMNAS_DISPOSITIVO}`,
      cuerpo: { status: 'revoked', revoked_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'revocar:devices'))[0] ?? null;
  }

  /**
   * Solicita la eliminación de la cuenta.
   *
   * Es una solicitud, no un borrado, y esa diferencia es deliberada. El
   * esquema exige `scheduled_for > requested_at`, así que el periodo de
   * gracia no depende de que nadie se acuerde de aplicarlo: borrar en el acto
   * lo que alguien construyó durante años, sin vuelta atrás y en un mal día,
   * no es respetar su decisión.
   *
   * Un índice único deja una sola solicitud pendiente por persona, así que
   * pulsar dos veces no adelanta nada ni crea dos calendarios distintos.
   */
  async function solicitarEliminacion(parametros: {
    readonly usuarioId: string;
    readonly diasDeGracia: number;
    readonly ahora?: () => Date;
  }): Promise<FilaEliminacion> {
    const ahora = (parametros.ahora ?? (() => new Date()))();
    const programada = new Date(ahora.getTime() + parametros.diasDeGracia * 86_400_000);

    const respuesta = await rest.peticion<FilaEliminacion>({
      metodo: 'POST',
      ruta: `/account_deletion_requests?select=${COLUMNAS_ELIMINACION}`,
      cuerpo: {
        user_id: parametros.usuarioId,
        requested_at: ahora.toISOString(),
        scheduled_for: programada.toISOString(),
      },
      prefer: 'return=representation',
    });

    const fila = (await exigir(respuesta, 'crear:account_deletion_requests'))[0];
    if (fila === undefined) {
      throw rest.comoError(
        { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
        'crear:account_deletion_requests',
      );
    }
    return fila;
  }

  /** Solicitud pendiente, si la hay. La pantalla necesita saberlo para avisar. */
  async function eliminacionPendiente(usuarioId: string): Promise<FilaEliminacion | null> {
    const respuesta = await rest.peticion<FilaEliminacion>({
      metodo: 'GET',
      ruta:
        `/account_deletion_requests?user_id=eq.${usuarioId}&status=eq.pendiente` +
        `&select=${COLUMNAS_ELIMINACION}`,
    });
    return (await exigir(respuesta, 'leer:account_deletion_requests'))[0] ?? null;
  }

  /**
   * Cancela la solicitud.
   *
   * Tiene que poder hacerse hasta el último momento y sin fricción: es el
   * único motivo por el que existe el periodo de gracia.
   */
  async function cancelarEliminacion(parametros: {
    readonly usuarioId: string;
    readonly solicitudId: string;
  }): Promise<FilaEliminacion | null> {
    const respuesta = await rest.peticion<FilaEliminacion>({
      metodo: 'PATCH',
      ruta:
        `/account_deletion_requests?id=eq.${parametros.solicitudId}` +
        `&user_id=eq.${parametros.usuarioId}&select=${COLUMNAS_ELIMINACION}`,
      cuerpo: { status: 'cancelada', cancelled_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'cancelar:account_deletion_requests'))[0] ?? null;
  }

  return {
    leerPerfil,
    guardarPerfil,
    leerAjustes,
    guardarAjustes,
    listarDispositivos,
    revocarDispositivo,
    solicitarEliminacion,
    eliminacionPendiente,
    cancelarEliminacion,
  };
}

export type RepositorioPerfil = ReturnType<typeof crearRepositorioPerfil>;
