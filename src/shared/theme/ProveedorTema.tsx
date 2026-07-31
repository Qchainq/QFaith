// Proveedor del tema. Resuelve claro u oscuro según la preferencia del
// sistema y expone los tokens a toda la aplicación.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  coloresClaro,
  coloresOscuro,
  cristal,
  espaciado,
  movimiento,
  radios,
  tipografia,
  type TemaColores,
} from './tokens';

export interface Tema {
  readonly esOscuro: boolean;
  readonly colores: TemaColores;
  readonly espaciado: typeof espaciado;
  readonly radios: typeof radios;
  readonly tipografia: typeof tipografia;
  readonly movimiento: typeof movimiento;
  readonly cristal: typeof cristal;
}

const ContextoTema = createContext<Tema | undefined>(undefined);

export function ProveedorTema({ children }: { readonly children: ReactNode }) {
  const esquema = useColorScheme();
  const esOscuro = esquema === 'dark';

  const tema = useMemo<Tema>(
    () => ({
      esOscuro,
      colores: esOscuro ? coloresOscuro : coloresClaro,
      espaciado,
      radios,
      tipografia,
      movimiento,
      cristal,
    }),
    [esOscuro],
  );

  return <ContextoTema.Provider value={tema}>{children}</ContextoTema.Provider>;
}

export function useTema(): Tema {
  const tema = useContext(ContextoTema);
  if (tema === undefined) {
    throw new Error('useTema debe usarse dentro de ProveedorTema');
  }
  return tema;
}
