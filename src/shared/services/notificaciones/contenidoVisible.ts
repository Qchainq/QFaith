// Qué se ve en una pantalla bloqueada.
//
// El Documento 13 llama a esto «la regla que más se incumple», y tiene razón:
// el texto de una notificación lo escribe cualquiera, siempre parece
// inofensivo visto de cerca, y lo lee quien coja el teléfono de la mesa.
//
// ── La decisión de diseño ─────────────────────────────────────────────────
//
// **El texto no se compone: se elige.** Ninguna función de este archivo
// acepta el contenido de la persona. Se pasa una categoría y sale una clave
// de i18n de un catálogo cerrado. Una firma como `avisar(texto: string)`
// acabaría con «Recuerda orar por la enfermedad de María» en una pantalla
// bloqueada, no por mala fe sino porque en el sitio donde se llama ese texto
// está a mano y parece lo más útil.
//
// ── La vista previa, y qué significa exactamente ──────────────────────────
//
// El documento pide dos cosas que hay que leer juntas: la vista previa está
// **desactivada por defecto** y solo la activa el usuario; y hay una lista de
// cosas que **nunca** se muestran —texto de una oración, el nombre de una
// persona en una petición, contenido del diario, estado espiritual,
// confesiones, respuestas de la IA, detalles de una crisis, notas privadas de
// sermón—.
//
// Las dos a la vez solo encajan de una manera, y conviene dejarla escrita
// porque es una interpretación: **la vista previa decide cuánto se nombra el
// área, nunca si se muestra contenido.** Apagada, el aviso dice «Tienes un
// recordatorio en QFaith». Encendida, dice «Tu momento de oración». Lo de la
// lista no sale en ninguno de los dos casos, y por eso ni siquiera entra en
// este archivo.
//
// La opción existe porque hay motivos legítimos para quererla en los dos
// sentidos: quien vive solo prefiere saber de qué va sin desbloquear, y quien
// comparte casa prefiere que su teléfono no anuncie que lleva un diario
// espiritual. Ninguna de las dos es la respuesta correcta para todos, y por
// eso se pregunta. Lo que no se pregunta es lo otro: eso no sale nunca.
import type { Categoria } from './politica';

/**
 * Cuánto se nombra en la pantalla bloqueada.
 *
 * `generico` es el valor por defecto y el que se usa cuando hay cualquier
 * duda: no dice ni de qué módulo se trata.
 */
export const DETALLES = ['generico', 'area'] as const;
export type Detalle = (typeof DETALLES)[number];

/** Privacidad por defecto: sin vista previa mientras nadie diga lo contrario. */
export const DETALLE_POR_DEFECTO: Detalle = 'generico';

export interface ContenidoVisible {
  /** Clave de i18n del título. Nunca un literal (invariante 8). */
  readonly claveTitulo: string;
  readonly claveCuerpo: string;
}

/**
 * Aviso completamente neutro.
 *
 * No dice de qué módulo es. Es lo que se ve con la vista previa apagada y lo
 * que se usa ante cualquier categoría que este archivo no conozca: una
 * categoría nueva empieza siendo genérica hasta que alguien decida su texto a
 * conciencia, y no al revés.
 */
const GENERICO: ContenidoVisible = {
  claveTitulo: 'notificaciones.visible.generico.titulo',
  claveCuerpo: 'notificaciones.visible.generico.cuerpo',
};

/**
 * Textos por área, para cuando la persona ha pedido ver algo más.
 *
 * Cada uno nombra el área y **nada más**. Ninguno admite interpolación: sin
 * huecos donde meter un valor no hay forma de colar el nombre de nadie.
 */
const POR_AREA: Readonly<Partial<Record<Categoria, ContenidoVisible>>> = {
  habito: {
    claveTitulo: 'notificaciones.visible.habito.titulo',
    claveCuerpo: 'notificaciones.visible.habito.cuerpo',
  },
  oracion: {
    claveTitulo: 'notificaciones.visible.oracion.titulo',
    claveCuerpo: 'notificaciones.visible.oracion.cuerpo',
  },
  devocional: {
    claveTitulo: 'notificaciones.visible.devocional.titulo',
    claveCuerpo: 'notificaciones.visible.devocional.cuerpo',
  },
  lectura: {
    claveTitulo: 'notificaciones.visible.lectura.titulo',
    claveCuerpo: 'notificaciones.visible.lectura.cuerpo',
  },
  sermon: {
    claveTitulo: 'notificaciones.visible.sermon.titulo',
    claveCuerpo: 'notificaciones.visible.sermon.cuerpo',
  },
  evento: {
    claveTitulo: 'notificaciones.visible.evento.titulo',
    claveCuerpo: 'notificaciones.visible.evento.cuerpo',
  },
  iglesia: {
    claveTitulo: 'notificaciones.visible.iglesia.titulo',
    claveCuerpo: 'notificaciones.visible.iglesia.cuerpo',
  },
  respaldo: {
    claveTitulo: 'notificaciones.visible.respaldo.titulo',
    claveCuerpo: 'notificaciones.visible.respaldo.cuerpo',
  },
  resumen: {
    claveTitulo: 'notificaciones.visible.resumen.titulo',
    claveCuerpo: 'notificaciones.visible.resumen.cuerpo',
  },
  promocional: {
    claveTitulo: 'notificaciones.visible.promocional.titulo',
    claveCuerpo: 'notificaciones.visible.promocional.cuerpo',
  },
};

/**
 * Texto de seguridad. **No depende de la vista previa.**
 *
 * Un aviso de inicio de sesión sospechoso que dijera «Tienes un recordatorio»
 * no serviría para nada: quien lo lee tiene que entender que hay algo que
 * mirar ahora. Y no revela nada privado, porque no habla del contenido de
 * nadie sino de la cuenta.
 */
const SEGURIDAD: ContenidoVisible = {
  claveTitulo: 'notificaciones.visible.seguridad.titulo',
  claveCuerpo: 'notificaciones.visible.seguridad.cuerpo',
};

/**
 * Qué se enseña para esta categoría.
 *
 * Solo recibe la categoría y la preferencia. No hay parámetro por el que
 * pueda entrar nada de la persona, y esa ausencia es la garantía: las demás
 * reglas de este archivo se pueden incumplir por descuido, esta no se puede
 * incumplir sin cambiar la firma.
 */
export function contenidoVisible(categoria: Categoria, detalle: Detalle): ContenidoVisible {
  if (categoria === 'seguridad') return SEGURIDAD;
  if (detalle !== 'area') return GENERICO;
  return POR_AREA[categoria] ?? GENERICO;
}

/** Todas las claves que este archivo puede llegar a pedir, para comprobarlas. */
export const CLAVES_VISIBLES: readonly string[] = [
  ...new Set(
    [GENERICO, SEGURIDAD, ...Object.values(POR_AREA)].flatMap((contenido) => [
      contenido.claveTitulo,
      contenido.claveCuerpo,
    ]),
  ),
];
