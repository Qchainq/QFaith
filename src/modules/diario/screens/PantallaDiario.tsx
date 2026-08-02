// Lista del Diario.
//
// Es una pantalla tonta a propósito: pide los datos al hook y pinta. No sabe
// que existe una base local, ni un motor, ni Supabase.
//
// Cubre los cuatro estados que exige la definición de terminado: cargando,
// vacío, error y con contenido.
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { EntradaDiario } from '../models/entradaDiario';
import { useEntradasDiario } from '../hooks/useDiario';

export interface PropsPantallaDiario {
  readonly alCrear: () => void;
  readonly alAbrir: (entrada: EntradaDiario) => void;
}

export function PantallaDiario({ alCrear, alAbrir }: PropsPantallaDiario) {
  const { t } = useTranslation();
  const tema = useTema();
  const consulta = useEntradasDiario();

  if (consulta.isPending) {
    return <PantallaBase titulo={t('diario.titulo')} mensajeVacio={t('diario.cargando')} />;
  }

  if (consulta.isError) {
    return (
      <PantallaBase titulo={t('diario.titulo')}>
        <Texto nivel="texto" tono="secundario">
          {t('errores.generico')}
        </Texto>
        <View style={{ marginTop: tema.espaciado.lg }}>
          <Boton etiqueta={t('comun.reintentar')} onPress={() => void consulta.refetch()} />
        </View>
      </PantallaBase>
    );
  }

  const { entradas, ilegibles } = consulta.data;

  return (
    <PantallaBase titulo={t('diario.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('diario.descripcion')}
      </Texto>

      {ilegibles > 0 ? (
        // No se esconden: a quien le falte una entrada le corresponde saberlo.
        <View style={{ marginTop: tema.espaciado.md }}>
          <Texto nivel="nota" tono="secundario">
            {t('diario.ilegibles', { count: ilegibles })}
          </Texto>
        </View>
      ) : null}

      <FlatList
        style={{ marginTop: tema.espaciado.lg }}
        data={entradas}
        keyExtractor={(entrada) => entrada.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.md }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('diario.sinEntradas')}
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
                {`${item.fecha} · ${t(`diario.tipos.${item.tipo}`)}`}
              </Texto>
              <Texto nivel="texto" tono="secundario" numberOfLines={2}>
                {item.cuerpo}
              </Texto>
            </Superficie>
          </Pressable>
        )}
      />

      <View style={[styles.acciones, { paddingBottom: tema.espaciado.lg }]}>
        <Boton etiqueta={t('diario.nueva')} onPress={alCrear} />
      </View>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  acciones: { marginTop: 'auto' },
});
