// Cómo se adapta la aplicación al tamaño de la pantalla.
//
// El Documento 14 pide teléfonos pequeños, teléfonos grandes, plegables
// cuando sea viable, tabletas, vertical y horizontal, y termina con la frase
// que gobierna este archivo: **«No estirar interfaces móviles sin
// adaptación.»**
//
// ── Qué falla de verdad en una tableta ────────────────────────────────────
//
// No es que los botones queden pequeños. Es que una columna de texto de mil
// píxeles de ancho no se puede leer: el ojo pierde el renglón al volver a la
// izquierda. Es un límite de la lectura humana, no una moda, y en una
// aplicación cuyo contenido son diarios, oraciones y pasajes bíblicos importa
// más que en casi ninguna otra. Por eso lo primero que hace la adaptación es
// **poner un tope al ancho del contenido y centrarlo**, no repartir el texto
// por toda la pantalla.
//
// ── Y en un teléfono pequeño ──────────────────────────────────────────────
//
// Lo contrario: el margen generoso que hace respirar a un teléfono normal se
// come el ancho útil de uno de 320 puntos. Se reduce, sin bajar de un mínimo
// que dejaría el texto pegado al borde.
//
// ── Y en horizontal ───────────────────────────────────────────────────────
//
// Lo escaso es el alto. El margen superior se recorta para que el título no
// se coma media pantalla, y el lateral se mantiene: reducir el de arriba no
// afecta a la lectura, estrechar el de los lados sí.
//
// ── Por qué una función pura ──────────────────────────────────────────────
//
// La decisión no vive dentro de un componente sino aquí, en algo que recibe
// dos números y devuelve la medida. Así se puede comprobar el comportamiento
// en un iPhone SE, un plegable abierto y una tableta en horizontal sin
// ninguno de los tres delante, que es lo único que se puede hacer honestamente
// antes de tenerlos.
import { espaciado } from './tokens';

/**
 * Cortes de tamaño de ventana.
 *
 * Son los de Material Design, no inventados: 600 y 905 puntos. Coinciden con
 * la frontera real entre teléfono, teléfono grande o tableta pequeña, y
 * tableta, y son los que usan las dos plataformas para decidir lo mismo.
 */
export const CORTES = { medio: 600, amplio: 905 } as const;

export type TamanoPantalla = 'compacto' | 'medio' | 'amplio';
export type Orientacion = 'vertical' | 'horizontal';

/**
 * Ancho máximo de una columna de texto.
 *
 * A 16 puntos de cuerpo, 640 deja unos 70 caracteres por línea, dentro del
 * rango en que la lectura continuada no cansa. Por encima, el ojo empieza a
 * perder el renglón.
 */
export const ANCHO_MAXIMO_LECTURA = 640;

/** Por debajo de esto el texto queda pegado al borde. */
export const MARGEN_LATERAL_MINIMO = espaciado.md;

export interface MedidaPantalla {
  readonly tamano: TamanoPantalla;
  readonly orientacion: Orientacion;
  /** Ancho que debe ocupar el contenido, ya recortado. */
  readonly anchoDeContenido: number;
  readonly margenLateral: number;
  readonly margenSuperior: number;
  /**
   * Si el contenido debe centrarse.
   *
   * Solo cuando sobra sitio. Centrar en un teléfono no haría nada, pero
   * tenerlo como dato evita que cada pantalla lo deduzca por su cuenta y unas
   * lo hagan y otras no.
   */
  readonly seCentra: boolean;
}

const tamanoDe = (ancho: number): TamanoPantalla => {
  if (ancho >= CORTES.amplio) return 'amplio';
  if (ancho >= CORTES.medio) return 'medio';
  return 'compacto';
};

/**
 * La medida de esta pantalla.
 *
 * `ancho` y `alto` son los de la ventana, no los del dispositivo: en un
 * plegable y en una ventana partida de tableta no son lo mismo, y lo que
 * importa es el sitio del que se dispone ahora.
 */
export function medidaDe(ancho: number, alto: number): MedidaPantalla {
  const tamano = tamanoDe(ancho);
  const orientacion: Orientacion = ancho > alto ? 'horizontal' : 'vertical';

  // Un teléfono pequeño no puede permitirse el margen holgado; uno normal sí.
  const margenLateral = ancho < 360 ? MARGEN_LATERAL_MINIMO : espaciado.lg;

  // En horizontal lo escaso es el alto. Se recorta arriba, nunca a los lados.
  const margenSuperior = orientacion === 'horizontal' ? espaciado.md : espaciado.lg;

  // El tope de lectura, pero nunca más de lo que hay: en un teléfono el ancho
  // disponible manda, y un `max` al revés dejaría el contenido saliéndose.
  const disponible = Math.max(0, ancho - margenLateral * 2);
  const anchoDeContenido = Math.min(disponible, ANCHO_MAXIMO_LECTURA);

  return {
    tamano,
    orientacion,
    anchoDeContenido,
    margenLateral,
    margenSuperior,
    seCentra: anchoDeContenido < disponible,
  };
}
