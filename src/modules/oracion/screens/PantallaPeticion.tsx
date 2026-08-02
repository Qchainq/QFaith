// Escribir, editar y acompañar una petición.
//
// Las tres acciones de estado —responder, archivar, reactivar— están aquí y
// no en la lista a propósito: son decisiones sobre algo concreto que la
// persona está mirando, no gestos rápidos que se puedan hacer sin querer.
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
  CATEGORIAS_PETICION,
  type BorradorPeticion,
  type CategoriaPeticion,
  type EstadoPeticion,
  type Peticion,
} from '../models/peticion';

export interface PropsPantallaPeticion {
  readonly peticion?: Peticion;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorPeticion) => Promise<void>;
  readonly alCancelar: () => void;
  readonly alCambiarEstado?: (estado: EstadoPeticion) => Promise<void>;
  readonly alEliminar?: (id: string) => Promise<void>;
}

const separarPersonas = (texto: string): string[] =>
  texto
    .split(',')
    .map((persona) => persona.trim())
    .filter((persona) => persona.length > 0);

export function PantallaPeticion({
  peticion,
  guardando = false,
  alGuardar,
  alCancelar,
  alCambiarEstado,
  alEliminar,
}: PropsPantallaPeticion) {
  const { t } = useTranslation();
  const tema = useTema();

  const [titulo, setTitulo] = useState(peticion?.titulo ?? '');
  const [detalle, setDetalle] = useState(peticion?.detalle ?? '');
  const [personas, setPersonas] = useState((peticion?.personas ?? []).join(', '));
  const [categoria, setCategoria] = useState<CategoriaPeticion | null>(peticion?.categoria ?? null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(peticion === undefined ? {} : { id: peticion.id }),
        titulo,
        detalle,
        personas: separarPersonas(personas),
        categoria,
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  /** Rota entre «sin categoría» y las ocho del Documento 11. */
  const siguienteCategoria = (): void => {
    if (categoria === null) {
      setCategoria(CATEGORIAS_PETICION[0] ?? null);
      return;
    }
    const posicion = CATEGORIAS_PETICION.indexOf(categoria);
    setCategoria(
      posicion + 1 >= CATEGORIAS_PETICION.length
        ? null
        : (CATEGORIAS_PETICION[posicion + 1] ?? null),
    );
  };

  const activa = peticion === undefined || peticion.estado === 'active';

  return (
    <PantallaBase titulo={peticion === undefined ? t('oracion.nueva') : t('oracion.editar')}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <CampoTexto
          etiqueta={t('oracion.campoTitulo')}
          value={titulo}
          onChangeText={setTitulo}
          autoCapitalize="sentences"
        />

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('oracion.campoDetalle')}
            value={detalle}
            onChangeText={setDetalle}
            multiline
            numberOfLines={6}
            autoCapitalize="sentences"
          />
        </View>

        <View style={{ marginTop: tema.espaciado.md }}>
          <CampoTexto
            etiqueta={t('oracion.campoPersonas')}
            value={personas}
            onChangeText={setPersonas}
            ayuda={t('oracion.ayudaPersonas')}
            autoCapitalize="words"
          />
        </View>

        <View style={{ marginTop: tema.espaciado.md }}>
          <Boton
            variante="secundario"
            etiqueta={`${t('oracion.campoCategoria')}: ${
              categoria === null ? t('oracion.sinCategoria') : t(`oracion.categorias.${categoria}`)
            }`}
            onPress={siguienteCategoria}
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
            etiqueta={t('oracion.guardar')}
            onPress={() => void guardar()}
            cargando={guardando}
          />
        </View>

        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('comun.cancelar')} onPress={alCancelar} />
        </View>

        {peticion !== undefined && alCambiarEstado !== undefined ? (
          <View style={{ marginTop: tema.espaciado.lg }}>
            {activa ? (
              <>
                <Boton
                  variante="secundario"
                  etiqueta={t('oracion.marcarRespondida')}
                  onPress={() => void alCambiarEstado('answered')}
                />
                <View style={{ marginTop: tema.espaciado.sm }}>
                  <Boton
                    variante="texto"
                    etiqueta={t('oracion.archivar')}
                    onPress={() => void alCambiarEstado('archived')}
                  />
                </View>
              </>
            ) : (
              <Boton
                variante="secundario"
                etiqueta={t('oracion.reactivar')}
                onPress={() => void alCambiarEstado('active')}
              />
            )}
          </View>
        ) : null}

        {peticion !== undefined && alEliminar !== undefined ? (
          <View style={{ marginTop: tema.espaciado.md }}>
            <Boton
              variante="texto"
              etiqueta={t('oracion.eliminar')}
              onPress={() => void alEliminar(peticion.id)}
            />
          </View>
        ) : null}
      </ScrollView>
    </PantallaBase>
  );
}
