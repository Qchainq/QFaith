// Programación de recordatorios en hora local.
//
// El Documento 13 prohíbe los cálculos fijos de segundos, y estas pruebas son
// la razón: se ejecutan sobre los días reales en que cambia la hora en Madrid
// y en Nueva York, que es donde una suma de 86 400 000 milisegundos falla sin
// que nadie se entere.
import {
  aHora,
  aMinutoDelDia,
  identificadorDeAviso,
  instanteDeHoraLocal,
  proximaOcurrencia,
} from '../programacion';

const MADRID = 'Europe/Madrid';
const NUEVA_YORK = 'America/New_York';

/**
 * Hora local legible, para que los fallos se lean sin descifrar un ISO.
 *
 * Los campos van uno a uno en lugar de con `timeStyle`: los estilos cortos de
 * `es-ES` escriben «8:00» sin cero inicial, y una prueba que buscara «08:00»
 * fallaría por el formato y no por la lógica.
 */
const enLocal = (instante: Date, zona: string): string =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: zona,
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instante);

describe('conversión de horas', () => {
  it('lee una hora bien escrita', () => {
    expect(aMinutoDelDia('08:30')).toBe(510);
    expect(aMinutoDelDia('00:00')).toBe(0);
    expect(aMinutoDelDia('23:59')).toBe(1439);
  });

  it.each(['24:00', '8:30', '08:60', 'ocho y media', ''])('rechaza «%s»', (entrada) => {
    expect(aMinutoDelDia(entrada)).toBeNull();
  });

  it('vuelve a texto sin perder el cero inicial', () => {
    expect(aHora(510)).toBe('08:30');
    expect(aHora(0)).toBe('00:00');
  });
});

describe('la hora local es la que la persona espera', () => {
  it('a las 08:00 de Madrid en invierno', () => {
    const instante = instanteDeHoraLocal({
      ano: 2026,
      mes: 1,
      dia: 15,
      minutoDelDia: 8 * 60,
      zonaHoraria: MADRID,
    });
    expect(enLocal(instante, MADRID)).toContain('08:00');
  });

  it('a las 08:00 de Madrid en verano, con otro desplazamiento', () => {
    // Mismo texto para la persona, instante UTC distinto. Es justo lo que un
    // cálculo fijo de segundos se salta.
    const instante = instanteDeHoraLocal({
      ano: 2026,
      mes: 7,
      dia: 15,
      minutoDelDia: 8 * 60,
      zonaHoraria: MADRID,
    });
    expect(enLocal(instante, MADRID)).toContain('08:00');
  });

  it('a las 08:00 de Nueva York el mismo día', () => {
    const instante = instanteDeHoraLocal({
      ano: 2026,
      mes: 7,
      dia: 15,
      minutoDelDia: 8 * 60,
      zonaHoraria: NUEVA_YORK,
    });
    expect(enLocal(instante, NUEVA_YORK)).toContain('08:00');
  });
});

describe('cambio de horario', () => {
  it('la hora que no existe se corre hacia adelante, no se pierde', () => {
    // El 29 de marzo de 2026 en Madrid, a las 02:00 el reloj salta a las
    // 03:00. Las 02:30 no ocurre.
    const instante = instanteDeHoraLocal({
      ano: 2026,
      mes: 3,
      dia: 29,
      minutoDelDia: 2 * 60 + 30,
      zonaHoraria: MADRID,
    });

    // Lo importante no es la hora exacta a la que cae, sino que existe y que
    // no se ha ido al día anterior ni al siguiente.
    expect(enLocal(instante, MADRID)).toContain('29/3/26');
    expect(Number.isNaN(instante.getTime())).toBe(false);
  });

  it('la hora que ocurre dos veces se resuelve a la primera', () => {
    // El 25 de octubre de 2026 en Madrid, las 02:30 pasa dos veces. Recordar
    // algo antes molesta menos que recordarlo tarde.
    const instante = instanteDeHoraLocal({
      ano: 2026,
      mes: 10,
      dia: 25,
      minutoDelDia: 2 * 60 + 30,
      zonaHoraria: MADRID,
    });

    const otraLectura = instanteDeHoraLocal({
      ano: 2026,
      mes: 10,
      dia: 25,
      minutoDelDia: 2 * 60 + 30,
      zonaHoraria: MADRID,
    });

    // Determinista: la misma entrada da siempre el mismo instante. Sin esto,
    // reprogramar movería el aviso cada vez.
    expect(instante.getTime()).toBe(otraLectura.getTime());
    expect(enLocal(instante, MADRID)).toContain('02:30');
  });

  it('un recordatorio diario sigue sonando a la misma hora al cruzar el cambio', () => {
    // Es la prueba que justifica todo el archivo. La víspera del cambio de
    // primavera, el siguiente aviso de las 08:00 tiene que ser a las 08:00.
    const vispera = new Date('2026-03-28T09:00:00Z');
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 8 * 60, dias: [] },
      desde: vispera,
      zonaHoraria: MADRID,
    });

    expect(siguiente).not.toBeNull();
    expect(enLocal(siguiente!, MADRID)).toContain('08:00');
    expect(enLocal(siguiente!, MADRID)).toContain('29/3/26');

    // Y con una suma fija de un día habría caído a las 09:00.
    const conSumaFija = new Date(vispera.getTime() + 86_400_000);
    expect(enLocal(conSumaFija, MADRID)).not.toContain('08:00');
  });
});

describe('próxima ocurrencia', () => {
  it('si hoy ya pasó la hora, es mañana', () => {
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 8 * 60, dias: [] },
      // 10:00 en Madrid: las ocho ya pasaron.
      desde: new Date('2026-01-15T09:00:00Z'),
      zonaHoraria: MADRID,
    });

    expect(enLocal(siguiente!, MADRID)).toContain('16/1/26');
  });

  it('si hoy todavía no ha llegado, es hoy', () => {
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 20 * 60, dias: [] },
      desde: new Date('2026-01-15T09:00:00Z'),
      zonaHoraria: MADRID,
    });

    expect(enLocal(siguiente!, MADRID)).toContain('15/1/26');
    expect(enLocal(siguiente!, MADRID)).toContain('20:00');
  });

  it('respeta los días elegidos', () => {
    // El 15 de enero de 2026 es jueves. Con los domingos elegidos, toca el 18.
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 10 * 60, dias: [0] },
      desde: new Date('2026-01-15T09:00:00Z'),
      zonaHoraria: MADRID,
    });

    expect(enLocal(siguiente!, MADRID)).toContain('18/1/26');
  });

  it('sin días elegidos suena todos los días', () => {
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 20 * 60, dias: [] },
      desde: new Date('2026-01-15T09:00:00Z'),
      zonaHoraria: MADRID,
    });
    expect(siguiente).not.toBeNull();
  });

  it.each([
    ['una hora imposible', { minutoDelDia: 1500, dias: [] }],
    ['un día que no existe', { minutoDelDia: 600, dias: [9] }],
    ['un día negativo', { minutoDelDia: 600, dias: [-1] }],
  ])('con %s no programa nada en vez de programar algo que nunca suena', (_caso, recordatorio) => {
    expect(
      proximaOcurrencia({
        recordatorio,
        desde: new Date('2026-01-15T09:00:00Z'),
        zonaHoraria: MADRID,
      }),
    ).toBeNull();
  });

  it('un día imposible entre días válidos no se lleva el recordatorio por delante', () => {
    // Rechazar la lista entera perdería un recordatorio que la persona sí
    // configuró. Mismo criterio que con un registro ilegible: se salta.
    const siguiente = proximaOcurrencia({
      // El 15 de enero de 2026 es jueves; el 19 es lunes.
      recordatorio: { minutoDelDia: 10 * 60, dias: [9, 1] },
      desde: new Date('2026-01-15T09:00:00Z'),
      zonaHoraria: MADRID,
    });

    expect(siguiente).not.toBeNull();
    expect(enLocal(siguiente!, MADRID)).toContain('19/1/26');
  });

  it('nunca devuelve un instante que ya pasó', () => {
    const desde = new Date('2026-01-15T09:00:00Z');
    const siguiente = proximaOcurrencia({
      recordatorio: { minutoDelDia: 10 * 60, dias: [] },
      desde,
      zonaHoraria: MADRID,
    });

    expect(siguiente!.getTime()).toBeGreaterThan(desde.getTime());
  });
});

describe('idempotencia', () => {
  it('el mismo recordatorio da siempre el mismo identificador', () => {
    // Reprogramar en segundo plano no puede duplicar avisos (Documento 13).
    const parametros = {
      entidadId: 'habito-1',
      minutoDelDia: 480,
      instante: new Date('2026-01-16T07:00:00Z'),
    };
    expect(identificadorDeAviso(parametros)).toBe(identificadorDeAviso(parametros));
  });

  it('dos recordatorios distintos nunca comparten identificador', () => {
    const base = { minutoDelDia: 480, instante: new Date('2026-01-16T07:00:00Z') };
    expect(identificadorDeAviso({ ...base, entidadId: 'habito-1' })).not.toBe(
      identificadorDeAviso({ ...base, entidadId: 'habito-2' }),
    );
    expect(identificadorDeAviso({ ...base, entidadId: 'h' })).not.toBe(
      identificadorDeAviso({ ...base, entidadId: 'h', minutoDelDia: 540 }),
    );
  });
});
