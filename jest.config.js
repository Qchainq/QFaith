// Umbrales de cobertura del Documento 14. El dominio, la seguridad, el
// cifrado y la sincronización exigen 90 %; el resto baja de forma escalonada.
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Solo los archivos `.test.ts` son suites. Dentro de `__tests__` también
  // viven dobles y utilidades compartidas, que no contienen pruebas.
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  // `@noble` y `@scure` se publican solo como ESM, así que hay que dejarlos
  // pasar por Babel en lugar de ignorarlos como al resto de node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@scure/.*)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/shared/testing/**',
    // Adaptador de plataforma sin lógica: solo traduce entre el puerto y la
    // API de expo-sqlite, y no puede ejecutarse fuera de un dispositivo. El
    // SQL que envuelve sí se prueba, contra un motor SQLite real.
    '!src/shared/database/ejecutorExpo.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    'src/shared/services/crypto/**/*.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
    'src/shared/services/keys/**/*.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
    'src/shared/services/sync/**/*.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};
