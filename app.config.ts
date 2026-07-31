// Configuración de la aplicación. Todos los valores que cambian entre
// entornos llegan por variables de entorno; ninguno se escribe aquí en duro.
// Este archivo nunca debe contener secretos: solo la clave pública anónima de
// Supabase, que está pensada para vivir en el cliente y va acompañada de RLS.
import type { ExpoConfig } from 'expo/config';

type Entorno = 'development' | 'test' | 'staging' | 'production';

const entorno = (process.env.EXPO_PUBLIC_ENTORNO ?? 'development') as Entorno;

const sufijoPorEntorno: Record<Entorno, string> = {
  development: ' (dev)',
  test: ' (test)',
  staging: ' (staging)',
  production: '',
};

const identificadorPorEntorno: Record<Entorno, string> = {
  development: 'com.qchainq.qfaith.dev',
  test: 'com.qchainq.qfaith.test',
  staging: 'com.qchainq.qfaith.staging',
  production: 'com.qchainq.qfaith',
};

const config: ExpoConfig = {
  name: `QFaith${sufijoPorEntorno[entorno]}`,
  slug: 'qfaith',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'qfaith',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: identificadorPorEntorno[entorno],
    infoPlist: {
      // Justificación obligatoria del permiso, en el idioma del usuario.
      NSFaceIDUsageDescription:
        'QFaith usa Face ID para desbloquear tu contenido privado en este dispositivo.',
    },
  },
  android: {
    package: identificadorPorEntorno[entorno],
  },
  plugins: [
    'expo-localization',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'QFaith usa Face ID para desbloquear tu contenido privado.',
      },
    ],
  ],
  extra: {
    entorno,
  },
};

export default config;
