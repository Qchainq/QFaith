// Sobres de claves y configuración de recuperación.
//
// Lo que se sube aquí es lo que permite recuperar la cuenta en un dispositivo
// nuevo, y **nada de ello es abrible por el servidor**: las claves de
// contenido viajan envueltas con una clave derivada de la maestra, y la
// maestra viaja envuelta con una clave derivada de la frase de recuperación.
// Sin la frase, todo esto es ruido.
//
// El envoltorio se guarda como un objeto compacto dentro de `encrypted_key`
// en lugar de repartirse en columnas nuevas. Tiene dos motivos: el nonce
// pertenece al criptograma y separarlos solo invita a desparejarlos, y el
// dominio (diario, oración, memorial…) revelaría al servidor qué módulos usa
// la persona si fuera una columna indexable. Dentro de un campo de texto que
// nadie consulta, no se puede filtrar por él.
import {
  DOMINIOS_CIFRADO,
  type DominioCifrado,
  type ParametrosKdf,
  type SobreRecuperacion,
} from '@shared/services/crypto/tipos';
import type { SobreClavePersistido } from '@shared/services/keys/servicioClaves';

import type { ClienteRest } from './rest';

/** Forma del objeto que va dentro de `encrypted_key`. Claves cortas: se repite. */
interface EnvoltorioSerializado {
  readonly d: string;
  readonly n: string;
  readonly k: string;
}

interface FilaSobreClave {
  readonly key_id: string;
  readonly encrypted_key: string;
  readonly encryption_method: string;
  readonly key_version: number;
}

interface FilaRecuperacion {
  readonly encrypted_recovery_envelope: string;
  readonly recovery_nonce: string;
  readonly kdf_algorithm: string;
  readonly kdf_parameters: Omit<ParametrosKdf, 'algoritmo'>;
  readonly recovery_version: number;
}

export interface MaterialRemoto {
  readonly sobresClaves: readonly SobreClavePersistido[];
  readonly sobreRecuperacion: SobreRecuperacion | null;
}

function serializar(sobre: SobreClavePersistido): string {
  const envoltorio: EnvoltorioSerializado = {
    d: sobre.dominio,
    n: sobre.nonceBase64,
    k: sobre.envoltorioBase64,
  };
  return JSON.stringify(envoltorio);
}

function deserializar(fila: FilaSobreClave): SobreClavePersistido | null {
  let envoltorio: EnvoltorioSerializado;
  try {
    envoltorio = JSON.parse(fila.encrypted_key) as EnvoltorioSerializado;
  } catch {
    // Una fila ilegible no debe tumbar la restauración entera: puede venir de
    // una versión anterior o estar dañada. Se descarta y el resto sigue.
    return null;
  }
  if (typeof envoltorio.d !== 'string' || typeof envoltorio.n !== 'string') {
    return null;
  }
  // El dominio forma parte de los datos autenticados del envoltorio: uno
  // desconocido no abriría nada y haría fallar la restauración entera. Se
  // comprueba aquí en lugar de confiar en el aserto de tipo.
  if (!(DOMINIOS_CIFRADO as readonly string[]).includes(envoltorio.d)) {
    return null;
  }
  return {
    keyId: fila.key_id,
    dominio: envoltorio.d as DominioCifrado,
    envoltorioBase64: envoltorio.k,
    nonceBase64: envoltorio.n,
    keyType: 'contenido',
    encryptionMethod: 'xchacha20poly1305',
    keyVersion: fila.key_version,
  };
}

/** Sube el material de una cuenta recién creada. */
export async function subirMaterialCuenta(parametros: {
  readonly rest: ClienteRest;
  readonly usuarioId: string;
  readonly sobresClaves: readonly SobreClavePersistido[];
  readonly sobreRecuperacion: SobreRecuperacion;
}): Promise<void> {
  const sobres = await parametros.rest.peticion({
    metodo: 'POST',
    ruta: '/user_key_envelopes',
    cuerpo: parametros.sobresClaves.map((sobre) => ({
      user_id: parametros.usuarioId,
      key_id: sobre.keyId,
      key_type: sobre.keyType,
      encrypted_key: serializar(sobre),
      encryption_method: sobre.encryptionMethod,
      key_version: sobre.keyVersion,
    })),
  });
  if (sobres.estado >= 400) {
    throw parametros.rest.comoError(sobres, 'subir:user_key_envelopes');
  }

  const { parametrosKdf } = parametros.sobreRecuperacion;
  const recuperacion = await parametros.rest.peticion({
    metodo: 'POST',
    ruta: '/recovery_configurations?on_conflict=user_id',
    cuerpo: {
      user_id: parametros.usuarioId,
      recovery_method: 'frase',
      encrypted_recovery_envelope: parametros.sobreRecuperacion.envoltorioBase64,
      recovery_nonce: parametros.sobreRecuperacion.nonceBase64,
      kdf_algorithm: parametrosKdf.algoritmo,
      // El servidor comprueba que no bajen del mínimo de OWASP. Un cliente
      // manipulado no puede debilitar el sobre de nadie.
      kdf_parameters: {
        memoriaKiB: parametrosKdf.memoriaKiB,
        iteraciones: parametrosKdf.iteraciones,
        paralelismo: parametrosKdf.paralelismo,
        salBase64: parametrosKdf.salBase64,
      },
      recovery_version: parametros.sobreRecuperacion.version,
    },
    prefer: 'resolution=merge-duplicates',
  });
  if (recuperacion.estado >= 400) {
    throw parametros.rest.comoError(recuperacion, 'subir:recovery_configurations');
  }
}

/**
 * Sube sobres sueltos, sin tocar la configuración de recuperación.
 *
 * Lo usa el arranque cuando la cuenta se encuentra con un dominio de cifrado
 * que no existía al crearla: la clave se genera en el dispositivo y su sobre
 * hay que guardarlo para que los demás dispositivos también lo tengan.
 *
 * No pasa por `subirMaterialCuenta` porque ahí la recuperación es obligatoria,
 * y aquí no hay nada que cambiar en ella: la clave maestra es la misma de
 * siempre y su sobre de recuperación sigue valiendo.
 */
export async function subirSobresDeClave(parametros: {
  readonly rest: ClienteRest;
  readonly usuarioId: string;
  readonly sobresClaves: readonly SobreClavePersistido[];
}): Promise<void> {
  if (parametros.sobresClaves.length === 0) return;

  const respuesta = await parametros.rest.peticion({
    metodo: 'POST',
    ruta: '/user_key_envelopes?on_conflict=user_id,key_id',
    cuerpo: parametros.sobresClaves.map((sobre) => ({
      user_id: parametros.usuarioId,
      key_id: sobre.keyId,
      key_type: sobre.keyType,
      encrypted_key: serializar(sobre),
      encryption_method: sobre.encryptionMethod,
      key_version: sobre.keyVersion,
    })),
    // Reintentar tras un corte no puede fallar por encontrarse lo de la vez
    // anterior.
    prefer: 'resolution=merge-duplicates',
  });
  if (respuesta.estado >= 400) {
    throw parametros.rest.comoError(respuesta, 'subir:user_key_envelopes');
  }
}

/**
 * Descarga el material de la cuenta.
 *
 * Es lo primero que hace un dispositivo nuevo: sin los sobres no puede
 * desenvolver ninguna clave de contenido, y sin la configuración de
 * recuperación la frase no sirve de nada.
 */
export async function descargarMaterialCuenta(parametros: {
  readonly rest: ClienteRest;
}): Promise<MaterialRemoto> {
  const [sobres, recuperacion] = await Promise.all([
    parametros.rest.peticion<FilaSobreClave>({
      metodo: 'GET',
      ruta:
        '/user_key_envelopes?key_type=eq.contenido' +
        '&select=key_id,encrypted_key,encryption_method,key_version&order=created_at.asc',
    }),
    parametros.rest.peticion<FilaRecuperacion>({
      metodo: 'GET',
      ruta:
        '/recovery_configurations?select=encrypted_recovery_envelope,recovery_nonce,' +
        'kdf_algorithm,kdf_parameters,recovery_version',
    }),
  ]);

  if (sobres.estado >= 400) {
    throw parametros.rest.comoError(sobres, 'descargar:user_key_envelopes');
  }
  if (recuperacion.estado >= 400) {
    throw parametros.rest.comoError(recuperacion, 'descargar:recovery_configurations');
  }

  // Un alta reintentada pudo dejar dos filas con la misma clave. Se queda la
  // primera: son idénticas, y desenvolver la misma clave dos veces solo
  // duplicaría trabajo.
  const porClave = new Map<string, SobreClavePersistido>();
  for (const fila of sobres.filas) {
    const sobre = deserializar(fila);
    if (sobre !== null && !porClave.has(sobre.keyId)) {
      porClave.set(sobre.keyId, sobre);
    }
  }

  const fila = recuperacion.filas[0];
  return {
    sobresClaves: [...porClave.values()],
    sobreRecuperacion:
      fila === undefined
        ? null
        : {
            envoltorioBase64: fila.encrypted_recovery_envelope,
            nonceBase64: fila.recovery_nonce,
            parametrosKdf: {
              algoritmo: 'argon2id',
              memoriaKiB: fila.kdf_parameters.memoriaKiB,
              iteraciones: fila.kdf_parameters.iteraciones,
              paralelismo: fila.kdf_parameters.paralelismo,
              salBase64: fila.kdf_parameters.salBase64,
            },
            version: fila.recovery_version,
          },
  };
}
