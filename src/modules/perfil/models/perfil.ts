// Modelo de Perfil y Configuración (Documento 11, módulos 9 y 10).
//
// Es el único módulo cuyo contenido viaja en claro, y eso obliga a ser
// estricto con qué cabe aquí: preferencias y datos de cuenta, nunca nada que
// la persona escribiera sobre su vida. Un campo de «notas» en esta tabla sería
// una fuga con forma de comodidad.
import { z } from 'zod';

export const TEMAS = ['system', 'light', 'dark'] as const;
export type Tema = (typeof TEMAS)[number];

export const IDIOMAS = ['es', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export interface Perfil {
  readonly id: string;
  readonly nombre: string | null;
  readonly idioma: Idioma;
  readonly zonaHoraria: string;
  readonly pais: string | null;
  readonly anoNacimiento: number | null;
  readonly onboardingCompletado: boolean;
}

export interface Ajustes {
  readonly tema: Tema;
  readonly escalaTexto: number;
  readonly notificaciones: boolean;
  /** Desactivada por defecto: privacidad por defecto (Documento 5). */
  readonly analitica: boolean;
  readonly bloqueoBiometrico: boolean;
  readonly segundosBloqueo: number;
  readonly respaldoEnNube: boolean;
  readonly descargasSoloWifi: boolean;
}

export type EstadoDispositivo = 'active' | 'revoked' | 'lost' | 'inactive';

export interface Dispositivo {
  readonly id: string;
  readonly nombre: string | null;
  readonly plataforma: string;
  readonly estado: EstadoDispositivo;
  readonly vistoEn: string | null;
  readonly revocadoEn: string | null;
  /** El dispositivo desde el que se está mirando. No se puede revocar solo. */
  readonly esEste: boolean;
}

export interface SolicitudEliminacion {
  readonly id: string;
  readonly solicitadaEn: string;
  readonly programadaPara: string;
}

/**
 * Días entre la solicitud de borrado y el borrado.
 *
 * Los mismos 30 días que la papelera (invariante 6). Un plazo distinto para
 * la cuenta y para su contenido solo serviría para confundir a quien intenta
 * entender qué le va a pasar a lo suyo.
 */
export const DIAS_DE_GRACIA = 30;

export const esquemaPerfil = z.object({
  nombre: z.string().trim().max(80, 'perfil.errores.nombreLargo').nullable(),
  idioma: z.enum(IDIOMAS),
  zonaHoraria: z.string().trim().min(1, 'perfil.errores.zonaHorariaVacia'),
  pais: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, 'perfil.errores.paisInvalido')
    .nullable(),
  anoNacimiento: z
    .number()
    .int()
    .min(1900, 'perfil.errores.anoInvalido')
    .max(new Date().getUTCFullYear(), 'perfil.errores.anoInvalido')
    .nullable(),
});

export type BorradorPerfil = z.infer<typeof esquemaPerfil>;

/** Días que faltan para el borrado, redondeando hacia arriba. */
export function diasHastaElBorrado(solicitud: SolicitudEliminacion, ahora: Date): number {
  const restante = new Date(solicitud.programadaPara).getTime() - ahora.getTime();
  return restante <= 0 ? 0 : Math.ceil(restante / 86_400_000);
}
