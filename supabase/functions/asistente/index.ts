// Función Edge del asistente.
//
// Existe por una razón concreta: **la credencial del proveedor no puede vivir
// en el dispositivo.** Una aplicación móvil es un binario que cualquiera
// puede abrir, así que una clave incrustada en ella es una clave publicada.
//
// Cuatro reglas gobiernan este archivo:
//
//   1. **El prompt lo pone el servidor.** El que llegue en la petición se
//      descarta. Quien controla el cliente controla ese campo, y aceptarlo
//      convertiría todos los límites doctrinales en una sugerencia.
//   2. **Solo se acepta la conversación.** Ningún otro campo se reenvía al
//      proveedor, venga como venga.
//   3. **Nunca se registra el contenido.** Ni en logs, ni en trazas, ni en el
//      cuerpo de un error (invariante 2). Se registra que hubo una petición y
//      cómo acabó, nada más.
//   4. **Nada se persiste aquí.** La conversación se guarda cifrada en el
//      dispositivo; esta función procesa y olvida.
//
// Variables de entorno necesarias (`supabase secrets set`):
//   IA_URL       — extremo del proveedor.
//   IA_CLAVE     — credencial del proveedor.
//   IA_MODELO    — modelo a usar. **Cambiarlo obliga a volver a ejecutar la
//                  batería de evaluación completa** (Documento 6).
//
// Deno, no Node: este archivo se ejecuta en el entorno de Supabase.
// @ts-nocheck — el proyecto compila con la configuración de React Native, que
// no conoce los tipos globales de Deno.
/* eslint-disable */
import { PROMPT_SISTEMA } from '../_shared/prompt.ts';

const MAXIMO_MENSAJES = 40;
const MAXIMO_CARACTERES = 8000;

interface MensajeEntrante {
  readonly rol: 'usuario' | 'asistente';
  readonly texto: string;
}

function respuesta(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mensajesValidos(valor: unknown): valor is readonly MensajeEntrante[] {
  return (
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.length <= MAXIMO_MENSAJES &&
    valor.every(
      (mensaje) =>
        typeof mensaje === 'object' &&
        mensaje !== null &&
        (mensaje.rol === 'usuario' || mensaje.rol === 'asistente') &&
        typeof mensaje.texto === 'string' &&
        mensaje.texto.length > 0 &&
        mensaje.texto.length <= MAXIMO_CARACTERES,
    )
  );
}

Deno.serve(async (peticion: Request) => {
  if (peticion.method !== 'POST') {
    return respuesta({ error: 'metodo_no_permitido' }, 405);
  }

  // Sin sesión no se atiende a nadie. El token lo valida la plataforma, pero
  // comprobarlo aquí evita gastar una llamada al proveedor si falta.
  if (!(peticion.headers.get('Authorization') ?? '').startsWith('Bearer ')) {
    return respuesta({ error: 'sin_sesion' }, 401);
  }

  const url = Deno.env.get('IA_URL');
  const clave = Deno.env.get('IA_CLAVE');
  const modelo = Deno.env.get('IA_MODELO');
  if (!url || !clave || !modelo) {
    // Sin configuración no se improvisa un modelo por defecto: eso pondría en
    // producción un modelo que nadie pasó por la batería de evaluación.
    return respuesta({ error: 'asistente_no_configurado' }, 503);
  }

  let cuerpo: { mensajes?: unknown };
  try {
    cuerpo = await peticion.json();
  } catch {
    return respuesta({ error: 'peticion_invalida' }, 400);
  }

  if (!mensajesValidos(cuerpo.mensajes)) {
    return respuesta({ error: 'peticion_invalida' }, 400);
  }

  let contestacion: Response;
  try {
    contestacion = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        model: modelo,
        // El prompt del servidor. El de la petición ni se lee.
        system: PROMPT_SISTEMA,
        max_tokens: 1024,
        messages: cuerpo.mensajes.map((mensaje) => ({
          role: mensaje.rol === 'usuario' ? 'user' : 'assistant',
          content: mensaje.texto,
        })),
      }),
    });
  } catch {
    return respuesta({ error: 'proveedor_no_disponible' }, 502);
  }

  if (!contestacion.ok) {
    // Sin reenviar el cuerpo: el error de un proveedor suele repetir el texto
    // que lo provocó, y ese texto no puede salir de aquí.
    return respuesta({ error: 'proveedor_no_disponible' }, 502);
  }

  const datos = await contestacion.json();
  const texto = extraerTexto(datos);
  if (texto === null) {
    return respuesta({ error: 'respuesta_vacia' }, 502);
  }

  // Solo el texto. Nada de identificadores del proveedor que puedan atarse a
  // la persona: `provider_reference_hash` nunca se deriva del usuario.
  return respuesta({ texto }, 200);
});

/** Saca el texto de la respuesta sin dar por hecho la forma exacta. */
function extraerTexto(datos: unknown): string | null {
  if (typeof datos !== 'object' || datos === null) return null;

  const contenido = (datos as { content?: unknown }).content;
  if (!Array.isArray(contenido)) return null;

  const partes = contenido
    .filter((parte) => typeof parte?.text === 'string')
    .map((parte) => parte.text as string);

  const texto = partes.join('').trim();
  return texto.length === 0 ? null : texto;
}
