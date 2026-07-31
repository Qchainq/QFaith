// Pantalla de desbloqueo.
//
// Aparece cuando hay cuenta y claves en este dispositivo pero el contenido
// privado sigue cifrado. La biometría solo desbloquea la clave local; si el
// dispositivo no la tiene configurada, la aplicación sigue siendo usable y
// el bloqueo recae en el PIN del sistema (Documento 5).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

export interface PropsPantallaDesbloqueo {
  /** Devuelve true si el usuario se identificó correctamente. */
  readonly alDesbloquear: () => Promise<boolean>;
  readonly alCerrarSesion: () => void;
}

export function PantallaDesbloqueo({ alDesbloquear, alCerrarSesion }: PropsPantallaDesbloqueo) {
  const { t } = useTranslation();
  const tema = useTema();
  const [intentando, setIntentando] = useState(false);
  const [fallido, setFallido] = useState(false);

  const intentar = async (): Promise<void> => {
    setIntentando(true);
    setFallido(false);
    try {
      const abierto = await alDesbloquear();
      setFallido(!abierto);
    } finally {
      setIntentando(false);
    }
  };

  return (
    <PantallaBase titulo={t('seguridad.bloqueado')}>
      <View style={{ flex: 1, gap: tema.espaciado.md }}>
        <Texto nivel="texto" tono="secundario">
          {t('seguridad.bloqueadoDescripcion')}
        </Texto>

        {fallido ? (
          // Sin reproche: el desbloqueo puede fallar por mil motivos y
          // ninguno es culpa del usuario.
          <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
            {t('errores.generico')}
          </Texto>
        ) : null}

        <Boton
          etiqueta={t('seguridad.desbloquear')}
          cargando={intentando}
          onPress={() => {
            void intentar();
          }}
        />

        <Boton
          etiqueta={t('comun.cancelar')}
          variante="texto"
          onPress={alCerrarSesion}
          accessibilityHint={t('seguridad.bloqueadoDescripcion')}
        />
      </View>
    </PantallaBase>
  );
}
