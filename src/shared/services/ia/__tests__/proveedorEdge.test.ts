// El proveedor que habla con la función Edge.
//
// Lo que se comprueba aquí es sobre todo **lo que no hace**: no lleva ninguna
// credencial del modelo, no manda más que el prompt y la conversación, y no
// deja que el texto de un error del proveedor se convierta en un mensaje.
import { crearProveedorEdge } from '../proveedorEdge';

const PETICION = {
  promptSistema: 'instrucciones',
  mensajes: [{ rol: 'usuario' as const, texto: 'Hola' }],
};

function respuesta(cuerpo: unknown, estado = 200): Response {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => cuerpo,
  } as Response;
}

describe('proveedor por función Edge', () => {
  it('manda el token del usuario y solo la conversación', async () => {
    let recibida: { url: string; init: RequestInit } | null = null;
    const proveedor = crearProveedorEdge({
      proveerToken: async () => 'token-de-sesion',
      url: 'https://ejemplo.supabase.co',
      claveAnonima: 'anonima',
      transporte: async (url, init) => {
        recibida = { url: String(url), init: init ?? {} };
        return respuesta({ texto: 'Respuesta' });
      },
    });

    expect(await proveedor.responder(PETICION)).toEqual({ texto: 'Respuesta' });

    const llamada = recibida as unknown as { url: string; init: RequestInit };
    expect(llamada.url).toBe('https://ejemplo.supabase.co/functions/v1/asistente');
    expect((llamada.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-de-sesion',
    );

    // El cuerpo tiene exactamente dos campos. Si alguien añadiera «contexto»
    // con el diario o las oraciones para mejorar la respuesta, esto lo para.
    expect(Object.keys(JSON.parse(String(llamada.init.body)) as object).sort()).toEqual([
      'mensajes',
      'promptSistema',
    ]);
  });

  it('sin sesión no llama a nada', async () => {
    let llamado = false;
    const proveedor = crearProveedorEdge({
      proveerToken: async () => null,
      transporte: async () => {
        llamado = true;
        return respuesta({ texto: 'x' });
      },
    });

    await expect(proveedor.responder(PETICION)).rejects.toThrow();
    expect(llamado).toBe(false);
  });

  it('el error no repite nada de lo que el usuario escribió', async () => {
    const proveedor = crearProveedorEdge({
      proveerToken: async () => 'token',
      transporte: async () =>
        respuesta({ error: 'contenido rechazado: «no aguanto más»' }, 400) as Response,
    });

    // El cuerpo del error de un proveedor suele devolver el texto que provocó
    // el fallo. Ese texto no puede acabar en un mensaje ni en una traza
    // (invariante 2).
    await expect(proveedor.responder(PETICION)).rejects.toThrow(/^El asistente respondió 400$/);
  });

  it('una respuesta vacía se trata como fallo, no como silencio del asistente', async () => {
    const proveedor = crearProveedorEdge({
      proveerToken: async () => 'token',
      transporte: async () => respuesta({ texto: '   ' }),
    });

    await expect(proveedor.responder(PETICION)).rejects.toThrow();
  });

  it('deja de esperar en lugar de dejar a alguien mirando «Pensando…»', async () => {
    const proveedor = crearProveedorEdge({
      proveerToken: async () => 'token',
      tiempoLimiteMs: 5,
      transporte: (_url, init) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new Error('abortada')));
        }),
    });

    await expect(proveedor.responder(PETICION)).rejects.toThrow('abortada');
  });

  it('conserva la referencia opaca si el proveedor la da', async () => {
    const proveedor = crearProveedorEdge({
      proveerToken: async () => 'token',
      transporte: async () => respuesta({ texto: 'Hola', referencia: 'ref-opaca' }),
    });

    expect(await proveedor.responder(PETICION)).toEqual({
      texto: 'Hola',
      referencia: 'ref-opaca',
    });
  });
});
