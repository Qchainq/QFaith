# Publicación, cumplimiento legal y seguridad operativa

Detalle del [Documento 14](../../../../docs/master-prompt/14-ejecucion-pruebas-publicacion.md).

> El cumplimiento legal **requiere revisión profesional antes del lanzamiento
> comercial**. Es uno de los casos en que hay que parar y pedir decisión
> humana, no resolverlo por cuenta propia.

## Publicación iOS

Preparar: cuenta de Apple Developer · identificador de aplicación ·
certificados · perfiles · iconos · capturas · descripción · política de
privacidad · declaración de datos · compras integradas · Inicio con Apple
cuando aplique · permisos justificados · revisión de contenido generado por IA
· proceso de eliminación de cuenta.

Probar mediante **TestFlight** antes de producción.

## Publicación Android

Preparar: cuenta de Google Play · identificador único · firma de aplicación ·
App Bundle · iconos · capturas · ficha · declaración de seguridad de datos ·
suscripciones · permisos · pruebas internas · pruebas cerradas · cumplimiento
de políticas de IA y menores.

## Permisos del sistema

Solicitar **solo cuando sean necesarios**: notificaciones, cámara, fotografías,
micrófono, biometría, calendario, archivos.

Antes de pedir el permiso del sistema: explicar el propósito, solicitarlo en
contexto y permitir continuar sin él cuando sea posible.

**No solicitar** contactos, ubicación precisa ni seguimiento publicitario,
salvo que una función futura realmente lo requiera y exista consentimiento.

## Cumplimiento legal

Antes del lanzamiento se deben preparar:

- Política de privacidad
- Términos de servicio
- Política de cookies para web
- Consentimiento de analítica
- Política de eliminación
- Información de suscripciones
- Tratamiento de datos de menores
- Acuerdos con proveedores
- Registro de actividades de tratamiento
- Procedimiento de incidentes

Cumplir, según territorios: **GDPR** · legislación española y europea aplicable
· reglas de App Store · reglas de Google Play · legislación de protección de
menores · normas de pagos y consumidores.

## Derechos de privacidad del usuario

Minimización de datos · consentimiento informado · acceso a datos · corrección
· portabilidad · eliminación · retirada de consentimiento · retención limitada
· privacidad por defecto.

El usuario debe poder **exportar su contenido privado** en un formato legible y
cifrado cuando corresponda.

## Licencias bíblicas

**No utilizar traducciones protegidas sin autorización.**

Cada traducción debe registrar: titular · tipo de licencia · territorios ·
límites de visualización · permiso offline · permiso de audio · requisitos de
atribución · fecha de vigencia.

La IA no debe reproducir grandes fragmentos de traducciones protegidas sin
autorización.

## Escalabilidad

**Etapa inicial:** Supabase administrado, Edge Functions, Storage,
procesamiento sencillo.

**Al crecer:** separar servicios de IA, colas de trabajos, CDN, procesamiento
de archivos, réplicas de lectura, particionamiento donde sea necesario,
observabilidad avanzada, infraestructura dedicada para cargas críticas.

**No adoptar microservicios innecesarios en la primera versión.** Empezar con
un monolito modular bien diseñado.

## Seguridad operativa

Control de acceso administrativo · MFA obligatorio · separación de entornos ·
principio de mínimo privilegio · rotación de secretos · registro de acciones
administrativas · proceso de vulnerabilidades · copias de seguridad · plan de
recuperación ante desastres · plan de respuesta a incidentes.

## Respuesta a incidentes

1. Contener
2. Evaluar alcance
3. Revocar credenciales
4. Corregir
5. Verificar integridad
6. Notificar según obligación legal
7. Documentar
8. Evitar recurrencia

> **No afirmar que el cifrado protege un dato sin verificar el escenario
> real.**

## Observabilidad

Monitoreo de disponibilidad · registro de errores · métricas de latencia ·
estado de Edge Functions · fallos de sincronización · errores de autenticación
· uso de almacenamiento · colas pendientes · alertas de seguridad.

Nunca incluir contenido privado en trazas o reportes.

## Migraciones en producción

Toda migración debe: tener versión · probarse en desarrollo · probarse en
staging · mantener compatibilidad temporal · contar con respaldo · incluir
validación posterior · evitar bloquear tablas durante periodos largos.

No eliminar campos de golpe: migrar → mantener compatibilidad → retirada
gradual.
