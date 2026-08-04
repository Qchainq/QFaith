// El seguimiento de un plan, con el motor y el cifrado reales.
//
// La prueba que da sentido a todo el archivo es «un plan abandonado espera
// donde lo dejaste»: con el reloj movido meses, el plan sigue en su día. Es lo
// que separa un acompañamiento de una deuda (invariante 12).
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import {
  crearRepositorioSeguimiento,
  TIPO_INSCRIPCION,
  TIPO_PROGRESO,
} from '../repositories/repositorioSeguimiento';

const USUARIO = 'usuario-1';
const PLAN = 'plan-de-la-ansiedad';
const REFLEXION = 'Hoy entendí que no puedo cargar con lo de mi hermano.';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('planes');

  // Reloj controlado: aquí no se comprueba qué hora es, sino que la hora no
  // decide nada.
  let instante = new Date('2026-08-01T09:00:00.000Z');
  const avanzar = (dias: number) => {
    instante = new Date(instante.getTime() + dias * 24 * 60 * 60 * 1000);
  };

  return {
    almacen,
    avanzar,
    repositorio: crearRepositorioSeguimiento({
      almacen,
      usuarioId: USUARIO,
      motor: crearMotorSincronizacion({
        almacen,
        remoto: crearServidorEnMemoria(),
        usuarioId: USUARIO,
        dispositivoId: 'dispositivo-1',
      }),
      clavePlanes: () => clave,
      claveHash: () => derivadas.claveHash,
      ahora: () => instante,
    }),
  };
}

describe('empezar un plan', () => {
  it('arranca en el día uno y activo', async () => {
    const { repositorio } = montar();

    const inscripcion = await repositorio.empezar(PLAN);

    expect(inscripcion).toMatchObject({ planId: PLAN, diaActual: 1, estado: 'active' });
    expect(inscripcion.completadoEn).toBeNull();
  });

  it('apuntarse dos veces es apuntarse una', async () => {
    const { repositorio } = montar();

    const primera = await repositorio.empezar(PLAN);
    const segunda = await repositorio.empezar(PLAN);

    // El esquema lo prohíbe con un índice único. Sin reconocerlo aquí, la
    // segunda solo reventaría al sincronizar, lejos de donde se causó.
    expect(segunda.id).toBe(primera.id);
    expect(await repositorio.inscripciones()).toHaveLength(1);
  });

  it('tras abandonarlo se puede volver a empezar de cero', async () => {
    const { repositorio } = montar();

    const primera = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: primera.id, numero: 1, totalDias: 7 });
    await repositorio.abandonar(primera.id);

    const segunda = await repositorio.empezar(PLAN);

    // Volver a hacer un plan es algo que la gente hace, y el recorrido
    // anterior no se pisa.
    expect(segunda.id).not.toBe(primera.id);
    expect(segunda.diaActual).toBe(1);
    expect(await repositorio.diasDe(primera.id)).toHaveLength(1);
  });
});

describe('el plan avanza al leer, no con el calendario', () => {
  it('un plan abandonado meses atrás espera donde lo dejaste', async () => {
    // Es la prueba central del módulo. Si algún día alguien calculara el día
    // «que tocaría» por fecha, esta persona volvería al día 90 de un plan de
    // 30 y encontraría el plan roto o dado por fallado.
    const { repositorio, avanzar } = montar();

    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 30 });
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 2, totalDias: 30 });

    avanzar(90);

    const despues = (await repositorio.inscripciones())[0];
    expect(despues?.diaActual).toBe(3);
    expect(despues?.estado).toBe('active');
  });

  it('leer varios días seguidos avanza uno cada vez', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    for (const numero of [1, 2, 3]) {
      await repositorio.completarDia({ inscripcionId: inscripcion.id, numero, totalDias: 7 });
    }

    expect((await repositorio.inscripciones())[0]?.diaActual).toBe(4);
  });

  it('rellenar un hueco antiguo no salta contenido', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 2, totalDias: 7 });

    // Vuelve sobre el día 1 para escribir algo que se dejó.
    const { inscripcion: tras } = await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 1,
      totalDias: 7,
    });

    expect(tras.diaActual).toBe(3);
  });

  it('completar el último día termina el plan', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    for (const numero of [1, 2, 3]) {
      await repositorio.completarDia({ inscripcionId: inscripcion.id, numero, totalDias: 3 });
    }

    const final = (await repositorio.inscripciones())[0];
    expect(final?.estado).toBe('completed');
    expect(final?.completadoEn).toBe('2026-08-01');
  });

  it('marcar el último día estando lejos no da el plan por terminado', async () => {
    // Alguien curiosea el final de un plan de 30 estando en el día 2. Eso no
    // es haberlo hecho.
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    const { inscripcion: tras } = await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 30,
      totalDias: 30,
    });

    expect(tras.estado).toBe('active');
    expect(tras.diaActual).toBe(1);
  });
});

describe('la reflexión', () => {
  it('no llega en claro al almacén', async () => {
    const { repositorio, almacen } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 1,
      totalDias: 7,
      reflexion: REFLEXION,
    });

    // Es contenido tan personal como una entrada del diario: lo que alguien
    // escribe leyendo sobre el perdón dice a quién le cuesta perdonar.
    const registros = await almacen.listar(TIPO_PROGRESO);
    expect(JSON.stringify(registros)).not.toContain(REFLEXION);
    expect(JSON.stringify(registros)).not.toContain('mi hermano');
  });

  it('se vuelve a leer descifrada', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 1,
      totalDias: 7,
      reflexion: REFLEXION,
    });

    expect((await repositorio.diasDe(inscripcion.id))[0]?.reflexion).toBe(REFLEXION);
  });

  it('los días de un plan no aparecen en otro', async () => {
    // Seguir dos planes a la vez es normal. Sin filtrar por inscripción, el
    // día 1 de uno se enseñaría como día 1 del otro, con la reflexión
    // equivocada delante.
    const { repositorio } = montar();
    const ansiedad = await repositorio.empezar(PLAN);
    const perdon = await repositorio.empezar('plan-del-perdon');

    await repositorio.completarDia({
      inscripcionId: ansiedad.id,
      numero: 1,
      totalDias: 7,
      reflexion: REFLEXION,
    });
    await repositorio.completarDia({
      inscripcionId: perdon.id,
      numero: 1,
      totalDias: 30,
      reflexion: 'Otra cosa distinta.',
    });

    const deAnsiedad = await repositorio.diasDe(ansiedad.id);
    expect(deAnsiedad).toHaveLength(1);
    expect(deAnsiedad[0]?.reflexion).toBe(REFLEXION);
    expect((await repositorio.diasDe(perdon.id))[0]?.reflexion).toBe('Otra cosa distinta.');
  });

  it('un día sin reflexión no es un error', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });

    const dias = await repositorio.diasDe(inscripcion.id);
    expect(dias[0]?.reflexion).toBe('');
    expect(dias[0]?.completadoEn).not.toBeNull();
  });

  it('reescribirla no mueve el plan ni cambia cuándo se leyó', async () => {
    const { repositorio, avanzar } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 1,
      totalDias: 7,
      reflexion: 'Primera idea.',
    });
    const original = (await repositorio.diasDe(inscripcion.id))[0]?.completadoEn;

    avanzar(3);
    await repositorio.reescribirReflexion({
      inscripcionId: inscripcion.id,
      numero: 1,
      reflexion: 'Lo que de verdad quería decir.',
    });

    const dia = (await repositorio.diasDe(inscripcion.id))[0];
    // Volver sobre lo que uno escribió no es volver a leer el día.
    expect((await repositorio.inscripciones())[0]?.diaActual).toBe(2);
    expect(dia?.reflexion).toBe('Lo que de verdad quería decir.');
    // Reescribir hoy lo que se leyó el martes no convierte el martes en hoy.
    expect(dia?.completadoEn).toBe(original);
  });

  it('el mismo día leído dos veces es un solo registro', async () => {
    const { repositorio, almacen } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });

    // El identificador se deriva de la inscripción y el número, así que dos
    // dispositivos sin conexión calculan el mismo y el segundo corrige al
    // primero en vez de chocar con la restricción única.
    expect(await almacen.listar(TIPO_PROGRESO)).toHaveLength(1);
  });
});

describe('pausar, retomar y abandonar', () => {
  it('pausar no pierde el sitio', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });

    const pausada = await repositorio.pausar(inscripcion.id);
    const retomada = await repositorio.retomar(inscripcion.id);

    expect(pausada.diaActual).toBe(2);
    expect(retomada).toMatchObject({ estado: 'active', diaActual: 2 });
  });

  it('abandonar conserva lo leído', async () => {
    // No es un borrado: dejar algo a medias es una decisión legítima, y quien
    // vuelva merece encontrar lo que escribió.
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({
      inscripcionId: inscripcion.id,
      numero: 1,
      totalDias: 7,
      reflexion: REFLEXION,
    });

    await repositorio.abandonar(inscripcion.id);

    expect((await repositorio.diasDe(inscripcion.id))[0]?.reflexion).toBe(REFLEXION);
  });
});

describe('retirar a la papelera', () => {
  it('se lleva la inscripción y sus días', async () => {
    const { repositorio, almacen } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });

    await repositorio.retirar(inscripcion.id);

    // Dejar los días sueltos los convertiría en registros huérfanos que nadie
    // puede ya ver ni borrar.
    expect(await repositorio.inscripciones()).toHaveLength(0);
    expect(await almacen.listar(TIPO_PROGRESO)).toHaveLength(0);
    expect(await almacen.listar(TIPO_INSCRIPCION)).toHaveLength(0);
  });

  it('lo retirado no reaparece al listar', async () => {
    const { repositorio } = montar();
    const primera = await repositorio.empezar(PLAN);
    await repositorio.retirar(primera.id);
    const segunda = await repositorio.empezar('otro-plan');

    expect((await repositorio.inscripciones()).map((i) => i.id)).toEqual([segunda.id]);
  });
});

describe('recuento de días leídos', () => {
  it('cuenta por inscripción, no mezcla planes', async () => {
    const { repositorio } = montar();
    const ansiedad = await repositorio.empezar(PLAN);
    const perdon = await repositorio.empezar('plan-del-perdon');

    for (const numero of [1, 2, 3]) {
      await repositorio.completarDia({ inscripcionId: ansiedad.id, numero, totalDias: 7 });
    }
    await repositorio.completarDia({ inscripcionId: perdon.id, numero: 1, totalDias: 30 });

    const leidos = await repositorio.leidosPorInscripcion();
    expect(leidos.get(ansiedad.id)).toBe(3);
    expect(leidos.get(perdon.id)).toBe(1);
  });

  it('un plan sin empezar no aparece en el recuento', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    // `undefined` y no `0`: la pantalla ya sabe tratar la ausencia, y así se
    // distingue «no ha leído nada» de «no hay datos».
    expect((await repositorio.leidosPorInscripcion()).get(inscripcion.id)).toBeUndefined();
  });

  it('una reflexión escrita sin marcar el día no cuenta como leído', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);

    await repositorio.reescribirReflexion({
      inscripcionId: inscripcion.id,
      numero: 1,
      reflexion: 'Empecé a escribir y lo dejé.',
    });

    expect((await repositorio.leidosPorInscripcion()).get(inscripcion.id)).toBeUndefined();
  });

  it('lo retirado a la papelera deja de contar', async () => {
    const { repositorio } = montar();
    const inscripcion = await repositorio.empezar(PLAN);
    await repositorio.completarDia({ inscripcionId: inscripcion.id, numero: 1, totalDias: 7 });

    await repositorio.retirar(inscripcion.id);

    expect((await repositorio.leidosPorInscripcion()).size).toBe(0);
  });
});
