// Pantalla de la frase de recuperación.
//
// Es el momento más delicado del alta: si el usuario no guarda estas 24
// palabras y pierde el acceso a su cuenta, su contenido privado es
// irrecuperable. Eso no es un fallo, es la consecuencia de que nadie más
// pueda leerlo, pero obliga a que la pantalla sea explícita.
//
// Por eso no basta con mostrar la frase y un botón de continuar: después se
// pide confirmar unas palabras al azar.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import {
  coincidePalabra,
  elegirPosiciones,
  verificacionCompleta,
} from '../use-cases/verificacionFrase';

export interface PropsPantallaFraseRecuperacion {
  readonly frase: string;
  /** Se llama solo cuando el usuario ha confirmado que la tiene anotada. */
  readonly alConfirmar: () => void;
}

type Paso = 'mostrar' | 'verificar';

export function PantallaFraseRecuperacion({ frase, alConfirmar }: PropsPantallaFraseRecuperacion) {
  const { t } = useTranslation();
  const tema = useTema();
  const [paso, setPaso] = useState<Paso>('mostrar');
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  // Campos que el usuario ya ha dejado. El error se muestra al salir del
  // campo y no mientras teclea, para no señalar una palabra a medio
  // escribir.
  const [tocados, setTocados] = useState<Record<number, boolean>>({});

  const palabras = useMemo(() => frase.trim().split(/\s+/), [frase]);
  // Las posiciones se fijan al montar: cambiarlas mientras el usuario
  // escribe sería desconcertante.
  const posiciones = useMemo(() => elegirPosiciones(frase), [frase]);

  const completa = verificacionCompleta(posiciones, respuestas);

  if (paso === 'mostrar') {
    return (
      <PantallaBase titulo={t('seguridad.fraseRecuperacionTitulo')}>
        <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
          <Texto nivel="texto" tono="secundario">
            {t('seguridad.fraseRecuperacionDescripcion')}
          </Texto>

          <Superficie estilo={{ padding: tema.espaciado.md }}>
            <View
              style={styles.rejilla}
              accessibilityLabel={t('seguridad.fraseRecuperacionTitulo')}
            >
              {palabras.map((palabra, indice) => (
                <View
                  key={`${indice}-${palabra}`}
                  style={[styles.celda, { borderRadius: tema.radios.sm }]}
                >
                  <Texto nivel="pie" tono="tenue">
                    {indice + 1}
                  </Texto>
                  <Texto nivel="texto">{palabra}</Texto>
                </View>
              ))}
            </View>
          </Superficie>

          <Texto nivel="nota" tono="secundario">
            {t('seguridad.fraseRecuperacionInstruccion')}
          </Texto>

          {/* El aviso va en tono de advertencia, no de amenaza. */}
          <Texto nivel="nota" tono="acento">
            {t('seguridad.fraseRecuperacionAviso')}
          </Texto>

          <Boton
            etiqueta={t('seguridad.fraseRecuperacionYaLaGuarde')}
            onPress={() => setPaso('verificar')}
          />
        </ScrollView>
      </PantallaBase>
    );
  }

  return (
    <PantallaBase titulo={t('seguridad.verificacionTitulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto nivel="texto" tono="secundario">
          {t('seguridad.verificacionDescripcion')}
        </Texto>

        {posiciones.map((posicion) => {
          const escrita = respuestas[posicion.numero] ?? '';
          // El aviso aparece en cuanto el campo queda listo y no coincide.
          // Antes solo se mostraba al pulsar «Continuar», pero ese botón
          // está deshabilitado justo cuando hay un fallo, así que el usuario
          // se quedaba sin saber qué corregir.
          const fallida =
            (tocados[posicion.numero] ?? false) &&
            escrita.length > 0 &&
            !coincidePalabra(escrita, posicion.palabraEsperada);

          return (
            <CampoTexto
              key={posicion.numero}
              etiqueta={t('seguridad.verificacionPalabra', { numero: posicion.numero })}
              value={escrita}
              onChangeText={(texto) =>
                setRespuestas((previas) => ({ ...previas, [posicion.numero]: texto }))
              }
              onBlur={() => setTocados((previos) => ({ ...previos, [posicion.numero]: true }))}
              autoCapitalize="none"
              autoCorrect={false}
              {...(fallida ? { error: t('seguridad.verificacionErrorPalabra') } : {})}
            />
          );
        })}

        <Boton etiqueta={t('comun.continuar')} deshabilitado={!completa} onPress={alConfirmar} />

        <Boton
          etiqueta={t('seguridad.verMiFrase')}
          variante="texto"
          onPress={() => {
            setPaso('mostrar');
            setTocados({});
          }}
        />
      </ScrollView>
    </PantallaBase>
  );
}

const styles = StyleSheet.create({
  rejilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  celda: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: '30%',
  },
});
