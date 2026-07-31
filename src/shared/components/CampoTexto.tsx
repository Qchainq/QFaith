// Campo de texto del Design System. Cuatro estados: normal, activo, error y
// deshabilitado (Documento 3).
//
// El mensaje de error se anuncia al lector de pantalla y no depende solo del
// color del borde.
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';
import { AREA_TACTIL_MINIMA } from '@shared/theme/tokens';

export interface PropsCampoTexto extends Omit<TextInputProps, 'style' | 'editable'> {
  /** Ya traducida por quien llama. */
  readonly etiqueta: string;
  /** Mensaje de error ya traducido; su presencia activa el estado de error. */
  readonly error?: string;
  readonly ayuda?: string;
  readonly deshabilitado?: boolean;
}

export function CampoTexto({
  etiqueta,
  error,
  ayuda,
  deshabilitado = false,
  onFocus,
  onBlur,
  ...resto
}: PropsCampoTexto) {
  const tema = useTema();
  const [activo, setActivo] = useState(false);

  const hayError = error !== undefined && error.length > 0;
  const colorBorde = hayError
    ? tema.colores.error
    : activo
      ? tema.colores.acento
      : tema.colores.cristalBorde;

  return (
    <View style={{ gap: tema.espaciado.xs }}>
      <Texto nivel="nota" tono="secundario">
        {etiqueta}
      </Texto>

      <TextInput
        {...resto}
        editable={!deshabilitado}
        onFocus={(evento) => {
          setActivo(true);
          onFocus?.(evento);
        }}
        onBlur={(evento) => {
          setActivo(false);
          onBlur?.(evento);
        }}
        accessibilityLabel={etiqueta}
        {...(hayError ? { accessibilityHint: error } : {})}
        placeholderTextColor={tema.colores.textoTenue}
        style={[
          styles.campo,
          {
            borderColor: colorBorde,
            borderRadius: tema.radios.md,
            backgroundColor: tema.colores.cristal,
            color: tema.colores.textoPrincipal,
            paddingHorizontal: tema.espaciado.md,
            fontSize: tema.tipografia.escala.texto.tamano,
            fontFamily: tema.tipografia.familias.texto,
            opacity: deshabilitado ? 0.5 : 1,
          },
        ]}
      />

      {hayError ? (
        <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
          {error}
        </Texto>
      ) : ayuda === undefined ? null : (
        <Texto nivel="nota" tono="tenue">
          {ayuda}
        </Texto>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    minHeight: AREA_TACTIL_MINIMA,
    borderWidth: 1,
  },
});
