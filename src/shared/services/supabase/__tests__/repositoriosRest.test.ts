// Forma exacta de las peticiones de Iglesia, claves de compartición y
// notificaciones.
//
// Es lo que ni las pruebas de módulo ni las que corren contra el proyecto
// real pueden ver: los módulos usan dobles y el proyecto real solo enseña el
// resultado. Aquí se mira la petición que sale.
//
// La misma clase de prueba ya destapó dos fallos en `repositorioPerfil` —un
// `PATCH` sin filtro de usuario y un periodo de gracia ignorado—, así que
// vale la pena repetirla en los tres repositorios que estaban sin cubrir.
import { crearRepositorioClavesComparticion } from '../repositorioClavesComparticion';
import { crearRepositorioIglesia } from '../repositorioIglesia';
import { crearRepositorioNotificaciones } from '../repositorioNotificaciones';
import { crearClienteRest } from '../rest';

const USUARIO = '11111111-1111-4111-8111-111111111111';

interface PeticionRegistrada {
  /** Tal cual sale, con el escapado puesto. */
  readonly url: string;
  /**
   * Legible, para que las aserciones de filtros no tengan que escribirse
   * escapadas. No sirve para comprobar el escapado: lo deshace.
   */
  readonly urlLegible: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

function montar(respuestas: { estado: number; cuerpo: unknown }[] = []) {
  const peticiones: PeticionRegistrada[] = [];

  const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
    peticiones.push({
      url: String(url),
      urlLegible: decodeURIComponent(String(url)),
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

  return {
    peticiones,
    iglesia: crearRepositorioIglesia(rest),
    claves: crearRepositorioClavesComparticion(rest),
    notificaciones: crearRepositorioNotificaciones(rest),
  };
}

describe('iglesia', () => {
  it('el código se escapa antes de meterlo en la ruta', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.buscarPorCodigo('mi-iglesia&select=*');

    // Sin escapar, un código con `&` inyectaría parámetros en la consulta.
    expect(peticiones[0]?.url).not.toContain('mi-iglesia&select=*');
    expect(peticiones[0]?.url).toContain('mi-iglesia%26select');
  });

  it('unirse entra como pendiente y visitante, nunca como miembro activo', async () => {
    const { iglesia, peticiones } = montar([
      { estado: 201, cuerpo: [{ id: 'm1', membership_status: 'pending' }] },
    ]);

    await iglesia.solicitarIngreso({ iglesiaId: 'iglesia-1', usuarioId: USUARIO });

    // Si el cliente pudiera ponerse `active`, cualquiera se declararía miembro
    // de cualquier iglesia.
    expect(peticiones[0]?.cuerpo).toMatchObject({
      membership_status: 'pending',
      role: 'visitor',
    });
  });

  it('abandonar filtra también por usuario y marca, no borra', async () => {
    const { iglesia, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'm1' }] }]);

    await iglesia.abandonar({ membresiaId: 'm1', usuarioId: USUARIO });

    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.cuerpo).toEqual({ membership_status: 'left' });
  });

  it('sin identificadores no consulta iglesias en vez de pedirlas todas', async () => {
    const { iglesia, peticiones } = montar();

    expect(await iglesia.iglesiasPorId([])).toEqual([]);
    // Una lista vacía en `in.()` traería el catálogo entero.
    expect(peticiones).toHaveLength(0);
  });

  it('compartir manda un único destino, según el tipo', async () => {
    const { iglesia, peticiones } = montar([
      { estado: 201, cuerpo: [{ id: 's1', prayer_id: 'p1' }] },
      { estado: 201, cuerpo: [{ id: 's2', prayer_id: 'p1' }] },
    ]);

    const comun = {
      peticionId: 'p1',
      usuarioId: USUARIO,
      cargaCifrada: 'cifrado',
      claveEnvuelta: 'efimera',
      nonce: 'nonce',
    };

    await iglesia.compartir({ ...comun, destino: { tipo: 'persona', id: 'elisa' } });
    await iglesia.compartir({ ...comun, destino: { tipo: 'iglesia', id: 'iglesia-1' } });

    // Dos destinos a la vez serían un permiso ambiguo; el esquema lo prohíbe y
    // el cliente no lo intenta siquiera.
    expect(peticiones[0]?.cuerpo).toMatchObject({ recipient_user_id: 'elisa' });
    expect(peticiones[0]?.cuerpo?.church_id).toBeUndefined();
    expect(peticiones[1]?.cuerpo).toMatchObject({ church_id: 'iglesia-1' });
    expect(peticiones[1]?.cuerpo?.recipient_user_id).toBeUndefined();
  });

  it('compartir sin caducidad no manda el campo en vez de mandar null', async () => {
    const { iglesia, peticiones } = montar([{ estado: 201, cuerpo: [{ id: 's1' }] }]);

    await iglesia.compartir({
      peticionId: 'p1',
      usuarioId: USUARIO,
      destino: { tipo: 'persona', id: 'elisa' },
      cargaCifrada: 'cifrado',
      claveEnvuelta: 'efimera',
      nonce: 'nonce',
      caducaEn: null,
    });

    expect(peticiones[0]?.cuerpo).not.toHaveProperty('expires_at');
  });

  it('revocar solo alcanza lo propio', async () => {
    const { iglesia, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 's1' }] }]);

    await iglesia.revocar({ comparticionId: 's1', usuarioId: USUARIO });

    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.urlLegible).toContain(`owner_user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.cuerpo?.revoked_at).toEqual(expect.any(String));
  });

  it('las comparticiones recibidas las filtra la política, no el cliente', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.recibidas();

    // El cliente no puede saber a qué grupos pertenece sin preguntar; pedir
    // solo las no revocadas y dejar el resto a RLS es lo correcto.
    expect(peticiones[0]?.urlLegible).toContain('revoked_at=is.null');
    expect(peticiones[0]?.urlLegible).not.toContain('recipient_user_id=eq.');
  });

  it('un error del servidor se convierte en ErrorApp, no en lista vacía', async () => {
    const { iglesia } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(iglesia.grupos('iglesia-1')).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('una respuesta vacía al solicitar ingreso falla en vez de inventar la membresía', async () => {
    // 200 con cero filas es lo que devuelve PostgREST cuando la política
    // rechaza la escritura sin dar error. Devolver `null` haría que la
    // pantalla dijera «solicitud enviada» sin que exista.
    const { iglesia } = montar([{ estado: 200, cuerpo: [] }]);

    await expect(
      iglesia.solicitarIngreso({ iglesiaId: 'iglesia-1', usuarioId: USUARIO }),
    ).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('una respuesta vacía al compartir falla: decir «compartido» sin estarlo es peor', async () => {
    const { iglesia } = montar([{ estado: 200, cuerpo: [] }]);

    await expect(
      iglesia.compartir({
        peticionId: 'p1',
        usuarioId: USUARIO,
        destino: { tipo: 'persona', id: 'elisa' },
        cargaCifrada: 'cifrado',
        claveEnvuelta: 'efimera',
        nonce: 'nonce',
      }),
    ).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('las comparticiones de una petición son solo las propias', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.comparticionesDe({ peticionId: 'p1', usuarioId: USUARIO });

    // Sin el filtro de propietario, la política dejaría ver también las
    // recibidas de esa misma petición: otra lista, otra pantalla.
    expect(peticiones[0]?.urlLegible).toContain(`owner_user_id=eq.${USUARIO}`);
  });

  it('los eventos son los programados y en orden de calendario', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.eventos('iglesia-1');

    expect(peticiones[0]?.urlLegible).toContain('status=eq.scheduled');
    expect(peticiones[0]?.urlLegible).toContain('order=starts_at.asc');
  });

  it('los sermones no se filtran por publicado: el liderazgo ve los suyos', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.sermones('iglesia-1');

    // Filtrar aquí escondería al pastor sus propios borradores, que la
    // política sí le deja ver.
    expect(peticiones[0]?.urlLegible).not.toContain('status=eq.published');
    expect(peticiones[0]?.urlLegible).toContain('order=sermon_date.desc.nullslast');
  });

  it('inscribirse es idempotente: pulsar dos veces no crea dos plazas', async () => {
    const { iglesia, peticiones } = montar([{ estado: 201, cuerpo: [{ id: 'i1' }] }]);

    await iglesia.inscribirse({ eventoId: 'e1', usuarioId: USUARIO });

    expect(peticiones[0]?.urlLegible).toContain('on_conflict=event_id,user_id');
    expect(peticiones[0]?.cuerpo).toMatchObject({ status: 'registered' });
  });

  it('anular la inscripción la marca, no la borra, y solo la propia', async () => {
    const { iglesia, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'i1' }] }]);

    await iglesia.anularInscripcion({ eventoId: 'e1', usuarioId: USUARIO });

    // Invariante 6: nada se borra de verdad.
    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.cuerpo).toEqual({ status: 'cancelled' });
  });

  it('solo las inscripciones vigentes cuentan como «voy»', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.misInscripciones(USUARIO);

    expect(peticiones[0]?.urlLegible).toContain('status=eq.registered');
  });

  it('las mentorías se ven desde los dos lados de la relación', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.mentorias(USUARIO);

    expect(peticiones[0]?.urlLegible).toContain(
      `or=(mentor_user_id.eq.${USUARIO},mentee_user_id.eq.${USUARIO})`,
    );
  });

  it('cualquiera de los dos puede terminar la mentoría, y queda fecha', async () => {
    const { iglesia, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'r1' }] }]);

    await iglesia.terminarMentoria({ mentoriaId: 'r1', usuarioId: USUARIO });

    // Si el filtro fuera solo `mentee_user_id`, el mentor quedaría atrapado en
    // una relación que ya no quiere; si fuera solo `mentor_user_id`, el
    // acompañado no podría salirse.
    expect(peticiones[0]?.urlLegible).toContain(
      `or=(mentor_user_id.eq.${USUARIO},mentee_user_id.eq.${USUARIO})`,
    );
    expect(peticiones[0]?.cuerpo).toMatchObject({ status: 'ended' });
    expect(peticiones[0]?.cuerpo?.ended_at).toEqual(expect.any(String));
  });

  it('varias iglesias se piden de una vez, no una por una', async () => {
    const { iglesia, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'a' }, { id: 'b' }] }]);

    expect(await iglesia.iglesiasPorId(['a', 'b'])).toHaveLength(2);
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.urlLegible).toContain('id=in.(a,b)');
  });

  it('revocar algo que no es tuyo devuelve null, no un falso éxito', async () => {
    // La política deja pasar el PATCH y no cambia nada: cero filas. Si eso se
    // leyera como correcto, la pantalla diría «revocado» y la otra persona
    // seguiría viendo la petición.
    const { iglesia } = montar([{ estado: 200, cuerpo: [] }]);

    expect(await iglesia.revocar({ comparticionId: 'de-otro', usuarioId: USUARIO })).toBeNull();
  });

  it('mis membresías se piden por usuario, no todas las de la iglesia', async () => {
    const { iglesia, peticiones } = montar();

    await iglesia.misMembresias(USUARIO);

    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
  });
});

describe('claves de compartición', () => {
  it('publicar es un upsert: la clave es siempre la misma', async () => {
    const { claves, peticiones } = montar([{ estado: 201, cuerpo: [] }]);

    await claves.publicar({ usuarioId: USUARIO, publicaBase64: 'publica' });

    expect(peticiones[0]?.urlLegible).toContain('on_conflict=user_id');
    expect(peticiones[0]?.cuerpo).toMatchObject({ algorithm: 'x25519' });
  });

  it('sin identificadores no consulta nada', async () => {
    const { claves, peticiones } = montar();

    expect(await claves.publicasDe([])).toEqual(new Map());
    expect(peticiones).toHaveLength(0);
  });

  it('un error al publicar la clave se propaga: compartir sin clave no funcionaría', async () => {
    const { claves } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(
      claves.publicar({ usuarioId: USUARIO, publicaBase64: 'publica' }),
    ).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('un error al leer las claves no devuelve un mapa vacío', async () => {
    // Un mapa vacío se leería como «nadie tiene clave publicada» y la pantalla
    // diría que no se puede compartir con nadie, que es falso.
    const { claves } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(claves.publicasDe(['elisa'])).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('devuelve un mapa para poder distinguir a quién le falta', async () => {
    // Sin clave publicada no se comparte con esa persona, y eso hay que
    // decirlo: una lista no permitiría saber cuál falta.
    const { claves } = montar([{ estado: 200, cuerpo: [{ user_id: 'elisa', public_key: 'k1' }] }]);

    const mapa = await claves.publicasDe(['elisa', 'sin-clave']);
    expect(mapa.get('elisa')).toBe('k1');
    expect(mapa.get('sin-clave')).toBeUndefined();
  });
});

describe('notificaciones', () => {
  it('se leen las propias, de la más reciente a la más antigua', async () => {
    const { notificaciones, peticiones } = montar();

    await notificaciones.listar(USUARIO);

    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.urlLegible).toContain('order=created_at.desc');
  });

  it('un error al listar se propaga en vez de aparentar bandeja vacía', async () => {
    const { notificaciones } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(notificaciones.listar(USUARIO)).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('un error al marcar como leída se propaga: si no, volvería a aparecer', async () => {
    const { notificaciones } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(
      notificaciones.marcarLeida({ usuarioId: USUARIO, notificacionId: 'n1' }),
    ).rejects.toMatchObject({ name: 'ErrorApp' });
  });

  it('marcar como leída filtra también por usuario', async () => {
    const { notificaciones, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'n1' }] }]);

    await notificaciones.marcarLeida({ usuarioId: USUARIO, notificacionId: 'n1' });

    expect(peticiones[0]?.metodo).toBe('PATCH');
    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.cuerpo?.read_at).toEqual(expect.any(String));
  });

  it('el token push se guarda en el dispositivo, no en el perfil', async () => {
    // Es del dispositivo: se revoca con él y se borra al cerrar sesión.
    const { notificaciones, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'd1' }] }]);

    await notificaciones.guardarTokenPush({
      usuarioId: USUARIO,
      dispositivoId: 'd1',
      token: 'token-de-push',
    });

    expect(peticiones[0]?.urlLegible).toContain('/devices?id=eq.d1');
    expect(peticiones[0]?.urlLegible).toContain(`user_id=eq.${USUARIO}`);
    expect(peticiones[0]?.cuerpo).toMatchObject({ push_token: 'token-de-push' });
  });

  it('cerrar sesión borra el token mandando null', async () => {
    const { notificaciones, peticiones } = montar([{ estado: 200, cuerpo: [{ id: 'd1' }] }]);

    await notificaciones.guardarTokenPush({
      usuarioId: USUARIO,
      dispositivoId: 'd1',
      token: null,
    });

    expect(peticiones[0]?.cuerpo?.push_token).toBeNull();
  });

  it('un error al guardar el token no lo repite en el mensaje', async () => {
    // El contexto de un ErrorApp acaba en telemetría; un token ahí sería
    // justo lo que el invariante 2 prohíbe.
    const { notificaciones } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    try {
      await notificaciones.guardarTokenPush({
        usuarioId: USUARIO,
        dispositivoId: 'd1',
        token: 'token-secretisimo',
      });
      throw new Error('debería haber fallado');
    } catch (causa) {
      expect(JSON.stringify(causa)).not.toContain('token-secretisimo');
      expect((causa as { contexto: unknown }).contexto).toMatchObject({
        operacion: 'guardar:push_token',
      });
    }
  });
});
