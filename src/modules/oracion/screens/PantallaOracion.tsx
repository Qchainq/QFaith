// Pantalla de oracion. La estructura y el contenido completos llegan en la
// Fase 2 (Documento 11); en Fase 1 queda fijada la entrada del módulo.
import { useTranslation } from 'react-i18next';

import { PantallaBase } from '@shared/components/PantallaBase';

export function PantallaOracion() {
  const { t } = useTranslation();
  return <PantallaBase titulo={t('navegacion.oracion')} mensajeVacio={t('vacios.oraciones')} />;
}
