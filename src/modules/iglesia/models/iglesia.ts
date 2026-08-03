// Modelo del módulo Iglesia (Documento 8 y Documento 12, tablas 32 a 38).
//
// Todo lo de este archivo viaja en claro, y por eso importa lo que **no**
// está: no hay campo para el estado espiritual de un miembro, ni para notas
// del pastor sobre alguien, ni para estadísticas de participación personal.
// «Cuántos miembros están ansiosos» no es un dato que este modelo pueda
// representar, y esa imposibilidad es deliberada.
import { z } from 'zod';

/** Coincide con el enum `church_role` del esquema. */
export const ROLES_IGLESIA = [
  'visitor',
  'member',
  'mentor',
  'leader',
  'pastor',
  'administrator',
] as const;
export type RolIglesia = (typeof ROLES_IGLESIA)[number];

/** Roles que administran la vida institucional. Nunca leen nada privado. */
export const ROLES_LIDERAZGO: readonly RolIglesia[] = ['leader', 'pastor', 'administrator'];

export const ESTADOS_MEMBRESIA = ['pending', 'active', 'inactive', 'left'] as const;
export type EstadoMembresia = (typeof ESTADOS_MEMBRESIA)[number];

export const TIPOS_GRUPO = ['grupo', 'mentoria', 'discipulado', 'escuela', 'ministerio'] as const;
export type TipoGrupo = (typeof TIPOS_GRUPO)[number];

/** Niveles de `visibility_level`. El usuario elige en cada petición. */
export const NIVELES_COMPARTICION = ['private', 'trusted_person', 'group', 'church'] as const;
export type NivelComparticion = (typeof NIVELES_COMPARTICION)[number];

export interface Iglesia {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly descripcion: string | null;
  readonly ciudad: string | null;
  readonly pais: string | null;
}

export interface Membresia {
  readonly id: string;
  readonly iglesiaId: string;
  readonly usuarioId: string;
  readonly rol: RolIglesia;
  readonly estado: EstadoMembresia;
  readonly desde: string | null;
}

export interface Grupo {
  readonly id: string;
  readonly iglesiaId: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly tipo: TipoGrupo;
}

export interface Evento {
  readonly id: string;
  readonly iglesiaId: string;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly lugar: string | null;
  readonly comienzaEn: string;
  readonly terminaEn: string | null;
  readonly aforo: number | null;
  readonly requiereInscripcion: boolean;
  readonly estado: 'scheduled' | 'cancelled' | 'finished';
  /** Si el usuario actual está inscrito. Nunca dice quién más lo está. */
  readonly inscrito: boolean;
}

export interface Mentoria {
  readonly id: string;
  readonly mentorId: string;
  readonly acompanadoId: string;
  readonly estado: 'pending' | 'active' | 'ended' | 'rejected';
  /**
   * Qué información compartida alcanza el mentor.
   *
   * Es una lista cerrada a propósito. Un objeto libre invitaría a inventar
   * permisos que ninguna política respalda, y alguien acabaría creyendo que
   * `{diario: true}` significa algo. No significa nada: no existe política
   * que permita a un mentor leer el diario.
   */
  readonly permisos: readonly PermisoMentor[];
}

export const PERMISOS_MENTOR = ['oracionesCompartidas', 'objetivosCompartidos'] as const;
export type PermisoMentor = (typeof PERMISOS_MENTOR)[number];

export interface Comparticion {
  readonly id: string;
  readonly peticionId: string;
  readonly destino:
    | { readonly tipo: 'persona'; readonly id: string }
    | { readonly tipo: 'grupo'; readonly id: string }
    | { readonly tipo: 'iglesia'; readonly id: string };
  readonly caducaEn: string | null;
  readonly revocadaEn: string | null;
}

/** Contenido que se cifra **para el destinatario**, no con la clave propia. */
export const esquemaContenidoCompartido = z.object({
  titulo: z.string().max(200),
  detalle: z.string(),
});

export const esquemaCodigoIglesia = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, 'iglesia.errores.codigoInvalido');

/** ¿Este rol administra la vida institucional? Nunca implica leer nada privado. */
export const esLiderazgo = (rol: RolIglesia): boolean => ROLES_LIDERAZGO.includes(rol);

/**
 * ¿Sigue vigente una compartición?
 *
 * La verdad la tiene la política de la base de datos; esta función existe
 * para que la pantalla no ofrezca revocar algo que ya caducó.
 */
export function estaVigente(comparticion: Comparticion, ahora: Date): boolean {
  if (comparticion.revocadaEn !== null) return false;
  if (comparticion.caducaEn === null) return true;
  return new Date(comparticion.caducaEn).getTime() > ahora.getTime();
}
