// Este repositorio guarda lo que permite recuperar la cuenta. Un fallo aquí
// no se nota hasta que alguien pierde el teléfono, así que conviene fijar el
// formato y los casos raros.
import { descargarMaterialCuenta, subirMaterialCuenta } from '../repositorioClaves';
import type { ClienteRest } from '../rest';

const USUARIO = '11111111-1111-4111-8111-111111111111';

const SOBRE_CLAVE = {
  keyId: 'clave-1',
  dominio: 'diario' as const,
  envoltorioBase64: 'envoltorio',
  nonceBase64: 'nonce-del-envoltorio',
  keyType: 'contenido' as const,
  encryptionMethod: 'xchacha20poly1305' as const,
  keyVersion: 1,
};

const SOBRE_RECUPERACION = {
  envoltorioBase64: 'maestra-envuelta',
  nonceBase64: 'nonce-de-recuperacion',
  parametrosKdf: {
    algoritmo: 'argon2id' as const,
    memoriaKiB: 19456,
    iteraciones: 2,
    paralelismo: 1,
    salBase64: 'c2FsLWRlLXBydWViYS0xNg==',
  },
  version: 1,
};

interface Llamada {
  readonly ruta: string;
  readonly cuerpo: unknown;
}

function crearRest(respuestas: { estado: number; filas: unknown[] }[]) {
  const llamadas: Llamada[] = [];
  const rest = {
    peticion: jest.fn(async (parametros: Record<string, unknown>) => {
      llamadas.push({ ruta: parametros.ruta as string, cuerpo: parametros.cuerpo });
      return { ...(respuestas.shift() ?? { estado: 200, filas: [] }), codigo: null };
    }),
    comoError: jest.fn(() => new Error('fallo del servidor')),
  } as unknown as ClienteRest;
  return { rest, llamadas };
}

describe('subida del material', () => {
  it('guarda el nonce y el dominio junto al envoltorio', async () => {
    // La tabla no tiene columnas para ellos, y separarlos del criptograma
    // solo invitaría a desparejarlos.
    const { rest, llamadas } = crearRest([
      { estado: 201, filas: [] },
      { estado: 201, filas: [] },
    ]);

    await subirMaterialCuenta({
      rest,
      usuarioId: USUARIO,
      sobresClaves: [SOBRE_CLAVE],
      sobreRecuperacion: SOBRE_RECUPERACION,
    });

    const filas = llamadas[0]?.cuerpo as { encrypted_key: string; user_id: string }[];
    expect(filas[0]?.user_id).toBe(USUARIO);
    expect(JSON.parse(filas[0]?.encrypted_key ?? '{}')).toEqual({
      d: 'diario',
      n: 'nonce-del-envoltorio',
      k: 'envoltorio',
    });
  });

  it('envía los parámetros de derivación que el servidor va a validar', async () => {
    const { rest, llamadas } = crearRest([
      { estado: 201, filas: [] },
      { estado: 201, filas: [] },
    ]);

    await subirMaterialCuenta({
      rest,
      usuarioId: USUARIO,
      sobresClaves: [SOBRE_CLAVE],
      sobreRecuperacion: SOBRE_RECUPERACION,
    });

    expect(llamadas[1]?.cuerpo).toMatchObject({
      kdf_algorithm: 'argon2id',
      kdf_parameters: { memoriaKiB: 19456, iteraciones: 2 },
    });
  });

  it('falla si los sobres no llegan, sin intentar la configuración de recuperación', async () => {
    const { rest, llamadas } = crearRest([{ estado: 403, filas: [] }]);

    await expect(
      subirMaterialCuenta({
        rest,
        usuarioId: USUARIO,
        sobresClaves: [SOBRE_CLAVE],
        sobreRecuperacion: SOBRE_RECUPERACION,
      }),
    ).rejects.toThrow();
    expect(llamadas).toHaveLength(1);
  });
});

describe('descarga del material', () => {
  const filaSobre = (parciales: Record<string, unknown> = {}) => ({
    key_id: 'clave-1',
    encrypted_key: JSON.stringify({ d: 'diario', n: 'nonce-del-envoltorio', k: 'envoltorio' }),
    encryption_method: 'xchacha20poly1305',
    key_version: 1,
    ...parciales,
  });

  const filaRecuperacion = {
    encrypted_recovery_envelope: 'maestra-envuelta',
    recovery_nonce: 'nonce-de-recuperacion',
    kdf_algorithm: 'argon2id',
    kdf_parameters: {
      memoriaKiB: 19456,
      iteraciones: 2,
      paralelismo: 1,
      salBase64: 'c2FsLWRlLXBydWViYS0xNg==',
    },
    recovery_version: 1,
  };

  it('reconstruye el sobre tal y como se subió', async () => {
    const { rest } = crearRest([
      { estado: 200, filas: [filaSobre()] },
      { estado: 200, filas: [filaRecuperacion] },
    ]);

    const material = await descargarMaterialCuenta({ rest });

    expect(material.sobresClaves).toEqual([SOBRE_CLAVE]);
    expect(material.sobreRecuperacion).toEqual(SOBRE_RECUPERACION);
  });

  it('una cuenta sin configuración de recuperación se distingue de un error', async () => {
    const { rest } = crearRest([
      { estado: 200, filas: [filaSobre()] },
      { estado: 200, filas: [] },
    ]);

    const material = await descargarMaterialCuenta({ rest });

    expect(material.sobreRecuperacion).toBeNull();
    expect(material.sobresClaves).toHaveLength(1);
  });

  it('descarta filas duplicadas de la misma clave', async () => {
    // Un alta reintentada pudo dejar dos filas idénticas.
    const { rest } = crearRest([
      { estado: 200, filas: [filaSobre(), filaSobre()] },
      { estado: 200, filas: [filaRecuperacion] },
    ]);

    const material = await descargarMaterialCuenta({ rest });

    expect(material.sobresClaves).toHaveLength(1);
  });

  it('una fila ilegible no tumba la restauración entera', async () => {
    const { rest } = crearRest([
      {
        estado: 200,
        filas: [
          filaSobre({ key_id: 'rota', encrypted_key: 'esto no es json' }),
          filaSobre({ key_id: 'buena' }),
        ],
      },
      { estado: 200, filas: [filaRecuperacion] },
    ]);

    const material = await descargarMaterialCuenta({ rest });

    // Perder una clave de dominio es malo; perder todas las demás por su
    // culpa sería peor.
    expect(material.sobresClaves.map((sobre) => sobre.keyId)).toEqual(['buena']);
  });

  it('descarta un envoltorio sin dominio: no se podría desenvolver', async () => {
    const { rest } = crearRest([
      { estado: 200, filas: [filaSobre({ encrypted_key: JSON.stringify({ k: 'solo-clave' }) })] },
      { estado: 200, filas: [filaRecuperacion] },
    ]);

    const material = await descargarMaterialCuenta({ rest });

    expect(material.sobresClaves).toHaveLength(0);
  });

  it('propaga el fallo del servidor', async () => {
    const { rest } = crearRest([
      { estado: 500, filas: [] },
      { estado: 200, filas: [] },
    ]);

    await expect(descargarMaterialCuenta({ rest })).rejects.toThrow();
  });
});
