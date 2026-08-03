// Cronología del Memorial. Pantalla pura.
//
// Se agrupa por años porque así se lee: «lo de 2025», «lo de 2024». Los
// memoriales sin fecha van en su propio tramo al final, nunca repartidos en
// un año que nadie eligió.
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Memorial } from '../models/memorial';
import type { TramoCronologia } from '../use-cases/gestionMemoriales';

export interface PropsPantallaMemorial {
  readonly tramos: readonly TramoCronologia[];
  readonly ilegibles: number;
  readonly soloFavoritos: boolean;
  readonly cargando?: boolean;
  readonly alCrear: () => void;
  readonly alAbrir: (memorial: Memorial) => void;
  readonly alAlternarFavorito: (id: string) => void;
  readonly alFiltrar: (soloFavoritos: boolean) => void;
}

export function PantallaMemorial({
  tramos,
  ilegibles,
  soloFavoritos,
  cargando = false,
  alCrear,
  alAbrir,
  alAlternarFavorito,
  alFiltrar,
}: PropsPantallaMemorial) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('memorial.titulo')} mensajeVacio={t('memorial.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('memorial.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('memorial.descripcion')}
      </Texto>

      {ilegibles > 0 ? (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Texto nivel="nota" tono="secundario">
            {t('memorial.ilegibles', { count: ilegibles })}
          </Texto>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: tema.espaciado.md }}
      >
        <Boton
          variante={soloFavoritos ? 'texto' : 'primario'}
          etiqueta={t('memorial.todos')}
          onPress={() => alFiltrar(false)}
        />
        <View style={{ marginLeft: tema.espaciado.sm }}>
          <Boton
            variante={soloFavoritos ? 'primario' : 'texto'}
            etiqueta={t('memorial.favoritos')}
            onPress={() => alFiltrar(true)}
          />
        </View>
      </ScrollView>

      <FlatList
        style={{ marginTop: tema.espaciado.md }}
        data={tramos}
        keyExtractor={(tramo) => tramo.ano ?? 'sin-fecha'}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.lg }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('memorial.sinMemoriales')}
          </Texto>
        }
        renderItem={({ item: tramo }) => (
          <View>
            <Texto nivel="subtitulo">{tramo.ano ?? t('memorial.sinFecha')}</Texto>

            {tramo.memoriales.map((memorial) => (
              <View key={memorial.id} style={{ marginTop: tema.espaciado.sm }}>
                <Superficie>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={memorial.titulo}
                    onPress={() => alAbrir(memorial)}
                  >
                    <Texto nivel="subtitulo">{memorial.titulo}</Texto>
                    {memorial.ocurrioEl === null ? null : (
                      <Texto nivel="nota" tono="tenue">
                        {memorial.ocurrioEl}
                      </Texto>
                    )}
                    <Texto nivel="texto" tono="secundario" numberOfLines={3}>
                      {memorial.relato}
                    </Texto>
                    {memorial.peticionId === null ? null : (
                      <Texto nivel="nota" tono="tenue">
                        {t('memorial.desdeOracion')}
                      </Texto>
                    )}
                  </Pressable>

                  <View style={{ marginTop: tema.espaciado.sm }}>
                    <Boton
                      variante="texto"
                      etiqueta={
                        memorial.favorito
                          ? t('memorial.quitarFavorito')
                          : t('memorial.marcarFavorito')
                      }
                      onPress={() => alAlternarFavorito(memorial.id)}
                    />
                  </View>
                </Superficie>
              </View>
            ))}
          </View>
        )}
      />

      <View style={[styles.acciones, { paddingBottom: tema.espaciado.lg }]}>
        <Boton etiqueta={t('memorial.nuevo')} onPress={alCrear} />
      </View>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  acciones: { marginTop: 'auto' },
});
