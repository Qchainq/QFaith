// Componente raíz. Solo monta proveedores: no contiene lógica de negocio ni
// consulta datos.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { inicializarI18n } from '@shared/i18n';
import { ProveedorTema } from '@shared/theme/ProveedorTema';

import { NavegacionRaiz } from './NavegacionRaiz';

const i18n = inicializarI18n();

function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Offline-first: los datos locales se muestran de inmediato y la red
        // solo refresca. Nunca se bloquea al usuario esperando al servidor.
        networkMode: 'offlineFirst',
        staleTime: 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
      mutations: {
        networkMode: 'offlineFirst',
      },
    },
  });
}

export default function App() {
  const clienteConsultas = useMemo(crearClienteConsultas, []);

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={clienteConsultas}>
          <ProveedorTema>
            <StatusBar style="auto" />
            <NavegacionRaiz />
          </ProveedorTema>
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
