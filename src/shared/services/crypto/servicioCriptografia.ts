// Núcleo criptográfico de QFaith. Punto único de cifrado, descifrado y
// derivación de claves (Documento 2, «servicios únicos»).
//
// ── Decisiones de diseño (Opus) ───────────────────────────────────────────
//
// 1. Cifrado autenticado: XChaCha20-Poly1305. El nonce de 24 bytes permite
//    generarlo al azar en cada operación sin llevar contador: con ese tamaño
//    la probabilidad de repetición es despreciable. Con AES-GCM y sus 12
//    bytes habría que gestionar contadores por clave y por dispositivo, algo
//    que se rompe en cuanto se restaura un respaldo.
//
// 2. Derivación interna: HKDF-SHA256 con etiquetas de contexto. La clave
//    maestra nunca se usa directamente para cifrar; de ella salen claves
//    separadas por propósito, de forma que comprometer una no compromete las
//    demás.
//
// 3. Derivación desde la frase de recuperación: Argon2id. Los parámetros se
//    guardan junto al sobre para poder endurecerlos en el futuro sin dejar
//    inservibles los sobres antiguos. Se usan los valores mínimos
//    recomendados por OWASP (19 MiB, 2 iteraciones) y no los máximos, porque
//    la frase que generamos tiene 256 bits de entropía: el KDF aquí es
//    defensa en profundidad frente a una frase anotada o fotografiada, no la
//    barrera principal. Subirlos castigaría a los dispositivos modestos en
//    el momento más delicado, que es restaurar la cuenta.
//
// 4. Todo criptograma va atado a su registro mediante datos autenticados
//    adicionales. Sin esto un criptograma sería portable entre filas.
//
// 5. `contentHash` es un HMAC con clave derivada, no un hash a secas. Un
//    SHA-256 del texto en claro permitiría al servidor confirmar hipótesis
//    sobre contenidos cortos y previsibles.
//
// Nada de este archivo debe registrar nunca su entrada o su salida.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { ErrorApp } from '@shared/errores/erroresApp';

import { aBase64, aBytes, aTexto, desdeBase64, limpiar } from './codificacion';
import { generarBytesAleatorios, generarUuid } from './aleatoriedad';
import type {
  ClaveContenido,
  DominioCifrado,
  ParametrosKdf,
  SobreCifrado,
  SobreRecuperacion,
  VinculoRegistro,
} from './tipos';

const LONGITUD_CLAVE = 32;
const LONGITUD_NONCE = 24;
const LONGITUD_SAL = 16;
const LONGITUD_HASH_CONTENIDO = 32;

/** Versión del esquema de cifrado con que se escriben los registros nuevos. */
export const VERSION_CIFRADO_ACTUAL = 1;

/**
 * Parámetros de Argon2id por defecto. Ver decisión 3 en la cabecera.
 *
 * Coste medido con la implementación en JavaScript puro: unos 3 s en un
 * portátil y del orden de 15 s bajo el transpilador de pruebas. En un
 * teléfono modesto hay que contar con decenas de segundos, así que la
 * pantalla de recuperación debe mostrar progreso y no bloquear la interfaz.
 * Si el coste resultara inaceptable en dispositivo, la sustitución correcta
 * es una implementación nativa detrás de esta misma función: los sobres ya
 * guardan sus parámetros, de modo que los antiguos se siguen abriendo.
 */
export const PARAMETROS_KDF_POR_DEFECTO = {
  algoritmo: 'argon2id',
  memoriaKiB: 19456,
  iteraciones: 2,
  paralelismo: 1,
} as const satisfies Omit<ParametrosKdf, 'salBase64'>;

/** Etiquetas de contexto de HKDF. Cambiarlas invalida las claves derivadas. */
const ETIQUETAS = {
  envoltorio: 'qfaith/v1/kek',
  hashContenido: 'qfaith/v1/hash-contenido',
  baseLocal: 'qfaith/v1/base-local',
} as const;

/** Claves derivadas de la maestra. Solo viven en memoria. */
export interface ClavesDerivadas {
  /** Envuelve y desenvuelve las claves de contenido. */
  readonly claveEnvoltorio: Uint8Array;
  /** Calcula `contentHash`. */
  readonly claveHash: Uint8Array;
  /** Cifra la base de datos local. */
  readonly claveBaseLocal: Uint8Array;
}

function errorCifrado(codigo: string, claveMensaje: string, causa?: unknown): ErrorApp {
  return new ErrorApp(
    { codigo, categoria: 'cifrado', claveMensaje, puedeReintentarse: false },
    causa,
  );
}

/**
 * Serializa el vínculo de un registro de forma inequívoca.
 *
 * Cada campo va precedido de su longitud para que dos vínculos distintos no
 * puedan producir la misma cadena. Concatenar con un separador sería
 * ambiguo si algún valor llegara a contenerlo.
 */
function construirDatosAutenticados(
  vinculo: VinculoRegistro,
  keyId: string,
  version: number,
): Uint8Array {
  const partes = [
    'qfaith',
    String(version),
    vinculo.usuarioId,
    vinculo.tipoEntidad,
    vinculo.entidadId,
    keyId,
  ];
  return aBytes(partes.map((parte) => `${parte.length}:${parte}`).join(''));
}

export function generarClaveMaestra(): Uint8Array {
  return generarBytesAleatorios(LONGITUD_CLAVE);
}

/** Deriva las claves de propósito a partir de la maestra. */
export function derivarClaves(claveMaestra: Uint8Array): ClavesDerivadas {
  if (claveMaestra.length !== LONGITUD_CLAVE) {
    throw errorCifrado('CLAVE_MAESTRA_INVALIDA', 'errores.cifrado.claveInvalida');
  }
  const derivar = (etiqueta: string): Uint8Array =>
    hkdf(sha256, claveMaestra, undefined, aBytes(etiqueta), LONGITUD_CLAVE);

  return {
    claveEnvoltorio: derivar(ETIQUETAS.envoltorio),
    claveHash: derivar(ETIQUETAS.hashContenido),
    claveBaseLocal: derivar(ETIQUETAS.baseLocal),
  };
}

export function crearClaveContenido(dominio: DominioCifrado): ClaveContenido {
  return {
    keyId: generarUuid(),
    dominio,
    material: generarBytesAleatorios(LONGITUD_CLAVE),
  };
}

/** Envuelve una clave de contenido para poder guardarla en el servidor. */
export function envolverClaveContenido(
  claveEnvoltorio: Uint8Array,
  clave: ClaveContenido,
): { readonly envoltorioBase64: string; readonly nonceBase64: string } {
  const nonce = generarBytesAleatorios(LONGITUD_NONCE);
  const datosAutenticados = aBytes(`qfaith/envoltorio/${clave.dominio}/${clave.keyId}`);
  const cifrador = xchacha20poly1305(claveEnvoltorio, nonce, datosAutenticados);
  return {
    envoltorioBase64: aBase64(cifrador.encrypt(clave.material)),
    nonceBase64: aBase64(nonce),
  };
}

export function desenvolverClaveContenido(
  claveEnvoltorio: Uint8Array,
  parametros: {
    readonly envoltorioBase64: string;
    readonly nonceBase64: string;
    readonly keyId: string;
    readonly dominio: DominioCifrado;
  },
): ClaveContenido {
  const datosAutenticados = aBytes(`qfaith/envoltorio/${parametros.dominio}/${parametros.keyId}`);
  try {
    const cifrador = xchacha20poly1305(
      claveEnvoltorio,
      desdeBase64(parametros.nonceBase64),
      datosAutenticados,
    );
    return {
      keyId: parametros.keyId,
      dominio: parametros.dominio,
      material: cifrador.decrypt(desdeBase64(parametros.envoltorioBase64)),
    };
  } catch (causa) {
    throw errorCifrado('ENVOLTORIO_INVALIDO', 'errores.cifrado.envoltorioInvalido', causa);
  }
}

/** Cifra contenido privado antes de que salga del dispositivo. */
export function cifrar(parametros: {
  readonly contenido: string;
  readonly clave: ClaveContenido;
  readonly claveHash: Uint8Array;
  readonly vinculo: VinculoRegistro;
  readonly version?: number;
}): SobreCifrado {
  const version = parametros.version ?? VERSION_CIFRADO_ACTUAL;
  const nonce = generarBytesAleatorios(LONGITUD_NONCE);
  const datosAutenticados = construirDatosAutenticados(
    parametros.vinculo,
    parametros.clave.keyId,
    version,
  );
  const bytesContenido = aBytes(parametros.contenido);

  const cifrador = xchacha20poly1305(parametros.clave.material, nonce, datosAutenticados);
  const criptograma = cifrador.encrypt(bytesContenido);
  const hash = hmac(sha256, parametros.claveHash, bytesContenido);

  limpiar(bytesContenido);

  return {
    encryptedPayload: aBase64(criptograma),
    encryptionVersion: version,
    keyId: parametros.clave.keyId,
    nonce: aBase64(nonce),
    contentHash: aBase64(hash.subarray(0, LONGITUD_HASH_CONTENIDO)),
  };
}

/**
 * Descifra un sobre.
 *
 * Falla si la clave no corresponde, si el criptograma fue manipulado o si el
 * sobre se movió a otro registro: el vínculo forma parte de los datos
 * autenticados.
 */
export function descifrar(parametros: {
  readonly sobre: SobreCifrado;
  readonly clave: ClaveContenido;
  readonly vinculo: VinculoRegistro;
}): string {
  if (parametros.sobre.keyId !== parametros.clave.keyId) {
    throw errorCifrado('CLAVE_NO_CORRESPONDE', 'errores.cifrado.claveNoCorresponde');
  }
  const datosAutenticados = construirDatosAutenticados(
    parametros.vinculo,
    parametros.sobre.keyId,
    parametros.sobre.encryptionVersion,
  );
  try {
    const cifrador = xchacha20poly1305(
      parametros.clave.material,
      desdeBase64(parametros.sobre.nonce),
      datosAutenticados,
    );
    return aTexto(cifrador.decrypt(desdeBase64(parametros.sobre.encryptedPayload)));
  } catch (causa) {
    throw errorCifrado('DESCIFRADO_FALLIDO', 'errores.cifrado.descifradoFallido', causa);
  }
}

/** Compara dos registros por contenido sin revelarlo. */
export function calcularHashContenido(claveHash: Uint8Array, contenido: string): string {
  return aBase64(hmac(sha256, claveHash, aBytes(contenido)).subarray(0, LONGITUD_HASH_CONTENIDO));
}

// ── Archivos ──────────────────────────────────────────────────────────────
//
// Un archivo no cabe en `cifrar`: pasarlo por base64 para tratarlo como texto
// añade un tercio de tamaño y obliga a tener en memoria el original, la
// cadena y el criptograma a la vez. Un audio de veinte megas se convierte en
// setenta, y en un teléfono modesto eso es un cierre por falta de memoria.
//
// Todo lo demás es idéntico al camino de texto —mismo algoritmo, mismos datos
// autenticados, mismo `contentHash` con clave— para que un archivo no sea un
// caso especial que se olvide de rotar o de auditar.

/**
 * Sobre de un archivo.
 *
 * El criptograma va en bytes y no en base64: sale directo hacia Storage, y
 * pasarlo por texto solo serviría para volver a inflarlo. Los campos
 * pequeños sí van en base64, porque acaban en columnas de la base de datos.
 */
export interface SobreArchivo {
  readonly criptograma: Uint8Array;
  readonly encryptionVersion: number;
  readonly keyId: string;
  readonly nonce: string;
  readonly contentHash: string;
}

/**
 * Cifra un archivo antes de que salga del dispositivo.
 *
 * A diferencia de `cifrar`, **no borra el contenido recibido**: esos bytes son
 * de quien llama —normalmente lo que acaba de elegir la persona— y puede
 * necesitarlos después para enseñar una vista previa. Borrarlos aquí sería
 * una sorpresa desagradable.
 */
export function cifrarBytes(parametros: {
  readonly contenido: Uint8Array;
  readonly clave: ClaveContenido;
  readonly claveHash: Uint8Array;
  readonly vinculo: VinculoRegistro;
  readonly version?: number;
}): SobreArchivo {
  const version = parametros.version ?? VERSION_CIFRADO_ACTUAL;
  const nonce = generarBytesAleatorios(LONGITUD_NONCE);
  const datosAutenticados = construirDatosAutenticados(
    parametros.vinculo,
    parametros.clave.keyId,
    version,
  );

  const cifrador = xchacha20poly1305(parametros.clave.material, nonce, datosAutenticados);
  const hash = hmac(sha256, parametros.claveHash, parametros.contenido);

  return {
    criptograma: cifrador.encrypt(parametros.contenido),
    encryptionVersion: version,
    keyId: parametros.clave.keyId,
    nonce: aBase64(nonce),
    contentHash: aBase64(hash.subarray(0, LONGITUD_HASH_CONTENIDO)),
  };
}

/**
 * Descifra un archivo.
 *
 * Falla igual que `descifrar`: clave que no corresponde, criptograma
 * manipulado o sobre movido a otra fila. Un archivo cifrado para el diario de
 * alguien no se abre como adjunto de la oración de otro.
 */
export function descifrarBytes(parametros: {
  readonly sobre: SobreArchivo;
  readonly clave: ClaveContenido;
  readonly vinculo: VinculoRegistro;
}): Uint8Array {
  if (parametros.sobre.keyId !== parametros.clave.keyId) {
    throw errorCifrado('CLAVE_NO_CORRESPONDE', 'errores.cifrado.claveNoCorresponde');
  }
  const datosAutenticados = construirDatosAutenticados(
    parametros.vinculo,
    parametros.sobre.keyId,
    parametros.sobre.encryptionVersion,
  );
  try {
    const cifrador = xchacha20poly1305(
      parametros.clave.material,
      desdeBase64(parametros.sobre.nonce),
      datosAutenticados,
    );
    return cifrador.decrypt(parametros.sobre.criptograma);
  } catch (causa) {
    throw errorCifrado('DESCIFRADO_FALLIDO', 'errores.cifrado.descifradoFallido', causa);
  }
}

/** Comprueba que un archivo descargado es el que se subió, sin revelarlo. */
export function calcularHashArchivo(claveHash: Uint8Array, contenido: Uint8Array): string {
  return aBase64(hmac(sha256, claveHash, contenido).subarray(0, LONGITUD_HASH_CONTENIDO));
}

// ── Recuperación ──────────────────────────────────────────────────────────

/** Genera la frase de recuperación: 24 palabras, 256 bits de entropía. */
export function generarFraseRecuperacion(): string {
  return generateMnemonic(wordlist, 256);
}

export function esFraseRecuperacionValida(frase: string): boolean {
  return validateMnemonic(frase.trim().toLowerCase(), wordlist);
}

async function derivarClaveRecuperacion(
  frase: string,
  parametros: ParametrosKdf,
): Promise<Uint8Array> {
  const normalizada = frase.trim().toLowerCase().normalize('NFKD');
  if (!validateMnemonic(normalizada, wordlist)) {
    throw errorCifrado('FRASE_RECUPERACION_INVALIDA', 'errores.cifrado.fraseInvalida');
  }
  // Se deriva desde la entropía y no desde el texto para que un espaciado
  // distinto produzca la misma clave.
  const entropia = mnemonicToEntropy(normalizada, wordlist);
  return argon2idAsync(entropia, desdeBase64(parametros.salBase64), {
    t: parametros.iteraciones,
    m: parametros.memoriaKiB,
    p: parametros.paralelismo,
    dkLen: LONGITUD_CLAVE,
  });
}

/**
 * Envuelve la clave maestra con la frase de recuperación.
 *
 * El resultado es lo único que se sube al servidor. Sin la frase, ni la
 * empresa ni nadie con acceso a la base de datos puede abrirlo.
 */
export async function crearSobreRecuperacion(parametros: {
  readonly claveMaestra: Uint8Array;
  readonly frase: string;
  /**
   * Permite endurecer los parámetros sin tocar el código y, en las pruebas,
   * bajarlos para no pagar el coste real en cada caso. La producción usa
   * siempre los valores por defecto.
   */
  readonly ajustesKdf?: Omit<ParametrosKdf, 'salBase64'>;
}): Promise<SobreRecuperacion> {
  const parametrosKdf: ParametrosKdf = {
    ...(parametros.ajustesKdf ?? PARAMETROS_KDF_POR_DEFECTO),
    salBase64: aBase64(generarBytesAleatorios(LONGITUD_SAL)),
  };
  const claveRecuperacion = await derivarClaveRecuperacion(parametros.frase, parametrosKdf);
  const nonce = generarBytesAleatorios(LONGITUD_NONCE);
  const cifrador = xchacha20poly1305(claveRecuperacion, nonce, aBytes('qfaith/recuperacion/v1'));
  const envoltorio = cifrador.encrypt(parametros.claveMaestra);

  limpiar(claveRecuperacion);

  return {
    envoltorioBase64: aBase64(envoltorio),
    nonceBase64: aBase64(nonce),
    parametrosKdf,
    version: VERSION_CIFRADO_ACTUAL,
  };
}

/** Recupera la clave maestra en un dispositivo nuevo. */
export async function abrirSobreRecuperacion(parametros: {
  readonly sobre: SobreRecuperacion;
  readonly frase: string;
}): Promise<Uint8Array> {
  const claveRecuperacion = await derivarClaveRecuperacion(
    parametros.frase,
    parametros.sobre.parametrosKdf,
  );
  try {
    const cifrador = xchacha20poly1305(
      claveRecuperacion,
      desdeBase64(parametros.sobre.nonceBase64),
      aBytes('qfaith/recuperacion/v1'),
    );
    return cifrador.decrypt(desdeBase64(parametros.sobre.envoltorioBase64));
  } catch (causa) {
    throw errorCifrado('RECUPERACION_FALLIDA', 'errores.cifrado.recuperacionFallida', causa);
  } finally {
    limpiar(claveRecuperacion);
  }
}
