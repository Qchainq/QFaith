// Ciclo de vida de las claves del usuario. Servicio único: ningún módulo
// deriva ni guarda claves por su cuenta.
//
// El material sensible solo existe en memoria mientras la sesión está
// desbloqueada. Al bloquear se sobrescribe y se descarta.
import { ErrorApp } from '@shared/errores/erroresApp';

import { aBase64, desdeBase64, limpiar } from '../crypto/codificacion';
import {
  crearClaveContenido,
  crearSobreRecuperacion,
  abrirSobreRecuperacion,
  derivarClaves,
  desenvolverClaveContenido,
  envolverClaveContenido,
  generarClaveMaestra,
  generarFraseRecuperacion,
  type ClavesDerivadas,
} from '../crypto/servicioCriptografia';
import {
  DOMINIOS_CIFRADO,
  type ClaveContenido,
  type DominioCifrado,
  type ParametrosKdf,
  type SobreRecuperacion,
} from '../crypto/tipos';
import { borrarClaveMaestra, guardarClaveMaestra, leerClaveMaestra } from './almacenSeguro';

type ParametrosKdfSinSal = Omit<ParametrosKdf, 'salBase64'>;

/** Sobre de clave tal y como se sube a `user_key_envelopes`. */
export interface SobreClavePersistido {
  readonly keyId: string;
  readonly dominio: DominioCifrado;
  readonly envoltorioBase64: string;
  readonly nonceBase64: string;
  readonly keyType: 'contenido';
  readonly encryptionMethod: 'xchacha20poly1305';
  readonly keyVersion: number;
}

export interface MaterialCuentaNueva {
  /** Se muestra una sola vez al usuario y no se guarda en ningún sitio. */
  readonly fraseRecuperacion: string;
  readonly sobreRecuperacion: SobreRecuperacion;
  readonly sobresClaves: readonly SobreClavePersistido[];
}

interface SesionClaves {
  /** De quién es esta sesión. Sin esto no se puede detectar un cambio de cuenta. */
  readonly usuarioId: string;
  readonly claveMaestra: Uint8Array;
  readonly derivadas: ClavesDerivadas;
  readonly clavesPorDominio: Map<DominioCifrado, ClaveContenido>;
}

let sesion: SesionClaves | null = null;

function errorClaves(codigo: string, claveMensaje: string, causa?: unknown): ErrorApp {
  return new ErrorApp(
    { codigo, categoria: 'cifrado', claveMensaje, puedeReintentarse: false },
    causa,
  );
}

function abrirSesion(
  usuarioId: string,
  claveMaestra: Uint8Array,
  claves: readonly ClaveContenido[],
): SesionClaves {
  return {
    usuarioId,
    claveMaestra,
    derivadas: derivarClaves(claveMaestra),
    clavesPorDominio: new Map(claves.map((clave) => [clave.dominio, clave])),
  };
}

function persistirSobre(derivadas: ClavesDerivadas, clave: ClaveContenido): SobreClavePersistido {
  const envuelta = envolverClaveContenido(derivadas.claveEnvoltorio, clave);
  return {
    keyId: clave.keyId,
    dominio: clave.dominio,
    envoltorioBase64: envuelta.envoltorioBase64,
    nonceBase64: envuelta.nonceBase64,
    keyType: 'contenido',
    encryptionMethod: 'xchacha20poly1305',
    keyVersion: 1,
  };
}

/**
 * Prepara las claves de una cuenta nueva.
 *
 * Devuelve la frase de recuperación para mostrarla una única vez. A partir
 * de ese momento nadie, tampoco nosotros, puede volver a obtenerla.
 */
export async function inicializarCuenta(opciones: {
  readonly usuarioId: string;
  /**
   * Solo para pruebas y para endurecer los parámetros en el futuro. En
   * producción se omite y se usan los valores por defecto del núcleo.
   */
  readonly ajustesKdf?: ParametrosKdfSinSal;
}): Promise<MaterialCuentaNueva> {
  const claveMaestra = generarClaveMaestra();
  const derivadas = derivarClaves(claveMaestra);

  const claves = DOMINIOS_CIFRADO.map((dominio) => crearClaveContenido(dominio));
  const sobresClaves = claves.map((clave) => persistirSobre(derivadas, clave));

  const fraseRecuperacion = generarFraseRecuperacion();
  const sobreRecuperacion = await crearSobreRecuperacion({
    claveMaestra,
    frase: fraseRecuperacion,
    ...(opciones.ajustesKdf === undefined ? {} : { ajustesKdf: opciones.ajustesKdf }),
  });

  await guardarClaveMaestra({
    usuarioId: opciones.usuarioId,
    claveMaestraBase64: aBase64(claveMaestra),
  });
  sesion = abrirSesion(opciones.usuarioId, claveMaestra, claves);

  return { fraseRecuperacion, sobreRecuperacion, sobresClaves };
}

/**
 * Desbloquea la sesión con la clave que ya está en este dispositivo.
 *
 * Devuelve `false` cuando este dispositivo no puede abrir el contenido de
 * este usuario, que es el caso de una instalación nueva y también el de un
 * dispositivo que guarda la clave de **otra** cuenta. En ambos hay que
 * restaurar con la frase.
 *
 * La comprobación del usuario no es una formalidad. Sin ella, quien entrara
 * en un dispositivo donde otra persona dejó su sesión abierta cifraría su
 * contenido con las claves de esa otra persona, y ese contenido sería
 * ilegible al restaurar la cuenta en cualquier otro sitio.
 */
export async function desbloquear(
  usuarioId: string,
  sobresClaves: readonly SobreClavePersistido[],
): Promise<boolean> {
  if (sesion !== null) {
    if (sesion.usuarioId === usuarioId) {
      return true;
    }
    // Cambio de cuenta: el material de la anterior se descarta de memoria.
    bloquear();
  }

  const guardada = await leerClaveMaestra(usuarioId);
  if (guardada === null) {
    return false;
  }

  const claveMaestra = desdeBase64(guardada);
  const derivadas = derivarClaves(claveMaestra);
  const claves = desenvolverSobres(derivadas, sobresClaves);

  if (!abreAlgunSobre(sobresClaves, claves)) {
    // La clave guardada no abre nada de esta cuenta: el dispositivo quedó en
    // un estado incoherente. Restaurar con la frase lo arregla, y es mejor
    // camino que dejar a la persona con un error del que no puede salir.
    limpiar(claveMaestra);
    return false;
  }

  sesion = abrirSesion(usuarioId, claveMaestra, claves);
  return true;
}

/**
 * Desenvuelve los sobres que esta clave maestra puede abrir.
 *
 * Los que no abren se descartan en lugar de tumbar la operación entera. Una
 * cuenta acumula sobres a lo largo del tiempo —rotaciones de clave, material
 * de una generación anterior— y basta con uno que no corresponda para dejar a
 * la persona sin poder entrar a nada. Perder una clave de dominio hace
 * ilegible ese módulo; perder todas las demás por su culpa deja la cuenta
 * inservible.
 *
 * Que **ninguno** abra es distinto: ahí la clave maestra no es la de esta
 * cuenta, y eso sí tiene que fallar (lo comprueba quien llama).
 */
function desenvolverSobres(
  derivadas: ClavesDerivadas,
  sobres: readonly SobreClavePersistido[],
): ClaveContenido[] {
  const claves: ClaveContenido[] = [];
  for (const sobre of sobres) {
    try {
      claves.push(
        desenvolverClaveContenido(derivadas.claveEnvoltorio, {
          envoltorioBase64: sobre.envoltorioBase64,
          nonceBase64: sobre.nonceBase64,
          keyId: sobre.keyId,
          dominio: sobre.dominio,
        }),
      );
    } catch {
      // Nunca se registra cuál falló: el identificador de clave y el dominio
      // dirían qué módulos usa la persona (invariante 2).
      continue;
    }
  }
  return claves;
}

/**
 * ¿La clave maestra corresponde a esta cuenta?
 *
 * Si había sobres y ninguno abrió, no corresponde. Sin sobres no se puede
 * afirmar nada, y una cuenta recién creada está en ese caso.
 */
function abreAlgunSobre(
  sobres: readonly SobreClavePersistido[],
  abiertos: readonly ClaveContenido[],
): boolean {
  return sobres.length === 0 || abiertos.length > 0;
}

/**
 * Restaura la cuenta en un dispositivo nuevo a partir de la frase.
 *
 * Es el único camino por el que la clave maestra puede llegar a otro
 * dispositivo sin pasar en claro por el servidor.
 */
export async function restaurarConFrase(parametros: {
  readonly usuarioId: string;
  readonly frase: string;
  readonly sobreRecuperacion: SobreRecuperacion;
  readonly sobresClaves: readonly SobreClavePersistido[];
}): Promise<void> {
  const claveMaestra = await abrirSobreRecuperacion({
    sobre: parametros.sobreRecuperacion,
    frase: parametros.frase,
  });
  const derivadas = derivarClaves(claveMaestra);

  // Si no abre ni uno, la frase corresponde a otra cuenta: mejor fallar aquí
  // que dejar una sesión a medias. Que abran solo algunos es normal —una
  // cuenta acumula sobres de generaciones anteriores— y no impide entrar.
  const claves = desenvolverSobres(derivadas, parametros.sobresClaves);
  if (!abreAlgunSobre(parametros.sobresClaves, claves)) {
    limpiar(claveMaestra);
    throw errorClaves('FRASE_DE_OTRA_CUENTA', 'errores.cifrado.recuperacionFallida');
  }

  await guardarClaveMaestra({
    usuarioId: parametros.usuarioId,
    claveMaestraBase64: aBase64(claveMaestra),
  });
  sesion = abrirSesion(parametros.usuarioId, claveMaestra, claves);
}

/** Cierra la sesión y borra el material de memoria. */
export function bloquear(): void {
  if (sesion === null) {
    return;
  }
  limpiar(sesion.claveMaestra);
  limpiar(sesion.derivadas.claveEnvoltorio);
  limpiar(sesion.derivadas.claveHash);
  limpiar(sesion.derivadas.claveBaseLocal);
  sesion.clavesPorDominio.forEach((clave) => limpiar(clave.material));
  sesion.clavesPorDominio.clear();
  sesion = null;
}

/** Borra la clave de este dispositivo. Se usa al cerrar sesión. */
export async function olvidarDispositivo(): Promise<void> {
  bloquear();
  await borrarClaveMaestra();
}

export function estaDesbloqueada(): boolean {
  return sesion !== null;
}

function exigirSesion(): SesionClaves {
  if (sesion === null) {
    throw errorClaves('SESION_BLOQUEADA', 'errores.cifrado.claveNoCorresponde');
  }
  return sesion;
}

export function clavesDerivadas(): ClavesDerivadas {
  return exigirSesion().derivadas;
}

export function claveDeDominio(dominio: DominioCifrado): ClaveContenido {
  const clave = exigirSesion().clavesPorDominio.get(dominio);
  if (clave === undefined) {
    throw errorClaves('CLAVE_DOMINIO_AUSENTE', 'errores.cifrado.envoltorioInvalido');
  }
  return clave;
}

/**
 * Rota la clave de un dominio.
 *
 * La clave anterior sigue envuelta y disponible, así que los registros ya
 * escritos se siguen leyendo; los nuevos usan la clave nueva.
 */
export function rotarClaveDeDominio(dominio: DominioCifrado): SobreClavePersistido {
  const actual = exigirSesion();
  const nueva = crearClaveContenido(dominio);
  actual.clavesPorDominio.set(dominio, nueva);
  return persistirSobre(actual.derivadas, nueva);
}
