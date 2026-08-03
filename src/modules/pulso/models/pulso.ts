// Modelo del Pulso Espiritual (Documento 6).
//
// Nueve estados y ninguno más. La lista es cerrada por una razón que no es
// técnica: con texto libre, alguien acabaría escribiendo su diagnóstico
// médico en un campo que viaja en claro. Con nueve códigos, lo peor que puede
// saber el servidor es que hoy alguien eligió «ansioso».
//
// **Ningún estado es malo.** No hay puntuación, no hay racha, no hay
// «llevas tres días triste». La respuesta sirve para preparar una lectura y
// una oración, no para medir a nadie (invariante 12).
import { z } from 'zod';

export const ESTADOS_PULSO = [
  'enPaz',
  'agradecido',
  'ansioso',
  'triste',
  'cansado',
  'tentado',
  'confundido',
  'necesitoDireccion',
  'alejadoDeDios',
] as const;

export type EstadoPulso = (typeof ESTADOS_PULSO)[number];

/**
 * Estados que suelen acompañar a un momento difícil.
 *
 * No sirve para clasificar a nadie ni aparece en ninguna estadística: solo
 * decide si el acompañamiento que se ofrece incluye recordar que hablar con
 * una persona ayuda. La distinción vive aquí y no en la pantalla para que no
 * se reinvente distinta en otro sitio.
 */
const DIFICILES: readonly EstadoPulso[] = [
  'ansioso',
  'triste',
  'tentado',
  'confundido',
  'alejadoDeDios',
];

export const esDificil = (estado: EstadoPulso): boolean => DIFICILES.includes(estado);

/** Lo que viaja cifrado: el «por qué», si la persona quiere escribirlo. */
export const esquemaContenidoPulso = z.object({ nota: z.string().max(2000) });

export interface Pulso {
  readonly id: string;
  /** Día al que corresponde, en formato `AAAA-MM-DD`. */
  readonly fecha: string;
  readonly estado: EstadoPulso;
  /** De 1 a 5, opcional. Nunca se agrega ni se promedia. */
  readonly intensidad: number | null;
  readonly nota: string;
  readonly creadoEn: string;
}

export interface BorradorPulso {
  readonly fecha: string;
  readonly estado: EstadoPulso;
  readonly intensidad?: number | null;
  readonly nota?: string;
}

export const esquemaBorradorPulso = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'pulso.errores.fechaInvalida'),
  estado: z.enum(ESTADOS_PULSO),
  intensidad: z
    .number()
    .int()
    .min(1, 'pulso.errores.intensidadInvalida')
    .max(5, 'pulso.errores.intensidadInvalida')
    .nullable(),
  nota: z.string().trim().max(2000, 'pulso.errores.notaLarga'),
});

/**
 * Acompañamiento que se ofrece según el estado.
 *
 * Son **claves de i18n**, no texto: lo que se muestra pasa por traducción y
 * por revisión, como todo lo que lee el usuario. Y son cuatro cosas fijas por
 * estado —lectura, reflexión, oración y acción— porque el Documento 6 lo pide
 * así y porque una respuesta que varía cada día invita a volver a mirar, que
 * es justo lo que no se busca.
 */
export interface Acompanamiento {
  readonly claveLectura: string;
  readonly claveReflexion: string;
  readonly claveOracion: string;
  readonly claveAccion: string;
  /**
   * Recordar que hablar con alguien ayuda.
   *
   * No es Modo Crisis —eso lo decide el servicio de IA sobre lo que la
   * persona escribe, no sobre un botón que pulsó—. Es una sugerencia
   * tranquila, sin alarma y sin diagnóstico.
   */
  readonly sugerirHablarConAlguien: boolean;
}

export function acompanamientoDe(estado: EstadoPulso): Acompanamiento {
  return {
    claveLectura: `pulso.acompanamiento.${estado}.lectura`,
    claveReflexion: `pulso.acompanamiento.${estado}.reflexion`,
    claveOracion: `pulso.acompanamiento.${estado}.oracion`,
    claveAccion: `pulso.acompanamiento.${estado}.accion`,
    sugerirHablarConAlguien: esDificil(estado),
  };
}

/** Día de hoy en formato `AAAA-MM-DD`, según el reloj que se le pase. */
export const fechaDeHoy = (ahora: Date = new Date()): string =>
  `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}`;
