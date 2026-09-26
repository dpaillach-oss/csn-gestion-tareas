# GESTIÓN DE TAREAS
### CSN Gestión de Activos Inmobiliarios SPA

Aplicación web profesional para la **gestión, control y seguimiento de tareas** de una empresa de administración de edificios y comunidades. Funciona en **computador, notebook, tablet y teléfono**, con **sincronización de datos entre dispositivos** y capacidad de **trabajar sin conexión**.

---

## 1. Qué incluye

| Módulo | Contenido |
|---|---|
| **Dashboard** | 8 indicadores dinámicos, gráficos de tareas por comunidad y por estado, porcentaje de cumplimiento, próximos vencimientos, últimas modificaciones, buscador global y acciones rápidas |
| **Comunidades** | Registro completo (ID, nombre, dirección, número, comuna, ciudad, teléfono, correo, presidente del comité, contacto, observaciones, estado) + **panel individual** por comunidad |
| **Tareas** | Asociadas obligatoriamente a una comunidad: descripción, fechas de creación y vencimiento, prioridad, responsable, estado, avance, fecha de cumplimiento y comentario final |
| **Seguimiento** | Avances cronológicos con porcentaje, descripción, comentario, responsable, **fotografías** y **documentos** |
| **Calendario** | Vista de mes, semana y día con el semáforo de vencimientos |
| **Informes** | Vista previa, **exportación a PDF** (hoja carta, con logotipo) y **exportación a Excel** (.xlsx real, respeta los filtros) |
| **Historial** | Registro de quién modificó cada tarea y cuándo (fecha, hora, usuario, acción, estado anterior, estado nuevo, comentario, dispositivo) |
| **Sincronización** | Computador ↔ Internet ↔ base de datos ↔ celular, con indicadores 🟢 🟡 🔴, funcionamiento sin conexión y control de conflictos |
| **Usuarios** | 3 perfiles (Administrador, Supervisor, Usuario) con permisos diferenciados y contraseñas cifradas |
| **Configuración** | Empresa, logotipo, colores corporativos, umbral del semáforo, sincronización, conflictos, respaldos y bitácora de auditoría |

**Semáforo de vencimientos** (la cantidad de días para «próxima a vencer» es configurable):

| Color | Significado |
|---|---|
| 🟢 Verde | Dentro del plazo |
| 🟡 Amarillo | Próxima a vencer (por defecto, 3 días o menos) |
| 🔴 Rojo | **VENCIDA** — la fecha límite ya pasó y la tarea no está completada |
| ⚪ Gris | Completada, cancelada o sin fecha límite |

Cuando una tarea supera su fecha límite sin completarse, **el sistema la marca automáticamente como VENCIDA** y deja constancia en el historial. Si luego se amplía el plazo, vuelve a su estado anterior.

---

## 2. Requisitos

- Un navegador actualizado (Chrome, Edge, Safari o Firefox).
- Para instalar la aplicación en el teléfono y usar la cámara con normalidad: **HTTPS** o **localhost**.
- Opcional, sólo para sincronizar entre dispositivos: conexión a Internet y una cuenta gratuita de GitHub (nube cifrada) **o** de Supabase (base de datos).

No requiere instalar programas, servidores ni bases de datos locales.

---

## 3. Cómo ponerla en marcha

### Opción A — Abrir directamente (la más rápida)

Abra el archivo **`index.html`** con doble clic. La aplicación funciona por completo: crear, editar, fotografiar, adjuntar, informes y respaldos.

> Limitación: al abrirse como archivo local, el navegador no permite **instalar** la aplicación ni el **modo sin conexión**, y el almacenamiento disponible es menor (el navegador usa localStorage en lugar de IndexedDB). Todo lo demás —crear, editar, fotografiar, adjuntar, informes, respaldos y sincronización— funciona con normalidad. Para el uso real utilice la Opción B o C.

### Opción B — Servidor local (recomendado para probar desde el teléfono)

```bash
cd csn-gestion
node server.js
```

El servidor muestra dos direcciones:

```
En este computador :  http://localhost:8080
Desde el teléfono  :  http://192.168.x.x:8080
```

Abra la segunda dirección en el teléfono **conectado a la misma red WiFi**. Así puede probar el flujo completo (crear la tarea en el computador y verla en el teléfono).

### Opción C — Publicar en Internet (uso real desde cualquier lugar)

Es lo que permite **instalarla en el celular**, usar la cámara directamente y trabajar sin conexión. Se necesita **HTTPS**; la forma más directa es GitHub Pages (gratuito).

**Publicación automática (un comando):**

```bash
cd csn-gestion
gh auth login          # sólo la primera vez: elija GitHub.com → HTTPS → entrar con el navegador
node publicar.js       # crea el repositorio, sube los archivos y habilita GitHub Pages
```

El script `publicar.js` comprueba antes de publicar que no se expongan credenciales, crea el repositorio (por defecto `csn-gestion-tareas`), habilita GitHub Pages, espera a que la dirección responda y verifica que el manifiesto, el service worker y el logotipo estén disponibles. Al final imprime la dirección para el teléfono:

```
https://<su-usuario>.github.io/csn-gestion-tareas/
```

Opciones útiles: `node publicar.js otro-nombre` (otro repositorio), `node publicar.js --privado`, `node publicar.js --simular` (revisa todo sin publicar).

**Publicación manual (sin programas):** cree un repositorio público en GitHub → *Add file → Upload files* → arrastre **el contenido** de la carpeta `csn-gestion` (no la carpeta) → *Commit* → *Settings → Pages* → *Source*: **Deploy from a branch**, rama **main**, carpeta **/(root)** → guarde y espere 1–2 minutos.

También sirve cualquier otro servicio con HTTPS (Netlify, Vercel, Cloudflare Pages) subiendo la misma carpeta.

---

## 4. Instalación como aplicación (PWA)

| Dispositivo | Cómo instalarla |
|---|---|
| **Android (Chrome)** | Menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio* |
| **iPhone / iPad (Safari)** | Botón *Compartir* → *Añadir a pantalla de inicio* |
| **Windows (Chrome/Edge)** | Icono de instalación en la barra de direcciones, o menú ⋮ → *Instalar aplicación* |
| **macOS (Chrome)** | Menú ⋮ → *Instalar aplicación* |

También puede instalarla desde **Configuración → Acerca del sistema → 📲 Instalar aplicación en este dispositivo**.

Una vez instalada: tiene su propio icono, se abre como aplicación (sin barra del navegador), usa la cámara del teléfono y trabaja parcialmente sin conexión.

---

## 5. Credenciales iniciales

| Perfil | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin@csn.cl` | `csn2026` |
| Supervisor | `supervisor@csn.cl` | `supervisor2026` |
| Usuario | `usuario@csn.cl` | `usuario2026` |

**Cambie estas contraseñas** en *Usuarios → 🔑* antes de usarla con información real. Si las olvida, puede restablecerlas desde *Configuración* (con un usuario Administrador) o botón *Usar credenciales de administrador* en la pantalla de ingreso.

Al iniciar por primera vez se cargan **datos de demostración** (ATALAYA, LA ESPUELA, VISTA VERDE II con 10 tareas de ejemplo que cubren todos los estados) para probar cada función. Puede eliminarlos con *Configuración → Borrar todos los datos*.
---

## 6. Sincronización entre computador y celular

La aplicación **no depende del navegador**: los datos se guardan en el dispositivo (IndexedDB) y, al configurar un método de sincronización, se replican en Internet.

```
COMPUTADOR → INTERNET → BASE DE DATOS → CELULAR
CELULAR → INTERNET → BASE DE DATOS → COMPUTADOR
```

### Vincular el celular con un código (la forma más simple)

No es necesario escribir el token, la clave y el identificador en el teléfono: se traspasan con **un solo código**.

1. En el **computador**: *Configuración → Sincronización entre dispositivos* → deje configurado y guardado el método (nube cifrada o base de datos).
2. Pulse **📱 Generar código para el celular**. Aparecerá un código que empieza con `CSNV1-`.
3. **Envíelo al teléfono** con *📋 Copiar código* o *📤 Compartir* (WhatsApp, correo a usted mismo, etc.).
4. En el **celular**: abra la aplicación → ingrese con su usuario → *Configuración → Sincronización* → **🔗 Pegar código de vinculación** → pegue el código → *Vincular y sincronizar*.
5. El teléfono queda sincronizado y **recibe todas las tareas, avances, fotografías e historial** existentes. Desde ese momento, lo que se haga en cualquiera de los dos equipos aparece en el otro.

> El código lleva sus credenciales de acceso a la nube: compártalo sólo por un medio seguro y no lo publique. Si cambia el token, genere un código nuevo. El sistema verifica la integridad del código y avisa si llega incompleto o alterado.

### Indicador de estado (visible siempre en el encabezado)

| Indicador | Significado |
|---|---|
| 🟢 **SINCRONIZADO** | Todo enviado y recibido |
| 🟡 **SINCRONIZANDO** | Envío o recepción en curso |
| 🔴 **SIN CONEXIÓN** | Sin Internet (los cambios se guardan y se envían solos al reconectar) |
| ⚪ **SÓLO LOCAL** | Sincronización aún no configurada |

Al pulsar el indicador se abre el detalle: modo, última sincronización, cambios pendientes, intervalo configurado y conflictos sin revisar, con el botón **Sincronizar ahora**.

### Método 1 — Nube cifrada (recomendado para empezar)

Los datos viajan **cifrados con AES-256** y la clave la definen ustedes; nunca se envía al servidor.

1. En **GitHub** → *Settings → Developer settings → Personal access tokens (classic)* → *Generate new token* con el permiso **`gist`**. Copie el token.
2. En la aplicación: **Configuración → Sincronización entre dispositivos** → método **«Nube cifrada»**.
3. Pegue el **token**, escriba una **clave de cifrado** (mínimo 12 caracteres) y pulse **Guardar**.
4. Pulse **＋ Crear repositorio de datos** → se genera el identificador.
5. Pulse **🔍 Probar conexión** y luego **🔄 Sincronizar ahora**.
6. En el **segundo dispositivo** (celular): método «Nube cifrada» + **el mismo token**, **la misma clave** y **el mismo identificador de repositorio** → Guardar → Sincronizar.

> La clave de cifrado es la pieza más importante: si se pierde, los datos en la nube no se pueden descifrar. Guárdela en un lugar seguro (y anote también el identificador del repositorio).

### Método 2 — Base de datos en la nube (Supabase)

Recomendado para **uso intensivo con muchas fotografías y documentos**.

1. Cree un proyecto gratuito en **https://supabase.com**.
2. Abra **SQL Editor**, pegue el contenido del archivo **`supabase/schema.sql`** y ejecútelo (*Run*).
3. En *Project Settings → API* copie **Project URL** y la clave **anon public**.
4. En la aplicación: **Configuración → Sincronización** → método **«Base de datos en la nube»**, pegue la dirección y la clave. Si creó un usuario en *Authentication → Users*, puede indicar correo y contraseña para un acceso restringido.
5. Pulse **🔍 Probar conexión** y **🔄 Sincronizar ahora**.
6. Repita el paso 4 en los demás dispositivos.

### ¿Cuál elegir?

| | Nube cifrada (Gist) | Supabase |
|---|---|---|
| Puesta en marcha | 1 minuto (sólo un token) | 5-10 minutos |
| Cifrado de extremo a extremo | **Sí** (AES-256) | No (viaja por HTTPS y queda en la base de datos) |
| Uso recomendado | Hasta ~50 MB de archivos | Cientos de fotografías y documentos |
| Consultas avanzadas en la base de datos | No | Sí (SQL, informes externos) |

### Sin conexión

Si se pierde Internet puede **seguir trabajando**: consultar lo descargado, crear tareas, registrar avances, tomar fotografías y escribir comentarios. Todo queda guardado en el dispositivo y **se envía automáticamente al recuperar la conexión**. Nada se pierde.

### Control de conflictos

Si el mismo registro se modifica en dos dispositivos, la aplicación **no sobrescribe en silencio**: aplica la versión más reciente, **guarda las dos versiones** y crea un aviso en **Configuración → Control de conflictos** con:

- usuario y dispositivo de cada modificación,
- fecha y hora,
- ambas versiones completas,
- botones para conservar la versión que usted elija.

La tarea afectada queda señalada en su ficha con un aviso de conflicto.

### Respaldos

- **Exportar respaldo (JSON)**: descarga toda la información.
- **Restaurar desde respaldo**: permite *combinar* (conserva el cambio más reciente de cada registro) o *reemplazar* los datos locales.
- Los archivos eliminados se conservan 30 días para el registro y luego se depuran con *Depurar registros eliminados*.

---

## 7. Flujo de trabajo diario

1. **Configuración → Identidad corporativa**: cargue el logotipo, los colores y el nombre de la empresa (si aún no lo hizo).
2. **Comunidades → + NUEVA COMUNIDAD**: registre la comunidad con sus datos de contacto.
3. **+ NUEVA TAREA**: seleccione la comunidad, escriba la tarea, defina prioridad y fecha límite, y guarde.
4. **Agregar avance**: porcentaje, descripción, comentario, responsable y respaldo fotográfico/documental.
5. **📷 TOMAR FOTOGRAFÍA**: en el teléfono abre directamente la cámara; en el computador permite elegir el archivo.
6. **✓ COMPLETAR TAREA**: fecha de cumplimiento, porcentaje final, comentario, fotografía final y documento de respaldo. Todo el historial se conserva.
7. **Informes**: filtre por comunidad y período y exporte el PDF o el Excel.

En el teléfono, todo el recorrido (crear tarea → plazo → prioridad → guardar → fotografiar → avanzar → completar) está disponible en pocos toques desde el botón **+ NUEVA TAREA** del Dashboard.

**Cada movimiento queda sincronizado**: al crear o modificar una tarea, registrar un avance, adjuntar una fotografía o un documento, cambiar el estado, completar una tarea o resolver un conflicto, el cambio se envía a la nube y los demás dispositivos lo reciben (en segundos si están abiertos, o al abrir la aplicación). El historial de modificaciones también viaja, de modo que el computador ve quién y cuándo cambió cada tarea desde el celular.

---

## 8. Informes

**INFORMES** permite seleccionar comunidad, fecha desde/hasta, criterio de fechas (creación o vencimiento), estado, prioridad y semáforo, e incluir o no avances, fotografías e historial.

### Exportar PDF

Genera el documento con **formato profesional en hoja carta vertical**:

- logotipo y nombre de la empresa,
- nombre y dirección de la comunidad,
- fecha de emisión y período informado,
- resumen con indicadores (total, pendientes, en proceso, vencidas, próximas, completadas, urgentes, cumplimiento),
- resumen por comunidad (en el informe general),
- detalle de tareas con estado, avance y semáforo,
- seguimiento de avances, comentarios y **fotografías**,
- espacio para las firmas de Administración y del Comité.

> Al pulsar **EXPORTAR PDF** se abre el diálogo de impresión del navegador: elija **«Guardar como PDF»** como destino. También puede usar *Imprimir* (Ctrl/Cmd + P) y el resultado será el mismo informe.

### Exportar Excel

Genera un archivo **.xlsx real** con las hojas:

- **Tareas**: comunidad, tarea, descripción, fecha de creación, fecha de vencimiento, prioridad, estado, responsable, porcentaje de avance, fecha de cumplimiento, semáforo, comentarios, número de avances, número de fotos y documentos.
- **Resumen**: totales y porcentajes por comunidad (con fila de totales en el informe general).
- **Avances**: seguimiento cronológico con usuario, porcentaje y comentario.
- **Historial**: auditoría de modificaciones (usuario, acción, estado anterior/nuevo, dispositivo).

El archivo respeta **exactamente los filtros aplicados**: si selecciona *ATALAYA + tareas pendientes*, contendrá únicamente esas tareas. Los títulos quedan fijos y con filtros automáticos para analizar cómodamente.

---

## 9. Usuarios y permisos

| Perfil | Puede |
|---|---|
| **Administrador** | Todo: crear, editar y eliminar; administrar usuarios; configurar la sincronización; gestionar respaldos |
| **Supervisor** | Consultar, crear y modificar tareas, registrar avances y adjuntar archivos. No elimina registros ni administra usuarios |
| **Usuario** | Consultar y registrar avances, fotografías y documentos según sus permisos. No crea ni modifica tareas |

Las contraseñas se guardan cifradas (SHA-256 con sal). La sección **Usuarios** permite crear, editar, activar/desactivar, cambiar contraseñas y eliminar usuarios.

---

## 10. Personalización

En **Configuración → Identidad corporativa**:

- Nombre de la aplicación (primera fila del encabezado) y nombre de la empresa (segunda fila).
- **Logotipo**: cárguelo o reemplácelo cuando quiera (botón *Usar logotipo original* para volver al de CSN). Aparece en el encabezado, en la pantalla de ingreso y en los informes PDF.
- **Color principal y color secundario** (por defecto los del logotipo: `#003090` y `#60cc24`).
- **Días para «próxima a vencer»** (semáforo amarillo).
- Texto al pie de los informes y responsable que firma.

El identificador de la comunidad, la fecha de última modificación y el usuario que la realizó se muestran en el panel de cada comunidad.

---

## 11. Estructura del proyecto

```
csn-gestion/
├── index.html                 Página principal (encabezado, menú, contenedores)
├── manifest.json              Configuración de la aplicación instalable (PWA)
├── sw.js                      Service Worker: instalación y trabajo sin conexión
├── server.js                  Servidor local para probar desde el teléfono
├── publicar.js                Publica la aplicación en Internet (GitHub Pages)
├── verificar-navegador.js     Prueba de aceptación en un navegador real
├── .gitignore                 Archivos que no se publican (dependencias, cachés)
├── GUIA.md                    Esta guía
├── assets/                    Logotipo e iconos de la aplicación
├── css/
│   ├── styles.css             Diseño corporativo adaptable (computador y teléfono)
│   └── print.css              Formato de los informes (hoja carta vertical)
├── js/
│   ├── util.js                Utilidades (fechas, textos, avisos, visor de imágenes)
│   ├── db.js                  Almacenamiento local (IndexedDB con respaldo)
│   ├── crypto.js              Cifrado AES-256-GCM de los datos sincronizados
│   ├── zip.js / xlsx.js       Generación de archivos Excel reales sin dependencias
│   ├── model.js               Modelo de datos, semáforo e indicadores
│   ├── store.js               Capa de negocio: CRUD, historial, permisos, búsqueda
│   ├── report.js              Informes PDF y Excel
│   ├── sync/                  Sincronización (núcleo, nube cifrada, Supabase, archivos)
│   ├── views/                 Pantallas (dashboard, comunidades, tareas, calendario,
│   │                          informes, buscar, usuarios, configuración)
│   └── app.js                 Núcleo: menú, rutas, sesión, identidad, PWA
├── supabase/schema.sql        Script de base de datos en la nube
└── tests/                     Pruebas automatizadas (véase abajo)
```

---

## 12. Pruebas automatizadas

```bash
cd csn-gestion
npm install            # sólo para las pruebas (jsdom)
npm test               # ejecuta las 6 suites (~600 pruebas)
```

También puede ejecutar cada suite por separado:

```bash
node tests/model.test.js     # semáforo, indicadores, datos de demostración
node tests/store.test.js     # negocio: CRUD, historial, permiso, búsqueda
node tests/sync.test.js      # sincronización entre dos dispositivos y conflictos
node tests/export.test.js    # informes PDF y archivos Excel reales
node tests/ui.test.js        # interfaz y flujos completos
node tests/pwa.test.js       # aplicación instalable, estructura y accesibilidad
```

Las pruebas recorren el flujo completo solicitado: **crear comunidad → crear tarea → definir fecha y plazo → prioridad → guardar → agregar avance → tomar fotografía → adjuntar documento → modificar estado → completar tarea → registrar fecha de cumplimiento y comentario → consultar historial → generar informe PDF → exportar Excel → verificar la sincronización entre computador y celular** (simulando dos dispositivos y los servicios en la nube).

### Verificación en un navegador real (opcional)

```bash
npm run verificar-navegador      # requiere Google Chrome instalado
```

Abre la aplicación en Chrome (sin interfaz), recorre el dashboard, las comunidades, la ficha de tarea, el calendario, los informes y el buscador en tamaño computador **y** teléfono, genera un **informe PDF de ejemplo**, comprueba el registro del service worker, la apertura sin conexión y que no haya errores en la consola. Los archivos resultantes quedan en `revision-impresion/`:

- `01-ingreso.png` … `07-informes.png` — capturas en computador
- `08-teléfono-dashboard.png` … `11-teléfono-ficha.png` — capturas en teléfono (390 × 844)
- `informe-ejemplo.pdf` — informe real en hoja carta con logotipo, resumen, detalle, avances, fotografías, historial y firmas

---

## 13. Ampliaciones futuras previstas

La estructura de datos y la interfaz están preparadas para incorporar, sin rehacer el sistema: proveedores, trabajadores, mantenciones, gastos, contratos, reclamos, documentos, inspecciones, inventario, emergencias, control de visitas y agenda del administrador. Cada uno puede implementarse como una nueva colección de registros con el mismo motor de sincronización, historial y semáforo.

---

## 14. Solución de problemas

| Situación | Solución |
|---|---|
| **No aparece el botón de la cámara o no abre** | La cámara requiere **HTTPS** o **localhost**. Publique la aplicación en un hosting con HTTPS o use `node server.js` (el teléfono debe entrar por la dirección de red local). Alternativa: use *🖼️ Seleccionar fotografía*. |
| **No sincroniza (401)** | El token de GitHub es inválido o venció: genere uno nuevo con permiso `gist`. |
| **No sincroniza (404)** | El identificador del repositorio no coincide. Cópielo desde el dispositivo que lo creó. |
| **"La clave de sincronización no coincide"** | La clave de cifrado debe ser **idéntica en todos los dispositivos** (mayúsculas y minúsculas incluidas). |
| **Supabase: no encontró la tabla (404)** | Ejecute `supabase/schema.sql` en el *SQL Editor* del proyecto. |
| **Supabase: acceso denegado (401/403)** | Verifique la clave pública y las políticas de la tabla (RLS). Si la tabla exige autenticación, indique el correo y la contraseña del usuario creado en Supabase. |
| **No aparece la opción de instalar en iPhone** | Debe abrir la página en **Safari** (no en Chrome), botón *Compartir → Añadir a pantalla de inicio*. |
| **Los datos no aparecen en el otro dispositivo** | Pulse el indicador de sincronización → *Sincronizar ahora*. Verifique que ambos usan el mismo token, clave y repositorio. |
| **Aparece un conflicto** | Es normal si el mismo registro se modificó en dos dispositivos. Revise **Configuración → Control de conflictos** y elija la versión que conserve. |
| **Espacio insuficiente en el dispositivo** | Exporte un respaldo, depure los registros eliminados y, si usa muchas fotografías, cambie a Supabase. |
| **Quiero empezar de cero** | *Configuración → Respaldos → Borrar todos los datos* (exporte antes un respaldo). |

---

*Prioridades de diseño aplicadas: **seguridad + sincronización + facilidad de uso + funcionalidad + escalabilidad**.*
