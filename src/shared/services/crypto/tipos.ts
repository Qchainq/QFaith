// Tipos del núcleo criptográfico.
//
// El servidor almacena exactamente estos campos y no puede interpretar
// ninguno de ellos (Documento 12, «campos comunes»).

/** Dominios de contenido. Cada uno tiene su propia clave de contenido. */
export const DOMINIOS_CIFRADO = [
  'diario',
  'oracion',
  'memorial',
  'notaBiblica',
  'habito',
  'pulso',
  'notaSermon',
  'ia',
  'bibliotecaVida',
  'medios',
  'planes',
] as const;

export type DominioCifrado = (typeof DOMINIOS_CIFRADO)[number];

/**
 * Datos que atan un criptograma a su registro concreto. Viajan como datos
 * autenticados adicionales (AAD): no se cifran, pero cualquier alteración
 * hace que el descifrado falle.
 *
 * Sin esto, un criptograma sería portable: alguien con acceso a la base de
 * datos podría moverlo a otra fila, a otro tipo de entidad o a otro usuario
 * y el cliente lo descifraría sin notarlo.
 */
export interface VinculoRegistro {
  readonly usuarioId: string;
  readonly tipoEntidad: string;
  readonly entidadId: string;
}

/** Sobre cifrado tal y como se persiste. Refleja el Documento 12. */
export interface SobreCifrado {
  readonly encryptedPayload: string;
  readonly encryptionVersion: number;
  readonly keyId: string;
  readonly nonce: string;
  /**
   * HMAC del texto en claro con una clave derivada de la maestra. Permite
   * detectar si dos versiones de un registro tienen el mismo contenido
   * durante la sincronización, sin que el servidor pueda confirmar hipótesis
   * sobre lo que dice el registro.
   */
  readonly contentHash: string;
}

/** Clave de contenido de un dominio, en claro y solo en memoria. */
export interface ClaveContenido {
  readonly keyId: string;
  readonly dominio: DominioCifrado;
  readonly material: Uint8Array;
}

/** Parámetros de derivación desde la frase de recuperación. */
export interface ParametrosKdf {
  readonly algoritmo: 'argon2id';
  readonly memoriaKiB: number;
  readonly iteraciones: number;
  readonly paralelismo: number;
  readonly salBase64: string;
}

export interface SobreRecuperacion {
  readonly envoltorioBase64: string;
  readonly nonceBase64: string;
  readonly parametrosKdf: ParametrosKdf;
  readonly version: number;
}
