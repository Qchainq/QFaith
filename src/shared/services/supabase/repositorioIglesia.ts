// Iglesia, grupos, eventos, mentorías y comparticiones.
//
// Va por PostgREST y no por el motor de sincronización porque nada de esto es
// contenido cifrado del usuario: son datos institucionales compartidos, con
// una excepción que sí lo es y viaja cifrada, `prayer_shares`.
//
// **Este archivo nunca lee contenido privado.** No hay un método para traer
// el diario de un miembro, ni sus oraciones, ni su memorial. No existe porque
// no hay política que lo permita, y tenerlo aquí «por si acaso» sería el
// primer paso para que alguien la añada.
import type { ClienteRest } from './rest';

export interface FilaIglesia {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly city: string | null;
  readonly country_code: string | null;
}

export interface FilaMembresia {
  readonly id: string;
  readonly church_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly membership_status: string;
  readonly joined_at: string | null;
}

export interface FilaGrupo {
  readonly id: string;
  readonly church_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly group_type: string;
}

export interface FilaEvento {
  readonly id: string;
  readonly church_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly capacity: number | null;
  readonly registration_required: boolean;
  readonly status: string;
}

export interface FilaInscripcion {
  readonly id: string;
  readonly event_id: string;
  readonly user_id: string;
  readonly status: string;
}

export interface FilaMentoria {
  readonly id: string;
  readonly mentor_user_id: string;
  readonly mentee_user_id: string;
  readonly status: string;
  readonly permissions: Readonly<Record<string, unknown>>;
}

export interface FilaComparticion {
  readonly id: string;
  readonly prayer_id: string;
  readonly owner_user_id: string;
  readonly recipient_user_id: string | null;
  readonly group_id: string | null;
  readonly church_id: string | null;
  readonly encrypted_shared_payload: string;
  readonly encrypted_content_key: string;
  readonly nonce: string;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
}

const COL_IGLESIA = 'id,name,slug,description,city,country_code';
const COL_MEMBRESIA = 'id,church_id,user_id,role,membership_status,joined_at';
const COL_GRUPO = 'id,church_id,name,description,group_type';
const COL_EVENTO =
  'id,church_id,title,description,location,starts_at,ends_at,capacity,' +
  'registration_required,status';
const COL_INSCRIPCION = 'id,event_id,user_id,status';
const COL_MENTORIA = 'id,mentor_user_id,mentee_user_id,status,permissions';
const COL_COMPARTICION =
  'id,prayer_id,owner_user_id,recipient_user_id,group_id,church_id,' +
  'encrypted_shared_payload,encrypted_content_key,nonce,expires_at,revoked_at';

export function crearRepositorioIglesia(rest: ClienteRest) {
  async function exigir<T>(
    respuesta: { estado: number; filas: readonly T[]; codigo: string | null },
    contexto: string,
  ): Promise<readonly T[]> {
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, contexto);
    return respuesta.filas;
  }

  /** Busca una iglesia por su código. Es lo único visible sin pertenecer. */
  async function buscarPorCodigo(slug: string): Promise<FilaIglesia | null> {
    const respuesta = await rest.peticion<FilaIglesia>({
      metodo: 'GET',
      ruta: `/churches?slug=eq.${encodeURIComponent(slug)}&select=${COL_IGLESIA}`,
    });
    return (await exigir(respuesta, 'buscar:churches'))[0] ?? null;
  }

  async function misMembresias(usuarioId: string): Promise<readonly FilaMembresia[]> {
    const respuesta = await rest.peticion<FilaMembresia>({
      metodo: 'GET',
      ruta: `/church_memberships?user_id=eq.${usuarioId}&select=${COL_MEMBRESIA}`,
    });
    return exigir(respuesta, 'leer:church_memberships');
  }

  async function iglesiasPorId(ids: readonly string[]): Promise<readonly FilaIglesia[]> {
    if (ids.length === 0) return [];
    const respuesta = await rest.peticion<FilaIglesia>({
      metodo: 'GET',
      ruta: `/churches?id=in.(${ids.join(',')})&select=${COL_IGLESIA}`,
    });
    return exigir(respuesta, 'leer:churches');
  }

  /**
   * Solicita entrar en una iglesia.
   *
   * Entra como `pending`: unirse no es un acto unilateral, y un rol lo asigna
   * el liderazgo. Poner `active` desde el cliente permitiría a cualquiera
   * declararse miembro de cualquier iglesia.
   */
  async function solicitarIngreso(parametros: {
    readonly iglesiaId: string;
    readonly usuarioId: string;
  }): Promise<FilaMembresia> {
    const respuesta = await rest.peticion<FilaMembresia>({
      metodo: 'POST',
      ruta: `/church_memberships?on_conflict=church_id,user_id&select=${COL_MEMBRESIA}`,
      cuerpo: {
        church_id: parametros.iglesiaId,
        user_id: parametros.usuarioId,
        role: 'visitor',
        membership_status: 'pending',
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });

    const fila = (await exigir(respuesta, 'crear:church_memberships'))[0];
    if (fila === undefined) {
      throw rest.comoError(
        { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
        'crear:church_memberships',
      );
    }
    return fila;
  }

  /** Abandonar la iglesia. Es un derecho del usuario, sin permiso de nadie. */
  async function abandonar(parametros: {
    readonly membresiaId: string;
    readonly usuarioId: string;
  }): Promise<FilaMembresia | null> {
    const respuesta = await rest.peticion<FilaMembresia>({
      metodo: 'PATCH',
      ruta:
        `/church_memberships?id=eq.${parametros.membresiaId}` +
        `&user_id=eq.${parametros.usuarioId}&select=${COL_MEMBRESIA}`,
      cuerpo: { membership_status: 'left' },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'abandonar:church_memberships'))[0] ?? null;
  }

  async function grupos(iglesiaId: string): Promise<readonly FilaGrupo[]> {
    const respuesta = await rest.peticion<FilaGrupo>({
      metodo: 'GET',
      ruta: `/church_groups?church_id=eq.${iglesiaId}&status=eq.active&select=${COL_GRUPO}`,
    });
    return exigir(respuesta, 'leer:church_groups');
  }

  async function eventos(iglesiaId: string): Promise<readonly FilaEvento[]> {
    const respuesta = await rest.peticion<FilaEvento>({
      metodo: 'GET',
      ruta:
        `/church_events?church_id=eq.${iglesiaId}&status=eq.scheduled` +
        `&select=${COL_EVENTO}&order=starts_at.asc`,
    });
    return exigir(respuesta, 'leer:church_events');
  }

  async function misInscripciones(usuarioId: string): Promise<readonly FilaInscripcion[]> {
    const respuesta = await rest.peticion<FilaInscripcion>({
      metodo: 'GET',
      ruta:
        `/event_registrations?user_id=eq.${usuarioId}&status=eq.registered` +
        `&select=${COL_INSCRIPCION}`,
    });
    return exigir(respuesta, 'leer:event_registrations');
  }

  async function inscribirse(parametros: {
    readonly eventoId: string;
    readonly usuarioId: string;
  }): Promise<FilaInscripcion | null> {
    const respuesta = await rest.peticion<FilaInscripcion>({
      metodo: 'POST',
      ruta: `/event_registrations?on_conflict=event_id,user_id&select=${COL_INSCRIPCION}`,
      cuerpo: {
        event_id: parametros.eventoId,
        user_id: parametros.usuarioId,
        status: 'registered',
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    return (await exigir(respuesta, 'crear:event_registrations'))[0] ?? null;
  }

  async function anularInscripcion(parametros: {
    readonly eventoId: string;
    readonly usuarioId: string;
  }): Promise<FilaInscripcion | null> {
    const respuesta = await rest.peticion<FilaInscripcion>({
      metodo: 'PATCH',
      ruta:
        `/event_registrations?event_id=eq.${parametros.eventoId}` +
        `&user_id=eq.${parametros.usuarioId}&select=${COL_INSCRIPCION}`,
      cuerpo: { status: 'cancelled' },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'anular:event_registrations'))[0] ?? null;
  }

  async function mentorias(usuarioId: string): Promise<readonly FilaMentoria[]> {
    const respuesta = await rest.peticion<FilaMentoria>({
      metodo: 'GET',
      ruta:
        `/mentor_relationships?or=(mentor_user_id.eq.${usuarioId},mentee_user_id.eq.${usuarioId})` +
        `&select=${COL_MENTORIA}`,
    });
    return exigir(respuesta, 'leer:mentor_relationships');
  }

  /**
   * Termina una mentoría.
   *
   * El acompañado puede hacerlo siempre y sin explicaciones. Es el mismo
   * principio que revocar una compartición: lo que se concede voluntariamente
   * se retira igual de fácil.
   */
  async function terminarMentoria(parametros: {
    readonly mentoriaId: string;
    readonly usuarioId: string;
  }): Promise<FilaMentoria | null> {
    const respuesta = await rest.peticion<FilaMentoria>({
      metodo: 'PATCH',
      ruta:
        `/mentor_relationships?id=eq.${parametros.mentoriaId}` +
        `&or=(mentor_user_id.eq.${parametros.usuarioId},mentee_user_id.eq.${parametros.usuarioId})` +
        `&select=${COL_MENTORIA}`,
      cuerpo: { status: 'ended', ended_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'terminar:mentor_relationships'))[0] ?? null;
  }

  /**
   * Comparte una petición.
   *
   * El contenido llega **ya cifrado para el destinatario**: este archivo nunca
   * ve texto en claro. Lo que sube es una copia, no un permiso sobre la fila
   * original.
   */
  async function compartir(parametros: {
    readonly peticionId: string;
    readonly usuarioId: string;
    readonly destino:
      | { readonly tipo: 'persona'; readonly id: string }
      | { readonly tipo: 'grupo'; readonly id: string }
      | { readonly tipo: 'iglesia'; readonly id: string };
    readonly cargaCifrada: string;
    readonly claveEnvuelta: string;
    readonly nonce: string;
    readonly caducaEn?: string | null;
  }): Promise<FilaComparticion> {
    const destino =
      parametros.destino.tipo === 'persona'
        ? { recipient_user_id: parametros.destino.id }
        : parametros.destino.tipo === 'grupo'
          ? { group_id: parametros.destino.id }
          : { church_id: parametros.destino.id };

    const respuesta = await rest.peticion<FilaComparticion>({
      metodo: 'POST',
      ruta: `/prayer_shares?select=${COL_COMPARTICION}`,
      cuerpo: {
        prayer_id: parametros.peticionId,
        owner_user_id: parametros.usuarioId,
        ...destino,
        encrypted_shared_payload: parametros.cargaCifrada,
        encrypted_content_key: parametros.claveEnvuelta,
        nonce: parametros.nonce,
        ...(parametros.caducaEn === undefined || parametros.caducaEn === null
          ? {}
          : { expires_at: parametros.caducaEn }),
      },
      prefer: 'return=representation',
    });

    const fila = (await exigir(respuesta, 'crear:prayer_shares'))[0];
    if (fila === undefined) {
      throw rest.comoError(
        { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
        'crear:prayer_shares',
      );
    }
    return fila;
  }

  async function comparticionesDe(parametros: {
    readonly peticionId: string;
    readonly usuarioId: string;
  }): Promise<readonly FilaComparticion[]> {
    const respuesta = await rest.peticion<FilaComparticion>({
      metodo: 'GET',
      ruta:
        `/prayer_shares?prayer_id=eq.${parametros.peticionId}` +
        `&owner_user_id=eq.${parametros.usuarioId}&select=${COL_COMPARTICION}`,
    });
    return exigir(respuesta, 'leer:prayer_shares');
  }

  /** Revocar. Corta el acceso de inmediato, sin esperar a ninguna caducidad. */
  async function revocar(parametros: {
    readonly comparticionId: string;
    readonly usuarioId: string;
  }): Promise<FilaComparticion | null> {
    const respuesta = await rest.peticion<FilaComparticion>({
      metodo: 'PATCH',
      ruta:
        `/prayer_shares?id=eq.${parametros.comparticionId}` +
        `&owner_user_id=eq.${parametros.usuarioId}&select=${COL_COMPARTICION}`,
      cuerpo: { revoked_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    return (await exigir(respuesta, 'revocar:prayer_shares'))[0] ?? null;
  }

  /** Comparticiones recibidas y vigentes. Las filtra la política, no el cliente. */
  async function recibidas(): Promise<readonly FilaComparticion[]> {
    const respuesta = await rest.peticion<FilaComparticion>({
      metodo: 'GET',
      ruta: `/prayer_shares?revoked_at=is.null&select=${COL_COMPARTICION}`,
    });
    return exigir(respuesta, 'leer:prayer_shares');
  }

  return {
    buscarPorCodigo,
    misMembresias,
    iglesiasPorId,
    solicitarIngreso,
    abandonar,
    grupos,
    eventos,
    misInscripciones,
    inscribirse,
    anularInscripcion,
    mentorias,
    terminarMentoria,
    compartir,
    comparticionesDe,
    revocar,
    recibidas,
  };
}

export type RepositorioIglesia = ReturnType<typeof crearRepositorioIglesia>;
