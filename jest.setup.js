// Dobles de prueba de los módulos nativos. El almacén seguro se simula en
// memoria para poder ejercitar la gestión de claves sin dispositivo.

jest.mock('expo-secure-store', () => {
  const almacen = new Map();
  return {
    __almacen: almacen,
    setItemAsync: jest.fn(async (clave, valor) => {
      almacen.set(clave, valor);
    }),
    getItemAsync: jest.fn(async (clave) => (almacen.has(clave) ? almacen.get(clave) : null)),
    deleteItemAsync: jest.fn(async (clave) => {
      almacen.delete(clave);
    }),
    isAvailableAsync: jest.fn(async () => true),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1, 2]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// `expo-sqlite` necesita el módulo nativo. En pruebas se apoya en el SQLite
// que trae Node, que es el mismo motor: así montar el proveedor de
// sincronización ejercita el SQL de verdad en lugar de devolver respuestas
// preparadas.
jest.mock('expo-sqlite', () => {
  return {
    // `node:sqlite` se carga solo si una prueba abre de verdad una base. Al
    // hacerlo en la fábrica del doble, cualquier archivo que importara la
    // cadena de la sincronización lo cargaba sin usarlo.
    openDatabaseAsync: async () => {
      const { DatabaseSync } = require('node:sqlite');
      const base = new DatabaseSync(':memory:');
      return {
        execAsync: async (sql) => {
          // `journal_mode = WAL` no aplica a una base en memoria.
          base.exec(sql.replace(/pragma journal_mode = WAL;?/i, ''));
        },
        runAsync: async (sql, parametros = []) => base.prepare(sql).run(...parametros),
        getAllAsync: async (sql, parametros = []) => base.prepare(sql).all(...parametros),
        getFirstAsync: async (sql, parametros = []) => base.prepare(sql).get(...parametros) ?? null,
        closeAsync: async () => base.close(),
      };
    },
  };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es', languageTag: 'es-ES' }],
  getCalendars: () => [{ timeZone: 'Europe/Madrid' }],
}));

// `expo-crypto` delega en la fuente de aleatoriedad de Node durante las
// pruebas. En el dispositivo usa la del sistema operativo.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    getRandomBytes: (longitud) => new Uint8Array(nodeCrypto.randomBytes(longitud)),
    getRandomBytesAsync: async (longitud) => new Uint8Array(nodeCrypto.randomBytes(longitud)),
    randomUUID: () => nodeCrypto.randomUUID(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});
