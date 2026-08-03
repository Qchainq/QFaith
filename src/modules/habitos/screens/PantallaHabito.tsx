// Crear o editar un hábito.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import {
  CATEGORIAS_HABITO,
  FRECUENCIAS,
  type BorradorHabito,
  type CategoriaHabito,
  type Frecuencia,
  type Habito,
} from '../models/habito';

export interface PropsPantallaHabito {
  readonly habito?: Habito;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorHabito) => Promise<void>;
  readonly alCancelar: () => void;
  readonly alEliminar?: (id: string) => Promise<void>;
}

export function PantallaHabito({
  habito,
  guardando = false,
  alGuardar,
  alCancelar,
  alEliminar,
}: PropsPantallaHabito) {
  const { t } = useTranslation();
  const tema = useTema();

  const [titulo, setTitulo] = useState(habito?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(habito?.descripcion ?? '');
  const [categoria, setCategoria] = useState<CategoriaHabito | null>(habito?.categoria ?? null);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(habito?.frecuencia ?? 'daily');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(habito === undefined ? {} : { id: habito.id }),
        titulo,
        descripcion,
        categoria,
        frecuencia,
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  const siguienteCategoria = (): void => {
    if (categoria === null) {
      setCategoria(CATEGORIAS_HABITO[0] ?? null);
      return;
    }
    const posicion = CATEGORIAS_HABITO.indexOf(categoria);
    setCategoria(
      posicion + 1 >= CATEGORIAS_HABITO.length ? null : (CATEGORIAS_HABITO[posicion + 1] ?? null),
    );
  };

  const siguienteFrecuencia = (): void => {
    const posicion = FRECUENCIAS.indexOf(frecuencia);
    setFrecuencia(FRECUENCIAS[(posicion + 1) % FRECUENCIAS.length] ?? 'daily');
  };

  return (
    <PantallaBase titulo={habito === undefined ? t('habitos.nuevo') : t('habitos.editar')}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <CampoTexto
          etiqueta={t('habitos.campoTitulo')}
          value={titulo}
          onChangeText={setTitulo}
          autoCapitalize="sentences"
        />

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('habitos.campoDescripcion')}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
          />
        </View>

        <View style={{ marginTop: tema.espaciado.md }}>
          <Boton
            variante="secundario"
            etiqueta={`${t('habitos.campoCategoria')}: ${
              categoria === null ? t('habitos.sinCategoria') : t(`habitos.categorias.${categoria}`)
            }`}
            onPress={siguienteCategoria}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton
            variante="secundario"
            etiqueta={`${t('habitos.campoFrecuencia')}: ${t(`habitos.frecuencias.${frecuencia}`)}`}
            onPress={siguienteFrecuencia}
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: tema.espaciado.md }}>
            <Texto nivel="nota" tono="error" accessibilityLiveRegion="polite">
              {t(error)}
            </Texto>
          </View>
        )}

        <View style={{ marginTop: tema.espaciado.lg }}>
          <Boton
            etiqueta={t('habitos.guardar')}
            onPress={() => void guardar()}
            cargando={guardando}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('comun.cancelar')} onPress={alCancelar} />
        </View>

        {habito !== undefined && alEliminar !== undefined ? (
          <View style={{ marginTop: tema.espaciado.md }}>
            <Boton
              variante="texto"
              etiqueta={t('habitos.eliminar')}
              onPress={() => void alEliminar(habito.id)}
            />
          </View>
        ) : null}
      </ScrollView>
    </PantallaBase>
  );
}
