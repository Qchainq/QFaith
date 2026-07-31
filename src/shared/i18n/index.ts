// Internacionalización. Ningún componente escribe texto literal.
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { configuracion } from '@shared/constants/configuracion';

import en from './locales/en.json';
import es from './locales/es.json';

const recursos = {
  es: { translation: es },
  en: { translation: en },
} as const;

function idiomaDelDispositivo(): string {
  const preferido = getLocales()[0]?.languageCode ?? configuracion.idiomas.porDefecto;
  return configuracion.idiomas.soportados.includes(preferido)
    ? preferido
    : configuracion.idiomas.porDefecto;
}

export function inicializarI18n(): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: recursos,
      lng: idiomaDelDispositivo(),
      fallbackLng: configuracion.idiomas.porDefecto,
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18n;
}

export default i18n;
