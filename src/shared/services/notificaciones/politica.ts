// Qué se puede notificar, cuándo y cuánto.
//
// **Diseño de Opus.** Es la parte del sistema que más fácil se corrompe: cada
// función que alguien quiera añadir después tendrá una buena razón para
// mandar «solo un recordatorio más», y el texto siempre parecerá inofensivo
// visto de cerca.
//
// Por eso las reglas están aquí, en funciones puras y probadas, y no
// repartidas por las pantallas que las necesitan:
//
//   1. **Nada de lo que la persona escribió sale nunca a una pantalla
//      bloqueada.** Ni el texto de una oración, ni un nombre, ni de qué trata
//      una entrada. El texto se elige de un catálogo cerrado.
//
//   2. **Nunca lenguaje de culpa, deuda ni urgencia falsa.** No hay rachas
//      que se pierdan, no hay «llevas tres días sin», no hay «Dios está
//      esperando». El invariante 12 no admite matices y aquí se comprueba.
//
//   3. **Los límites de frecuencia son un techo, no una sugerencia.** El
//      usuario puede bajarlos; nadie puede subirlos.
//
//   4. **El horario de silencio solo lo rompe la seguridad.** Un devocional
//      no despierta a nadie a las tres de la mañana.

/** Prioridades del Documento 13, de más a menos urgente. */
export const PRIORIDADES = ['critica', 'alta', 'normal', 'baja'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

/**
 * Categorías que existen. Cerrada a propósito.
 *
 * Añadir una obliga a pasar por este archivo, y por tanto a decidir de forma
 * explícita su prioridad y si cuenta para el límite diario.
 */
export const CATEGORIAS = [
  'habito',
  'oracion',
  'devocional',
  'lectura',
  'sermon',
  'evento',
  'iglesia',
  'seguridad',
  'respaldo',
  'resumen',
  'promocional',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Categorías que cuentan para el máximo diario de avisos espirituales. */
const ESPIRITUALES: readonly Categoria[] = ['habito', 'oracion', 'devocional', 'lectura', 'sermon'];

const PRIORIDAD_POR_CATEGORIA: Readonly<Record<Categoria, Prioridad>> = {
  habito: 'normal',
  oracion: 'normal',
  devocional: 'normal',
  lectura: 'normal',
  sermon: 'normal',
  evento: 'alta',
  iglesia: 'normal',
  // Nunca se rebaja: un inicio de sesión sospechoso tiene que llegar.
  seguridad: 'critica',
  respaldo: 'alta',
  resumen: 'baja',
  promocional: 'baja',
};

export const prioridadDe = (categoria: Categoria): Prioridad => PRIORIDAD_POR_CATEGORIA[categoria];

export const esEspiritual = (categoria: Categoria): boolean => ESPIRITUALES.includes(categoria);

// ── Lenguaje prohibido ───────────────────────────────────────────────────

/**
 * Formas de hablar que no se usan nunca, con ejemplos literales.
 *
 * Se comprueba con una función y no solo con una revisión humana porque los
 * textos los escribe cualquiera y estas frases suenan bien al escribirlas.
 */
export const PATRONES_PROHIBIDOS: readonly RegExp[] = [
  // Culpa y reproche.
  /\bhas fallado\b/i,
  /\bllevas \d+ d[ií]as? sin\b/i,
  /\bno has (orado|le[ií]do|cumplido)\b/i,
  /\bte olvidaste\b/i,
  /\bdeber[ií]as haber\b/i,
  // Rachas y pérdida de progreso.
  /\bracha\b/i,
  /\bperder[aá]s\b/i,
  /\bvas a perder\b/i,
  /\bempiezas de cero\b/i,
  // Urgencia falsa y presión.
  //
  // Sin `\b` inicial a propósito: para JavaScript «ú» no es carácter de
  // palabra, así que `\bú` nunca casa al principio de «Última». Es un fallo
  // silencioso —el patrón parece correcto y no detecta nada— y por eso hay
  // una prueba con la palabra acentuada.
  /[uú]ltima oportunidad/i,
  /\bantes de que sea tarde\b/i,
  /\bsolo por hoy\b/i,
  // Autoridad espiritual que la aplicación no tiene.
  /\bdios (est[aá] esperando|quiere que|te dice)\b/i,
  /\bdios me dijo\b/i,
];

export interface Veredicto {
  readonly aceptado: boolean;
  /** Clave de i18n del motivo, para poder explicarlo en una prueba. */
  readonly motivo?: string;
}

/**
 * ¿Este texto puede salir a una pantalla bloqueada?
 *
 * Rechaza el texto entero, no lo recorta: un aviso al que se le ha quitado la
 * frase problemática sigue teniendo detrás la intención que la escribió.
 */
export function textoPermitido(texto: string): Veredicto {
  if (texto.trim().length === 0) {
    return { aceptado: false, motivo: 'notificaciones.errores.vacio' };
  }
  for (const patron of PATRONES_PROHIBIDOS) {
    if (patron.test(texto)) {
      return { aceptado: false, motivo: 'notificaciones.errores.lenguajeProhibido' };
    }
  }
  return { aceptado: true };
}

// ── Horario de silencio ──────────────────────────────────────────────────

export interface HorarioSilencio {
  /** Minutos desde medianoche, hora local. */
  readonly desdeMinuto: number;
  readonly hastaMinuto: number;
}

/** Por defecto: de 22:00 a 07:00. Nadie quiere un devocional de madrugada. */
export const SILENCIO_POR_DEFECTO: HorarioSilencio = {
  desdeMinuto: 22 * 60,
  hastaMinuto: 7 * 60,
};

/**
 * ¿Este minuto local cae en horario de silencio?
 *
 * Se compara con minutos locales y no con instantes UTC a propósito: «las
 * diez de la noche» significa las diez donde está la persona, y un cálculo en
 * UTC la despertaría cada vez que viaja.
 */
export function enSilencio(horario: HorarioSilencio, minutoLocal: number): boolean {
  const { desdeMinuto, hastaMinuto } = horario;
  if (desdeMinuto === hastaMinuto) return false;
  // El tramo cruza la medianoche casi siempre, así que se trata como dos.
  return desdeMinuto < hastaMinuto
    ? minutoLocal >= desdeMinuto && minutoLocal < hastaMinuto
    : minutoLocal >= desdeMinuto || minutoLocal < hastaMinuto;
}

// ── Límites de frecuencia ────────────────────────────────────────────────

export interface Limites {
  readonly espiritualesAlDia: number;
  readonly resumenesAlDia: number;
  readonly promocionalesALaSemana: number;
}

/** Techos del Documento 13. El usuario puede bajarlos, nadie subirlos. */
export const LIMITES_MAXIMOS: Limites = {
  espiritualesAlDia: 3,
  resumenesAlDia: 1,
  promocionalesALaSemana: 1,
};

/**
 * Recorta unos límites elegidos por el usuario al techo permitido.
 *
 * Pedir menos siempre se respeta. Pedir más se ignora en silencio: subirlos
 * sería el camino corto a una aplicación que insiste.
 */
export function limitesValidos(elegidos: Partial<Limites>): Limites {
  const recortar = (valor: number | undefined, techo: number): number =>
    valor === undefined || !Number.isFinite(valor)
      ? techo
      : Math.max(0, Math.min(techo, Math.trunc(valor)));

  return {
    espiritualesAlDia: recortar(elegidos.espiritualesAlDia, LIMITES_MAXIMOS.espiritualesAlDia),
    resumenesAlDia: recortar(elegidos.resumenesAlDia, LIMITES_MAXIMOS.resumenesAlDia),
    promocionalesALaSemana: recortar(
      elegidos.promocionalesALaSemana,
      LIMITES_MAXIMOS.promocionalesALaSemana,
    ),
  };
}

export interface Consumo {
  readonly espiritualesHoy: number;
  readonly resumenesHoy: number;
  readonly promocionalesEstaSemana: number;
}

export interface Contexto {
  readonly categoria: Categoria;
  readonly texto: string;
  readonly minutoLocal: number;
  readonly silencio: HorarioSilencio;
  readonly limites: Limites;
  readonly consumo: Consumo;
  /** Consentimiento explícito para promocionales. Sin él, no salen. */
  readonly aceptaPromocionales: boolean;
  /** El usuario apagó las notificaciones por completo. */
  readonly notificacionesActivas: boolean;
}

/**
 * Decide si una notificación puede enviarse **ahora**.
 *
 * El orden importa. La seguridad se comprueba primero porque es la única que
 * atraviesa el silencio y los límites: un inicio de sesión sospechoso tiene
 * que llegar aunque sean las cuatro de la mañana y aunque ya se hayan enviado
 * diez avisos ese día. Todo lo demás cede.
 */
export function puedeEnviarse(contexto: Contexto): Veredicto {
  const texto = textoPermitido(contexto.texto);
  if (!texto.aceptado) return texto;

  // La seguridad pasa siempre. Es la única excepción, y por eso está sola.
  if (prioridadDe(contexto.categoria) === 'critica') return { aceptado: true };

  if (!contexto.notificacionesActivas) {
    return { aceptado: false, motivo: 'notificaciones.errores.desactivadas' };
  }

  if (enSilencio(contexto.silencio, contexto.minutoLocal)) {
    return { aceptado: false, motivo: 'notificaciones.errores.enSilencio' };
  }

  if (contexto.categoria === 'promocional') {
    if (!contexto.aceptaPromocionales) {
      return { aceptado: false, motivo: 'notificaciones.errores.sinConsentimiento' };
    }
    if (contexto.consumo.promocionalesEstaSemana >= contexto.limites.promocionalesALaSemana) {
      return { aceptado: false, motivo: 'notificaciones.errores.limiteAlcanzado' };
    }
    return { aceptado: true };
  }

  if (contexto.categoria === 'resumen') {
    return contexto.consumo.resumenesHoy >= contexto.limites.resumenesAlDia
      ? { aceptado: false, motivo: 'notificaciones.errores.limiteAlcanzado' }
      : { aceptado: true };
  }

  if (esEspiritual(contexto.categoria)) {
    return contexto.consumo.espiritualesHoy >= contexto.limites.espiritualesAlDia
      ? { aceptado: false, motivo: 'notificaciones.errores.limiteAlcanzado' }
      : { aceptado: true };
  }

  return { aceptado: true };
}

/**
 * ¿Conviene sugerir reducir esta categoría?
 *
 * El Documento 13 pide detectar fatiga y **preguntar dentro de la
 * aplicación**, nunca aumentar la presión ni reprochar nada. Tres avisos
 * seguidos ignorados es señal suficiente: insistir una cuarta vez ya es
 * insistir.
 */
export function sugerirReducir(ignoradasSeguidas: number): boolean {
  return ignoradasSeguidas >= 3;
}
