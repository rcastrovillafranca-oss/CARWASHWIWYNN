# Detallados Barraza × Wiwynn

Landing page para que los colaboradores de Wiwynn escaneen un QR y registren
el lavado de su carro. El equipo de Barraza los contacta por teléfono cuando
el auto queda listo.

Sitio estático (HTML/CSS/JS puro, sin build), pensado para **Netlify** +
**Supabase**.

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratis.
2. **New project** → dale un nombre (ej. `detallados-barraza`) y una
   contraseña de base de datos (guárdala, no la necesitas para este sitio).
3. Cuando el proyecto termine de crearse, ve a **SQL Editor → New query**,
   pega el contenido de `supabase/schema.sql` y dale **Run**. Esto crea la
   tabla `registros` con los permisos correctos.
4. Ve a **Project Settings → API**. Copia:
   - **Project URL**
   - **anon public key**

## 2. Conectar el sitio a Supabase

Abre `config.js` y reemplaza los dos valores:

```js
const SUPABASE_URL = "https://tu-proyecto.supabase.co";
const SUPABASE_ANON_KEY = "tu-anon-key";
```

La `anon key` es pública por diseño (así funciona Supabase con Row Level
Security) — es segura para dejarla en el frontend.

Mientras `config.js` tenga los valores de ejemplo, el formulario funciona en
"modo demo" (no guarda nada, solo lo muestra en consola), así puedes probar
el diseño sin tener Supabase listo todavía.

## 3. Crear el usuario admin (para /admin)

El panel de administración (`/admin`) es donde tu equipo ve la fila de
autos y marca cuáles ya están listos. Se protege con Supabase Auth — no hay
registro público, solo tú das de alta a quien deba entrar:

1. En Supabase: **Authentication → Users → Add user**.
2. Pon el correo y contraseña de la persona (puede ser tu correo, o uno para
   todo el equipo). Marca **Auto Confirm User** para que no tenga que
   verificar el correo.
3. Repite por cada persona del equipo que necesite entrar al panel.

Eso es todo — no hay que tocar código. Ese correo/contraseña es lo que se
usa para entrar en `/admin`.

## 4. Operar el día a día

Entra a `tu-sitio.netlify.app/admin` e inicia sesión con el usuario que
creaste en el paso 3. Ahí tu equipo ve:

- **En cola** — quién sigue, en orden (el primero es el siguiente auto),
  con botones para pasar de "Iniciar" → "Marcar listo".
- **Listos hoy** — los autos ya entregados hoy.
- **Todos** — historial completo.
- Un resumen arriba con cuántos autos están en espera, en proceso, cuántos
  se atendieron hoy y cuánto se ha facturado hoy.

Cada tarjeta trae el teléfono como link (toca para llamar) y hace cuánto se
registró. Todo se actualiza solo en tiempo real para todo el equipo
(gracias a Supabase Realtime) — no hace falta refrescar la página.

La página pública (`/`) solo muestra 3 datos agregados, sin nombres ni
teléfonos (por seguridad, ver nota abajo):

- **En espera ahora**, **Atendidos hoy**, **Espera estimada** (autos en
  espera × ~25 min cada uno — ajustable, ver el final de este README).

> **Nota de seguridad:** la key pública (`config.js`) vive en el navegador
> de cualquiera que visite el sitio, así que la tabla `registros` **no**
> tiene una política que permita leerla completa con esa key — solo
> permite insertar registros nuevos. Los 3 números de la página pública
> salen de un view (`registros_stats`) que solo expone conteos, nunca
> nombres/teléfonos. El panel `/admin` sí ve todo, pero solo porque entra
> con una sesión de Supabase Auth (usuario/contraseña), no con la key
> pública. Todo esto ya está armado en `supabase/schema.sql`.

## 5. Subir el código a GitHub

```
git init
git add .
git commit -m "Detallados Barraza x Wiwynn"
git branch -M main
git remote add origin https://github.com/rcastrovillafranca-oss/CARWASHWIWYNN.git
git push -u origin main
```

El `.gitignore` ya excluye `.env`, así que las credenciales nunca se suben.
Si usas un Personal Access Token de GitHub para autenticarte por HTTPS, se
pide como "contraseña" cuando `git push` te pregunte credenciales (el
usuario de Windows guarda esto en el Administrador de credenciales para no
volver a pedirlo).

## 6. Publicar en Netlify

1. En Netlify: **Add new site → Import an existing project**, conecta el
   repo de GitHub del paso 5 (o arrastra la carpeta completa a
   [app.netlify.com/drop](https://app.netlify.com/drop) para un deploy
   rápido sin git). No necesita build command ni carpeta especial
   (`netlify.toml` ya lo configura).
2. Netlify te da una URL tipo `https://detallados-barraza.netlify.app`. Puedes
   cambiar el nombre en **Site settings → Change site name**, o conectar un
   dominio propio.

## 7. Generar el QR

Genera un QR apuntando a tu URL de Netlify (por ejemplo con
[qr-code-generator.com](https://www.qr-code-generator.com) o el generador de
Google), imprímelo y colócalo en el estacionamiento de Wiwynn.

## Estructura del proyecto

```
index.html                       Página pública (donde llega el QR)
admin.html                       Panel de equipo (/admin) — login + cola en vivo
styles.css                       Diseño compartido (colores, botones, animaciones)
admin.css                        Estilos propios del panel de admin
app.js                           Lógica de index.html (formulario + estadísticas públicas)
admin.js                         Lógica de admin.html (login, cola, cambios de estado)
config.js                        Credenciales de Supabase (edítalo, ver paso 2)
.env.example                     Qué variables existen y para qué sirve cada una
supabase/schema.sql              Tabla, vista de estadísticas públicas y permisos (RLS)
netlify.toml                     Deploy + redirect /admin → /admin.html
assets/                          Logos (ya con fondo transparente)
scripts/quitar_fondo_logo.py     Utilidad para quitarle el fondo blanco a un logo nuevo
```

Si más adelante cambian el logo, usa el script para quitarle el fondo blanco
y recortarlo automáticamente:

```
python scripts/quitar_fondo_logo.py assets/logo-nuevo.jpg assets/logo-nuevo.png
```

(Requiere Python con `Pillow` y `numpy`: `pip install pillow numpy`.)

## Personalizar precios o servicios incluidos

Los precios y el checklist de servicios (Lavado exterior, Aspirado, Armor
All, Aroma) están tanto en las tarjetas de precio como en los botones del
formulario dentro de `index.html`. Si cambian, actualiza:

- Las dos `<article class="price-card">` en la sección `#precios`.
- Los dos `<button class="toggle">` dentro de `#toggle-tipo`.

El tiempo promedio por vehículo usado para calcular "Espera estimada" es una
constante `MINUTES_PER_VEHICLE = 25` al inicio de `app.js` — ajústala si tu
equipo tarda más o menos en promedio.
