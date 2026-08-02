// Criterio de salida de la Fase 1, contra el proyecto de Supabase real:
// «crear, cifrar, sincronizar y restaurar un registro privado entre dos
// dispositivos».
//
// Las demás pruebas usan dobles. Esta no: usa el motor de sincronización de
// verdad, el núcleo criptográfico de verdad y el servidor de verdad, con sus
// triggers, sus políticas y su control de versión. Es la única que puede
// desmentir una suposición equivocada sobre cómo se comporta el esquema.
//
// Se omite salvo que se le den credenciales, porque necesita red y una cuenta
// de prueba desechable:
//
//   QFAITH_INTEGRACION=1 \
//   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   QFAITH_USUARIO_A=correo:clave \
//   npx jest integracionSupabase
//
// Nunca con datos ni credenciales de una persona real (invariante 15).
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { VinculoRegistro } from '@shared/services/crypto/tipos';
import {
  bloquear,
  claveDeDominio,
  clavesDerivadas,
  inicializarCuenta,
  olvidarDispositivo,
  restaurarConFrase,
} from '@shared/services/keys/servicioClaves';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import { crearPuertoRemotoSupabase } from '../puertoRemotoSupabase';
import { descargarMaterialCuenta, subirMaterialCuenta } from '../repositorioClaves';
import { asegurarDispositivo } from '../repositorioDispositivos';
import { crearClienteRest } from '../rest';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const claveAnonima = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const credenciales = process.env.QFAITH_USUARIO_A;
const activada =
  process.env.QFAITH_INTEGRACION === '1' &&
  url !== undefined &&
  claveAnonima !== undefined &&
  credenciales !== undefined;

// Argon2id con los parámetros reales cuesta segundos. Aquí se prueba la
// sincronización, no el coste del KDF, que ya tiene su prueba en el núcleo.
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

const TIPO_ENTIDAD = 'journal_entries';

async function iniciarSesion(): Promise<{ token: string; usuarioId: string }> {
  const separador = (credenciales ?? '').indexOf(':');
  const respuesta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: claveAnonima ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: (credenciales ?? '').slice(0, separador),
      password: (credenciales ?? '').slice(separador + 1),
    }),
  });
  const datos = (await respuesta.json()) as { access_token?: string; user?: { id?: string } };
  if (datos.access_token === undefined || datos.user?.id === undefined) {
    throw new Error(`No se pudo iniciar sesión (HTTP ${respuesta.status})`);
  }
  return { token: datos.access_token, usuarioId: datos.user.id };
}

const describeIntegracion = activada ? describe : describe.skip;

describeIntegracion('dos dispositivos contra el proyecto real', () => {
  jest.setTimeout(120_000);

  let usuarioId: string;
  let token: string;
  // UUID que el servidor asigna a cada dispositivo dado de alta. La columna
  // que atribuye los cambios es una clave ajena a `devices`, así que un
  // identificador inventado por el cliente no vale.
  const dispositivos = new Map<string, string>();

  const crearDispositivo = (nombre: string) => {
    const almacen = crearAlmacenEnMemoria();
    const remoto = crearPuertoRemotoSupabase({
      proveerToken: async () => token,
      url,
      claveAnonima,
      usuarioId,
    });
    const dispositivoId = dispositivos.get(nombre);
    if (dispositivoId === undefined) {
      throw new Error(`Dispositivo sin registrar: ${nombre}`);
    }
    return {
      almacen,
      motor: crearMotorSincronizacion({ almacen, remoto, usuarioId, dispositivoId }),
    };
  };

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_ENTIDAD,
    entidadId,
  });

  const metadatos = { entry_type: 'gratitude', entry_date: '2026-08-02', is_favorite: false };

  beforeAll(async () => {
    const sesion = await iniciarSesion();
    token = sesion.token;
    usuarioId = sesion.usuarioId;

    const rest = crearClienteRest({ proveerToken: async () => token, url, claveAnonima });
    for (const nombre of ['dispositivo-1', 'dispositivo-2']) {
      dispositivos.set(
        nombre,
        await asegurarDispositivo({
          rest,
          usuarioId,
          identificadorPublico: `prueba-${nombre}`,
          plataforma: 'ios',
          nombre,
        }),
      );
    }
  });

  afterAll(async () => {
    await olvidarDispositivo();
  });

  it('crea, cifra, sincroniza y restaura un registro entre dos dispositivos', async () => {
    // ── Dispositivo 1: cuenta nueva y un registro privado ──────────────────
    const material = await inicializarCuenta({ ajustesKdf: KDF_RAPIDO });
    const claveDiario = claveDeDominio('diario');

    const uno = crearDispositivo('dispositivo-1');
    const texto = 'Hoy agradezco la paciencia de mi familia.';

    const registro = await uno.motor.registrarCambioLocal({
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: texto,
        clave: claveDiario,
        claveHash: clavesDerivadas().claveHash,
        vinculo: vinculo('pendiente'),
      }),
      metadatos,
    });

    // El vínculo criptográfico incluye el identificador, que no se conoce
    // hasta que el motor lo asigna. Se vuelve a cifrar ya con el definitivo.
    await uno.motor.registrarCambioLocal({
      id: registro.id,
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: texto,
        clave: claveDiario,
        claveHash: clavesDerivadas().claveHash,
        vinculo: vinculo(registro.id),
      }),
      metadatos,
    });

    const subida = await uno.motor.sincronizar();
    expect(subida.enviados).toBe(1);
    expect(subida.conflictos).toBe(0);

    // ── El servidor solo ve el sobre ───────────────────────────────────────
    const bruto = await fetch(
      `${url}/rest/v1/journal_entries?id=eq.${registro.id}&select=encrypted_payload,content_hash,entry_type`,
      { headers: { apikey: claveAnonima ?? '', Authorization: `Bearer ${token}` } },
    );
    const filas = (await bruto.json()) as { encrypted_payload: string }[];
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toContain('agradezco');
    expect(JSON.stringify(filas)).not.toContain('familia');

    // ── Dispositivo 2: instalación limpia, restaurada con la frase ─────────
    bloquear();
    await olvidarDispositivo();
    await restaurarConFrase({
      frase: material.fraseRecuperacion,
      sobreRecuperacion: material.sobreRecuperacion,
      sobresClaves: material.sobresClaves,
    });

    const dos = crearDispositivo('dispositivo-2');
    const bajada = await dos.motor.sincronizar();
    expect(bajada.recibidos).toBeGreaterThanOrEqual(1);

    const recibido = await dos.almacen.obtener(TIPO_ENTIDAD, registro.id);
    expect(recibido).not.toBeNull();
    if (recibido === null) return;

    // El contenido se recupera íntegro en un dispositivo que nunca vio la
    // clave maestra: solo la frase de recuperación.
    expect(
      descifrar({
        sobre: recibido.sobre,
        clave: claveDeDominio('diario'),
        vinculo: vinculo(registro.id),
      }),
    ).toBe(texto);
    expect(recibido.estado).toBe('sincronizado');
  });

  it('un cambio simultáneo en los dos dispositivos acaba en conflicto, no en pérdida', async () => {
    const material = await inicializarCuenta({ ajustesKdf: KDF_RAPIDO });
    const clave = claveDeDominio('diario');
    const hash = clavesDerivadas().claveHash;

    const uno = crearDispositivo('dispositivo-1');
    const dos = crearDispositivo('dispositivo-2');

    const original = await uno.motor.registrarCambioLocal({
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: 'versión inicial',
        clave,
        claveHash: hash,
        vinculo: vinculo('x'),
      }),
      metadatos,
    });
    await uno.motor.sincronizar();

    // El segundo dispositivo se pone al día y luego los dos editan.
    await dos.motor.sincronizar();

    await dos.motor.registrarCambioLocal({
      id: original.id,
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: 'edición del dispositivo 2',
        clave,
        claveHash: hash,
        vinculo: vinculo(original.id),
      }),
      metadatos,
    });
    await dos.motor.sincronizar();

    await uno.motor.registrarCambioLocal({
      id: original.id,
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: 'edición del dispositivo 1',
        clave,
        claveHash: hash,
        vinculo: vinculo(original.id),
      }),
      metadatos,
    });
    const resultado = await uno.motor.sincronizar();

    expect(resultado.conflictos).toBe(1);

    // Las dos versiones se conservan cifradas y decide el usuario.
    const conflictos = await uno.motor.conflictosPendientes();
    expect(conflictos).toHaveLength(1);
    const conflicto = conflictos[0];
    if (conflicto === undefined) return;
    expect(descifrar({ sobre: conflicto.sobreLocal, clave, vinculo: vinculo(original.id) })).toBe(
      'edición del dispositivo 1',
    );
    expect(descifrar({ sobre: conflicto.sobreRemoto, clave, vinculo: vinculo(original.id) })).toBe(
      'edición del dispositivo 2',
    );

    expect(material.fraseRecuperacion.split(' ')).toHaveLength(24);
  });

  it('el borrado es lógico y llega al otro dispositivo', async () => {
    await inicializarCuenta({ ajustesKdf: KDF_RAPIDO });
    const clave = claveDeDominio('diario');
    const hash = clavesDerivadas().claveHash;

    const uno = crearDispositivo('dispositivo-1');
    const dos = crearDispositivo('dispositivo-2');

    const registro = await uno.motor.registrarCambioLocal({
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({ contenido: 'para borrar', clave, claveHash: hash, vinculo: vinculo('x') }),
      metadatos,
    });
    await uno.motor.sincronizar();
    await dos.motor.sincronizar();
    expect(await dos.almacen.obtener(TIPO_ENTIDAD, registro.id)).not.toBeNull();

    await uno.motor.registrarEliminacionLocal(TIPO_ENTIDAD, registro.id);
    await uno.motor.sincronizar();

    await dos.motor.sincronizar();
    const enElOtro = await dos.almacen.obtener(TIPO_ENTIDAD, registro.id);
    expect(enElOtro?.eliminadoEn).not.toBeNull();

    // El servidor conserva la fila: la papelera de 30 días vive ahí
    // (invariante 6). Un borrado físico habría hecho desaparecer el registro.
    const bruto = await fetch(
      `${url}/rest/v1/journal_entries?id=eq.${registro.id}&select=id,deleted_at`,
      { headers: { apikey: claveAnonima ?? '', Authorization: `Bearer ${token}` } },
    );
    const filas = (await bruto.json()) as { deleted_at: string | null }[];
    expect(filas).toHaveLength(1);
    expect(filas[0]?.deleted_at).not.toBeNull();
  });
});

describeIntegracion('material de la cuenta contra el proyecto real', () => {
  jest.setTimeout(180_000);

  let token: string;
  let usuarioId: string;

  beforeAll(async () => {
    const sesion = await iniciarSesion();
    token = sesion.token;
    usuarioId = sesion.usuarioId;
  });

  afterAll(async () => {
    await olvidarDispositivo();
  });

  it('sube y recupera el material, y la frase abre las claves en otro dispositivo', async () => {
    // Con los parámetros reales de Argon2id: el servidor rechaza cualquier
    // cosa por debajo del mínimo de OWASP, así que aquí no valen los rápidos.
    const rest = crearClienteRest({ proveerToken: async () => token, url, claveAnonima });
    const material = await inicializarCuenta();
    const claveOriginal = claveDeDominio('diario');

    await subirMaterialCuenta({
      rest,
      usuarioId,
      sobresClaves: material.sobresClaves,
      sobreRecuperacion: material.sobreRecuperacion,
    });

    const descargado = await descargarMaterialCuenta({ rest });
    expect(descargado.sobreRecuperacion).not.toBeNull();
    expect(descargado.sobresClaves.length).toBeGreaterThanOrEqual(material.sobresClaves.length);

    // Dispositivo nuevo: nada en el almacén seguro, solo la frase.
    bloquear();
    await olvidarDispositivo();
    if (descargado.sobreRecuperacion === null) return;
    await restaurarConFrase({
      frase: material.fraseRecuperacion,
      sobreRecuperacion: descargado.sobreRecuperacion,
      sobresClaves: descargado.sobresClaves,
    });

    // La clave de contenido recuperada es exactamente la misma.
    expect(claveDeDominio('diario').keyId).toBe(claveOriginal.keyId);
  });

  it('el servidor rechaza unos parámetros de derivación debilitados', async () => {
    const rest = crearClienteRest({ proveerToken: async () => token, url, claveAnonima });

    // Un cliente manipulado no puede rebajar la protección del sobre de nadie.
    await expect(
      subirMaterialCuenta({
        rest,
        usuarioId,
        sobresClaves: [],
        sobreRecuperacion: {
          envoltorioBase64: 'sobre',
          nonceBase64: 'nonce',
          version: 1,
          parametrosKdf: {
            algoritmo: 'argon2id',
            memoriaKiB: 8,
            iteraciones: 1,
            paralelismo: 1,
            salBase64: 'YWJjZA==',
          },
        },
      }),
    ).rejects.toThrow();
  });
});
