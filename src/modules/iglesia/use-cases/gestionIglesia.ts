// Casos de uso de Iglesia y comunidad.
//
// La regla que gobierna todo el archivo: **compartir es crear una copia
// cifrada para alguien, nunca conceder acceso a lo propio.** Por eso aquí se
// sella el contenido antes de subirlo y nunca se envía un identificador que
// abra otra cosa.
//
// Dos consecuencias prácticas:
//
//   · Compartir con un grupo de diez crea diez sobres. Es más filas y menos
//     formas de equivocarse que una clave de grupo que habría que rotar cada
//     vez que alguien se marcha.
//   · Si falta la clave pública de alguien, **no se comparte con esa persona
//     y se dice**. Nunca se degrada a «subirlo sin cifrar para ese»: una
//     compartición a medias es una fuga.
import { ErrorApp } from '@shared/errores/erroresApp';
import {
  contextoDeComparticion,
  derivarParDeCompartir,
  sellarPara,
  type ParDeClavesComparticion,
} from '@shared/services/crypto/comparticion';
import type {
  FilaComparticion,
  FilaEvento,
  FilaGrupo,
  FilaIglesia,
  FilaMembresia,
  FilaMentoria,
  RepositorioIglesia,
} from '@shared/services/supabase/repositorioIglesia';
import type { RepositorioClavesComparticion } from '@shared/services/supabase/repositorioClavesComparticion';

import {
  esquemaCodigoIglesia,
  PERMISOS_MENTOR,
  ROLES_IGLESIA,
  TIPOS_GRUPO,
  type Comparticion,
  type Evento,
  type Grupo,
  type Iglesia,
  type Membresia,
  type Mentoria,
  type PermisoMentor,
  type RolIglesia,
  type TipoGrupo,
} from '../models/iglesia';

function errorApp(codigo: string, claveMensaje: string): ErrorApp {
  return new ErrorApp({ codigo, categoria: 'validacion', claveMensaje, puedeReintentarse: false });
}

const esRol = (valor: string): valor is RolIglesia =>
  (ROLES_IGLESIA as readonly string[]).includes(valor);
const esTipoGrupo = (valor: string): valor is TipoGrupo =>
  (TIPOS_GRUPO as readonly string[]).includes(valor);

export const aIglesia = (fila: FilaIglesia): Iglesia => ({
  id: fila.id,
  nombre: fila.name,
  slug: fila.slug,
  descripcion: fila.description,
  ciudad: fila.city,
  pais: fila.country_code,
});

export const aMembresia = (fila: FilaMembresia): Membresia => ({
  id: fila.id,
  iglesiaId: fila.church_id,
  usuarioId: fila.user_id,
  rol: esRol(fila.role) ? fila.role : 'visitor',
  estado:
    fila.membership_status === 'active' ||
    fila.membership_status === 'pending' ||
    fila.membership_status === 'inactive' ||
    fila.membership_status === 'left'
      ? fila.membership_status
      : 'pending',
  desde: fila.joined_at,
});

export const aGrupo = (fila: FilaGrupo): Grupo => ({
  id: fila.id,
  iglesiaId: fila.church_id,
  nombre: fila.name,
  descripcion: fila.description,
  tipo: esTipoGrupo(fila.group_type) ? fila.group_type : 'grupo',
});

export const aEvento = (fila: FilaEvento, inscrito: boolean): Evento => ({
  id: fila.id,
  iglesiaId: fila.church_id,
  titulo: fila.title,
  descripcion: fila.description,
  lugar: fila.location,
  comienzaEn: fila.starts_at,
  terminaEn: fila.ends_at,
  aforo: fila.capacity,
  requiereInscripcion: fila.registration_required,
  estado: fila.status === 'cancelled' || fila.status === 'finished' ? fila.status : 'scheduled',
  inscrito,
});

/** Solo se reconocen los permisos del modelo. Lo demás se descarta. */
export function aMentoria(fila: FilaMentoria): Mentoria {
  const permisos = PERMISOS_MENTOR.filter((permiso) => fila.permissions[permiso] === true);
  return {
    id: fila.id,
    mentorId: fila.mentor_user_id,
    acompanadoId: fila.mentee_user_id,
    estado:
      fila.status === 'active' || fila.status === 'ended' || fila.status === 'rejected'
        ? fila.status
        : 'pending',
    permisos,
  };
}

export function aComparticion(fila: FilaComparticion): Comparticion {
  const destino =
    fila.recipient_user_id !== null
      ? ({ tipo: 'persona', id: fila.recipient_user_id } as const)
      : fila.group_id !== null
        ? ({ tipo: 'grupo', id: fila.group_id } as const)
        : ({ tipo: 'iglesia', id: fila.church_id ?? '' } as const);

  return {
    id: fila.id,
    peticionId: fila.prayer_id,
    destino,
    caducaEn: fila.expires_at,
    revocadaEn: fila.revoked_at,
  };
}

// ── Pertenencia ──────────────────────────────────────────────────────────

export interface IglesiaConRol {
  readonly iglesia: Iglesia;
  readonly membresia: Membresia;
}

export async function misIglesias(
  repositorio: RepositorioIglesia,
  usuarioId: string,
): Promise<readonly IglesiaConRol[]> {
  const membresias = (await repositorio.misMembresias(usuarioId))
    .map(aMembresia)
    .filter((membresia) => membresia.estado !== 'left');

  const iglesias = await repositorio.iglesiasPorId(
    membresias.map((membresia) => membresia.iglesiaId),
  );
  const porId = new Map(iglesias.map((fila) => [fila.id, aIglesia(fila)]));

  return membresias
    .map((membresia) => {
      const iglesia = porId.get(membresia.iglesiaId);
      return iglesia === undefined ? null : { iglesia, membresia };
    })
    .filter((entrada): entrada is IglesiaConRol => entrada !== null);
}

export async function buscarIglesia(
  repositorio: RepositorioIglesia,
  codigo: string,
): Promise<Iglesia | null> {
  const validado = esquemaCodigoIglesia.safeParse(codigo);
  if (!validado.success) {
    throw errorApp('CODIGO_IGLESIA_INVALIDO', 'iglesia.errores.codigoInvalido');
  }
  const fila = await repositorio.buscarPorCodigo(validado.data);
  return fila === null ? null : aIglesia(fila);
}

/**
 * Solicita entrar.
 *
 * Queda pendiente: unirse no es unilateral y el rol lo asigna el liderazgo.
 * Si el cliente pudiera ponerse `active`, cualquiera se declararía miembro de
 * cualquier iglesia.
 */
export async function solicitarIngreso(
  repositorio: RepositorioIglesia,
  parametros: { readonly iglesiaId: string; readonly usuarioId: string },
): Promise<Membresia> {
  return aMembresia(await repositorio.solicitarIngreso(parametros));
}

/** Abandonar. Es un derecho, no una petición: no necesita permiso de nadie. */
export async function abandonarIglesia(
  repositorio: RepositorioIglesia,
  parametros: { readonly membresiaId: string; readonly usuarioId: string },
): Promise<void> {
  await repositorio.abandonar(parametros);
}

// ── Vida institucional ───────────────────────────────────────────────────

export async function gruposDe(
  repositorio: RepositorioIglesia,
  iglesiaId: string,
): Promise<readonly Grupo[]> {
  return (await repositorio.grupos(iglesiaId)).map(aGrupo);
}

export async function eventosDe(
  repositorio: RepositorioIglesia,
  parametros: { readonly iglesiaId: string; readonly usuarioId: string },
): Promise<readonly Evento[]> {
  const [eventos, inscripciones] = await Promise.all([
    repositorio.eventos(parametros.iglesiaId),
    repositorio.misInscripciones(parametros.usuarioId),
  ]);
  const inscrito = new Set(inscripciones.map((fila) => fila.event_id));
  return eventos.map((fila) => aEvento(fila, inscrito.has(fila.id)));
}

export async function alternarInscripcion(
  repositorio: RepositorioIglesia,
  parametros: {
    readonly eventoId: string;
    readonly usuarioId: string;
    readonly inscrito: boolean;
  },
): Promise<void> {
  if (parametros.inscrito) {
    await repositorio.anularInscripcion(parametros);
  } else {
    await repositorio.inscribirse(parametros);
  }
}

// ── Mentorías ────────────────────────────────────────────────────────────

export async function misMentorias(
  repositorio: RepositorioIglesia,
  usuarioId: string,
): Promise<readonly Mentoria[]> {
  return (await repositorio.mentorias(usuarioId)).map(aMentoria);
}

export async function terminarMentoria(
  repositorio: RepositorioIglesia,
  parametros: { readonly mentoriaId: string; readonly usuarioId: string },
): Promise<void> {
  await repositorio.terminarMentoria(parametros);
}

/** Permisos que un mentor podría llegar a tener. La lista es cerrada. */
export const permisosPosibles = (): readonly PermisoMentor[] => PERMISOS_MENTOR;

// ── Compartir una petición ───────────────────────────────────────────────

export interface DestinatarioComparticion {
  readonly usuarioId: string;
  readonly publicaBase64: string | null;
}

export interface ResultadoComparticion {
  readonly compartidas: readonly Comparticion[];
  /** Con quién no se pudo, por no tener clave publicada. Se dice, no se oculta. */
  readonly sinClavePublica: readonly string[];
}

/**
 * Comparte una petición con un conjunto de personas.
 *
 * Un sobre por persona (decisión 3 del servicio de compartición). El
 * contenido se sella aquí; el repositorio nunca ve texto en claro.
 */
export async function compartirPeticion(
  repositorio: RepositorioIglesia,
  parametros: {
    readonly usuarioId: string;
    readonly peticionId: string;
    readonly contenido: { readonly titulo: string; readonly detalle: string };
    readonly destinatarios: readonly DestinatarioComparticion[];
    readonly caducaEn?: string | null;
  },
): Promise<ResultadoComparticion> {
  if (parametros.destinatarios.length === 0) {
    throw errorApp('SIN_DESTINATARIOS', 'iglesia.errores.sinDestinatarios');
  }

  const contexto = contextoDeComparticion({
    peticionId: parametros.peticionId,
    propietarioId: parametros.usuarioId,
  });
  const contenido = JSON.stringify(parametros.contenido);

  const compartidas: Comparticion[] = [];
  const sinClavePublica: string[] = [];

  for (const destinatario of parametros.destinatarios) {
    if (destinatario.publicaBase64 === null) {
      // Nunca se degrada a subirlo sin cifrar: eso sería una fuga con forma
      // de compatibilidad.
      sinClavePublica.push(destinatario.usuarioId);
      continue;
    }

    const sobre = sellarPara({
      publicaDestinoBase64: destinatario.publicaBase64,
      contenido,
      datosAsociados: contexto,
    });

    const fila = await repositorio.compartir({
      peticionId: parametros.peticionId,
      usuarioId: parametros.usuarioId,
      destino: { tipo: 'persona', id: destinatario.usuarioId },
      cargaCifrada: sobre.criptogramaBase64,
      // La pública efímera viaja aquí: sin ella el sobre no se abre, y no es
      // secreta.
      claveEnvuelta: sobre.efimeraPublicaBase64,
      nonce: sobre.nonceBase64,
      ...(parametros.caducaEn === undefined ? {} : { caducaEn: parametros.caducaEn }),
    });

    compartidas.push(aComparticion(fila));
  }

  return { compartidas, sinClavePublica };
}

export async function comparticionesDe(
  repositorio: RepositorioIglesia,
  parametros: { readonly peticionId: string; readonly usuarioId: string },
): Promise<readonly Comparticion[]> {
  return (await repositorio.comparticionesDe(parametros)).map(aComparticion);
}

/** Revocar. Corta el acceso ya, sin esperar a ninguna caducidad. */
export async function revocarComparticion(
  repositorio: RepositorioIglesia,
  parametros: { readonly comparticionId: string; readonly usuarioId: string },
): Promise<void> {
  await repositorio.revocar(parametros);
}

/**
 * Publica la clave pública de compartición del usuario.
 *
 * Se llama al abrir sesión. Sin ella nadie puede sellarle nada, y es idempotente:
 * la clave se deriva de la maestra, así que siempre es la misma.
 */
export async function publicarClaveDeCompartir(
  repositorio: RepositorioClavesComparticion,
  parametros: { readonly usuarioId: string; readonly claveMaestra: Uint8Array },
): Promise<ParDeClavesComparticion> {
  const par = derivarParDeCompartir(parametros.claveMaestra);
  await repositorio.publicar({
    usuarioId: parametros.usuarioId,
    publicaBase64: par.publicaBase64,
  });
  return par;
}
