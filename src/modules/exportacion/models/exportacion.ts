// Exportar el contenido privado.
//
// Es un derecho —portabilidad, Documento 14— y en QFaith es además la
// demostración más clara de que el cifrado no es un adorno: **la empresa no
// puede producir esta exportación.** El servidor solo guarda criptogramas, así
// que el único sitio del mundo donde existe el contenido en claro es el
// teléfono de la persona. Nadie más puede generarla, ni por orden judicial ni
// por error.
//
// ── Decisiones de diseño (Opus) ──────────────────────────────────────────
//
// 1. **Sale en claro, y es a propósito.** Portabilidad significa que otro
//    programa pueda leerlo; un archivo cifrado con nuestro esquema no serviría
//    para nada fuera de aquí. Pero eso convierte al archivo en lo más
//    peligroso que la persona va a tener nunca: toda su vida espiritual junta
//    y legible. La pantalla lo advierte antes de generarlo, no después.
//
// 2. **Nunca incluye claves.** Ni la maestra, ni las derivadas, ni las de
//    dominio, ni la frase de recuperación, ni tokens. Alguien puede compartir
//    su exportación pensando que es «solo mi diario»; si llevara la clave
//    dentro, estaría entregando también todo lo que suba en el futuro. Es la
//    regla que más se comprueba en las pruebas de este módulo.
//
// 3. **Lleva la papelera, marcada como tal.** Lo que está esperando sus
//    treinta días sigue siendo suyo, y quien exporta antes de borrar la cuenta
//    querría precisamente eso. Ocultarlo sería entregar una copia incompleta
//    sin decirlo.
//
// 4. **Lleva un recuento por módulo.** Sin él, nadie puede saber si la
//    exportación está completa: un fallo silencioso que se lleve un módulo
//    entero produciría un archivo con buena pinta y un hueco invisible.
import { z } from 'zod';

/** Versión del formato. Cambia si deja de poder leerse igual. */
export const VERSION_EXPORTACION = 1;

/** Un registro tal y como sale: descifrado y sin rastro de criptografía. */
export interface RegistroExportado {
  readonly id: string;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
  /** Presente solo si estaba en la papelera. Ver decisión 3. */
  readonly enPapeleraDesde?: string;
  /** Lo que la persona escribió, ya legible. */
  readonly contenido: unknown;
  /** Lo que el servidor sí veía: fechas, estados, referencias. */
  readonly datos: Readonly<Record<string, unknown>>;
}

export interface ModuloExportado {
  readonly tipo: string;
  readonly registros: readonly RegistroExportado[];
  /** Cuántos no se pudieron descifrar en este dispositivo. Ver más abajo. */
  readonly ilegibles: number;
}

export interface Exportacion {
  readonly version: number;
  readonly generadaEn: string;
  readonly usuarioId: string;
  readonly aplicacion: string;
  readonly modulos: readonly ModuloExportado[];
  readonly resumen: Readonly<Record<string, number>>;
  /**
   * Cuántos registros no se pudieron abrir en este dispositivo.
   *
   * No es un error que se pueda esconder. Pasa cuando el aparato recibió
   * contenido cifrado con una clave de dominio que no tiene —una cuenta
   * restaurada a medias, por ejemplo—, y quien exporta tiene derecho a saber
   * que lo que se lleva no está completo.
   */
  readonly ilegiblesEnTotal: number;
}

/**
 * Nombres de campo que jamás pueden aparecer en una exportación.
 *
 * Se comprueban **como claves, nunca como valores**, y la diferencia importa:
 * buscarlos en el texto serializado bloquearía una exportación legítima cuyo
 * diario dijera exactamente «material». Un campo vacío llamado
 * `claveMaestra` sí es una fuga —significa que alguien lo añadió al modelo y
 * mañana llevará algo dentro—; una persona escribiendo esa palabra, no.
 */
export const CAMPOS_PROHIBIDOS = [
  'claveMaestra',
  'claveEnvoltorio',
  'claveHash',
  'claveBaseLocal',
  'material',
  'envoltorioBase64',
  'fraseRecuperacion',
  'access_token',
  'accessToken',
  'encrypted_payload',
  'encryptedPayload',
  'nonce',
  'keyId',
  'key_id',
] as const;

export const esquemaExportacion = z.object({
  version: z.number().int().positive(),
  generadaEn: z.string(),
  usuarioId: z.string(),
  aplicacion: z.string(),
  modulos: z.array(
    z.object({
      tipo: z.string(),
      registros: z.array(z.unknown()),
      ilegibles: z.number().int().nonnegative(),
    }),
  ),
  resumen: z.record(z.string(), z.number()),
  ilegiblesEnTotal: z.number().int().nonnegative(),
});

/**
 * Nombre del archivo.
 *
 * Sin el identificador del usuario ni nada del contenido: acaba en la lista de
 * descargas del teléfono, en la vista previa de un mensaje al compartirlo y en
 * cualquier copia de seguridad automática (invariante 2).
 */
export const nombreDeArchivo = (fecha: string): string => `qfaith-${fecha.slice(0, 10)}.json`;

/**
 * Busca campos sensibles recorriendo el objeto.
 *
 * Lo usa la propia exportación antes de entregar el archivo: es una red de
 * seguridad, no un sustituto de construirla bien. Si algún día alguien añade
 * un campo al modelo sin pensarlo, esto lo para antes de que salga del
 * dispositivo.
 *
 * Recorre claves y no texto por lo dicho arriba: lo que la persona escribe no
 * puede hacer que su propia exportación falle.
 */
export function camposSensiblesEn(valor: unknown): readonly string[] {
  const prohibidos = new Set<string>(CAMPOS_PROHIBIDOS);
  const encontrados = new Set<string>();

  const recorrer = (nodo: unknown): void => {
    if (Array.isArray(nodo)) {
      nodo.forEach(recorrer);
      return;
    }
    if (typeof nodo !== 'object' || nodo === null) return;

    for (const [clave, hijo] of Object.entries(nodo)) {
      if (prohibidos.has(clave)) encontrados.add(clave);
      recorrer(hijo);
    }
  };

  recorrer(valor);
  return [...encontrados];
}
