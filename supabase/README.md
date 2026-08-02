# Esquema de Supabase

Diez tablas, RLS forzado en todas y ningún privilegio para el rol anónimo. La
regla base es única: cada usuario alcanza solo las filas cuyo `user_id`
coincide con `auth.uid()`. **No existe ninguna política que permita a líderes,
pastores, mentores ni administradores leer contenido privado, y no debe
añadirse ninguna.**

## Archivos

| Ruta | Para qué |
| --- | --- |
| `migrations/000*.sql` | Fuente. Se aplican en orden. |
| `fase-1-completo.sql` | Generado. Los cuatro archivos concatenados, para pegar en el editor SQL de Supabase. Regenerar con `npm run sql:combinar`. |
| `tests/00_sustituto_auth.sql` | Sustituto local del esquema `auth`. Solo para PostgreSQL local: **nunca se aplica a un proyecto real.** |
| `tests/0[1-9]_*.sql` | Baterías de aislamiento. |
| `tests/ejecutar-pruebas.sh` | Recrea una base limpia, aplica las migraciones y corre las baterías. |

## Aplicar el esquema

En el editor SQL del proyecto, pegar `fase-1-completo.sql` y ejecutarlo **una
sola vez**: los `create type` no llevan `if not exists`, así que una segunda
ejecución falla por tipo duplicado.

## Probar en local

```sh
PGURL=postgres://postgres@localhost:5432/qfaith_test ./supabase/tests/ejecutar-pruebas.sh
```

La base indicada se recrea entera. Nunca apuntarlo a un entorno con datos
reales.

El sustituto de `auth.uid()` reproduce **las dos ramas** de la implementación
de Supabase: el «sub» suelto en `request.jwt.claim.sub` y el JSON completo en
`request.jwt.claims`. Las versiones actuales de PostgREST usan la segunda, así
que una prueba que solo cubriera la primera estaría validando un camino
distinto al de producción.

## Verificar contra el proyecto real

Las pruebas locales no confirman que `auth.uid()` se comporte igual con JWT
emitidos por Supabase. Eso lo hace:

```sh
EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
  npm run supabase:verificar
```

Corre en dos fases:

- **Anónima** — siempre. Comprueba que las diez tablas existen y que el rol
  anónimo no puede leer ni escribir en ninguna. No necesita cuentas.
- **Autenticada** — solo si hay dos cuentas de prueba. Comprueba el
  aislamiento real entre dos usuarios, el sellado de revisiones por el
  trigger, que la bitácora no contiene criptogramas, que el borrado físico
  está prohibido y que los parámetros de Argon2id no se pueden rebajar.

Antes de mirar lo que ve el usuario B, el script siembra contenido de A en
cada tabla y comprueba que A sí lo ve. Sin eso, «B ve cero filas» en una tabla
vacía pasaría igual con RLS desactivado y la comprobación no valdría nada.

Para la segunda fase, o bien dos cuentas ya creadas:

```sh
QFAITH_USUARIO_A=correo:clave QFAITH_USUARIO_B=correo:clave
```

o bien la clave secreta, y el script las crea y confirma por sí mismo:

```sh
QFAITH_SUPABASE_SECRET=sb_secret_...
```

Las cuentas deben ser desechables. Nunca credenciales de una persona real
(invariante 15). La clave secreta se pasa por línea de órdenes en el momento;
no se guarda en `.env` ni en el repositorio.

Detrás de un proxy corporativo hace falta `NODE_USE_ENV_PROXY=1`: el `fetch`
integrado de Node no lee `HTTPS_PROXY` por su cuenta. Si el proxy responde en
lugar del servidor, el script aborta en vez de dar por buenas esas respuestas
—un 403 a todo haría pasar cualquier comprobación del tipo «denegado, luego
correcto».

## Al añadir una tabla

Los roles `anon` y `authenticated` no reciben privilegios sobre objetos
futuros: la migración 0004 revoca los permisos por defecto. Cada tabla nueva
tiene que conceder los suyos de forma explícita, para que olvidarse de RLS no
exponga datos por descuido. El patrón a seguir es el de `journal_entries`.
