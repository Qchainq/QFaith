// Escribir o editar una entrada del diario.
//
// El texto vive en el estado del componente hasta que se guarda; a partir de
// ahí solo existe cifrado. Nada de lo que se escribe aquí pasa por un log, por
// analítica ni por el título de una pantalla (invariante 2).
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
  fechaDeHoy,
  TIPOS_ENTRADA,
  type BorradorEntrada,
  type EntradaDiario,
  type TipoEntrada,
} from '../models/entradaDiario';

export interface PropsPantallaEntradaDiario {
  /** Ausente al crear una entrada nueva. */
  readonly entrada?: EntradaDiario;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorEntrada) => Promise<void>;
  readonly alCancelar: () => void;
  readonly alEliminar?: (id: string) => Promise<void>;
}

/** Las etiquetas se escriben separadas por comas, que es lo que la gente hace. */
const separarEtiquetas = (texto: string): string[] =>
  texto
    .split(',')
    .map((etiqueta) => etiqueta.trim())
    .filter((etiqueta) => etiqueta.length > 0);

export function PantallaEntradaDiario({
  entrada,
  guardando = false,
  alGuardar,
  alCancelar,
  alEliminar,
}: PropsPantallaEntradaDiario) {
  const { t } = useTranslation();
  const tema = useTema();

  const [titulo, setTitulo] = useState(entrada?.titulo ?? '');
  const [cuerpo, setCuerpo] = useState(entrada?.cuerpo ?? '');
  const [etiquetas, setEtiquetas] = useState((entrada?.etiquetas ?? []).join(', '));
  const [tipo, setTipo] = useState<TipoEntrada>(entrada?.tipo ?? 'general');
  const [error, setError] = useState<string | null>(null);

  const fecha = entrada?.fecha ?? fechaDeHoy();

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(entrada === undefined ? {} : { id: entrada.id }),
        titulo,
        cuerpo,
        etiquetas: separarEtiquetas(etiquetas),
        tipo,
        fecha,
        esFavorita: entrada?.esFavorita ?? false,
        protegidaConArca: entrada?.protegidaConArca ?? false,
      });
    } catch (causa) {
      // Solo la clave del error ya clasificado. El detalle técnico no se
      // enseña nunca.
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  const siguienteTipo = (): void => {
    const posicion = TIPOS_ENTRADA.indexOf(tipo);
    setTipo(TIPOS_ENTRADA[(posicion + 1) % TIPOS_ENTRADA.length] ?? 'general');
  };

  return (
    <PantallaBase titulo={entrada === undefined ? t('diario.nueva') : t('diario.editar')}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <CampoTexto
          etiqueta={t('diario.campoTitulo')}
          value={titulo}
          onChangeText={setTitulo}
          autoCapitalize="sentences"
        />

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('diario.campoCuerpo')}
            value={cuerpo}
            onChangeText={setCuerpo}
            multiline
            numberOfLines={8}
            autoCapitalize="sentences"
          />
        </View>

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('diario.campoEtiquetas')}
            value={etiquetas}
            onChangeText={setEtiquetas}
            ayuda={t('diario.ayudaEtiquetas')}
            autoCapitalize="none"
          />
        </View>

        <View style={{ marginTop: tema.espaciado.md }}>
          <Boton
            variante="secundario"
            etiqueta={`${t('diario.campoTipo')}: ${t(`diario.tipos.${tipo}`)}`}
            onPress={siguienteTipo}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm }}>
          <Texto nivel="nota" tono="tenue">
            {`${t('diario.campoFecha')}: ${fecha}`}
          </Texto>
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
            etiqueta={t('diario.guardar')}
            onPress={() => void guardar()}
            cargando={guardando}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('comun.cancelar')} onPress={alCancelar} />
        </View>

        {entrada !== undefined && alEliminar !== undefined ? (
          <View style={{ marginTop: tema.espaciado.md }}>
            <Boton
              variante="texto"
              etiqueta={t('diario.eliminar')}
              onPress={() => void alEliminar(entrada.id)}
            />
          </View>
        ) : null}
      </ScrollView>
    </PantallaBase>
  );
}
