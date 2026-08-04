// Archivos privados: qué sale del dispositivo y qué no.
//
// Es el módulo con más superficie de fuga del proyecto. Un archivo tiene
// bytes, tiene nombre, tiene tipo, tiene tamaño y tiene una ruta, y cada uno
// de esos cinco puede contar algo de la persona si se descuida.
//
// La primera prueba de este fichero es la que importa: **el contenido en
// claro no aparece en ningún sitio al que el servidor tenga acceso.** Todo lo
// demás protege detalles alrededor de eso.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearAlmacenamientoEnMemoria } from '@shared/services/storage/puertoAlmacenamiento';
import type { AlmacenamientoRemoto } from '@shared/services/storage/puertoAlmacenamiento';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { TAMANO_MAXIMO_BYTES } from '../models/archivo';
import { crearRepositorioArchivos, TIPO_ARCHIVO } from '../repositories/repositorioArchivos';

const USUARIO = 'usuario-1';
const MEMORIAL = 'memorial-1';

/**
 * Contenido reconocible.
 *
 * Es una frase, no bytes al azar, porque casi todas las comprobaciones de
 * aquí consisten en buscarla donde no debería estar. Un archivo de verdad
 * sería un JPEG, y buscar un JPEG dentro de un criptograma no se lee.
 */
const SECRETO = 'La última carta que me escribió mi padre antes de morir.';
const bytesDe = (texto: string): Uint8Array => new TextEncoder().encode(texto);
const CONTENIDO = bytesDe(SECRETO);
const NOMBRE = 'carta-de-mi-padre.pdf';

interface Subida {
  readonly ruta: string;
  readonly contenido: Uint8Array;
}

function montar(opciones: { fallaLaRed?: boolean } = {}) {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const claveMedios = crearClaveContenido('medios');
  const local = crearAlmacenamientoEnMemoria();

  const subidas: Subida[] = [];
  const enElCubo = new Map<string, Uint8Array>();

  const remoto: AlmacenamientoRemoto = {
    subir: async ({ ruta, contenido }) => {
      if (opciones.fallaLaRed === true) throw new Error('sin red');
      subidas.push({ ruta, contenido });
      enElCubo.set(ruta, contenido);
    },
    descargar: async (ruta) => {
      const contenido = enElCubo.get(ruta);
      if (contenido === undefined) throw new Error('no está');
      return contenido;
    },
    borrar: async (ruta) => {
      enElCubo.delete(ruta);
    },
  };

  return {
    almacen,
    local,
    remoto,
    subidas,
    enElCubo,
    repositorio: crearRepositorioArchivos({
      almacen,
      usuarioId: USUARIO,
      motor: crearMotorSincronizacion({
        almacen,
        remoto: crearServidorEnMemoria(),
        usuarioId: USUARIO,
        dispositivoId: 'dispositivo-1',
      }),
      remoto,
      local,
      claveMedios: () => claveMedios,
      claveEnvoltorio: () => derivadas.claveEnvoltorio,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

const adjuntarCarta = (repositorio: ReturnType<typeof montar>['repositorio']) =>
  repositorio.adjuntar({
    origen: 'memorial',
    origenId: MEMORIAL,
    tipo: 'application/pdf',
    nombre: NOMBRE,
    contenido: CONTENIDO,
  });

describe('lo que sale del dispositivo', () => {
  it('ni el contenido ni el nombre aparecen en claro en ningún sitio', async () => {
    const { repositorio, almacen, local, subidas } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.subirPendientes();

    // 1. El blob que sube al cubo.
    const subido = new TextDecoder().decode(subidas[0]?.contenido);
    expect(subido).not.toContain(SECRETO);
    expect(subido).not.toContain(NOMBRE);

    // 2. La copia local. Está cifrada también: un teléfono se pierde.
    const enDisco = await local.leer(`${USUARIO}/${archivo.id}`);
    expect(new TextDecoder().decode(enDisco ?? new Uint8Array())).not.toContain(SECRETO);

    // 3. La ficha entera, metadatos incluidos. Es lo que el servidor ve.
    const registro = await almacen.obtener(TIPO_ARCHIVO, archivo.id);
    expect(JSON.stringify(registro)).not.toContain(SECRETO);
    expect(JSON.stringify(registro)).not.toContain(NOMBRE);
    // Ni el nombre suelto sin extensión: buscar la cadena entera podría
    // pasar por alto un troceado.
    expect(JSON.stringify(registro)).not.toContain('carta-de-mi-padre');
  });

  it('la ruta es solo usuario y archivo: no cuenta nada', async () => {
    const { repositorio, almacen } = montar();

    const archivo = await adjuntarCarta(repositorio);
    const registro = await almacen.obtener(TIPO_ARCHIVO, archivo.id);

    // La misma forma que exige la restricción de la migración 0016. Sin
    // nombre, sin extensión y sin fecha: una ruta acaba en el registro de
    // cualquier servidor por el que pase.
    expect(registro?.metadatos.storage_path).toBe(`${USUARIO}/${archivo.id}`);
    expect(registro?.metadatos.storage_path).not.toContain('pdf');
  });

  it('cada archivo estrena clave', async () => {
    const { repositorio, almacen } = montar();

    const uno = await adjuntarCarta(repositorio);
    const otro = await repositorio.adjuntar({
      origen: 'memorial',
      origenId: MEMORIAL,
      tipo: 'image/jpeg',
      nombre: 'foto.jpg',
      contenido: bytesDe('otra cosa'),
    });

    const claveDe = async (id: string) =>
      (await almacen.obtener(TIPO_ARCHIVO, id))?.metadatos.key_id;

    // Con una clave compartida, compartir una foto obligaría a entregar la
    // clave de todos los archivos del dominio.
    expect(await claveDe(uno.id)).not.toBe(await claveDe(otro.id));
  });

  it('el mismo archivo cifrado dos veces da criptogramas distintos', async () => {
    const { repositorio, local } = montar();

    // A dos registros distintos, porque adjuntarlo dos veces al mismo se
    // reconoce como duplicado y no vuelve a cifrar nada.
    const uno = await adjuntarCarta(repositorio);
    const otro = await repositorio.adjuntar({
      origen: 'journal',
      origenId: 'entrada-1',
      tipo: 'application/pdf',
      nombre: NOMBRE,
      contenido: CONTENIDO,
    });

    const bytesUno = await local.leer(`${USUARIO}/${uno.id}`);
    const bytesOtro = await local.leer(`${USUARIO}/${otro.id}`);

    // Si coincidieran, el servidor podría agrupar archivos idénticos sin
    // descifrar nada.
    expect(Buffer.from(bytesUno ?? []).equals(Buffer.from(bytesOtro ?? []))).toBe(false);
  });

  it('el hash del contenido lleva clave: dos personas con el mismo archivo no coinciden', async () => {
    const primera = montar();
    const segunda = montar();

    const uno = await adjuntarCarta(primera.repositorio);
    const otro = await adjuntarCarta(segunda.repositorio);

    const hashDe = async (m: ReturnType<typeof montar>, id: string) =>
      (await m.almacen.obtener(TIPO_ARCHIVO, id))?.metadatos.content_hash;

    // Con un SHA-256 a secas, el servidor podría comprobar si alguien guarda
    // una imagen concreta y conocida.
    expect(await hashDe(primera, uno.id)).not.toBe(await hashDe(segunda, otro.id));
  });
});

describe('sin conexión', () => {
  it('adjuntar no toca la red', async () => {
    const { repositorio, subidas } = montar({ fallaLaRed: true });

    // Con la red rota igualmente: quien adjunta una foto en un sótano sin
    // cobertura la tiene adjuntada al instante (invariante 4).
    const archivo = await adjuntarCarta(repositorio);

    expect(archivo.estadoSubida).toBe('pending');
    expect(subidas).toHaveLength(0);
  });

  it('el archivo se puede abrir antes de haberse subido', async () => {
    const { repositorio } = montar({ fallaLaRed: true });

    const archivo = await adjuntarCarta(repositorio);

    expect(new TextDecoder().decode(await repositorio.abrir(archivo.id))).toBe(SECRETO);
  });

  it('una subida fallida se queda pendiente, no perdida', async () => {
    const { repositorio } = montar({ fallaLaRed: true });

    const archivo = await adjuntarCarta(repositorio);
    const resultado = await repositorio.subirPendientes();

    expect(resultado).toEqual({ subidos: 0, fallidos: 1 });
    // `pending` y no `failed`: el intento siguiente lo recogerá solo.
    const despues = await repositorio.deOrigen('memorial', MEMORIAL);
    expect(despues[0]?.estadoSubida).toBe('pending');
    expect(despues[0]?.id).toBe(archivo.id);
  });

  it('subir pendientes no lanza: lo llama un temporizador', async () => {
    const { repositorio } = montar({ fallaLaRed: true });
    await adjuntarCarta(repositorio);

    await expect(repositorio.subirPendientes()).resolves.toBeDefined();
  });

  it('recuperada la red, lo pendiente sube y se marca', async () => {
    const { repositorio, subidas } = montar();

    await adjuntarCarta(repositorio);
    expect(await repositorio.subirPendientes()).toEqual({ subidos: 1, fallidos: 0 });

    expect(subidas).toHaveLength(1);
    expect((await repositorio.deOrigen('memorial', MEMORIAL))[0]?.estadoSubida).toBe('uploaded');
  });

  it('lo ya subido no se vuelve a subir', async () => {
    const { repositorio, subidas } = montar();

    await adjuntarCarta(repositorio);
    await repositorio.subirPendientes();
    await repositorio.subirPendientes();

    // Sin esto, cada vuelta del temporizador gastaría los datos de la persona
    // subiendo lo mismo.
    expect(subidas).toHaveLength(1);
  });

  it('un archivo en la papelera no se sube', async () => {
    const { repositorio, subidas } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.retirar(archivo.id);
    await repositorio.subirPendientes();

    expect(subidas).toHaveLength(0);
  });

  it('si el blob local desapareció, se marca fallido en vez de fingir', async () => {
    const { repositorio, local } = montar();

    const archivo = await adjuntarCarta(repositorio);
    // El sistema limpió la caché. Ya no está en ninguna parte.
    await local.borrar(`${USUARIO}/${archivo.id}`);

    expect(await repositorio.subirPendientes()).toEqual({ subidos: 0, fallidos: 1 });
    expect((await repositorio.deOrigen('memorial', MEMORIAL))[0]?.estadoSubida).toBe('failed');
  });
});

describe('abrir', () => {
  it('devuelve exactamente los bytes originales', async () => {
    const { repositorio } = montar();

    const archivo = await adjuntarCarta(repositorio);

    expect(Buffer.from(await repositorio.abrir(archivo.id)).equals(Buffer.from(CONTENIDO))).toBe(
      true,
    );
  });

  it('descarga del cubo si no está en local, y lo deja guardado', async () => {
    const { repositorio, local } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.subirPendientes();
    // Otro dispositivo: tiene la ficha sincronizada y no tiene el blob.
    await local.borrar(`${USUARIO}/${archivo.id}`);

    expect(new TextDecoder().decode(await repositorio.abrir(archivo.id))).toBe(SECRETO);
    // Y no lo baja dos veces.
    expect(await local.leer(`${USUARIO}/${archivo.id}`)).not.toBeNull();
  });

  it('un blob manipulado en el servidor falla en vez de devolver basura', async () => {
    const { repositorio, local, enElCubo } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.subirPendientes();
    await local.borrar(`${USUARIO}/${archivo.id}`);

    const ruta = `${USUARIO}/${archivo.id}`;
    const alterado = Uint8Array.from(enElCubo.get(ruta) ?? []);
    alterado[0] = (alterado[0] ?? 0) ^ 0xff;
    enElCubo.set(ruta, alterado);

    await expect(repositorio.abrir(archivo.id)).rejects.toMatchObject({
      codigo: 'DESCIFRADO_FALLIDO',
    });
  });

  it('el blob de un archivo no abre como si fuera otro', async () => {
    const { repositorio, local } = montar();

    const uno = await adjuntarCarta(repositorio);
    const otro = await repositorio.adjuntar({
      origen: 'memorial',
      origenId: MEMORIAL,
      tipo: 'image/jpeg',
      nombre: 'foto.jpg',
      contenido: bytesDe('una foto cualquiera'),
    });

    // Alguien con acceso a la base mueve un criptograma a otra fila. Los
    // datos autenticados lo atan a su registro: no debe abrirse.
    const bytesDeUno = await local.leer(`${USUARIO}/${uno.id}`);
    await local.escribir({
      ruta: `${USUARIO}/${otro.id}`,
      contenido: bytesDeUno ?? new Uint8Array(),
    });

    await expect(repositorio.abrir(otro.id)).rejects.toMatchObject({ categoria: 'cifrado' });
  });

  it('un archivo en la papelera no se abre', async () => {
    const { repositorio } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.retirar(archivo.id);

    await expect(repositorio.abrir(archivo.id)).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_ENCONTRADO',
    });
  });

  it('un archivo que no existe no devuelve un vacío silencioso', async () => {
    const { repositorio } = montar();

    await expect(repositorio.abrir('no-existe')).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_ENCONTRADO',
    });
  });
});

describe('qué se acepta', () => {
  // El contenido va detrás de una función y no en la tabla: `it.each` mete
  // cada argumento en el nombre de la prueba, y un array de cincuenta megas
  // ahí produce cincuenta megas de salida.
  const rechazos = [
    {
      caso: 'una hoja de cálculo, que la aplicación no sabe enseñar',
      tipo: 'application/vnd.ms-excel',
      contenido: () => CONTENIDO,
      motivo: 'tipoNoAdmitido',
    },
    {
      caso: 'un archivo vacío',
      tipo: 'application/pdf',
      contenido: () => new Uint8Array(0),
      motivo: 'vacio',
    },
    {
      caso: 'uno que pasa del límite',
      tipo: 'application/pdf',
      contenido: () => new Uint8Array(TAMANO_MAXIMO_BYTES + 1),
      motivo: 'demasiadoGrande',
    },
  ];

  it.each(rechazos)('rechaza $caso', async ({ tipo, contenido, motivo }) => {
    const { repositorio, almacen } = montar();

    await expect(
      repositorio.adjuntar({
        origen: 'memorial',
        origenId: MEMORIAL,
        tipo: tipo as 'application/pdf',
        nombre: NOMBRE,
        contenido: contenido(),
      }),
    ).rejects.toMatchObject({ claveMensaje: `errores.archivos.${motivo}` });

    // Y no deja una ficha a medias.
    expect(await almacen.listar(TIPO_ARCHIVO)).toHaveLength(0);
  });

  it('el motivo del rechazo nunca repite el nombre del archivo', async () => {
    // El contexto de un ErrorApp acaba en telemetría, y el nombre de un
    // archivo privado es contenido privado (invariante 2).
    const { repositorio } = montar();

    try {
      await repositorio.adjuntar({
        origen: 'memorial',
        origenId: MEMORIAL,
        tipo: 'application/vnd.ms-excel' as 'application/pdf',
        nombre: NOMBRE,
        contenido: CONTENIDO,
      });
      throw new Error('debería haber fallado');
    } catch (causa) {
      expect(JSON.stringify(causa)).not.toContain(NOMBRE);
      expect(String(causa)).not.toContain(NOMBRE);
    }
  });

  it('el mismo archivo dos veces en el mismo registro es un solo adjunto', async () => {
    // El esquema lo prohíbe con una restricción única. Sin reconocerlo aquí,
    // el segundo se cifraría, se guardaría y solo reventaría al sincronizar:
    // un error incomprensible, mucho después y lejos de donde se causó.
    const { repositorio } = montar();

    const primero = await adjuntarCarta(repositorio);
    const segundo = await adjuntarCarta(repositorio);

    expect(segundo.id).toBe(primero.id);
    expect(await repositorio.deOrigen('memorial', MEMORIAL)).toHaveLength(1);
  });

  it('el mismo archivo en dos registros distintos sí son dos adjuntos', async () => {
    const { repositorio } = montar();

    await adjuntarCarta(repositorio);
    await repositorio.adjuntar({
      origen: 'journal',
      origenId: 'entrada-1',
      tipo: 'application/pdf',
      nombre: NOMBRE,
      contenido: CONTENIDO,
    });

    // La misma foto puede acompañar a un memorial y a una entrada del diario.
    expect(await repositorio.deOrigen('memorial', MEMORIAL)).toHaveLength(1);
    expect(await repositorio.deOrigen('journal', 'entrada-1')).toHaveLength(1);
  });

  it('el tamaño que se guarda es el del original, no el del criptograma', async () => {
    const { repositorio } = montar();

    const archivo = await adjuntarCarta(repositorio);

    // Es lo que se le enseña a la persona: decirle que su PDF pesa dieciséis
    // bytes más de lo que pesa sería raro y, sumado, engañoso.
    expect(archivo.tamanoBytes).toBe(CONTENIDO.length);
  });
});

describe('papelera', () => {
  it('retirar esconde la ficha y conserva el blob', async () => {
    const { repositorio, local } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.retirar(archivo.id);

    expect(await repositorio.deOrigen('memorial', MEMORIAL)).toHaveLength(0);
    // Sin el blob, arrepentirse durante los treinta días no serviría de nada
    // (invariante 6).
    expect(await local.leer(`${USUARIO}/${archivo.id}`)).not.toBeNull();
  });

  it('purgar se lleva la copia local y la del cubo', async () => {
    const { repositorio, local, enElCubo } = montar();

    const archivo = await adjuntarCarta(repositorio);
    await repositorio.subirPendientes();
    await repositorio.retirar(archivo.id);
    await repositorio.purgar(archivo.id);

    expect(await local.leer(`${USUARIO}/${archivo.id}`)).toBeNull();
    expect(enElCubo.has(`${USUARIO}/${archivo.id}`)).toBe(false);
  });

  it('si el cubo falla al purgar, la copia local se va igual', async () => {
    const { repositorio, local, remoto } = montar();
    const archivo = await adjuntarCarta(repositorio);

    jest.spyOn(remoto, 'borrar').mockRejectedValue(new Error('sin red'));
    await repositorio.purgar(archivo.id);

    // Lo urgente es que deje de estar en el teléfono, que es lo que la
    // persona tiene delante.
    expect(await local.leer(`${USUARIO}/${archivo.id}`)).toBeNull();
  });

  it('purgar algo que ya no está no rompe nada', async () => {
    const { repositorio } = montar();

    await expect(repositorio.purgar('no-existe')).resolves.toBeUndefined();
  });
});

describe('lista de adjuntos', () => {
  it('devuelve solo los del registro pedido, del más antiguo al más nuevo', async () => {
    const { repositorio } = montar();

    await repositorio.adjuntar({
      origen: 'memorial',
      origenId: MEMORIAL,
      tipo: 'image/png',
      nombre: 'primero.png',
      contenido: bytesDe('uno'),
    });
    await repositorio.adjuntar({
      origen: 'memorial',
      origenId: 'otro-memorial',
      tipo: 'image/png',
      nombre: 'de-otro.png',
      contenido: bytesDe('dos'),
    });
    await repositorio.adjuntar({
      origen: 'journal',
      origenId: MEMORIAL,
      tipo: 'image/png',
      nombre: 'del-diario.png',
      contenido: bytesDe('tres'),
    });

    const adjuntos = await repositorio.deOrigen('memorial', MEMORIAL);

    // El mismo identificador con otro tipo de origen no cuenta: `owner_id` no
    // es único entre tablas.
    expect(adjuntos.map((a) => a.nombre)).toEqual(['primero.png']);
  });

  it('enseña el nombre descifrado', async () => {
    const { repositorio } = montar();

    await adjuntarCarta(repositorio);

    expect((await repositorio.deOrigen('memorial', MEMORIAL))[0]?.nombre).toBe(NOMBRE);
  });
});
