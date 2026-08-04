// Leer un capítulo y escribir notas sobre él.
//
// Las dos naturalezas del módulo conviven en esta pantalla: arriba el texto
// público, abajo lo que la persona escribe, que sí es suyo y va cifrado. El
// aviso lo dice explícitamente para que no haya confusión sobre qué se
// guarda con qué.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import {
  ESTILOS_SUBRAYADO,
  subrayadosDe,
  type EstiloSubrayado,
  type NotaBiblica,
  type Subrayado,
  type Versiculo,
} from '../models/biblia';

export interface PropsPantallaCapitulo {
  readonly nombreLibro: string;
  readonly capitulo: number;
  readonly versiculos: readonly Versiculo[];
  readonly notas: readonly NotaBiblica[];
  readonly subrayados?: readonly Subrayado[];
  readonly cargando?: boolean;
  readonly error?: boolean;
  readonly guardando?: boolean;
  readonly alGuardarNota: (texto: string) => Promise<void>;
  readonly alEliminarNota: (id: string) => Promise<void>;
  readonly alSubrayar?: (versiculo: number, estilo: EstiloSubrayado) => void;
  readonly alQuitarSubrayado?: (id: string) => void;
  /** Guardar por dónde va. `marcadorId` es null cuando aún no está marcado. */
  readonly alMarcar?: () => void;
  readonly marcadorId?: string | null;
  readonly alQuitarMarcador?: (id: string) => void;
  readonly alVolver: () => void;
  readonly alReintentar?: () => void;
}

export function PantallaCapitulo({
  nombreLibro,
  capitulo,
  versiculos,
  notas,
  subrayados = [],
  cargando = false,
  error = false,
  guardando = false,
  alGuardarNota,
  alEliminarNota,
  alSubrayar,
  alQuitarSubrayado,
  alMarcar,
  marcadorId = null,
  alQuitarMarcador,
  alVolver,
  alReintentar,
}: PropsPantallaCapitulo) {
  const { t } = useTranslation();
  const tema = useTema();
  const [nota, setNota] = useState('');
  const [errorNota, setErrorNota] = useState<string | null>(null);
  // Qué versículo tiene abierta la paleta. Uno cada vez: dos abiertas a la vez
  // taparían el texto, que es lo que se ha venido a leer.
  const [eligiendo, setEligiendo] = useState<number | null>(null);

  const titulo = `${nombreLibro} ${capitulo}`;

  if (cargando) {
    return <PantallaBase titulo={titulo} mensajeVacio={t('biblia.cargandoCapitulo')} />;
  }

  if (error) {
    return (
      <PantallaBase titulo={titulo}>
        <Texto nivel="texto" tono="secundario">
          {t('biblia.sinConexion')}
        </Texto>
        <View style={{ marginTop: tema.espaciado.lg }}>
          {alReintentar === undefined ? null : (
            <Boton etiqueta={t('comun.reintentar')} onPress={alReintentar} />
          )}
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Boton variante="secundario" etiqueta={t('biblia.volverALibros')} onPress={alVolver} />
          </View>
        </View>
      </PantallaBase>
    );
  }

  async function guardar(): Promise<void> {
    setErrorNota(null);
    try {
      await alGuardarNota(nota);
      setNota('');
    } catch (causa) {
      setErrorNota(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  return (
    <PantallaBase titulo={titulo}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {versiculos.map((versiculo) => {
          const encima = subrayadosDe(subrayados, versiculo.numero);
          // El último que marcó queda arriba, como con dos rotuladores sobre
          // papel; los de debajo se siguen viendo porque son translúcidos.
          const ultimo = encima[encima.length - 1];
          const fondo =
            ultimo === undefined || ultimo.estilo === 'subrayado'
              ? undefined
              : tema.colores.subrayados[ultimo.estilo];

          return (
            <View key={versiculo.numero} style={{ marginBottom: tema.espaciado.sm }}>
              <Texto
                nivel="texto"
                onPress={
                  alSubrayar === undefined
                    ? undefined
                    : () => setEligiendo(eligiendo === versiculo.numero ? null : versiculo.numero)
                }
                style={{
                  ...(fondo === undefined ? {} : { backgroundColor: fondo }),
                  ...(ultimo?.estilo === 'subrayado'
                    ? { textDecorationLine: 'underline' as const }
                    : {}),
                }}
              >
                <Texto nivel="nota" tono="tenue">{`${versiculo.numero} `}</Texto>
                {versiculo.texto}
              </Texto>

              {eligiendo === versiculo.numero && alSubrayar !== undefined && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: tema.espaciado.xs,
                    marginTop: tema.espaciado.xs,
                  }}
                >
                  {ESTILOS_SUBRAYADO.map((estilo) => (
                    <Boton
                      key={estilo}
                      variante="texto"
                      etiqueta={t(`biblia.marcas.estilos.${estilo}`)}
                      onPress={() => {
                        alSubrayar(versiculo.numero, estilo);
                        setEligiendo(null);
                      }}
                    />
                  ))}
                  {encima.map((subrayado) =>
                    alQuitarSubrayado === undefined ? null : (
                      <Boton
                        key={subrayado.id}
                        variante="texto"
                        etiqueta={t('biblia.marcas.quitarSubrayado')}
                        onPress={() => {
                          alQuitarSubrayado(subrayado.id);
                          setEligiendo(null);
                        }}
                      />
                    ),
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Guardar dónde va se ofrece al final del capítulo, que es donde uno
            para de leer. Arriba sería un botón estorbando mientras se lee. */}
        {alMarcar !== undefined && (
          <View style={{ marginTop: tema.espaciado.md }}>
            {marcadorId === null ? (
              <Boton
                variante="secundario"
                etiqueta={t('biblia.marcas.marcar')}
                onPress={alMarcar}
              />
            ) : (
              <Boton
                variante="texto"
                etiqueta={t('biblia.marcas.quitarMarcador')}
                onPress={() => alQuitarMarcador?.(marcadorId)}
              />
            )}
          </View>
        )}

        <View style={{ marginTop: tema.espaciado.lg }}>
          <Texto nivel="subtitulo">{t('biblia.misNotas')}</Texto>
          <Texto nivel="nota" tono="tenue">
            {t('biblia.notaPrivada')}
          </Texto>
        </View>

        {notas.length === 0 ? (
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Texto nivel="texto" tono="secundario">
              {t('biblia.sinNotas')}
            </Texto>
          </View>
        ) : (
          notas.map((item) => (
            <View key={item.id} style={{ marginTop: tema.espaciado.sm }}>
              <Superficie>
                <Texto nivel="texto">{item.texto}</Texto>
                <Boton
                  variante="texto"
                  etiqueta={t('biblia.eliminarNota')}
                  onPress={() => void alEliminarNota(item.id)}
                />
              </Superficie>
            </View>
          ))
        )}

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('biblia.campoNota')}
            value={nota}
            onChangeText={setNota}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
          />
        </View>

        {errorNota === null ? null : (
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
              {t(errorNota)}
            </Texto>
          </View>
        )}

        <View style={{ marginTop: tema.espaciado.md }}>
          <Boton
            etiqueta={t('biblia.guardarNota')}
            onPress={() => void guardar()}
            cargando={guardando}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm, paddingBottom: tema.espaciado.lg }}>
          <Boton variante="secundario" etiqueta={t('biblia.volverALibros')} onPress={alVolver} />
        </View>
      </ScrollView>
    </PantallaBase>
  );
}
