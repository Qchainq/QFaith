// Estado de suscripción, leído del servidor.
//
// **Solo lee.** La fila la escribe un proceso de servidor tras validar el
// recibo contra la tienda; el cliente ni siquiera tiene el privilegio de
// escribir en esa tabla. Si pudiera, cualquiera se concedería acceso de pago
// con una petición, y por eso este archivo no tiene ninguna función que
// escriba.
//
// El acceso de verdad lo decide `fn_tiene_acceso_premium` en la base de datos,
// que es quien gobierna las políticas del contenido de pago. Lo que se lee
// aquí sirve para **enseñar** el estado —qué plan, hasta cuándo, si hay que
// renovar—, nunca para decidirlo. Un cliente que decidiera su propio acceso
// sería un cliente al que basta con manipular.
import type { ClienteRest } from '@shared/services/supabase/rest';

/** Estados que puede tener una suscripción, según el esquema. */
export const ESTADOS_SUSCRIPCION = ['trialing', 'active', 'grace', 'canceled', 'expired'] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export interface Suscripcion {
  readonly plan: string;
  readonly estado: EstadoSuscripcion;
  readonly renuevaEn: string | null;
  /** Está cancelada pero el periodo pagado aún no se ha agotado. */
  readonly terminaAlAcabarElPeriodo: boolean;
  readonly enGraciaHasta: string | null;
}

interface FilaSuscripcion {
  readonly plan_code: string;
  readonly status: string;
  readonly current_period_end: string | null;
  readonly grace_until: string | null;
  readonly cancel_at_period_end: boolean;
}

const COLUMNAS = 'plan_code,status,current_period_end,grace_until,cancel_at_period_end';

const esEstado = (valor: string): valor is EstadoSuscripcion =>
  (ESTADOS_SUSCRIPCION as readonly string[]).includes(valor);

export function crearRepositorioSuscripcion(rest: ClienteRest) {
  /**
   * La suscripción vigente, o `null` si no hay ninguna.
   *
   * Pide la más reciente y no filtra por estado: el historial se conserva para
   * auditoría, y quien acaba de dejar de pagar tiene derecho a ver que su
   * suscripción figura como caducada en vez de encontrarse una pantalla que
   * dice que nunca pagó.
   */
  async function actual(): Promise<Suscripcion | null> {
    const respuesta = await rest.peticion<FilaSuscripcion>({
      metodo: 'GET',
      // Sin filtro de usuario: lo pone la política. Añadirlo aquí daría a
      // entender que el cliente decide qué suscripción es la suya.
      ruta: `/subscriptions?select=${COLUMNAS}&order=created_at.desc&limit=1`,
    });
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, 'leer:subscriptions');

    const fila = respuesta.filas[0];
    if (fila === undefined) return null;

    return {
      plan: fila.plan_code,
      // Un estado que esta versión no conoce se trata como caducado, nunca
      // como activo: ante la duda, no se concede acceso. Aunque aquí no se
      // conceda nada —eso lo hace la base—, la pantalla no debe prometer algo
      // que el servidor luego niegue.
      estado: esEstado(fila.status) ? fila.status : 'expired',
      renuevaEn: fila.current_period_end,
      terminaAlAcabarElPeriodo: fila.cancel_at_period_end,
      enGraciaHasta: fila.grace_until,
    };
  }

  return { actual };
}

export type RepositorioSuscripcion = ReturnType<typeof crearRepositorioSuscripcion>;
