// Qué se puede medir, escrito como tipos.
//
// El Documento 14 da dos listas. La de permitido —sesiones, versión, sistema
// operativo, rendimiento, errores, pantallas de forma agregada, adopción de
// funciones, conversión de suscripción, fallos de sincronización— y la de
// prohibido: contenido del diario, texto de oraciones, **estado espiritual
// concreto**, conversaciones con IA, nombres en peticiones, confesiones,
// contenido del Modo Arca, texto de notas privadas.
//
// ── La decisión de diseño ─────────────────────────────────────────────────
//
// La lista de prohibido no se comprueba: se hace **imposible**. Un servicio
// que acepte `registrar(nombre: string, datos: object)` y confíe en que nadie
// meta ahí un título del diario acaba con un título del diario dentro, porque
// basta un descuido en un módulo dentro de dos años. Así que aquí:
//
//   1. **El vocabulario es cerrado.** Los eventos son una unión discriminada.
//      No existe forma de enviar uno que no esté en esta lista.
//   2. **Ningún campo acepta texto libre.** Los valores son números,
//      booleanos y enumeraciones declaradas aquí. El único campo de tipo
//      cadena —el código de error— exige una forma que ninguna frase escrita
//      por una persona cumple.
//   3. **No viaja ningún identificador de cuenta.** «De forma agregada» dice
//      el documento, y una analítica con el identificador de la persona
//      dentro no es agregada por mucho que se llame así.
//
// Añadir una métrica obliga a añadir su línea aquí, y eso es lo que se quiere:
// que ampliar lo que se mide sea una decisión visible y revisable, no algo
// que se cuela en un módulo.
//
// ── Lo que deliberadamente no está ────────────────────────────────────────
//
// El Pulso Espiritual tiene evento —saber cuánta gente lo usa está
// permitido— y **no lleva el ánimo**. `mood_code` es «estado espiritual
// concreto», que está en la lista de prohibido y además es de las cosas más
// íntimas que guarda la aplicación. Se cuenta que alguien respondió, nunca
// qué respondió.
//
// Tampoco está el identificador de una entrada, oración o memorial. Un
// identificador no dice qué escribió alguien, pero permite contar cuántas
// entradas tiene y cuándo las escribe, y eso ya es un retrato.

/** Pantallas que existen. Cerrada a propósito: ver decisión 1. */
export const PANTALLAS = [
  'inicio',
  'biblia',
  'oracion',
  'ia',
  'perfil',
  'diario',
  'habitos',
  'biblioteca',
  'memorial',
  'iglesia',
  'sermones',
  'pulso',
  'planes',
  'suscripcion',
  'exportacion',
  'configuracion',
] as const;
export type Pantalla = (typeof PANTALLAS)[number];

/** Funciones cuya adopción se mide. Nunca su contenido. */
export const FUNCIONES = [
  'diario.escribir',
  'oracion.pedir',
  'oracion.responder',
  'habito.registrar',
  'memorial.recordar',
  'biblia.subrayar',
  'biblia.marcar',
  'biblia.anotar',
  'plan.inscribirse',
  'plan.completar-dia',
  // Que se usó, no qué se contestó. Ver la cabecera.
  'pulso.responder',
  'ia.conversar',
  'sermon.anotar',
  'archivo.adjuntar',
  'exportacion.generar',
  'copia.restaurar',
] as const;
export type Funcion = (typeof FUNCIONES)[number];

/** Operaciones cuyo tiempo se mide, contra los presupuestos del Documento 14. */
export const OPERACIONES_MEDIDAS = [
  'inicio-frio',
  'inicio-caliente',
  'abrir-contenido-privado',
  'consulta-local',
  'sincronizacion',
  'exportacion',
] as const;
export type OperacionMedida = (typeof OPERACIONES_MEDIDAS)[number];

/** Categorías de error, las mismas de `ErrorApp`. */
export const CATEGORIAS_ERROR = [
  'validacion',
  'autenticacion',
  'permisos',
  'servidor',
  'sincronizacion',
  'conectividad',
  'cifrado',
] as const;

/** Pasos de la conversión de suscripción. Nunca el precio ni el recibo. */
export const PASOS_SUSCRIPCION = [
  'pantalla-vista',
  'compra-iniciada',
  'compra-cancelada',
  'compra-completada',
  'restauracion-solicitada',
] as const;
export type PasoSuscripcion = (typeof PASOS_SUSCRIPCION)[number];

/**
 * Forma que debe tener un código de error para poder medirse.
 *
 * Mayúsculas, dígitos y guiones bajos, de tres a cuarenta caracteres. No es
 * una convención de estilo: es el filtro que impide que un texto de la
 * persona llegue por el único campo de tipo cadena que existe aquí. Ninguna
 * frase escrita por nadie cumple esta forma, y las que lo intentaran no
 * cabrían.
 *
 * `ErrorApp` ya genera códigos así. Esto lo comprueba en lugar de confiarlo,
 * porque el día que alguien construya un `ErrorApp` con un código calculado a
 * partir de algo del usuario, ese código no debe salir del teléfono.
 */
export const FORMA_CODIGO_ERROR = /^[A-Z][A-Z0-9_]{2,39}$/;

export const esCodigoMedible = (codigo: string): boolean => FORMA_CODIGO_ERROR.test(codigo);

/**
 * Todo lo que se puede medir.
 *
 * Unión discriminada y no un nombre con datos sueltos: así el compilador
 * rechaza un evento inventado y un campo de más, y no hace falta que nadie se
 * acuerde de la regla.
 */
export type EventoAnalitica =
  | { readonly tipo: 'sesion.iniciada' }
  | { readonly tipo: 'sesion.terminada'; readonly segundos: number }
  | { readonly tipo: 'pantalla.abierta'; readonly pantalla: Pantalla }
  | { readonly tipo: 'funcion.usada'; readonly funcion: Funcion }
  | {
      readonly tipo: 'rendimiento.medido';
      readonly operacion: OperacionMedida;
      readonly milisegundos: number;
    }
  | {
      readonly tipo: 'error.ocurrido';
      readonly codigo: string;
      readonly categoria: (typeof CATEGORIAS_ERROR)[number];
      readonly puedeReintentarse: boolean;
    }
  | {
      readonly tipo: 'sincronizacion.fallida';
      readonly codigo: string;
      readonly pendientes: number;
    }
  | { readonly tipo: 'suscripcion.paso'; readonly paso: PasoSuscripcion };

/** Los nombres, para quien necesite recorrerlos. */
export const TIPOS_EVENTO = [
  'sesion.iniciada',
  'sesion.terminada',
  'pantalla.abierta',
  'funcion.usada',
  'rendimiento.medido',
  'error.ocurrido',
  'sincronizacion.fallida',
  'suscripcion.paso',
] as const;

const enLista = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  typeof valor === 'string' && (lista as readonly string[]).includes(valor);

const esNumeroSano = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;

/**
 * ¿Este evento se puede enviar?
 *
 * Los tipos ya lo garantizan en el código que compila, y esto lo vuelve a
 * comprobar en ejecución. No es desconfianza del compilador: es que un
 * `as`, un `any` de una biblioteca o un dato que llegue de la red pueden
 * saltarse los tipos, y lo que está en juego —contenido espiritual saliendo
 * del teléfono— no admite una única defensa.
 */
export function esEventoPermitido(evento: unknown): evento is EventoAnalitica {
  if (typeof evento !== 'object' || evento === null) return false;
  const e = evento as Record<string, unknown>;

  // Ningún evento lleva campos de más. Un campo que no esté declarado aquí es
  // exactamente por donde entraría el contenido que no debe salir.
  const camposDe = (...permitidos: readonly string[]): boolean =>
    Object.keys(e).every((clave) => clave === 'tipo' || permitidos.includes(clave));

  switch (e.tipo) {
    case 'sesion.iniciada':
      return camposDe();
    case 'sesion.terminada':
      return camposDe('segundos') && esNumeroSano(e.segundos);
    case 'pantalla.abierta':
      return camposDe('pantalla') && enLista(PANTALLAS, e.pantalla);
    case 'funcion.usada':
      return camposDe('funcion') && enLista(FUNCIONES, e.funcion);
    case 'rendimiento.medido':
      return (
        camposDe('operacion', 'milisegundos') &&
        enLista(OPERACIONES_MEDIDAS, e.operacion) &&
        esNumeroSano(e.milisegundos)
      );
    case 'error.ocurrido':
      return (
        camposDe('codigo', 'categoria', 'puedeReintentarse') &&
        typeof e.codigo === 'string' &&
        esCodigoMedible(e.codigo) &&
        enLista(CATEGORIAS_ERROR, e.categoria) &&
        typeof e.puedeReintentarse === 'boolean'
      );
    case 'sincronizacion.fallida':
      return (
        camposDe('codigo', 'pendientes') &&
        typeof e.codigo === 'string' &&
        esCodigoMedible(e.codigo) &&
        esNumeroSano(e.pendientes)
      );
    case 'suscripcion.paso':
      return camposDe('paso') && enLista(PASOS_SUSCRIPCION, e.paso);
    default:
      return false;
  }
}
