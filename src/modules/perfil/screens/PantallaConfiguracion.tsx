// Configuración y seguridad. Pantalla pura.
//
// Los interruptores dicen lo que hacen y no prometen de más. El de analítica
// lleva su propia nota porque es el que más suspicacia despierta con razón:
// está apagado por defecto y nunca incluye nada de lo que la persona escribe.
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { useTema } from '@shared/theme/ProveedorTema';

import { TEMAS, type Ajustes, type Tema } from '../models/perfil';
import type { CambioAjustes } from '../use-cases/gestionPerfil';

/** Plazos ofrecidos. `0` es «no bloquear», y es una opción legítima. */
export const PLAZOS_BLOQUEO = [0, 30, 60, 300, 900] as const;

export interface PropsPantallaConfiguracion {
  readonly ajustes: Ajustes;
  readonly cargando?: boolean;
  readonly guardando?: boolean;
  /** Clave de i18n del último error, si lo hubo. */
  readonly error?: string | null;
  readonly alCambiar: (cambio: CambioAjustes) => void;
  readonly alVolver: () => void;
}

function Interruptor({
  etiqueta,
  valor,
  alCambiar,
}: {
  readonly etiqueta: string;
  readonly valor: boolean;
  readonly alCambiar: (valor: boolean) => void;
}) {
  const tema = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: tema.espaciado.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Texto nivel="texto">{etiqueta}</Texto>
      </View>
      <Switch accessibilityLabel={etiqueta} value={valor} onValueChange={alCambiar} />
    </View>
  );
}

export function PantallaConfiguracion({
  ajustes,
  cargando = false,
  guardando = false,
  error = null,
  alCambiar,
  alVolver,
}: PropsPantallaConfiguracion) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('perfil.configuracion')} mensajeVacio={t('perfil.cargando')} />;
  }

  const etiquetaPlazo = (segundos: number): string => {
    if (segundos === 0) return t('perfil.bloqueo.sinEspera');
    if (segundos % 60 === 0) return t('perfil.bloqueo.minutos', { count: segundos / 60 });
    return t('perfil.bloqueo.segundos', { count: segundos });
  };

  const siguienteTema = (): Tema => {
    const posicion = TEMAS.indexOf(ajustes.tema);
    return TEMAS[(posicion + 1) % TEMAS.length] ?? 'system';
  };

  return (
    <PantallaBase titulo={t('perfil.configuracion')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        <Boton
          variante="secundario"
          etiqueta={`${t('perfil.tema.titulo')}: ${t(`perfil.tema.${ajustes.tema}`)}`}
          onPress={() => alCambiar({ tema: siguienteTema() })}
          deshabilitado={guardando}
        />

        <Superficie>
          <Interruptor
            etiqueta={t('perfil.ajustes.notificaciones')}
            valor={ajustes.notificaciones}
            alCambiar={(valor) => alCambiar({ notificaciones: valor })}
          />
        </Superficie>

        <Superficie>
          <Interruptor
            etiqueta={t('perfil.ajustes.analitica')}
            valor={ajustes.analitica}
            alCambiar={(valor) => alCambiar({ analitica: valor })}
          />
          <Texto nivel="nota" tono="tenue">
            {t('perfil.ajustes.analiticaNota')}
          </Texto>
        </Superficie>

        <Superficie>
          <Texto nivel="subtitulo">{t('perfil.bloqueo.titulo')}</Texto>
          <Texto nivel="nota" tono="secundario">
            {t('perfil.bloqueo.explicacion')}
          </Texto>

          <View style={{ marginTop: tema.espaciado.sm }}>
            <Interruptor
              etiqueta={t('perfil.bloqueo.biometrico')}
              valor={ajustes.bloqueoBiometrico}
              alCambiar={(valor) => alCambiar({ bloqueoBiometrico: valor })}
            />
          </View>

          {/* El error de biometría se muestra junto a su interruptor, no en
              lo alto de la pantalla: es donde la persona está mirando. */}
          {error === null ? null : (
            <Texto nivel="nota" tono="secundario">
              {t(error)}
            </Texto>
          )}

          <Texto nivel="nota" tono="secundario">
            {t('perfil.bloqueo.espera')}
          </Texto>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {PLAZOS_BLOQUEO.map((segundos) => (
              <View key={segundos} style={{ marginRight: tema.espaciado.sm }}>
                <Boton
                  variante={ajustes.segundosBloqueo === segundos ? 'primario' : 'texto'}
                  etiqueta={etiquetaPlazo(segundos)}
                  onPress={() => alCambiar({ segundosBloqueo: segundos })}
                  deshabilitado={guardando}
                />
              </View>
            ))}
          </ScrollView>
        </Superficie>

        <Superficie>
          <Interruptor
            etiqueta={t('perfil.ajustes.respaldoEnNube')}
            valor={ajustes.respaldoEnNube}
            alCambiar={(valor) => alCambiar({ respaldoEnNube: valor })}
          />
          <Interruptor
            etiqueta={t('perfil.ajustes.descargasSoloWifi')}
            valor={ajustes.descargasSoloWifi}
            alCambiar={(valor) => alCambiar({ descargasSoloWifi: valor })}
          />
        </Superficie>

        <Boton variante="texto" etiqueta={t('perfil.volver')} onPress={alVolver} />
      </ScrollView>
    </PantallaBase>
  );
}
