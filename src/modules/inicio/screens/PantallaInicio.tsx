// Pantalla de inicio. El resto del contenido llega con los demás módulos de
// la Fase 2 (Documento 11); por ahora es la puerta a los módulos secundarios.
//
// No conoce la navegación: recibe la acción. Así se puede montar y probar
// sola, igual que las demás pantallas del proyecto.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

export interface PropsPantallaInicio {
  readonly alAbrirDiario?: () => void;
  readonly alAbrirHabitos?: () => void;
  readonly alAbrirBiblioteca?: () => void;
  readonly alAbrirMemorial?: () => void;
  readonly alAbrirIglesia?: () => void;
  readonly alAbrirSermones?: () => void;
  readonly alAbrirPulso?: () => void;
  readonly alAbrirPlanes?: () => void;
}

export function PantallaInicio({
  alAbrirDiario,
  alAbrirHabitos,
  alAbrirBiblioteca,
  alAbrirMemorial,
  alAbrirIglesia,
  alAbrirSermones,
  alAbrirPulso,
  alAbrirPlanes,
}: PropsPantallaInicio = {}) {
  const { t } = useTranslation();
  const tema = useTema();

  return (
    <PantallaBase titulo={t('navegacion.inicio')}>
      <Texto nivel="texto" tono="secundario">
        {t('inicio.sinPendientes')}
      </Texto>

      {/* El pulso va primero: es la pregunta del día y lo demás puede esperar. */}
      {alAbrirPulso === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.lg }}>
          <Boton etiqueta={t('pulso.pregunta')} onPress={alAbrirPulso} />
        </View>
      )}

      {alAbrirDiario === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton etiqueta={t('diario.titulo')} onPress={alAbrirDiario} />
        </View>
      )}

      {alAbrirHabitos === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('habitos.titulo')} onPress={alAbrirHabitos} />
        </View>
      )}

      {alAbrirBiblioteca === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton
            variante="secundario"
            etiqueta={t('biblioteca.titulo')}
            onPress={alAbrirBiblioteca}
          />
        </View>
      )}

      {alAbrirMemorial === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('memorial.titulo')} onPress={alAbrirMemorial} />
        </View>
      )}

      {alAbrirIglesia === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('iglesia.titulo')} onPress={alAbrirIglesia} />
        </View>
      )}

      {alAbrirSermones === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('sermones.titulo')} onPress={alAbrirSermones} />
        </View>
      )}

      {alAbrirPlanes === undefined ? null : (
        <View style={{ marginTop: tema.espaciado.sm }}>
          <Boton variante="secundario" etiqueta={t('planes.titulo')} onPress={alAbrirPlanes} />
        </View>
      )}
    </PantallaBase>
  );
}
