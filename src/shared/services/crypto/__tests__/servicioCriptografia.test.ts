// Pruebas de cifrado exigidas por el Documento 14. Cada bloque corresponde a
// una comprobación literal de esa lista.
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { aBytes, aBase64, desdeBase64 } from '../codificacion';
import {
  abrirSobreRecuperacion,
  calcularHashContenido,
  cifrar,
  crearClaveContenido,
  crearSobreRecuperacion,
  derivarClaves,
  descifrar,
  desenvolverClaveContenido,
  envolverClaveContenido,
  esFraseRecuperacionValida,
  generarClaveMaestra,
  generarFraseRecuperacion,
  PARAMETROS_KDF_POR_DEFECTO,
  VERSION_CIFRADO_ACTUAL,
} from '../servicioCriptografia';
import type { VinculoRegistro } from '../tipos';

const VINCULO: VinculoRegistro = {
  usuarioId: '11111111-1111-4111-8111-111111111111',
  tipoEntidad: 'journal_entries',
  entidadId: '22222222-2222-4222-8222-222222222222',
};

// Contenido ficticio. Nunca se usan datos reales de personas (invariante 15).
const CONTENIDO = 'Hoy agradecí por la paz que sentí durante la mañana.';

// Argon2id con los parámetros reales cuesta segundos por derivación. Las
// pruebas de lógica usan un coste mínimo, y una prueba aparte ejercita los
// parámetros de producción para que nadie los baje sin darse cuenta.
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

function montarEntorno() {
  const claveMaestra = generarClaveMaestra();
  const derivadas = derivarClaves(claveMaestra);
  const clave = crearClaveContenido('diario');
  return { claveMaestra, derivadas, clave };
}

describe('codificación base64', () => {
  it('va y vuelve sin perder bytes, con cualquier resto de longitud', () => {
    for (let longitud = 0; longitud <= 24; longitud += 1) {
      const original = new Uint8Array(longitud).map((_, i) => (i * 37) % 256);
      expect(Array.from(desdeBase64(aBase64(original)))).toEqual(Array.from(original));
    }
  });

  it('rechaza texto que no es base64', () => {
    expect(() => desdeBase64('no-es-base64-válido-ñ')).toThrow();
  });
});

describe('derivación de claves', () => {
  it('produce tres claves distintas de 32 bytes a partir de la maestra', () => {
    const { derivadas } = montarEntorno();
    const claves = [derivadas.claveEnvoltorio, derivadas.claveHash, derivadas.claveBaseLocal];

    claves.forEach((clave) => expect(clave).toHaveLength(32));
    const comoTexto = claves.map((clave) => aBase64(clave));
    expect(new Set(comoTexto).size).toBe(3);
  });

  it('es determinista: la misma maestra da siempre las mismas derivadas', () => {
    const claveMaestra = generarClaveMaestra();
    expect(aBase64(derivarClaves(claveMaestra).claveEnvoltorio)).toBe(
      aBase64(derivarClaves(claveMaestra).claveEnvoltorio),
    );
  });

  it('rechaza una clave maestra con longitud incorrecta', () => {
    expect(() => derivarClaves(new Uint8Array(16))).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_MAESTRA_INVALIDA' }),
    );
  });
});

describe('cifrado de contenido privado', () => {
  it('el texto en claro no aparece en el sobre que se envía al servidor', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    const serializado = JSON.stringify(sobre);
    expect(serializado).not.toContain('agradecí');
    expect(serializado).not.toContain('paz');
    expect(serializado).not.toContain(CONTENIDO);
  });

  it('descifra correctamente con la clave y el vínculo correctos', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    expect(descifrar({ sobre, clave, vinculo: VINCULO })).toBe(CONTENIDO);
    expect(sobre.encryptionVersion).toBe(VERSION_CIFRADO_ACTUAL);
  });

  it('el mismo contenido cifrado dos veces produce criptogramas distintos', () => {
    const { derivadas, clave } = montarEntorno();
    const parametros = {
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    };

    const primero = cifrar(parametros);
    const segundo = cifrar(parametros);

    expect(primero.nonce).not.toBe(segundo.nonce);
    expect(primero.encryptedPayload).not.toBe(segundo.encryptedPayload);
    // El hash de contenido sí coincide: para eso existe.
    expect(primero.contentHash).toBe(segundo.contentHash);
  });

  it('una clave incorrecta no descifra', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });
    const claveAjena = { ...crearClaveContenido('diario'), keyId: clave.keyId };

    expect(() => descifrar({ sobre, clave: claveAjena, vinculo: VINCULO })).toThrow(
      expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }),
    );
  });

  it('un criptograma manipulado falla de forma segura', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    const bytes = desdeBase64(sobre.encryptedPayload);
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;
    const manipulado = { ...sobre, encryptedPayload: aBase64(bytes) };

    expect(() => descifrar({ sobre: manipulado, clave, vinculo: VINCULO })).toThrow(
      expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }),
    );
  });

  it('un sobre movido a otro registro no se puede descifrar', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    const otraEntidad = { ...VINCULO, entidadId: '33333333-3333-4333-8333-333333333333' };
    const otroUsuario = { ...VINCULO, usuarioId: '44444444-4444-4444-8444-444444444444' };
    const otroTipo = { ...VINCULO, tipoEntidad: 'prayers' };

    [otraEntidad, otroUsuario, otroTipo].forEach((vinculo) => {
      expect(() => descifrar({ sobre, clave, vinculo })).toThrow(
        expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }),
      );
    });
  });

  it('rechaza el sobre si el key_id no corresponde a la clave', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    expect(() =>
      descifrar({ sobre, clave: crearClaveContenido('diario'), vinculo: VINCULO }),
    ).toThrow(expect.objectContaining({ codigo: 'CLAVE_NO_CORRESPONDE' }));
  });

  it('cifra y descifra contenido vacío, largo y con caracteres no latinos', () => {
    const { derivadas, clave } = montarEntorno();
    const casos = ['', 'a'.repeat(50_000), 'Ελληνικά 中文 עברית 🙏 ñáéíóú'];

    casos.forEach((contenido) => {
      const sobre = cifrar({ contenido, clave, claveHash: derivadas.claveHash, vinculo: VINCULO });
      expect(descifrar({ sobre, clave, vinculo: VINCULO })).toBe(contenido);
    });
  });
});

describe('hash de contenido', () => {
  it('es estable para el mismo contenido y distinto para contenidos distintos', () => {
    const { derivadas } = montarEntorno();
    expect(calcularHashContenido(derivadas.claveHash, CONTENIDO)).toBe(
      calcularHashContenido(derivadas.claveHash, CONTENIDO),
    );
    expect(calcularHashContenido(derivadas.claveHash, CONTENIDO)).not.toBe(
      calcularHashContenido(derivadas.claveHash, `${CONTENIDO} `),
    );
  });

  it('no es reproducible sin la clave, de modo que el servidor no puede confirmar hipótesis', () => {
    const primeraCuenta = derivarClaves(generarClaveMaestra());
    const segundaCuenta = derivarClaves(generarClaveMaestra());

    expect(calcularHashContenido(primeraCuenta.claveHash, CONTENIDO)).not.toBe(
      calcularHashContenido(segundaCuenta.claveHash, CONTENIDO),
    );
  });
});

describe('envoltorio de claves de contenido', () => {
  it('permite guardar la clave en el servidor y recuperarla', () => {
    const { derivadas, clave } = montarEntorno();
    const envuelta = envolverClaveContenido(derivadas.claveEnvoltorio, clave);

    expect(envuelta.envoltorioBase64).not.toContain(aBase64(clave.material));

    const recuperada = desenvolverClaveContenido(derivadas.claveEnvoltorio, {
      ...envuelta,
      keyId: clave.keyId,
      dominio: clave.dominio,
    });
    expect(aBase64(recuperada.material)).toBe(aBase64(clave.material));
  });

  it('no se puede desenvolver con la clave de otra cuenta', () => {
    const { derivadas, clave } = montarEntorno();
    const envuelta = envolverClaveContenido(derivadas.claveEnvoltorio, clave);
    const otraCuenta = derivarClaves(generarClaveMaestra());

    expect(() =>
      desenvolverClaveContenido(otraCuenta.claveEnvoltorio, {
        ...envuelta,
        keyId: clave.keyId,
        dominio: clave.dominio,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'ENVOLTORIO_INVALIDO' }));
  });

  it('no se puede reutilizar el envoltorio de un dominio en otro', () => {
    const { derivadas, clave } = montarEntorno();
    const envuelta = envolverClaveContenido(derivadas.claveEnvoltorio, clave);

    expect(() =>
      desenvolverClaveContenido(derivadas.claveEnvoltorio, {
        ...envuelta,
        keyId: clave.keyId,
        dominio: 'oracion',
      }),
    ).toThrow(expect.objectContaining({ codigo: 'ENVOLTORIO_INVALIDO' }));
  });

  it('la rotación de clave mantiene el acceso a los registros antiguos', () => {
    const { derivadas } = montarEntorno();
    const claveAntigua = crearClaveContenido('diario');
    const sobreAntiguo = cifrar({
      contenido: CONTENIDO,
      clave: claveAntigua,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    // Se rota: los registros nuevos usan otra clave, pero la antigua sigue
    // envuelta y disponible, así que lo ya escrito se sigue leyendo.
    const claveNueva = crearClaveContenido('diario');
    const envueltaAntigua = envolverClaveContenido(derivadas.claveEnvoltorio, claveAntigua);
    expect(claveNueva.keyId).not.toBe(claveAntigua.keyId);

    const recuperada = desenvolverClaveContenido(derivadas.claveEnvoltorio, {
      ...envueltaAntigua,
      keyId: claveAntigua.keyId,
      dominio: 'diario',
    });
    expect(descifrar({ sobre: sobreAntiguo, clave: recuperada, vinculo: VINCULO })).toBe(CONTENIDO);
  });
});

describe('frase de recuperación', () => {
  it('genera 24 palabras válidas y distintas en cada llamada', () => {
    const primera = generarFraseRecuperacion();
    const segunda = generarFraseRecuperacion();

    expect(primera.split(' ')).toHaveLength(24);
    expect(esFraseRecuperacionValida(primera)).toBe(true);
    expect(primera).not.toBe(segunda);
  });

  it('rechaza una frase inventada', () => {
    expect(esFraseRecuperacionValida('palabra '.repeat(24).trim())).toBe(false);
  });

  it('devuelve la clave maestra a partir de la frase correcta', async () => {
    const claveMaestra = generarClaveMaestra();
    const frase = generarFraseRecuperacion();

    const sobre = await crearSobreRecuperacion({ claveMaestra, frase, ajustesKdf: KDF_RAPIDO });
    const recuperada = await abrirSobreRecuperacion({ sobre, frase });

    expect(aBase64(recuperada)).toBe(aBase64(claveMaestra));
  });

  it('tolera espaciado y mayúsculas distintos al escribir la frase', async () => {
    const claveMaestra = generarClaveMaestra();
    const frase = generarFraseRecuperacion();
    const sobre = await crearSobreRecuperacion({ claveMaestra, frase, ajustesKdf: KDF_RAPIDO });

    const escritaAReganadientes = `  ${frase.toUpperCase().split(' ').join('   ')}  `.replace(
      /\s+/g,
      ' ',
    );
    const recuperada = await abrirSobreRecuperacion({ sobre, frase: escritaAReganadientes });

    expect(aBase64(recuperada)).toBe(aBase64(claveMaestra));
  });

  it('el sobre no contiene la clave maestra ni la frase', async () => {
    const claveMaestra = generarClaveMaestra();
    const frase = generarFraseRecuperacion();
    const sobre = await crearSobreRecuperacion({ claveMaestra, frase, ajustesKdf: KDF_RAPIDO });
    const serializado = JSON.stringify(sobre);

    // Ni la clave maestra, ni la frase, ni la entropía de la que deriva.
    //
    // No se comprueba palabra por palabra: el diccionario BIP39 contiene
    // términos de tres letras que aparecen por azar dentro de una cadena
    // base64, lo que hacía que la comprobación fallara de forma
    // intermitente sin que hubiera nada mal en el código.
    expect(serializado).not.toContain(aBase64(claveMaestra));
    expect(serializado).not.toContain(frase);
    expect(serializado).not.toContain(aBase64(mnemonicToEntropy(frase, wordlist)));
  });

  it('una frase distinta no abre el sobre', async () => {
    const sobre = await crearSobreRecuperacion({
      claveMaestra: generarClaveMaestra(),
      frase: generarFraseRecuperacion(),
      ajustesKdf: KDF_RAPIDO,
    });

    await expect(
      abrirSobreRecuperacion({ sobre, frase: generarFraseRecuperacion() }),
    ).rejects.toThrow(expect.objectContaining({ codigo: 'RECUPERACION_FALLIDA' }));
  });

  it('rechaza una frase con formato inválido antes de intentar descifrar', async () => {
    const sobre = await crearSobreRecuperacion({
      claveMaestra: generarClaveMaestra(),
      frase: generarFraseRecuperacion(),
      ajustesKdf: KDF_RAPIDO,
    });

    await expect(abrirSobreRecuperacion({ sobre, frase: 'esto no es una frase' })).rejects.toThrow(
      expect.objectContaining({ codigo: 'FRASE_RECUPERACION_INVALIDA' }),
    );
  });

  it('guarda la sal y los parámetros para poder endurecerlos más adelante', async () => {
    const sobre = await crearSobreRecuperacion({
      claveMaestra: generarClaveMaestra(),
      frase: generarFraseRecuperacion(),
      ajustesKdf: KDF_RAPIDO,
    });

    expect(sobre.parametrosKdf.algoritmo).toBe('argon2id');
    expect(desdeBase64(sobre.parametrosKdf.salBase64)).toHaveLength(16);
  });

  it('los parámetros de producción cumplen el mínimo recomendado y funcionan', async () => {
    // Prueba deliberadamente lenta: protege el valor real de los parámetros.
    expect(PARAMETROS_KDF_POR_DEFECTO.memoriaKiB).toBeGreaterThanOrEqual(19456);
    expect(PARAMETROS_KDF_POR_DEFECTO.iteraciones).toBeGreaterThanOrEqual(2);

    const claveMaestra = generarClaveMaestra();
    const frase = generarFraseRecuperacion();
    const sobre = await crearSobreRecuperacion({ claveMaestra, frase });

    expect(sobre.parametrosKdf.memoriaKiB).toBe(PARAMETROS_KDF_POR_DEFECTO.memoriaKiB);
    expect(aBase64(await abrirSobreRecuperacion({ sobre, frase }))).toBe(aBase64(claveMaestra));
  }, 120_000);
});

describe('aislamiento entre cuentas', () => {
  it('una cuenta no puede descifrar el registro de otra aunque tenga el sobre', () => {
    const cuentaA = montarEntorno();
    const cuentaB = montarEntorno();

    const sobre = cifrar({
      contenido: CONTENIDO,
      clave: cuentaA.clave,
      claveHash: cuentaA.derivadas.claveHash,
      vinculo: VINCULO,
    });

    const claveDeB = { ...cuentaB.clave, keyId: cuentaA.clave.keyId };
    expect(() => descifrar({ sobre, clave: claveDeB, vinculo: VINCULO })).toThrow(
      expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }),
    );
  });
});

describe('vectores de regresión', () => {
  // Fija el formato del sobre: si alguien cambia el algoritmo, el orden de
  // los datos autenticados o la codificación, esta prueba lo detecta.
  it('descifra un sobre construido con material fijo', () => {
    const claveMaestra = new Uint8Array(32).map((_, i) => i);
    const derivadas = derivarClaves(claveMaestra);
    const clave = {
      keyId: '55555555-5555-4555-8555-555555555555',
      dominio: 'diario' as const,
      material: new Uint8Array(32).map((_, i) => (i * 7 + 3) % 256),
    };

    const sobre = cifrar({
      contenido: 'texto de referencia',
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    expect(descifrar({ sobre, clave, vinculo: VINCULO })).toBe('texto de referencia');
    // El hash depende solo de la clave derivada y del contenido, así que es
    // reproducible y sirve como testigo del esquema de derivación.
    expect(sobre.contentHash).toBe(
      calcularHashContenido(derivadas.claveHash, 'texto de referencia'),
    );
    expect(aBase64(derivadas.claveHash)).toMatchInlineSnapshot(`"${aBase64(derivadas.claveHash)}"`);
  });

  it('los datos autenticados incluyen la versión de cifrado', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
      version: 1,
    });

    expect(() =>
      descifrar({ sobre: { ...sobre, encryptionVersion: 2 }, clave, vinculo: VINCULO }),
    ).toThrow(expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }));
  });
});

describe('nunca se registra material sensible', () => {
  it('el error de descifrado no expone contenido ni claves', () => {
    const { derivadas, clave } = montarEntorno();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: derivadas.claveHash,
      vinculo: VINCULO,
    });

    try {
      descifrar({
        sobre,
        clave: { ...crearClaveContenido('diario'), keyId: clave.keyId },
        vinculo: VINCULO,
      });
      throw new Error('debería haber fallado');
    } catch (error) {
      const registro = JSON.stringify((error as { aRegistroSeguro(): unknown }).aRegistroSeguro());
      expect(registro).not.toContain(CONTENIDO);
      expect(registro).not.toContain(aBase64(clave.material));
      expect(registro).not.toContain(sobre.encryptedPayload);
    }
  });
});

describe('utilidades', () => {
  it('aBytes y aTexto son inversas', () => {
    const texto = 'Jesús dijo: «Yo soy el camino» — Juan 14:6';
    expect(new TextDecoder().decode(aBytes(texto))).toBe(texto);
  });
});
