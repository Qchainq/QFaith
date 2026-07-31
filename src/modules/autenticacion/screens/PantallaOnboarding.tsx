// Onboarding: las seis pantallas del Documento 10.
//
// El contenido está en datos y no repetido en seis componentes, de modo que
// cambiar el orden o el texto de un paso no obliga a tocar la interfaz.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

interface PasoOnboarding {
  readonly clave: string;
  readonly claveTitulo: string;
  readonly claveTexto: string;
}

/** Orden exacto del Documento 10. */
const PASOS: readonly PasoOnboarding[] = [
  {
    clave: 'bienvenida',
    claveTitulo: 'onboarding.bienvenidaTitulo',
    claveTexto: 'onboarding.bienvenidaTexto',
  },
  {
    clave: 'privacidad',
    claveTitulo: 'onboarding.privacidadTitulo',
    claveTexto: 'onboarding.privacidadTexto',
  },
  {
    clave: 'habitos',
    claveTitulo: 'onboarding.habitosTitulo',
    claveTexto: 'onboarding.habitosTexto',
  },
  { clave: 'ia', claveTitulo: 'onboarding.iaTitulo', claveTexto: 'onboarding.iaTexto' },
  {
    clave: 'iglesia',
    claveTitulo: 'onboarding.iglesiaTitulo',
    claveTexto: 'onboarding.iglesiaTexto',
  },
  {
    clave: 'cuenta',
    claveTitulo: 'onboarding.crearCuentaTitulo',
    claveTexto: 'onboarding.crearCuentaTexto',
  },
];

export interface PropsPantallaOnboarding {
  readonly alTerminar: () => void;
}

export function PantallaOnboarding({ alTerminar }: PropsPantallaOnboarding) {
  const { t } = useTranslation();
  const tema = useTema();
  const [indice, setIndice] = useState(0);

  const paso = PASOS[indice];
  if (paso === undefined) {
    return null;
  }

  const esUltimo = indice === PASOS.length - 1;

  return (
    <PantallaBase titulo={t(paso.claveTitulo)}>
      <View style={styles.cuerpo}>
        <Texto nivel="texto" tono="secundario">
          {t(paso.claveTexto)}
        </Texto>
      </View>

      <View style={{ gap: tema.espaciado.sm, paddingBottom: tema.espaciado.xl }}>
        {/* Indicador de progreso: informa sin gamificar. */}
        <View
          style={styles.progreso}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: PASOS.length, now: indice + 1 }}
        >
          {PASOS.map((otro, posicion) => (
            <View
              key={otro.clave}
              style={{
                height: 4,
                flex: 1,
                borderRadius: tema.radios.completo,
                backgroundColor: posicion <= indice ? tema.colores.acento : tema.colores.separador,
              }}
            />
          ))}
        </View>

        <Boton
          etiqueta={esUltimo ? t('autenticacion.crearCuenta') : t('onboarding.siguiente')}
          onPress={() => (esUltimo ? alTerminar() : setIndice(indice + 1))}
        />

        {esUltimo ? null : (
          <Boton etiqueta={t('onboarding.saltar')} variante="texto" onPress={alTerminar} />
        )}
      </View>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  cuerpo: { flex: 1 },
  progreso: { flexDirection: 'row', gap: 6, marginBottom: 8 },
});
