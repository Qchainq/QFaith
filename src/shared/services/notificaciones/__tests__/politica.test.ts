// Política de notificaciones.
//
// Se prueba a conciencia porque es lo que impide que la aplicación acabe
// pareciéndose a las que hacen esto mal. Cada regla que se rompa aquí saldría
// a la pantalla bloqueada de alguien.
import {
  enSilencio,
  limitesValidos,
  LIMITES_MAXIMOS,
  prioridadDe,
  puedeEnviarse,
  SILENCIO_POR_DEFECTO,
  sugerirReducir,
  textoPermitido,
  type Categoria,
  type Contexto,
} from '../politica';

const CONTEXTO_BASE: Contexto = {
  categoria: 'devocional',
  texto: 'Tu momento de lectura está disponible.',
  minutoLocal: 9 * 60,
  silencio: SILENCIO_POR_DEFECTO,
  limites: LIMITES_MAXIMOS,
  consumo: { espiritualesHoy: 0, resumenesHoy: 0, promocionalesEstaSemana: 0 },
  aceptaPromocionales: false,
  notificacionesActivas: true,
};

const con = (cambios: Partial<Contexto>): Contexto => ({ ...CONTEXTO_BASE, ...cambios });

describe('lenguaje prohibido', () => {
  it.each([
    'Has fallado otra vez.',
    'Llevas 3 días sin orar.',
    'No has leído la Biblia hoy.',
    'Vas a perder tu racha.',
    'Perderás tu progreso si no entras.',
    'Última oportunidad para tu devocional.',
    'Dios está esperando y tú no has orado.',
    'Dios quiere que abras la aplicación.',
    'Deberías haber orado ayer.',
  ])('rechaza «%s»', (texto) => {
    expect(textoPermitido(texto).aceptado).toBe(false);
  });

  it.each([
    'Tu momento de lectura está disponible.',
    'Puedes continuar hoy donde quedaste.',
    '¿Deseas dedicar unos minutos a tu oración?',
    'Tienes un recordatorio en QFaith.',
    'Tienes un evento próximo.',
  ])('acepta «%s»', (texto) => {
    expect(textoPermitido(texto).aceptado).toBe(true);
  });

  it('un texto vacío no se envía: una notificación en blanco solo desconcierta', () => {
    expect(textoPermitido('   ').aceptado).toBe(false);
  });

  it('el texto se descarta entero, no se recorta la frase mala', () => {
    // Quitar la frase dejaría el resto, escrito con la misma intención.
    const veredicto = puedeEnviarse(
      con({ texto: 'Tu lectura te espera. Has fallado dos días seguidos.' }),
    );
    expect(veredicto.aceptado).toBe(false);
    expect(veredicto.motivo).toBe('notificaciones.errores.lenguajeProhibido');
  });
});

describe('horario de silencio', () => {
  it('cubre el tramo que cruza la medianoche', () => {
    // 22:00 a 07:00 por defecto.
    expect(enSilencio(SILENCIO_POR_DEFECTO, 23 * 60)).toBe(true);
    expect(enSilencio(SILENCIO_POR_DEFECTO, 3 * 60)).toBe(true);
    expect(enSilencio(SILENCIO_POR_DEFECTO, 9 * 60)).toBe(false);
  });

  it('el minuto inicial silencia y el final ya no', () => {
    expect(enSilencio(SILENCIO_POR_DEFECTO, 22 * 60)).toBe(true);
    expect(enSilencio(SILENCIO_POR_DEFECTO, 7 * 60)).toBe(false);
  });

  it('un tramo dentro del mismo día también funciona', () => {
    const siesta = { desdeMinuto: 15 * 60, hastaMinuto: 17 * 60 };
    expect(enSilencio(siesta, 16 * 60)).toBe(true);
    expect(enSilencio(siesta, 18 * 60)).toBe(false);
  });

  it('un tramo de longitud cero no silencia nada', () => {
    expect(enSilencio({ desdeMinuto: 600, hastaMinuto: 600 }, 600)).toBe(false);
  });

  it('un devocional no suena de madrugada', () => {
    const veredicto = puedeEnviarse(con({ minutoLocal: 3 * 60 }));
    expect(veredicto.motivo).toBe('notificaciones.errores.enSilencio');
  });

  it('la seguridad sí atraviesa el silencio', () => {
    // Un inicio de sesión sospechoso tiene que llegar a las cuatro de la
    // mañana. Es la única categoría que puede.
    expect(
      puedeEnviarse(
        con({
          categoria: 'seguridad',
          texto: 'Hay una actividad que revisar.',
          minutoLocal: 4 * 60,
        }),
      ).aceptado,
    ).toBe(true);
  });
});

describe('límites de frecuencia', () => {
  it('tres avisos espirituales al día y no más', () => {
    expect(
      puedeEnviarse(
        con({ consumo: { espiritualesHoy: 3, resumenesHoy: 0, promocionalesEstaSemana: 0 } }),
      ).motivo,
    ).toBe('notificaciones.errores.limiteAlcanzado');
  });

  it('el usuario puede pedir menos y se respeta', () => {
    const limites = limitesValidos({ espiritualesAlDia: 1 });
    expect(limites.espiritualesAlDia).toBe(1);

    expect(
      puedeEnviarse(
        con({
          limites,
          consumo: { espiritualesHoy: 1, resumenesHoy: 0, promocionalesEstaSemana: 0 },
        }),
      ).aceptado,
    ).toBe(false);
  });

  it('nadie puede pedir más: subirlos se ignora', () => {
    // Es el camino corto a una aplicación que insiste.
    expect(limitesValidos({ espiritualesAlDia: 50 }).espiritualesAlDia).toBe(3);
    expect(limitesValidos({ promocionalesALaSemana: 10 }).promocionalesALaSemana).toBe(1);
  });

  it('cero es una elección válida: no quiero ninguna', () => {
    const limites = limitesValidos({ espiritualesAlDia: 0 });
    expect(limites.espiritualesAlDia).toBe(0);
    expect(puedeEnviarse(con({ limites })).aceptado).toBe(false);
  });

  it('un valor absurdo cae al techo, no al infinito', () => {
    expect(limitesValidos({ espiritualesAlDia: Number.NaN }).espiritualesAlDia).toBe(3);
    expect(limitesValidos({ espiritualesAlDia: -5 }).espiritualesAlDia).toBe(0);
  });

  it('la seguridad no tiene límite: aparece aunque se hayan enviado diez', () => {
    expect(
      puedeEnviarse(
        con({
          categoria: 'seguridad',
          texto: 'Hay una actividad que revisar.',
          consumo: { espiritualesHoy: 10, resumenesHoy: 5, promocionalesEstaSemana: 5 },
        }),
      ).aceptado,
    ).toBe(true);
  });
});

describe('promocionales', () => {
  it('sin consentimiento explícito no salen', () => {
    expect(
      puedeEnviarse(con({ categoria: 'promocional', texto: 'Hay contenido nuevo.' })).motivo,
    ).toBe('notificaciones.errores.sinConsentimiento');
  });

  it('con consentimiento, una a la semana', () => {
    const base = con({
      categoria: 'promocional',
      texto: 'Hay contenido nuevo.',
      aceptaPromocionales: true,
    });

    expect(puedeEnviarse(base).aceptado).toBe(true);
    expect(
      puedeEnviarse({
        ...base,
        consumo: { espiritualesHoy: 0, resumenesHoy: 0, promocionalesEstaSemana: 1 },
      }).aceptado,
    ).toBe(false);
  });
});

describe('apagarlas del todo', () => {
  it('respeta el interruptor general', () => {
    expect(puedeEnviarse(con({ notificacionesActivas: false })).motivo).toBe(
      'notificaciones.errores.desactivadas',
    );
  });

  it('pero la seguridad sigue llegando', () => {
    // Apagar los recordatorios no es renunciar a enterarse de que alguien
    // entró en tu cuenta.
    expect(
      puedeEnviarse(
        con({
          categoria: 'seguridad',
          texto: 'Hay una actividad que revisar.',
          notificacionesActivas: false,
        }),
      ).aceptado,
    ).toBe(true);
  });

  it('ni siquiera la seguridad puede usar lenguaje de culpa', () => {
    // El paso libre es para la urgencia, no para el tono.
    expect(
      puedeEnviarse(con({ categoria: 'seguridad', texto: 'Has fallado en proteger tu cuenta.' }))
        .aceptado,
    ).toBe(false);
  });
});

describe('prioridades', () => {
  it.each([
    ['seguridad', 'critica'],
    ['evento', 'alta'],
    ['respaldo', 'alta'],
    ['habito', 'normal'],
    ['resumen', 'baja'],
    ['promocional', 'baja'],
  ])('%s es de prioridad %s', (categoria, esperada) => {
    expect(prioridadDe(categoria as Categoria)).toBe(esperada);
  });

  it('ningún hábito ni promoción llega a crítica', () => {
    // La prioridad crítica salta el silencio; darla a un hábito sería
    // convertir un recordatorio en una alarma.
    for (const categoria of ['habito', 'oracion', 'devocional', 'promocional'] as const) {
      expect(prioridadDe(categoria)).not.toBe('critica');
    }
  });
});

describe('fatiga', () => {
  it('a la tercera ignorada se sugiere reducir, no se insiste más', () => {
    expect(sugerirReducir(2)).toBe(false);
    expect(sugerirReducir(3)).toBe(true);
  });
});
