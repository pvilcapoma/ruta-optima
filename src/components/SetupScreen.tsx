/** Pantalla que aparece cuando falta la clave de TomTom en el .env */
export function SetupScreen() {
  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Ruta Óptima</h1>
        <p>
          Falta la clave de <b>TomTom</b>. Es gratis y no pide tarjeta; toma unos cinco minutos:
        </p>
        <ol>
          <li>
            Entra a{' '}
            <a href="https://developer.tomtom.com/user/register" target="_blank" rel="noreferrer">
              developer.tomtom.com
            </a>{' '}
            y crea una cuenta con tu correo.
          </li>
          <li>
            En <b>My Dashboard → Keys</b> copia la clave que viene creada (<i>My first API key</i>). Debe tener
            habilitados <b>Map Display</b>, <b>Routing</b>, <b>Search</b> y <b>Traffic</b>; la clave por defecto ya los
            incluye.
          </li>
          <li>
            Abre el archivo <code>.env</code> del proyecto y pega la clave en <code>VITE_TOMTOM_API_KEY</code>.
          </li>
          <li>
            Guarda el archivo. El servidor de desarrollo detecta el cambio y esta página se recarga sola.
          </li>
        </ol>
        <p className="hint">
          Cuota gratuita mensual aproximada: 20 000 rutas, 2 500 matrices de tiempos, 20 000 geocodificaciones y
          200 000 tiles de mapa. Más que suficiente para uso personal.
        </p>
      </div>
    </div>
  );
}
