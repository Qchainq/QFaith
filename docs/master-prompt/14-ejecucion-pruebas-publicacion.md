# Documento 14 — Ejecución Final, Pruebas, Publicación y Criterios de Entrega

> Versión 1.0. Debe utilizarse junto con los documentos 0 al 13.
> **Ninguna fase podrá considerarse terminada si no cumple este documento.**

## Alcance

Testing · calidad del código · rendimiento · accesibilidad · escalabilidad ·
analítica y observabilidad · suscripciones y monetización · cumplimiento legal
· publicación en App Store y Google Play · CI/CD · gestión de versiones ·
organización del trabajo entre Opus, Sonnet y Haiku · definición exacta de
terminado.

## MVP oficial

La primera versión pública de QFaith deberá incluir:

1. Registro e inicio de sesión.
2. Recuperación de cuenta.
3. Configuración inicial.
4. Pantalla de inicio.
5. Pulso espiritual.
6. Hábitos espirituales.
7. Centro de oración.
8. Memorial de oraciones respondidas.
9. Diario espiritual.
10. Biblia y lectura sin conexión, siempre que las traducciones utilizadas
    tengan licencia válida.
11. Notas, subrayados, marcadores y favoritos bíblicos.
12. Planes de lectura.
13. IA cristiana con límites doctrinales y de seguridad.
14. Biblioteca de Vida.
15. Notas de sermones y acciones prácticas.
16. Perfil y configuración.
17. Biometría y PIN.
18. Sincronización cifrada.
19. Restauración en un dispositivo nuevo.
20. Notificaciones y recordatorios.
21. Modo oscuro.
22. Español e inglés.
23. Funcionamiento offline.
24. Eliminación de cuenta.
25. Suscripción gratuita y Premium.

## Funciones que NO bloquean el lanzamiento inicial

Modo Familia completo · Donaciones · Cursos avanzados de iglesia · Certificados
· Chat interno · Integración con QChat · Ruta de discipulado · Audio bíblico
Premium · Marketplace de contenido · Funciones empresariales para grandes
iglesias · Integraciones profundas con calendarios externos · Panel web
avanzado para iglesias · Modo Peregrino ampliado · Modo Arca avanzado con
claves independientes.

**No desarrollar estas funciones antes de completar y estabilizar el MVP.**

## Testing general

Todo código deberá tener pruebas proporcionales a su riesgo.

Tipos obligatorios: unitarias · integración · componentes · end-to-end ·
sincronización · offline · cifrado · seguridad · accesibilidad · rendimiento ·
restauración · migraciones · regresión.

### Pruebas unitarias

Deberán cubrir: casos de uso, validaciones, cálculo de hábitos, programación de
recordatorios, resolución de estados, serialización, cifrado y descifrado
mediante vectores de prueba, transformaciones de datos, control de permisos,
clasificación de errores, reglas de suscripción, lógica de sincronización.

**No limitar las pruebas a casos exitosos.** Incluir: entradas vacías, datos
inválidos, límites, valores nulos, fechas extremas, cambios de zona horaria,
datos corruptos, operaciones repetidas.

### Pruebas de integración

Probar la interacción entre: autenticación y perfil · base local y nube ·
cifrado y almacenamiento · hábitos y notificaciones · oraciones y memoriales ·
Biblia y notas · diario y Biblioteca de Vida · IA y políticas de seguridad ·
suscripciones y permisos Premium · eliminación de cuenta y limpieza de datos.

### Pruebas end-to-end

Flujos mínimos obligatorios:

1. Crear cuenta
2. Completar onboarding
3. Crear hábito
4. Registrar cumplimiento
5. Crear oración
6. Añadir actualización
7. Marcarla como respondida
8. Crear memorial
9. Crear entrada de diario
10. Adjuntar archivo cifrado
11. Leer Biblia
12. Crear nota bíblica
13. Crear conversación con IA
14. Activar biometría
15. Cerrar sesión
16. Iniciar sesión de nuevo
17. Utilizar la aplicación sin Internet
18. Recuperar conexión
19. Sincronizar
20. Restaurar en otro dispositivo
21. Eliminar cuenta

### Pruebas de cifrado

Obligatorio comprobar:

- El texto privado nunca llega abierto al servidor.
- Los archivos se cifran antes de subirlos.
- Las claves no aparecen en logs.
- El mismo contenido con nonces diferentes produce resultados distintos.
- Una clave incorrecta no descifra información.
- Los datos manipulados fallan de forma segura.
- La rotación de claves mantiene acceso a datos antiguos.
- La restauración requiere la credencial de recuperación correspondiente.
- El servidor no puede reconstruir la clave maestra.
- Las copias de seguridad permanecen cifradas.

La criptografía deberá revisarse con herramientas y bibliotecas reconocidas.
**Nunca crear algoritmos propios.**

### Pruebas de aislamiento

Crear al menos dos usuarios de prueba. Verificar que:

- Un usuario no puede consultar registros del otro.
- Un usuario no puede modificar registros del otro.
- Una iglesia no puede acceder al diario de un miembro.
- Un mentor no puede leer datos no compartidos.
- Un administrador técnico no puede descifrar contenido privado.
- Las URLs de Storage no permiten acceso público.
- Los identificadores adivinados no conceden acceso.

### Pruebas offline

Inicio de la app sin Internet · creación offline · edición offline ·
eliminación offline · adjuntos pendientes · reinicio del teléfono · cierre
forzado · recuperación de conectividad · sincronización automática · conflictos
entre dos dispositivos · interrupción durante la sincronización · reintento sin
duplicados · modo avión prolongado.

### Pruebas de restauración

Cambio normal de teléfono · dispositivo perdido · aplicación reinstalada · base
local eliminada · respaldo incompleto · clave incorrecta · clave de
recuperación válida · dispositivo revocado · archivos grandes · historial de
varios años · restauración interrumpida · reanudación posterior.

**La restauración no deberá sobrescribir datos recientes sin confirmación.**

### Pruebas de IA

Evaluar: fidelidad a las instrucciones, referencias bíblicas, diferenciación
entre texto / interpretación / consejo, rechazo de profecías, rechazo de hablar
en nombre de Dios, diversidad doctrinal, respuestas ante crisis,
alucinaciones, privacidad, inyección de prompts, intentos de evadir límites,
lenguaje culpabilizador, dependencia emocional.

Crear un **conjunto fijo de preguntas de evaluación**. Cada cambio de modelo o
prompt deberá ejecutar nuevamente estas pruebas.

## Modo Crisis

La IA deberá detectar indicadores de: autolesión, suicidio, violencia, abuso,
riesgo inmediato, desesperación extrema, crisis médica.

En estos casos deberá:

- Responder con empatía.
- Recomendar ayuda humana inmediata.
- Facilitar recursos locales cuando estén disponibles.
- Sugerir contactar a una persona de confianza.
- No limitarse a una oración o versículo.
- No afirmar que existe supervisión humana si no existe.
- No emitir diagnósticos.

**Toda lógica de crisis deberá revisarse antes del lanzamiento.**

## Calidad del código

Todo el proyecto utilizará: TypeScript estricto, linter, formateador,
validación de esquemas, separación de responsabilidades, inyección de
dependencias donde corresponda, manejo centralizado de errores, componentes
reutilizables, documentación de módulos críticos.

**Queda prohibido:** uso indiscriminado de `any`, código comentado sin
propósito, secretos incrustados, funciones excesivamente grandes, componentes
monolíticos, consultas directas sin autorización, dependencias abandonadas,
duplicación innecesaria, supresión de errores de TypeScript sin justificación.

## Cobertura

| Área | Mínimo |
| --- | --- |
| Dominio y seguridad | 90 % |
| Sincronización y cifrado | 90 % |
| Casos de uso principales | 85 % |
| Componentes generales | 70 % |
| **Cobertura global** | **80 %** |

La cobertura no reemplaza la calidad de las pruebas. No escribir pruebas
inútiles solo para aumentar porcentajes.

## Revisión de código

Todo cambio importante deberá pasar por:

1. Revisión funcional
2. Revisión de arquitectura
3. Revisión de seguridad cuando corresponda
4. Ejecución de pruebas
5. Verificación visual
6. Validación de accesibilidad

**Los cambios de cifrado, autenticación, recuperación, pagos y crisis requieren
revisión de Opus.**

## Rendimiento

| Métrica | Objetivo |
| --- | --- |
| Inicio frío | < 2,5 s en dispositivos medios |
| Inicio caliente | < 1 s |
| Navegación | Respuesta visual inmediata |
| Pantallas principales | 60 FPS cuando el dispositivo lo permita |
| Consultas locales frecuentes | < 100 ms |
| Apertura de contenido privado | < 500 ms en condiciones normales |
| Sincronización | No bloquear la interfaz |
| Memoria | Evitar crecimiento continuo |
| Batería | No mantener procesos persistentes innecesarios |

## Optimización

Carga diferida · listas virtualizadas · compresión de imágenes · miniaturas ·
caché controlada · paginación · consultas incrementales · índices adecuados ·
descargas bajo demanda · eliminación de archivos temporales · prevención de
renders innecesarios.

**No optimizar prematuramente partes no críticas. Medir antes de modificar.**

## Accesibilidad

Etiquetas para lectores de pantalla · orden lógico de navegación · tamaños
táctiles suficientes · contraste adecuado · texto adaptable · reducción de
movimiento · estados que no dependan solo del color · mensajes de error
comprensibles · navegación mediante teclado cuando sea aplicable ·
compatibilidad con modo de alto contraste.

Probar con herramientas reales de iOS y Android.

## Diseño responsivo

Teléfonos pequeños · teléfonos grandes · pantallas plegables cuando sea viable
· tabletas · orientación vertical · orientación horizontal en pantallas
compatibles.

No estirar interfaces móviles sin adaptación.

## Analítica

**Permitido:** sesiones, versión de la app, sistema operativo, rendimiento,
errores, pantallas abiertas de forma agregada, adopción de funciones generales,
conversión de suscripción, fallos de sincronización.

**Prohibido:** contenido del diario, texto de oraciones, estado espiritual
concreto, conversaciones con IA, nombres incluidos en peticiones, confesiones,
contenido del Modo Arca, texto de notas privadas.

La analítica deberá respetar el consentimiento del usuario y la normativa
aplicable.

## Observabilidad

Monitoreo de disponibilidad · registro de errores · métricas de latencia ·
estado de Edge Functions · fallos de sincronización · errores de autenticación
· uso de almacenamiento · colas pendientes · alertas de seguridad.

**Nunca incluir contenido privado en trazas o reportes.**

## Gestión de errores

Cada error deberá tener: código estable, categoría, mensaje técnico interno,
mensaje comprensible para el usuario, indicación de si puede reintentarse,
acción recomendada, identificador de diagnóstico sin datos privados.

**No mostrar:** stack traces, SQL, tokens, rutas internas, respuestas completas
del proveedor de IA.

## Escalabilidad

**Etapa inicial:** Supabase administrado, Edge Functions, Storage,
procesamiento sencillo.

**Al crecer:** separar servicios de IA, colas de trabajos, CDN, procesamiento
de archivos, réplicas de lectura, particionamiento donde sea necesario,
observabilidad avanzada, infraestructura dedicada para cargas críticas.

**No adoptar microservicios innecesarios en la primera versión. Empezar con un
monolito modular bien diseñado.**

## Migraciones

Toda migración deberá: tener versión, probarse en desarrollo, probarse en
staging, mantener compatibilidad temporal, contar con respaldo, incluir
validación posterior, evitar bloquear tablas durante periodos largos.

No eliminar campos inmediatamente. Aplicar primero migración, compatibilidad y
retirada gradual.

## Monetización

QFaith utilizará modelo **Freemium**. La versión gratuita deberá ser útil y
digna.

> **Nunca convertir la fe, la oración o la seguridad básica en privilegios de
> pago.**

### Versión gratuita

Incluirá como mínimo: cuenta, hábitos, oraciones, memorial, diario básico,
Biblia disponible legalmente, notas y favoritos, planes gratuitos, IA con
límite razonable, sincronización cifrada básica, biometría, modo oscuro,
notificaciones, iglesia básica.

### Versión Premium

Podrá incluir: mayor uso de IA, modelos de IA avanzados, devocionales
personalizados, Biblioteca de Vida avanzada, mayor almacenamiento,
transcripción de audio, análisis privado local, más opciones de
personalización, planes Premium, audio bíblico licenciado, funciones familiares
futuras, exportación avanzada.

**No bloquear la recuperación de datos por falta de suscripción.**

### Pagos

En iOS y Android utilizar los sistemas de compra admitidos por cada plataforma
cuando sean obligatorios. No almacenar datos de tarjetas. Validar compras en
servidor.

Permitir: compra, restauración, cancelación, cambio de plan, consulta de
estado, periodo de gracia, manejo de pago rechazado.

**No eliminar datos privados inmediatamente cuando una suscripción expire.**

### Precios

Los precios deberán definirse fuera del código mediante configuración segura.

Permitir: plan mensual, plan anual, prueba opcional, precios regionales,
promociones legales.

No utilizar tácticas engañosas. Mostrar claramente: precio, periodicidad,
renovación, cancelación, funciones incluidas.

## Cumplimiento legal

Antes del lanzamiento se deberán preparar: política de privacidad, términos de
servicio, política de cookies para web, consentimiento de analítica, política
de eliminación, información de suscripciones, tratamiento de datos de menores,
acuerdos con proveedores, registro de actividades de tratamiento, procedimiento
de incidentes.

Cumplir, según territorios: GDPR, legislación española y europea aplicable,
reglas de App Store, reglas de Google Play, legislación de protección de
menores, normas de pagos y consumidores.

**Obtener revisión legal profesional antes del lanzamiento comercial.**

## Privacidad

Minimización de datos · consentimiento informado · acceso a datos · corrección
· portabilidad · eliminación · retirada de consentimiento · retención limitada
· privacidad por defecto.

El usuario deberá poder exportar su contenido privado en un formato legible y
cifrado cuando corresponda.

## Licencias bíblicas

**No utilizar traducciones protegidas sin autorización.**

Cada traducción deberá registrar: titular, tipo de licencia, territorios,
límites de visualización, permiso offline, permiso de audio, requisitos de
atribución, fecha de vigencia.

La IA no deberá reproducir grandes fragmentos de traducciones protegidas sin
autorización.

## Publicación iOS

Preparar: cuenta de Apple Developer, identificador de aplicación, certificados,
perfiles, iconos, capturas, descripción, política de privacidad, declaración de
datos, compras integradas, Inicio con Apple cuando aplique, permisos
justificados, revisión de contenido generado por IA, proceso de eliminación de
cuenta.

Probar mediante TestFlight antes de producción.

## Publicación Android

Preparar: cuenta de Google Play, identificador único, firma de aplicación, App
Bundle, iconos, capturas, ficha, declaración de seguridad de datos,
suscripciones, permisos, pruebas internas, pruebas cerradas, cumplimiento de
políticas de IA y menores.

## Permisos

Solicitar solo cuando sean necesarios. Posibles permisos: notificaciones,
cámara, fotografías, micrófono, biometría, calendario, archivos.

Antes del permiso del sistema: explicar el propósito, solicitarlo en contexto,
permitir continuar sin él cuando sea posible.

**No solicitar contactos, ubicación precisa o seguimiento publicitario** salvo
que una función futura realmente lo requiera y exista consentimiento.

## CI/CD

Toda rama principal deberá utilizar integración continua. Cada Pull Request
ejecutará:

- Instalación limpia
- Linter
- Formateo
- Type check
- Pruebas unitarias
- Pruebas de integración
- Auditoría de dependencias
- Escaneo de secretos
- Build Android
- Validación iOS cuando el entorno lo permita
- Comprobación de migraciones

**No fusionar si falla una comprobación obligatoria.**

## Entornos

Mantener: Development · Test · Staging · Production

Cada entorno tendrá: proyecto Supabase separado, claves separadas, Storage
separado, proveedor de IA separado o límites específicos, analítica separada,
configuración propia.

**Nunca utilizar claves de producción localmente.**

## Secretos

Guardar secretos en: gestor de secretos del proveedor, variables protegidas de
CI/CD, Secure Enclave o Keystore cuando corresponda.

**Nunca incluir secretos en:** Git, código fuente, capturas, logs, archivos de
ejemplo, aplicación cliente cuando otorguen privilegios administrativos.

## Gestión de versiones

Utilizar versionado semántico (`1.0.0`).

- **Mayor:** modificación incompatible.
- **Menor:** nueva función compatible.
- **Parche:** corrección.

Cada versión deberá incluir: notas, migraciones, riesgos, plan de reversión,
compatibilidad mínima.

## Actualizaciones OTA

Usar OTA únicamente para cambios permitidos por las plataformas.

**No utilizar OTA para:** cambiar comportamiento sensible sin revisión,
introducir código nativo incompatible, evadir revisión de tiendas, modificar
pagos de forma no autorizada.

Toda actualización deberá estar firmada y poder revertirse.

## Seguridad operativa

Control de acceso administrativo · MFA obligatorio · separación de entornos ·
principio de mínimo privilegio · rotación de secretos · registro de acciones
administrativas · proceso de vulnerabilidades · copias de seguridad · plan de
recuperación ante desastres · plan de respuesta a incidentes.

### Respuesta a incidentes

1. Contener
2. Evaluar alcance
3. Revocar credenciales
4. Corregir
5. Verificar integridad
6. Notificar según obligación legal
7. Documentar
8. Evitar recurrencia

No afirmar que el cifrado protege un dato sin verificar el escenario real.

## Organización en tres fases

### Fase 1 — Fundamentos

Opus para diseño y revisión · Sonnet para implementación · Haiku para apoyo
mecánico.

**Incluye:** arquitectura, proyecto base, navegación, Design System, Supabase,
base local, autenticación, cifrado, gestión de claves, RLS, sincronización
base, CI/CD, entornos, pruebas fundacionales.

**Criterio de salida:** crear, cifrar, sincronizar y restaurar un registro
privado entre dos dispositivos de prueba.

### Fase 2 — Producto funcional

Sonnet principal · Opus revisa módulos críticos · Haiku tareas repetitivas.

**Incluye:** Inicio, Pulso, Hábitos, Oración, Memorial, Diario, Biblia, Planes,
IA, Biblioteca de Vida, Sermones, Perfil, Configuración, Notificaciones,
Suscripción, Offline completo.

**Criterio de salida:** todos los flujos del MVP funcionan de extremo a extremo
en iOS y Android.

### Fase 3 — Calidad y lanzamiento

Sonnet para correcciones · Opus para auditoría final · Haiku para documentación
y validaciones repetitivas.

**Incluye:** pruebas completas, rendimiento, accesibilidad, seguridad, revisión
de IA, cumplimiento legal, preparación de tiendas, staging, beta, corrección de
errores, publicación, monitoreo.

**Criterio de salida:** aplicación aprobada para producción y sin errores
críticos abiertos.

## Asignación de modelos

### Opus

**Utilizar para:** arquitectura, criptografía, seguridad, recuperación,
autenticación, modelo de amenazas, resolución de conflictos complejos, diseño
del sistema de IA, modo crisis, pagos, auditoría, errores difíciles, aprobación
de fase.

**No utilizar para:** crear componentes repetitivos, renombrar archivos, textos
simples, datos de prueba, formato.

### Sonnet

**Utilizar para:** implementación principal, pantallas, servicios,
repositorios, integraciones, formularios, navegación, sincronización, pruebas,
refactorizaciones normales, corrección de errores, Design System.

Debe seguir las decisiones de Opus. No podrá modificar arquitectura crítica sin
revisión.

### Haiku

**Utilizar para:** documentación, traducciones, datos ficticios, comentarios,
archivos repetitivos, ajustes de textos, pruebas simples, limpieza, formato,
tareas mecánicas.

**No podrá aprobar:** seguridad, cifrado, recuperación, pagos, crisis,
arquitectura.

## Reglas de ejecución para la IA

1. Leer todos los documentos antes de programar.
2. Crear un inventario de requisitos.
3. Identificar contradicciones.
4. Resolver contradicciones mediante el documento más específico y reciente.
5. Trabajar por fases completas.
6. No pedir autorización por archivos o decisiones menores.
7. Registrar decisiones técnicas relevantes.
8. Ejecutar pruebas después de cada módulo.
9. No dejar funciones simuladas en producción.
10. No marcar una tarea como terminada si depende de código falso.
11. No eliminar seguridad para avanzar más rápido.
12. No sustituir funciones fallidas por TODO permanentes.
13. No utilizar datos reales en pruebas.
14. Mantener la interfaz Liquid Glass coherente.
15. Priorizar funcionalidad, seguridad y claridad sobre efectos visuales.

## Cuándo detenerse

**La IA solo deberá solicitar decisión humana cuando:**

- Existan requisitos contradictorios sin criterio de prioridad.
- Una decisión cambie el modelo de negocio.
- Se necesite adquirir una licencia.
- Se genere un costo externo relevante.
- Sea necesario aceptar un riesgo de seguridad.
- Se requieran credenciales que no existen.
- Una política legal necesite aprobación profesional.
- Una plataforma exija una decisión del propietario.
- Se pretenda eliminar información o infraestructura de producción.

**No detenerse por:** nombres internos, carpetas, componentes, tests normales,
refactorizaciones compatibles, decisiones técnicas menores.

## Definición de terminado — por tarea

El código existe · compila · cumple el requisito · tiene pruebas · maneja
errores · respeta accesibilidad · respeta privacidad · está documentada cuando
corresponde · no introduce regresiones · fue revisada según su riesgo.

## Definición de terminado — por módulo

Todos sus flujos funcionan · funciona online y offline cuando corresponda ·
sincroniza correctamente · respeta permisos · maneja estado vacío · maneja
carga · maneja error · maneja pérdida de conexión · tiene pruebas · mantiene el
Design System · no filtra datos · cumple criterios de aceptación.

## Definición final del proyecto

QFaith solo podrá considerarse terminado cuando:

1. Todos los módulos del MVP estén implementados.
2. No existan funciones simuladas visibles.
3. No existan errores críticos.
4. No existan vulnerabilidades críticas conocidas.
5. La información privada esté cifrada antes de salir del dispositivo.
6. La empresa no pueda descifrar el contenido privado.
7. La sincronización funcione entre dispositivos.
8. La restauración haya sido probada.
9. El uso offline sea estable.
10. Las políticas RLS estén verificadas.
11. La IA respete todos los límites.
12. El modo crisis esté validado.
13. Las notificaciones protejan la privacidad.
14. La interfaz sea coherente.
15. La accesibilidad haya sido probada.
16. El rendimiento cumpla los objetivos.
17. La política de privacidad esté disponible.
18. Los términos estén disponibles.
19. Las licencias bíblicas estén verificadas.
20. Las suscripciones funcionen correctamente.
21. La eliminación de cuenta funcione.
22. La aplicación supere pruebas internas.
23. La beta no tenga bloqueos graves.
24. App Store y Google Play estén preparados.
25. La documentación técnica esté actualizada.

## Orden final de ejecución

1. Leer documentos 0 al 14.
2. Crear matriz de requisitos.
3. Crear backlog por fase.
4. Clasificar tareas para Opus, Sonnet y Haiku.
5. Implementar Fase 1.
6. Auditar Fase 1 con Opus.
7. Corregir todos los bloqueantes.
8. Implementar Fase 2.
9. Ejecutar pruebas de integración.
10. Auditar IA, seguridad y privacidad.
11. Implementar Fase 3.
12. Ejecutar pruebas completas.
13. Preparar beta.
14. Corregir incidencias.
15. Preparar tiendas.
16. Publicar únicamente con aprobación humana final.

## Instrucción final para la IA

Construye QFaith como un producto real de producción.

- No reduzcas el alcance sin autorización.
- No improvises en seguridad.
- No utilices atajos que comprometan la privacidad.
- No conviertas la fe en gamificación agresiva.
- No permitas que la IA adopte autoridad espiritual.
- No declares una fase terminada antes de cumplir todos sus criterios.
- Usa Opus para las decisiones difíciles y la revisión crítica.
- Usa Sonnet como desarrollador principal.
- Usa Haiku para tareas mecánicas y de bajo riesgo.
- Avanza automáticamente dentro de cada fase.
- Detente únicamente ante decisiones humanas reales.

El resultado final deberá ser una aplicación cristiana elegante, útil, privada,
segura, accesible, estable y preparada para crecer durante muchos años.
