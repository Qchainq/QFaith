// Frontera entre el texto y el sobre en el Pulso.
//
// Lo propio de este módulo es que el registro está partido: el estado y el
// día van en claro, la nota va cifrada. Estas pruebas van a los casos que la
// pantalla no llega a provocar — el historial, borrar, la intensidad y una
// nota que no abre.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioPulso, TIPO_PULSO } from '../repositories/repositorioPulso';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('pulso');

  return {
    almacen,
    repositorio: crearRepositorioPulso({
      almacen,
      usuarioId: USUARIO,
      motor: crearMotorSincronizacion({
        almacen,
        remoto: crearServidorEnMemoria(),
        usuarioId: USUARIO,
        dispositivoId: 'dispositivo-1',
      }),
      clavePulso: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

describe('historial', () => {
  it('devuelve los días del más reciente al más antiguo', async () => {
    const { repositorio } = montar();

    // Se guardan desordenados a propósito: si ordenara por escritura, saldría
    // al revés.
    await repositorio.guardar({ fecha: '2026-08-01', estado: 'cansado' });
    await repositorio.guardar({ fecha: '2026-08-03', estado: 'enPaz' });
    await repositorio.guardar({ fecha: '2026-08-02', estado: 'ansioso' });

    expect((await repositorio.listar()).map((pulso) => pulso.fecha)).toEqual([
      '2026-08-03',
      '2026-08-02',
      '2026-08-01',
    ]);
  });

  it('un día sin pulso devuelve null en vez de inventar uno', async () => {
    const { repositorio } = montar();
    expect(await repositorio.deLaFecha('2026-08-03')).toBeNull();
  });
});

describe('la nota', () => {
  it('vuelve entera después de pasar por el sobre', async () => {
    const { repositorio } = montar();

    const guardado = await repositorio.guardar({
      fecha: '2026-08-03',
      estado: 'ansioso',
      nota: 'Mañana dan los resultados.',
    });

    expect(guardado.nota).toBe('Mañana dan los resultados.');
  });

  it('sin nota queda vacía, y eso no es un error', async () => {
    const { repositorio } = montar();

    const guardado = await repositorio.guardar({ fecha: '2026-08-03', estado: 'enPaz' });
    expect(guardado.nota).toBe('');
  });

  it('una nota que no abre no invalida el pulso', async () => {
    // El estado y el día siguen siendo legibles, y son lo que la pantalla
    // necesita. Perder el pulso entero por una nota corrupta sería peor.
    const { almacen, repositorio } = montar();
    const guardado = await repositorio.guardar({
      fecha: '2026-08-03',
      estado: 'triste',
      nota: 'Algo que se va a corromper',
    });

    const registro = await almacen.obtener(TIPO_PULSO, guardado.id);
    await almacen.guardar({
      ...registro!,
      sobre: { ...registro!.sobre, encryptedPayload: 'ZGF0b3MtcXVlLW5vLWFicmVu' },
    });

    const releido = await repositorio.deLaFecha('2026-08-03');
    expect(releido?.estado).toBe('triste');
    expect(releido?.nota).toBe('');
  });
});

describe('intensidad', () => {
  it('se conserva cuando se da', async () => {
    const { repositorio } = montar();
    const guardado = await repositorio.guardar({
      fecha: '2026-08-03',
      estado: 'cansado',
      intensidad: 4,
    });

    expect(guardado.intensidad).toBe(4);
  });

  it('sin intensidad queda en null, no en cero', async () => {
    // Un cero se leería como «nada de cansancio», que no es lo mismo que «no
    // lo dijo».
    const { repositorio } = montar();
    const guardado = await repositorio.guardar({ fecha: '2026-08-03', estado: 'cansado' });

    expect(guardado.intensidad).toBeNull();
  });
});

describe('identificador del día', () => {
  it('es el mismo para el mismo día y usuario', async () => {
    // Dos dispositivos sin conexión que respondan el mismo día calculan lo
    // mismo, así que el segundo corrige al primero en vez de chocar contra la
    // restricción única del servidor.
    const uno = montar();
    const otro = montar();

    expect(uno.repositorio.idDelDia('2026-08-03')).toBe(otro.repositorio.idDelDia('2026-08-03'));
  });

  it('cambia con el día', async () => {
    const { repositorio } = montar();
    expect(repositorio.idDelDia('2026-08-03')).not.toBe(repositorio.idDelDia('2026-08-04'));
  });
});

describe('eliminar', () => {
  it('es lógico: desaparece de la lista y deja rastro para sincronizar', async () => {
    const { repositorio } = montar();
    await repositorio.guardar({ fecha: '2026-08-03', estado: 'enPaz' });

    await repositorio.eliminar('2026-08-03');

    expect(await repositorio.listar()).toHaveLength(0);
    expect(await repositorio.deLaFecha('2026-08-03')).toBeNull();
  });
});

describe('registros extraños', () => {
  it('un estado que este cliente no conoce se salta sin romper la lista', async () => {
    const { almacen, repositorio } = montar();
    const bueno = await repositorio.guardar({ fecha: '2026-08-02', estado: 'enPaz' });
    const raro = await repositorio.guardar({ fecha: '2026-08-03', estado: 'triste' });

    // Simula una versión futura con un estado que aquí no existe.
    const registro = await almacen.obtener(TIPO_PULSO, raro.id);
    await almacen.guardar({
      ...registro!,
      metadatos: { ...registro!.metadatos, mood_code: 'inventado' },
    });

    const lista = await repositorio.listar();
    expect(lista.map((pulso) => pulso.id)).toEqual([bueno.id]);
  });
});
