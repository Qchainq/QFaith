// Filtro de la respuesta del proveedor.
//
// El prompt del sistema es una petición; esto es una garantía. Un modelo
// puede desobedecer sus instrucciones, y las prohibiciones del Documento 6 no
// pueden depender de que se porte bien. Aquí se comprueban de forma
// determinista, después de recibir la respuesta y antes de enseñarla.
//
// Cuando una respuesta incumple, **no se corrige ni se recorta**: se descarta
// entera. Editar la frase prohibida dejaría el resto del razonamiento
// intacto, y ese razonamiento es justo el que llevó a decirla.
import { FRASES_PROHIBIDAS } from './promptSistema';

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Señales de que la respuesta habla como si fuera Dios o profetizara. */
const PATRONES_PROHIBIDOS = [
  // Hablar en nombre de Dios.
  /\bdios (me )?(dijo|dice|te dice|quiere que|manda que)\b/i,
  /\besta es la voluntad de dios\b/i,
  /\bel se(n|ñ)or me (revelo|mostro|dijo)\b/i,
  // Profecía y revelación.
  /\bprofetizo\b/i,
  /\bte profetizo\b/i,
  /\brecibi (una )?(revelacion|palabra) (de dios|del se(n|ñ)or)\b/i,
  /\btu sue(n|ñ)o (es|significa) (un mensaje|una revelacion) de dios\b/i,
  // Autoridad sobre decisiones de vida o sobre otras iglesias.
  /\bdebes (casarte|separarte|divorciarte|cambiar de iglesia)\b/i,
  /\bese pastor (esta equivocado|se equivoca)\b/i,
  /\besa denominacion es falsa\b/i,
  // Supervisión humana que no existe.
  /\bestamos vigilando\b/i,
  /\balguien llegara (pronto|enseguida)\b/i,
  /\bhay (alguien|una persona) (leyendo|supervisando|siguiendo) esta conversacion\b/i,
  // Diagnóstico.
  /\btienes (depresion|ansiedad clinica|un trastorno)\b/i,
] as const;

export interface ResultadoFiltro {
  readonly aceptada: boolean;
}

/**
 * ¿Se puede enseñar esta respuesta?
 *
 * No se registra qué la hizo fallar. El motivo saldría de un texto que trata
 * sobre la vida de alguien, y anotarlo en un log rompería el invariante 2.
 */
export function filtrar(texto: string): ResultadoFiltro {
  const normalizado = normalizar(texto);

  const contieneFraseLiteral = FRASES_PROHIBIDAS.some((frase) =>
    normalizado.includes(normalizar(frase)),
  );
  if (contieneFraseLiteral) {
    return { aceptada: false };
  }

  return { aceptada: !PATRONES_PROHIBIDOS.some((patron) => patron.test(normalizado)) };
}
