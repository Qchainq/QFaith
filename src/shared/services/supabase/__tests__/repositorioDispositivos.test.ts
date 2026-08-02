// El alta del dispositivo tiene que ser idempotente: se ejecuta en cada
// arranque y no puede llenar la tabla de duplicados ni perder el UUID que ya
// tenía asignado.
import * as AlmacenSeguro from 'expo-secure-store';

import { asegurarDispositivo, identificadorDeInstalacion } from '../repositorioDispositivos';
import type { ClienteRest } from '../rest';

const almacenInterno = (AlmacenSeguro as unknown as { __almacen: Map<string, string> }).__almacen;

const USUARIO = '11111111-1111-4111-8111-111111111111';

interface PeticionRegistrada {
  readonly ruta: string;
  readonly prefer: string | undefined;
  readonly cuerpo: Record<string, unknown>;
}

function crearRestFalso(respuesta: { estado: number; filas: unknown[]; codigo?: string }) {
  const peticiones: PeticionRegistrada[] = [];
  const rest = {
    peticion: jest.fn(async (parametros: Record<string, unknown>) => {
      peticiones.push({
        ruta: parametros.ruta as string,
        prefer: parametros.prefer as string | undefined,
        cuerpo: parametros.cuerpo as Record<string, unknown>,
      });
      return { estado: respuesta.estado, filas: respuesta.filas, codigo: respuesta.codigo ?? null };
    }),
    comoError: jest.fn(() => new Error('fallo del servidor')),
  } as unknown as ClienteRest;
  return { rest, peticiones };
}

beforeEach(() => {
  almacenInterno.clear();
});

describe('identificador de instalación', () => {
  it('se genera una vez y se conserva', async () => {
    const primero = await identificadorDeInstalacion();
    const segundo = await identificadorDeInstalacion();

    expect(primero).toMatch(/^[0-9a-f-]{36}$/);
    expect(segundo).toBe(primero);
  });

  it('no procede de ningún identificador del sistema: dos instalaciones difieren', async () => {
    const primero = await identificadorDeInstalacion();
    almacenInterno.clear(); // Equivale a desinstalar y volver a instalar.
    const trasReinstalar = await identificadorDeInstalacion();

    expect(trasReinstalar).not.toBe(primero);
  });
});

describe('alta del dispositivo', () => {
  it('devuelve el UUID que asigna el servidor', async () => {
    const { rest } = crearRestFalso({ estado: 201, filas: [{ id: 'uuid-del-servidor' }] });

    await expect(
      asegurarDispositivo({
        rest,
        usuarioId: USUARIO,
        identificadorPublico: 'instalacion-a',
        plataforma: 'ios',
      }),
    ).resolves.toBe('uuid-del-servidor');
  });

  it('se apoya en la restricción única para no duplicar', async () => {
    const { rest, peticiones } = crearRestFalso({ estado: 200, filas: [{ id: 'uuid' }] });

    await asegurarDispositivo({
      rest,
      usuarioId: USUARIO,
      identificadorPublico: 'instalacion-a',
      plataforma: 'android',
      nombre: 'Teléfono de prueba',
    });

    expect(peticiones[0]?.ruta).toContain('on_conflict=user_id,device_public_id');
    expect(peticiones[0]?.prefer).toContain('resolution=merge-duplicates');
  });

  it('no envía nada que sirva para rastrear a la persona', async () => {
    const { rest, peticiones } = crearRestFalso({ estado: 201, filas: [{ id: 'uuid' }] });

    await asegurarDispositivo({
      rest,
      usuarioId: USUARIO,
      identificadorPublico: 'instalacion-a',
      plataforma: 'ios',
    });

    // Solo lo imprescindible para que el usuario reconozca el dispositivo y
    // pueda revocarlo. Nada de identificadores publicitarios.
    expect(Object.keys(peticiones[0]?.cuerpo ?? {}).sort()).toEqual([
      'device_public_id',
      'last_seen_at',
      'platform',
      'user_id',
    ]);
  });

  it('falla si el servidor rechaza el alta', async () => {
    const { rest } = crearRestFalso({ estado: 403, filas: [], codigo: '42501' });

    await expect(
      asegurarDispositivo({
        rest,
        usuarioId: USUARIO,
        identificadorPublico: 'instalacion-a',
        plataforma: 'ios',
      }),
    ).rejects.toThrow();
  });

  it('falla si el servidor responde sin fila: sin UUID no se puede sincronizar', async () => {
    const { rest } = crearRestFalso({ estado: 201, filas: [] });

    await expect(
      asegurarDispositivo({
        rest,
        usuarioId: USUARIO,
        identificadorPublico: 'instalacion-a',
        plataforma: 'ios',
      }),
    ).rejects.toThrow();
  });
});
