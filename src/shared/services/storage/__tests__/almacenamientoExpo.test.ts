// La copia local de los archivos cifrados.
//
// Aquí lo que se prueba no es escribir y leer —eso lo hace el sistema de
// archivos—, sino **qué pasa cuando el disco falla**. Un teléfono lleno o un
// permiso denegado no pueden tumbar la pantalla en la que alguien acaba de
// elegir la foto de su padre.
import { crearAlmacenamientoDeArchivos, nombrePlano } from '../almacenamientoExpo';
import type { SistemaDeArchivos } from '../almacenamientoExpo';

const RUTA = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
const CONTENIDO = new Uint8Array([9, 8, 7]);

function sistemaEnMemoria(): SistemaDeArchivos & { readonly archivos: Map<string, Uint8Array> } {
  const archivos = new Map<string, Uint8Array>();
  return {
    archivos,
    escribir: async (ruta, contenido) => {
      archivos.set(ruta, contenido);
    },
    leer: async (ruta) => archivos.get(ruta) ?? null,
    borrar: async (ruta) => {
      archivos.delete(ruta);
    },
  };
}

const sistemaQueFalla = (): SistemaDeArchivos => ({
  escribir: async () => {
    throw new Error('no queda espacio en el dispositivo');
  },
  leer: async () => {
    throw new Error('permiso denegado');
  },
  borrar: async () => {
    throw new Error('permiso denegado');
  },
});

describe('nombre en disco', () => {
  it('aplana la ruta sin perder ninguno de los dos identificadores', () => {
    // Se evita crear una carpeta por usuario, que habría que vaciar al cerrar
    // sesión. Ambos tramos son UUID, así que el guion bajo no se confunde con
    // nada de dentro.
    expect(nombrePlano(RUTA)).toBe(
      '11111111-1111-4111-8111-111111111111_22222222-2222-4222-8222-222222222222',
    );
  });

  it('dos rutas distintas nunca dan el mismo nombre', () => {
    expect(nombrePlano('a/b')).not.toBe(nombrePlano('a/c'));
    expect(nombrePlano('a/b')).not.toBe(nombrePlano('b/b'));
  });
});

describe('funcionamiento normal', () => {
  it('lo escrito se lee igual', async () => {
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaEnMemoria());

    await almacenamiento.escribir({ ruta: RUTA, contenido: CONTENIDO });

    expect(Array.from((await almacenamiento.leer(RUTA)) ?? [])).toEqual([9, 8, 7]);
  });

  it('un archivo que no está devuelve null, que no es un error', async () => {
    // Es lo normal en un dispositivo nuevo: la ficha llegó sincronizada y el
    // blob todavía no se ha descargado.
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaEnMemoria());

    expect(await almacenamiento.leer(RUTA)).toBeNull();
  });

  it('borrar deja de encontrarlo', async () => {
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaEnMemoria());

    await almacenamiento.escribir({ ruta: RUTA, contenido: CONTENIDO });
    await almacenamiento.borrar(RUTA);

    expect(await almacenamiento.leer(RUTA)).toBeNull();
  });
});

describe('cuando el disco falla', () => {
  it('escribir no lanza: quien llama está pintando una pantalla', async () => {
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaQueFalla());

    await expect(
      almacenamiento.escribir({ ruta: RUTA, contenido: CONTENIDO }),
    ).resolves.toBeUndefined();
  });

  it('leer devuelve null en vez de romper', async () => {
    // El repositorio ya sabe qué hacer con la ausencia: marcar el archivo y
    // decirlo. Una excepción aquí no le daría esa oportunidad.
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaQueFalla());

    expect(await almacenamiento.leer(RUTA)).toBeNull();
  });

  it('borrar no detiene una purga que tiene más archivos por delante', async () => {
    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaQueFalla());

    await expect(almacenamiento.borrar(RUTA)).resolves.toBeUndefined();
  });

  it('el fallo no se registra: la ruta lleva dos identificadores dentro', async () => {
    const registrado: unknown[] = [];
    const espia = jest.spyOn(console, 'error').mockImplementation((...args) => {
      registrado.push(args);
    });
    const aviso = jest.spyOn(console, 'warn').mockImplementation((...args) => {
      registrado.push(args);
    });

    const almacenamiento = crearAlmacenamientoDeArchivos(sistemaQueFalla());
    await almacenamiento.escribir({ ruta: RUTA, contenido: CONTENIDO });
    await almacenamiento.leer(RUTA);

    expect(registrado).toHaveLength(0);

    espia.mockRestore();
    aviso.mockRestore();
  });
});
