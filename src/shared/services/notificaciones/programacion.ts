// Cuándo suena un recordatorio.
//
// El Documento 13 lo dice de forma explícita: **nunca programes recordatorios
// con cálculos fijos de segundos** cuando deban respetar la hora local. Sumar
// 86 400 000 milisegundos para «mañana a la misma hora» funciona once meses
// al año y falla el fin de semana en que cambia la hora, que es exactamente
// cuando nadie está mirando.
//
// Aquí la hora local es el dato de partida, no el resultado: se calcula el
// día y la hora que la persona espera y solo al final se convierte a un
// instante. Así el cambio de horario se resuelve solo.
//
// Dos casos que el cambio de hora crea y que hay que decidir a mano:
//
//   · **La hora que no existe.** En primavera, las 02:30 no ocurre. Un
//     recordatorio a esa hora se corre al primer minuto que sí existe, no se
//     pierde.
//   · **La hora que ocurre dos veces.** En otoño, las 02:30 pasa dos veces.
//     Se toma la primera: recordar algo antes molesta menos que recordarlo
//     tarde.

/** Minutos desde medianoche, hora local. */
export type MinutoDelDia = number;

export interface Recordatorio {
  /** Hora local a la que debe sonar. */
  readonly minutoDelDia: MinutoDelDia;
  /**
   * Días de la semana en que suena, con 0 = domingo.
   *
   * Vacío significa todos los días. Se usa 0 = domingo para coincidir con
   * `Date.getDay()` y no tener que traducir en cada llamada.
   */
  readonly dias: readonly number[];
}

export const MINUTOS_POR_DIA = 1440;

/** Convierte «08:30» en minutos desde medianoche. */
export function aMinutoDelDia(hora: string): MinutoDelDia | null {
  const coincidencia = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (coincidencia === null) return null;
  return Number(coincidencia[1]) * 60 + Number(coincidencia[2]);
}

export function aHora(minuto: MinutoDelDia): string {
  const normalizado = ((minuto % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA;
  const horas = Math.floor(normalizado / 60);
  return `${String(horas).padStart(2, '0')}:${String(normalizado % 60).padStart(2, '0')}`;
}

/**
 * Partes de la fecha en una zona horaria concreta.
 *
 * Se usa `Intl` en lugar de aritmética de desplazamientos porque es lo único
 * que conoce las reglas de cada zona, incluidos los cambios históricos.
 */
function partesLocales(instante: Date, zonaHoraria: string) {
  const formateador = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const partes: Record<string, number> = {};
  for (const parte of formateador.formatToParts(instante)) {
    if (parte.type !== 'literal') partes[parte.type] = Number(parte.value);
  }

  return {
    ano: partes.year ?? 1970,
    mes: partes.month ?? 1,
    dia: partes.day ?? 1,
    hora: partes.hour ?? 0,
    minuto: partes.minute ?? 0,
    segundo: partes.second ?? 0,
  };
}

/** Desplazamiento de la zona respecto a UTC, en minutos, en ese instante. */
function desplazamientoMinutos(instante: Date, zonaHoraria: string): number {
  const partes = partesLocales(instante, zonaHoraria);
  const comoUtc = Date.UTC(
    partes.ano,
    partes.mes - 1,
    partes.dia,
    partes.hora,
    partes.minuto,
    partes.segundo,
  );
  return (comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Instante UTC de una hora local concreta.
 *
 * Resuelve los dos casos raros del cambio de horario. El desplazamiento se
 * calcula dos veces porque la primera estimación puede caer al otro lado del
 * cambio: es el método estándar y evita depender de una biblioteca entera
 * solo para esto.
 */
export function instanteDeHoraLocal(parametros: {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
  readonly minutoDelDia: MinutoDelDia;
  readonly zonaHoraria: string;
}): Date {
  const { ano, mes, dia, minutoDelDia, zonaHoraria } = parametros;
  const deseado = Date.UTC(ano, mes - 1, dia, Math.floor(minutoDelDia / 60), minutoDelDia % 60);

  const primera = new Date(
    deseado - desplazamientoMinutos(new Date(deseado), zonaHoraria) * 60_000,
  );
  const segunda = new Date(deseado - desplazamientoMinutos(primera, zonaHoraria) * 60_000);

  // Si las dos estimaciones coinciden, la hora existe y es única.
  if (primera.getTime() === segunda.getTime()) return segunda;

  // Si no, o la hora no existe —y se corre hacia adelante— o ocurre dos veces
  // —y se toma la primera—. Quedarse con la menor cubre los dos casos: en el
  // salto de primavera la menor es el primer instante que sí existe.
  return new Date(Math.min(primera.getTime(), segunda.getTime()));
}

/**
 * Próxima vez que debe sonar un recordatorio, a partir de un instante.
 *
 * Devuelve `null` si la hora está fuera de rango. Esa comprobación **sí hace
 * falta**: sin ella, un minuto 1500 se desbordaría al día siguiente y
 * programaría un aviso a una hora que nadie pidió, en silencio.
 *
 * Los días fuera de rango no se validan aparte, y es deliberado: simplemente
 * no coinciden con ningún día real, así que un `[9]` no programa nada y un
 * `[9, 1]` sigue sonando los lunes. Rechazar la lista entera por un valor
 * malo perdería un recordatorio que la persona sí había configurado —el mismo
 * criterio que en el resto del proyecto, donde un registro ilegible se salta
 * sin llevarse los demás por delante.
 */
export function proximaOcurrencia(parametros: {
  readonly recordatorio: Recordatorio;
  readonly desde: Date;
  readonly zonaHoraria: string;
}): Date | null {
  const { recordatorio, desde, zonaHoraria } = parametros;

  if (recordatorio.minutoDelDia < 0 || recordatorio.minutoDelDia >= MINUTOS_POR_DIA) return null;

  const dias = recordatorio.dias.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : recordatorio.dias;

  // Se prueban ocho días: siete cubren cualquier configuración semanal y el
  // octavo cubre el caso de que hoy ya haya pasado la hora.
  for (let salto = 0; salto <= 8; salto += 1) {
    const tanteo = new Date(desde.getTime() + salto * 86_400_000);
    const partes = partesLocales(tanteo, zonaHoraria);

    const instante = instanteDeHoraLocal({
      ano: partes.ano,
      mes: partes.mes,
      dia: partes.dia,
      minutoDelDia: recordatorio.minutoDelDia,
      zonaHoraria,
    });

    // El día de la semana se mira sobre el instante ya resuelto, no sobre el
    // tanteo: cerca de medianoche pueden ser días distintos.
    const diaSemana = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      weekday: 'short',
    }).format(instante);
    const indice = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(diaSemana);

    if (instante.getTime() > desde.getTime() && dias.includes(indice)) {
      return instante;
    }
  }

  return null;
}

/**
 * Identificador estable de un recordatorio programado.
 *
 * Las tareas de fondo tienen que ser idempotentes (Documento 13): reprogramar
 * dos veces el mismo recordatorio no puede crear dos avisos. El identificador
 * se deriva de lo que lo define, así que la segunda vez sustituye a la
 * primera en lugar de sumarse.
 */
export function identificadorDeAviso(parametros: {
  readonly entidadId: string;
  readonly minutoDelDia: MinutoDelDia;
  readonly instante: Date;
}): string {
  return `qfaith/aviso/${parametros.entidadId}/${parametros.minutoDelDia}/${parametros.instante.toISOString()}`;
}
