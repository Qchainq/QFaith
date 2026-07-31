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
