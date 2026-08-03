// Portada del perfil. Pantalla pura.
//
// Es la puerta a todo lo que la persona puede decidir sobre su cuenta:
// configuración, seguridad, dispositivos y eliminación. Están a un toque a
// propósito — esconder la eliminación de cuenta en un submenú de tercer nivel
// es una forma de dificultarla, y eso no se hace aquí.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { diasHastaElBorrado, type Perfil, type SolicitudEliminacion } from '../models/perfil';

export interface PropsPantallaPerfil {
  readonly perfil: Perfil | null;
  readonly correo: string;
  readonly eliminacionPendiente: SolicitudEliminacion | null;
  readonly cargando?: boolean;
  readonly alEditar: () => void;
  readonly alAbrirConfiguracion: () => void;
  readonly alAbrirDispositivos: () => void;
  readonly alAbrirEliminacion: () => void;
  readonly alCerrarSesion: () => void;
  /** Inyectable para que la prueba no dependa del día en que se ejecute. */
  readonly ahora?: Date;
}

export function PantallaPerfil({
  perfil,
  correo,
  eliminacionPendiente,
  cargando = false,
  alEditar,
  alAbrirConfiguracion,
  alAbrirDispositivos,
  alAbrirEliminacion,
  alCerrarSesion,
  ahora = new Date(),
}: PropsPantallaPerfil) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('perfil.titulo')} mensajeVacio={t('perfil.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('perfil.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Superficie>
          <Texto nivel="subtitulo">{perfil?.nombre ?? t('perfil.sinNombre')}</Texto>
          {/* El correo va en claro y siempre lo estuvo: es la identidad de la
              cuenta, no contenido espiritual (Documento 5). */}
          <Texto nivel="nota" tono="secundario">
            {correo}
          </Texto>
          <View style={{ marginTop: tema.espaciado.sm }}>
            <Boton variante="secundario" etiqueta={t('perfil.editar')} onPress={alEditar} />
          </View>
        </Superficie>

        {eliminacionPendiente === null ? null : (
          <Superficie>
            <Texto nivel="texto">
              {t('perfil.eliminar.pendiente', {
                count: diasHastaElBorrado(eliminacionPendiente, ahora),
              })}
            </Texto>
          </Superficie>
        )}

        <Boton
          variante="secundario"
          etiqueta={t('perfil.configuracion')}
          onPress={alAbrirConfiguracion}
        />
        <Boton
          variante="secundario"
          etiqueta={t('perfil.dispositivos')}
          onPress={alAbrirDispositivos}
        />
        <Boton variante="texto" etiqueta={t('perfil.cerrarSesion')} onPress={alCerrarSesion} />
        <Boton
          variante="texto"
          etiqueta={t('perfil.eliminar.titulo')}
          onPress={alAbrirEliminacion}
        />
      </ScrollView>
    </PantallaBase>
  );
}
