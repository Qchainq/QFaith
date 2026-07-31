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

function abrirSesion(claveMaestra: Uint8Array, claves: readonly ClaveContenido[]): SesionClaves {
  return {
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
export async function inicializarCuenta(opciones?: {
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
    ...(opciones?.ajustesKdf === undefined ? {} : { ajustesKdf: opciones.ajustesKdf }),
  });

  await guardarClaveMaestra(aBase64(claveMaestra));
  sesion = abrirSesion(claveMaestra, claves);

  return { fraseRecuperacion, sobreRecuperacion, sobresClaves };
}

/**
 * Desbloquea la sesión con la clave que ya está en este dispositivo.
 *
 * Devuelve `false` si el dispositivo no tiene clave, que es el caso de una
 * instalación nueva: ahí hay que restaurar con la frase.
 */
export async function desbloquear(sobresClaves: readonly SobreClavePersistido[]): Promise<boolean> {
  if (sesion !== null) {
    return true;
  }
  const guardada = await leerClaveMaestra();
  if (guardada === null) {
    return false;
  }

  const claveMaestra = desdeBase64(guardada);
  const derivadas = derivarClaves(claveMaestra);
  sesion = abrirSesion(claveMaestra, desenvolverSobres(derivadas, sobresClaves));
  return true;
}

function desenvolverSobres(
  derivadas: ClavesDerivadas,
  sobres: readonly SobreClavePersistido[],
): ClaveContenido[] {
  return sobres.map((sobre) =>
    desenvolverClaveContenido(derivadas.claveEnvoltorio, {
      envoltorioBase64: sobre.envoltorioBase64,
      nonceBase64: sobre.nonceBase64,
      keyId: sobre.keyId,
      dominio: sobre.dominio,
    }),
  );
}

/**
 * Restaura la cuenta en un dispositivo nuevo a partir de la frase.
 *
 * Es el único camino por el que la clave maestra puede llegar a otro
 * dispositivo sin pasar en claro por el servidor.
 */
export async function restaurarConFrase(parametros: {
  readonly frase: string;
  readonly sobreRecuperacion: SobreRecuperacion;
  readonly sobresClaves: readonly SobreClavePersistido[];
}): Promise<void> {
  const claveMaestra = await abrirSobreRecuperacion({
    sobre: parametros.sobreRecuperacion,
    frase: parametros.frase,
  });
  const derivadas = derivarClaves(claveMaestra);

  // Si los sobres no abren, la frase corresponde a otra cuenta: mejor fallar
  // aquí que dejar una sesión a medias.
  const claves = desenvolverSobres(derivadas, parametros.sobresClaves);

  await guardarClaveMaestra(aBase64(claveMaestra));
  sesion = abrirSesion(claveMaestra, claves);
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
