// Clasificador de temas.
//
// Corre **en el dispositivo**, sobre texto ya descifrado, y es una heurística
// deliberadamente simple: un diccionario de palabras por tema. No usa IA y no
// consulta al servidor, porque para clasificar habría que enviar el texto y
// eso rompería el invariante 1.
//
// Sus límites son conocidos y aceptados: no entiende ironía ni contexto, y se
// equivocará. Por eso los temas **acompañan, no etiquetan a la persona**: son
// una forma de reencontrar lo que escribió, no un diagnóstico. Nada en la
// aplicación toma decisiones a partir de ellos.
import { TEMAS, type Tema } from '../models/biblioteca';

/**
 * Palabras por tema, en español e inglés.
 *
 * Se comparan sin acentos y en minúsculas, y por prefijo, para que «perdonar»
 * y «perdoné» cuenten igual. Una lista corta y revisable vale más que una
 * larga que nadie puede auditar.
 */
const PALABRAS: Readonly<Record<Tema, readonly string[]>> = {
  perdon: ['perdon', 'perdona', 'disculp', 'reconcili', 'forgive', 'reconcil'],
  fe: ['fe ', 'confio', 'confia', 'creo en', 'faith', 'trust'],
  esperanza: ['esperanza', 'espero', 'futuro', 'hope'],
  familia: [
    'familia',
    'madre',
    'padre',
    'hijo',
    'hija',
    'hermano',
    'hermana',
    'family',
    'mother',
    'father',
  ],
  servicio: ['servir', 'servicio', 'ayudar', 'voluntari', 'serve', 'help'],
  ansiedad: ['ansiedad', 'ansios', 'miedo', 'angustia', 'preocupa', 'anxiety', 'afraid', 'worry'],
  gozo: ['gozo', 'alegr', 'feliz', 'gratitud', 'joy', 'grateful'],
  amor: ['amor', 'amar', 'querer a', 'love'],
  liderazgo: ['lider', 'dirigir', 'equipo', 'lead'],
  evangelismo: ['evangeli', 'testimoni', 'compartir la fe', 'witness'],
};

/** Quita acentos para que «oración» y «oracion» se comparen igual. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Temas que aparecen en un texto.
 *
 * Devuelve lista vacía cuando no reconoce ninguno, y eso está bien: un
 * elemento sin tema sigue siendo válido. Inventar una etiqueta para no dejar
 * el hueco vacío sería peor que no clasificar.
 */
export function clasificar(texto: string): readonly Tema[] {
  const normalizado = normalizar(` ${texto} `);
  return TEMAS.filter((tema) =>
    (PALABRAS[tema] ?? []).some((palabra) => normalizado.includes(normalizar(palabra))),
  );
}
