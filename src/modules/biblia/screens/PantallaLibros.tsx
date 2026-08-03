// Elegir traducción y libro. Pantalla pura.
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Libro, Traduccion } from '../models/biblia';

export interface PropsPantallaLibros {
  readonly traducciones: readonly Traduccion[];
  readonly traduccionActiva: Traduccion | null;
  readonly libros: readonly Libro[];
  readonly cargando?: boolean;
  readonly error?: boolean;
  readonly alElegirTraduccion: (traduccion: Traduccion) => void;
  readonly alAbrirLibro: (libro: Libro) => void;
  readonly alReintentar?: () => void;
}

export function PantallaLibros({
  traducciones,
  traduccionActiva,
  libros,
  cargando = false,
  error = false,
  alElegirTraduccion,
  alAbrirLibro,
  alReintentar,
}: PropsPantallaLibros) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('biblia.titulo')} mensajeVacio={t('biblia.cargandoLibros')} />;
  }

  if (error) {
    return (
      <PantallaBase titulo={t('biblia.titulo')}>
        <Texto nivel="texto" tono="secundario">
          {t('biblia.sinConexion')}
        </Texto>
        {alReintentar === undefined ? null : (
          <View style={{ marginTop: tema.espaciado.lg }}>
            <Boton etiqueta={t('comun.reintentar')} onPress={alReintentar} />
          </View>
        )}
      </PantallaBase>
    );
  }

  if (traduccionActiva === null) {
    return (
      <PantallaBase titulo={t('biblia.titulo')}>
        <Texto nivel="texto" tono="secundario">
          {t('biblia.elegirTraduccion')}
        </Texto>
        <FlatList
          style={{ marginTop: tema.espaciado.lg }}
          data={traducciones}
          keyExtractor={(traduccion) => traduccion.id}
          ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.sm }} />}
          ListEmptyComponent={
            <Texto nivel="texto" tono="secundario">
              {t('biblia.sinTraducciones')}
            </Texto>
          }
          renderItem={({ item }) => (
            <Boton
              variante="secundario"
              etiqueta={item.nombre}
              onPress={() => alElegirTraduccion(item)}
            />
          )}
        />
      </PantallaBase>
    );
  }

  return (
    <PantallaBase titulo={traduccionActiva.nombre}>
      <FlatList
        data={libros}
        keyExtractor={(libro) => libro.codigo}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.sm }} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.nombre}
            onPress={() => alAbrirLibro(item)}
          >
            <Superficie>
              <Texto nivel="subtitulo">{item.nombre}</Texto>
              <Texto nivel="nota" tono="secundario">
                {item.testamento === 'nuevo'
                  ? t('biblia.nuevoTestamento')
                  : t('biblia.antiguoTestamento')}
              </Texto>
            </Superficie>
          </Pressable>
        )}
      />
    </PantallaBase>
  );
}
