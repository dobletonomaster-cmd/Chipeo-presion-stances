# Chipeo Presion V2 — Music Studio

Aplicación web React + Vite para importar audio, ajustar velocidad/tono, aplicar un ecualizador de 10 bandas y exportar el resultado como WAV.

## Requisitos
- Node.js 20 o superior
- npm

## Ejecutar en tu computadora
```bash
npm install
npm run dev
```
Abre la dirección local que indique Vite.

## Generar la versión pública
```bash
npm run build
```
Vite genera la aplicación lista para publicar dentro de `dist/`.

## Publicar gratis en Vercel
1. Sube esta carpeta a un repositorio de GitHub.
2. Entra en https://vercel.com/ e inicia sesión.
3. Selecciona **Add New → Project** y conecta el repositorio.
4. Vercel detectará Vite automáticamente.
5. Pulsa **Deploy**. Vercel generará un enlace público `*.vercel.app`.
6. Comparte ese enlace: cualquier persona podrá abrir la página desde PC o móvil.

También puedes desplegar `dist/` en Netlify o cualquier hosting estático compatible.

## Exportación
La exportación se realiza en el navegador con `OfflineAudioContext`. El WAV descargado incluye el cambio de velocidad/tono y los diez filtros del ecualizador. El audio original no se envía a un servidor.

## Compatibilidad
La decodificación depende de los formatos admitidos por el navegador y el dispositivo. WAV es el formato de exportación para evitar depender de codificadores externos. Para archivos largos, la exportación puede requerir bastante memoria y tiempo.

## Nota
El proyecto no incluye una URL pública ya desplegada. Para publicar el sitio, debes conectarlo a una cuenta de hosting y completar el despliegue. No compartas contraseñas ni claves privadas.
