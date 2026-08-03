// Forma exacta de las peticiones de perfil, ajustes y dispositivos.
//
// Es lo que las pruebas contra el proyecto real no pueden ver. Dos ejemplos
// de por qué importa: un `PATCH` de revocación sin el filtro `user_id`
// dependería solo de RLS para no tocar filas ajenas, y un `DELETE` en lugar
// del `PATCH` dejaría al dispositivo revocado indistinguible de uno nuevo.
import { crearClienteRest } from '../rest';
import { crearRepositorioPerfil } from '../repositorioPerfil';

const USUARIO = '11111111-1111-4111-8111-111111111111';

interface PeticionRegistrada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

function montar(respuestas: { estado: number; cuerpo: unknown }[]) {
  const peticiones: PeticionRegistrada[] = [];

  const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
    peticiones.push({
      url: String(url),
      metodo: init?.method ?? 'GET',
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const siguiente = respuestas.shift() ?? { estado: 200, cuerpo: [] };
    return {
      status: siguiente.estado,
      text: async () => JSON.stringify(siguiente.cuerpo),
    } as Response;
  }) as typeof fetch;

  const rest = crearClienteRest({
    transporte,
    proveerToken: async () => 'token-de-prueba',
    url: 'https://ejemplo.supabase.co',
    claveAnonima: 'anonima',
  });

  return { repositorio: crearRepositorioPerfil(rest), peticiones };
}

describe('perfil', () => {
  it('se lee filtrando por el propio identificador', async () => {
    const { repositorio, peticiones } = montar([{ estado: 200, cuerpo: [] }]);

    expect(await repositorio.leerPerfil(USUARIO)).toBeNull();
    expect(peticiones[0]?.url).toContain(`/profiles?id=eq.${USUARIO}`);
    expect(peticiones[0]?.metodo).toBe('GET');
  });

  it('se guarda como upsert: crear y editar son la misma operación', async () => {
    // Sin `on_conflict`, el primer guardado de alguien que ya tiene fila daría
    // un 409 por clave duplicada.
    const { repositorio, peticiones } = montar([
      { estado: 200, cuerpo: [{ id: USUARIO, display_name: 'Ana', language_code: 'es' }] },
    ]);

    await repositorio.guardarPerfil({
      usuarioId: USUARIO,
      nombre: 'Ana',
      idioma: 'es',
      zonaHoraria: 'Europe/Madrid',
      pais: 'ES',
      anoNacimiento: 1990,
    });

    expect(peticiones[0]?.url).toContain('on_conflict=id');
    expect(peticiones[0]?.cuerpo).toMatchObject({ id: USUARIO, display_name: 'Ana' });
  });

  it('un error del servidor se convierte en ErrorApp, no en una fila vacía', async () => {
    const { repositorio } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(repositorio.leerPerfil(USUARIO)).rejects.toMatchObject({ name: 'ErrorApp' });
  });
});

describe('ajustes', () => {
  it('solo viajan los campos que cambian', async () => {
    const { repositorio, peticiones } = montar([
      { estado: 200, cuerpo: [{ user_id: USUARIO, theme: 'dark' }] },
    ]);

    await repositorio.guardarAjustes(USUARIO, { theme: 'dark' });

    // Enviar el objeto entero pisaría cambios hechos desde otro dispositivo.
    expect(peticiones[0]?.cuerpo).toEqual({ user_id: USUARIO, theme: 'dark' });
  });

  it('nunca se envía nada parecido a una clave o un PIN', async () => {
    const { repositorio, peticiones } = montar([
      { estado: 200, cuerpo: [{ user_id: USUARIO, biometric_lock_enabled: true }] },
    ]);

    await repositorio.guardarAjustes(USUARIO, {
      biometric_lock_enabled: true,
      auto_lock_seconds: 60,
    });

    const enviado = JSON.stringify(peticiones[0]?.cuerpo);
    expect(enviado).not.toMatch(/pin|clave|key|token|secret/i);
  });
});

describe('dispositivos', () => {
  it('revocar marca la fila y filtra también por usuario', async () => {
    const { repositorio, peticiones } = montar([
      { estado: 200, cuerpo: [{ id: 'dispositivo-2', status: 'revoked' }] },
    ]);

    await repositorio.revocarDispositivo({ usuarioId: USUARIO, dispositivoId: 'dispositivo-2' });

    const peticion = peticiones[0];
    // PATCH, no DELETE: el servidor tiene que seguir sabiendo que ese
    // dispositivo existe y que está revocado.
    expect(peticion?.metodo).toBe('PATCH');
    expect(peticion?.url).toContain('id=eq.dispositivo-2');
    // RLS ya lo impediría, pero el filtro no sobra: es la segunda defensa.
    expect(peticion?.url).toContain(`user_id=eq.${USUARIO}`);
    expect(peticion?.cuerpo).toMatchObject({ status: 'revoked' });
    expect(peticion?.cuerpo?.revoked_at).toEqual(expect.any(String));
  });

  it('se listan los más recientes primero, sin dejar fuera los que nunca sincronizaron', async () => {
    const { repositorio, peticiones } = montar([{ estado: 200, cuerpo: [] }]);

    await repositorio.listarDispositivos(USUARIO);

    expect(peticiones[0]?.url).toContain('order=last_seen_at.desc.nullslast');
  });
});

describe('eliminación de cuenta', () => {
  it('la fecha programada respeta el periodo de gracia', async () => {
    const { repositorio, peticiones } = montar([
      { estado: 201, cuerpo: [{ id: 's1', status: 'pendiente' }] },
    ]);

    await repositorio.solicitarEliminacion({
      usuarioId: USUARIO,
      diasDeGracia: 30,
      ahora: () => new Date('2026-08-03T00:00:00.000Z'),
    });

    // El esquema exige `scheduled_for > requested_at`; que además sean 30 días
    // es la decisión de producto, y aquí queda fijada.
    expect(peticiones[0]?.cuerpo).toMatchObject({
      requested_at: '2026-08-03T00:00:00.000Z',
      scheduled_for: '2026-09-02T00:00:00.000Z',
    });
  });

  it('solo se consulta la solicitud pendiente, no el historial', async () => {
    const { repositorio, peticiones } = montar([{ estado: 200, cuerpo: [] }]);

    expect(await repositorio.eliminacionPendiente(USUARIO)).toBeNull();
    expect(peticiones[0]?.url).toContain('status=eq.pendiente');
  });

  it('cancelar marca la solicitud, no la borra', async () => {
    const { repositorio, peticiones } = montar([
      { estado: 200, cuerpo: [{ id: 's1', status: 'cancelada' }] },
    ]);

    await repositorio.cancelarEliminacion({ usuarioId: USUARIO, solicitudId: 's1' });

    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.cuerpo).toMatchObject({ status: 'cancelada' });
  });
});
