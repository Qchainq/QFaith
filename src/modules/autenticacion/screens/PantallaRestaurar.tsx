// Restauración en un dispositivo nuevo mediante la frase de recuperación.
//
// Es la única vía por la que la clave maestra puede llegar a otro
// dispositivo. La derivación con Argon2id tarda un rato en un teléfono
// modesto, así que la pantalla muestra progreso y nunca da la sensación de
// haberse quedado colgada.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { esquemaFraseRecuperacion, primerError } from '../use-cases/validacion';

export interface PropsPantallaRestaurar {
  readonly alRestaurar: (frase: string) => Promise<void>;
  readonly alCancelar: () => void;
}

export function PantallaRestaurar({ alRestaurar, alCancelar }: PropsPantallaRestaurar) {
  const { t } = useTranslation();
  const tema = useTema();
  const [frase, setFrase] = useState('');
  const [tocado, setTocado] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const resultado = esquemaFraseRecuperacion.safeParse(frase);
  const errorFormato = tocado ? primerError(resultado) : null;

  const restaurar = async (): Promise<void> => {
    if (!resultado.success) {
      return;
    }
    setRestaurando(true);
    setErrorGeneral(null);
    try {
      await alRestaurar(resultado.data);
    } catch (error) {
      // El detalle técnico no se muestra: solo la clave de i18n del error
      // ya clasificado.
      const clave =
        typeof error === 'object' && error !== null && 'claveMensaje' in error
          ? String((error as { claveMensaje: unknown }).claveMensaje)
          : 'errores.generico';
      setErrorGeneral(clave);
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <PantallaBase titulo={t('seguridad.restaurarTitulo')}>
      <ScrollView
        contentContainerStyle={{ gap: tema.espaciado.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Texto nivel="texto" tono="secundario">
          {t('seguridad.restaurarDescripcion')}
        </Texto>

        <CampoTexto
          etiqueta={t('seguridad.restaurarCampo')}
          value={frase}
          onChangeText={setFrase}
          onBlur={() => setTocado(true)}
          multiline
          numberOfLines={4}
          autoCapitalize="none"
          autoCorrect={false}
          deshabilitado={restaurando}
          {...(errorFormato === null ? {} : { error: t(errorFormato) })}
        />

        {errorGeneral === null ? null : (
          <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
            {t(errorGeneral)}
          </Texto>
        )}

        {restaurando ? (
          <Texto nivel="nota" tono="secundario" accessibilityLiveRegion="polite">
            {t('seguridad.restaurando')}
          </Texto>
        ) : null}

        <Boton
          etiqueta={t('seguridad.restaurar')}
          deshabilitado={!resultado.success}
          cargando={restaurando}
          onPress={() => {
            void restaurar();
          }}
        />

        <Boton
          etiqueta={t('comun.cancelar')}
          variante="texto"
          deshabilitado={restaurando}
          onPress={alCancelar}
        />
      </ScrollView>
    </PantallaBase>
  );
}
