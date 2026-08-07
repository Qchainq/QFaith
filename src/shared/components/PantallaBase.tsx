// Contenedor común de pantalla: fondo del tema, áreas seguras y título.
// Garantiza que todas las pantallas respiren igual y tengan la misma
// estructura (Documento 10: título, acción principal, acción secundaria).
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Texto } from '@shared/components/Texto';
import { medidaDe } from '@shared/theme/dimensiones';
import { useTema } from '@shared/theme/ProveedorTema';

export interface PropsPantallaBase {
  readonly titulo: string;
  readonly children?: ReactNode;
  /** Texto del estado vacío, ya traducido por quien llama. */
  readonly mensajeVacio?: string;
}

export function PantallaBase({ titulo, children, mensajeVacio }: PropsPantallaBase) {
  const tema = useTema();
  const margenes = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Toda la adaptación al tamaño pasa por aquí, y por aquí pasan todas las
  // pantallas. Repartir la decisión por cada una acabaría con unas adaptadas
  // y otras no, que es peor que no adaptar ninguna: la incoherencia se nota.
  const medida = medidaDe(width, height);

  return (
    <View
      style={[
        styles.contenedor,
        {
          backgroundColor: tema.colores.fondo,
          paddingTop: margenes.top + medida.margenSuperior,
          paddingHorizontal: medida.margenLateral,
        },
      ]}
    >
      <View
        style={[
          styles.columna,
          { maxWidth: medida.anchoDeContenido },
          // Centrada solo cuando sobra sitio. En una tableta, el texto pegado
          // al borde izquierdo con medio metro de fondo vacío a la derecha es
          // justo «estirar la interfaz móvil sin adaptación».
          medida.seCentra ? styles.centrada : null,
        ]}
      >
        <Texto nivel="tituloPrincipal" espiritual accessibilityRole="header">
          {titulo}
        </Texto>

        <View style={[styles.cuerpo, { marginTop: tema.espaciado.lg }]}>
          {children ??
            (mensajeVacio === undefined ? null : (
              <Texto nivel="texto" tono="secundario">
                {mensajeVacio}
              </Texto>
            ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  columna: { flex: 1, width: '100%' },
  centrada: { alignSelf: 'center' },
  cuerpo: { flex: 1 },
});
