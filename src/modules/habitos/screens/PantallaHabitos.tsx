// Lista de hábitos con la acción del día.
//
// Cada tarjeta muestra lo cumplido, nunca lo fallado. No hay rachas, no hay
// «llevas X días sin» y no hay color de alarma: el Documento 13 lo prohíbe y
// además no ayuda a nadie.
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import type { Habito } from '../models/habito';
import type { ResumenHabito } from '../use-cases/gestionHabitos';

export interface PropsPantallaHabitos {
  readonly habitos: readonly Habito[];
  readonly resumenes: Readonly<Record<string, ResumenHabito | undefined>>;
  readonly ilegibles: number;
  readonly cargando?: boolean;
  readonly error?: boolean;
  readonly alCrear: () => void;
  readonly alAbrir: (habito: Habito) => void;
  readonly alAlternarHoy: (habitoId: string) => void;
  readonly alReintentar?: () => void;
}

export function PantallaHabitos({
  habitos,
  resumenes,
  ilegibles,
  cargando = false,
  error = false,
  alCrear,
  alAbrir,
  alAlternarHoy,
  alReintentar,
}: PropsPantallaHabitos) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('habitos.titulo')} mensajeVacio={t('habitos.cargando')} />;
  }

  if (error) {
    return (
      <PantallaBase titulo={t('habitos.titulo')}>
        <Texto nivel="texto" tono="secundario">
          {t('errores.generico')}
        </Texto>
        {alReintentar === undefined ? null : (
          <View style={{ marginTop: tema.espaciado.lg }}>
            <Boton etiqueta={t('comun.reintentar')} onPress={alReintentar} />
          </View>
        )}
      </PantallaBase>
    );
  }

  return (
    <PantallaBase titulo={t('habitos.titulo')}>
      <Texto nivel="texto" tono="secundario">
        {t('habitos.descripcion')}
      </Texto>

      {ilegibles > 0 ? (
        <View style={{ marginTop: tema.espaciado.md }}>
          <Texto nivel="nota" tono="secundario">
            {t('habitos.ilegibles', { count: ilegibles })}
          </Texto>
        </View>
      ) : null}

      <FlatList
        style={{ marginTop: tema.espaciado.lg }}
        data={habitos}
        keyExtractor={(habito) => habito.id}
        ItemSeparatorComponent={() => <View style={{ height: tema.espaciado.md }} />}
        ListEmptyComponent={
          <Texto nivel="texto" tono="secundario">
            {t('habitos.sinHabitos')}
          </Texto>
        }
        renderItem={({ item }) => {
          const resumen = resumenes[item.id];
          return (
            <Superficie>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.titulo}
                onPress={() => alAbrir(item)}
              >
                <Texto nivel="subtitulo">{item.titulo}</Texto>
                <Texto nivel="nota" tono="secundario">
                  {item.activo
                    ? t(`habitos.frecuencias.${item.frecuencia}`)
                    : `${t(`habitos.frecuencias.${item.frecuencia}`)} · ${t('habitos.pausado')}`}
                </Texto>
                {resumen === undefined ? null : (
                  <Texto nivel="nota" tono="tenue">
                    {t('habitos.resumen', {
                      count: resumen.cumplidos,
                      ventana: resumen.ventana,
                    })}
                  </Texto>
                )}
              </Pressable>

              <View style={{ marginTop: tema.espaciado.sm }}>
                <Boton
                  variante={resumen?.cumplidoHoy === true ? 'secundario' : 'primario'}
                  etiqueta={
                    resumen?.cumplidoHoy === true ? t('habitos.hechoHoy') : t('habitos.marcarHoy')
                  }
                  onPress={() => alAlternarHoy(item.id)}
                />
              </View>
            </Superficie>
          );
        }}
      />

      <View style={[styles.acciones, { paddingBottom: tema.espaciado.lg }]}>
        <Boton etiqueta={t('habitos.nuevo')} onPress={alCrear} />
      </View>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  acciones: { marginTop: 'auto' },
});
