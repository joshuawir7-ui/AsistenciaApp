---
name: brainstorming-pro
description: Genera ideas de calidad con estructura, filtros y selección final. Úsalo cuando necesites opciones creativas con criterio y una recomendación clara.
---
# Brainstorming Pro

## Cuándo usar este skill
- Cuando el usuario pida ideas, variantes, conceptos, hooks, nombres, formatos o enfoques.
- Cuando haya bloqueo creativo o demasiadas opciones y haga falta ordenar.
- Cuando el usuario necesite ideas "buenas para ejecutar", no solo ocurrencias.

## Inputs necesarios
1) **Objetivo exacto:** Qué se quiere conseguir específicamente.
2) **Público / contexto:** Para quién es el desarrollo y dónde se consumirá o usará.
3) **Restricciones:** Límites de tiempo, presupuesto, tono, formato o herramientas.
4) **Ejemplos de SÍ y NO:** Preferencias explícitas sobre enfoques deseados y descartados.
*Nota: Si faltan datos críticos, realiza de 3 a 5 preguntas aclaratorias antes de comenzar.*

## Workflow
1) **Aclarar el encargo:** Realiza 3-5 preguntas rápidas para rellenar vacíos críticos (solo si faltan datos).
2) **Generar ideas estructuradas:** Produce ideas organizadas en 4 enfoques de análisis creativo:
   - **A) 10 ideas rápidas:** Propuestas inmediatas, claras y sumamente ejecutables.
   - **B) 5 ideas "diferentes":** Con ángulos innovadores y no obvios.
   - **C) 5 ideas "low effort":** Alternativas de bajo coste o rápida producción.
   - **D) 3 ideas "high impact":** Ambiciosas, potentes y de largo alcance.
3) **Filtrar y puntuar:** Evalúa de 1 a 5 en Impacto, Claridad, Novedad, Esfuerzo y Viabilidad.
4) **Selección del TOP 5:** Consolida y recomienda las 5 mejores ideas.

## Instrucciones
- **Evitar la vaguedad:** No ofrezcas conceptos abstractos o genéricos como "mejorar la presencia". Sé específico y procesable.
- **Hooks y Títulos:** Si el usuario requiere títulos o ganchos de entrada, constrúyelos con tensión narrativa, curiosidad y brevedad.
- **Formatos y Estructura:** Si se proponen formatos de contenido, incluye la estructura y un ejemplo práctico de cómo iniciar (primer minuto).
- **Control de incertidumbre:** Cuando una propuesta requiera factores inciertos, adviértelo y ofrece un plan B.

## Output (formato exacto)
Devuelve el resultado con la siguiente estructura exacta de Markdown:

### 1) Preguntas rápidas (solo si faltan datos de entrada)
*(Preguntas para el usuario si es necesario aclarar inputs)*

### 2) Ideas generadas
#### A) 10 Ideas Rápidas (Claras y ejecutables)
1. **[Nombre de la Idea]:** [Descripción concisa].
...

#### B) 5 Ideas "Diferentes" (Ángulos no obvios)
1. **[Nombre de la Idea]:** [Descripción concisa].
...

#### C) 5 Ideas "Low Effort" (Bajo esfuerzo / rápidas de producir)
1. **[Nombre de la Idea]:** [Descripción concisa].
...

#### D) 3 Ideas "High Impact" (Gran impacto / ambiciosas)
1. **[Nombre de la Idea]:** [Descripción concisa].
...

### 3) TOP 5 Recomendado
| # | Idea | Puntuación (I / C / N / E / V) | Por qué funciona | Primer Paso a Dar |
|---|------|--------------------------------|------------------|-------------------|
| 1 | **[Nombre de la Idea]** | `I:X` `C:X` `N:X` `E:X` `V:X` | [Explicación de 2 líneas del valor real] | [Acción inmediata de 1 línea] |
| 2 | ... | ... | ... | ... |
