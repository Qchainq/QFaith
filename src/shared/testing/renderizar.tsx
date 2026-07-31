// Ayudante de renderizado para las pruebas de componentes.
//
// Monta los mismos proveedores que la aplicación real, para que una pantalla
// se pruebe en las condiciones en que va a ejecutarse y no en un entorno
// artificial. No se incluye en la aplicación ni cuenta para cobertura.
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

function Proveedores({ children }: { readonly children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICAS}>
      <I18nextProvider i18n={i18n}>
        <ProveedorTema>{children}</ProveedorTema>
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
