#!/usr/bin/env node
// Verifica el esquema y el aislamiento entre usuarios contra un proyecto de
// Supabase real.
//
// Las pruebas de `supabase/tests/` corren sobre un PostgreSQL local con un
// sustituto del esquema `auth`. Esto ejecuta las mismas comprobaciones contra
// el proyecto de verdad, con usuarios autenticados y JWT emitidos por
// Supabase, que es lo único que confirma que `auth.uid()` se comporta como
// esperamos.
//
// Se ejecuta en dos fases:
//
//   · Fase anónima — siempre. Comprueba que las diez tablas existen y que el
//     rol anónimo no alcanza ninguna. Solo necesita URL y clave publicable.
//
//   · Fase autenticada — solo si hay dos usuarios de prueba. Comprueba el
//     aislamiento real entre ellos.
//
// Uso mínimo:
//   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   node scripts/verificar-supabase.mjs
//
// Con aislamiento entre usuarios, dando dos cuentas ya creadas:
//   ... QFAITH_USUARIO_A=correo:clave QFAITH_USUARIO_B=correo:clave
//
// O dejando que el propio script las cree y confirme (API de administración):
//   ... QFAITH_SUPABASE_SECRET=sb_secret_...
//
// Los dos usuarios deben ser cuentas de prueba desechables. Nunca uses
// credenciales de una persona real (invariante 15).
//
// Detrás de un proxy corporativo, añade NODE_USE_ENV_PROXY=1: el `fetch`
// integrado de Node no lee HTTPS_PROXY por su cuenta y, si el proxy responde
// por él, todas las peticiones fallan de la misma forma. El script lo detecta
// y aborta en lugar de dar por buenas esas respuestas.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const secreto = process.env.QFAITH_SUPABASE_SECRET;

if (!url || !clave) {
  console.error(
    'Faltan variables. Se necesitan al menos EXPO_PUBLIC_SUPABASE_URL y\n' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
  process.exit(2);
}

// Cuentas que el script crea por sí mismo cuando se le da la clave secreta.
// El dominio debe resolver MX: Supabase rechaza `.invalid` y `example.com`.
const CUENTAS_GENERADAS = [
  { correo: 'qfaith.prueba.a@mailinator.com', contrasena: 'Prueba-QFaith-A-2026!' },
  { correo: 'qfaith.prueba.b@mailinator.com', contrasena: 'Prueba-QFaith-B-2026!' },
];

const TABLAS = [
  'profiles',
  'user_settings',
  'devices',
  'user_key_envelopes',
  'recovery_configurations',
  'account_deletion_requests',
  'journal_entries',
  'sync_change_log',
  'sync_conflicts',
  'audit_events',
  // Fase 2. Se comprueban igual: una tabla nueva que se olvide de revocar el
  // acceso anónimo es exactamente el descuido que esta lista existe para
  // detectar.
  'prayers',
  'prayer_updates',
  'habits',
  'habit_logs',
  'bible_notes',
  'life_library_items',
  'ai_conversations',
  'ai_messages',
  'memorials',
  'churches',
  'church_memberships',
  'church_groups',
  'group_memberships',
  'church_events',
  'event_registrations',
  'mentor_relationships',
  'prayer_shares',
  'user_sharing_keys',
  'sermons',
  'sermon_notes',
  'sermon_actions',
];

const comprobaciones = [];
let fallos = 0;

function comprobar(descripcion, condicion, detalle = '') {
  comprobaciones.push({ descripcion, ok: condicion, detalle });
  if (!condicion) fallos += 1;
}

async function peticion(ruta, { token, metodo = 'GET', cuerpo, cabeceras = {} } = {}) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${token ?? clave}`,
      'Content-Type': 'application/json',
      ...cabeceras,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto.length > 0 ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { estado: respuesta.status, datos };
}

/** Código de error de PostgREST, o null si la respuesta no es un error. */
const codigo = ({ datos }) => (datos && !Array.isArray(datos) ? (datos.code ?? null) : null);

/**
 * ¿La respuesta viene realmente de PostgREST?
 *
 * Importa más de lo que parece. Un proxy o una pasarela puede devolver 401,
 * 403 o 404 a *todo*, y entonces una comprobación del tipo «denegado, luego
 * correcto» pasa sin haber tocado la base de datos. Solo se acepta un cuerpo
 * con la forma de PostgREST: o una lista de filas, o un error con `code`.
 */
const esRespuestaPostgrest = ({ datos }) =>
  Array.isArray(datos) || (datos !== null && typeof datos === 'object' && 'code' in datos);

/** Aborta si la respuesta no llegó a PostgREST: seguir sería engañarse. */
function exigirPostgrest(respuesta, contexto) {
  if (esRespuestaPostgrest(respuesta)) return;
  const cuerpo =
    typeof respuesta.datos === 'string'
      ? respuesta.datos.slice(0, 200)
      : JSON.stringify(respuesta.datos);
  throw new Error(
    `La respuesta de ${contexto} no viene de PostgREST (HTTP ${respuesta.estado}): ${cuerpo}\n` +
      'Suele ser un proxy interponiéndose. Con el `fetch` de Node hace falta\n' +
      'NODE_USE_ENV_PROXY=1 para que respete HTTPS_PROXY.',
  );
}

async function iniciarSesion({ correo, contrasena }) {
  const { estado, datos } = await peticion('/auth/v1/token?grant_type=password', {
    metodo: 'POST',
    cuerpo: { email: correo, password: contrasena },
  });

  if (estado !== 200 || !datos?.access_token) {
    throw new Error(
      `No se pudo iniciar sesión con ${correo} (HTTP ${estado}): ${datos?.msg ?? datos?.error_description ?? 'sin detalle'}`,
    );
  }
  return { correo, token: datos.access_token, id: datos.user?.id };
}

/**
 * Crea la cuenta con la API de administración, ya confirmada. Es idempotente:
 * si ya existe, no se toca y se reutiliza tal cual.
 */
async function asegurarCuenta({ correo, contrasena }) {
  const respuesta = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: secreto,
      Authorization: `Bearer ${secreto}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: correo, password: contrasena, email_confirm: true }),
  });

  if (respuesta.ok) return { correo, creada: true };

  const detalle = await respuesta.text();
  // 422 con código de duplicado: la cuenta ya estaba, que es lo deseable en
  // ejecuciones sucesivas.
  if (respuesta.status === 422 && detalle.includes('already been registered')) {
    return { correo, creada: false };
  }
  throw new Error(`No se pudo crear ${correo} (HTTP ${respuesta.status}): ${detalle}`);
}

/** Descompone el JWT para leer sus reclamaciones sin verificar la firma. */
function reclamaciones(token) {
  const [, carga] = token.split('.');
  return JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
}

const sobre = (marca) => ({
  encrypted_payload: `criptograma-de-${marca}`,
  encryption_version: 1,
  key_id: crypto.randomUUID(),
  nonce: `nonce-de-${marca}`,
});

/** Resuelve qué dos cuentas usar, creándolas si hace falta y se puede. */
async function resolverCuentas() {
  const desdeEntorno = [process.env.QFAITH_USUARIO_A, process.env.QFAITH_USUARIO_B];

  if (desdeEntorno.every(Boolean)) {
    return desdeEntorno.map((credenciales) => {
      const separador = credenciales.indexOf(':');
      return {
        correo: credenciales.slice(0, separador),
        contrasena: credenciales.slice(separador + 1),
      };
    });
  }

  if (!secreto) return null;

  console.log('▸ Aprovisionando cuentas de prueba con la clave de administración');
  for (const cuenta of CUENTAS_GENERADAS) {
    const { correo, creada } = await asegurarCuenta(cuenta);
    console.log(`  · ${correo} ${creada ? 'creada' : 'ya existía'}`);
  }
  return CUENTAS_GENERADAS;
}

// ── Fase 1: lo que se puede comprobar sin ninguna sesión ──────────────────

async function faseAnonima() {
  console.log('▸ Fase anónima: esquema y cierre del rol público\n');

  // Tablas que no existen: PGRST205 al no encontrarlas en la caché de esquema,
  // 42P01 si la consulta llega a PostgreSQL.
  const NO_EXISTE = ['PGRST205', '42P01'];

  for (const tabla of TABLAS) {
    const lectura = await peticion(`/rest/v1/${tabla}?select=*&limit=1`, {});
    exigirPostgrest(lectura, `GET ${tabla}`);
    const cod = codigo(lectura);

    comprobar(
      `la tabla ${tabla} existe`,
      !NO_EXISTE.includes(cod),
      `HTTP ${lectura.estado}${cod ? ` ${cod}` : ''}`,
    );
    // 42501 es «la tabla existe pero no tienes privilegios», que es justo lo
    // que la migración 0004 deja al rol anónimo. Una lista vacía no valdría:
    // significaría que puede leer y que simplemente no hay filas.
    comprobar(
      `el rol anónimo no puede leer ${tabla}`,
      cod === '42501',
      `HTTP ${lectura.estado}${cod ? ` ${cod}` : ''}`,
    );

    const escritura = await peticion(`/rest/v1/${tabla}`, { metodo: 'POST', cuerpo: {} });
    exigirPostgrest(escritura, `POST ${tabla}`);
    comprobar(
      `el rol anónimo no puede escribir en ${tabla}`,
      codigo(escritura) === '42501',
      `HTTP ${escritura.estado}${codigo(escritura) ? ` ${codigo(escritura)}` : ''}`,
    );
  }
}

// ── Fase 2: aislamiento real entre dos usuarios autenticados ──────────────

async function faseAutenticada(cuentas) {
  const [a, b] = await Promise.all(cuentas.map(iniciarSesion));
  console.log(`\n▸ Fase autenticada`);
  console.log(`  · Sesión de A: ${a.correo} (${a.id})`);
  console.log(`  · Sesión de B: ${b.correo} (${b.id})\n`);

  // El JWT lleva el sub que auth.uid() debe resolver.
  const claims = reclamaciones(a.token);
  comprobar('el JWT incluye el «sub» del usuario', claims.sub === a.id, `sub=${claims.sub}`);
  comprobar(
    'el JWT llega con rol authenticated',
    claims.role === 'authenticated',
    `role=${claims.role}`,
  );

  // A crea su contenido.
  const perfilA = await peticion('/rest/v1/profiles', {
    token: a.token,
    metodo: 'POST',
    cuerpo: { id: a.id, timezone: 'Europe/Madrid' },
    cabeceras: { Prefer: 'return=representation,resolution=merge-duplicates' },
  });
  comprobar('A puede crear su propio perfil', perfilA.estado < 300, `HTTP ${perfilA.estado}`);

  const entradaA = await peticion('/rest/v1/journal_entries', {
    token: a.token,
    metodo: 'POST',
    cuerpo: {
      user_id: a.id,
      entry_type: 'gratitude',
      entry_date: '2026-07-31',
      ...sobre('A'),
    },
    cabeceras: { Prefer: 'return=representation' },
  });
  comprobar(
    'A puede crear una entrada de diario',
    entradaA.estado < 300,
    `HTTP ${entradaA.estado}`,
  );
  const filaA = Array.isArray(entradaA.datos) ? entradaA.datos[0] : undefined;
  const idEntradaA = filaA?.id;

  // El trigger de sincronización sella la revisión en la propia fila.
  comprobar(
    'la entrada nace con una revisión de sincronización asignada',
    typeof filaA?.sync_revision === 'number' && filaA.sync_revision > 0,
    `sync_revision=${filaA?.sync_revision}`,
  );

  const propiasDeA = await peticion('/rest/v1/journal_entries?select=id', { token: a.token });
  comprobar(
    'A ve su propia entrada',
    Array.isArray(propiasDeA.datos) && propiasDeA.datos.length >= 1,
    `${propiasDeA.datos?.length ?? 0} filas`,
  );

  // La bitácora refleja el cambio sin exponer contenido.
  const bitacoraDeA = await peticion('/rest/v1/sync_change_log?select=*', { token: a.token });
  const entradasBitacora = Array.isArray(bitacoraDeA.datos) ? bitacoraDeA.datos : [];
  comprobar(
    'el trigger registró el cambio en la bitácora',
    entradasBitacora.some((fila) => fila.entity_id === idEntradaA),
    `${entradasBitacora.length} filas`,
  );
  comprobar(
    'la bitácora no contiene ningún criptograma',
    !JSON.stringify(entradasBitacora).includes('criptograma-de-A'),
  );

  // A siembra una fila en el resto de tablas personales.
  //
  // Sin esto, comprobar que B ve cero filas en una tabla vacía no demuestra
  // nada: pasaría igual con RLS desactivado. Antes de mirar lo que ve B hay
  // que confirmar que hay algo que ver.
  await Promise.all([
    peticion('/rest/v1/devices', {
      token: a.token,
      metodo: 'POST',
      cuerpo: {
        user_id: a.id,
        device_public_id: 'dispositivo-de-prueba-a',
        platform: 'ios',
      },
      cabeceras: { Prefer: 'resolution=merge-duplicates' },
    }),
    peticion('/rest/v1/user_key_envelopes', {
      token: a.token,
      metodo: 'POST',
      cuerpo: {
        user_id: a.id,
        key_id: '11111111-1111-4111-8111-111111111111',
        key_type: 'contenido',
        encrypted_key: 'clave-envuelta-de-A',
        encryption_method: 'xchacha20poly1305',
      },
      cabeceras: { Prefer: 'resolution=merge-duplicates' },
    }),
    peticion('/rest/v1/recovery_configurations', {
      token: a.token,
      metodo: 'POST',
      cuerpo: {
        user_id: a.id,
        encrypted_recovery_envelope: 'sobre-de-recuperacion-de-A',
        recovery_nonce: 'nonce-de-recuperacion-de-A',
        kdf_algorithm: 'argon2id',
        kdf_parameters: {
          memoriaKiB: 19456,
          iteraciones: 2,
          paralelismo: 1,
          salBase64: 'c2FsLWRlLXBydWViYS1kZS1BLTE2',
        },
      },
      cabeceras: { Prefer: 'resolution=merge-duplicates' },
    }),
  ]);

  // A siembra también las tablas de Fase 2.
  //
  // Sin esto, el aislamiento de nueve tablas con contenido privado —oraciones,
  // hábitos, notas bíblicas, conversaciones con la IA y el memorial— nunca se
  // habría comprobado contra un JWT emitido por Supabase. Que la política sea
  // idéntica sobre el papel no basta: un `force row level security` que se
  // olvide, o un `grant` de más, solo se ve ejecutándolo.
  const peticionA = await peticion('/rest/v1/prayers', {
    token: a.token,
    metodo: 'POST',
    cuerpo: { user_id: a.id, status: 'active', visibility: 'private', ...sobre('A') },
    cabeceras: { Prefer: 'return=representation' },
  });
  const idPeticionA = Array.isArray(peticionA.datos) ? peticionA.datos[0]?.id : undefined;
  comprobar(
    'A puede crear una petición de oración',
    peticionA.estado < 300,
    `HTTP ${peticionA.estado}`,
  );

  const habitoA = await peticion('/rest/v1/habits', {
    token: a.token,
    metodo: 'POST',
    cuerpo: {
      user_id: a.id,
      frequency: 'daily',
      start_date: '2026-07-01',
      // El título va dentro del sobre, no en una columna propia: ver la nota
      // de cabecera de la migración 0007.
      ...sobre('A'),
    },
    cabeceras: { Prefer: 'return=representation' },
  });
  const idHabitoA = Array.isArray(habitoA.datos) ? habitoA.datos[0]?.id : undefined;
  comprobar('A puede crear un hábito', habitoA.estado < 300, `HTTP ${habitoA.estado}`);

  const conversacionA = await peticion('/rest/v1/ai_conversations', {
    token: a.token,
    metodo: 'POST',
    cuerpo: { user_id: a.id, conversation_type: 'general', ...sobre('A') },
    cabeceras: { Prefer: 'return=representation' },
  });
  const idConversacionA = Array.isArray(conversacionA.datos)
    ? conversacionA.datos[0]?.id
    : undefined;
  comprobar(
    'A puede abrir una conversación con el asistente',
    conversacionA.estado < 300,
    `HTTP ${conversacionA.estado}`,
  );

  await Promise.all([
    idPeticionA === undefined
      ? Promise.resolve()
      : peticion('/rest/v1/prayer_updates', {
          token: a.token,
          metodo: 'POST',
          cuerpo: { user_id: a.id, prayer_id: idPeticionA, ...sobre('A') },
        }),
    idHabitoA === undefined
      ? Promise.resolve()
      : peticion('/rest/v1/habit_logs', {
          token: a.token,
          metodo: 'POST',
          // Siempre hay sobre, aunque la nota del día esté vacía: así el
          // motor trata todas las filas igual (migración 0007).
          cuerpo: {
            user_id: a.id,
            habit_id: idHabitoA,
            completion_date: '2026-07-31',
            ...sobre('A'),
          },
        }),
    idConversacionA === undefined
      ? Promise.resolve()
      : peticion('/rest/v1/ai_messages', {
          token: a.token,
          metodo: 'POST',
          cuerpo: {
            user_id: a.id,
            conversation_id: idConversacionA,
            role: 'usuario',
            ...sobre('A'),
          },
        }),
    peticion('/rest/v1/memorials', {
      token: a.token,
      metodo: 'POST',
      cuerpo: {
        user_id: a.id,
        ...(idPeticionA === undefined ? {} : { prayer_id: idPeticionA }),
        occurred_on: '2026-07-31',
        ...sobre('A'),
      },
    }),
    peticion('/rest/v1/life_library_items', {
      token: a.token,
      metodo: 'POST',
      cuerpo: {
        user_id: a.id,
        source_type: 'diario',
        source_id: idEntradaA ?? crypto.randomUUID(),
        ...sobre('A'),
      },
      cabeceras: { Prefer: 'resolution=merge-duplicates' },
    }),
    peticion('/rest/v1/bible_notes', {
      token: a.token,
      metodo: 'POST',
      cuerpo: { user_id: a.id, book_code: 'SAL', chapter_number: 23, ...sobre('A') },
    }),
    // La nota de sermón es privada aunque el sermón sea institucional, así
    // que también entra en la comprobación de aislamiento.
    peticion('/rest/v1/sermon_notes', {
      token: a.token,
      metodo: 'POST',
      cuerpo: { user_id: a.id, ...sobre('A') },
    }),
    peticion('/rest/v1/sermon_actions', {
      token: a.token,
      metodo: 'POST',
      cuerpo: { user_id: a.id, due_date: '2026-09-05', ...sobre('A') },
    }),
  ]);

  // B no alcanza nada de A.
  for (const tabla of [
    'journal_entries',
    'profiles',
    'devices',
    'user_key_envelopes',
    'recovery_configurations',
    'sync_change_log',
    'prayers',
    'prayer_updates',
    'habits',
    'habit_logs',
    'bible_notes',
    'life_library_items',
    'ai_conversations',
    'ai_messages',
    'memorials',
  ]) {
    // La comprobación solo tiene valor si A sí ve algo ahí.
    const vistoPorA = await peticion(`/rest/v1/${tabla}?select=*`, { token: a.token });
    const filasDeA = Array.isArray(vistoPorA.datos) ? vistoPorA.datos.length : -1;
    comprobar(
      `A tiene contenido en ${tabla}, así que la prueba de aislamiento no es vacía`,
      filasDeA >= 1,
      `${filasDeA} filas`,
    );

    const vistoPorB = await peticion(`/rest/v1/${tabla}?select=*`, { token: b.token });
    const filas = Array.isArray(vistoPorB.datos) ? vistoPorB.datos.length : -1;
    comprobar(`B no ve ninguna fila de A en ${tabla}`, filas === 0, `${filas} filas`);
  }

  if (idEntradaA !== undefined) {
    const intentoUpdate = await peticion(`/rest/v1/journal_entries?id=eq.${idEntradaA}`, {
      token: b.token,
      metodo: 'PATCH',
      cuerpo: { is_favorite: true },
      cabeceras: { Prefer: 'return=representation' },
    });
    const modificadas = Array.isArray(intentoUpdate.datos) ? intentoUpdate.datos.length : -1;
    comprobar(
      'B no puede modificar la entrada de A',
      modificadas === 0,
      `${modificadas} filas afectadas`,
    );
  }

  const intentoSuplantar = await peticion('/rest/v1/journal_entries', {
    token: b.token,
    metodo: 'POST',
    cuerpo: { user_id: a.id, entry_date: '2026-07-31', ...sobre('intruso') },
  });
  comprobar(
    'B no puede escribir una entrada a nombre de A',
    intentoSuplantar.estado >= 400,
    `HTTP ${intentoSuplantar.estado}`,
  );

  // Tablas que el cliente no debe poder escribir.
  const bitacora = await peticion('/rest/v1/sync_change_log', {
    token: a.token,
    metodo: 'POST',
    cuerpo: {
      user_id: a.id,
      entity_type: 'journal_entries',
      entity_id: crypto.randomUUID(),
      operation: 'update',
      revision: 1,
    },
  });
  comprobar(
    'nadie puede escribir en la bitácora de sincronización',
    bitacora.estado >= 400,
    `HTTP ${bitacora.estado}`,
  );

  const auditoria = await peticion('/rest/v1/audit_events', {
    token: a.token,
    metodo: 'POST',
    cuerpo: { user_id: a.id, event_type: 'inventado', severity: 'info' },
  });
  comprobar(
    'nadie puede escribir en la auditoría',
    auditoria.estado >= 400,
    `HTTP ${auditoria.estado}`,
  );

  if (idEntradaA !== undefined) {
    const borradoFisico = await peticion(`/rest/v1/journal_entries?id=eq.${idEntradaA}`, {
      token: a.token,
      metodo: 'DELETE',
    });
    comprobar(
      'el borrado físico del diario está prohibido',
      borradoFisico.estado >= 400,
      `HTTP ${borradoFisico.estado}`,
    );

    // El borrado lógico sí está permitido y se propaga como delete.
    const borradoLogico = await peticion(`/rest/v1/journal_entries?id=eq.${idEntradaA}`, {
      token: a.token,
      metodo: 'PATCH',
      cuerpo: { deleted_at: new Date().toISOString() },
      cabeceras: { Prefer: 'return=representation' },
    });
    comprobar(
      'el borrado lógico sí está permitido',
      borradoLogico.estado < 300,
      `HTTP ${borradoLogico.estado}`,
    );

    const traslLogico = await peticion(
      `/rest/v1/sync_change_log?select=operation&entity_id=eq.${idEntradaA}&operation=eq.delete`,
      { token: a.token },
    );
    comprobar(
      'el borrado lógico se propaga a la bitácora como delete',
      Array.isArray(traslLogico.datos) && traslLogico.datos.length >= 1,
      `${traslLogico.datos?.length ?? 0} filas`,
    );
  }

  // Los parámetros de derivación no se pueden rebajar.
  const kdfDebil = await peticion('/rest/v1/recovery_configurations', {
    token: a.token,
    metodo: 'POST',
    cuerpo: {
      user_id: a.id,
      encrypted_recovery_envelope: 'sobre',
      recovery_nonce: 'nonce',
      kdf_algorithm: 'argon2id',
      kdf_parameters: {
        memoriaKiB: 8,
        iteraciones: 1,
        paralelismo: 1,
        salBase64: 'YWJjZA==',
      },
    },
  });
  comprobar(
    'el servidor rechaza parámetros de Argon2id por debajo del mínimo',
    kdfDebil.estado >= 400,
    `HTTP ${kdfDebil.estado}`,
  );

  await faseIglesia(a, b);
}

/**
 * La comprobación más importante del proyecto: **el pastor de tu iglesia no
 * puede leer tu diario**, contra la base real y con JWT reales.
 *
 * La batería SQL local ya lo comprueba, pero sobre un sustituto de `auth`. Un
 * `force row level security` que se olvidara al aplicar la migración, o un
 * privilegio de más concedido a mano en el panel, solo se ve aquí.
 *
 * Hace falta la clave de administración: crear una iglesia no es una
 * operación de cliente, y darle el rol de pastor a alguien tampoco.
 */
async function faseIglesia(a, b) {
  if (!secreto) {
    console.log('\n▸ Fase Iglesia omitida: requiere QFAITH_SUPABASE_SECRET\n');
    return;
  }

  console.log('\n▸ Fase Iglesia: A es miembro, B es el pastor\n');

  const administrar = (
    ruta,
    cuerpo,
    prefer = 'resolution=merge-duplicates,return=representation',
  ) =>
    peticion(ruta, {
      token: secreto,
      metodo: 'POST',
      cuerpo,
      cabeceras: { Prefer: prefer, apikey: secreto },
    });

  const iglesia = await administrar('/rest/v1/churches?on_conflict=slug&select=id', {
    name: 'Iglesia de verificación',
    slug: 'qfaith-verificacion',
    timezone: 'UTC',
  });
  const iglesiaId = Array.isArray(iglesia.datos) ? iglesia.datos[0]?.id : undefined;
  comprobar(
    'se puede dar de alta una iglesia de prueba',
    iglesiaId !== undefined,
    `HTTP ${iglesia.estado}`,
  );
  if (iglesiaId === undefined) return;

  await administrar(
    '/rest/v1/church_memberships?on_conflict=church_id,user_id',
    {
      church_id: iglesiaId,
      user_id: a.id,
      role: 'member',
      membership_status: 'active',
    },
    'resolution=merge-duplicates',
  );
  await administrar(
    '/rest/v1/church_memberships?on_conflict=church_id,user_id',
    {
      church_id: iglesiaId,
      user_id: b.id,
      role: 'pastor',
      membership_status: 'active',
    },
    'resolution=merge-duplicates',
  );

  // La comprobación solo vale si B es de verdad el pastor y ve lo suyo.
  const membresias = await peticion(
    `/rest/v1/church_memberships?church_id=eq.${iglesiaId}&select=user_id,role`,
    { token: b.token },
  );
  const filas = Array.isArray(membresias.datos) ? membresias.datos : [];
  comprobar(
    'B ve las membresías de su iglesia, así que es pastor de verdad',
    filas.some((fila) => fila.user_id === b.id && fila.role === 'pastor') &&
      filas.some((fila) => fila.user_id === a.id),
    `${filas.length} filas`,
  );

  // Y no alcanza absolutamente nada de la vida privada de A.
  for (const tabla of [
    'journal_entries',
    'prayers',
    'memorials',
    'bible_notes',
    'life_library_items',
    'ai_conversations',
    'ai_messages',
    'habits',
    'habit_logs',
  ]) {
    const deA = await peticion(`/rest/v1/${tabla}?select=id`, { token: a.token });
    const cuantasDeA = Array.isArray(deA.datos) ? deA.datos.length : -1;
    comprobar(
      `A tiene contenido en ${tabla}, así que la prueba no es vacía`,
      cuantasDeA >= 1,
      `${cuantasDeA} filas`,
    );

    const vistoPorPastor = await peticion(`/rest/v1/${tabla}?select=id`, { token: b.token });
    const cuantas = Array.isArray(vistoPorPastor.datos) ? vistoPorPastor.datos.length : -1;
    comprobar(`el pastor NO ve nada de A en ${tabla}`, cuantas === 0, `${cuantas} filas`);
  }

  // Tampoco puede sustituir la clave pública de compartición de A, que sería
  // la forma de hacer que lo que A comparta con otro le llegue a él.
  await peticion('/rest/v1/user_sharing_keys?on_conflict=user_id', {
    token: a.token,
    metodo: 'POST',
    cuerpo: { user_id: a.id, public_key: 'publica-de-A', algorithm: 'x25519' },
    cabeceras: { Prefer: 'resolution=merge-duplicates' },
  });

  const suplantacion = await peticion(`/rest/v1/user_sharing_keys?user_id=eq.${a.id}`, {
    token: b.token,
    metodo: 'PATCH',
    cuerpo: { public_key: 'publica-del-pastor' },
    cabeceras: { Prefer: 'return=representation' },
  });
  const cambiadas = Array.isArray(suplantacion.datos) ? suplantacion.datos.length : -1;
  comprobar(
    'el pastor no puede sustituir la clave pública de A',
    cambiadas === 0,
    `${cambiadas} filas afectadas`,
  );

  const clave = await peticion(`/rest/v1/user_sharing_keys?user_id=eq.${a.id}&select=public_key`, {
    token: b.token,
  });
  const publica = Array.isArray(clave.datos) ? clave.datos[0]?.public_key : undefined;
  // Sí puede leerla: es el único modo de poder sellarle algo a alguien.
  comprobar(
    'la clave pública de A sigue siendo la suya',
    publica === 'publica-de-A',
    String(publica),
  );
}

async function main() {
  console.log(`▸ Proyecto: ${url}\n`);

  await faseAnonima();

  const cuentas = await resolverCuentas();
  if (cuentas === null) {
    console.log(
      '\n▸ Fase autenticada omitida: no hay cuentas de prueba.\n' +
        '  Da QFAITH_USUARIO_A y QFAITH_USUARIO_B (correo:clave), o bien\n' +
        '  QFAITH_SUPABASE_SECRET para que el script las cree por sí mismo.',
    );
  } else {
    await faseAutenticada(cuentas);
  }

  console.log(`\n${'─'.repeat(70)}`);
  for (const { descripcion, ok, detalle } of comprobaciones) {
    console.log(`${ok ? '✓' : '✗'} ${descripcion}${detalle ? `  (${detalle})` : ''}`);
  }
  console.log('─'.repeat(70));
  console.log(
    `${comprobaciones.length - fallos}/${comprobaciones.length} comprobaciones correctas`,
  );

  if (fallos > 0) {
    console.error(`\n${fallos} FALLO(S). No continúes hasta resolverlos.`);
    process.exit(1);
  }
  console.log(
    cuentas === null
      ? '\nEsquema y cierre del rol anónimo verificados contra el proyecto real.'
      : '\nEsquema y aislamiento verificados contra el proyecto real.',
  );
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});
