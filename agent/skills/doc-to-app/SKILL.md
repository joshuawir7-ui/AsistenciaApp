---
name: doc-to-app
description: Convierte un documento (PDF/texto) en una mini-app web interactiva lista para abrir en preview. Úsalo cuando quieras pasar de "contenido" a "producto usable".
---
# Doc-to-App (Documento a Mini-App)

## Cuándo usar este skill
- Cuando tengas información o contenido en un PDF, texto plano, notas dispersas o transcripciones y desees transformarla en una interfaz web navegable y dinámica.
- Cuando quieras dotar de interactividad a datos estáticos agregando funciones de búsqueda, filtros por tags y secciones desplegables.
- Para pasar rápidamente de la fase de "lectura de información" a la de "producto interactivo funcional y usable".

## Inputs necesarios
1) **Fuente del documento:** El archivo PDF, transcripción o texto pegado que contiene la información.
2) **Tipo de aplicación:** El formato interactivo que se desea lograr (ej. guía interactiva, catálogo de productos, checklist dinámico, itinerario paso a paso, glosario interactivo, etc.).
3) **Prioridad del enfoque:** Si se prefiere un diseño "más visual" (estética impecable, tarjetas llamativas) o "más práctico" (optimizado para búsquedas rápidas, tablas densas y descarga de datos).
4) **Idioma y estilo:** Configuración de idioma y tono del contenido (ej. claro, profesional, explicativo, sin tecnicismos complejos).
*Nota: Si alguno de los inputs esenciales está ausente, pregunta al usuario antes de iniciar la generación.*

## Reglas importantes
- **Acción real:** No te limites a devolver un análisis textual del documento en el chat. Debes estructurar el código y crear archivos físicos en el disco que formen una aplicación ejecutable.
- **No destructivo:** Nunca sobrescribas aplicaciones o ejecuciones previas. Cada transformación de documento debe crear una subcarpeta nueva con un timestamp único.
- **Mobile First:** La mini-app generada debe ser 100% responsiva y verse impecable en teléfonos móviles y tablets.
- **Sin dependencias externas pesadas:** Utiliza vanilla HTML, CSS embebido (o en archivo limpio) y Javascript puro (Vanilla JS) para asegurar cargas instantáneas sin necesidad de empaquetadores ni frameworks de Node.js.

## Estructura de salida
Para cada ejecución, debes crear una estructura de carpetas limpia y con nomenclatura estandarizada:

`miniapp_<tema>_<YYYYMMDD_HHMM>/`

Dentro de este directorio, genera obligatoriamente:
- **`index.html`:** La estructura de la aplicación, el motor de rendering dinámico en JavaScript y el diseño en CSS.
- **`data.json`:** La base de datos estructurada que almacena de forma ordenada toda la información extraída y jerarquizada del documento original.
- **`README.txt`:** Instrucciones de instalación/arranque de la mini-app, resumen de tecnologías y descripción de la información que contiene.

## Funcionalidades mínimas requeridas
1) **Buscador global:** Caja de texto con filtrado reactivo en tiempo real a medida que el usuario escribe.
2) **Filtros por categoría/tags:** Botones o selectores dinámicos basados en los tags recopilados en el `data.json`.
3) **Navegación e índice:** Un índice superior o panel lateral flotante con scroll suave para saltar entre bloques.
4) **Diseño premium responsivo:** Uso de variables de color HSL, tipografía moderna, bordes redondeados y microinteracciones en hovers de botones.
5) **Elementos interactivos:** Botón para "copiar al portapapeles", estado de "marcar como completado" (si es checklist) o secciones colapsables (acordeón).

## Workflow
1) **Extracción estructurada:** Lee el documento fuente y clasifica la información en secciones lógicas, listados de datos, glosarios, tablas y puntos clave.
2) **Esquematización en JSON:** Estructura los datos procesados en el archivo `data.json` utilizando claves semánticas y legibles.
3) **Desarrollo de la App:** Genera el archivo `index.html`. Implementa lógica JS para cargar dinámicamente el `data.json`, pintando la interfaz de usuario en base a los criterios de búsqueda y filtros.
4) **Auditoría rápida:** Verifica localmente que las búsquedas no den errores, los botones ejecuten sus listeners, las imágenes se vean y los estilos se carguen correctamente.
5) **Entrega y Resumen:** Notifica al usuario la ruta física exacta de la carpeta y los archivos creados.

## Output (formato exacto)
Al finalizar la ejecución de la skill, responde en el chat con la siguiente estructura de salida:

### 📁 Carpeta creada
`miniapp_<tema>_<YYYYMMDD_HHMM>/`

### 💻 Archivos de la Aplicación
* **Vista Principal:** `[Ruta-del-proyecto]/miniapp_<tema>_<YYYYMMDD_HHMM>/index.html`
* **Base de Datos:** `[Ruta-del-proyecto]/miniapp_<tema>_<YYYYMMDD_HHMM>/data.json`
* **Instrucciones:** `[Ruta-del-proyecto]/miniapp_<tema>_<YYYYMMDD_HHMM>/README.txt`

### 📊 Resumen de la Mini-App
* **Tipo de App:** [Ej. Catálogo interactivo de herramientas]
* **Secciones incluidas:**
  - **[Sección 1]:** [Breve descripción de su contenido].
  - **[Sección 2]:** [Breve descripción de su contenido].
* **Funcionalidades activas:**
  - [x] Buscador de texto reactivo.
  - [x] Filtro por [Categorías/Etiquetas].
  - [x] [Función interactiva extra, ej. Sistema de Checklist / Copiar al Portapapeles].
