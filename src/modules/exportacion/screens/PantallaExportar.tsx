// Llevarte tu contenido. Pantalla pura.
//
// Tres cosas de esta pantalla son decisiones:
//
//   · **El aviso va antes de generar el archivo, no después.** Quien pulsa ya
//     sabe que va a tener toda su vida espiritual junta y legible en un
//     archivo. Avisar después sería avisar tarde.
//
//   · **Se dice que lo hace el teléfono y que nadie más puede hacerlo.** No es
//     una nota técnica: es la explicación de por qué esta pantalla existe aquí
//     y no en un panel de soporte.
//
//   · **Si algo no se puede abrir, se dice.** Entregar una copia incompleta
//     sin mencionarlo sería lo peor que puede hacer esta pantalla, porque
//     quien la usa antes de borrar su cuenta no tiene forma de comprobarlo.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Exportacion } from '../models/exportacion';

export interface PropsPantallaExportar {
  readonly exportacion: Exportacion | null;
  readonly generando?: boolean;
  readonly alGenerar: () => void;
  readonly alCompartir?: () => void;
}

export function PantallaExportar({
  exportacion,
  generando = false,
  alGenerar,
  alCompartir,
}: PropsPantallaExportar) {
  const { t } = useTranslation();
  const tema = useTema();

  const total =
    exportacion === null
      ? 0
      : Object.values(exportacion.resumen).reduce((suma, cuantos) => suma + cuantos, 0);

  return (
    <PantallaBase titulo={t('exportacion.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto>{t('exportacion.explicacion')}</Texto>

        {/* Antes de generarlo, no después. */}
        <Texto nivel="pie" tono="secundario">
          {t('exportacion.aviso')}
        </Texto>

        {exportacion === null ? (
          <Boton
            etiqueta={generando ? t('exportacion.generando') : t('exportacion.generar')}
            onPress={alGenerar}
            deshabilitado={generando}
          />
        ) : (
          <>
            <Texto nivel="subtitulo">{t('exportacion.listo')}</Texto>

            {exportacion.ilegiblesEnTotal > 0 && (
              <Texto nivel="pie" tono="error" accessibilityLiveRegion="polite">
                {t('exportacion.incompleta', { count: exportacion.ilegiblesEnTotal })}
              </Texto>
            )}

            <Texto nivel="subtitulo">{t('exportacion.resumen')}</Texto>
            {total === 0 ? (
              <Texto nivel="pie" tono="secundario">
                {t('exportacion.vacia')}
              </Texto>
            ) : (
              <Superficie estilo={{ gap: tema.espaciado.xs }}>
                {/* Solo los módulos con algo dentro: una lista de dieciocho
                    ceros no informa, agobia. */}
                {Object.entries(exportacion.resumen)
                  .filter(([, cuantos]) => cuantos > 0)
                  .map(([tipo, cuantos]) => (
                    <View key={tipo} style={{ flexDirection: 'row', gap: tema.espaciado.sm }}>
                      <Texto nivel="pie" tono="secundario">
                        {`${t(`exportacion.modulos.${tipo}`)}: ${cuantos}`}
                      </Texto>
                    </View>
                  ))}
              </Superficie>
            )}

            {alCompartir !== undefined && (
              <Boton etiqueta={t('exportacion.compartir')} onPress={alCompartir} />
            )}
          </>
        )}
      </ScrollView>
    </PantallaBase>
  );
}
