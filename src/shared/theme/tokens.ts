// Tokens del Design System Liquid Glass (Documento 3).
//
// Ningún componente define colores, tamaños ni radios por su cuenta: todo
// sale de aquí. El modo oscuro no invierte el claro, se diseña aparte.

export const paleta = {
  // Azul profundo: acción principal, enlaces, estado activo.
  azul: {
    50: '#EEF3FB',
    100: '#D3E0F4',
    300: '#7FA3DC',
    500: '#2F5DA8',
    700: '#1D3E77',
    900: '#12274B',
  },
  // Verde oliva suave: hábitos, progreso, respuestas de oración.
  oliva: {
    100: '#E8EDDF',
    300: '#BFCB9E',
    500: '#8A9A5B',
    700: '#5F6B3E',
  },
  // Dorado tenue: solo detalles pequeños. Nunca brillante, nunca de fondo.
  dorado: {
    300: '#E3D3A8',
    500: '#C9AE6C',
  },
  neutro: {
    0: '#FFFFFF',
    50: '#FAF9F7', // blanco cálido
    100: '#F2F1EE',
    200: '#E4E2DD',
    400: '#A8A59E',
    600: '#6B6862',
    800: '#2E2C29',
    900: '#1C1B19', // negro grafito
  },
  noche: {
    700: '#16203A',
    800: '#101728',
    900: '#0A0F1C', // azul noche
  },
  // Estados. Nunca saturados; siempre acompañados de icono o texto.
  exito: { claro: '#3F7D52', oscuro: '#7FBF92' },
  advertencia: { claro: '#A8762A', oscuro: '#E0B369' },
  error: { claro: '#A5484A', oscuro: '#E29193' },
  informacion: { claro: '#2F5DA8', oscuro: '#8AB0E8' },
} as const;

export interface TemaColores {
  readonly fondo: string;
  readonly fondoElevado: string;
  readonly cristal: string;
  readonly cristalBorde: string;
  readonly textoPrincipal: string;
  readonly textoSecundario: string;
  readonly textoTenue: string;
  readonly acento: string;
  readonly acentoContraste: string;
  readonly secundario: string;
  readonly espiritual: string;
  readonly exito: string;
  readonly advertencia: string;
  readonly error: string;
  readonly informacion: string;
  readonly separador: string;
}

export const coloresClaro: TemaColores = {
  fondo: paleta.neutro[50],
  fondoElevado: paleta.neutro[0],
  // El cristal es translúcido a propósito: nunca una tarjeta opaca.
  cristal: 'rgba(255, 255, 255, 0.72)',
  cristalBorde: 'rgba(28, 27, 25, 0.08)',
  textoPrincipal: paleta.neutro[900],
  textoSecundario: paleta.neutro[600],
  textoTenue: paleta.neutro[400],
  acento: paleta.azul[500],
  acentoContraste: paleta.neutro[0],
  secundario: paleta.oliva[500],
  espiritual: paleta.dorado[500],
  exito: paleta.exito.claro,
  advertencia: paleta.advertencia.claro,
  error: paleta.error.claro,
  informacion: paleta.informacion.claro,
  separador: paleta.neutro[200],
};

export const coloresOscuro: TemaColores = {
  fondo: paleta.noche[900],
  fondoElevado: paleta.noche[800],
  cristal: 'rgba(22, 32, 58, 0.62)',
  cristalBorde: 'rgba(255, 255, 255, 0.10)',
  textoPrincipal: '#F1EFEA',
  textoSecundario: '#B4B1AA',
  textoTenue: '#7C7973',
  acento: paleta.azul[300],
  acentoContraste: paleta.noche[900],
  secundario: paleta.oliva[300],
  espiritual: paleta.dorado[300],
  exito: paleta.exito.oscuro,
  advertencia: paleta.advertencia.oscuro,
  error: paleta.error.oscuro,
  informacion: paleta.informacion.oscuro,
  separador: 'rgba(255, 255, 255, 0.12)',
};

/** Cuadrícula de espaciado. La aplicación debe respirar. */
export const espaciado = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Nunca esquinas completamente rectas. */
export const radios = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  completo: 999,
} as const;

export const tipografia = {
  familias: {
    // Inter para todo el producto.
    texto: 'Inter',
    // Merriweather solo para títulos espirituales. Nunca una tercera familia.
    espiritual: 'Merriweather',
  },
  escala: {
    tituloPrincipal: { tamano: 30, alturaLinea: 38, peso: '700' },
    tituloSecundario: { tamano: 23, alturaLinea: 30, peso: '600' },
    subtitulo: { tamano: 18, alturaLinea: 25, peso: '600' },
    texto: { tamano: 16, alturaLinea: 24, peso: '400' },
    nota: { tamano: 14, alturaLinea: 20, peso: '400' },
    pie: { tamano: 12, alturaLinea: 17, peso: '400' },
  },
} as const;

/** Movimiento lento, natural y elegante. Nunca rebotes exagerados. */
export const movimiento = {
  duracion: { rapida: 160, normal: 260, lenta: 420 },
  // Curva suave de entrada y salida, sin sobreimpulso.
  curva: [0.32, 0.72, 0.24, 1] as const,
} as const;

export const cristal = {
  intensidadDesenfoque: 24,
  sombra: {
    shadowColor: paleta.neutro[900],
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

/** Área táctil mínima recomendada por las guías de accesibilidad. */
export const AREA_TACTIL_MINIMA = 44;
