// Forma exacta de las peticiones al cubo.
//
// Aquí se mira lo que ni las pruebas del repositorio ni las del proyecto real
// pueden ver: el repositorio usa un doble y el proyecto real solo enseña el
// resultado. Y en este archivo hay un detalle del que depende todo el
// aislamiento de Storage: **cómo se escapa la ruta**.
//
// La política del cubo compara la primera carpeta del nombre con el
// identificador del usuario. Si la barra se escapara, el objeto acabaría
// llamándose `usuario%2Farchivo` —un solo tramo, sin carpeta— y esa política
// dejaría de proteger nada.
import { crearAlmacenamientoSupabase } from '../almacenamientoSupabase';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const ARCHIVO = '22222222-2222-4222-8222-222222222222';
const RUTA = `${USUARIO}/${ARCHIVO}`;
const CONTENIDO = new Uint8Array([1, 2, 3, 4]);

interface Peticion {
  readonly url: string;
  readonly metodo: string;
  readonly cabeceras: Record<string, string>;
  readonly cuerpo: unknown;
}

function montar(respuestas: { estado: number; cuerpo?: Uint8Array }[] = []) {
  const peticiones: Peticion[] = [];

  const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
    peticiones.push({
      url: String(url),
      metodo: init?.method ?? 'GET',
      cabeceras: (init?.headers ?? {}) as Record<string, string>,
      cuerpo: init?.body,
    });
    const siguiente = respuestas.shift() ?? { estado: 200 };
    return {
      status: siguiente.estado,
      arrayBuffer: async () => (siguiente.cuerpo ?? new Uint8Array()).buffer,
    } as Response;
  }) as typeof fetch;

  return {
    peticiones,
    almacenamiento: crearAlmacenamientoSupabase({
      transporte,
      proveerToken: async () => 'token-de-prueba',
      url: 'https://ejemplo.supabase.co',
      claveAnonima: 'anonima',
    }),
  };
}

describe('la ruta', () => {
  it('conserva la barra: la carpeta es lo que protege el archivo', async () => {
    const { almacenamiento, peticiones } = montar();

    await almacenamiento.subir({ ruta: RUTA, contenido: CONTENIDO });

    // Con `%2F` el objeto sería un solo tramo y la política del cubo, que
    // mira la primera carpeta, dejaría de aislar nada.
    expect(peticiones[0]?.url).toContain(`/archivos-privados/${USUARIO}/${ARCHIVO}`);
    expect(peticiones[0]?.url).not.toContain('%2F');
  });

  it('escapa cada tramo por separado', async () => {
    const { almacenamiento, peticiones } = montar();

    // Los identificadores son UUID y esto no debería ocurrir nunca; se
    // comprueba igual porque el día que deje de ser cierto, el fallo sería
    // silencioso y grave.
    await almacenamiento.subir({ ruta: `${USUARIO}/raro?nombre=x`, contenido: CONTENIDO });

    expect(peticiones[0]?.url).toContain('raro%3Fnombre%3Dx');
  });
});

describe('subir', () => {
  it('declara el blob como bytes opacos, no como imagen', async () => {
    const { almacenamiento, peticiones } = montar();

    await almacenamiento.subir({ ruta: RUTA, contenido: CONTENIDO });

    // El criptograma no es un JPEG. Decir que lo es invitaría a Storage a
    // servirlo como imagen.
    expect(peticiones[0]?.cabeceras['Content-Type']).toBe('application/octet-stream');
    expect(peticiones[0]?.metodo).toBe('POST');
  });

  it('permite sobrescribir: reintentar una subida cortada debe terminarla', async () => {
    const { almacenamiento, peticiones } = montar();

    await almacenamiento.subir({ ruta: RUTA, contenido: CONTENIDO });

    // Sin `x-upsert`, el segundo intento devolvería un conflicto y el archivo
    // se quedaría a medias para siempre.
    expect(peticiones[0]?.cabeceras['x-upsert']).toBe('true');
  });

  it('va con el token del usuario', async () => {
    const { almacenamiento, peticiones } = montar();

    await almacenamiento.subir({ ruta: RUTA, contenido: CONTENIDO });

    expect(peticiones[0]?.cabeceras['Authorization']).toBe('Bearer token-de-prueba');
  });
});

describe('descargar', () => {
  it('devuelve los bytes tal cual', async () => {
    const { almacenamiento } = montar([{ estado: 200, cuerpo: CONTENIDO }]);

    expect(Array.from(await almacenamiento.descargar(RUTA))).toEqual([1, 2, 3, 4]);
  });

  it('un archivo que no está da un error propio, no bytes vacíos', async () => {
    // Devolver un array vacío haría que el repositorio intentara descifrarlo
    // y el mensaje hablara de cifrado, que es donde no está el problema.
    const { almacenamiento } = montar([{ estado: 404 }]);

    await expect(almacenamiento.descargar(RUTA)).rejects.toMatchObject({
      codigo: 'ARCHIVO_NO_ENCONTRADO',
    });
  });
});

describe('errores', () => {
  it('un corte de red se marca reintentable', async () => {
    const transporte = (async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;

    const almacenamiento = crearAlmacenamientoSupabase({
      transporte,
      proveerToken: async () => 'token-de-prueba',
      url: 'https://ejemplo.supabase.co',
      claveAnonima: 'anonima',
    });

    await expect(almacenamiento.subir({ ruta: RUTA, contenido: CONTENIDO })).rejects.toMatchObject({
      codigo: 'RED_NO_DISPONIBLE',
      puedeReintentarse: true,
    });
  });

  it.each([
    [500, true],
    [429, true],
    [403, false],
  ])('un %i se marca reintentable: %s', async (estado, reintentable) => {
    const { almacenamiento } = montar([{ estado }]);

    await expect(almacenamiento.descargar(RUTA)).rejects.toMatchObject({
      puedeReintentarse: reintentable,
    });
  });

  it('el error nunca repite la ruta: lleva dentro dos identificadores', async () => {
    // El contexto de un ErrorApp acaba en telemetría, y `{usuario}/{archivo}`
    // es exactamente lo que el invariante 2 no quiere ver ahí.
    const { almacenamiento } = montar([{ estado: 500 }]);

    try {
      await almacenamiento.descargar(RUTA);
      throw new Error('debería haber fallado');
    } catch (causa) {
      expect(JSON.stringify(causa)).not.toContain(USUARIO);
      expect(JSON.stringify(causa)).not.toContain(ARCHIVO);
      expect((causa as { contexto: unknown }).contexto).toMatchObject({
        operacion: 'descargar:archivo',
      });
    }
  });
});

describe('sin sesión', () => {
  it('manda la clave anónima y deja que el cubo diga que no', async () => {
    const peticiones: Peticion[] = [];
    const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
      peticiones.push({
        url: String(url),
        metodo: init?.method ?? 'GET',
        cabeceras: (init?.headers ?? {}) as Record<string, string>,
        cuerpo: init?.body,
      });
      return { status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }) as typeof fetch;

    const almacenamiento = crearAlmacenamientoSupabase({
      transporte,
      proveerToken: async () => null,
      url: 'https://ejemplo.supabase.co',
      claveAnonima: 'anonima',
    });

    await almacenamiento.descargar(RUTA);

    // Quien decide es la política, no el cliente: fabricar aquí un error
    // «no has iniciado sesión» duplicaría la regla en dos sitios.
    expect(peticiones[0]?.cabeceras['Authorization']).toBe('Bearer anonima');
  });
});

describe('borrar', () => {
  it('borra por ruta y con el método correcto', async () => {
    const { almacenamiento, peticiones } = montar();

    await almacenamiento.borrar(RUTA);

    expect(peticiones[0]?.metodo).toBe('DELETE');
    expect(peticiones[0]?.url).toContain(`/archivos-privados/${RUTA}`);
  });
});
