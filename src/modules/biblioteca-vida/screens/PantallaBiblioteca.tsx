// Recorrido clasificado. Pantalla pura.
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { TEMAS, type ElementoBiblioteca } from '../models/biblioteca';

export interface PropsPantallaBiblioteca {
  readonly elementos: readonly ElementoBiblioteca[];
  readonly ilegibles: number;
  readonly temaActivo: string | null;
  readonly cargando?: boolean;
  readonly organizando?: boolean;
  readonly alElegirTema: (tema: string | null) => void;
  readonly alOrganizar: () => void;
}

export function PantallaBiblioteca({
  elementos,
  ilegibles,
  temaActivo,
  cargando = false,
  organizando = false,
  alElegirTema,
  alOrganizar,
}: PropsPantallaBiblioteca) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('biblioteca.titulo')} mensajeVacio={t('biblioteca.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('biblioteca.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('biblioteca.descripcion')}
      </Texto>
      <Texto nivel="nota" tono="tenue">
        {t('biblioteca.clasificacionLocal')}
      </Texto>

      {ilegibles > 0 ? (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Texto nivel="nota" tono="secundario">
            {t('biblioteca.ilegibles', { count: ilegibles })}
          </Texto>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: tema.espaciado.md }}
      >
        <Boton
          variante={temaActivo === null ? 'primario' : 'texto'}
          etiqueta={t('biblioteca.todos')}
          onPress={() => alElegirTema(null)}
        />
        {TEMAS.map((nombre) => (
          <View key={nombre} style={{ marginLeft: tema.espaciado.sm }}>
            <Boton
              variante={temaActivo === nombre ? 'primario' : 'texto'}
              etiqueta={t(`biblioteca.temas.${nombre}`)}
              onPress={() => alElegirTema(nombre)}
            />
          </View>
        ))}
      </ScrollView>

      <FlatList
        style={{ marginTop: tema.espaciado.md }}
        data={elementos}
        keyExtractor={(elemento) => elemento.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.md }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('biblioteca.sinElementos')}
          </Texto>
        }
        renderItem={({ item }) => (
          <Superficie>
            <Texto nivel="subtitulo">{item.titulo}</Texto>
            <Texto nivel="nota" tono="secundario">
              {t(`biblioteca.origenes.${item.origen}`)}
            </Texto>
            <Texto nivel="texto" tono="secundario" numberOfLines={2}>
              {item.resumen}
            </Texto>
            {item.temas.length === 0 ? null : (
              <Texto nivel="nota" tono="tenue">
                {item.temas.map((nombre) => t(`biblioteca.temas.${nombre}`)).join(' · ')}
              </Texto>
            )}
          </Superficie>
        )}
      />

      <View style={{ marginTop: 'auto', paddingBottom: tema.espaciado.lg }}>
        <Boton
          etiqueta={organizando ? t('biblioteca.organizando') : t('biblioteca.organizar')}
          onPress={alOrganizar}
          cargando={organizando}
        />
      </View>
    </PantallaBase>
  );
}
