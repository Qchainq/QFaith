// Repositorio de archivos privados.
//
// Es el único repositorio con **dos cosas que sincronizar**: la ficha, que
// viaja por el motor como cualquier otro registro, y el blob cifrado, que va
// aparte porque no cabe en un sobre de texto.
//
// El orden en que ocurren las cosas es toda la lógica de este archivo, y no
// es negociable:
//
//   1. Se cifra en el dispositivo.
//   2. Se guarda el blob **en local**.
//   3. Se crea la ficha en local, con `upload_status = 'pending'`.
//   4. La subida ocurre después, cuando haya red.
//
// Adjuntar termina en el paso 3. Quien adjunta una foto en el sótano de una
// iglesia sin cobertura la ve adjuntada al instante (invariante 4), y si la
// aplicación se cierra antes de subirla, la foto sigue ahí.
//
// Invertir el orden —subir primero y guardar después— parecería más simple y
// perdería el archivo en cuanto fallara la red, que es precisamente cuando
// más falta hace no perderlo.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import {
  cifrar,
  cifrarBytes,
  crearClaveContenido,
  descifrar,
  descifrarBytes,
  desenvolverClaveContenido,
  envolverClaveContenido,
} from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type {
  AlmacenamientoLocal,
  AlmacenamientoRemoto,
} from '@shared/services/storage/puertoAlmacenamiento';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { ErrorApp } from '@shared/errores/erroresApp';

import {
  esEstadoSubida,
  esOrigenValido,
  esTipoAdmitido,
  esquemaContenidoArchivo,
  motivoDeRechazo,
  rutaEnCubo,
  type Archivo,
  type BorradorArchivo,
  type EstadoSubida,
  type OrigenArchivo,
} from '../models/archivo';

export const TIPO_ARCHIVO = 'private_media';

/** El dominio de cifrado al que pertenecen los archivos. */
const DOMINIO = 'medios';

export interface DependenciasRepositorioArchivos {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly remoto: AlmacenamientoRemoto;
  readonly local: AlmacenamientoLocal;
  /** Cifra el nombre del archivo, que es contenido privado como el resto. */
  readonly claveMedios: () => ClaveContenido;
  /** Envuelve la clave propia de cada archivo. */
  readonly claveEnvoltorio: () => Uint8Array;
  readonly claveHash: () => Uint8Array;
  readonly crearClaveArchivo?: () => ClaveContenido;
}

/**
 * Errores del módulo.
 *
 * No hay categoría «archivos» a propósito: un archivo que no pasa el filtro
 * es un problema de validación, y uno que no abre es un problema de cifrado.
 * Inventar una categoría por módulo haría inútil la clasificación.
 */
function errorArchivo(
  codigo: string,
  claveMensaje: string,
  categoria: 'validacion' | 'cifrado' = 'validacion',
  causa?: unknown,
): ErrorApp {
  return new ErrorApp({ codigo, categoria, claveMensaje, puedeReintentarse: false }, causa);
}

export function crearRepositorioArchivos(dependencias: DependenciasRepositorioArchivos) {
  const { motor, almacen, usuarioId, remoto, local } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_ARCHIVO,
    entidadId,
  });

  // Cada archivo estrena clave. Ver decisión 2 de la migración 0016:
  // compartir una foto no puede obligar a entregar la clave de todas.
  const crearClaveArchivo = dependencias.crearClaveArchivo ?? (() => crearClaveContenido(DOMINIO));

  function aArchivo(registro: RegistroLocal): Archivo | null {
    const { metadatos } = registro;
    if (!esOrigenValido(metadatos.owner_type) || typeof metadatos.owner_id !== 'string') {
      return null;
    }
    if (!esTipoAdmitido(metadatos.mime_type)) return null;

    let nombre = '';
    // Un nombre que no abre no invalida el archivo: los bytes siguen siendo
    // recuperables y es más importante poder abrirlos que saber cómo se
    // llamaban.
    if (registro.sobre.encryptedPayload.length > 0) {
      try {
        const contenido = esquemaContenidoArchivo.safeParse(
          JSON.parse(
            descifrar({
              sobre: registro.sobre,
              clave: dependencias.claveMedios(),
              vinculo: vinculo(registro.id),
            }),
          ),
        );
        nombre = contenido.success ? contenido.data.nombre : '';
      } catch {
        nombre = '';
      }
    }

    const tamano = metadatos.file_size_bytes;
    const estado = metadatos.upload_status;

    return {
      id: registro.id,
      origen: metadatos.owner_type,
      origenId: metadatos.owner_id,
      tipo: metadatos.mime_type,
      nombre,
      tamanoBytes: typeof tamano === 'number' ? tamano : 0,
      estadoSubida: esEstadoSubida(estado) ? estado : 'pending',
      creadoEn: registro.creadoEn,
    };
  }

  /**
   * Fichas vigentes.
   *
   * `listar` ya deja fuera lo que está en la papelera, y de ahí sale gratis
   * algo que importa: un archivo retirado no se sube. Subirlo sería gastar
   * los datos de la persona en algo que la purga va a borrar.
   */
  async function listarTodos(): Promise<readonly RegistroLocal[]> {
    return almacen.listar(TIPO_ARCHIVO);
  }

  /** Adjuntos de un registro, del más antiguo al más reciente. */
  async function deOrigen(origen: OrigenArchivo, origenId: string): Promise<readonly Archivo[]> {
    const registros = await listarTodos();
    return registros
      .filter(
        (registro) =>
          registro.metadatos.owner_type === origen && registro.metadatos.owner_id === origenId,
      )
      .map(aArchivo)
      .filter((archivo): archivo is Archivo => archivo !== null)
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  }

  /**
   * Adjunta un archivo. **No toca la red.**
   *
   * Devuelve en cuanto el archivo está cifrado y guardado en local; la subida
   * la hace `subirPendientes` cuando haya conexión.
   */
  async function adjuntar(borrador: BorradorArchivo): Promise<Archivo> {
    const rechazo = motivoDeRechazo(borrador);
    if (rechazo !== null) {
      // El mensaje no menciona el nombre del archivo (invariante 2).
      throw errorArchivo(`ARCHIVO_${rechazo.toUpperCase()}`, `errores.archivos.${rechazo}`);
    }

    const id = generarUuid();
    const claveArchivo = crearClaveArchivo();

    const sobreArchivo = cifrarBytes({
      contenido: borrador.contenido,
      clave: claveArchivo,
      claveHash: dependencias.claveHash(),
      vinculo: vinculo(id),
    });

    // El mismo archivo adjuntado dos veces al mismo registro es el mismo
    // adjunto. La 0016 lo prohíbe con una restricción única, así que sin esto
    // el segundo se cifraría, se guardaría en local y solo reventaría al
    // sincronizar: un error incomprensible, mucho después y lejos de aquí.
    //
    // El hash lleva clave, de modo que esto solo reconoce duplicados dentro
    // de la propia cuenta. Es exactamente el alcance que se quiere.
    const yaEstaba = (await listarTodos()).find(
      (registro) =>
        registro.metadatos.owner_type === borrador.origen &&
        registro.metadatos.owner_id === borrador.origenId &&
        registro.metadatos.content_hash === sobreArchivo.contentHash,
    );
    if (yaEstaba !== undefined) {
      const existente = aArchivo(yaEstaba);
      if (existente !== null) return existente;
    }

    // La clave del archivo se guarda envuelta, nunca en claro. El envoltorio
    // lleva su propio nonce dentro, porque `file_nonce` es el del contenido.
    const envuelta = envolverClaveContenido(dependencias.claveEnvoltorio(), claveArchivo);

    const ruta = rutaEnCubo(usuarioId, id);
    // Paso 2: el blob antes que la ficha. Si el proceso muere entre medias,
    // sobra un blob sin ficha —que la purga recoge— en lugar de faltar el
    // archivo que la ficha promete.
    await local.escribir({ ruta, contenido: sobreArchivo.criptograma });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_ARCHIVO,
      sobre: cifrar({
        contenido: JSON.stringify(esquemaContenidoArchivo.parse({ nombre: borrador.nombre })),
        clave: dependencias.claveMedios(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(id),
      }),
      metadatos: {
        owner_type: borrador.origen,
        owner_id: borrador.origenId,
        storage_path: ruta,
        encrypted_file_key: JSON.stringify(envuelta),
        file_nonce: sobreArchivo.nonce,
        mime_type: borrador.tipo,
        // El tamaño es el del original, no el del criptograma: es lo que se
        // le enseña a la persona y lo que cuenta para su cuota.
        file_size_bytes: borrador.contenido.length,
        content_hash: sobreArchivo.contentHash,
        upload_status: 'pending',
        key_id: claveArchivo.keyId,
        encryption_version: sobreArchivo.encryptionVersion,
      },
    });

    const archivo = aArchivo(registro);
    if (archivo === null) {
      throw errorArchivo('ARCHIVO_ILEGIBLE', 'errores.archivos.ilegible', 'cifrado');
    }
    return archivo;
  }

  async function marcarEstado(registro: RegistroLocal, estado: EstadoSubida): Promise<void> {
    await motor.registrarCambioLocal({
      id: registro.id,
      tipoEntidad: TIPO_ARCHIVO,
      sobre: registro.sobre,
      metadatos: { ...registro.metadatos, upload_status: estado },
    });
  }

  /**
   * Sube lo que quedó pendiente.
   *
   * Nunca lanza hacia arriba: la llama el mismo temporizador que sincroniza,
   * y un fallo de red no puede tumbar nada. Devuelve el recuento para que la
   * pantalla pueda decir cuántos quedan.
   */
  async function subirPendientes(): Promise<{ subidos: number; fallidos: number }> {
    const registros = await listarTodos();
    let subidos = 0;
    let fallidos = 0;

    for (const registro of registros) {
      const estado = registro.metadatos.upload_status;
      const ruta = registro.metadatos.storage_path;
      if (estado === 'uploaded' || typeof ruta !== 'string') continue;

      const contenido = await local.leer(ruta);
      if (contenido === null) {
        // El blob local desapareció —caché limpiada por el sistema, por
        // ejemplo— y ya no está en ningún sitio. Queda marcado para que la
        // pantalla lo pueda decir en vez de fingir que todo va bien.
        await marcarEstado(registro, 'failed');
        fallidos += 1;
        continue;
      }

      try {
        await remoto.subir({ ruta, contenido });
        await marcarEstado(registro, 'uploaded');
        subidos += 1;
      } catch {
        // Se deja en `pending`, no en `failed`: el intento siguiente lo
        // recogerá. `failed` es para lo que no tiene arreglo solo.
        fallidos += 1;
      }
    }

    return { subidos, fallidos };
  }

  /**
   * Devuelve los bytes en claro.
   *
   * Busca primero en local; si no está, lo descarga. Comprueba el `content_hash`
   * antes de devolver nada: un blob cambiado en el servidor debe fallar de
   * forma segura, no producir una imagen rara.
   */
  async function abrir(id: string): Promise<Uint8Array> {
    const registro = await obtenerVigente(almacen, TIPO_ARCHIVO, id);
    if (registro === null) {
      throw errorArchivo('ARCHIVO_NO_ENCONTRADO', 'errores.archivos.noEncontrado');
    }

    const { metadatos } = registro;
    const ruta = metadatos.storage_path;
    const envueltaBruta = metadatos.encrypted_file_key;
    const nonce = metadatos.file_nonce;
    const keyId = metadatos.key_id;
    const version = metadatos.encryption_version;

    if (
      typeof ruta !== 'string' ||
      typeof envueltaBruta !== 'string' ||
      typeof nonce !== 'string' ||
      typeof keyId !== 'string'
    ) {
      throw errorArchivo('ARCHIVO_ILEGIBLE', 'errores.archivos.ilegible', 'cifrado');
    }

    let criptograma = await local.leer(ruta);
    if (criptograma === null) {
      criptograma = await remoto.descargar(ruta);
      // Se guarda para no volver a bajarlo. Si esto falla —disco lleno— no se
      // pierde nada: se ha descargado igual.
      await local.escribir({ ruta, contenido: criptograma }).catch(() => undefined);
    }

    let envuelta: { envoltorioBase64: string; nonceBase64: string };
    try {
      envuelta = JSON.parse(envueltaBruta) as typeof envuelta;
    } catch (causa) {
      throw errorArchivo('ARCHIVO_ILEGIBLE', 'errores.archivos.ilegible', 'cifrado', causa);
    }

    const clave = desenvolverClaveContenido(dependencias.claveEnvoltorio(), {
      envoltorioBase64: envuelta.envoltorioBase64,
      nonceBase64: envuelta.nonceBase64,
      keyId,
      dominio: DOMINIO,
    });

    // No se vuelve a comprobar el `content_hash` aquí, y merece explicación
    // porque parece una protección que falta.
    //
    // El criptograma va atado a esta fila concreta por sus datos autenticados
    // —usuario, tipo de entidad, identificador, clave y versión—, así que un
    // blob que descifra **es** el blob de esta ficha: no hay forma de colar
    // otro. Un segundo control sobre el hash no puede rechazar nada que el
    // descifrado no haya rechazado ya, y sí puede dejar a alguien sin abrir
    // su propio archivo si esa columna se desincroniza alguna vez.
    //
    // El hash sigue guardándose: es lo que impide adjuntar dos veces el mismo
    // archivo al mismo registro, arriba y en la restricción de la 0016.
    return descifrarBytes({
      sobre: {
        criptograma,
        encryptionVersion: typeof version === 'number' ? version : 1,
        keyId,
        nonce,
        contentHash: String(metadatos.content_hash ?? ''),
      },
      clave,
      vinculo: vinculo(id),
    });
  }

  /**
   * Retira el archivo a la papelera.
   *
   * El blob **no se borra**: mientras la ficha esté en la papelera la persona
   * puede arrepentirse, y sin el blob el arrepentimiento no serviría de nada
   * (invariante 6). Lo borra la purga junto con la ficha.
   */
  async function retirar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_ARCHIVO, id);
  }

  /**
   * Borra de verdad, blob incluido. Solo para la purga de la papelera y para
   * la eliminación de cuenta.
   */
  async function purgar(id: string): Promise<void> {
    const registro = await almacen.obtener(TIPO_ARCHIVO, id);
    const ruta = registro?.metadatos.storage_path;
    if (typeof ruta !== 'string') return;

    await local.borrar(ruta);
    // Que el remoto falle no puede dejar la copia local: lo importante es que
    // deje de estar en el dispositivo.
    await remoto.borrar(ruta).catch(() => undefined);
  }

  return { deOrigen, adjuntar, abrir, retirar, purgar, subirPendientes };
}

export type RepositorioArchivos = ReturnType<typeof crearRepositorioArchivos>;
