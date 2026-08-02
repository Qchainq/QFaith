// Cliente de Supabase. **Único archivo del proyecto que importa el SDK.**
//
// Invariante 10: ninguna pantalla, caso de uso ni repositorio de dominio
// habla con Supabase directamente. ESLint lo impone: `no-restricted-imports`
// prohíbe `@supabase/supabase-js` fuera de esta carpeta.
//
// Del SDK solo se aprovecha la parte de autenticación, que es la que aporta
// algo difícil de replicar bien: refresco de tokens antes de que caduquen y
// notificación de cambios de sesión. Las lecturas y escrituras de datos van
// por PostgREST directamente (ver `rest.ts`), donde se necesita control fino
// sobre las cabeceras `Prefer` y sobre los filtros de versión que implementan
// el control de concurrencia optimista.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { configuracion } from '@shared/constants/configuracion';

import { almacenamientoSesionSegura } from './almacenamientoSesion';

let cliente: SupabaseClient | null = null;

export function clienteSupabase(): SupabaseClient {
  if (cliente === null) {
    cliente = createClient(configuracion.supabase.url, configuracion.supabase.claveAnonima, {
      auth: {
        storage: almacenamientoSesionSegura,
        autoRefreshToken: true,
        persistSession: true,
        // En una aplicación nativa no hay redirecciones con el token en la
        // URL; activarlo solo abriría una vía de entrada que no usamos.
        detectSessionInUrl: false,
      },
    });
  }
  return cliente;
}

/** Solo para pruebas: descarta la instancia memorizada. */
export function reiniciarClienteSupabase(): void {
  cliente = null;
}
