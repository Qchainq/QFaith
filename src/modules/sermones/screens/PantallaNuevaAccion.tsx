// Proponerse algo a partir de un sermón.
//
// Sin lenguaje de deuda: se llama «lo que te propusiste», no «pendientes», y
// una acción se puede desmarcar. Convertir un propósito en una lista que
// reprocha es exactamente lo que el invariante 12 prohíbe.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import type { BorradorAccion } from '../models/sermon';

export interface PropsPantallaNuevaAccion {
  readonly notaId?: string | null;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorAccion) => Promise<void>;
  readonly alCancelar: () => void;
}

export function PantallaNuevaAccion({
  notaId,
  guardando = false,
  alGuardar,
  alCancelar,
}: PropsPantallaNuevaAccion) {
  const { t } = useTranslation();
  const tema = useTema();

  const [texto, setTexto] = useState('');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        ...(notaId === undefined || notaId === null ? {} : { notaId }),
        texto,
        fechaLimite: fecha.trim().length === 0 ? null : fecha.trim(),
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  return (
    <PantallaBase titulo={t('sermones.acciones.nueva')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <CampoTexto
          etiqueta={t('sermones.acciones.campoTexto')}
          value={texto}
          onChangeText={setTexto}
          {...(error === null ? {} : { error: t(error) })}
        />
        <CampoTexto
          etiqueta={t('sermones.acciones.campoFecha')}
          value={fecha}
          onChangeText={setFecha}
          autoCapitalize="none"
        />

        <Boton
          etiqueta={guardando ? t('sermones.guardando') : t('sermones.guardar')}
          onPress={() => void guardar()}
          cargando={guardando}
        />
        <Boton variante="texto" etiqueta={t('sermones.cancelar')} onPress={alCancelar} />
      </ScrollView>
    </PantallaBase>
  );
}
