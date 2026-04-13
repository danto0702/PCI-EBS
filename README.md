# PCI App – ESE Hospital Regional Noroccidental
## Planes de Cuidado Individual por Ciclo Vital (Resolución 3280/2018)

---

## 📁 Estructura de archivos

```
pci-app/
├── index.html          ← UI principal (Tailwind CSS)
├── app.js              ← Lógica: formulario, offline, sync
├── service-worker.js   ← Cache offline (PWA)
├── manifest.json       ← Configuración PWA instalable
├── Code.gs             ← Google Apps Script (backend GSheets)
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png     ← Principal (Android / PWA)
    ├── icon-384.png
    └── icon-512.png     ← Alta resolución
```

---

## 🚀 Pasos para publicar

### 1. Íconos PWA
Crea o reemplaza los archivos en la carpeta `icons/` con el logo del hospital.
Tamaños requeridos: 72, 96, 128, 144, 152, 192, 384 y 512 px (PNG cuadrado).

Herramientas gratuitas para generarlos:
- https://realfavicongenerator.net
- https://maskable.app/editor

### 2. Google Apps Script (backend)
1. Abre el Google Sheet donde quieres guardar los datos.
2. Ve a **Extensiones → Apps Script**.
3. Copia y pega el contenido de `Code.gs`, luego guarda.
4. Clic en **Implementar → Nueva implementación**:
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo** (tu cuenta de Google)
   - Acceso: **Cualquier persona**
5. Copia la **URL de implementación** (termina en `/exec`).

### 3. Conectar la app al backend
Abre `app.js` y reemplaza la línea:
```js
const GAS_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID_AQUI/exec';
```
con la URL copiada en el paso anterior.

### 4. Publicar la app (opciones)
**Opción A – GitHub Pages (gratuito):**
1. Sube todos los archivos a un repositorio de GitHub.
2. Ve a Settings → Pages → Source: main branch.
3. La app estará en `https://TU_USUARIO.github.io/REPO/`

**Opción B – Firebase Hosting:**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

**Opción C – Carpeta compartida en red interna:**
Copia los archivos a cualquier servidor web (Apache/Nginx) dentro de la red del hospital.

---

## 📱 Instalación como PWA en celulares

### Android (Chrome):
1. Abrir la URL de la app en Chrome.
2. Menú → "Agregar a pantalla de inicio".

### iOS (Safari):
1. Abrir la URL en Safari.
2. Botón compartir → "Añadir a pantalla de inicio".

---

## 🔄 Flujo de datos offline

```
Usuario llena formulario
        ↓
Guardar en localStorage (inmediato)
        ↓
¿Hay conexión? → SÍ → Sincronizar con Google Sheets → Limpiar local
                  NO → Queda pendiente
                        ↓
              Al recuperar conexión → Auto-sync
```

---

## 📊 Ciclos Vitales cubiertos

| Ciclo | Rango | Código Anexo |
|-------|-------|-------------|
| Primera Infancia | 1 mes – 5 años | Anexo 23 |
| Infancia | 6 – 11 años | Anexo 24 |
| Adolescencia | 12 – 17 años | Anexo 25 |
| Juventud | 18 – 28 años | Anexo 26 |
| Adultez | 29 – 59 años | Anexo 27 |
| Vejez | 60+ años | Anexo 28 |
| Ruta Materno Perinatal | — | Anexo 29 |

---

## ⚙️ Personalización

### Agregar EPS:
En `index.html`, edita el `<select id="eps">`.

### Cambiar el endpoint GAS:
En `app.js`, variable `GAS_URL`.

### Actualizar versión del caché:
En `service-worker.js`, variable `CACHE_NAME` → cambiar `v1.0.0` a `v1.0.1` para forzar actualización.

---

## 🏥 Créditos
ESE Hospital Regional Noroccidental  
Ábrego – Convención – El Carmen – Teorama  
NIT: 807.008.842-9  
Resolución 3280 de 2018 | Versión 4.0 – Enero 2024
