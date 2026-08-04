// Suscripción. Pantalla pura.
//
// En pagos la tentación de apretar es mayor que en ningún otro sitio, y el
// invariante 12 vale también aquí. Cuatro decisiones que son eso, no estética:
//
//   · **Se dice primero que la aplicación funciona sin pagar.** Antes del
//     precio, antes de la lista de funciones. Quien llegue aquí sabrá desde la
//     primera línea que no está comprando el derecho a usar su diario.
//
//   · **Un pago rechazado se cuenta como algo que arreglar, no como una
//     amenaza.** «Sigues teniendo acceso mientras lo resuelves» es literal: el
//     periodo de gracia existe en el esquema.
//
//   · **Se dice qué pasa si se acaba**, y se dice siempre, también estando
//     suscrito. Lo que se pierde son funciones nuevas, nunca lo ya escrito.
//
//   · **Restaurar compras está a la vista.** Cambiar de teléfono no puede
//     obligar a pagar dos veces, y esconderlo lo haría en la práctica.
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Boton } from '@shared/components/Boton';
import { PantallaBase } from '@shared/components/PantallaBase';
import { Superficie } from '@shared/components/Superficie';
import { Texto } from '@shared/components/Texto';
import { mensajeDeAcceso } from '@shared/services/suscripcion/estadoDeAcceso';
import type { ProductoTienda } from '@shared/services/suscripcion/puertoPagos';
import type { Suscripcion } from '@shared/services/suscripcion/repositorioSuscripcion';
import { useTema } from '@shared/theme/ProveedorTema';

export interface PropsPantallaSuscripcion {
  readonly suscripcion: Suscripcion | null;
  readonly productos: readonly ProductoTienda[];
  readonly cargando?: boolean;
  readonly comprando?: boolean;
  readonly restaurando?: boolean;
  readonly alComprar: (productoId: string) => void;
  readonly alRestaurar: () => void;
}

export function PantallaSuscripcion({
  suscripcion,
  productos,
  cargando = false,
  comprando = false,
  restaurando = false,
  alComprar,
  alRestaurar,
}: PropsPantallaSuscripcion) {
  const { t } = useTranslation();
  const tema = useTema();

  if (cargando) {
    return <PantallaBase titulo={t('suscripcion.titulo')} mensajeVacio={t('comun.cargando')} />;
  }

  return (
    <PantallaBase titulo={t('suscripcion.titulo')}>
      <ScrollView contentContainerStyle={{ gap: tema.espaciado.md }}>
        {/* Antes del precio y antes de la lista de funciones. */}
        <Texto>{t('suscripcion.invitacion')}</Texto>

        <Superficie estilo={{ gap: tema.espaciado.xs }}>
          <Texto>{t(mensajeDeAcceso(suscripcion))}</Texto>
          {suscripcion?.renuevaEn !== null && suscripcion?.renuevaEn !== undefined && (
            <Texto nivel="pie" tono="secundario">
              {t(
                suscripcion.terminaAlAcabarElPeriodo || suscripcion.estado === 'canceled'
                  ? 'suscripcion.terminaEn'
                  : 'suscripcion.renuevaEn',
                { fecha: suscripcion.renuevaEn.slice(0, 10) },
              )}
            </Texto>
          )}
        </Superficie>

        {productos.length === 0 ? (
          <Texto nivel="pie" tono="secundario">
            {t('suscripcion.noDisponible')}
          </Texto>
        ) : (
          productos.map((producto) => (
            <Superficie key={producto.id} estilo={{ gap: tema.espaciado.xs }}>
              {/* El precio lo pone la tienda, ya formateado en su moneda. */}
              <Texto>{`${producto.precio} ${t(`suscripcion.periodicidad.${producto.periodicidad}`)}`}</Texto>
              {producto.diasDePrueba > 0 && (
                <Texto nivel="pie" tono="secundario">
                  {t('suscripcion.prueba', { dias: producto.diasDePrueba })}
                </Texto>
              )}
              <Boton
                etiqueta={comprando ? t('suscripcion.comprando') : t('suscripcion.comprar')}
                onPress={() => alComprar(producto.id)}
                deshabilitado={comprando}
              />
            </Superficie>
          ))
        )}

        <View style={{ gap: tema.espaciado.sm }}>
          <Boton
            variante="texto"
            etiqueta={restaurando ? t('suscripcion.restaurando') : t('suscripcion.restaurar')}
            onPress={alRestaurar}
            deshabilitado={restaurando}
          />
          {/* Siempre, también estando suscrito: es lo que quita el miedo. */}
          <Texto nivel="pie" tono="secundario">
            {t('suscripcion.siempreTuyo')}
          </Texto>
        </View>
      </ScrollView>
    </PantallaBase>
  );
}
