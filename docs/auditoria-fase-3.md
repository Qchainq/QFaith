# Auditoría de Fase 3

Revisión de los 25 criterios de la **definición final del proyecto**
([Documento 14](master-prompt/14-ejecucion-pruebas-publicacion.md)), contra lo
que hay en el repositorio, no contra lo que se recuerda haber hecho.

El veredicto de cada criterio es uno de tres:

| | |
| --- | --- |
| **Cumplido** | Está hecho y hay algo que lo comprueba solo |
| **Parcial** | Está hecho lo que se puede hacer sin dispositivo, credenciales o decisión humana; falta lo demás, y se dice cuál |
| **Pendiente** | No está, y se dice de quién depende |

Ninguno se marca cumplido por existir el código: se marca cumplido cuando hay
una prueba que falla si deja de cumplirse. Es la diferencia entre una lista de
tareas y una auditoría.

---

## 1. Todos los módulos del MVP implementados — **Cumplido**

Los diecisiete módulos de `src/modules/`, cada uno con repositorio, casos de
uso, hooks, pantallas y pruebas.

Tres barridos montan las quince pantallas que una persona puede abrir y
comprueban, respectivamente, que todas se pintan con su cabecera y sin dejar a
la vista una clave de traducción (`pantallasModulos`), que todo lo pulsable
tiene nombre, papel y área táctil suficiente (`accesibilidadPantallas`), y que
ninguna estira el texto en una tableta (`responsivoPantallas`).

Los cuatro estados —cargando, vacío, error y sin conexión— se comprueban en
las pruebas de cada módulo, no en un barrido común: dependen de qué pide cada
pantalla y un barrido genérico no podría provocarlos de verdad.

## 2. Sin funciones simuladas visibles — **Cumplido**

Cero `TODO`, `FIXME`, `@ts-ignore` y `any` fuera de las pruebas. Lo comprueba
el linter en cada Pull Request, no una búsqueda a mano.

Los dos puertos sin proveedor —pagos y analítica— **no son simulaciones**:
son interfaces con un adaptador vacío que nunca concede acceso ni envía nada.
La diferencia importa. Un doble que devolviera un recibo falso abriría el
contenido de pago a todo el mundo mientras durara el andamio; estos devuelven
«no hay nada» y la pantalla lo dice.

## 3. Sin errores críticos — **Cumplido, con la salvedad de lo que no se ha probado en dispositivo**

1261 pruebas en 87 archivos, todas en verde. Cobertura global 94,5 % de
líneas, por encima del 80 % que pide el documento, y por encima del 90 % en
dominio, seguridad, cifrado y sincronización.

Lo que no puede afirmarse desde aquí: que no haya errores críticos **en un
teléfono**. Nada de esto ha corrido en un iPhone ni en un Android reales.

## 4. Sin vulnerabilidades críticas conocidas — **Cumplido**

`npm audit --audit-level=high` en cada Pull Request, escaneo de secretos sobre
el historial, y ocho baterías de RLS sobre un PostgreSQL de verdad.

## 5. La información privada se cifra antes de salir del dispositivo — **Cumplido**

XChaCha20-Poly1305 con clave de contenido por dominio, envueltas con una clave
derivada de la maestra por HKDF. El vínculo `{usuario, tipo, entidad, clave,
versión}` viaja como datos autenticados: un criptograma movido a otra fila no
abre.

Cada repositorio tiene una prueba que serializa el registro guardado y busca
dentro el texto en claro. No comprueba que se llamó a cifrar: comprueba que el
texto **no está**.

## 6. La empresa no puede descifrar el contenido privado — **Cumplido**

Verificado por los dos lados. Contra un PostgreSQL local, ocho baterías de
políticas RLS. Contra el proyecto real, `npm run supabase:verificar`: **127
comprobaciones**, y 208 cuando se le da la clave secreta y puede crear dos
cuentas y comprobar el aislamiento entre ellas con sesiones y JWT de verdad.

La clave maestra nunca sale del dispositivo. El servidor solo ve
`encrypted_payload`.

## 7. La sincronización funciona entre dispositivos — **Cumplido**

Motor offline-first con cola de cambios, concurrencia optimista por `version`
y resolución de conflictos que nunca sobrescribe en silencio.

## 8. La restauración ha sido probada — **Cumplido**

Frase de recuperación con Argon2id. Hay prueba del recorrido completo:
dispositivo nuevo, frase, y el contenido vuelve a abrirse.

**Cuidado con el coste**: Argon2id tarda del orden de segundos en un portátil
y hay que contar con decenas en un teléfono modesto. La pantalla de
recuperación tiene que mostrar progreso. Está anotado en
`servicioCriptografia.ts` y sigue sin comprobarse en dispositivo.

## 9. El uso offline es estable — **Cumplido**

Toda escritura va primero a la base local; nada espera a la red. Hay pruebas
de casos límite del motor: sin conexión, con conexión intermitente y con
conflicto.

## 10. Las políticas RLS están verificadas — **Cumplido**

Diecinueve migraciones, todas las tablas personales con RLS y `force`.
Verificado contra motores reales, no leyendo el SQL.

## 11. La IA respeta todos los límites — **Cumplido en lo automatizable**

Batería de evaluación con el conjunto fijo de preguntas que pide el Documento
6: frases prohibidas, profecías, hablar en nombre de Dios, diversidad
doctrinal, alucinaciones, inyección de prompts y lenguaje culpabilizador.

**Falta** volver a ejecutarla contra el proveedor real cuando se elija modelo.
Hoy corre contra el filtro y el prompt, que es lo que existe.

## 12. El modo crisis está validado — **Cumplido en lo automatizable**

Detección, respuesta con derivación a ayuda humana, y la regla que más
importa: **nunca afirmar que hay supervisión humana si no la hay**.

**Falta** revisión humana con criterio clínico. No es algo que una prueba
pueda dar por bueno.

## 13. Las notificaciones protegen la privacidad — **Cumplido**

Nada de contenido espiritual en pantalla bloqueada, horario de silencio,
límites de frecuencia y tono sin culpa. Con pruebas.

## 14. La interfaz es coherente — **Cumplido**

Todo estilo pasa por el Design System; ningún componente define colores ni
tamaños por su cuenta. La adaptación al tamaño de pantalla vive en un solo
sitio, `dimensiones.ts`, y la aplica `PantallaBase`, por donde pasan las
quince pantallas.

## 15. La accesibilidad ha sido probada — **Parcial**

Hecho: barrido de las quince pantallas comprobando nombre, papel y área táctil
de todo lo pulsable, con guarda de no-vacuidad para que el día que el detector
deje de reconocer los botones se note. Y auditoría de contraste WCAG 2.1 AA
sobre la paleta, que **encontró tres colores que no cumplían** y se
corrigieron.

**Falta** lo que el documento pide expresamente: *«Probar con herramientas
reales de iOS y Android.»* VoiceOver y TalkBack no se pueden simular.

## 16. El rendimiento cumple los objetivos — **Parcial**

Hecho: `npm run medir` mide contra los presupuestos del documento. Encontró
dos rutas fuera de presupuesto, las dos con el mismo defecto —el coste crecía
con todo lo que la persona hubiera escrito en su vida, no con lo que cabe en
la pantalla— y las dos corregidas:

| | antes | ahora |
| --- | --- | --- |
| abrir un capítulo con 3000 subrayados | 374 ms | 1,1 ms |
| abrir el Diario con 3000 entradas | 961 ms | 13 ms |

**Falta** medir en dispositivo. Los presupuestos del documento —inicio frío
< 2,5 s, 60 FPS— son de teléfono, y un servidor no lo es. Lo que sí viaja al
teléfono es la forma del crecimiento, y esa está fijada por pruebas.

## 17. La política de privacidad está disponible — **Pendiente**

No existe. **Depende de una decisión humana**: el Documento 14 exige revisión
legal profesional antes del lanzamiento comercial, y redactar una política de
privacidad de una aplicación que trata datos religiosos —categoría especial en
el RGPD— no es trabajo que deba hacerse sin abogado.

Lo que sí puede prepararse cuando se pida: el inventario técnico de qué datos
se tratan, dónde, cifrados con qué y durante cuánto. Esa parte está toda en el
repositorio.

## 18. Los términos están disponibles — **Pendiente**

Igual que el 17.

## 19. Las licencias bíblicas están verificadas — **Parcial**

Hecho: el esquema no admite una traducción sin licencia declarada
(`license_type` con lista cerrada y restricción), y guarda titular,
territorios, límites de visualización, permiso offline y de audio. La IA tiene
prohibido reproducir fragmentos largos de traducciones protegidas.

**Falta** la verificación en sí, que es firmar acuerdos con los titulares.
Depende de decisión y presupuesto.

## 20. Las suscripciones funcionan — **Parcial**

Hecho: tabla `subscriptions` con la regla que lo sostiene todo —**el cliente
nunca escribe su suscripción**, ni siquiera la suya: hay política de lectura,
no la hay de escritura, y además se le revoca el privilegio—. Periodo de
gracia, cancelación con el periodo pagado hasta el final, y nunca datos de
tarjeta. La capa de cliente lee estado y no lo decide.

**Falta**, y **depende de ti**: elegir proveedor de pagos (StoreKit y Play
Billing directos, o un intermediario) y escribir la Edge Function que valida
el recibo contra la tienda y escribe la fila. `PuertoPagos` existe con
adaptador vacío, así que no bloquea nada más.

## 21. La eliminación de cuenta funciona — **Cumplido**

Con periodo de gracia y opción de cancelar mientras dure. La pantalla dice la
verdad incómoda antes de que la persona decida: **no podemos leer su
contenido, así que tampoco podemos devolvérselo**. Es el precio real del
cifrado de extremo a extremo, y ocultarlo ahí sería mentir donde más importa.

Exportar no requiere suscripción ni cuenta activa, como pide el documento.

## 22. Supera las pruebas internas — **Parcial**

Hecho: 1261 pruebas automatizadas y mutación aplicada a cada decisión de
seguridad y privacidad —unas 200 mutaciones a lo largo del proyecto, cada
superviviente investigado—.

**Falta** prueba interna con personas usando la aplicación en teléfonos.

## 23. La beta no tiene bloqueos graves — **Pendiente**

No ha habido beta. TestFlight y pruebas internas de Google Play requieren
cuentas de desarrollador. **Depende de ti.**

## 24. App Store y Google Play preparados — **Pendiente**

Requiere cuentas, certificados, iconos, capturas, fichas y declaraciones de
datos. **Depende de ti.**

Lo que sí está: eliminación de cuenta en la aplicación (obligatoria en las dos
tiendas), permisos solo cuando hacen falta, y nada de contactos, ubicación
precisa ni seguimiento publicitario.

## 25. La documentación técnica está actualizada — **Cumplido**

Los quince documentos de `docs/master-prompt/` son la especificación; el
`README.md` explica cómo montar, dónde van las claves y qué comprueba cada
comando; y cada decisión no evidente está razonada en el archivo donde vive,
no en un documento aparte que se desactualiza.

---

## Resumen

| Veredicto | Criterios |
| --- | --- |
| **Cumplido** | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 25 — **16** |
| **Parcial** | 15, 16, 19, 20, 22 — **5** |
| **Pendiente** | 17, 18, 23, 24 — **4** |

Ninguno de los nueve incompletos está bloqueado por trabajo de programación.
Se agrupan en tres:

1. **Requieren un dispositivo** (15, 16, 22 en parte): VoiceOver, TalkBack,
   inicio frío, FPS, y personas usando la aplicación.
2. **Requieren una decisión o un gasto tuyos** (19, 20, 23, 24): licencias
   bíblicas, proveedor de pagos, cuentas de desarrollador.
3. **Requieren un abogado** (17, 18): la aplicación trata datos religiosos,
   categoría especial del RGPD.

## Lo que además falta y no está en los 25

- **CI no compila la aplicación.** El Documento 14 pide *Build Android* y
  *Validación iOS*; la tubería hace las otras ocho comprobaciones y no estas
  dos. Necesitan credenciales de firma.
- **La base local no está cifrada por completo.** El Documento 7 lo pide y
  `expo-sqlite` no trae SQLCipher, así que hoy los metadatos —fechas, estados,
  tipo de entrada— son legibles para quien tenga acceso al sistema de archivos
  de un dispositivo comprometido. Es el mismo conjunto que ya ve el servidor,
  de modo que no amplía lo que se sabe de la persona, pero cerrarlo requiere un
  módulo nativo. Está anotado en `almacenSqlite.ts`.
- **Rotar la clave secreta de Supabase** que pasó por la conversación de
  desarrollo. Salta RLS por completo.
