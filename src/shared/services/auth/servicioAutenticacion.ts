// Autenticación contra Supabase.
//
// Servicio único: ningún módulo llama al SDK por su cuenta. Aquí solo se
// gestiona **la identidad**, nunca las claves de cifrado. Son cosas
// separadas a propósito: la contraseña abre la cuenta en el servidor, pero
// no descifra nada. Quien se hiciera con ella vería sobres cifrados y poco
// más, porque la clave maestra ni sale del dispositivo ni se deriva de la
// contraseña.
import { ErrorApp } from '@shared/errores/erroresApp';
import type { UsuarioSesion } from '@shared/state/estadoSesion';

import { clienteSupabase } from '../supabase/clienteSupabase';

export interface Credenciales {
  readonly correo: string;
  readonly contrasena: string;
}

export interface ResultadoAcceso {
  readonly usuario: UsuarioSesion;
  /**
   * Falso cuando Supabase exige confirmar el correo antes de emitir sesión.
   * El alta no puede continuar: sin token no hay forma de subir los sobres
   * de claves.
   */
  readonly conSesion: boolean;
}

/**
 * Traduce el error del proveedor a uno nuestro.
 *
 * El mensaje original no se propaga: puede mencionar el correo y acabaría en
 * un log (invariante 2). Solo se conserva el código, que no identifica a
 * nadie.
 */
function errorAutenticacion(codigo: string, claveMensaje: string, causa?: unknown): ErrorApp {
  return new ErrorApp(
    {
      codigo,
      categoria: 'autenticacion',
      claveMensaje,
      puedeReintentarse: false,
      contexto: { codigoProveedor: codigo },
    },
    causa,
  );
}

interface ErrorProveedor {
  readonly code?: string | undefined;
}

function traducir(error: ErrorProveedor): ErrorApp {
  switch (error.code) {
    case 'invalid_credentials':
      return errorAutenticacion('CREDENCIALES_INVALIDAS', 'errores.cuenta.credencialesInvalidas');
    case 'user_already_exists':
    case 'email_exists':
      return errorAutenticacion('CORREO_YA_REGISTRADO', 'errores.cuenta.correoYaRegistrado');
    case 'weak_password':
      return errorAutenticacion('CONTRASENA_DEBIL', 'errores.cuenta.contrasenaDebil');
    case 'email_not_confirmed':
      return errorAutenticacion('CORREO_SIN_CONFIRMAR', 'errores.cuenta.correoSinConfirmar');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new ErrorApp({
        codigo: 'DEMASIADOS_INTENTOS',
        categoria: 'autenticacion',
        claveMensaje: 'errores.cuenta.demasiadosIntentos',
        puedeReintentarse: true,
      });
    default:
      return errorAutenticacion(
        error.code === undefined ? 'AUTENTICACION_FALLIDA' : error.code.toUpperCase(),
        'errores.autenticacion',
      );
  }
}

interface UsuarioProveedor {
  readonly id: string;
  readonly email?: string | undefined;
}

function comoUsuario(usuario: UsuarioProveedor, correoIntroducido: string): UsuarioSesion {
  return { id: usuario.id, correo: usuario.email ?? correoIntroducido };
}

export async function registrar(credenciales: Credenciales): Promise<ResultadoAcceso> {
  const { data, error } = await clienteSupabase().auth.signUp({
    email: credenciales.correo,
    password: credenciales.contrasena,
  });

  if (error !== null) {
    throw traducir(error);
  }
  if (data.user === null) {
    throw errorAutenticacion('ALTA_SIN_USUARIO', 'errores.autenticacion');
  }

  return {
    usuario: comoUsuario(data.user, credenciales.correo),
    conSesion: data.session !== null,
  };
}

export async function iniciarSesion(credenciales: Credenciales): Promise<ResultadoAcceso> {
  const { data, error } = await clienteSupabase().auth.signInWithPassword({
    email: credenciales.correo,
    password: credenciales.contrasena,
  });

  if (error !== null) {
    throw traducir(error);
  }
  if (data.user === null || data.session === null) {
    throw errorAutenticacion('SESION_NO_EMITIDA', 'errores.autenticacion');
  }

  return { usuario: comoUsuario(data.user, credenciales.correo), conSesion: true };
}

/**
 * Cierra la sesión en el servidor y borra la local.
 *
 * No toca la clave maestra: cerrar sesión no debe obligar a restaurar con la
 * frase al volver a entrar. Para borrar también las claves de este
 * dispositivo está `olvidarDispositivo()` del servicio de claves.
 */
export async function cerrarSesion(): Promise<void> {
  const { error } = await clienteSupabase().auth.signOut();
  if (error !== null) {
    throw traducir(error);
  }
}

/** Usuario de la sesión guardada, o null si no hay ninguna. */
export async function sesionActual(): Promise<UsuarioSesion | null> {
  const { data } = await clienteSupabase().auth.getSession();
  const usuario = data.session?.user;
  if (usuario === undefined || usuario === null) {
    return null;
  }
  return { id: usuario.id, correo: usuario.email ?? '' };
}

/**
 * Token de acceso vigente. El SDK lo refresca solo si está a punto de
 * caducar, así que esto es lo que debe llamar la capa REST antes de cada
 * petición.
 */
export async function tokenAcceso(): Promise<string | null> {
  const { data } = await clienteSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
