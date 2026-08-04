// Sincronizar dejando constancia.
//
// El almacén de estado existía y nadie lo alimentaba: la aplicación nunca
// podía decir «guardado» ni avisar de un conflicto. Estas pruebas fijan lo
// que ahora sí ocurre, y sobre todo lo que no debe ocurrir — que un fallo de
// red tumbe la pantalla o acabe con un mensaje técnico en el estado.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { ErrorApp } from '@shared/errores/erroresApp';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import { useEstadoSincronizacion } from '@shared/state/estadoSincronizacion';

import { sincronizarConEstado } from '../use-cases/sincronizarConEstado';

const AHORA = '2026-08-03T12:00:00.000Z';

const motorReal = (): MotorSincronizacion => {
  const almacen = crearAlmacenEnMemoria();
  return crearMotorSincronizacion({
    almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: 'usuario-1',
    dispositivoId: 'dispositivo-1',
  });
};

beforeEach(() => {
  useEstadoSincronizacion.getState().reiniciar();
});

describe('sincronización correcta', () => {
  it('deja el estado inactivo y con la marca de la última correcta', async () => {
    const resultado = await sincronizarConEstado(motorReal(), () => AHORA);

    expect(resultado.correcta).toBe(true);

    const estado = useEstadoSincronizacion.getState();
    expect(estado.fase).toBe('inactiva');
    expect(estado.ultimaCorrecta).toBe(AHORA);
    expect(estado.claveError).toBeNull();
  });

  it('cuenta los conflictos pendientes, no solo los de esta ronda', async () => {
    // Puede haber conflictos de rondas anteriores que nadie ha resuelto. Si
    // solo se contaran los nuevos, el aviso desaparecería sin que nadie
    // hubiera decidido nada.
    const motor = motorReal();
    const conConflictos: MotorSincronizacion = {
      ...motor,
      sincronizar: async () => ({
        enviados: 1,
        recibidos: 2,
        conflictos: 0,
        rechazados: 0,
        revisionFinal: 5,
      }),
      conflictosPendientes: async () => [{ id: 'c1' }, { id: 'c2' }] as never,
    };

    await sincronizarConEstado(conConflictos, () => AHORA);

    const estado = useEstadoSincronizacion.getState();
    expect(estado.conflictosPendientes).toBe(2);
    expect(estado.cambiosSubidos).toBe(1);
    expect(estado.cambiosRecibidos).toBe(2);
  });
});

describe('sincronización fallida', () => {
  const motorQueFalla = (causa: unknown): MotorSincronizacion => {
    const motor = motorReal();
    return {
      ...motor,
      sincronizar: async () => {
        throw causa;
      },
    };
  };

  it('no lanza hacia arriba: quien llama suele ser un temporizador', async () => {
    const resultado = await sincronizarConEstado(motorQueFalla(new Error('sin red')));

    expect(resultado.correcta).toBe(false);
    expect(useEstadoSincronizacion.getState().fase).toBe('error');
  });

  it('guarda la clave de i18n del error, nunca el mensaje técnico', async () => {
    // Un mensaje técnico puede llevar dentro identificadores o rutas
    // (invariante 2).
    await sincronizarConEstado(
      motorQueFalla(
        new ErrorApp({
          codigo: 'RED_NO_DISPONIBLE',
          categoria: 'conectividad',
          claveMensaje: 'errores.sinConexion',
          puedeReintentarse: true,
        }),
      ),
    );

    expect(useEstadoSincronizacion.getState().claveError).toBe('errores.sinConexion');
  });

  it('un fallo desconocido cae en «sin conexión», no en un texto crudo', async () => {
    await sincronizarConEstado(motorQueFalla(new Error('ECONNRESET en /rest/v1/journal_entries')));

    const clave = useEstadoSincronizacion.getState().claveError;
    expect(clave).toBe('errores.sinConexion');
    expect(clave).not.toContain('journal_entries');
  });

  it('un fallo no borra la marca de la última correcta', async () => {
    // Perderla haría creer que nunca se ha sincronizado, que es peor que
    // decir «hace un rato que no se sincroniza».
    await sincronizarConEstado(motorReal(), () => AHORA);
    await sincronizarConEstado(motorQueFalla(new Error('sin red')));

    expect(useEstadoSincronizacion.getState().ultimaCorrecta).toBe(AHORA);
  });
});

describe('tareas de fondo', () => {
  // Los archivos no viajan por el motor: la ficha sí, el blob va por su
  // cuenta al cubo. Si nadie lo engancha aquí, una foto adjuntada sin
  // cobertura se queda en el teléfono para siempre.
  it('se ejecutan después de sincronizar, no antes', async () => {
    const orden: string[] = [];
    const motor = motorReal();
    const observado: MotorSincronizacion = {
      ...motor,
      sincronizar: async () => {
        orden.push('sincronizar');
        return motor.sincronizar();
      },
    };

    await sincronizarConEstado(observado, () => AHORA, [
      async () => {
        orden.push('tarea');
      },
    ]);

    // Al revés, subir el blob de una ficha que aún no existe en el servidor
    // dejaría un archivo huérfano en el cubo si el envío fallara.
    expect(orden).toEqual(['sincronizar', 'tarea']);
  });

  it('una tarea que falla no tumba la ronda', async () => {
    const resultado = await sincronizarConEstado(motorReal(), () => AHORA, [
      async () => {
        throw new Error('el cubo no responde');
      },
    ]);

    // La sincronización sí funcionó. Decir lo contrario haría que la pantalla
    // avisara de un problema que no afecta a lo que la persona escribió.
    expect(resultado.correcta).toBe(true);
    expect(useEstadoSincronizacion.getState().fase).toBe('inactiva');
  });

  it('si la sincronización falla, las tareas no se intentan', async () => {
    let intentada = false;
    const motor = motorReal();

    await sincronizarConEstado(
      {
        ...motor,
        sincronizar: async () => {
          throw new Error('sin red');
        },
      },
      () => AHORA,
      [
        async () => {
          intentada = true;
        },
      ],
    );

    // Sin red para la ficha tampoco la hay para el archivo.
    expect(intentada).toBe(false);
  });
});
