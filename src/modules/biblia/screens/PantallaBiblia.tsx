// Pantalla de biblia. La estructura y el contenido completos llegan en la
// Fase 2 (Documento 11); en Fase 1 queda fijada la entrada del módulo.
import { useTranslation } from 'react-i18next';

import { PantallaBase } from '@shared/components/PantallaBase';

export function PantallaBiblia() {
  const { t } = useTranslation();
  return <PantallaBase titulo={t('navegacion.biblia')} mensajeVacio={t('comun.cargando')} />;
}
