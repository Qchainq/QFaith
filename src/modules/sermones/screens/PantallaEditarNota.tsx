// Escribir o editar una nota de sermón, y proponerse una acción.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import type { BorradorNota, NotaSermon } from '../models/sermon';

export interface PropsPantallaEditarNota {
  readonly nota?: NotaSermon;
  readonly sermonId?: string | null;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorNota) => Promise<void>;
  readonly alCancelar: () => void;
  readonly alEliminar?: (id: string) => Promise<void>;
}

export function PantallaEditarNota({
  nota,
  sermonId,
  guardando = false,
  alGuardar,
  alCancelar,
  alEliminar,
}: PropsPantallaEditarNota) {
  const { t } = useTranslation();
  const tema = useTema();

  const [texto, setTexto] = useState(nota?.texto ?? '');
  const [destacados, setDestacados] = useState<readonly string[]>(nota?.destacados ?? []);
  const [destacado, setDestacado] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(nota === undefined ? {} : { id: nota.id }),
        // El sermón de origen se conserva al editar: es lo que ata la nota a
        // lo que se estaba escuchando.
        sermonId: nota?.sermonId ?? sermonId ?? null,
        texto,
        destacados: [...destacados],
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  return (
    <PantallaBase titulo={t('sermones.nuevaNota')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto nivel="nota" tono="secundario">
          {t('sermones.descripcion')}
        </Texto>

        <CampoTexto
          etiqueta={t('sermones.campoTexto')}
          value={texto}
          onChangeText={setTexto}
          multiline
          {...(error === null ? {} : { error: t(error) })}
        />

        <CampoTexto
          etiqueta={t('sermones.campoDestacado')}
          value={destacado}
          onChangeText={setDestacado}
        />
        <Boton
          variante="texto"
          etiqueta={t('sermones.anadirDestacado')}
          onPress={() => {
            if (destacado.trim().length === 0) return;
            setDestacados([...destacados, destacado.trim()]);
            setDestacado('');
          }}
        />

        {destacados.map((frase) => (
          <Texto key={frase} nivel="nota" tono="tenue">
            {frase}
          </Texto>
        ))}

        <Boton
          etiqueta={guardando ? t('sermones.guardando') : t('sermones.guardar')}
          onPress={() => void guardar()}
          cargando={guardando}
        />
        <Boton variante="texto" etiqueta={t('sermones.cancelar')} onPress={alCancelar} />

        {alEliminar === undefined || nota === undefined ? null : (
          <View>
            <Boton
              variante="texto"
              etiqueta={t('sermones.eliminar')}
              onPress={() => void alEliminar(nota.id)}
            />
          </View>
        )}
      </ScrollView>
    </PantallaBase>
  );
}
