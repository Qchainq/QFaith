// Medidas de rendimiento. Se lanzan con `npm run medir`.
//
// Van en su propia configuración y no en la suite normal porque miden tiempo,
// y el tiempo depende de la máquina. Mezcladas con las demás acabarían
// fallando en integración continua un día cualquiera por culpa de un vecino
// ruidoso, y a la tercera vez alguien las desactivaría. Aparte pueden ser
// exigentes sin volverse frágiles.
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/src/**/*.medicion.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // En serie: dos medidas a la vez se roban el procesador y falsean las dos.
  maxWorkers: 1,
  // Descifrar miles de registros lleva su tiempo, y aquí es lo que se mide.
  testTimeout: 300_000,
  collectCoverage: false,
  coverageThreshold: undefined,
};
