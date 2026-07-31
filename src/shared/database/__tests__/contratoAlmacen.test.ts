// Contrato del almacén local.
//
// La misma batería se ejecuta contra las dos implementaciones. Importa
// porque el motor de sincronización se prueba contra la de memoria y se
// ejecuta contra la de SQLite: si divergieran, la aplicación se comportaría
// en el dispositivo de forma distinta a como está probada.
//
// La de SQLite corre sobre un motor real, no sobre un doble.
import { crearAlmacenEnMemoria } from '../almacenEnMemoria';
import { crearAlmacenSqlite } from '../almacenSqlite';
import { crearEjecutorNodeSqlite } from '@shared/testing/ejecutorNodeSqlite';
import type { AlmacenLocal, ConflictoLocal, RegistroLocal } from '../tipos';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const TIPO = 'journal_entries';

function sobreFalso(marca: string) {
  return {
    encryptedPayload: `criptograma-${marca}`,
    encryptionVersion: 1,
    keyId: '55555555-5555-4555-8555-555555555555',
    nonce: `nonce-${marca}`,
    contentHash: `hash-${marca}`,
  };
}

function registro(parciales: Partial<RegistroLocal> & { id: string }): RegistroLocal {
  return {
    usuarioId: USUARIO,
    tipoEntidad: TIPO,
    sobre: sobreFalso(parciales.id),
    metadatos: { entry_type: 'gratitude', entry_date: '2026-07-31' },
    version: 1,
    revisionRemota: 0,
    estado: 'nuevo',
    creadoEn: '2026-07-31T10:00:00.000Z',
    actualizadoEn: '2026-07-31T10:00:00.000Z',
    eliminadoEn: null,
    dispositivoId: 'movil-1',
    ...parciales,
  };
}

function conflicto(id: string, entidadId: string): ConflictoLocal {
  return {
    id,
    usuarioId: USUARIO,
    tipoEntidad: TIPO,
    entidadId,
    versionLocal: 3,
    versionRemota: 4,
    sobreLocal: sobreFalso('local'),
    sobreRemoto: sobreFalso('remoto'),
    creadoEn: '2026-07-31T11:00:00.000Z',
  };
}

const IMPLEMENTACIONES: readonly {
  nombre: string;
  crear: () => Promise<AlmacenLocal>;
}[] = [
  { nombre: 'en memoria', crear: async () => crearAlmacenEnMemoria() },
  { nombre: 'SQLite', crear: () => crearAlmacenSqlite(crearEjecutorNodeSqlite()) },
];

describe.each(IMPLEMENTACIONES)('almacén $nombre', ({ crear }) => {
  let almacen: AlmacenLocal;

  beforeEach(async () => {
    almacen = await crear();
  });

  describe('guardar y recuperar', () => {
    it('devuelve el registro tal y como se guardó', async () => {
      const original = registro({ id: 'a' });
      await almacen.guardar(original);

      expect(await almacen.obtener(TIPO, 'a')).toEqual(original);
    });

    it('conserva el sobre y los metadatos con sus tipos', async () => {
      await almacen.guardar(
        registro({ id: 'a', metadatos: { texto: 'x', numero: 7, booleano: true, nulo: null } }),
      );

      const recuperado = await almacen.obtener(TIPO, 'a');
      expect(recuperado?.metadatos).toEqual({ texto: 'x', numero: 7, booleano: true, nulo: null });
      expect(recuperado?.sobre.encryptedPayload).toBe('criptograma-a');
    });

    it('guardar dos veces el mismo identificador actualiza en lugar de duplicar', async () => {
      await almacen.guardar(registro({ id: 'a' }));
      await almacen.guardar(registro({ id: 'a', version: 2, estado: 'modificado' }));

      expect(await almacen.listar(TIPO)).toHaveLength(1);
      expect((await almacen.obtener(TIPO, 'a'))?.version).toBe(2);
    });

    it('devuelve null cuando no existe', async () => {
      expect(await almacen.obtener(TIPO, 'inexistente')).toBeNull();
    });

    it('separa por tipo de entidad', async () => {
      await almacen.guardar(registro({ id: 'a' }));
      await almacen.guardar(registro({ id: 'a', tipoEntidad: 'prayers' }));

      expect(await almacen.listar(TIPO)).toHaveLength(1);
      expect(await almacen.listar('prayers')).toHaveLength(1);
    });
  });

  describe('listado', () => {
    it('oculta los eliminados salvo que se pidan', async () => {
      await almacen.guardar(registro({ id: 'vivo' }));
      await almacen.guardar(
        registro({ id: 'borrado', estado: 'eliminado', eliminadoEn: '2026-07-31T12:00:00.000Z' }),
      );

      expect(await almacen.listar(TIPO)).toHaveLength(1);
      expect(await almacen.listar(TIPO, { incluirEliminados: true })).toHaveLength(2);
    });

    it('ordena del más reciente al más antiguo', async () => {
      await almacen.guardar(registro({ id: 'antiguo', actualizadoEn: '2026-07-01T10:00:00.000Z' }));
      await almacen.guardar(registro({ id: 'nuevo', actualizadoEn: '2026-07-31T10:00:00.000Z' }));

      expect((await almacen.listar(TIPO)).map((fila) => fila.id)).toEqual(['nuevo', 'antiguo']);
    });

    it('un tipo sin registros devuelve lista vacía', async () => {
      expect(await almacen.listar('sermons')).toHaveLength(0);
    });
  });

  describe('cola de envío', () => {
    it('respeta el orden eliminar, actualizar, crear', async () => {
      await almacen.guardar(registro({ id: 'nuevo', estado: 'nuevo' }));
      await almacen.guardar(registro({ id: 'modificado', estado: 'modificado' }));
      await almacen.guardar(registro({ id: 'eliminado', estado: 'eliminado' }));
      await almacen.guardar(registro({ id: 'pendiente', estado: 'pendiente' }));

      expect((await almacen.pendientesDeEnvio()).map((fila) => fila.id)).toEqual([
        'eliminado',
        'modificado',
        'nuevo',
        'pendiente',
      ]);
    });

    it('a igualdad de estado respeta el orden en que el usuario hizo los cambios', async () => {
      await almacen.guardar(
        registro({ id: 'segundo', estado: 'nuevo', actualizadoEn: '2026-07-31T10:00:02.000Z' }),
      );
      await almacen.guardar(
        registro({ id: 'primero', estado: 'nuevo', actualizadoEn: '2026-07-31T10:00:01.000Z' }),
      );

      expect((await almacen.pendientesDeEnvio()).map((fila) => fila.id)).toEqual([
        'primero',
        'segundo',
      ]);
    });

    it('deja fuera lo ya sincronizado y lo que está en conflicto', async () => {
      await almacen.guardar(registro({ id: 'sincronizado', estado: 'sincronizado' }));
      await almacen.guardar(registro({ id: 'conflicto', estado: 'conflicto' }));

      expect(await almacen.pendientesDeEnvio()).toHaveLength(0);
    });
  });

  describe('conflictos', () => {
    it('guarda, lista y elimina', async () => {
      await almacen.guardarConflicto(conflicto('c1', 'a'));

      const guardados = await almacen.listarConflictos();
      expect(guardados).toHaveLength(1);
      expect(guardados[0]).toEqual(conflicto('c1', 'a'));

      await almacen.eliminarConflicto('c1');
      expect(await almacen.listarConflictos()).toHaveLength(0);
    });

    it('conserva las dos versiones cifradas', async () => {
      await almacen.guardarConflicto(conflicto('c1', 'a'));

      const [guardado] = await almacen.listarConflictos();
      expect(guardado?.sobreLocal.encryptedPayload).toBe('criptograma-local');
      expect(guardado?.sobreRemoto.encryptedPayload).toBe('criptograma-remoto');
    });

    it('eliminar uno que no existe no rompe nada', async () => {
      await expect(almacen.eliminarConflicto('inexistente')).resolves.toBeUndefined();
    });
  });

  describe('cursor de sincronización', () => {
    it('empieza en cero', async () => {
      expect(await almacen.leerCursorSincronizacion()).toBe(0);
    });

    it('avanza y se conserva', async () => {
      await almacen.escribirCursorSincronizacion(42);
      expect(await almacen.leerCursorSincronizacion()).toBe(42);
    });

    it('nunca retrocede', async () => {
      await almacen.escribirCursorSincronizacion(42);
      await almacen.escribirCursorSincronizacion(7);

      expect(await almacen.leerCursorSincronizacion()).toBe(42);
    });

    it('compara como número y no como texto', async () => {
      // Comparando cadenas, «9» sería mayor que «10» y el cursor se quedaría
      // atascado saltándose cambios.
      await almacen.escribirCursorSincronizacion(9);
      await almacen.escribirCursorSincronizacion(10);

      expect(await almacen.leerCursorSincronizacion()).toBe(10);
    });
  });

  describe('vaciar', () => {
    it('borra registros, conflictos y cursor', async () => {
      await almacen.guardar(registro({ id: 'a' }));
      await almacen.guardarConflicto(conflicto('c1', 'a'));
      await almacen.escribirCursorSincronizacion(5);

      await almacen.vaciar();

      expect(await almacen.listar(TIPO, { incluirEliminados: true })).toHaveLength(0);
      expect(await almacen.listarConflictos()).toHaveLength(0);
      expect(await almacen.leerCursorSincronizacion()).toBe(0);
    });
  });
});

describe('persistencia en disco de SQLite', () => {
  it('los datos siguen ahí al volver a abrir la base', async () => {
    // Es la razón de ser de esta implementación: en memoria, cerrar la
    // aplicación borraría todo lo que el usuario ha escrito.
    const ejecutor = crearEjecutorNodeSqlite();
    const almacen = await crearAlmacenSqlite(ejecutor);
    await almacen.guardar(registro({ id: 'a' }));

    // Se vuelve a construir el almacén sobre la misma conexión, como haría
    // un arranque posterior sobre el mismo archivo.
    const reabierto = await crearAlmacenSqlite(ejecutor);

    expect(await reabierto.obtener(TIPO, 'a')).not.toBeNull();
    await ejecutor.cerrar();
  });

  it('crear el esquema dos veces no falla ni pierde datos', async () => {
    const ejecutor = crearEjecutorNodeSqlite();
    const primero = await crearAlmacenSqlite(ejecutor);
    await primero.guardar(registro({ id: 'a' }));

    await expect(crearAlmacenSqlite(ejecutor)).resolves.toBeDefined();
    expect(await primero.obtener(TIPO, 'a')).not.toBeNull();
    await ejecutor.cerrar();
  });
});
