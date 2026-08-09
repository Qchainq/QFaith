// Casos de uso de Perfil y Configuración.
//
// Aquí viven tres reglas de seguridad que no pueden quedarse en la pantalla,
// porque una pantalla se reescribe y una regla no:
//
//   1. **No se puede activar el bloqueo biométrico en un dispositivo sin
//      biometría.** El servicio de biometría, ante un dispositivo sin
//      hardware, da el desbloqueo por bueno para no dejar a nadie fuera de sus
//      propios datos para siempre. Eso está bien como último recurso, pero
//      convierte el ajuste en un adorno: quedaría encendido sin proteger nada.
//      Se comprueba antes de guardarlo.
//
//   2. **Revocar el dispositivo actual no es revocar: es cerrar sesión.** Si
//      se permitiera desde la lista, la persona se quedaría mirando una
//      aplicación que ya no puede sincronizar sin entender por qué.
//
//   3. **Eliminar la cuenta pasa siempre por el periodo de gracia.** No hay
//      camino que borre en el acto.
import { ErrorApp } from '@shared/errores/erroresApp';
// La política de notificaciones es la dueña de estos topes: repetirlos aquí
// como números sueltos crearía dos verdades que se separarían.
import { limitesValidos, LIMITES_MAXIMOS } from '@shared/services/notificaciones/politica';
import { MINUTOS_POR_DIA } from '@shared/services/notificaciones/programacion';
import { consultarBiometria } from '@shared/services/keys/almacenSeguro';
import type {
  FilaAjustes,
  FilaDispositivo,
  FilaEliminacion,
  FilaPerfil,
  RepositorioPerfil,
} from '@shared/services/supabase/repositorioPerfil';
import { segundosValidos } from '@shared/services/seguridad/bloqueoAutomatico';

import {
  DIAS_DE_GRACIA,
  esquemaPerfil,
  IDIOMAS,
  TEMAS,
  type Ajustes,
  type BorradorPerfil,
  type Dispositivo,
  type EstadoDispositivo,
  type Idioma,
  type Perfil,
  esDetalleNotificacion,
  type DetalleNotificacion,
  type SolicitudEliminacion,
  type Tema,
} from '../models/perfil';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'PERFIL_INVALIDO',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

/**
 * Los ajustes de quien todavía no ha elegido nada.
 *
 * Se exporta porque la pantalla los necesita mientras la consulta carga, y
 * tenerlos escritos dos veces era el camino corto a que la aplicación se
 * comportara de una manera antes de cargar y de otra después.
 */
export const AJUSTES_POR_DEFECTO: Ajustes = {
  tema: 'system',
  escalaTexto: 1,
  notificaciones: true,
  analitica: false,
  bloqueoBiometrico: false,
  segundosBloqueo: 60,
  respaldoEnNube: true,
  descargasSoloWifi: false,
  // Los mismos valores discretos que usa el servicio de notificaciones si
  // nadie ha elegido nada. Están aquí también porque este objeto es lo que se
  // devuelve cuando la fila todavía no existe.
  detalleNotificacion: 'generico',
  silencioDesde: 22 * 60,
  silencioHasta: 7 * 60,
  maxEspiritualesAlDia: LIMITES_MAXIMOS.espiritualesAlDia,
  maxResumenesAlDia: LIMITES_MAXIMOS.resumenesAlDia,
  maxPromocionalesALaSemana: LIMITES_MAXIMOS.promocionalesALaSemana,
  aceptaPromocionales: false,
};

/** Un minuto del día, o el de partida si llega uno imposible. */
const minutoValido = (valor: number, porDefecto: number): number =>
  Number.isFinite(valor) && valor >= 0 && valor < MINUTOS_POR_DIA ? Math.trunc(valor) : porDefecto;

const esIdioma = (valor: string): valor is Idioma => (IDIOMAS as readonly string[]).includes(valor);
const esTema = (valor: string): valor is Tema => (TEMAS as readonly string[]).includes(valor);

const ESTADOS: readonly EstadoDispositivo[] = ['active', 'revoked', 'lost', 'inactive'];
const esEstado = (valor: string): valor is EstadoDispositivo =>
  (ESTADOS as readonly string[]).includes(valor);

export function aPerfil(fila: FilaPerfil): Perfil {
  return {
    id: fila.id,
    nombre: fila.display_name,
    idioma: esIdioma(fila.language_code) ? fila.language_code : 'es',
    zonaHoraria: fila.timezone,
    pais: fila.country_code,
    anoNacimiento: fila.birth_year,
    onboardingCompletado: fila.onboarding_completed,
  };
}

export function aAjustes(fila: FilaAjustes | null): Ajustes {
  if (fila === null) return AJUSTES_POR_DEFECTO;
  return {
    tema: esTema(fila.theme) ? fila.theme : 'system',
    escalaTexto: fila.font_scale,
    notificaciones: fila.notifications_enabled,
    analitica: fila.analytics_enabled,
    bloqueoBiometrico: fila.biometric_lock_enabled,
    segundosBloqueo: segundosValidos(fila.auto_lock_seconds),
    respaldoEnNube: fila.cloud_backup_enabled,
    descargasSoloWifi: fila.wifi_only_downloads,
    detalleNotificacion: esDetalleNotificacion(fila.notification_detail)
      ? fila.notification_detail
      : 'generico',
    silencioDesde: minutoValido(fila.quiet_from_minute, AJUSTES_POR_DEFECTO.silencioDesde),
    silencioHasta: minutoValido(fila.quiet_to_minute, AJUSTES_POR_DEFECTO.silencioHasta),
    // Los techos se recortan al leerlos, no solo al escribirlos: una fila
    // manipulada en el servidor no puede conceder más avisos de los que el
    // Documento 13 permite.
    ...limitesLeidos(fila),
    aceptaPromocionales: fila.promotional_consent,
  };
}

/** Los tres techos, recortados a lo que el documento permite. Ver arriba. */
function limitesLeidos(fila: FilaAjustes) {
  const validos = limitesValidos({
    espiritualesAlDia: fila.max_spiritual_per_day,
    resumenesAlDia: fila.max_summaries_per_day,
    promocionalesALaSemana: fila.max_promotional_per_week,
  });
  return {
    maxEspiritualesAlDia: validos.espiritualesAlDia,
    maxResumenesAlDia: validos.resumenesAlDia,
    maxPromocionalesALaSemana: validos.promocionalesALaSemana,
  };
}

export function aDispositivo(
  fila: FilaDispositivo,
  dispositivoActualId: string | null,
): Dispositivo {
  return {
    id: fila.id,
    nombre: fila.device_name,
    plataforma: fila.platform,
    estado: esEstado(fila.status) ? fila.status : 'inactive',
    vistoEn: fila.last_seen_at,
    revocadoEn: fila.revoked_at,
    esEste: fila.id === dispositivoActualId,
  };
}

export function aSolicitud(fila: FilaEliminacion): SolicitudEliminacion {
  return {
    id: fila.id,
    solicitadaEn: fila.requested_at,
    programadaPara: fila.scheduled_for,
  };
}

export async function cargarPerfil(
  repositorio: RepositorioPerfil,
  usuarioId: string,
): Promise<Perfil | null> {
  const fila = await repositorio.leerPerfil(usuarioId);
  return fila === null ? null : aPerfil(fila);
}

export async function guardarPerfil(
  repositorio: RepositorioPerfil,
  usuarioId: string,
  borrador: BorradorPerfil,
): Promise<Perfil> {
  const validado = esquemaPerfil.safeParse({
    ...borrador,
    nombre: borrador.nombre === null ? null : borrador.nombre.trim(),
    pais: borrador.pais === null ? null : borrador.pais.trim().toUpperCase(),
  });

  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  // Un nombre en blanco es «sin nombre», no una cadena vacía: guardarla
  // dejaría una fila que dice que la persona se llama «».
  const nombre =
    validado.data.nombre === null || validado.data.nombre.length === 0
      ? null
      : validado.data.nombre;

  return aPerfil(
    await repositorio.guardarPerfil({
      usuarioId,
      nombre,
      idioma: validado.data.idioma,
      zonaHoraria: validado.data.zonaHoraria,
      pais: validado.data.pais,
      anoNacimiento: validado.data.anoNacimiento,
    }),
  );
}

export async function cargarAjustes(
  repositorio: RepositorioPerfil,
  usuarioId: string,
): Promise<Ajustes> {
  return aAjustes(await repositorio.leerAjustes(usuarioId));
}

export interface CambioAjustes {
  readonly tema?: Tema;
  readonly notificaciones?: boolean;
  readonly analitica?: boolean;
  readonly bloqueoBiometrico?: boolean;
  readonly segundosBloqueo?: number;
  readonly respaldoEnNube?: boolean;
  readonly descargasSoloWifi?: boolean;
  readonly detalleNotificacion?: DetalleNotificacion;
  readonly silencioDesde?: number;
  readonly silencioHasta?: number;
  readonly maxEspiritualesAlDia?: number;
  readonly maxResumenesAlDia?: number;
  readonly maxPromocionalesALaSemana?: number;
  readonly aceptaPromocionales?: boolean;
}

/**
 * Guarda un cambio de ajustes.
 *
 * `comprobarBiometria` se inyecta para poder probarlo sin un dispositivo real.
 */
export async function guardarAjustes(
  repositorio: RepositorioPerfil,
  usuarioId: string,
  cambio: CambioAjustes,
  comprobarBiometria: typeof consultarBiometria = consultarBiometria,
): Promise<Ajustes> {
  if (cambio.bloqueoBiometrico === true) {
    const estado = await comprobarBiometria();
    if (!estado.disponible || !estado.configurada) {
      // Ver la regla 1 de la cabecera: encenderlo aquí dejaría un interruptor
      // que dice que protege y no protege.
      throw new ErrorApp({
        codigo: 'BIOMETRIA_NO_DISPONIBLE',
        categoria: 'permisos',
        claveMensaje: estado.disponible
          ? 'perfil.errores.biometriaSinConfigurar'
          : 'perfil.errores.biometriaNoDisponible',
        puedeReintentarse: false,
      });
    }
  }

  const cuerpo: Record<string, string | number | boolean> = {};
  if (cambio.tema !== undefined) cuerpo.theme = cambio.tema;
  if (cambio.notificaciones !== undefined) cuerpo.notifications_enabled = cambio.notificaciones;
  if (cambio.analitica !== undefined) cuerpo.analytics_enabled = cambio.analitica;
  if (cambio.bloqueoBiometrico !== undefined) {
    cuerpo.biometric_lock_enabled = cambio.bloqueoBiometrico;
  }
  if (cambio.segundosBloqueo !== undefined) {
    cuerpo.auto_lock_seconds = segundosValidos(cambio.segundosBloqueo);
  }
  if (cambio.respaldoEnNube !== undefined) cuerpo.cloud_backup_enabled = cambio.respaldoEnNube;
  if (cambio.descargasSoloWifi !== undefined) {
    cuerpo.wifi_only_downloads = cambio.descargasSoloWifi;
  }
  if (cambio.detalleNotificacion !== undefined) {
    cuerpo.notification_detail = cambio.detalleNotificacion;
  }
  if (cambio.silencioDesde !== undefined) {
    cuerpo.quiet_from_minute = minutoValido(
      cambio.silencioDesde,
      AJUSTES_POR_DEFECTO.silencioDesde,
    );
  }
  if (cambio.silencioHasta !== undefined) {
    cuerpo.quiet_to_minute = minutoValido(cambio.silencioHasta, AJUSTES_POR_DEFECTO.silencioHasta);
  }
  // Se recortan al escribirlos **y** al leerlos. Aquí porque es donde todavía
  // se puede evitar guardar una barbaridad; allí porque lo que llega del
  // servidor no tiene por qué haber pasado por aquí.
  if (cambio.maxEspiritualesAlDia !== undefined) {
    cuerpo.max_spiritual_per_day = limitesValidos({
      espiritualesAlDia: cambio.maxEspiritualesAlDia,
    }).espiritualesAlDia;
  }
  if (cambio.maxResumenesAlDia !== undefined) {
    cuerpo.max_summaries_per_day = limitesValidos({
      resumenesAlDia: cambio.maxResumenesAlDia,
    }).resumenesAlDia;
  }
  if (cambio.maxPromocionalesALaSemana !== undefined) {
    cuerpo.max_promotional_per_week = limitesValidos({
      promocionalesALaSemana: cambio.maxPromocionalesALaSemana,
    }).promocionalesALaSemana;
  }
  if (cambio.aceptaPromocionales !== undefined) {
    cuerpo.promotional_consent = cambio.aceptaPromocionales;
  }

  return aAjustes(await repositorio.guardarAjustes(usuarioId, cuerpo));
}

export async function listarDispositivos(
  repositorio: RepositorioPerfil,
  usuarioId: string,
  dispositivoActualId: string | null,
): Promise<readonly Dispositivo[]> {
  const filas = await repositorio.listarDispositivos(usuarioId);
  return filas.map((fila) => aDispositivo(fila, dispositivoActualId));
}

/**
 * Revoca un dispositivo que no es este.
 *
 * Ver la regla 2 de la cabecera. Revocar el actual se rechaza en lugar de
 * hacerlo en silencio: el camino correcto es cerrar sesión, que además
 * descarta las claves de la memoria.
 */
export async function revocarDispositivo(
  repositorio: RepositorioPerfil,
  parametros: {
    readonly usuarioId: string;
    readonly dispositivoId: string;
    readonly dispositivoActualId: string | null;
  },
): Promise<Dispositivo | null> {
  if (parametros.dispositivoId === parametros.dispositivoActualId) {
    throw errorValidacion('perfil.errores.noRevocarEsteDispositivo');
  }

  const fila = await repositorio.revocarDispositivo({
    usuarioId: parametros.usuarioId,
    dispositivoId: parametros.dispositivoId,
  });
  return fila === null ? null : aDispositivo(fila, parametros.dispositivoActualId);
}

export async function eliminacionPendiente(
  repositorio: RepositorioPerfil,
  usuarioId: string,
): Promise<SolicitudEliminacion | null> {
  const fila = await repositorio.eliminacionPendiente(usuarioId);
  return fila === null ? null : aSolicitud(fila);
}

export async function solicitarEliminacion(
  repositorio: RepositorioPerfil,
  usuarioId: string,
): Promise<SolicitudEliminacion> {
  return aSolicitud(
    await repositorio.solicitarEliminacion({ usuarioId, diasDeGracia: DIAS_DE_GRACIA }),
  );
}

export async function cancelarEliminacion(
  repositorio: RepositorioPerfil,
  parametros: { readonly usuarioId: string; readonly solicitudId: string },
): Promise<void> {
  await repositorio.cancelarEliminacion(parametros);
}
