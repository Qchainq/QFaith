// Anotar o editar un memorial.
//
// El campo del relato es el importante y por eso va sin límite de longitud:
// alguien puede necesitar tres líneas o tres páginas para contar lo que le
// pasó, y cortarlo sería decidir por él cuánto merece la pena recordar.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import type { BorradorMemorial, Memorial } from '../models/memorial';

export interface PropsPantallaEditarMemorial {
  /** Memorial existente, o el borrador que trae una oración respondida. */
  readonly memorial?: Memorial | BorradorMemorial;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorMemorial) => Promise<void>;
  readonly alCancelar: () => void;
  readonly alEliminar?: (id: string) => Promise<void>;
}

const idDe = (memorial: Memorial | BorradorMemorial | undefined): string | undefined =>
  memorial === undefined ? undefined : memorial.id;

export function PantallaEditarMemorial({
  memorial,
  guardando = false,
  alGuardar,
  alCancelar,
  alEliminar,
}: PropsPantallaEditarMemorial) {
  const { t } = useTranslation();
  const tema = useTema();

  const [titulo, setTitulo] = useState(memorial?.titulo ?? '');
  const [relato, setRelato] = useState(memorial?.relato ?? '');
  const [personas, setPersonas] = useState((memorial?.personas ?? []).join(', '));
  const [ocurrioEl, setOcurrioEl] = useState(memorial?.ocurrioEl ?? '');
  const [error, setError] = useState<string | null>(null);

  const id = idDe(memorial);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(id === undefined ? {} : { id }),
        ...(memorial?.peticionId === undefined || memorial.peticionId === null
          ? {}
          : { peticionId: memorial.peticionId }),
        titulo,
        relato,
        personas: personas.split(',').map((persona) => persona.trim()),
        ocurrioEl: ocurrioEl.trim().length === 0 ? null : ocurrioEl.trim(),
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  return (
    <PantallaBase titulo={t('memorial.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        {memorial?.peticionId === undefined || memorial.peticionId === null ? null : (
          <Texto nivel="nota" tono="tenue">
            {t('memorial.desdeOracion')}
          </Texto>
        )}

        <CampoTexto
          etiqueta={t('memorial.campoTitulo')}
          value={titulo}
          onChangeText={setTitulo}
          {...(error === null ? {} : { error: t(error) })}
        />
        <CampoTexto
          etiqueta={t('memorial.campoRelato')}
          value={relato}
          onChangeText={setRelato}
          multiline
        />
        <CampoTexto
          etiqueta={t('memorial.campoPersonas')}
          value={personas}
          onChangeText={setPersonas}
        />
        <CampoTexto
          etiqueta={t('memorial.campoFecha')}
          value={ocurrioEl}
          onChangeText={setOcurrioEl}
          autoCapitalize="none"
        />

        <Boton
          etiqueta={guardando ? t('memorial.guardando') : t('memorial.guardar')}
          onPress={() => void guardar()}
          cargando={guardando}
        />
        <Boton variante="texto" etiqueta={t('memorial.cancelar')} onPress={alCancelar} />

        {alEliminar === undefined || id === undefined ? null : (
          <View>
            <Boton
              variante="texto"
              etiqueta={t('memorial.eliminar')}
              onPress={() => void alEliminar(id)}
            />
          </View>
        )}
      </ScrollView>
    </PantallaBase>
  );
}
