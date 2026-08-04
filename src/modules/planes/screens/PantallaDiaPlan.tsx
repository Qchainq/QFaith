// Un día de un plan. Pantalla pura.
//
// El día se lee, se piensa y, si a la persona le apetece, se escribe. Las tres
// cosas en ese orden y ninguna obligatoria: **la reflexión es opcional y se
// dice**, porque una caja de texto sin más invita a pensar que hay que
// rellenarla.
//
// El botón dice «marcar como leído», no «completar»: leer no es cumplir.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { DiaCompletado, DiaPlan } from '../models/plan';

export interface PropsPantallaDiaPlan {
  readonly dia: DiaPlan | null;
  readonly leido: DiaCompletado | null;
  readonly cargando?: boolean;
  readonly guardando?: boolean;
  readonly alMarcarLeido: (reflexion: string) => void;
  readonly alVolver: () => void;
}

export function PantallaDiaPlan({
  dia,
  leido,
  cargando = false,
  guardando = false,
  alMarcarLeido,
  alVolver,
}: PropsPantallaDiaPlan) {
  const { t } = useTranslation();
  const tema = useTema();
  const [reflexion, setReflexion] = useState(leido?.reflexion ?? '');

  if (cargando || dia === null) {
    return <PantallaBase titulo={t('planes.titulo')} mensajeVacio={t('comun.cargando')} />;
  }

  const yaLeido = leido !== null && leido.completadoEn !== null;

  return (
    <PantallaBase titulo={dia.titulo.length > 0 ? dia.titulo : t('planes.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        {dia.referencias.length > 0 && (
          <Superficie estilo={{ gap: tema.espaciado.xs }}>
            <Texto nivel="pie" tono="secundario">
              {t('planes.pasajes')}
            </Texto>
            {dia.referencias.map((referencia) => (
              <Texto key={`${referencia.libro}-${referencia.capitulo}`} espiritual>
                {referencia.versiculoInicial === undefined
                  ? `${referencia.libro} ${referencia.capitulo}`
                  : `${referencia.libro} ${referencia.capitulo}:${referencia.versiculoInicial}` +
                    (referencia.versiculoFinal === undefined
                      ? ''
                      : `-${referencia.versiculoFinal}`)}
              </Texto>
            ))}
          </Superficie>
        )}

        {dia.contenido.length > 0 && <Texto>{dia.contenido}</Texto>}

        {dia.preguntas.length > 0 && (
          <View style={{ gap: tema.espaciado.xs }}>
            <Texto nivel="subtitulo">{t('planes.preguntas')}</Texto>
            {dia.preguntas.map((pregunta) => (
              <Texto key={pregunta} nivel="pie" tono="secundario">
                {pregunta}
              </Texto>
            ))}
          </View>
        )}

        {/* La etiqueta dice «opcional». Sin eso, la caja sola se lee como
            deber. */}
        <CampoTexto
          etiqueta={t('planes.reflexion')}
          value={reflexion}
          onChangeText={setReflexion}
          multiline
        />

        <Boton
          etiqueta={
            guardando
              ? t('planes.marcando')
              : yaLeido
                ? t('planes.guardarReflexion')
                : t('planes.marcarLeido')
          }
          onPress={() => alMarcarLeido(reflexion)}
          deshabilitado={guardando}
        />

        <Boton variante="texto" etiqueta={t('comun.volver')} onPress={alVolver} />
      </ScrollView>
    </PantallaBase>
  );
}
