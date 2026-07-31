// Configuración centralizada. Ningún otro archivo lee `process.env`
// directamente: si un valor hace falta en algún sitio, se añade aquí y se
// valida al arrancar, de modo que un entorno mal configurado falla de
// inmediato y no a mitad de una operación del usuario.
import { z } from 'zod';

const esquemaEntorno = z.enum(['development', 'test', 'staging', 'production']);

const esquemaConfiguracion = z.object({
  entorno: esquemaEntorno,
  supabase: z.object({
    url: z.string().url(),
    claveAnonima: z.string().min(1),
  }),
  idiomas: z.object({
    soportados: z.array(z.string()).nonempty(),
    porDefecto: z.string(),
  }),
  cifrado: z.object({
    // Versión del esquema de cifrado con la que se escriben los registros
    // nuevos. Las versiones anteriores se siguen pudiendo descifrar.
    versionActual: z.number().int().positive(),
  }),
  sincronizacion: z.object({
    intervaloMs: z.number().int().positive(),
    tamanoLote: z.number().int().positive(),
    reintentosMaximos: z.number().int().positive(),
  }),
});

export type Configuracion = z.infer<typeof esquemaConfiguracion>;
export type EntornoEjecucion = z.infer<typeof esquemaEntorno>;

// En desarrollo y pruebas se admiten valores de marcador para que el proyecto
// arranque sin un backend real. En staging y producción, la validación exige
// credenciales verdaderas.
const URL_MARCADOR = 'http://localhost:54321';
const CLAVE_MARCADOR = 'clave-anonima-local';

function leerConfiguracion(): Configuracion {
  const entorno = esquemaEntorno.parse(process.env.EXPO_PUBLIC_ENTORNO ?? 'development');
  const esEntornoLocal = entorno === 'development' || entorno === 'test';

  return esquemaConfiguracion.parse({
    entorno,
    supabase: {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? (esEntornoLocal ? URL_MARCADOR : ''),
      claveAnonima:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (esEntornoLocal ? CLAVE_MARCADOR : ''),
    },
    idiomas: {
      soportados: ['es', 'en'],
      porDefecto: 'es',
    },
    cifrado: {
      versionActual: 1,
    },
    sincronizacion: {
      intervaloMs: 5 * 60 * 1000,
      tamanoLote: 100,
      reintentosMaximos: 5,
    },
  });
}

export const configuracion: Configuracion = leerConfiguracion();

export const estaUsandoCredencialesDeMarcador =
  configuracion.supabase.url === URL_MARCADOR ||
  configuracion.supabase.claveAnonima === CLAVE_MARCADOR;
