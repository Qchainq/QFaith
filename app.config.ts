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
  // iOS y Android, y nada más. Declararlo no es un formalismo: sin esto,
  // `expo export --platform all` intenta empaquetar también para web y falla
  // al resolver el WebAssembly de SQLite, que es un módulo que este proyecto
  // no usa y que nadie va a arreglar porque no hay versión web.
  platforms: ['ios', 'android'],
  // Que decida el dispositivo. Estaba bloqueado en vertical, que es el valor
  // con que nace cualquier proyecto de Expo, y el Documento 14 pide
  // «orientación horizontal en pantallas compatibles». Con `supportsTablet`
  // activado, un iPad bloqueado en vertical es además de las primeras cosas
  // que mira quien revisa la aplicación en la tienda.
  //
  // La adaptación a horizontal existe y está probada —`dimensiones.ts`
  // recorta el margen de arriba, que es lo escaso al girar, y mantiene el de
  // los lados—, así que esto no abre un caso sin cubrir: lo activa.
  orientation: 'default',
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
