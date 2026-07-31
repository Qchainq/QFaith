// Pruebas del motor de sincronización y prueba del criterio de salida de la
// Fase 1: crear, cifrar, sincronizar y restaurar un registro privado entre
// dos dispositivos.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { crearAlmacenSqlite } from '@shared/database/almacenSqlite';
import { crearEjecutorNodeSqlite } from '@shared/testing/ejecutorNodeSqlite';
import type { AlmacenLocal } from '@shared/database/tipos';
import {
  cifrar,
  crearClaveContenido,
  derivarClaves,
  descifrar,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';

import { crearMotorSincronizacion, type MotorSincronizacion } from '../motorSincronizacion';
import { crearServidorEnMemoria, type ServidorEnMemoria } from './servidorEnMemoria';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const TIPO = 'journal_entries';

const CONTENIDO = 'Hoy anoté una respuesta a algo que llevaba tiempo pidiendo.';

/** Reloj determinista: las pruebas no deben depender de la hora real. */
function relojIncremental() {
  let instante = 0;
  return () => {
    instante += 1;
    return new Date(instante * 1000).toISOString();
  };
}

interface Dispositivo {
  readonly almacen: AlmacenLocal;
  readonly motor: MotorSincronizacion;
  readonly clave: ClaveContenido;
  readonly claveHash: Uint8Array;
}

/**
 * Monta un dispositivo. Ambos comparten la clave maestra, que es lo que
 * ocurre tras restaurar con la frase de recuperación.
 */
function montarDispositivo(
  servidor: ServidorEnMemoria,
  dispositivoId: string,
  material: { readonly clave: ClaveContenido; readonly claveHash: Uint8Array },
): Dispositivo {
  const almacen = crearAlmacenEnMemoria();
  return {
    almacen,
    motor: crearMotorSincronizacion({
      almacen,
      remoto: servidor,
      usuarioId: USUARIO,
      dispositivoId,
      ahora: relojIncremental(),
    }),
    clave: material.clave,
    claveHash: material.claveHash,
  };
}

function materialCompartido() {
  const claveMaestra = generarClaveMaestra();
  return {
    clave: crearClaveContenido('diario'),
    claveHash: derivarClaves(claveMaestra).claveHash,
  };
}

function vinculoDe(entidadId: string): VinculoRegistro {
  return { usuarioId: USUARIO, tipoEntidad: TIPO, entidadId };
}

function cifrarEn(dispositivo: Dispositivo, entidadId: string, contenido: string) {
  return cifrar({
    contenido,
    clave: dispositivo.clave,
    claveHash: dispositivo.claveHash,
    vinculo: vinculoDe(entidadId),
  });
}

describe('trabajo sin conexión', () => {
  it('guarda en local sin tocar la red', async () => {
    const servidor = crearServidorEnMemoria();
    servidor.desconectar();
    const dispositivo = montarDispositivo(servidor, 'movil-1', materialCompartido());

    const id = '22222222-2222-4222-8222-222222222222';
    const registro = await dispositivo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, id, CONTENIDO),
    });

    expect(registro.estado).toBe('nuevo');
    expect(await dispositivo.almacen.obtener(TIPO, id)).not.toBeNull();
    expect(servidor.filas()).toHaveLength(0);
  });

  it('varias ediciones sin conexión siguen siendo una creación para el servidor', async () => {
    const servidor = crearServidorEnMemoria();
    const dispositivo = montarDispositivo(servidor, 'movil-1', materialCompartido());
    const id = '22222222-2222-4222-8222-222222222222';

    await dispositivo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, id, 'primera versión'),
    });
    const segunda = await dispositivo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, id, 'segunda versión'),
    });

    expect(segunda.estado).toBe('nuevo');

    const resumen = await dispositivo.motor.sincronizar();
    expect(resumen.enviados).toBe(1);
    expect(servidor.filas()).toHaveLength(1);
  });
});

describe('orden de sincronización', () => {
  it('envía primero las eliminaciones, después las modificaciones y por último las creaciones', async () => {
    const servidor = crearServidorEnMemoria();
    const dispositivo = montarDispositivo(servidor, 'movil-1', materialCompartido());
    const orden: string[] = [];

    const espia = {
      ...servidor,
      enviar: async (cambios: readonly { id: string; operacion: string }[]) => {
        cambios.forEach((cambio) => orden.push(cambio.operacion));
        return servidor.enviar(cambios as never);
      },
    };

    const almacen = crearAlmacenEnMemoria();
    const motor = crearMotorSincronizacion({
      almacen,
      remoto: espia as never,
      usuarioId: USUARIO,
      dispositivoId: 'movil-1',
      ahora: relojIncremental(),
    });

    // Un registro ya sincronizado que después se borra.
    const idBorrado = '33333333-3333-4333-8333-333333333333';
    await motor.registrarCambioLocal({
      id: idBorrado,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, idBorrado, 'para borrar'),
    });
    await motor.sincronizar();
    orden.length = 0;

    // Otro ya sincronizado que se modifica.
    const idModificado = '44444444-4444-4444-8444-444444444444';
    await motor.registrarCambioLocal({
      id: idModificado,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, idModificado, 'original'),
    });
    await motor.sincronizar();
    orden.length = 0;

    await motor.registrarEliminacionLocal(TIPO, idBorrado);
    await motor.registrarCambioLocal({
      id: idModificado,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, idModificado, 'editado'),
    });
    const idNuevo = '55555555-5555-4555-8555-555555555555';
    await motor.registrarCambioLocal({
      id: idNuevo,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, idNuevo, 'recién creado'),
    });

    await motor.sincronizar();

    expect(orden).toEqual(['delete', 'update', 'create']);
  });
});

describe('conflictos', () => {
  it('no sobrescribe: conserva ambas versiones y espera al usuario', async () => {
    const servidor = crearServidorEnMemoria();
    const material = materialCompartido();
    const movil = montarDispositivo(servidor, 'movil-1', material);
    const tablet = montarDispositivo(servidor, 'tablet-1', material);
    const id = '66666666-6666-4666-8666-666666666666';

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'texto original'),
    });
    await movil.motor.sincronizar();

    // La tablet se pone al día y ambos editan sin verse.
    await tablet.motor.sincronizar();
    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'versión del móvil'),
    });
    await tablet.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(tablet, id, 'versión de la tablet'),
    });

    await movil.motor.sincronizar();
    const resumenTablet = await tablet.motor.sincronizar();

    expect(resumenTablet.conflictos).toBe(1);

    const conflictos = await tablet.motor.conflictosPendientes();
    expect(conflictos).toHaveLength(1);

    // Las dos versiones siguen ahí, cifradas y descifrables por el usuario.
    const conflicto = conflictos[0]!;
    expect(
      descifrar({ sobre: conflicto.sobreLocal, clave: tablet.clave, vinculo: vinculoDe(id) }),
    ).toBe('versión de la tablet');
    expect(
      descifrar({ sobre: conflicto.sobreRemoto, clave: tablet.clave, vinculo: vinculoDe(id) }),
    ).toBe('versión del móvil');
  });

  it('el usuario conserva su versión y esta llega al servidor', async () => {
    const servidor = crearServidorEnMemoria();
    const material = materialCompartido();
    const movil = montarDispositivo(servidor, 'movil-1', material);
    const tablet = montarDispositivo(servidor, 'tablet-1', material);
    const id = '66666666-6666-4666-8666-666666666666';

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'original'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'del móvil'),
    });
    await tablet.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(tablet, id, 'de la tablet'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    const [conflicto] = await tablet.motor.conflictosPendientes();
    await tablet.motor.resolverConflicto({
      conflictoId: conflicto!.id,
      eleccion: 'conservar_local',
    });

    expect(await tablet.motor.conflictosPendientes()).toHaveLength(0);

    await tablet.motor.sincronizar();
    await movil.motor.sincronizar();

    const enElMovil = await movil.almacen.obtener(TIPO, id);
    expect(descifrar({ sobre: enElMovil!.sobre, clave: movil.clave, vinculo: vinculoDe(id) })).toBe(
      'de la tablet',
    );
  });

  it('el usuario puede quedarse con la versión remota', async () => {
    const servidor = crearServidorEnMemoria();
    const material = materialCompartido();
    const movil = montarDispositivo(servidor, 'movil-1', material);
    const tablet = montarDispositivo(servidor, 'tablet-1', material);
    const id = '66666666-6666-4666-8666-666666666666';

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'original'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, 'del móvil'),
    });
    await tablet.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(tablet, id, 'de la tablet'),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    const [conflicto] = await tablet.motor.conflictosPendientes();
    await tablet.motor.resolverConflicto({
      conflictoId: conflicto!.id,
      eleccion: 'conservar_remoto',
    });

    const enLaTablet = await tablet.almacen.obtener(TIPO, id);
    expect(enLaTablet!.estado).toBe('sincronizado');
    expect(
      descifrar({ sobre: enLaTablet!.sobre, clave: tablet.clave, vinculo: vinculoDe(id) }),
    ).toBe('del móvil');
  });
});

describe('idempotencia', () => {
  it('sincronizar dos veces seguidas no duplica ni cambia nada', async () => {
    const servidor = crearServidorEnMemoria();
    const dispositivo = montarDispositivo(servidor, 'movil-1', materialCompartido());
    const id = '77777777-7777-4777-8777-777777777777';

    await dispositivo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, id, CONTENIDO),
    });

    const primera = await dispositivo.motor.sincronizar();
    const segunda = await dispositivo.motor.sincronizar();

    expect(primera.enviados).toBe(1);
    expect(segunda.enviados).toBe(0);
    expect(segunda.conflictos).toBe(0);
    expect(servidor.filas()).toHaveLength(1);
    expect(await dispositivo.almacen.listar(TIPO)).toHaveLength(1);
  });

  it('el cursor nunca retrocede', async () => {
    const servidor = crearServidorEnMemoria();
    const dispositivo = montarDispositivo(servidor, 'movil-1', materialCompartido());
    const id = '77777777-7777-4777-8777-777777777777';

    await dispositivo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(dispositivo, id, CONTENIDO),
    });
    await dispositivo.motor.sincronizar();
    const cursor = await dispositivo.almacen.leerCursorSincronizacion();

    await dispositivo.almacen.escribirCursorSincronizacion(0);
    expect(await dispositivo.almacen.leerCursorSincronizacion()).toBe(cursor);
  });
});

describe('borrado', () => {
  it('el borrado lógico se propaga al otro dispositivo', async () => {
    const servidor = crearServidorEnMemoria();
    const material = materialCompartido();
    const movil = montarDispositivo(servidor, 'movil-1', material);
    const tablet = montarDispositivo(servidor, 'tablet-1', material);
    const id = '88888888-8888-4888-8888-888888888888';

    await movil.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(movil, id, CONTENIDO),
    });
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();
    expect(await tablet.almacen.listar(TIPO)).toHaveLength(1);

    await movil.motor.registrarEliminacionLocal(TIPO, id);
    await movil.motor.sincronizar();
    await tablet.motor.sincronizar();

    expect(await tablet.almacen.listar(TIPO)).toHaveLength(0);
    // Sigue existiendo en la papelera: el borrado nunca es inmediato.
    expect(await tablet.almacen.listar(TIPO, { incluirEliminados: true })).toHaveLength(1);
  });
});

describe('criterio de salida de la Fase 1', () => {
  it('crea, cifra, sincroniza y restaura un registro privado entre dos dispositivos', async () => {
    const servidor = crearServidorEnMemoria();
    const material = materialCompartido();
    const id = '99999999-9999-4999-8999-999999999999';

    // ── Dispositivo original: crea y cifra ──────────────────────────────
    const original = montarDispositivo(servidor, 'movil-original', material);
    await original.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(original, id, CONTENIDO),
      metadatos: { entry_type: 'gratitude', entry_date: '2026-07-31' },
    });

    // ── Sincroniza ──────────────────────────────────────────────────────
    const resumen = await original.motor.sincronizar();
    expect(resumen.enviados).toBe(1);

    // El servidor solo tiene el sobre: ni rastro del texto en claro.
    const enElServidor = JSON.stringify(servidor.filas());
    expect(enElServidor).not.toContain('respuesta');
    expect(enElServidor).not.toContain(CONTENIDO);
    // Los metadatos no sensibles sí viajan, y eso es correcto.
    expect(enElServidor).toContain('gratitude');

    // ── Dispositivo nuevo: restaura ─────────────────────────────────────
    // Llega con la clave maestra recuperada mediante la frase y sin nada en
    // local.
    const nuevo = montarDispositivo(servidor, 'movil-nuevo', material);
    expect(await nuevo.almacen.listar(TIPO)).toHaveLength(0);

    await nuevo.motor.sincronizar();

    const restaurado = await nuevo.almacen.obtener(TIPO, id);
    expect(restaurado).not.toBeNull();
    expect(restaurado!.estado).toBe('sincronizado');
    expect(restaurado!.metadatos['entry_type']).toBe('gratitude');

    // ── Y el contenido se lee igual que en el original ──────────────────
    expect(
      descifrar({ sobre: restaurado!.sobre, clave: nuevo.clave, vinculo: vinculoDe(id) }),
    ).toBe(CONTENIDO);
  });

  it('un dispositivo con otra clave recibe el sobre pero no puede leerlo', async () => {
    const servidor = crearServidorEnMemoria();
    const legitimo = montarDispositivo(servidor, 'movil-1', materialCompartido());
    const intruso = montarDispositivo(servidor, 'movil-intruso', materialCompartido());
    const id = '99999999-9999-4999-8999-999999999999';

    await legitimo.motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrarEn(legitimo, id, CONTENIDO),
    });
    await legitimo.motor.sincronizar();
    await intruso.motor.sincronizar();

    const descargado = await intruso.almacen.obtener(TIPO, id);
    expect(descargado).not.toBeNull();

    // Sin la clave correcta, el sobre es inútil. Esto es lo que hace que
    // sincronizar no sea lo mismo que exponer.
    expect(() =>
      descifrar({ sobre: descargado!.sobre, clave: intruso.clave, vinculo: vinculoDe(id) }),
    ).toThrow(expect.objectContaining({ codigo: 'CLAVE_NO_CORRESPONDE' }));
  });
});

describe('criterio de salida sobre SQLite real', () => {
  // La misma prueba anterior, pero con la persistencia que corre en el
  // dispositivo. Comprueba que el motor no dependía de detalles del almacén
  // en memoria contra el que se desarrolló.
  it('crea, cifra, sincroniza y restaura entre dos dispositivos con base en disco', async () => {
    const servidor = crearServidorEnMemoria();
    const mat = materialCompartido();
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const ejecutorOriginal = crearEjecutorNodeSqlite();
    const almacenOriginal = await crearAlmacenSqlite(ejecutorOriginal);
    const motorOriginal = crearMotorSincronizacion({
      almacen: almacenOriginal,
      remoto: servidor,
      usuarioId: USUARIO,
      dispositivoId: 'movil-original',
      ahora: relojIncremental(),
    });

    await motorOriginal.registrarCambioLocal({
      id,
      tipoEntidad: TIPO,
      sobre: cifrar({
        contenido: CONTENIDO,
        clave: mat.clave,
        claveHash: mat.claveHash,
        vinculo: vinculoDe(id),
      }),
      metadatos: { entry_type: 'gratitude' },
    });
    expect((await motorOriginal.sincronizar()).enviados).toBe(1);

    // Dispositivo nuevo: base vacía, mismas claves tras restaurar la frase.
    const ejecutorNuevo = crearEjecutorNodeSqlite();
    const almacenNuevo = await crearAlmacenSqlite(ejecutorNuevo);
    const motorNuevo = crearMotorSincronizacion({
      almacen: almacenNuevo,
      remoto: servidor,
      usuarioId: USUARIO,
      dispositivoId: 'movil-nuevo',
      ahora: relojIncremental(),
    });

    expect(await almacenNuevo.listar(TIPO)).toHaveLength(0);
    await motorNuevo.sincronizar();

    const restaurado = await almacenNuevo.obtener(TIPO, id);
    expect(restaurado?.estado).toBe('sincronizado');
    expect(restaurado?.metadatos['entry_type']).toBe('gratitude');
    expect(descifrar({ sobre: restaurado!.sobre, clave: mat.clave, vinculo: vinculoDe(id) })).toBe(
      CONTENIDO,
    );

    await ejecutorOriginal.cerrar();
    await ejecutorNuevo.cerrar();
  });
});
