// Texto del Design System. Aplica la escala tipográfica y respeta el ajuste
// de tamaño del sistema. Ningún componente usa `Text` de React Native
// directamente.
import { Text as TextoNativo, type TextProps, type TextStyle } from 'react-native';

import { useTema } from '@shared/theme/ProveedorTema';
import type { tipografia } from '@shared/theme/tokens';

type NivelTexto = keyof typeof tipografia.escala;
type TonoTexto = 'principal' | 'secundario' | 'tenue' | 'acento' | 'error';

export interface PropsTexto extends TextProps {
  readonly nivel?: NivelTexto;
  readonly tono?: TonoTexto;
  /** Merriweather, reservada a títulos espirituales. */
  readonly espiritual?: boolean;
}

export function Texto({
  nivel = 'texto',
  tono = 'principal',
  espiritual = false,
  style,
  ...resto
}: PropsTexto) {
  const tema = useTema();
  const escala = tema.tipografia.escala[nivel];

  const colorPorTono: Record<TonoTexto, string> = {
    principal: tema.colores.textoPrincipal,
    secundario: tema.colores.textoSecundario,
    tenue: tema.colores.textoTenue,
    acento: tema.colores.acento,
    error: tema.colores.error,
  };

  const estiloBase: TextStyle = {
    fontSize: escala.tamano,
    lineHeight: escala.alturaLinea,
    fontWeight: escala.peso,
    color: colorPorTono[tono],
    fontFamily: espiritual ? tema.tipografia.familias.espiritual : tema.tipografia.familias.texto,
  };

  return <TextoNativo {...resto} style={[estiloBase, style]} />;
}
