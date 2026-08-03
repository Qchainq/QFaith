// El prompt vive en dos sitios: en la aplicación y en la función Edge, que es
// la que manda de verdad.
//
// Si se separaran, la batería de evaluación seguiría en verde comprobando un
// prompt que ya no es el que rige en producción. Esta prueba lee el archivo
// del servidor tal cual y compara los dos textos carácter a carácter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROMPT_SISTEMA } from '../promptSistema';

const RUTA_SERVIDOR = join(__dirname, '../../../../../supabase/functions/_shared/prompt.ts');

function promptDelServidor(): string {
  const archivo = readFileSync(RUTA_SERVIDOR, 'utf8');
  const entre = archivo.match(/export const PROMPT_SISTEMA = `([\s\S]*?)`;/);
  if (entre?.[1] === undefined) {
    throw new Error('No se encontró PROMPT_SISTEMA en el archivo del servidor');
  }
  return entre[1];
}

describe('prompt del servidor', () => {
  it('es exactamente el mismo que evalúa la batería', () => {
    expect(promptDelServidor()).toBe(PROMPT_SISTEMA);
  });

  it('la función Edge usa su propio prompt y descarta el del cliente', () => {
    const funcion = readFileSync(
      join(__dirname, '../../../../../supabase/functions/asistente/index.ts'),
      'utf8',
    );

    // Se pasa el prompt del servidor…
    expect(funcion).toContain('system: PROMPT_SISTEMA');
    // …y en ningún momento se lee el que venga en la petición. Quien controla
    // el cliente controla ese campo.
    expect(funcion).not.toContain('cuerpo.promptSistema');
  });
});
