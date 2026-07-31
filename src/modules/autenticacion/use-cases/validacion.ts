// Validación de los formularios de acceso.
//
// Se define con esquemas para que la misma regla valga en el formulario y en
// cualquier otro punto que reciba estos datos, sin duplicar comprobaciones.
// Los mensajes son claves de i18n, nunca texto literal.
import { z } from 'zod';

/** Mínimo razonable y alineado con lo que exige Supabase Auth. */
export const LONGITUD_MINIMA_CONTRASENA = 8;

export const esquemaCorreo = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { message: 'autenticacion.correoInvalido' })
  .email({ message: 'autenticacion.correoInvalido' });

export const esquemaContrasena = z
  .string()
  .min(LONGITUD_MINIMA_CONTRASENA, { message: 'autenticacion.contrasenaCorta' });

export const esquemaCredenciales = z.object({
  correo: esquemaCorreo,
  contrasena: esquemaContrasena,
});

export type Credenciales = z.infer<typeof esquemaCredenciales>;

/**
 * Frase de recuperación tal y como la teclea el usuario.
 *
 * Solo comprueba la forma (24 palabras). Que corresponda a la cuenta lo
 * decide el intento de descifrado, no una validación de formulario.
 */
export const esquemaFraseRecuperacion = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\s+/g, ' ').toLowerCase())
  .refine((valor) => valor.split(' ').filter((palabra) => palabra.length > 0).length === 24, {
    message: 'errores.cifrado.fraseInvalida',
  });

/** Devuelve la clave de i18n del primer error, o null si todo es válido. */
export function primerError(resultado: z.ZodSafeParseResult<unknown>): string | null {
  if (resultado.success) {
    return null;
  }
  return resultado.error.issues[0]?.message ?? 'errores.validacion';
}
