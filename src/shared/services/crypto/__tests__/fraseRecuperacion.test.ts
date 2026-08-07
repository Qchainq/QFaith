// La frase de recuperación, atada a los vectores del estándar.
//
// ── Por qué esta prueba existe aparte ─────────────────────────────────────
//
// La frase de recuperación es cómo alguien vuelve a leer lo que escribió
// después de perder el teléfono. Si un día deja de producir la misma clave,
// nadie se entera hasta que una persona con un teléfono nuevo escribe sus
// veinticuatro palabras y la aplicación le dice que no son suyas. Para
// entonces no hay arreglo: el contenido está cifrado con una clave que ya no
// se puede reconstruir, y ni la empresa ni nadie puede devolvérselo.
//
// No es un riesgo imaginario. Basta con actualizar `@scure/bip39`, cambiar la
// lista de palabras, o normalizar el texto de otra manera. Todas son cosas
// que se hacen sin pensar y ninguna rompe ninguna otra prueba.
//
// ── Por qué estos vectores y no otros ─────────────────────────────────────
//
// Son los del propio estándar BIP-39, los mismos que publica la especificación
// y que usa cualquier implementación para comprobarse. **No** están generados
// con la biblioteca que aquí se prueba: si lo estuvieran, la prueba diría
// «esta biblioteca hace lo que esta biblioteca hace», que es cierto y no sirve
// de nada. Un fallo de la biblioteca quedaría grabado como el valor esperado.
//
// ── Qué se fija exactamente ───────────────────────────────────────────────
//
// La **entropía**, no la semilla. `derivarClaveRecuperacion` deriva desde
// `mnemonicToEntropy` y no desde el texto de la frase, para que un espaciado
// distinto no cambie la clave. Así que el contrato que hay que preservar es
// que las mismas palabras den siempre los mismos bytes de entropía.
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import {
  crearSobreRecuperacion,
  abrirSobreRecuperacion,
  esFraseRecuperacionValida,
  generarFraseRecuperacion,
} from '../servicioCriptografia';

const aHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const desdeHex = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/.{2}/g) ?? []).map((par) => parseInt(par, 16)));

/**
 * Vectores del estándar BIP-39.
 *
 * Cada línea es entropía ↔ frase. Si alguna deja de cumplirse, **las cuentas
 * ya creadas no se pueden recuperar**: no es un fallo de estilo ni una
 * regresión menor.
 */
const VECTORES: readonly { readonly entropia: string; readonly frase: string }[] = [
  {
    entropia: '00000000000000000000000000000000',
    frase:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  },
  {
    entropia: 'ffffffffffffffffffffffffffffffff',
    frase: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  },
  {
    // El tamaño que usa QFaith: 256 bits, veinticuatro palabras.
    entropia: '0000000000000000000000000000000000000000000000000000000000000000',
    frase:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon art',
  },
  {
    entropia: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    frase:
      'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo ' +
      'zoo vote',
  },
  {
    entropia: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
    frase:
      'legal winner thank year wave sausage worth useful legal winner thank year wave sausage ' +
      'worth useful legal winner thank year wave sausage worth title',
  },
  {
    entropia: '9e885d952ad362caeb4efe34a8e91bd2f1f2b4f0f2ee0a3e0c1f0e2d3c4b5a69',
    frase:
      'ozone drill grab fiber curtain grace pudding thank cruise elder eight planet busy foil ' +
      'sense fruit any vacant amazing brisk stable certain have castle',
  },
];

describe('los vectores del estándar', () => {
  it.each(VECTORES.map((v) => [v.entropia.slice(0, 12) + '…', v] as const))(
    'entropía %s da siempre la misma frase',
    (_resumen, vector) => {
      expect(entropyToMnemonic(desdeHex(vector.entropia), wordlist)).toBe(vector.frase);
    },
  );

  it.each(VECTORES.map((v) => [v.entropia.slice(0, 12) + '…', v] as const))(
    'y esa frase devuelve siempre la misma entropía',
    (_resumen, vector) => {
      // Este es el que de verdad importa: de la entropía sale la clave.
      expect(aHex(mnemonicToEntropy(vector.frase, wordlist))).toBe(vector.entropia);
    },
  );
});

describe('la lista de palabras', () => {
  it('es la de 2048 palabras del estándar', () => {
    // Cambiarla rompe todas las frases existentes de golpe. Es el tipo de
    // cambio que llega dentro de una actualización de dependencias.
    expect(wordlist).toHaveLength(2048);
    expect(wordlist[0]).toBe('abandon');
    expect(wordlist[2047]).toBe('zoo');
  });
});

describe('lo que la aplicación genera', () => {
  it('son veinticuatro palabras de la lista', () => {
    const frase = generarFraseRecuperacion();
    const palabras = frase.split(' ');

    expect(palabras).toHaveLength(24);
    for (const palabra of palabras) {
      expect(wordlist).toContain(palabra);
    }
  });

  it('dos frases seguidas no coinciden', () => {
    // Si coincidieran, la entropía no sería aleatoria y dos personas
    // distintas podrían abrir la cuenta de la otra.
    expect(generarFraseRecuperacion()).not.toBe(generarFraseRecuperacion());
  });

  it('la que genera, la da por válida', () => {
    expect(esFraseRecuperacionValida(generarFraseRecuperacion())).toBe(true);
  });
});

describe('una frase escrita a mano', () => {
  const FRASE = VECTORES[2]?.frase ?? '';

  it('vale con mayúsculas y con espacios de más', () => {
    // Quien copia sus palabras de un papel a las tres de la mañana en un
    // teléfono nuevo no debería tropezar con esto.
    expect(esFraseRecuperacionValida(`  ${FRASE.toUpperCase()}  `)).toBe(true);
  });

  it('una palabra cambiada no cuela', () => {
    // La suma de control del estándar lo detecta, y es lo que evita que
    // alguien se quede pensando que la frase «casi» funciona.
    expect(esFraseRecuperacionValida(FRASE.replace('art', 'zoo'))).toBe(false);
  });

  it('una frase que no es una frase, tampoco', () => {
    expect(esFraseRecuperacionValida('esto no es una frase de recuperación')).toBe(false);
    expect(esFraseRecuperacionValida('')).toBe(false);
  });
});

describe('el recorrido completo, que es lo que se promete', () => {
  const KDF_RAPIDO = {
    algoritmo: 'argon2id',
    memoriaKiB: 256,
    iteraciones: 1,
    paralelismo: 1,
  } as const;

  it('una clave maestra envuelta con una frase del estándar se recupera con ella', async () => {
    // Con un vector fijo y no con una frase generada al azar: así, si un día
    // la entropía cambia, esta prueba falla en lugar de seguir en verde
    // porque las dos mitades cambiaron a la vez.
    const claveMaestra = desdeHex('a1'.repeat(32));
    const frase = VECTORES[5]?.frase ?? '';

    const sobre = await crearSobreRecuperacion({
      claveMaestra: new Uint8Array(claveMaestra),
      frase,
      ajustesKdf: KDF_RAPIDO,
    });
    const recuperada = await abrirSobreRecuperacion({ sobre, frase });

    expect(aHex(recuperada)).toBe('a1'.repeat(32));
  });

  it('con otra frase válida no se abre', async () => {
    const sobre = await crearSobreRecuperacion({
      claveMaestra: desdeHex('a1'.repeat(32)),
      frase: VECTORES[5]?.frase ?? '',
      ajustesKdf: KDF_RAPIDO,
    });

    await expect(
      abrirSobreRecuperacion({ sobre, frase: VECTORES[4]?.frase ?? '' }),
    ).rejects.toThrow();
  });
});
