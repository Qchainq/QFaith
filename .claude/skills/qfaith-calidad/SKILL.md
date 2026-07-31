---
name: qfaith-calidad
description: >-
  Criterios de calidad, pruebas y entrega de QFaith: alcance exacto del MVP y
  qué queda fuera, tipos de pruebas obligatorias, flujos end-to-end, pruebas de
  cifrado y de aislamiento entre usuarios, objetivos de cobertura, prohibiciones
  de estilo de código, objetivos de rendimiento, accesibilidad, analítica
  permitida, gestión de errores, CI/CD, entornos y secretos, versionado
  semántico, OTA, publicación en App Store y Google Play, cumplimiento legal,
  monetización freemium, y la definición de terminado por tarea, por módulo y
  del proyecto. Úsala al escribir pruebas, revisar código, configurar CI,
  preparar una release, decidir si algo está terminado, o al planificar el
  alcance de una fase. Actívala si se menciona test, cobertura, CI, pipeline,
  release, publicar, tienda, MVP, rendimiento, accesibilidad, definición de
  terminado o auditoría en QFaith.
---

# Calidad, pruebas y entrega

Fuente:
[Documento 14](../../../docs/master-prompt/14-ejecucion-pruebas-publicacion.md).

## Alcance del MVP

Los 25 puntos del MVP están en el Documento 14. En resumen: auth + recuperación
+ onboarding, Inicio, Pulso Espiritual, hábitos, oración, memorial, diario,
Biblia offline con licencia válida, notas/subrayados/marcadores/favoritos,
planes de lectura, IA con límites, Biblioteca de Vida, notas de sermones,
perfil y configuración, biometría y PIN, sincronización cifrada, restauración,
notificaciones, modo oscuro, español e inglés, offline, eliminación de cuenta,
freemium.

**Fuera del MVP** (no desarrollar antes de estabilizarlo): Modo Familia
completo, donaciones, cursos avanzados, certificados, chat interno, QChat, ruta
de discipulado, audio bíblico Premium, marketplace, funciones empresariales,
integraciones profundas de calendario, panel web avanzado, Modo Peregrino
ampliado, Modo Arca avanzado con claves independientes.

## Pruebas obligatorias

Unitarias · integración · componentes · end-to-end · sincronización · offline ·
cifrado · seguridad · accesibilidad · rendimiento · restauración · migraciones
· regresión.

**Las pruebas no se limitan a casos exitosos.** Incluye siempre: entradas
vacías, datos inválidos, límites, nulos, fechas extremas, cambios de zona
horaria, datos corruptos y operaciones repetidas.

### Flujo end-to-end mínimo (21 pasos)

Crear cuenta → onboarding → crear hábito → registrar cumplimiento → crear
oración → añadir actualización → marcar respondida → crear memorial → entrada
de diario → adjuntar archivo cifrado → leer Biblia → nota bíblica →
conversación con IA → activar biometría → cerrar sesión → volver a entrar →
usar sin Internet → recuperar conexión → sincronizar → restaurar en otro
dispositivo → eliminar cuenta.

### Pruebas de cifrado

- El texto privado nunca llega abierto al servidor.
- Los archivos se cifran antes de subirse.
- Las claves no aparecen en logs.
- Mismo contenido + nonces distintos ⇒ resultados distintos.
- Clave incorrecta ⇒ no descifra.
- Datos manipulados ⇒ fallan de forma segura.
- La rotación de claves mantiene acceso a datos antiguos.
- La restauración exige la credencial de recuperación correcta.
- El servidor no puede reconstruir la clave maestra.
- Los backups siguen cifrados.

### Pruebas de aislamiento

Con **al menos dos usuarios de prueba**: ninguno puede leer ni modificar
registros del otro; una iglesia no accede al diario de un miembro; un mentor no
lee datos no compartidos; un administrador técnico no descifra contenido
privado; las URLs de Storage no dan acceso público; los identificadores
adivinados no conceden acceso.

## Cobertura

| Área | Mínimo |
| --- | --- |
| Dominio y seguridad | 90 % |
| Sincronización y cifrado | 90 % |
| Casos de uso principales | 85 % |
| Componentes generales | 70 % |
| **Global** | **80 %** |

La cobertura no sustituye a la calidad. **No escribas pruebas inútiles para
subir el porcentaje.**

## Calidad de código

Obligatorio: TypeScript estricto, linter, formateador, validación de esquemas,
separación de responsabilidades, inyección de dependencias donde corresponda,
manejo centralizado de errores, componentes reutilizables, documentación de
módulos críticos.

**Prohibido:** `any` indiscriminado · código comentado sin propósito · secretos
incrustados · funciones excesivamente grandes · componentes monolíticos ·
consultas directas sin autorización · dependencias abandonadas · duplicación
innecesaria · supresión de errores de TypeScript sin justificación.

## Revisión

Todo cambio importante pasa por: revisión funcional → arquitectura → seguridad
cuando corresponda → pruebas → verificación visual → accesibilidad.

**Cifrado, autenticación, recuperación, pagos y crisis requieren revisión de
Opus.**

## Rendimiento

| Métrica | Objetivo |
| --- | --- |
| Inicio frío | < 2,5 s (dispositivo medio) |
| Inicio caliente | < 1 s |
| Pantallas principales | 60 FPS cuando el dispositivo lo permita |
| Consultas locales frecuentes | < 100 ms |
| Apertura de contenido privado | < 500 ms |
| Pantalla de Inicio | < 2 s |

**Mide antes de optimizar.** No optimices partes no críticas.

Técnicas: carga diferida, listas virtualizadas, compresión de imágenes,
miniaturas, caché controlada, paginación, consultas incrementales, índices
adecuados, descargas bajo demanda, prevención de renders innecesarios.

## Gestión de errores

Cada error tiene: código estable, categoría, mensaje técnico interno, mensaje
comprensible para el usuario, si puede reintentarse, acción recomendada e
identificador de diagnóstico sin datos privados.

**Nunca mostrar** stack traces, SQL, tokens, rutas internas ni respuestas
completas del proveedor de IA.

## Analítica y observabilidad

**Permitido:** sesiones, versión, SO, rendimiento, errores, pantallas
agregadas, adopción de funciones, conversión de suscripción, fallos de
sincronización.

**Prohibido:** diario, texto de oraciones, estado espiritual concreto,
conversaciones con IA, nombres en peticiones, confesiones, Modo Arca, notas
privadas.

Observabilidad: disponibilidad, errores, latencia, estado de Edge Functions,
fallos de sync, errores de auth, uso de Storage, colas pendientes, alertas de
seguridad. **Nunca contenido privado en trazas.**

## CI/CD

Cada Pull Request ejecuta: instalación limpia · linter · formateo · type check
· pruebas unitarias · pruebas de integración · auditoría de dependencias ·
escaneo de secretos · build Android · validación iOS cuando el entorno lo
permita · comprobación de migraciones.

**No fusionar si falla una comprobación obligatoria.**

## Entornos y secretos

Development · Test · Staging · Production — cada uno con su proyecto Supabase,
claves, Storage, proveedor de IA y analítica.

**Nunca claves de producción en local.** Secretos en el gestor del proveedor,
variables protegidas de CI/CD o Secure Enclave/Keystore. **Nunca en Git, código
fuente, capturas, logs ni archivos de ejemplo.**

## Versionado y OTA

Versionado semántico. Cada versión incluye notas, migraciones, riesgos, plan de
reversión y compatibilidad mínima.

OTA solo para cambios permitidos por las plataformas. **Nunca** para cambiar
comportamiento sensible sin revisión, introducir código nativo incompatible,
evadir la revisión de tiendas ni modificar pagos sin autorización.

## Monetización

Freemium. **La versión gratuita debe ser útil y digna.**

> **Nunca conviertas la fe, la oración o la seguridad básica en privilegios de
> pago.**

Gratis incluye como mínimo: cuenta, hábitos, oraciones, memorial, diario
básico, Biblia legal, notas y favoritos, planes gratuitos, IA con límite
razonable, sincronización cifrada básica, biometría, modo oscuro,
notificaciones, iglesia básica.

**No bloquear la recuperación de datos por falta de suscripción.** No eliminar
datos privados al expirar una suscripción.

Pagos por los sistemas de cada plataforma cuando sean obligatorios. Nunca
almacenar datos de tarjeta. Validar compras en servidor. Precios fuera del
código.

## Legal

Antes del lanzamiento: política de privacidad, términos, cookies (web),
consentimiento de analítica, política de eliminación, información de
suscripciones, tratamiento de menores, acuerdos con proveedores, registro de
actividades, procedimiento de incidentes.

Cumplir GDPR, legislación española y europea, reglas de App Store y Google
Play, protección de menores y normas de pagos.

**Requiere revisión legal profesional antes del lanzamiento comercial** — es
uno de los casos en que hay que parar y pedir decisión humana.

**Licencias bíblicas:** no usar traducciones protegidas sin autorización.
Registrar titular, tipo de licencia, territorios, límites de visualización,
permiso offline, permiso de audio, atribución y vigencia.

## Definición de terminado

**Tarea:** el código existe · compila · cumple el requisito · tiene pruebas ·
maneja errores · respeta accesibilidad · respeta privacidad · documentada
cuando corresponde · sin regresiones · revisada según su riesgo.

**Módulo:** todos los flujos funcionan · online y offline cuando corresponda ·
sincroniza · respeta permisos · maneja estado vacío, carga, error y pérdida de
conexión · tiene pruebas · mantiene el Design System · no filtra datos · cumple
sus criterios de aceptación.

**Proyecto:** los 25 criterios finales del Documento 14.

## Reglas de ejecución

No dejes funciones simuladas en producción. No marques una tarea como terminada
si depende de código falso. No elimines seguridad para avanzar. No sustituyas
funciones fallidas por TODO permanentes. No uses datos reales en pruebas. No
declares una fase terminada sin cumplir todos sus criterios.
