// Configuración de ESLint. Refuerza los invariantes del proyecto que pueden
// comprobarse de forma automática: nada de `any` sin justificar, nada de
// registrar contenido en consola y ninguna importación directa de Supabase
// fuera de la capa de infraestructura.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/**', 'coverage/**', '.expo/**', 'dist/**', 'supabase/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Invariante 2: nunca registrar contenido espiritual, claves ni tokens.
      // El logger propio es el único canal permitido y ya filtra por diseño.
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      // i18next exporta su instancia por defecto y además métodos con el
      // mismo nombre, lo que dispara este aviso sin que haya nada que
      // corregir. Se desactiva porque no distingue el caso legítimo.
      'import/no-named-as-default-member': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Invariante 10: solo la capa de infraestructura habla con Supabase. Usa un repositorio.',
            },
          ],
        },
      ],
    },
  },
  {
    // La infraestructura sí puede construir el cliente de Supabase.
    files: ['src/shared/services/supabase/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // El logger es el único punto donde se permite tocar la consola.
    files: ['src/shared/services/logger/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Utilidades que se ejecutan en Node, no en el dispositivo: tienen a su
    // disposición las globales de Node y sí pueden escribir por consola,
    // porque su salida es precisamente el informe que lee quien las lanza.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);
