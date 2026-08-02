// Lista de peticiones. Pantalla pura: recibe datos y devuelve acciones.
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Peticion } from '../models/peticion';
import { usePeticiones } from '../hooks/useOracion';

export interface PropsPantallaListaOracion {
  readonly alCrear: () => void;
  readonly alAbrir: (peticion: Peticion) => void;
}

export function PantallaListaOracion({ alCrear, alAbrir }: PropsPantallaListaOracion) {
  const { t } = useTranslation();
  const tema = useTema();
  const consulta = usePeticiones();

  if (consulta.isPending) {
    return <PantallaBase titulo={t('oracion.titulo')} mensajeVacio={t('oracion.cargando')} />;
  }

  if (consulta.isError) {
    return (
      <PantallaBase titulo={t('oracion.titulo')}>
        <Texto nivel="texto" tono="secundario">
          {t('errores.generico')}
        </Texto>
        <View style={{ marginTop: tema.espaciado.lg }}>
          <Boton etiqueta={t('comun.reintentar')} onPress={() => void consulta.refetch()} />
        </View>
      </PantallaBase>
    );
  }

  const { peticiones, ilegibles } = consulta.data;

  return (
    <PantallaBase titulo={t('oracion.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('oracion.descripcion')}
      </Texto>

      {ilegibles > 0 ? (
        <View style={{ marginTop: tema.espaciado.md }}>
          <Texto nivel="nota" tono="secundario">
            {t('oracion.ilegibles', { count: ilegibles })}
          </Texto>
        </View>
      ) : null}

      <FlatList
        style={{ marginTop: tema.espaciado.lg }}
        data={peticiones}
        keyExtractor={(peticion) => peticion.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.md }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('oracion.sinPeticiones')}
          </Texto>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.titulo}
            onPress={() => alAbrir(item)}
          >
            <Superficie>
              <Texto nivel="subtitulo">{item.titulo}</Texto>
              <Texto nivel="nota" tono="secundario">
                {item.categoria === null
                  ? t(`oracion.estados.${item.estado}`)
                  : `${t(`oracion.estados.${item.estado}`)} · ${t(`oracion.categorias.${item.categoria}`)}`}
              </Texto>
              {item.detalle.length === 0 ? null : (
                <Texto nivel="texto" tono="secundario" numberOfLines={2}>
                  {item.detalle}
                </Texto>
              )}
            </Superficie>
          </Pressable>
        )}
      />

      <View style={[styles.acciones, { paddingBottom: tema.espaciado.lg }]}>
        <Boton etiqueta={t('oracion.nueva')} onPress={alCrear} />
      </View>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  acciones: { marginTop: 'auto' },
});
