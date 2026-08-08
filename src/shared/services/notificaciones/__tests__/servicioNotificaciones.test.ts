// El servicio que convierte la política en avisos.
//
// Se prueba con un puerto de mentira que anota lo que se le pide, porque lo
// que importa no es que llame al sistema operativo sino **qué le pide y qué
// no**: un aviso de más a las tres de la mañana, o uno que sigue sonando
// después de cerrar sesión, son fallos que solo se ven mirando esa lista.
import { DETALLE_POR_DEFECTO } from '../contenidoVisible';
import { LIMITES_MAXIMOS, SILENCIO_POR_DEFECTO, type Consumo } from '../politica';
import type { AvisoProgramable, PuertoNotificaciones } from '../puertoNotificaciones';
import {
  crearServicioNotificaciones,
  PREFERENCIAS_POR_DEFECTO,
  type Preferencias,
  type RecordatorioPedido,
} from '../servicioNotificaciones';

const MADRID = 'Europe/Madrid';
const SIN_CONSUMO: Consumo = { espiritualesHoy: 0, resumenesHoy: 0, promocionalesEstaSemana: 0 };

/** Puerto de mentira que anota todo lo que se le pide. */
function puertoDePrueba() {
  const programados = new Map<string, AvisoProgramable>();
  const cancelados: string[] = [];
  let vaciados = 0;

  const puerto: PuertoNotificaciones = {
    permisoActual: async () => 'concedido',
    pedirPermiso: async () => 'concedido',
    programar: async (aviso) => {
      programados.set(aviso.id, aviso);
    },
    cancelar: async (id) => {
      cancelados.push(id);
      programados.delete(id);
    },
    programados: async () => [...programados.keys()],
    cancelarTodos: async () => {
      vaciados += 1;
      programados.clear();
    },
    tokenPush: async () => null,
  };

  return { puerto, programados, cancelados, vaciados: () => vaciados };
}

function montar(cambios: Partial<Preferencias> = {}, consumo: Consumo = SIN_CONSUMO) {
  const doble = puertoDePrueba();
  let preferencias: Preferencias = {
    ...PREFERENCIAS_POR_DEFECTO(MADRID),
    activas: true,
    ...cambios,
  };

  const servicio = crearServicioNotificaciones({
    puerto: doble.puerto,
    preferencias: () => preferencias,
    consumo: () => consumo,
    // Un martes a las nueve de la mañana en Madrid.
    ahora: () => new Date('2026-08-11T07:00:00.000Z'),
  });

  return {
    ...doble,
    servicio,
    cambiar: (nuevas: Partial<Preferencias>) => {
      preferencias = { ...preferencias, ...nuevas };
    },
  };
}

const PEDIDO: RecordatorioPedido = {
  entidadId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  categoria: 'oracion',
  // Las diez de la mañana, todos los días.
  recordatorio: { minutoDelDia: 10 * 60, dias: [] },
  ruta: 'Oracion',
};

describe('lo que se programa', () => {
  it('un recordatorio se convierte en un aviso', async () => {
    const { servicio, programados } = montar();

    await servicio.reprogramar([PEDIDO]);

    expect(programados.size).toBe(1);
  });

  it('el aviso no lleva ni una palabra escrita por la persona', async () => {
    // La comprobación que sostiene todo lo demás: lo que llega al sistema
    // operativo son claves de un catálogo cerrado, no texto.
    const { servicio, programados } = montar({ detalle: 'area' });

    await servicio.reprogramar([PEDIDO]);
    const aviso = [...programados.values()][0];

    expect(aviso?.claveTitulo).toBe('notificaciones.visible.oracion.titulo');
    expect(aviso?.claveCuerpo).toBe('notificaciones.visible.oracion.cuerpo');
    expect(JSON.stringify(aviso)).not.toMatch(/[a-z]{4,} [a-z]{4,} [a-z]{4,}/);
  });

  it('con la vista previa apagada ni siquiera dice de qué módulo es', async () => {
    const { servicio, programados } = montar({ detalle: DETALLE_POR_DEFECTO });

    await servicio.reprogramar([PEDIDO]);

    expect([...programados.values()][0]?.claveTitulo).toBe(
      'notificaciones.visible.generico.titulo',
    );
  });

  it('lleva la ruta y el identificador para poder abrirlo, y nada más', async () => {
    const { servicio, programados } = montar();

    await servicio.reprogramar([PEDIDO]);
    const aviso = [...programados.values()][0];

    expect(aviso?.ruta).toBe('Oracion');
    expect(aviso?.entidadId).toBe(PEDIDO.entidadId);
  });
});

describe('la política manda', () => {
  it('lo que cae en horario de silencio no se programa', async () => {
    // Un devocional a las once de la noche no despierta a nadie.
    const { servicio, programados } = montar();

    await servicio.reprogramar([{ ...PEDIDO, recordatorio: { minutoDelDia: 23 * 60, dias: [] } }]);

    expect(programados.size).toBe(0);
  });

  it('pasado el límite diario tampoco', async () => {
    const { servicio, programados } = montar({}, { ...SIN_CONSUMO, espiritualesHoy: 3 });

    await servicio.reprogramar([PEDIDO]);

    expect(programados.size).toBe(0);
  });

  it('una hora imposible no programa nada en vez de sonar cuando le parezca', async () => {
    // **Sin horario de silencio a propósito.** Con el de por defecto esta
    // prueba pasaba por casualidad: al quitar la guarda, la hora sin resolver
    // caía dentro del tramo silencioso y el resultado era el mismo cero. Un
    // verde por el motivo equivocado, que es peor que un rojo.
    const { servicio, programados } = montar({
      silencio: { desdeMinuto: 0, hastaMinuto: 0 },
    });

    await servicio.reprogramar([{ ...PEDIDO, recordatorio: { minutoDelDia: 1500, dias: [] } }]);

    expect(programados.size).toBe(0);
  });

  it('y un minuto negativo tampoco', async () => {
    const { servicio, programados } = montar({
      silencio: { desdeMinuto: 0, hastaMinuto: 0 },
    });

    await servicio.reprogramar([{ ...PEDIDO, recordatorio: { minutoDelDia: -30, dias: [] } }]);

    expect(programados.size).toBe(0);
  });

  it('con el interruptor general apagado se retira lo que hubiera', async () => {
    // No basta con dejar de programar: los de la semana pasada seguirían
    // sonando, y quien apaga el interruptor espera silencio.
    const montado = montar();
    await montado.servicio.reprogramar([PEDIDO]);
    expect(montado.programados.size).toBe(1);

    montado.cambiar({ activas: false });
    await montado.servicio.reprogramar([PEDIDO]);

    expect(montado.programados.size).toBe(0);
    expect(montado.vaciados()).toBe(1);
  });
});

describe('reprogramar no duplica', () => {
  it('dos veces lo mismo deja un solo aviso', async () => {
    // Es la idempotencia que el Documento 13 exige a las tareas de fondo: se
    // ejecutan más veces de las que uno cree.
    const { servicio, programados } = montar();

    await servicio.reprogramar([PEDIDO]);
    await servicio.reprogramar([PEDIDO]);

    expect(programados.size).toBe(1);
  });

  it('lo que ya no toca se cancela', async () => {
    // Quien borra un hábito no debería seguir recibiendo su recordatorio.
    const otro: RecordatorioPedido = {
      ...PEDIDO,
      entidadId: '11111111-1111-4111-8111-111111111111',
      categoria: 'habito',
    };
    const { servicio, programados, cancelados } = montar();

    await servicio.reprogramar([PEDIDO, otro]);
    expect(programados.size).toBe(2);

    await servicio.reprogramar([PEDIDO]);

    expect(programados.size).toBe(1);
    expect(cancelados).toHaveLength(1);
  });

  it('cambiar de zona horaria mueve el aviso', async () => {
    // «Las diez» significa las diez donde está la persona. Sin reprogramar,
    // quien vuela a México recibiría su devocional de madrugada.
    const montado = montar();
    await montado.servicio.reprogramar([PEDIDO]);
    const enMadrid = [...montado.programados.values()][0]?.instante;

    montado.cambiar({ zonaHoraria: 'America/Mexico_City' });
    await montado.servicio.reprogramar([PEDIDO]);
    const enMexico = [...montado.programados.values()][0]?.instante;

    expect(enMexico?.toISOString()).not.toBe(enMadrid?.toISOString());
    expect(montado.programados.size).toBe(1);
  });
});

describe('cerrar sesión', () => {
  it('no deja ni un aviso programado', async () => {
    // Son avisos sobre el contenido de alguien: si la sesión se cierra en un
    // teléfono prestado, no pueden seguir apareciendo.
    const { servicio, programados } = montar();
    await servicio.reprogramar([PEDIDO]);

    await servicio.olvidarTodo();

    expect(programados.size).toBe(0);
  });
});

describe('el permiso del sistema', () => {
  it('consultarlo no lo pide', async () => {
    // El Documento 13 exige explicar para qué antes de que salga el diálogo:
    // quien lo ve sin contexto dice que no, y no hay segunda oportunidad.
    let veces = 0;
    const servicio = crearServicioNotificaciones({
      puerto: {
        ...puertoDePrueba().puerto,
        pedirPermiso: async () => {
          veces += 1;
          return 'concedido';
        },
      },
      preferencias: () => ({ ...PREFERENCIAS_POR_DEFECTO(MADRID), activas: true }),
      consumo: () => SIN_CONSUMO,
    });

    await servicio.permiso();

    expect(veces).toBe(0);
  });

  it('pedirlo sí lo pide', async () => {
    const { servicio } = montar();
    expect(await servicio.pedirPermiso()).toBe('concedido');
  });
});

describe('valores de partida', () => {
  it('las preferencias nacen apagadas y discretas', () => {
    const preferencias = PREFERENCIAS_POR_DEFECTO(MADRID);

    expect(preferencias.activas).toBe(false);
    expect(preferencias.detalle).toBe('generico');
    expect(preferencias.aceptaPromocionales).toBe(false);
    expect(preferencias.silencio).toEqual(SILENCIO_POR_DEFECTO);
    expect(preferencias.limites).toEqual(LIMITES_MAXIMOS);
  });
});
