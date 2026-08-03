// Editar los datos de la cuenta. Pantalla pura.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { CampoTexto } from '@shared/components/CampoTexto';
import { PantallaBase } from '@shared/components/PantallaBase';
import { esErrorApp } from '@shared/errores/erroresApp';
import { useTema } from '@shared/theme/ProveedorTema';

import { IDIOMAS, type BorradorPerfil, type Idioma, type Perfil } from '../models/perfil';

export interface PropsPantallaEditarPerfil {
  readonly perfil: Perfil | null;
  readonly guardando?: boolean;
  readonly alGuardar: (borrador: BorradorPerfil) => Promise<void>;
  readonly alCancelar: () => void;
}

export function PantallaEditarPerfil({
  perfil,
  guardando = false,
  alGuardar,
  alCancelar,
}: PropsPantallaEditarPerfil) {
  const { t } = useTranslation();
  const tema = useTema();

  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [idioma, setIdioma] = useState<Idioma>(perfil?.idioma ?? 'es');
  const [zonaHoraria, setZonaHoraria] = useState(perfil?.zonaHoraria ?? 'UTC');
  const [pais, setPais] = useState(perfil?.pais ?? '');
  const [ano, setAno] = useState(perfil?.anoNacimiento?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setError(null);
    try {
      await alGuardar({
        nombre: nombre.trim().length === 0 ? null : nombre,
        idioma,
        zonaHoraria,
        pais: pais.trim().length === 0 ? null : pais,
        // Un año vacío es «no lo digo», no un cero. El esquema solo guarda el
        // año porque la fecha completa no hace falta para nada.
        anoNacimiento: ano.trim().length === 0 ? null : Number(ano),
      });
    } catch (causa) {
      setError(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico');
    }
  }

  const siguienteIdioma = (): void => {
    const posicion = IDIOMAS.indexOf(idioma);
    setIdioma(IDIOMAS[(posicion + 1) % IDIOMAS.length] ?? 'es');
  };

  return (
    <PantallaBase titulo={t('perfil.editar')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <CampoTexto
          etiqueta={t('perfil.campoNombre')}
          value={nombre}
          onChangeText={setNombre}
          {...(error === null ? {} : { error: t(error) })}
        />
        <Boton
          variante="secundario"
          etiqueta={`${t('perfil.idioma.titulo')}: ${t(`perfil.idioma.${idioma}`)}`}
          onPress={siguienteIdioma}
        />
        <CampoTexto
          etiqueta={t('perfil.campoZonaHoraria')}
          value={zonaHoraria}
          onChangeText={setZonaHoraria}
          autoCapitalize="none"
        />
        <CampoTexto
          etiqueta={t('perfil.campoPais')}
          value={pais}
          onChangeText={setPais}
          autoCapitalize="characters"
          maxLength={2}
        />
        <CampoTexto
          etiqueta={t('perfil.campoAnoNacimiento')}
          value={ano}
          onChangeText={setAno}
          keyboardType="number-pad"
          maxLength={4}
        />

        <Boton
          etiqueta={guardando ? t('perfil.guardando') : t('perfil.guardar')}
          onPress={() => void guardar()}
          cargando={guardando}
        />
        <Boton variante="texto" etiqueta={t('perfil.cancelar')} onPress={alCancelar} />
      </ScrollView>
    </PantallaBase>
  );
}
