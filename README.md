# Ruta Óptima

Herramienta de despacho para repartos: mantienes una **base de clientes** (razón social, dirección
con coordenadas, teléfonos, referencias del local), armas la **ruta del día** eligiendo clientes e
ingresando la **G/R** y los **bultos** de cada entrega, obtienes el **orden de visita más rápido con
tráfico en tiempo real**, y copias con un clic el **resumen para el chofer** en texto plano.

Usa las APIs de **TomTom** (gratuitas para este volumen, sin tarjeta) y funciona en escritorio y
celular.

## Flujo de trabajo

1. **Clientes** (pestaña Clientes): registra cada cliente una sola vez.
   - Razón social, dirección principal (búscala, pega coordenadas o un enlace de Google Maps, o
     elígela en el mapa), teléfono de contacto y referencias del local (fachada, portón, letreros).
   - Opcional: dirección secundaria (otra sede o almacén) y teléfono adicional.
   - Exporta / importa la lista en JSON como respaldo o para pasarla a otro equipo.
2. **Ruta** (pestaña Ruta): busca clientes y pulsa **Agregar**; indica qué dirección usar (si tiene
   dos), la **G/R** (guía de remisión) y los **bultos**. También puedes agregar puntos sueltos con el
   buscador, pegando coordenadas o tocando el mapa. El primer punto suelto es el **origen** (almacén);
   también sirve **Mi ubicación**.
3. **Optimizar ruta**: TomTom ordena las entregas (Punto 1, 2, 3…) minimizando el tiempo con tráfico.
   Cada tramo se puede tocar para verlo resaltado en el mapa.
4. **Resumen para el chofer**: bloque de texto monoespaciado listo para copiar (opcionalmente
   envuelto en ``` para que WhatsApp lo muestre en monoespaciado), con este formato por parada:

   ```
   Punto 1: Ferretería El Tornillo SAC
   Contacto: 987 654 321 / 01 445 6677
   Dirección: Av. La Marina 2040, San Miguel
   Referencia: Frente a Plaza San Miguel, portón azul con letrero rojo
   G/R: T001-000451
   Bultos: 5

   ---
   ```

   Si una parada no tiene dirección escrita se usan sus coordenadas; los datos que falten salen
   como "-".

## Otras funciones

- **Ruta de ejemplo**: el enlace **Ejemplo** carga un reparto ficticio por Lima con G/R y bultos y
  lo optimiza, para ver el resultado y el resumen sin cargar nada.
- **Criterios de orden**: *Tiempo con tráfico* (matriz de tiempos de TomTom + orden resuelto en la
  app, exacto hasta 13 paradas) o *Distancia* (una sola llamada con `computeBestOrder`).
- **Fin de la ruta**: volver al origen, terminar en una parada marcada con ⚑, o donde sea mejor.
- **Hora de salida** opcional para planificar con el tráfico previsto.
- **Capa de tráfico** en vivo y **Navegar con Google Maps** con el orden optimizado (solo una URL,
  no requiere clave de Google).
- **Compartir enlace**: la URL lleva las paradas con sus datos de orden, para pasar la ruta de la PC
  al celular del chofer.
- Todo se guarda en el dispositivo (localStorage). No hay servidor propio ni cuentas.

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

## Publicar

```bash
npm run build            # genera dist/
```

`dist/` es estático; puede servirse desde cualquier hosting definiendo `VITE_TOMTOM_API_KEY` al
compilar. Recuerda que la clave queda visible en el navegador: si el sitio es público, usa una clave
con **Domain whitelist** en el dashboard de TomTom. Si el sitio no vive en la raíz del dominio, define
`VITE_BASE_PATH=/subcarpeta/` al compilar.

## Estructura

```
src/
  App.tsx                 Composición general y lógica de la pantalla
  components/
    MapView.tsx           Mapa Leaflet con tiles TomTom, pines, ruta y capa de tráfico
    SearchBox.tsx         Buscador con autocompletado (TomTom Search)
    CoordInput.tsx        Pegar coordenadas / enlaces
    StopList.tsx          Paradas de la ruta con G/R y bultos
    CustomerForm.tsx      Alta/edición de clientes (direcciones con búsqueda o mapa)
    CustomerList.tsx      Búsqueda de clientes y "Agregar a la ruta"
    RouteSummary.tsx      Resultado: totales, tramos, resumen para el chofer, navegación
    SetupScreen.tsx       Instrucciones cuando falta la clave
  hooks/
    usePlanner.ts         Estado de la ruta (reducer) + persistencia
    useCustomers.ts       Base de clientes (localStorage)
    useGeocoder.ts        Coordenadas → dirección legible
  lib/
    customers.ts          Modelo de clientes: validación, búsqueda, exportar/importar
    clipboard.ts          Generador del resumen para el chofer (formato obligatorio)
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
