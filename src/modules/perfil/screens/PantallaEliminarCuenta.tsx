// Eliminación de la cuenta. Pantalla pura.
//
// Dice la verdad incómoda antes de que la persona decida: **no podemos leer
// su contenido, así que tampoco podemos devolvérselo.** Ese es el precio real
// del cifrado de extremo a extremo, y ocultarlo aquí sería mentir justo donde
// más importa.
//
// Hay confirmación, pero no obstáculos artificiales: ni escribir «ELIMINAR»,
// ni contar los días, ni una encuesta de salida. El periodo de gracia ya
// protege de la decisión impulsiva, y todo lo demás sería retener a alguien
// por cansancio.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { diasHastaElBorrado, type SolicitudEliminacion } from '../models/perfil';

export interface PropsPantallaEliminarCuenta {
  readonly pendiente: SolicitudEliminacion | null;
  readonly confirmando: boolean;
  readonly trabajando?: boolean;
  readonly alPedirConfirmacion: () => void;
  readonly alConfirmar: () => void;
  readonly alCancelarConfirmacion: () => void;
  readonly alCancelarEliminacion: (solicitudId: string) => void;
  readonly alVolver: () => void;
  readonly ahora?: Date;
}

export function PantallaEliminarCuenta({
  pendiente,
  confirmando,
  trabajando = false,
  alPedirConfirmacion,
  alConfirmar,
  alCancelarConfirmacion,
  alCancelarEliminacion,
  alVolver,
  ahora = new Date(),
}: PropsPantallaEliminarCuenta) {
  const { t } = useTranslation();
  const tema = useTema();

  return (
    <PantallaBase titulo={t('perfil.eliminar.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Texto nivel="texto" tono="secundario">
          {t('perfil.eliminar.explicacion')}
        </Texto>

        {pendiente === null ? (
          confirmando ? (
            <Superficie>
              <Texto nivel="texto">{t('perfil.eliminar.explicacion')}</Texto>
              <View style={{ gap: tema.espaciado.sm, marginTop: tema.espaciado.sm }}>
                <Boton
                  etiqueta={t('perfil.eliminar.confirmar')}
                  onPress={alConfirmar}
                  cargando={trabajando}
                />
                <Boton
                  variante="texto"
                  etiqueta={t('perfil.cancelar')}
                  onPress={alCancelarConfirmacion}
                  deshabilitado={trabajando}
                />
              </View>
            </Superficie>
          ) : (
            <Boton etiqueta={t('perfil.eliminar.solicitar')} onPress={alPedirConfirmacion} />
          )
        ) : (
          <Superficie>
            <Texto nivel="texto">
              {t('perfil.eliminar.pendiente', { count: diasHastaElBorrado(pendiente, ahora) })}
            </Texto>
            {/* Cancelar tiene que ser lo más fácil de esta pantalla: es el
                único motivo por el que existe el periodo de gracia. */}
            <View style={{ marginTop: tema.espaciado.sm }}>
              <Boton
                etiqueta={t('perfil.eliminar.cancelar')}
                onPress={() => alCancelarEliminacion(pendiente.id)}
                cargando={trabajando}
              />
            </View>
          </Superficie>
        )}

        <Boton variante="texto" etiqueta={t('perfil.volver')} onPress={alVolver} />
      </ScrollView>
    </PantallaBase>
  );
}
