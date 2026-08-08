// Qué se comprueba antes de abrir lo que una notificación señala.
//
// El Documento 13 da seis comprobaciones **y su orden**. El orden es la
// mitad de la regla: comprobar que el recurso existe antes de comprobar que
// hay sesión abierta ya habría dicho algo a quien no debía —que ese registro
// existe— aunque después no se enseñara nada.
//
//   1. Sesión abierta.
//   2. Dispositivo autorizado.
//   3. Permisos sobre el recurso.
//   4. El recurso existe.
//   5. Desbloqueo biométrico si el contenido es privado.
//   6. Nada si la persona cerró sesión.
//
// La sexta es la primera vista al revés, y por eso aquí son una: si no hay
// sesión no se enseña nada, ni siquiera un mensaje que explique por qué.
//
// ── Por qué esto es una función pura ──────────────────────────────────────
//
// La decisión no vive dentro del componente que navega. Un `if` repartido por
// una pantalla se salta el día que alguien añade un atajo desde el widget o
// una acción rápida de la notificación, que es justo el camino que el
// documento señala como el que expone contenido sin desbloquear. Aquí la
// decisión es un dato, se prueba sola, y quien navegue tiene que pasar por
// ella.
import { CATEGORIAS, type Categoria } from './politica';

/**
 * Categorías cuyo destino es contenido privado de la persona.
 *
 * Estas exigen desbloqueo antes de abrirse. Es una lista de las que **sí**,
 * no de las que no: una categoría nueva que nadie clasifique acabará pidiendo
 * desbloqueo de más, que es el error barato.
 */
const PRIVADAS: readonly Categoria[] = [
  'habito',
  'oracion',
  'devocional',
  'lectura',
  'sermon',
  'resumen',
];

export const llevaAContenidoPrivado = (categoria: Categoria): boolean =>
  PRIVADAS.includes(categoria);

/** Motivos por los que no se abre. Cada uno tiene su texto, sin detalles. */
export const MOTIVOS = [
  'sinSesion',
  'dispositivoNoAutorizado',
  'sinPermiso',
  'noExiste',
  'requiereDesbloqueo',
] as const;
export type Motivo = (typeof MOTIVOS)[number];

export interface EstadoApertura {
  readonly haySesion: boolean;
  readonly dispositivoAutorizado: boolean;
  readonly tienePermiso: boolean;
  readonly recursoExiste: boolean;
  readonly desbloqueada: boolean;
}

export type Decision =
  | { readonly abre: true; readonly categoria: Categoria }
  | { readonly abre: false; readonly motivo: Motivo };

/**
 * ¿Se puede abrir esto?
 *
 * Cuando no, se dice **por qué en términos genéricos** y nunca qué había
 * detrás. «Esa oración ya no existe» confirma que existió, y quien tenga el
 * teléfono de otra persona en la mano no tiene por qué enterarse de eso.
 */
export function decidirApertura(parametros: {
  readonly categoria: Categoria;
  readonly estado: EstadoApertura;
}): Decision {
  const { categoria, estado } = parametros;

  // El orden es la regla, no una preferencia. Ver la cabecera.
  if (!estado.haySesion) return { abre: false, motivo: 'sinSesion' };
  if (!estado.dispositivoAutorizado) {
    return { abre: false, motivo: 'dispositivoNoAutorizado' };
  }
  if (!estado.tienePermiso) return { abre: false, motivo: 'sinPermiso' };
  if (!estado.recursoExiste) return { abre: false, motivo: 'noExiste' };

  if (llevaAContenidoPrivado(categoria) && !estado.desbloqueada) {
    // No es un rechazo: es un paso previo. Quien llame debe pedir el
    // desbloqueo y volver a preguntar.
    return { abre: false, motivo: 'requiereDesbloqueo' };
  }

  return { abre: true, categoria };
}

/**
 * Clave de i18n del mensaje que se enseña cuando no se abre.
 *
 * Existe para que ninguna pantalla componga el suyo: un mensaje escrito a
 * mano acabaría diciendo de más justo en el caso en que menos conviene.
 */
export const claveDeMotivo = (motivo: Motivo): string => `notificaciones.apertura.${motivo}`;

/** Todas las categorías, para poder comprobar que ninguna queda sin clasificar. */
export const CATEGORIAS_CONOCIDAS = CATEGORIAS;
