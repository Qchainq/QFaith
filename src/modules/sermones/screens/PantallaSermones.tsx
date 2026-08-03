// Sermones y notas. Pantalla pura.
//
// El aviso de que las notas son privadas va arriba y siempre visible: es lo
// que permite escribir con libertad durante una predicación, y quien no lo
// sepa no lo hará.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { AccionSermon, NotaSermon } from '../models/sermon';
import type { SermonConNotas } from '../use-cases/gestionSermones';

export interface PropsPantallaSermones {
  readonly sermones: readonly SermonConNotas[];
  readonly notasSueltas: readonly NotaSermon[];
  readonly acciones: readonly AccionSermon[];
  readonly ilegibles: number;
  readonly cargando?: boolean;
  readonly alEscribirNota: (sermonId: string | null) => void;
  readonly alAbrirNota: (nota: NotaSermon) => void;
  readonly alNuevaAccion: () => void;
  readonly alAlternarHecha: (id: string) => void;
}

export function PantallaSermones({
  sermones,
  notasSueltas,
  acciones,
  ilegibles,
  cargando = false,
  alEscribirNota,
  alAbrirNota,
  alNuevaAccion,
  alAlternarHecha,
}: PropsPantallaSermones) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('sermones.titulo')} mensajeVacio={t('sermones.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('sermones.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto nivel="nota" tono="secundario">
          {t('sermones.descripcion')}
        </Texto>

        {ilegibles > 0 ? (
          <Texto nivel="nota" tono="secundario">
            {t('sermones.ilegibles', { count: ilegibles })}
          </Texto>
        ) : null}

        {sermones.length === 0 ? (
          <Texto nivel="texto" tono="secundario">
            {t('sermones.sinSermones')}
          </Texto>
        ) : (
          sermones.map(({ sermon, notas }) => (
            <Superficie key={sermon.id}>
              <Texto nivel="subtitulo">{sermon.titulo ?? t('sermones.titulo')}</Texto>
              <Texto nivel="nota" tono="tenue">
                {[sermon.predicador, sermon.fecha].filter(Boolean).join(' · ')}
              </Texto>
              {sermon.resumen === null ? null : (
                <Texto nivel="texto" tono="secundario" numberOfLines={3}>
                  {sermon.resumen}
                </Texto>
              )}

              {notas.map((nota) => (
                <View key={nota.id} style={{ marginTop: tema.espaciado.sm }}>
                  <Boton
                    variante="texto"
                    etiqueta={nota.texto.slice(0, 60)}
                    onPress={() => alAbrirNota(nota)}
                  />
                </View>
              ))}

              <View style={{ marginTop: tema.espaciado.sm }}>
                <Boton
                  variante="secundario"
                  etiqueta={t('sermones.nuevaNota')}
                  onPress={() => alEscribirNota(sermon.id)}
                />
              </View>
            </Superficie>
          ))
        )}

        <Superficie>
          <Texto nivel="subtitulo">{t('sermones.notasPropias')}</Texto>
          {notasSueltas.length === 0 ? (
            <Texto nivel="texto" tono="secundario">
              {t('sermones.sinNotas')}
            </Texto>
          ) : (
            notasSueltas.map((nota) => (
              <View key={nota.id} style={{ marginTop: tema.espaciado.xs }}>
                <Boton
                  variante="texto"
                  etiqueta={nota.texto.slice(0, 60)}
                  onPress={() => alAbrirNota(nota)}
                />
              </View>
            ))
          )}
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Boton
              variante="secundario"
              etiqueta={t('sermones.nuevaNota')}
              onPress={() => alEscribirNota(null)}
            />
          </View>
        </Superficie>

        <Superficie>
          <Texto nivel="subtitulo">{t('sermones.acciones.titulo')}</Texto>
          {acciones.length === 0 ? (
            <Texto nivel="texto" tono="secundario">
              {t('sermones.acciones.sinAcciones')}
            </Texto>
          ) : (
            acciones.map((accion) => (
              <View key={accion.id} style={{ marginTop: tema.espaciado.sm }}>
                <Texto nivel="texto">{accion.texto}</Texto>
                <Texto nivel="nota" tono="tenue">
                  {accion.fechaLimite ?? t('sermones.acciones.sinFecha')}
                </Texto>
                <Boton
                  variante={accion.completadaEn === null ? 'secundario' : 'texto'}
                  etiqueta={
                    accion.completadaEn === null
                      ? t('sermones.acciones.marcar')
                      : t('sermones.acciones.desmarcar')
                  }
                  onPress={() => alAlternarHecha(accion.id)}
                />
              </View>
            ))
          )}
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Boton
              variante="secundario"
              etiqueta={t('sermones.acciones.nueva')}
              onPress={alNuevaAccion}
            />
          </View>
        </Superficie>
      </ScrollView>
    </PantallaBase>
  );
}
