// Configuración aparte para las pruebas que hablan con el proyecto real.
//
// No usa el preajuste `jest-expo` a propósito. Ese preajuste sustituye
// `fetch` por la implementación de Expo, que necesita el módulo nativo y
// fuera de un dispositivo devuelve respuestas sin estado. Estas pruebas no
// montan ningún componente: solo ejercitan cifrado, sincronización y red, así
// que corren en Node con su `fetch` de siempre.
//
// Se lanzan a mano con `npm run test:integracion` y credenciales de una
// cuenta de prueba desechable. No forman parte de `npm test` ni de la
// cobertura: dependen de la red y de un proyecto externo, y una suite que
// falla por un corte de conexión deja de ser una señal útil.
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/*.integracion.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  // `@noble` y `@scure` se publican solo como ESM.
  transformIgnorePatterns: ['node_modules/(?!(@noble/.*|@scure/.*|expo(nent)?|@expo(nent)?/.*))'],
};
