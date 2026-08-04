// Casos de uso del acceso a la cuenta.
//
// La pantalla no habla con repositorios ni con servicios de infraestructura
// (invariante 10): llama aquí. Y aquí se junta lo que en QFaith son dos cosas
// separadas a propósito:
//
//   · La **identidad**, que vive en el servidor y se abre con la contraseña.
//   · Las **claves**, que viven en el dispositivo y no se derivan de la
//     contraseña. Cambiarla no descifra ni pierde nada, y quien se hiciera
//     con ella vería sobres cerrados.
//
// El orden importa. Al crear una cuenta, las claves se generan **después** de
// tener sesión: si el servidor rechaza el alta a mitad, no queda una clave
// maestra huérfana en el dispositivo apuntando a una cuenta que no existe.
import { ErrorApp } from '@shared/errores/erroresApp';
import {
  cerrarSesion as cerrarSesionRemota,
  iniciarSesion as iniciarSesionRemota,
  registrar,
  sesionActual,
  tokenAcceso,
  type Credenciales,
} from '@shared/services/auth/servicioAutenticacion';
import {
  bloquear,
  completarClavesDeDominio,
  desbloquear,
  inicializarCuenta,
  olvidarDispositivo,
  restaurarConFrase,
} from '@shared/services/keys/servicioClaves';
import {
  descargarMaterialCuenta,
  subirMaterialCuenta,
  subirSobresDeClave,
} from '@shared/services/supabase/repositorioClaves';
import {
  asegurarDispositivo,
  identificadorDeInstalacion,
  type Plataforma,
} from '@shared/services/supabase/repositorioDispositivos';
import { crearClienteRest, type ClienteRest } from '@shared/services/supabase/rest';
import type { UsuarioSesion } from '@shared/state/estadoSesion';

/**
 * Qué debe hacer la interfaz a continuación.
 *
 * `mostrarFrase` solo aparece al crear una cuenta: es la única vez que la
 * frase existe fuera de la cabeza del usuario, y no se puede volver a
 * consultar.
 */
export type SiguientePaso =
  | {
      readonly tipo: 'listo';
      readonly usuario: UsuarioSesion;
      /** UUID del dispositivo, que la sincronización necesita para atribuir cambios. */
      readonly dispositivoId: string;
    }
  | {
      readonly tipo: 'mostrarFrase';
      readonly usuario: UsuarioSesion;
      readonly frase: string;
      readonly dispositivoId: string;
    }
  | { readonly tipo: 'restaurarConFrase'; readonly usuario: UsuarioSesion }
  | { readonly tipo: 'confirmarCorreo' }
  | { readonly tipo: 'sinSesion' };

export interface DependenciasAcceso {
  readonly plataforma: Plataforma;
  /** Inyectable para las pruebas. */
  readonly rest?: ClienteRest;
}

function clienteDe(dependencias: DependenciasAcceso): ClienteRest {
  return dependencias.rest ?? crearClienteRest({ proveerToken: tokenAcceso });
}

function errorAcceso(codigo: string, claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo,
    categoria: 'autenticacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

/** Da de alta el dispositivo y devuelve el UUID con el que sincronizará. */
export async function registrarDispositivo(
  dependencias: DependenciasAcceso,
  usuarioId: string,
): Promise<string> {
  return asegurarDispositivo({
    rest: clienteDe(dependencias),
    usuarioId,
    identificadorPublico: await identificadorDeInstalacion(),
    plataforma: dependencias.plataforma,
  });
}

/**
 * Crea una cuenta nueva.
 *
 * Si el proyecto exige confirmar el correo, no hay sesión y no se puede
 * continuar: sin token no se pueden subir los sobres, y generar las claves
 * aquí dejaría al usuario con una cuenta que no puede recuperar.
 */
export async function crearCuenta(
  dependencias: DependenciasAcceso,
  credenciales: Credenciales,
): Promise<SiguientePaso> {
  const alta = await registrar(credenciales);
  if (!alta.conSesion) {
    return { tipo: 'confirmarCorreo' };
  }

  const rest = clienteDe(dependencias);
  const material = await inicializarCuenta({ usuarioId: alta.usuario.id });

  try {
    await subirMaterialCuenta({
      rest,
      usuarioId: alta.usuario.id,
      sobresClaves: material.sobresClaves,
      sobreRecuperacion: material.sobreRecuperacion,
    });
  } catch (causa) {
    // Sin material en el servidor, la cuenta no se podría recuperar en otro
    // dispositivo. Es mejor deshacer las claves locales y que el usuario lo
    // intente otra vez que dejarle una cuenta a medias sin saberlo.
    await olvidarDispositivo();
    throw causa;
  }

  const dispositivoId = await registrarDispositivo(dependencias, alta.usuario.id);
  return {
    tipo: 'mostrarFrase',
    usuario: alta.usuario,
    frase: material.fraseRecuperacion,
    dispositivoId,
  };
}

/**
 * Entra con una cuenta existente.
 *
 * Si este dispositivo ya tiene la clave maestra, se desbloquea sin más. Si no
 * la tiene —instalación nueva, o el usuario cerró sesión y olvidó el
 * dispositivo— hace falta la frase: es el único camino por el que la clave
 * puede llegar aquí sin pasar en claro por el servidor.
 */
export async function entrarConCuenta(
  dependencias: DependenciasAcceso,
  credenciales: Credenciales,
): Promise<SiguientePaso> {
  const acceso = await iniciarSesionRemota(credenciales);
  const rest = clienteDe(dependencias);

  const material = await descargarMaterialCuenta({ rest });
  const abierta = await desbloquear(acceso.usuario.id, material.sobresClaves);
  if (abierta) await completarDominios(rest, acceso.usuario.id);

  const dispositivoId = await registrarDispositivo(dependencias, acceso.usuario.id);

  return abierta
    ? { tipo: 'listo', usuario: acceso.usuario, dispositivoId }
    : { tipo: 'restaurarConFrase', usuario: acceso.usuario };
}

/** Restaura las claves en este dispositivo a partir de la frase. */
export async function restaurarCuenta(
  dependencias: DependenciasAcceso,
  frase: string,
): Promise<SiguientePaso> {
  const usuario = await sesionActual();
  if (usuario === null) {
    return { tipo: 'sinSesion' };
  }

  const material = await descargarMaterialCuenta({ rest: clienteDe(dependencias) });
  if (material.sobreRecuperacion === null) {
    throw errorAcceso('SIN_CONFIGURACION_RECUPERACION', 'errores.cifrado.recuperacionFallida');
  }

  await restaurarConFrase({
    usuarioId: usuario.id,
    frase,
    sobreRecuperacion: material.sobreRecuperacion,
    sobresClaves: material.sobresClaves,
  });

  const dispositivoId = await registrarDispositivo(dependencias, usuario.id);
  await completarDominios(clienteDe(dependencias), usuario.id);
  return { tipo: 'listo', usuario, dispositivoId };
}

/**
 * Da a la cuenta las claves de los dominios que no tenía.
 *
 * QFaith añade módulos, y cada uno trae su dominio de cifrado. Una cuenta
 * creada antes no tiene sobre para el dominio nuevo, y sin él ese módulo no
 * puede escribir nada. La clave se crea aquí, en el dispositivo, porque
 * envolverla requiere la clave de envoltorio y esa nunca sale de aquí.
 *
 * **Un fallo al subir no impide entrar.** La sesión ya tiene la clave en
 * memoria, así que el módulo funciona igual; lo que queda pendiente es que los
 * demás dispositivos la reciban, y el arranque siguiente lo reintenta. Cortar
 * el acceso a la cuenta entera por esto sería peor que el problema.
 */
async function completarDominios(rest: ClienteRest, usuarioId: string): Promise<void> {
  const nuevos = completarClavesDeDominio();
  if (nuevos.length === 0) return;
  try {
    await subirSobresDeClave({ rest, usuarioId, sobresClaves: nuevos });
  } catch {
    // Nunca se registra qué dominio falló: diría qué módulos usa la persona
    // (invariante 2).
  }
}

/**
 * Decide a dónde ir al abrir la aplicación.
 *
 * No pide la contraseña si ya hay sesión guardada: lo que falta comprobar es
 * si el contenido privado se puede descifrar en este dispositivo.
 */
export async function reanudarSesion(dependencias: DependenciasAcceso): Promise<SiguientePaso> {
  const usuario = await sesionActual();
  if (usuario === null) {
    return { tipo: 'sinSesion' };
  }

  const rest = clienteDe(dependencias);
  const material = await descargarMaterialCuenta({ rest });
  const abierta = await desbloquear(usuario.id, material.sobresClaves);
  if (!abierta) {
    return { tipo: 'restaurarConFrase', usuario };
  }
  await completarDominios(rest, usuario.id);

  // Volver a darlo de alta es idempotente y además refresca `last_seen_at`,
  // que es lo que permite al usuario reconocer sus dispositivos activos.
  const dispositivoId = await registrarDispositivo(dependencias, usuario.id);
  return { tipo: 'listo', usuario, dispositivoId };
}

/**
 * Cierra la sesión sin borrar las claves de este dispositivo.
 *
 * Volver a entrar no debería obligar a escribir las 24 palabras, así que la
 * clave se queda en el almacén seguro. Lo que sí se descarta es el material
 * **en memoria**: dejarlo vivo significaría que el contenido privado sigue
 * descifrable en un dispositivo del que su dueño acaba de salir.
 *
 * Para borrar también la clave guardada está `olvidarEsteDispositivo`.
 */
export async function salir(): Promise<void> {
  bloquear();
  await cerrarSesionRemota();
}

/** Cierra sesión y borra la clave maestra de este dispositivo. */
export async function olvidarEsteDispositivo(): Promise<void> {
  await olvidarDispositivo();
  await cerrarSesionRemota();
}
