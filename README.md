# Ruta Óptima

Web/app para planificar entregas: agregas paradas (buscando una dirección, pegando coordenadas o
enlaces de Google Maps, o tocando el mapa) y obtienes el **orden de visita más rápido considerando el
tráfico en tiempo real**. Al final abres la ruta en Google Maps para navegar.

Usa las APIs de **TomTom**, que son gratuitas para este volumen y **no piden tarjeta**. Funciona en
escritorio y celular (se puede "Agregar a la pantalla de inicio").

## Qué hace

- **Agregar paradas** de tres formas:
  - Buscador de direcciones y negocios (TomTom Search).
  - Pegar coordenadas `lat, lng` o enlaces de Google Maps, uno por línea. Sirve para las
    ubicaciones que llegan por WhatsApp (`https://maps.google.com/?q=-12.09,-77.03`).
    Opcionalmente añade un nombre: `-12.0464, -77.0428 | Cliente Pérez`.
  - Tocar el mapa para poner un pin. Los pines se pueden arrastrar.
- **Origen**: el primer punto que agregas, o el botón **Mi ubicación** (GPS).
- **Ruta de ejemplo**: el botón **Ejemplo** carga un reparto por Lima (origen en Gamarra y 7 paradas)
  y lo optimiza al instante, para ver cómo queda una ruta sin cargar nada.
- **Optimizar ruta** con dos criterios:
  - **Tiempo con tráfico** (por defecto): pide a TomTom la matriz de tiempos de viaje con tráfico
    en vivo entre todas las paradas y la app resuelve el orden óptimo (exacto hasta 13 paradas,
    heurístico después). Luego pide la ruta final con ese orden.
  - **Distancia**: una sola llamada con `computeBestOrder`; TomTom reordena por distancia y los
    tiempos igual consideran tráfico.
- **Fin de la ruta**: volver al origen, terminar en una parada marcada con ⚑, o dejar que la app
  elija la mejor parada final.
- **Tramos**: al tocar un tramo del resumen se resalta en el mapa y la cámara lo encuadra.
- **Hora de salida** opcional, para planificar con el tráfico previsto a esa hora.
- **Capa de tráfico** en vivo sobre el mapa.
- **Navegar con Google Maps**: enlace con el orden optimizado (se divide en tramos si hay más de 9
  paradas, límite de Google Maps). Es solo una URL, no necesita clave de Google.
- **Copiar orden** (texto para WhatsApp) y **Compartir enlace** (la URL lleva las paradas codificadas,
  así puedes armar la ruta en la PC y abrirla en el celular).
- Todo se guarda en el dispositivo (localStorage).

## Requisitos

- Node 20+.
- Una clave de TomTom: regístrate en <https://developer.tomtom.com> (correo, sin tarjeta) y copia la
  clave de **My Dashboard → Keys**. La clave por defecto ya incluye Map Display, Routing, Search y
  Traffic.

## Configuración

```bash
npm install
cp .env.example .env     # pega tu clave en VITE_TOMTOM_API_KEY
npm run dev              # http://localhost:5173  (también accesible desde el celular en la misma red)
```

Variables en `.env`:

| Variable | Descripción |
| --- | --- |
| `VITE_TOMTOM_API_KEY` | Clave de TomTom. |
| `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LNG` | Centro inicial del mapa (por defecto Lima). |
| `VITE_REGION_CODES` | Países para el buscador, separados por coma (`pe`). Vacío = sin restricción. |

## Cuota gratuita y consumo

Cuota mensual gratuita de TomTom (a la fecha): 20 000 llamadas de Routing, 2 500 de Matrix Routing,
20 000 de geocodificación, 10 000 de búsqueda y 200 000 tiles de mapa.

Consumo por optimización:

| Modo | Llamadas |
| --- | --- |
| Distancia | 1 de Routing |
| Tiempo con tráfico, hasta 9 paradas | 1 de Matrix + 1 de Routing |
| Tiempo con tráfico, 10 a 25 paradas | 2 a 9 de Matrix + 1 de Routing |

Si la cuota de Matrix se agota, la app avisa y cae automáticamente al modo Distancia.
Precios actuales: <https://docs.tomtom.com/pricing>.

## Publicar en GitHub Pages

El repo incluye un workflow (`.github/workflows/deploy.yml`) que compila y publica en GitHub Pages
en cada push a `main`. Para que la app publicada funcione:

1. En TomTom crea una **segunda clave** solo para producción y, en su configuración, activa
   **Domain whitelist** con el dominio del sitio (`<usuario>.github.io`). Así nadie puede usar tu
   clave desde otro sitio aunque la vea en el código.
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nombre
   `VITE_TOMTOM_API_KEY`, valor la clave de producción.
3. En **Settings → Pages**, la fuente debe ser **GitHub Actions**.

Sin el secreto, el sitio publicado muestra la pantalla de configuración. La clave de desarrollo del
`.env` nunca se sube: está en `.gitignore`.

Para otro hosting (Vercel, Netlify, Cloudflare Pages) basta con `npm run build` y servir `dist/`,
definiendo `VITE_TOMTOM_API_KEY` en el panel del proveedor. Si el sitio no vive en `/<repo>/`,
define `VITE_BASE_PATH=/` al compilar.

## Estructura

```
src/
  App.tsx                 Composición general y lógica de la pantalla
  components/
    MapView.tsx           Mapa Leaflet con tiles TomTom, pines, ruta y capa de tráfico
    SearchBox.tsx         Buscador con autocompletado (TomTom Search)
    CoordInput.tsx        Pegar coordenadas / enlaces
    StopList.tsx          Lista de paradas y acciones
    RouteSummary.tsx      Resultado: totales, tramos, enlaces de navegación
    SetupScreen.tsx       Instrucciones cuando falta la clave
  hooks/
    usePlanner.ts         Estado (reducer) + persistencia
    useGeocoder.ts        Coordenadas → dirección legible
  lib/
    tomtom.ts             Cliente HTTP: Calculate Route, Matrix Routing, Search, tiles
    routes.ts             Orquestación de la optimización
    tsp.ts                Orden de paradas: Held-Karp exacto + búsqueda local
    parseCoords.ts        Lectura de coordenadas y enlaces de Google Maps
    mapsLinks.ts          Enlaces de navegación a Google Maps
    storage.ts            localStorage y enlace compartible
```

## Limitaciones

- Máximo 25 paradas por ruta.
- Los enlaces cortos `maps.app.goo.gl` no se pueden resolver desde el navegador; ábrelos y copia el
  enlace largo o las coordenadas.
- La clave queda visible en el navegador. TomTom permite limitar cada clave por producto desde el
  dashboard; si publicas la app, crea una clave solo para ella.
