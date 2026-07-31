# Monetización, pagos y gestión de versiones

Detalle del [Documento 14](../../../../docs/master-prompt/14-ejecucion-pruebas-publicacion.md).

## Modelo

**Freemium.** La versión gratuita debe ser **útil y digna**.

> **Nunca conviertas la fe, la oración o la seguridad básica en privilegios de
> pago.**

## Versión gratuita — mínimo obligatorio

Cuenta · hábitos · oraciones · memorial · diario básico · Biblia disponible
legalmente · notas y favoritos · planes gratuitos · IA con límite razonable ·
sincronización cifrada básica · biometría · modo oscuro · notificaciones ·
iglesia básica.

## Versión Premium — puede incluir

Mayor uso de IA · modelos de IA avanzados · devocionales personalizados ·
Biblioteca de Vida avanzada · mayor almacenamiento · transcripción de audio ·
análisis privado local · más opciones de personalización · planes Premium ·
audio bíblico licenciado · funciones familiares futuras · exportación avanzada.

## Reglas innegociables

- **No bloquear la recuperación de datos por falta de suscripción.**
- **No eliminar datos privados inmediatamente cuando una suscripción expire.**
- No usar notificaciones de pago para presionar espiritualmente.

## Pagos

En iOS y Android, usar los sistemas de compra admitidos por cada plataforma
cuando sean obligatorios.

- **No almacenar datos de tarjetas.**
- Validar compras **en servidor**.
- Mantener historial mínimo para auditoría financiera.

Permitir: compra · restauración · cancelación · cambio de plan · consulta de
estado · periodo de gracia · manejo de pago rechazado.

La tabla `subscriptions` guarda solo referencias del proveedor
(`provider_customer_reference`, `provider_subscription_reference`), nunca datos
de pago.

## Precios

Definidos **fuera del código**, mediante configuración segura.

Permitir: plan mensual · plan anual · prueba opcional · precios regionales ·
promociones legales.

**No usar tácticas engañosas.** Mostrar claramente precio, periodicidad,
renovación, cancelación y funciones incluidas.

## Versionado semántico

`MAYOR.MENOR.PARCHE` — por ejemplo `1.0.0`.

- **Mayor:** modificación incompatible.
- **Menor:** nueva función compatible.
- **Parche:** corrección.

Cada versión debe incluir: notas · migraciones · riesgos · plan de reversión ·
compatibilidad mínima.

## Actualizaciones OTA

Usar OTA únicamente para cambios permitidos por las plataformas.

**No utilizar OTA para:**

- Cambiar comportamiento sensible sin revisión
- Introducir código nativo incompatible
- Evadir la revisión de las tiendas
- Modificar pagos de forma no autorizada

Toda actualización OTA debe estar **firmada y poder revertirse**.
