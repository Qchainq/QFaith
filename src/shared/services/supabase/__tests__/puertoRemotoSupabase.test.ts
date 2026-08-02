// El puerto traduce entre el motor de sincronización y PostgREST. Lo que se
// comprueba aquí es la forma exacta de cada petición, que es lo que las
// pruebas contra el proyecto real no pueden ver: si un `update` sale sin el
// filtro `version=eq.N`, el servidor lo acepta encantado y pisa el trabajo de
// otro dispositivo sin que nadie lo note.
import { esErrorApp } from '@shared/errores/erroresApp';
import type { CambioSaliente } from '@shared/services/sync/puertoRemoto';

import { crearPuertoRemotoSupabase } from '../puertoRemotoSupabase';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const ENTIDAD = '22222222-2222-4222-8222-222222222222';

interface PeticionRegistrada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
  readonly cabeceras: Record<string, string>;
}

interface RespuestaPreparada {
  readonly estado: number;
  readonly cuerpo: unknown;
}

function crearTransporte(respuestas: RespuestaPreparada[]) {
  const peticiones: PeticionRegistrada[] = [];

  const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
    const cabeceras = (init?.headers ?? {}) as Record<string, string>;
    peticiones.push({
      url: String(url),
      metodo: init?.method ?? 'GET',
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      cabeceras,
    });

    const siguiente = respuestas.shift();
    if (siguiente === undefined) {
      // La descarga consulta todas las tablas registradas. Las que la prueba
      // no prepara responden vacío; cualquier otra petición sin respuesta sí
      // es un error, para que un envío inesperado no pase desapercibido.
      if (String(url).includes('sync_revision=gt.')) {
        return { status: 200, text: async () => '[]' } as Response;
      }
      throw new Error(`Petición inesperada: ${init?.method} ${String(url)}`);
    }
    return {
      status: siguiente.estado,
      text: async () => JSON.stringify(siguiente.cuerpo),
    } as Response;
  }) as unknown as typeof fetch;

  return { transporte, peticiones };
}

function crearPuerto(respuestas: RespuestaPreparada[], token: string | null = 'token-de-prueba') {
  const { transporte, peticiones } = crearTransporte(respuestas);
  const puerto = crearPuertoRemotoSupabase({
    transporte,
    proveerToken: async () => token,
    url: 'https://proyecto.supabase.co',
    claveAnonima: 'clave-publicable',
    usuarioId: USUARIO,
    ahora: () => '2026-08-02T10:00:00.000Z',
  });
  return { puerto, peticiones };
}

const sobre = {
  encryptedPayload: 'criptograma',
  encryptionVersion: 1,
  keyId: '33333333-3333-4333-8333-333333333333',
  nonce: 'nonce',
  contentHash: 'hash-del-contenido',
};

const cambio = (parciales: Partial<CambioSaliente> = {}): CambioSaliente => ({
  id: ENTIDAD,
  tipoEntidad: 'journal_entries',
  operacion: 'update',
  sobre,
  metadatos: { entry_type: 'gratitude', entry_date: '2026-08-02', is_favorite: false },
  versionBase: 3,
  dispositivoId: '44444444-4444-4444-8444-444444444444',
  ...parciales,
});

const filaRemota = (parciales: Record<string, unknown> = {}) => ({
  id: ENTIDAD,
  user_id: USUARIO,
  version: 4,
  sync_revision: 17,
  deleted_at: null,
  last_modified_device_id: null,
  encrypted_payload: 'criptograma',
  encryption_version: 1,
  key_id: '33333333-3333-4333-8333-333333333333',
  nonce: 'nonce',
  content_hash: 'hash-del-contenido',
  entry_type: 'gratitude',
  entry_date: '2026-08-02',
  is_favorite: false,
  is_ark_protected: false,
  ...parciales,
});

describe('envío de cambios', () => {
  it('crea con POST y devuelve la revisión que asignó el trigger', async () => {
    const { puerto, peticiones } = crearPuerto([
      { estado: 201, cuerpo: [filaRemota({ version: 1, sync_revision: 9 })] },
    ]);

    const [resultado] = await puerto.enviar([cambio({ operacion: 'create', versionBase: 0 })]);

    expect(resultado).toEqual({ estado: 'aceptado', id: ENTIDAD, revision: 9, version: 1 });
    expect(peticiones[0]?.metodo).toBe('POST');
    expect(peticiones[0]?.url).toContain('/rest/v1/journal_entries');
    expect(peticiones[0]?.cabeceras.Prefer).toBe('return=representation');
    expect(peticiones[0]?.cuerpo).toMatchObject({
      id: ENTIDAD,
      user_id: USUARIO,
      encrypted_payload: 'criptograma',
      entry_type: 'gratitude',
    });
  });

  it('actualiza filtrando por la versión sobre la que se basó el cambio', async () => {
    const { puerto, peticiones } = crearPuerto([{ estado: 200, cuerpo: [filaRemota()] }]);

    const [resultado] = await puerto.enviar([cambio({ versionBase: 3 })]);

    expect(resultado).toEqual({ estado: 'aceptado', id: ENTIDAD, revision: 17, version: 4 });
    expect(peticiones[0]?.metodo).toBe('PATCH');
    // Sin este filtro no hay concurrencia optimista y el invariante 5 se
    // incumple en silencio.
    expect(peticiones[0]?.url).toContain('version=eq.3');
    expect(peticiones[0]?.url).toContain(`id=eq.${ENTIDAD}`);
  });

  it('no reescribe el identificador ni el dueño de la fila', async () => {
    const { puerto, peticiones } = crearPuerto([{ estado: 200, cuerpo: [filaRemota()] }]);
    await puerto.enviar([cambio()]);

    expect(peticiones[0]?.cuerpo).not.toHaveProperty('id');
    expect(peticiones[0]?.cuerpo).not.toHaveProperty('user_id');
  });

  it('el borrado es lógico: marca deleted_at, nunca hace DELETE', async () => {
    const { puerto, peticiones } = crearPuerto([
      { estado: 200, cuerpo: [filaRemota({ deleted_at: '2026-08-02T10:00:00.000Z' })] },
    ]);

    const [resultado] = await puerto.enviar([cambio({ operacion: 'delete' })]);

    expect(resultado?.estado).toBe('aceptado');
    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.cuerpo).toMatchObject({ deleted_at: '2026-08-02T10:00:00.000Z' });
  });
});

describe('cuando la escritura no afecta a ninguna fila', () => {
  it('devuelve conflicto con la versión remota, sin sobrescribir nada', async () => {
    const { puerto } = crearPuerto([
      { estado: 200, cuerpo: [] },
      {
        estado: 200,
        cuerpo: [
          filaRemota({
            version: 7,
            encrypted_payload: 'criptograma-del-otro-dispositivo',
            content_hash: 'otro-hash',
          }),
        ],
      },
    ]);

    const [resultado] = await puerto.enviar([cambio({ versionBase: 3 })]);

    expect(resultado).toMatchObject({
      estado: 'conflicto',
      id: ENTIDAD,
      versionRemota: 7,
      sobreRemoto: { encryptedPayload: 'criptograma-del-otro-dispositivo' },
    });
  });

  it('reconoce el reenvío de un cambio que en realidad ya llegó', async () => {
    // La respuesta se perdió por el camino y el motor reintenta. La fila
    // remota ya trae nuestro cambio: marcar conflicto obligaría al usuario a
    // resolver algo que nunca ocurrió.
    const { puerto } = crearPuerto([
      { estado: 200, cuerpo: [] },
      { estado: 200, cuerpo: [filaRemota({ version: 4, sync_revision: 21 })] },
    ]);

    const [resultado] = await puerto.enviar([cambio({ versionBase: 3 })]);

    expect(resultado).toEqual({ estado: 'aceptado', id: ENTIDAD, revision: 21, version: 4 });
  });

  it('no confunde un borrado reenviado con una actualización aceptada', async () => {
    // Mismo contenido y misma versión, pero la fila remota no está borrada:
    // nuestro borrado no llegó, así que no puede darse por bueno.
    const { puerto } = crearPuerto([
      { estado: 200, cuerpo: [] },
      { estado: 200, cuerpo: [filaRemota({ version: 4, deleted_at: null })] },
    ]);

    const [resultado] = await puerto.enviar([cambio({ operacion: 'delete', versionBase: 3 })]);

    expect(resultado?.estado).toBe('conflicto');
  });

  it('rechaza sin reintento cuando la fila no existe', async () => {
    const { puerto } = crearPuerto([
      { estado: 200, cuerpo: [] },
      { estado: 200, cuerpo: [] },
    ]);

    const [resultado] = await puerto.enviar([cambio()]);

    expect(resultado).toEqual({
      estado: 'rechazado',
      id: ENTIDAD,
      motivo: 'ausente',
      reintentable: false,
    });
  });

  it('trata la clave duplicada como reenvío de una creación', async () => {
    const { puerto } = crearPuerto([
      { estado: 409, cuerpo: { code: '23505' } },
      { estado: 200, cuerpo: [filaRemota({ version: 1, sync_revision: 5 })] },
    ]);

    const [resultado] = await puerto.enviar([cambio({ operacion: 'create', versionBase: 0 })]);

    expect(resultado).toEqual({ estado: 'aceptado', id: ENTIDAD, revision: 5, version: 1 });
  });
});

describe('envío de varios cambios', () => {
  it('los aplica en serie y en el orden recibido', async () => {
    // El motor entrega eliminar, actualizar y crear en ese orden. En paralelo
    // podrían llegar al revés y resucitar algo que el usuario ya borró.
    const { puerto, peticiones } = crearPuerto([
      { estado: 200, cuerpo: [filaRemota({ deleted_at: '2026-08-02T10:00:00.000Z' })] },
      { estado: 200, cuerpo: [filaRemota({ id: 'segundo' })] },
      { estado: 201, cuerpo: [filaRemota({ id: 'tercero', version: 1 })] },
    ]);

    await puerto.enviar([
      cambio({ operacion: 'delete' }),
      cambio({ id: 'segundo', operacion: 'update' }),
      cambio({ id: 'tercero', operacion: 'create', versionBase: 0 }),
    ]);

    expect(peticiones.map((peticion) => peticion.metodo)).toEqual(['PATCH', 'PATCH', 'POST']);
    expect(peticiones[1]?.url).toContain('id=eq.segundo');
    expect(peticiones[2]?.url).toContain('journal_entries');
  });
});

describe('descarga', () => {
  it('pide solo lo posterior al cursor, ordenado y acotado', async () => {
    const { puerto, peticiones } = crearPuerto([
      {
        estado: 200,
        cuerpo: [filaRemota({ sync_revision: 11 }), filaRemota({ sync_revision: 12 })],
      },
    ]);

    const resultado = await puerto.descargar({ desdeRevision: 10, limite: 50 });

    expect(peticiones[0]?.url).toContain('sync_revision=gt.10');
    expect(peticiones[0]?.url).toContain('order=sync_revision.asc');
    expect(peticiones[0]?.url).toContain('limit=50');
    expect(resultado.revisionFinal).toBe(12);
    expect(resultado.cambios).toHaveLength(2);
  });

  it('una fila con deleted_at llega como borrado', async () => {
    const { puerto } = crearPuerto([
      {
        estado: 200,
        cuerpo: [filaRemota({ sync_revision: 30, deleted_at: '2026-08-02T09:00:00.000Z' })],
      },
    ]);

    const { cambios } = await puerto.descargar({ desdeRevision: 0, limite: 10 });

    expect(cambios[0]?.operacion).toBe('delete');
    expect(cambios[0]?.eliminadoEn).toBe('2026-08-02T09:00:00.000Z');
  });

  it('sin cambios, el cursor no retrocede', async () => {
    const { puerto } = crearPuerto([{ estado: 200, cuerpo: [] }]);

    const resultado = await puerto.descargar({ desdeRevision: 42, limite: 10 });

    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.revisionFinal).toBe(42);
  });

  it('devuelve los metadatos en claro y el sobre sin tocar', async () => {
    const { puerto } = crearPuerto([
      { estado: 200, cuerpo: [filaRemota({ sync_revision: 3, is_favorite: true })] },
    ]);

    const { cambios } = await puerto.descargar({ desdeRevision: 0, limite: 10 });

    expect(cambios[0]?.metadatos).toEqual({
      entry_type: 'gratitude',
      entry_date: '2026-08-02',
      is_favorite: true,
      is_ark_protected: false,
    });
    expect(cambios[0]?.sobre).toEqual(sobre);
  });
});

describe('errores', () => {
  it('sin sesión no se hace ninguna petición', async () => {
    const { puerto, peticiones } = crearPuerto([], null);

    await expect(puerto.descargar({ desdeRevision: 0, limite: 10 })).rejects.toMatchObject({
      codigo: 'SIN_SESION',
      categoria: 'autenticacion',
    });
    expect(peticiones).toHaveLength(0);
  });

  it('un corte de red es reintentable y no interrumpe al usuario', async () => {
    const transporte = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const puerto = crearPuertoRemotoSupabase({
      transporte,
      proveerToken: async () => 'token',
      url: 'https://proyecto.supabase.co',
      claveAnonima: 'clave',
      usuarioId: USUARIO,
    });

    await expect(puerto.descargar({ desdeRevision: 0, limite: 10 })).rejects.toMatchObject({
      categoria: 'conectividad',
      puedeReintentarse: true,
    });
  });

  it('un 401 se clasifica como autenticación y no se reintenta', async () => {
    const { puerto } = crearPuerto([{ estado: 401, cuerpo: { code: '42501' } }]);

    await expect(puerto.descargar({ desdeRevision: 0, limite: 10 })).rejects.toMatchObject({
      categoria: 'autenticacion',
      puedeReintentarse: false,
    });
  });

  it('un 503 sí se reintenta', async () => {
    const { puerto } = crearPuerto([{ estado: 503, cuerpo: {} }]);

    await expect(puerto.descargar({ desdeRevision: 0, limite: 10 })).rejects.toMatchObject({
      categoria: 'servidor',
      puedeReintentarse: true,
    });
  });

  it('el error no arrastra el cuerpo de la respuesta a los registros', async () => {
    const { puerto } = crearPuerto([
      { estado: 500, cuerpo: { code: 'XX000', message: 'criptograma-del-usuario' } },
    ]);

    await puerto.descargar({ desdeRevision: 0, limite: 10 }).catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      const registro = JSON.stringify(error.aRegistroSeguro());
      expect(registro).not.toContain('criptograma');
      expect(registro).toContain('XX000');
    });
    expect.hasAssertions();
  });
});
