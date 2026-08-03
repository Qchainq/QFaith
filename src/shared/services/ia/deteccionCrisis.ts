// Detección de crisis. **Corre en el dispositivo, antes de cualquier
// llamada al proveedor.**
//
// Es la decisión de diseño más importante del módulo, y va contra la
// intuición: no se le pregunta al modelo si esto es una crisis. Tres motivos:
//
//   1. La respuesta ante una crisis debe ser **siempre la misma y siempre
//      correcta**. Un modelo puede tener un mal día justo en el mensaje más
//      peligroso que reciba nunca.
//   2. Debe funcionar **sin conexión**. Quien escribe «no quiero seguir» a
//      las tres de la mañana con mala cobertura no puede quedarse sin
//      respuesta.
//   3. El mensaje **no debe salir del dispositivo** para ser clasificado. Es
//      lo más delicado que alguien va a escribir.
//
// El detector es deliberadamente amplio: prefiere marcar de más. Un falso
// positivo cuesta un mensaje con recursos de ayuda que no hacía falta; un
// falso negativo cuesta mucho más.
import { TEMAS_NUNCA_USADOS_PARA_ETIQUETAR } from './politicaDatos';

/**
 * Señales de riesgo (Documento 6): autolesión, suicidio, violencia, abuso,
 * riesgo inmediato, desesperación extrema y crisis médica.
 *
 * Se comparan sin acentos ni mayúsculas. La lista es corta y revisable a
 * propósito: una lista enorme que nadie audita da falsa confianza.
 */
const SENALES = [
  // Suicidio y autolesión.
  'suicid',
  'matarme',
  'quitarme la vida',
  'no quiero vivir',
  'no quiero seguir viviendo',
  'acabar con todo',
  'hacerme dano',
  'cortarme',
  'kill myself',
  'end my life',
  'suicide',
  'self harm',
  // Violencia y abuso.
  'me pega',
  'me golpea',
  'me maltrata',
  'abuso sexual',
  'me violaron',
  'me amenaza de muerte',
  'abusing me',
  'he hits me',
  // Desesperación extrema.
  'no aguanto mas',
  'no puedo mas',
  'todo esta perdido',
  'nadie me echaria de menos',
  "i can't go on",
  // Crisis médica.
  'me tome todas las pastillas',
  'overdose',
  'sobredosis',
] as const;

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * ¿Hay señales de crisis en este texto?
 *
 * Devuelve solo un booleano a propósito. Saber **cuál** señal se activó sería
 * un dato clínico sobre una persona, y este proyecto no los produce ni los
 * guarda (ver `politicaDatos`).
 */
export function hayCrisis(texto: string): boolean {
  const normalizado = normalizar(texto);
  return SENALES.some((senal) => normalizado.includes(normalizar(senal)));
}

export { TEMAS_NUNCA_USADOS_PARA_ETIQUETAR };
