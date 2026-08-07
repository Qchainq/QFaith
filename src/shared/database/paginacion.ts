// Paginar sin descifrar de más.
//
// ── El problema que resuelve ──────────────────────────────────────────────
//
// Una lista cifrada tiene un coste que una lista normal no tiene: para
// enseñar doce entradas hay que descifrar doce, pero para saber **cuáles**
// son las doce primeras hay que poder ordenarlas, y ordenar suele necesitar
// el contenido. Escrito de la forma evidente —descifrar todo y luego cortar—
// el coste de abrir la pantalla crece con todo lo que la persona ha escrito
// en su vida, aunque en la pantalla quepan siempre las mismas doce.
//
// La medida está en `rendimiento.medicion.test.ts`: la lista del Diario
// costaba 94 ms con 300 entradas y 961 ms con 3000, en un servidor. El
// presupuesto del Documento 14 para una consulta local frecuente es 100 ms, y
// un teléfono es más lento que esto. Alguien que escribe a diario durante
// cinco años llega a las 1800 entradas sin hacer nada raro.
//
// ── La condición que impone ───────────────────────────────────────────────
//
// **Se ordena por metadatos en claro.** Eso es lo que hace posible cortar
// antes de descifrar, y es también un límite honesto: un módulo que necesite
// ordenar por algo que solo está dentro del sobre no puede paginar, y la
// respuesta correcta ahí no es descifrarlo todo sino sacar ese campo a los
// metadatos —decidiendo a la vez, y a la vista, qué pasa a saber el
// servidor—. No hay forma de tener las dos cosas.
//
// Lo que sí queda cifrado es el contenido. Ordenar el Diario por fecha de
// entrada no le dice al servidor nada que no supiera ya: `entry_date` está en
// claro en el esquema desde el Documento 12, precisamente para esto.
import type { RegistroLocal } from './tipos';

/** Cuántos elementos trae una página si nadie dice otra cosa. */
export const TAMANO_PAGINA = 30;

export interface OpcionesPagina {
  readonly limite?: number;
  /** Índice del primer elemento de la página, dentro del total ordenado. */
  readonly desde?: number;
}

export interface Pagina<T> {
  readonly elementos: readonly T[];
  /** Cuántos hay en total. Se sabe sin descifrar ninguno. */
  readonly total: number;
  /**
   * Desde dónde pedir la siguiente página, o `null` si no hay más.
   *
   * Se devuelve calculado en lugar de dejar que lo sume quien llama: sumar
   * `elementos.length` sería el error natural y estaría mal, porque los
   * ilegibles no llegan a la lista y la página se saltaría tantos elementos
   * como registros no se hayan podido abrir.
   */
  readonly siguiente: number | null;
  /**
   * Registros de **esta página** que no se pudieron descifrar.
   *
   * Solo de esta página: saber cuántos hay en total exigiría descifrarlas
   * todas, que es justo lo que se está evitando. Quien pinta la lista suma
   * los de las páginas que ha ido cargando, y así el número que ve la persona
   * crece según avanza en lugar de mentir en ninguna dirección. Nunca se
   * esconden: a quien le falte algo suyo le corresponde saberlo.
   */
  readonly ilegibles: number;
}

/**
 * Ordena por metadatos, corta la página y descifra **solo** esa.
 *
 * `leer` devuelve `null` para un registro que no abre. No se descarta en
 * silencio: se cuenta.
 */
export function paginarDescifrando<T>(parametros: {
  readonly registros: readonly RegistroLocal[];
  /** Comparador sobre registros sin abrir. Ver la cabecera de este archivo. */
  readonly ordenar: (a: RegistroLocal, b: RegistroLocal) => number;
  readonly leer: (registro: RegistroLocal) => T | null;
  readonly opciones?: OpcionesPagina;
}): Pagina<T> {
  const limite = Math.max(1, parametros.opciones?.limite ?? TAMANO_PAGINA);
  const desde = Math.max(0, parametros.opciones?.desde ?? 0);

  const ordenados = [...parametros.registros].sort(parametros.ordenar);
  const total = ordenados.length;
  const ventana = ordenados.slice(desde, desde + limite);

  const elementos: T[] = [];
  let ilegibles = 0;
  for (const registro of ventana) {
    const leido = parametros.leer(registro);
    if (leido === null) ilegibles += 1;
    else elementos.push(leido);
  }

  const fin = desde + ventana.length;
  return { elementos, total, siguiente: fin < total ? fin : null, ilegibles };
}
