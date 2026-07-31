// Botón del Design System. Tres variantes y ninguna más (Documento 3):
// primario, secundario y texto. Todas comparten altura, radio, tipografía y
// animación, así que un botón nuevo se resuelve eligiendo variante, nunca
// escribiendo estilos sueltos.
import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';
import { AREA_TACTIL_MINIMA } from '@shared/theme/tokens';

export type VarianteBoton = 'primario' | 'secundario' | 'texto';

export interface PropsBoton extends Pick<AccessibilityProps, 'accessibilityHint'> {
  /** Ya traducido por quien llama: aquí nunca se escribe texto literal. */
  readonly etiqueta: string;
  readonly onPress: () => void;
  readonly variante?: VarianteBoton;
  readonly deshabilitado?: boolean;
  readonly cargando?: boolean;
  readonly estilo?: StyleProp<ViewStyle>;
}

export function Boton({
  etiqueta,
  onPress,
  variante = 'primario',
  deshabilitado = false,
  cargando = false,
  estilo,
  accessibilityHint,
}: PropsBoton) {
  const tema = useTema();
  const escala = useRef(new Animated.Value(1)).current;

  const inactivo = deshabilitado || cargando;

  // Microinteracción discreta: el botón responde, pero sin rebote.
  const animar = (destino: number): void => {
    Animated.timing(escala, {
      toValue: destino,
      duration: tema.movimiento.duracion.rapida,
      useNativeDriver: true,
    }).start();
  };

  const fondos: Record<VarianteBoton, string> = {
    primario: tema.colores.acento,
    secundario: tema.colores.cristal,
    texto: 'transparent',
  };

  const colorTexto = variante === 'primario' ? tema.colores.acentoContraste : tema.colores.acento;

  return (
    <Animated.View style={[{ transform: [{ scale: escala }] }, estilo]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animar(0.97)}
        onPressOut={() => animar(1)}
        disabled={inactivo}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityState={{ disabled: inactivo, busy: cargando }}
        {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
        style={[
          styles.base,
          {
            backgroundColor: fondos[variante],
            borderRadius: tema.radios.md,
            paddingHorizontal: tema.espaciado.lg,
            borderWidth: variante === 'secundario' ? StyleSheet.hairlineWidth : 0,
            borderColor: tema.colores.cristalBorde,
            // El estado deshabilitado no depende solo del color: además del
            // tono, el lector de pantalla lo anuncia.
            opacity: inactivo ? 0.5 : 1,
          },
        ]}
      >
        <View style={styles.contenido}>
          {cargando ? (
            <ActivityIndicator color={colorTexto} accessibilityElementsHidden />
          ) : (
            <Texto nivel="subtitulo" style={{ color: colorTexto }}>
              {etiqueta}
            </Texto>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: AREA_TACTIL_MINIMA + 6,
    justifyContent: 'center',
  },
  contenido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
