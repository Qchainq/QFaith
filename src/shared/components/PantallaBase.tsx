// Contenedor común de pantalla: fondo del tema, áreas seguras y título.
// Garantiza que todas las pantallas respiren igual y tengan la misma
// estructura (Documento 10: título, acción principal, acción secundaria).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Texto } from '@shared/components/Texto';
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

  return (
    <View
      style={[
        styles.contenedor,
        {
          backgroundColor: tema.colores.fondo,
          paddingTop: margenes.top + tema.espaciado.lg,
          paddingHorizontal: tema.espaciado.lg,
        },
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
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  cuerpo: { flex: 1 },
});
