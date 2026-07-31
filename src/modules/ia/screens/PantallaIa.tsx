// Pantalla de ia. La estructura y el contenido completos llegan en la
// Fase 2 (Documento 11); en Fase 1 queda fijada la entrada del módulo.
import { useTranslation } from 'react-i18next';

import { PantallaBase } from '@shared/components/PantallaBase';

export function PantallaIa() {
  const { t } = useTranslation();
  return <PantallaBase titulo={t('navegacion.ia')} mensajeVacio={t('comun.cargando')} />;
}
