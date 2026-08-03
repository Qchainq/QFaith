// Compartir contenido con otra persona, sin que el servidor pueda leerlo.
//
// **Diseño de Opus.** Es la única parte del sistema donde el contenido de una
// persona llega a otra, y el modelo es deliberadamente el más simple que
// cumple la promesa:
//
//   1. **Sobre sellado (ECDH efímero-estático).** Quien comparte genera un
//      par de claves de un solo uso, hace ECDH con la clave pública del
//      destinatario y envuelve con eso la clave del contenido. La pública
//      efímera viaja junto al criptograma. Es la construcción de
//      `crypto_box_seal` de libsodium, no una invención propia (invariante
//      14).
//
//   2. **El destinatario no necesita saber quién le escribió** para abrirlo,
//      y quien comparte no necesita leer el perfil del destinatario: solo su
//      clave pública. Una clave pública es pública por definición; publicarla
//      no filtra nada.
//
//   3. **Una copia por persona.** Compartir con un grupo de diez crea diez
//      sobres, uno sellado para cada uno. No hay clave de grupo que rotar
//      cuando alguien se va, y revocar a una sola persona es retirar su fila.
//      Es más filas y menos formas de equivocarse.
//
//   4. **La clave privada de compartición se deriva de la clave maestra.** No
//      se guarda aparte, no hace falta respaldarla y viaja con la frase de
//      recuperación como todo lo demás. Perder acceso a lo compartido y a lo
//      propio ocurre a la vez, que es lo que la persona espera.
//
// Lo que este archivo **no** hace: no da acceso a la fila original. Lo que
// viaja es una copia. Revocar es retirar la copia, no confiar en que una
// política deje de aplicarse.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { generarBytesAleatorios } from './aleatoriedad';
import { aBase64, aBytes, desdeBase64 } from './codificacion';
import { ErrorApp } from '@shared/errores/erroresApp';

const LONGITUD_NONCE = 24;
const LONGITUD_CLAVE_PUBLICA = 32;

/** Separa este uso de la clave maestra de cualquier otro. */
const INFO_CLAVE_COMPARTICION = aBytes('qfaith/comparticion/x25519/v1');
const INFO_SECRETO_COMPARTIDO = aBytes('qfaith/comparticion/sobre/v1');

export interface ParDeClavesComparticion {
  readonly privada: Uint8Array;
  readonly publicaBase64: string;
}

function errorComparticion(codigo: string, claveMensaje: string, causa?: unknown): ErrorApp {
  return new ErrorApp(
    { codigo, categoria: 'cifrado', claveMensaje, puedeReintentarse: false },
    causa,
  );
}

/**
 * Par de claves de compartición de un usuario.
 *
 * Determinista a partir de la clave maestra (decisión 4): el mismo usuario
 * obtiene siempre el mismo par, en cualquiera de sus dispositivos y después
 * de restaurar con la frase.
 */
export function derivarParDeCompartir(claveMaestra: Uint8Array): ParDeClavesComparticion {
  const privada = hkdf(sha256, claveMaestra, undefined, INFO_CLAVE_COMPARTICION, 32);
  return {
    privada,
    publicaBase64: aBase64(x25519.getPublicKey(privada)),
  };
}

export interface SobreSellado {
  /** Pública efímera de un solo uso. Sin ella el sobre no se puede abrir. */
  readonly efimeraPublicaBase64: string;
  readonly criptogramaBase64: string;
  readonly nonceBase64: string;
}

/** Deriva la clave de envoltorio a partir del secreto ECDH y las dos públicas. */
function claveDeSobre(secreto: Uint8Array, efimeraPublica: Uint8Array, destino: Uint8Array) {
  // Las dos públicas entran en la sal para que un secreto no pueda
  // reutilizarse con otro destinatario.
  const sal = new Uint8Array(efimeraPublica.length + destino.length);
  sal.set(efimeraPublica, 0);
  sal.set(destino, efimeraPublica.length);
  return hkdf(sha256, secreto, sal, INFO_SECRETO_COMPARTIDO, 32);
}

/**
 * Sella un contenido para una clave pública.
 *
 * `datosAsociados` ata el sobre a su contexto —qué petición, quién comparte—
 * de modo que moverlo a otra fila hace que el descifrado falle.
 */
export function sellarPara(parametros: {
  readonly publicaDestinoBase64: string;
  readonly contenido: string;
  readonly datosAsociados: string;
}): SobreSellado {
  const destino = desdeBase64(parametros.publicaDestinoBase64);
  if (destino.length !== LONGITUD_CLAVE_PUBLICA) {
    throw errorComparticion('CLAVE_PUBLICA_INVALIDA', 'errores.cifrado.claveInvalida');
  }

  const efimeraPrivada = generarBytesAleatorios(32);
  const efimeraPublica = x25519.getPublicKey(efimeraPrivada);
  const secreto = x25519.getSharedSecret(efimeraPrivada, destino);

  const nonce = generarBytesAleatorios(LONGITUD_NONCE);
  const cifrador = xchacha20poly1305(
    claveDeSobre(secreto, efimeraPublica, destino),
    nonce,
    aBytes(parametros.datosAsociados),
  );

  return {
    efimeraPublicaBase64: aBase64(efimeraPublica),
    criptogramaBase64: aBase64(cifrador.encrypt(aBytes(parametros.contenido))),
    nonceBase64: aBase64(nonce),
  };
}

/** Abre un sobre sellado. Falla de forma segura ante cualquier alteración. */
export function abrirSobreSellado(parametros: {
  readonly privada: Uint8Array;
  readonly sobre: SobreSellado;
  readonly datosAsociados: string;
}): string {
  const efimeraPublica = desdeBase64(parametros.sobre.efimeraPublicaBase64);
  const propiaPublica = x25519.getPublicKey(parametros.privada);
  const secreto = x25519.getSharedSecret(parametros.privada, efimeraPublica);

  try {
    const cifrador = xchacha20poly1305(
      claveDeSobre(secreto, efimeraPublica, propiaPublica),
      desdeBase64(parametros.sobre.nonceBase64),
      aBytes(parametros.datosAsociados),
    );
    return new TextDecoder().decode(
      cifrador.decrypt(desdeBase64(parametros.sobre.criptogramaBase64)),
    );
  } catch (causa) {
    throw errorComparticion(
      'SOBRE_COMPARTIDO_INVALIDO',
      'errores.cifrado.envoltorioInvalido',
      causa,
    );
  }
}

/** Contexto que ata un sobre a su fila. Cambiarlo hace que no abra. */
export const contextoDeComparticion = (parametros: {
  readonly peticionId: string;
  readonly propietarioId: string;
}): string => `qfaith/comparticion/${parametros.propietarioId}/${parametros.peticionId}`;
