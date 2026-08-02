// Ayudante de renderizado para las pruebas de componentes.
//
// Monta los mismos proveedores que la aplicación real, para que una pantalla
// se pruebe en las condiciones en que va a ejecutarse y no en un entorno
// artificial. No se incluye en la aplicación ni cuenta para cobertura.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { inicializarI18n } from '@shared/i18n';
import { ProveedorTema } from '@shared/theme/ProveedorTema';

const i18n = inicializarI18n();

/** Márgenes fijos: las pruebas no deben depender del recorte de un modelo. */
const METRICAS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Cliente de consultas por prueba.
 *
 * Sin reintentos y sin caché entre pruebas: un reintento convertiría un fallo
 * en una espera, y una caché compartida haría que el orden de las pruebas
 * cambiara el resultado.
 */
const clientesCreados: QueryClient[] = [];

function crearClientePruebas(): QueryClient {
  const cliente = new QueryClient({
    defaultOptions: {
      // `gcTime: 0` en ambos. El de las **mutaciones** es el que importa: por
      // defecto son cinco minutos, y ese temporizador mantiene vivo el proceso
      // de Jest hasta que lo mata a la fuerza. Cuesta encontrarlo porque el
      // aviso habla de «fugas» y apunta a la última prueba que corrió, no a la
      // mutación que lo programó.
      queries: { retry: false, gcTime: 0, networkMode: 'offlineFirst' },
      mutations: { retry: false, gcTime: 0, networkMode: 'offlineFirst' },
    },
  });
  clientesCreados.push(cliente);
  return cliente;
}

// React Query deja temporizadores de recolección y suscripciones al foco. Sin
// cerrarlos, Jest tiene que matar el proceso al terminar, y un aviso así
// esconde con facilidad una fuga de verdad.
afterEach(() => {
  // `cleanup` de la librería de pruebas desmonta los componentes en su propio
  // `afterEach`, y Jest los ejecuta en orden inverso al de registro: este
  // corre antes. Por eso solo se vacía la caché; desmontar el cliente con los
  // componentes todavía montados los dejaría resuscribiéndose.
  clientesCreados.splice(0).forEach((cliente) => cliente.clear());
});

function Proveedores({ children }: { readonly children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICAS}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={crearClientePruebas()}>
          <ProveedorTema>{children}</ProveedorTema>
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

export function renderizar(elemento: ReactElement, opciones?: Omit<RenderOptions, 'wrapper'>) {
  return render(elemento, { wrapper: Proveedores, ...opciones });
}

/** Cambia el idioma dentro de una prueba, por ejemplo para revisar textos. */
export async function usarIdioma(idioma: 'es' | 'en'): Promise<void> {
  await i18n.changeLanguage(idioma);
}
