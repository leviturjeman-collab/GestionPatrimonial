# **Documento de Especificación — App de Control y Valoración de Patrimonio (Asset & Wealth Manager)**

## **0\) Resumen ejecutivo**

Aplicación para **registrar, controlar y valorar** activos patrimoniales (inmobiliaria, restaurantes, relojes, coches y otros) con foco en:

* **Facilidad extrema** para usuarios sin conocimientos financieros (Modo Fácil).

* **Valoración profesional** (DCF completo \+ comparables \+ coste/reemplazo) con **impacto del país** (riesgo país, inflación, moneda, impuestos, FX).

* **Visión global del patrimonio**: valor total, desglose por sector/país, deuda, riesgo, liquidez y proyección a futuro.

* **Diseño premium**: base **negro \+ dorado**, con esquemas por categoría (restaurantes activo: negro/rojo/blanco; inmobiliaria: blanco; resto: negro/dorado).

---

## **1\) Objetivos y alcance**

### **1.1 Objetivos de producto**

1. Registrar y organizar **cualquier activo** con documentación y datos clave.

2. Generar una **valoración actual** por activo y del **patrimonio total**:

   * Valor de mercado (estimado)

   * Valor intrínseco (DCF) cuando aplique

   * Rango (low/base/high) y explicación sencilla

3. Permitir **proyecciones** del patrimonio a 1/3/5/10 años (escenarios).

4. UX guiada: “tipo de activo → país → inputs → valoración → dashboard”.

### **1.2 Alcance inicial (MVP)**

* Autenticación \+ perfil.

* Inventario de activos (alta/edición/eliminación lógica).

* Documentos adjuntos por activo.

* Dashboard patrimonio total \+ filtros.

* Valoración:

  * Inmobiliaria: DCF simple \+ NOI/cap rate \+ comparables manuales

  * Restaurantes/negocios: DCF simple \+ múltiplos EV/EBITDA

  * Relojes/coches: comparables \+ depreciación/apreciación

* Snapshots de valoración (histórico).

### **1.3 Fuera de alcance (MVP)**

* Integraciones automáticas (bancos, portales, ERPs).

* Monte Carlo.

* Importaciones masivas avanzadas (se deja para V2).

* Modelos fiscales avanzados por país (V2).

---

## **2\) Personas y experiencia de usuario**

### **2.1 Personas**

* **Usuario No Financiero (principal):** quiere un número “fiable” sin saber DCF.

* **Usuario Intermedio:** ajusta supuestos y revisa drivers.

* **Usuario Pro:** exige DCF completo, WACC, FX, escenarios y sensibilidad.

### **2.2 Principios UX (no negociables)**

* Todo flujo importante debe poder completarse en **\< 2 minutos** en Modo Fácil.

* En cada input crítico:

  * placeholder con ejemplo

  * tooltip “en lenguaje humano”

  * botón “No lo sé” → usa valores por defecto razonables \+ baja confianza

* Mostrar siempre:

  * **valor recomendado**

  * **rango**

  * **drivers principales**

  * **nivel de confianza**

---

## **3\) Módulos funcionales**

### **3.1 Onboarding y configuración**

**Pantallas**

* Moneda base (por defecto EUR).

* País por defecto.

* Nivel: No sé / Intermedio / Pro.

**Requisitos**

* Guardar “Global Assumptions” por defecto (editable luego).

---

### **3.2 Inventario de activos (Asset Registry)**

**Funciones**

* Crear activo (wizard):

  1. Tipo de activo

  2. País (obligatorio)

  3. Datos esenciales (dependen del sector)

  4. Adjuntar documentos (opcional)

* Ver lista con buscador y filtros (tipo, país, estado, liquidez, riesgo).

* Detalle del activo: resumen, valoración, deuda, documentos, histórico.

**Campos mínimos comunes (todos los activos)**

* ID, nombre, categoría, subcategoría

* País operativo (obligatorio)

* Moneda

* Propiedad (%) y titularidad (persona/sociedad/copropiedad)

* Estado (activo/en venta/retirado/etc.)

* Fecha compra \+ coste compra

* Método de valoración preferido (DCF/Comps/Cost/Manual)

* Deuda asociada (si aplica)

* Liquidez estimada (alta/media/baja \+ días)

* Archivos/documentos

---

### **3.3 Motor de valoración (Valuation Engine)**

Soporta 3 enfoques, combinables por activo:

1. **DCF (intrínseco)**

* Modo Fácil: 6–10 inputs.

* Modo Pro: todas las variables del DCF (WACC/FCFF/FCFE, terminal, impuestos, WC, capex, escenarios).

2. **Comparables / Market comps**

* Comps manuales (MVP).

* Método de múltiplos (EV/EBITDA, EV/Sales, €/m², cap rate).

3. **Coste / Reemplazo**

* Útil para algunos bienes y como control de plausibilidad.

**Salida estándar del motor**

* Valor base \+ rango (low/base/high)

* Explicación corta (1–3 frases) \+ drivers

* “Confidence score” (alta/media/baja) basado en:

  * completitud de inputs

  * uso de defaults

  * volatilidad del activo

* Log de supuestos utilizados (auditable)

---

### **3.4 Capa País (Country Risk Layer)**

**Objetivo:** el país afecta al descuento, inflación, impuestos y tipo de cambio.

**Por activo**

* País operativo (obligatorio)

* País fiscal/holding (opcional)

* Moneda de cash flows

* Impuesto efectivo (default por país, editable)

**Supuestos por país (tabla de presets)**

* Risk-free rate (por moneda/país) — preset editable

* Equity risk premium — preset editable

* Country risk premium — preset editable

* Inflación esperada — preset editable

* FX assumptions contra moneda base — preset editable

**Modo Fácil**

* País \+ Riesgo (Bajo/Medio/Alto) → traduce a tasa de descuento sugerida.

---

### **3.5 Dashboard de patrimonio**

**Widgets mínimos**

* Patrimonio neto total \= Σ valor activos − Σ deuda

* Distribución por:

  * tipo de activo

  * país

  * liquidez

  * riesgo

* “Top 5 activos” por valor

* Alertas (V2 en MVP opcional simple):

  * vencimientos (seguros/ITV/contratos)

  * revisiones de valoración

---

### **3.6 Proyecciones de crecimiento patrimonial**

* Selección horizonte: 1/3/5/10 años

* Escenarios:

  * Conservador / Base / Optimista

* Palancas simples por tipo:

  * inmobiliaria: incremento alquiler, ocupación, cap rate

  * restaurantes: crecimiento ventas, margen, aperturas

  * coches/relojes: apreciación/depreciación anual

* Resultado:

  * curva de patrimonio proyectado

  * desglose por contribución (qué activos empujan el crecimiento)

---

## **4\) Plantillas por sector (inputs requeridos)**

### **4.1 Inmobiliaria**

**Modo Fácil (mínimos)**

* Ubicación (ciudad)

* Tipo (residencial/comercial/otros)

* m²

* Ingreso alquiler bruto anual

* Gastos anuales

* Ocupación (%)

* Crecimiento alquiler anual (%)

* Deuda (principal \+ interés)

**Modo Pro**

* Escalados de renta

* Vacancia/rotación

* Capex mantenimiento (€/m²/año)

* Impuestos

* Método alternativo: NOI/cap rate \+ €/m² comps

---

### **4.2 Restaurantes / Negocios operativos**

**Modo Fácil**

* Ventas anuales

* Margen EBITDA (%)

* Crecimiento ventas (%)

* Capex anual (bajo/medio/alto o €)

* Deuda (principal \+ interés)

* País \+ riesgo

**Modo Pro**

* Ticket medio, transacciones, estacionalidad

* Food cost %, labor %, rent %

* Delivery vs sala

* WC (stock/proveedores)

* Múltiplos comparables EV/EBITDA, EV/Sales

---

### **4.3 Relojes (coleccionables)**

**Modo Fácil**

* Marca/modelo/referencia

* Año

* Estado (1–10)

* Full set (sí/no)

* País

* Precio compra \+ fecha compra

**Modo Pro**

* Comps (lista de transacciones manuales)

* Fee de venta, seguro, liquidez (días)

* Proyección apreciación (3 escenarios)

---

### **4.4 Coches**

**Modo Fácil**

* Marca/modelo

* Año

* Km

* Estado

* País

* Costes anuales (opcional)

**Modo Pro**

* Comps manuales \+ curva depreciación

* Liquidez, comisiones, mantenimiento programado

---

### **4.5 “Otros” (plantilla genérica)**

* Si genera cashflow → DCF genérico

* Si no genera cashflow → comps/coste \+ proyección

---

## **5\) DCF — especificación del modelo**

### **5.1 Estructura del DCF (Modo Pro)**

**A) Cash flows**

* Ingresos por año (o drivers)

* Costes variables y fijos

* EBITDA

* D\&A

* Capex (mantenimiento/expansión)

* Working capital

* Impuestos (tasa efectiva)

* FCFF o FCFE (switch)

**B) Descuento**

* RF, ERP, beta, size premium (opcional)

* Country risk premium

* WACC (si FCFF) / Cost of Equity (si FCFE)

* Inflación

* FX (si cashflows ≠ moneda base)

**C) Terminal value**

* Gordon (g terminal) o Exit multiple

* Año terminal al final del horizonte

**D) Escenarios y sensibilidad**

* 3 escenarios guardados por activo

* Matriz sensibilidad:

  * tasa descuento vs g terminal

  * margen vs crecimiento

### **5.2 Modo Fácil (mapeo a Pro)**

Inputs fáciles → se traducen a:

* Crecimiento anual → serie de ingresos

* Riesgo bajo/medio/alto → ajuste de tasa de descuento

* “Capex bajo/medio/alto” → % de ventas o € estimado

* Impuestos por país → tasa efectiva

* Terminal: método Gordon con g terminal limitada por país/sector

### **5.3 Validaciones (para “números aceptados”)**

* Límites lógicos:

  * g terminal acotado (por defecto conservador)

  * tasa de descuento mínima \> RF

  * márgenes en rangos típicos por sector (warning si se sale)

* Siempre devolver **rango**, no solo punto.

---

## **6\) Modelo de datos (alto nivel)**

### **6.1 Entidades principales**

* **User**

* **Asset**

* **AssetCategory / AssetSubcategory**

* **AssetOwnership**

* **DebtFacility** (deuda asociada)

* **ValuationSnapshot**

* **DCFModel**

* **DCFYearLine** (serie anual)

* **Comparable** (registro manual comps)

* **CountryPreset**

* **DocumentAttachment**

* **Scenario** (conservador/base/optimista)

### **6.2 Campos clave (resumen)**

**Asset**

* asset\_id, name, category, subcategory

* country\_operating, country\_fiscal

* currency, ownership\_pct

* status, purchase\_date, purchase\_cost

* preferred\_valuation\_method

* liquidity\_level, liquidity\_days\_est

* tags

**ValuationSnapshot**

* asset\_id, date

* value\_low, value\_base, value\_high

* method\_used (DCF/Comps/Hybrid/Manual)

* confidence\_score

* assumptions\_hash / metadata

---

## **7\) API / Backend (requisitos)**

### **7.1 Operaciones mínimas**

* CRUD assets

* CRUD documents

* CRUD valuations (create snapshot, recalc, read history)

* CRUD country presets (admin)

* CRUD scenarios

* Export (V2): PDF de valoración / resumen patrimonial

### **7.2 Seguridad**

* Autenticación (JWT/OAuth)

* Encriptación de documentos en reposo

* Control de acceso por usuario (y roles V2)

---

## **8\) UI / Diseño (branding y reglas)**

### **8.1 Tema global**

* Base: negro (\#) \+ dorado (accent)

* Tipografía clara, minimal, lujo

* CTA principal siempre en dorado

### **8.2 Color por categoría**

* **Restaurantes activos:** negro/rojo/blanco (indicador de estado “Activo” en rojo elegante)

* **Inmobiliaria:** tarjetas blancas con borde dorado fino

* **Resto:** negro \+ dorado

### **8.3 Componentes**

* Tarjetas (cards) con cifra grande (valor)

* Chips de país, riesgo, liquidez

* Wizard de valoración con pasos claros

* Tooltips y “No lo sé” visibles

---

## **9\) Requisitos no funcionales**

* Rendimiento: dashboard \< 1.5s con 200 activos (objetivo).

* Persistencia de snapshots (no recalcular para ver histórico).

* Trazabilidad: cada valoración debe guardar supuestos y versión del motor.

* Multi-moneda: base EUR \+ conversión (MVP con presets manuales).

* Backups y recuperación.

---

## **10\) Roadmap recomendado**

### **MVP (8–12 semanas típicamente)**

* Registro activos \+ documentos

* Dashboard

* Motor valoración híbrido simple por sector

* Country presets manuales

* Snapshots

### **V2**

* DCF pro completo (WACC/FX/escenarios/sensibilidad)

* Export PDF “modo auditoría”

* Alertas y calendario (seguros, contratos, mantenimiento)

* Importación masiva (CSV)

* Integraciones externas

---

## **11\) Criterios de aceptación (QA)**

1. Un usuario no financiero puede crear un activo y obtener valoración (rango) en \< 2 min.

2. Cada activo tiene:

   * país obligatorio

   * método de valoración guardado

   * snapshot con fecha y supuestos

3. Patrimonio total se recalcula correctamente:

   * suma activos (valor base) − suma deuda

4. Cambiar “Global Assumptions” recalcula valoraciones (según configuración) sin romper histórico.

5. La app siempre muestra un rango y drivers principales.

---

## **12\) Entregables para desarrollo**

* Wireframes (Dashboard, Lista, Detalle, Wizard)

* Esquema BD (tablas y relaciones)

* Especificación del motor (funciones, fórmulas, mapeo fácil→pro)

* Design system (tokens de color, tipografía, componentes)

* Plan de pruebas

