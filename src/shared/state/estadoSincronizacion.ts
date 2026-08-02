// Estado global de la sincronización.
//
// Es de los pocos que merecen ser globales (Documento 2): la barra de estado,
// el indicador de pendientes y cualquier pantalla que muestre «guardado en
// este dispositivo» leen de aquí.
//
// **Nunca contiene datos del usuario**, solo recuentos y marcas de tiempo. Un
// estado global con contenido descifrado dentro sería una fuga esperando a
// ocurrir.
import { create } from 'zustand';

export type FaseSincronizacion = 'inactiva' | 'sincronizando' | 'error';

interface EstadoSincronizacion {
  readonly fase: FaseSincronizacion;
  /** Instante de la última sincronización correcta, en UTC. */
  readonly ultimaCorrecta: string | null;
  readonly cambiosSubidos: number;
  readonly cambiosRecibidos: number;
  /** Conflictos que esperan una decisión del usuario. */
  readonly conflictosPendientes: number;
  /**
   * Clave de i18n del último error. Nunca el mensaje técnico: puede llevar
   * dentro identificadores o rutas (invariante 2).
   */
  readonly claveError: string | null;

  comenzar(): void;
  terminar(resumen: {
    readonly enviados: number;
    readonly recibidos: number;
    readonly conflictos: number;
    readonly instante: string;
  }): void;
  fallar(claveError: string): void;
  reiniciar(): void;
}

const INICIAL = {
  fase: 'inactiva' as const,
  ultimaCorrecta: null,
  cambiosSubidos: 0,
  cambiosRecibidos: 0,
  conflictosPendientes: 0,
  claveError: null,
};

export const useEstadoSincronizacion = create<EstadoSincronizacion>((set) => ({
  ...INICIAL,

  comenzar: () => set({ fase: 'sincronizando', claveError: null }),

  terminar: (resumen) =>
    set({
      fase: 'inactiva',
      ultimaCorrecta: resumen.instante,
      cambiosSubidos: resumen.enviados,
      cambiosRecibidos: resumen.recibidos,
      conflictosPendientes: resumen.conflictos,
      claveError: null,
    }),

  // Un fallo de sincronización no es un fallo del usuario ni le interrumpe:
  // su cambio ya está guardado en local (invariante 4). Solo se anota.
  fallar: (claveError) => set({ fase: 'error', claveError }),

  reiniciar: () => set(INICIAL),
}));
