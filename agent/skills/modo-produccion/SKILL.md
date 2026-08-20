---
name: modo-produccion
description: Revisa una app/landing, detecta problemas típicos, propone mejoras y aplica correcciones con un checklist fijo para dejarlo listo para enseñar o publicar.
---
# Modo Producción (QA + Fix)

## Cuándo usar este skill
- Cuando ya tienes algo generado (landing/app) y quieres dejarlo totalmente “presentable”.
- Cuando un desarrollo funciona “a medias” (inconsistencias en móvil, imágenes rotas, botones sin acción, espaciados feos o descuadrados).
- Justo antes de enseñar el proyecto a un cliente, grabarlo en video o publicarlo de forma definitiva.

## Inputs necesarios
1) **Archivo o ruta principal:** El archivo raíz del proyecto (por ejemplo `index.html`, `src/main.js` o la ruta completa del directorio).
2) **Objetivo de la revisión:** Definir si es para dejarlo “listo para enseñar” (énfasis visual rápido) o “listo para publicar” (revisión técnica completa).
3) **Restricciones explícitas:** Instrucciones de qué no se debe tocar (ej. no cambiar branding, no modificar copys originales, mantener la estructura actual).
*Nota: Si alguno de estos datos es crítico y no se ha especificado, pregúntalo al usuario antes de proceder.*

## Checklist de calidad (Orden Fijo)
El análisis debe validar estrictamente los siguientes cuatro bloques:

### A) Funciona y se ve
- [ ] La preview / localhost abre completamente y sin errores de consola.
- [ ] No existen imágenes rotas; todas las rutas de assets locales y externos son correctas.
- [ ] Las tipografías, variables CSS y archivos de estilos se aplican y renderizan correctamente.

### B) Responsive (Móvil Primero)
- [ ] Diseño adaptable impecable en móvil (sin scroll horizontal indeseado, sin elementos cortados).
- [ ] Botones, campos de formulario y textos tienen tamaños táctiles y legibles idóneos.
- [ ] Los espaciados (márgenes y paddings) son coherentes y equilibrados entre secciones.

### C) Copy y UX básica
- [ ] Titular o propuesta de valor clara y perfectamente visible desde el primer scroll (above the fold).
- [ ] Botones de llamada a la acción (CTAs) consistentes (mismo tono, mismo verbo, misma intención clara).
- [ ] Eliminación total de cualquier texto provisional o placeholder genérico (como *Lorem Ipsum*).

### D) Accesibilidad mínima
- [ ] Relación de contraste razonable y alta legibilidad de todos los textos sobre sus fondos.
- [ ] Todas las imágenes descriptivas cuentan con la etiqueta `alt` correspondiente.
- [ ] Estructura lógica y jerárquica de encabezados (`h1`, `h2`, `h3`) que facilita la lectura.

## Workflow
1) **Diagnóstico rápido:** Generar un análisis inicial del estado actual en forma de una lista priorizada de 5 a 10 bullets concretos.
2) **Plan de arreglos:** Proponer un máximo de 8 cambios específicos detallando el qué se va a modificar y el por qué.
3) **Aplicar cambios:** Editar los archivos de código correspondientes en el espacio de trabajo para implementar las correcciones propuestas.
4) **Validación técnica:** Volver a verificar la preview o localhost del proyecto aplicando estrictamente la checklist de calidad.
5) **Resumen final:** Consolidar el resultado y enumerar los cambios concretos aplicados.

## Reglas
- **Respetar identidad:** No modifiques ni alteres el estilo visual de la marca si existe otra Skill de marca activa en el contexto.
- **Mantener el foco:** No intentes rehacer la aplicación desde cero. Enfócate exclusivamente en optimizaciones de alto impacto para maximizar la calidad en poco tiempo.
- **Priorizar claridad:** Si en algún punto se genera un conflicto entre lo estético ("bonito") y lo funcional ("claro"), prioriza siempre la claridad de uso de la interfaz.

## Output (formato exacto)
Devuelve siempre el análisis y los cambios con la estructura Markdown exacta detallada a continuación:

### 1) Diagnóstico (Priorizado)
* **[Severidad Alta/Media/Baja] - [Elemento]:** [Descripción corta del problema y su ubicación].
...

### 2) Cambios aplicados
- [x] **[Archivo Modificado]:** [Breve descripción de la corrección realizada].
...

### 3) Resultado final
* **Estado:** `OK para enseñar` / `OK para publicar`
* **Notas adicionales:** [Recomendaciones opcionales o siguientes pasos sugeridos que quedan fuera del alcance inmediato].
