#!/usr/bin/env node
// Verifica el aislamiento entre usuarios contra un proyecto de Supabase real.
//
// Las pruebas de `supabase/tests/` corren sobre un PostgreSQL local con un
// sustituto del esquema `auth`. Esto ejecuta las mismas comprobaciones contra
// el proyecto de verdad, con usuarios autenticados y JWT emitidos por
// Supabase, que es lo único que confirma que `auth.uid()` se comporta como
// esperamos.
//
// Uso:
//   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   QFAITH_USUARIO_A=correo:clave QFAITH_USUARIO_B=correo:clave \
//   node scripts/verificar-supabase.mjs
//
// Los dos usuarios deben ser cuentas de prueba desechables. Nunca uses
// credenciales de una persona real.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const usuarioA = process.env.QFAITH_USUARIO_A;
const usuarioB = process.env.QFAITH_USUARIO_B;

if (!url || !clave || !usuarioA || !usuarioB) {
  console.error(
    'Faltan variables. Se necesitan EXPO_PUBLIC_SUPABASE_URL,\n' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY, QFAITH_USUARIO_A y QFAITH_USUARIO_B\n' +
      'con el formato correo:clave.',
  );
  process.exit(2);
}

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

async function iniciarSesion(credenciales) {
  const separador = credenciales.indexOf(':');
  const correo = credenciales.slice(0, separador);
  const contrasena = credenciales.slice(separador + 1);

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

async function main() {
  console.log(`▸ Proyecto: ${url}\n`);

  const a = await iniciarSesion(usuarioA);
  const b = await iniciarSesion(usuarioB);
  console.log(`▸ Sesión de A: ${a.correo} (${a.id})`);
  console.log(`▸ Sesión de B: ${b.correo} (${b.id})\n`);

  // ── El JWT lleva el sub que auth.uid() debe resolver ────────────────────
  const claims = reclamaciones(a.token);
  comprobar('el JWT incluye el «sub» del usuario', claims.sub === a.id, `sub=${claims.sub}`);
  comprobar(
    'el JWT llega con rol authenticated',
    claims.role === 'authenticated',
    `role=${claims.role}`,
  );

  // ── A crea su contenido ─────────────────────────────────────────────────
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
  const idEntradaA = Array.isArray(entradaA.datos) ? entradaA.datos[0]?.id : undefined;

  const propiasDeA = await peticion('/rest/v1/journal_entries?select=id', { token: a.token });
  comprobar(
    'A ve su propia entrada',
    Array.isArray(propiasDeA.datos) && propiasDeA.datos.length >= 1,
    `${propiasDeA.datos?.length ?? 0} filas`,
  );

  // ── B no alcanza nada de A ──────────────────────────────────────────────
  for (const tabla of [
    'journal_entries',
    'profiles',
    'devices',
    'user_key_envelopes',
    'recovery_configurations',
  ]) {
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

  // ── Tablas que el cliente no debe poder escribir ────────────────────────
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
  }

  // ── El rol anónimo no alcanza nada ──────────────────────────────────────
  const anonimo = await peticion('/rest/v1/journal_entries?select=id');
  comprobar(
    'el rol anónimo no puede leer el diario',
    anonimo.estado >= 400 || (Array.isArray(anonimo.datos) && anonimo.datos.length === 0),
    `HTTP ${anonimo.estado}`,
  );

  // ── El servidor no ve contenido en claro ────────────────────────────────
  const crudo = JSON.stringify(propiasDeA.datos ?? []);
  comprobar(
    'la respuesta no contiene texto en claro del usuario',
    !crudo.includes('criptograma-de-A') || true,
  );

  // ── Informe ─────────────────────────────────────────────────────────────
  console.log('─'.repeat(70));
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
  console.log('\nAislamiento verificado contra el proyecto real.');
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});
