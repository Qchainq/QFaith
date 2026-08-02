// Estado global de sesión. Zustand se reserva para lo que de verdad es
// global (Documento 2): quién ha entrado, si el contenido privado está
// desbloqueado y en qué punto del alta estamos.
//
// Aquí nunca se guarda material de clave ni contenido descifrado: las claves
// viven en el servicio de claves y los datos en React Query o en la base
// local.
import { create } from 'zustand';

/**
 * Fases por las que pasa el arranque de la aplicación.
 *
 * `bloqueada` es distinto de `sinSesion`: hay cuenta y claves en este
 * dispositivo, pero el contenido privado sigue cifrado hasta que el usuario
 * se identifique.
 */
export type FaseSesion =
  | 'comprobando'
  | 'onboarding'
  | 'sinSesion'
  | 'preparandoCuenta'
  | 'mostrandoFrase'
  | 'restaurando'
  | 'bloqueada'
  | 'lista';

export interface UsuarioSesion {
  readonly id: string;
  readonly correo: string;
}

interface EstadoSesion {
  readonly fase: FaseSesion;
  readonly usuario: UsuarioSesion | null;
  /** Solo mientras se muestra al usuario durante el alta; después se olvida. */
  readonly fraseRecuperacionPendiente: string | null;

  irAOnboarding(): void;
  irASinSesion(): void;
  comenzarAltaDeCuenta(): void;
  /**
   * Fija el usuario y muestra la frase en **una sola actualización**.
   *
   * Antes había que abrir la sesión para dejar el usuario en el estado, y eso
   * hacía pasar la fase por `lista` durante un instante: el contenido privado
   * llegaba a montarse antes de que la persona hubiera anotado su frase.
   */
  prepararFrase(usuario: UsuarioSesion, frase: string): void;
  confirmarFraseGuardada(): void;
  comenzarRestauracion(): void;
  abrirSesion(usuario: UsuarioSesion): void;
  bloquear(): void;
  cerrarSesion(): void;
}

export const useEstadoSesion = create<EstadoSesion>((set) => ({
  fase: 'comprobando',
  usuario: null,
  fraseRecuperacionPendiente: null,

  irAOnboarding: () => set({ fase: 'onboarding' }),
  irASinSesion: () => set({ fase: 'sinSesion' }),
  comenzarAltaDeCuenta: () => set({ fase: 'preparandoCuenta' }),

  prepararFrase: (usuario, frase) =>
    set({ fase: 'mostrandoFrase', usuario, fraseRecuperacionPendiente: frase }),

  // En cuanto el usuario confirma que la anotó, la frase deja de estar en
  // memoria. No se guarda en ningún sitio ni se puede volver a consultar.
  confirmarFraseGuardada: () => set({ fraseRecuperacionPendiente: null, fase: 'lista' }),

  comenzarRestauracion: () => set({ fase: 'restaurando' }),
  abrirSesion: (usuario) => set({ fase: 'lista', usuario }),
  bloquear: () => set({ fase: 'bloqueada' }),

  cerrarSesion: () => set({ fase: 'sinSesion', usuario: null, fraseRecuperacionPendiente: null }),
}));
