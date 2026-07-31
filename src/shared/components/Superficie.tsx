// Superficie de cristal: la base visual de todas las tarjetas y barras.
//
// Es el único sitio donde se aplica el efecto Liquid Glass. Un componente que
// necesite una tarjeta usa esto, nunca sus propios estilos.
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTema } from '@shared/theme/ProveedorTema';

export interface PropsSuperficie {
  readonly children: ReactNode;
  readonly estilo?: StyleProp<ViewStyle>;
  /** `plana` no eleva ni proyecta sombra; sirve para fondos amplios. */
  readonly variante?: 'elevada' | 'plana';
}

export function Superficie({ children, estilo, variante = 'elevada' }: PropsSuperficie) {
  const tema = useTema();

  return (
    <BlurView
      intensity={tema.cristal.intensidadDesenfoque}
      tint={tema.esOscuro ? 'dark' : 'light'}
      style={[
        styles.base,
        {
          borderRadius: tema.radios.lg,
          borderColor: tema.colores.cristalBorde,
          backgroundColor: tema.colores.cristal,
        },
        variante === 'elevada' && tema.cristal.sombra,
        estilo,
      ]}
    >
      <View style={styles.contenido}>{children}</View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  contenido: {
    flex: 1,
  },
});
