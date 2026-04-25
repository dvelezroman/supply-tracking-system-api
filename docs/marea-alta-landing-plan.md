# 🌊 Plan de Implementación - Landing Page Marea Alta

> **Proyecto:** Landing Page storytelling para Marea Alta  
> **Framework:** Angular (Frontend)  
> **Propósito:** Convertir la historia de marca en una experiencia web inmersiva  
> **Audiencia:** Consumidores ecuatorianos que buscan mariscos premium con trazabilidad

---

## 📋 Tabla de Contenidos

1. [Contexto del Negocio](#contexto-del-negocio)
2. [Arquitectura Angular](#arquitectura-angular)
3. [Estructura de Componentes](#estructura-de-componentes)
4. [Sistema de Diseño](#sistema-de-diseño)
5. [Contenido y Copy](#contenido-y-copy)
6. [Instrucciones para Agentes IA](#instrucciones-para-agentes-ia)
7. [Skills Requeridas](#skills-requeridas)
8. [Roadmap de Implementación](#roadmap-de-implementación)

---

## 🎯 Contexto del Negocio

### Historia de Marca
Marea Alta es una empresa ecuatoriana de camarones premium fundada por un biólogo marino y productor camaronero. La marca nace de la necesidad de **confianza en el consumo de mariscos** y se sustenta en:

- **40+ años de legado familiar** en la industria camaronera (Granja Rossana Aurelia)
- **Trazabilidad completa**: desde genética (Grupo Lardelce) hasta empaque (Coinmarpez S.A.)
- **Origen verificable**: Huaquillas y Santa Rosa, cuna del camarón ecuatoriano
- **Método semiextensivo**: respeto por los tiempos de la naturaleza

### Propuesta de Valor
> "Camarones con origen, excelente textura y la mejor calidad que Ecuador puede producir"

### Problema que Resuelve
Consumidores evitan comer camarón por desconfianza (lotes rechazados, inventarios por caducar, dudosa procedencia).

### Público Objetivo
- **Primario:** Familias ecuatorianas clase media-alta (30-55 años)
- **Secundario:** Chefs, restaurantes, hoteles que valoran trazabilidad
- **Psicográfico:** Conscientes de calidad, dispuestos a pagar premium por origen verificable

---

## 🏗️ Arquitectura Angular

### Versión Recomendada
```json
{
  "angular": "^17.x",
  "typescript": "^5.x"
}
```

### Estructura de Carpetas Propuesta

```
src/
├── app/
│   ├── core/                          # Servicios singleton
│   │   ├── services/
│   │   │   ├── scroll-animation.service.ts
│   │   │   └── analytics.service.ts
│   │   └── guards/
│   │
│   ├── shared/                        # Componentes reutilizables
│   │   ├── components/
│   │   │   ├── navbar/
│   │   │   ├── footer/
│   │   │   ├── cta-button/
│   │   │   └── section-title/
│   │   ├── directives/
│   │   │   └── scroll-reveal.directive.ts
│   │   └── pipes/
│   │
│   ├── features/                      # Módulos de características
│   │   └── landing/
│   │       ├── landing.module.ts
│   │       ├── landing-routing.module.ts
│   │       └── components/
│   │           ├── hero-section/
│   │           ├── story-origin/
│   │           ├── legacy-timeline/
│   │           ├── traceability-flow/
│   │           ├── values-grid/
│   │           ├── testimonials/
│   │           └── final-cta/
│   │
│   ├── assets/
│   │   ├── images/
│   │   │   ├── hero/
│   │   │   ├── founders/
│   │   │   ├── legacy/
│   │   │   ├── process/
│   │   │   └── products/
│   │   ├── icons/
│   │   └── videos/
│   │
│   └── styles/
│       ├── _variables.scss            # Tokens de diseño
│       ├── _mixins.scss
│       ├── _typography.scss
│       └── styles.scss
│
└── environments/
```

---

## 🧩 Estructura de Componentes

### 1. Hero Section (`hero-section`)

**Propósito:** Capturar atención inmediata y establecer propuesta de valor

```typescript
// hero-section.component.ts
export class HeroSectionComponent {
  @Input() title: string = 'Camarones con Historia, Calidad con Origen';
  @Input() subtitle: string = 'Más de 40 años de tradición familiar...';
  @Input() ctaPrimary: string = 'Conoce Nuestra Historia';
  @Input() ctaSecondary: string = 'Ver Productos';
  @Input() heroImage: string = 'assets/images/hero/shrimp-hero.jpg';
  @Input() heroImageAlt: string = 'Camarones frescos Marea Alta';
}
```

**Features:**
- Video de fondo (opcional) con overlay
- Animación de fade-in al cargar
- Scroll indicator animado
- Responsive: imagen arriba en mobile, lado a lado en desktop

**Diseño:**
```html
<section class="hero-section">
  <div class="hero-content">
    <h1 class="hero-title animate-fade-in">{{ title }}</h1>
    <p class="hero-subtitle animate-fade-in-delay">{{ subtitle }}</p>
    <div class="hero-ctas">
      <button class="cta-primary">{{ ctaPrimary }}</button>
      <button class="cta-secondary">{{ ctaSecondary }}</button>
    </div>
  </div>
  <div class="hero-image">
    <img [src]="heroImage" [alt]="heroImageAlt">
  </div>
  <div class="scroll-indicator">
    <span>Descubre nuestra historia</span>
    <svg class="arrow-down"><!-- SVG animado --></svg>
  </div>
</section>
```

---

### 2. Story Origin Section (`story-origin`)

**Propósito:** Narrativa personal del fundador (conexión emocional)

```typescript
// story-origin.component.ts
export interface Founder {
  name: string;
  role: string;
  image: string;
  quote: string;
}

export class StoryOriginComponent {
  founder: Founder = {
    name: 'Fundador Marea Alta',
    role: 'Biólogo Marino & Productor Camaronero',
    image: 'assets/images/founders/couple-restaurant.jpg',
    quote: `Mi esposa y yo, siempre nos hemos considerado personas que disfrutan 
            de una buena cena, pero algo que siempre me limitaba, era la libertad y 
            confianza de poder consumir mariscos de una manera segura...`
  };
  
  fullStory: string = `...así nace Marea Alta, de un deseo del consumidor, 
                       que pueda tener la confianza de lo que se está comiendo 
                       y que esta sea una gran experiencia`;
}
```

**Layout:**
- Desktop: Imagen izquierda (50%) + Texto derecha (50%)
- Mobile: Imagen arriba, texto abajo
- Animación: Parallax suave en scroll

**Contenido Clave:**
- Historia personal del fundador
- Problema identificado (desconfianza en mariscos)
- Motivación para crear Marea Alta
- Foto de la pareja fundadora

---

### 3. Legacy Timeline (`legacy-timeline`)

**Propósito:** Mostrar 40+ años de tradición familiar

```typescript
// legacy-timeline.component.ts
export interface TimelineEvent {
  year: string;
  title: string;
  description: string;
  image?: string;
  icon?: string;
}

export class LegacyTimelineComponent {
  timelineEvents: TimelineEvent[] = [
    {
      year: 'Finales 60s - Principios 70s',
      title: 'Nacimiento de la Industria',
      description: 'Huaquillas y Santa Rosa: descubrimiento accidental del cultivo de camarón en cautiverio tras grandes aguajes',
      icon: 'discovery'
    },
    {
      year: 'Hace 40+ años',
      title: 'Granja Rossana Aurelia',
      description: 'Inicio del legado familiar. Nombrada por la hija menor, simboliza futuro y cuidado en cada ciclo',
      image: 'assets/images/legacy/father-farm.jpg',
      icon: 'farm'
    },
    {
      year: 'Evolución Continua',
      title: 'Cultivo Semiextensivo',
      description: 'Transición de métodos rudimentarios a cultivo que respeta los tiempos de la naturaleza',
      icon: 'evolution'
    },
    {
      year: 'Hoy',
      title: 'Marea Alta',
      description: 'Continuamos el legado conectando dedicación con el mejor resultado: camarón con origen y calidad',
      icon: 'present'
    }
  ];
}
```

**Diseño:**
- Timeline vertical en mobile, horizontal en desktop
- Iconos personalizados para cada hito
- Animación: eventos aparecen al hacer scroll
- Foto del padre/fundador original como elemento destacado

---

### 4. Traceability Flow (`traceability-flow`)

**Propósito:** Demostrar trazabilidad completa (diferenciador clave)

```typescript
// traceability-flow.component.ts
export interface TraceabilityStage {
  id: string;
  title: string;
  partner: string;
  description: string;
  icon: string;
  details: string[];
  image: string;
}

export class TraceabilityFlowComponent {
  stages: TraceabilityStage[] = [
    {
      id: 'genetics',
      title: 'Genética & Larvas',
      partner: 'Grupo Lardelce - Manta',
      description: 'La trazabilidad comienza antes de la piscina',
      icon: 'dna',
      details: [
        '4 módulos de producción',
        'Rigor técnico impecable',
        'Larvas de alta calidad',
        'Monitoreo bajo estándares estrictos'
      ],
      image: 'assets/images/process/larvae.jpg'
    },
    {
      id: 'farming',
      title: 'Cultivo Semiextensivo',
      partner: 'Granja Rossana Aurelia - El Oro',
      description: 'Crianza que respeta los tiempos de la naturaleza',
      icon: 'pond',
      details: [
        'Aguas salobres de El Oro',
        'Método semiextensivo',
        'Sabor y textura únicos',
        'Ecosistema preservado'
      ],
      image: 'assets/images/process/farm.jpg'
    },
    {
      id: 'processing',
      title: 'Transformación & Empaque',
      partner: 'Coinmarpez S.A.',
      description: 'Co-packing con estándares de excelencia',
      icon: 'package',
      details: [
        'Empresa familiar (desde 2017)',
        'Servicio personalizado',
        'Contratos de retribución y confianza',
        'Frescura del campo al empaque'
      ],
      image: 'assets/images/process/packing.jpg'
    }
  ];
  
  selectedStage: TraceabilityStage | null = null;
  
  selectStage(stage: TraceabilityStage): void {
    this.selectedStage = stage;
  }
}
```

**Diseño:**
- 3 columnas con cards interactivas
- Al hacer hover/click: expandir detalles
- Flechas conectoras animadas entre etapas
- Badges de "Socio Estratégico" para partners

---

### 5. Values Grid (`values-grid`)

**Propósito:** Comunicar diferenciadores de manera visual

```typescript
// values-grid.component.ts
export interface Value {
  icon: string;
  title: string;
  description: string;
  color: string;
}

export class ValuesGridComponent {
  values: Value[] = [
    {
      icon: 'magnifying-glass',
      title: 'Trazabilidad 100%',
      description: 'Conoce el origen exacto desde la larva hasta tu mesa',
      color: 'blue'
    },
    {
      icon: 'family',
      title: 'Empresa Familiar',
      description: '40+ años de tradición y compromiso generacional',
      color: 'coral'
    },
    {
      icon: 'flag-ecuador',
      title: '100% Ecuatoriano',
      description: 'Orgullo de El Oro, cuna del mejor camarón del mundo',
      color: 'yellow'
    },
    {
      icon: 'star',
      title: 'Calidad Premium',
      description: 'Metodología de producción reconocida mundialmente',
      color: 'green'
    }
  ];
}
```

**Layout:**
- Grid 2x2 en desktop, 1 columna en mobile
- Iconos personalizados (no Font Awesome genérico)
- Animación: cards flotan al hacer hover

---

### 6. Testimonials Section (`testimonials`)

**Propósito:** Social proof y validación

```typescript
// testimonials.component.ts
export interface Testimonial {
  id: string;
  author: string;
  role: string;
  content: string;
  rating: number;
  image?: string;
  date?: string;
}

export class TestimonialsComponent {
  testimonials: Testimonial[] = [
    // Placeholder - agregar testimonios reales
    {
      id: '1',
      author: 'María González',
      role: 'Chef Ejecutiva',
      content: 'La calidad de Marea Alta es incomparable. Finalmente puedo confiar en el camarón que sirvo a mis clientes.',
      rating: 5,
      image: 'assets/images/testimonials/chef-maria.jpg'
    }
    // ... más testimonios
  ];
  
  currentIndex: number = 0;
  
  nextTestimonial(): void {
    this.currentIndex = (this.currentIndex + 1) % this.testimonials.length;
  }
  
  prevTestimonial(): void {
    this.currentIndex = this.currentIndex === 0 
      ? this.testimonials.length - 1 
      : this.currentIndex - 1;
  }
}
```

**Features:**
- Carrusel con navegación
- Auto-play opcional
- Estrellas de rating
- Fotos de clientes (con permiso)

---

### 7. Final CTA Section (`final-cta`)

**Propósito:** Conversión - llevar al usuario a la acción

```typescript
// final-cta.component.ts
export class FinalCtaComponent {
  @Output() onSubmit = new EventEmitter<ContactForm>();
  
  ctaTitle: string = 'Lleva el Legado a Tu Mesa';
  ctaSubtitle: string = 'Únete a familias que ya confían en Marea Alta';
  
  contactForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    phone: new FormControl('', [Validators.required]),
    message: new FormControl(''),
    interest: new FormControl('retail') // retail, restaurant, wholesale
  });
  
  submitForm(): void {
    if (this.contactForm.valid) {
      this.onSubmit.emit(this.contactForm.value);
    }
  }
}
```

**Opciones de CTA:**
- **Formulario de contacto** (lead generation)
- **WhatsApp directo** (muy común en Ecuador)
- **Botón "Comprar Ahora"** (si hay e-commerce)
- **Newsletter signup**

---

## 🎨 Sistema de Diseño

### Paleta de Colores

```scss
// _variables.scss

// Colores Primarios (Inspirados en mar y tradición)
$marea-azul-profundo: #0A2647;      // Océano profundo - Primary dark
$marea-azul-principal: #144272;     // Azul marea - Primary
$marea-azul-claro: #2C74B3;         // Cielo - Primary light
$marea-celeste: #205295;            // Agua clara - Secondary

// Colores de Acento
$marea-coral: #FF6B6B;              // Coral vivo - CTAs, acentos
$marea-coral-hover: #FF5252;        // Hover state
$marea-amarillo: #FFD93D;           // Sol - badges, highlights

// Neutros
$marea-blanco: #FFFFFF;             // Espuma
$marea-arena: #F5E6D3;              // Arena clara - backgrounds
$marea-gris-claro: #F7F9FC;         // Backgrounds alternativos
$marea-gris-medio: #718096;         // Texto secundario
$marea-gris-oscuro: #2D3748;        // Texto principal
$marea-negro: #1A202C;              // Headers

// Colores Semánticos
$success: #48BB78;                  // Verde agua
$warning: #ED8936;                  // Naranja atardecer
$error: #F56565;
$info: $marea-azul-claro;

// Gradientes
$gradient-ocean: linear-gradient(135deg, $marea-azul-profundo 0%, $marea-azul-principal 100%);
$gradient-sunset: linear-gradient(135deg, $marea-coral 0%, $marea-amarillo 100%);
$gradient-overlay: linear-gradient(180deg, rgba(10, 38, 71, 0.7) 0%, rgba(10, 38, 71, 0.3) 100%);
```

### Tipografía

```scss
// _typography.scss

// Fuentes Principales
$font-primary: 'Montserrat', sans-serif;    // Moderna, limpia (headers)
$font-secondary: 'Open Sans', sans-serif;   // Legible (body)
$font-accent: 'Playfair Display', serif;    // Elegante (quotes, subtítulos especiales)

// Scale Tipográfica (Escala Mayor Tercera - 1.250)
$font-size-xs: 0.64rem;      // 10.24px
$font-size-sm: 0.8rem;       // 12.8px
$font-size-base: 1rem;       // 16px
$font-size-md: 1.25rem;      // 20px
$font-size-lg: 1.563rem;     // 25px
$font-size-xl: 1.953rem;     // 31.25px
$font-size-2xl: 2.441rem;    // 39px
$font-size-3xl: 3.052rem;    // 48.83px
$font-size-4xl: 3.815rem;    // 61px

// Pesos
$font-weight-light: 300;
$font-weight-regular: 400;
$font-weight-medium: 500;
$font-weight-semibold: 600;
$font-weight-bold: 700;

// Line Heights
$line-height-tight: 1.2;
$line-height-normal: 1.5;
$line-height-relaxed: 1.75;

// Clases Utilitarias
.heading-1 {
  font-family: $font-primary;
  font-size: $font-size-4xl;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  color: $marea-negro;
  
  @media (max-width: 768px) {
    font-size: $font-size-2xl;
  }
}

.heading-2 {
  font-family: $font-primary;
  font-size: $font-size-3xl;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: $marea-azul-profundo;
  
  @media (max-width: 768px) {
    font-size: $font-size-xl;
  }
}

.body-text {
  font-family: $font-secondary;
  font-size: $font-size-base;
  line-height: $line-height-normal;
  color: $marea-gris-oscuro;
}

.quote-text {
  font-family: $font-accent;
  font-size: $font-size-lg;
  font-style: italic;
  line-height: $line-height-relaxed;
  color: $marea-azul-principal;
}
```

### Spacing System

```scss
// Escala de espaciado (múltiplos de 8px - base)
$spacing-unit: 8px;

$spacing-xs: $spacing-unit * 0.5;   // 4px
$spacing-sm: $spacing-unit * 1;     // 8px
$spacing-md: $spacing-unit * 2;     // 16px
$spacing-lg: $spacing-unit * 3;     // 24px
$spacing-xl: $spacing-unit * 4;     // 32px
$spacing-2xl: $spacing-unit * 6;    // 48px
$spacing-3xl: $spacing-unit * 8;    // 64px
$spacing-4xl: $spacing-unit * 12;   // 96px
$spacing-5xl: $spacing-unit * 16;   // 128px

// Aplicación en secciones
.section {
  padding: $spacing-3xl 0;
  
  @media (max-width: 768px) {
    padding: $spacing-2xl 0;
  }
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 $spacing-lg;
  
  @media (max-width: 768px) {
    padding: 0 $spacing-md;
  }
}
```

### Componentes de UI

```scss
// Botones
.btn {
  font-family: $font-primary;
  font-weight: $font-weight-semibold;
  padding: $spacing-md $spacing-xl;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: $font-size-base;
  
  &-primary {
    background: $marea-coral;
    color: $marea-blanco;
    
    &:hover {
      background: $marea-coral-hover;
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(255, 107, 107, 0.3);
    }
  }
  
  &-secondary {
    background: transparent;
    color: $marea-azul-principal;
    border: 2px solid $marea-azul-principal;
    
    &:hover {
      background: $marea-azul-principal;
      color: $marea-blanco;
    }
  }
  
  &-large {
    padding: $spacing-lg $spacing-2xl;
    font-size: $font-size-md;
  }
}

// Cards
.card {
  background: $marea-blanco;
  border-radius: 12px;
  padding: $spacing-xl;
  box-shadow: 0 4px 12px rgba(10, 38, 71, 0.08);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(10, 38, 71, 0.15);
  }
  
  &-image {
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: $spacing-md;
  }
  
  &-title {
    font-family: $font-primary;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $marea-azul-profundo;
    margin-bottom: $spacing-sm;
  }
  
  &-description {
    font-family: $font-secondary;
    font-size: $font-size-base;
    color: $marea-gris-medio;
    line-height: $line-height-normal;
  }
}
```

### Animaciones

```scss
// _mixins.scss

@mixin fade-in($delay: 0s) {
  opacity: 0;
  animation: fadeIn 0.8s ease-out $delay forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@mixin slide-in-left($delay: 0s) {
  opacity: 0;
  transform: translateX(-50px);
  animation: slideInLeft 0.6s ease-out $delay forwards;
}

@keyframes slideInLeft {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@mixin slide-in-right($delay: 0s) {
  opacity: 0;
  transform: translateX(50px);
  animation: slideInRight 0.6s ease-out $delay forwards;
}

@keyframes slideInRight {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

// Parallax suave
@mixin parallax-scroll() {
  transform: translateY(var(--parallax-offset, 0));
  transition: transform 0.3s ease-out;
}
```

---

## 📝 Contenido y Copy

### Copy Estratégico por Sección

#### **Hero Section**
```
Titular: "Camarones con Historia, Calidad con Origen"
Subtítulo: "40 años de tradición familiar trayendo el mejor camarón ecuatoriano a tu mesa"
CTA Principal: "Conoce Nuestra Historia"
CTA Secundario: "Ver Productos"
```

#### **Story Origin Section**
```
Título: "Nacimiento de Marea Alta"
Quote destacada: "Mi esposa y yo siempre nos hemos considerado personas que disfrutan de una buena cena..."

Párrafo 1:
"Durante años, evité comer camarón a pesar de mi legado como productor camaronero y biólogo marino. Conocía la industria desde dentro: trabajé en producción, en el Control Nacional de Acuacultura y para grandes empresas del sector."

Párrafo 2:
"Descubrí que aunque Ecuador tiene la mejor metodología de producción del mundo, la mayoría del producto premium se exporta. Lo que consumimos localmente suelen ser lotes rechazados, inventarios por caducar o productos de dudosa procedencia."

Párrafo 3 (Resolución):
"Así nace Marea Alta: del deseo de que tú, el consumidor, puedas tener la confianza de lo que estás comiendo y que esta sea una gran experiencia."
```

#### **Legacy Timeline**
```
Título: "40 Años de Tradición Familiar"
Subtítulo: "Un legado escrito con agua salobre y esfuerzo"

Evento 1 (Finales 60s-70s):
"En Huaquillas y Santa Rosa, cuna del camarón ecuatoriano, se descubrió casi por accidente que el camarón podía cultivarse en cautiverio tras los grandes aguajes. Nuestra familia fue testigo y protagonista de esa revolución."

Evento 2 (40 años atrás):
"Nace la Granja Rossana Aurelia, nombrada en honor a la hija menor de la familia. Más que una unidad de producción, es un homenaje vivo que simboliza el futuro y el cuidado que ponemos en cada ciclo."

Evento 3 (Evolución):
"Evolucionamos de métodos rudimentarios a un cultivo semiextensivo que respeta los tiempos de la naturaleza, garantizando un sabor y textura que solo el ecosistema de El Oro puede otorgar."

Evento 4 (Hoy):
"Continuamos el legado conectando la dedicación de una labor bien hecha con el mejor resultado: un camarón con origen, excelente textura y la calidad premium que Ecuador puede producir."
```

#### **Traceability Section**
```
Título: "Trazabilidad de la Granja a Tu Mesa"
Subtítulo: "Conoce cada paso del viaje de tu camarón"

Etapa 1 - Genética:
Título: "Todo Comienza en las Larvas"
Partner: "Grupo Lardelce - Manta"
Descripción: "La trazabilidad de Marea Alta comienza antes de que el camarón llegue a la piscina. Trabajamos con 4 módulos de producción que aseguran larvas de alta calidad, monitoreadas bajo estándares estrictos."

Etapa 2 - Cultivo:
Título: "Crianza que Respeta la Naturaleza"
Partner: "Granja Rossana Aurelia - El Oro"
Descripción: "Nuestro método semiextensivo respeta los tiempos de la naturaleza, garantizando un sabor y textura que solo el ecosistema de El Oro puede otorgar."

Etapa 3 - Procesamiento:
Título: "Del Campo al Empaque con Excelencia"
Partner: "Coinmarpez S.A."
Descripción: "Confiamos el co-packing a una empresa familiar que desde 2017 mantiene estándares de excelencia. Bajo estrictos contratos de retribución y confianza, garantizamos que la frescura del campo llegue intacta al empaque final."
```

#### **Values Grid**
```
Valor 1:
Título: "Trazabilidad 100%"
Descripción: "Conoce el origen exacto de tu camarón desde la larva hasta tu mesa. Transparencia total en cada paso."

Valor 2:
Título: "Empresa Familiar"
Descripción: "Más de 40 años de tradición y compromiso generacional. Cada camarón lleva nuestro nombre y reputación."

Valor 3:
Título: "100% Ecuatoriano"
Descripción: "Orgullo de El Oro, cuna del mejor camarón del mundo. Metodología de producción reconocida internacionalmente."

Valor 4:
Título: "Calidad Premium"
Descripción: "Cultivo semiextensivo que respeta los tiempos de la naturaleza. Textura firme, sabor auténtico."
```

#### **Final CTA**
```
Título: "Lleva el Legado a Tu Mesa"
Subtítulo: "Únete a familias ecuatorianas que ya confían en Marea Alta"
CTA: "Quiero Probar Marea Alta"
Texto alternativo: "¿Tienes un restaurante? Contáctanos para precios mayoristas"
```

---

## 🤖 Instrucciones para Agentes IA

### Para Claude/Cursor AI

Cuando trabajes en este proyecto, sigue estas directrices:

#### **Contexto General**
```
Estás trabajando en una landing page para Marea Alta, una marca ecuatoriana de camarones premium.
La marca se diferencia por:
- 40+ años de tradición familiar
- Trazabilidad completa verificable
- Origen en El Oro, Ecuador (cuna del mejor camarón)
- Cultivo semiextensivo (respeta la naturaleza)

Público objetivo: Familias clase media-alta, chefs, restaurantes que valoran calidad y origen.
Tono de comunicación: Profesional pero cálido, confiable, con orgullo ecuatoriano.
```

#### **Al Generar Componentes Angular:**
```typescript
// SIEMPRE usar este patrón:
// 1. Definir interfaces para tipado fuerte
export interface [NombreInterface] {
  // propiedades
}

// 2. Componente con inputs/outputs claros
@Component({
  selector: 'app-[nombre-kebab-case]',
  templateUrl: './[nombre].component.html',
  styleUrls: ['./[nombre].component.scss']
})
export class [Nombre]Component implements OnInit {
  @Input() data: [Tipo];
  @Output() action = new EventEmitter<[Tipo]>();
  
  constructor() {}
  ngOnInit(): void {}
}

// 3. Template semántico y accesible
<section class="[nombre]-section" role="region" aria-label="[descripción]">
  <!-- Contenido -->
</section>

// 4. Estilos usando variables del design system
.section {
  background: $marea-blanco;
  padding: $spacing-3xl 0;
}
```

#### **Al Escribir Copy:**
```
- Usa segunda persona (tú) para conectar con el usuario
- Evita jerga técnica innecesaria
- Destaca beneficios emocionales (confianza, tradición) junto a racionales (trazabilidad)
- Incluye microcopy que humanice ("Conoce a la familia", no "Conozca nuestra empresa")
- Usa números específicos cuando sea posible ("40 años", "4 módulos", no "muchos años")
```

#### **Al Diseñar Animaciones:**
```scss
// Prioridad: Performance sobre complejidad
// Animar solo: transform, opacity
// NUNCA: width, height, top, left

.element {
  // ✅ Bueno
  transition: transform 0.3s ease, opacity 0.3s ease;
  
  &:hover {
    transform: translateY(-4px);
    opacity: 0.9;
  }
  
  // ❌ Malo
  transition: height 0.3s; // Causa reflow
}

// Usar @media (prefers-reduced-motion: reduce) para accesibilidad
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

#### **Al Optimizar Imágenes:**
```html
<!-- SIEMPRE usar srcset para responsive images -->
<img 
  src="assets/images/hero/shrimp-hero-800w.jpg"
  srcset="
    assets/images/hero/shrimp-hero-400w.jpg 400w,
    assets/images/hero/shrimp-hero-800w.jpg 800w,
    assets/images/hero/shrimp-hero-1200w.jpg 1200w
  "
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Camarones frescos Marea Alta de la granja Rossana Aurelia"
  loading="lazy"
  decoding="async"
/>

<!-- Para imágenes críticas (hero), usar loading="eager" -->
```

#### **Al Implementar SEO:**
```typescript
// En cada componente de sección, actualizar meta tags
import { Meta, Title } from '@angular/platform-browser';

constructor(
  private meta: Meta,
  private title: Title
) {}

ngOnInit(): void {
  this.title.setTitle('Marea Alta - Camarones Premium con 40 Años de Tradición');
  this.meta.updateTag({ 
    name: 'description', 
    content: 'Camarones ecuatorianos con trazabilidad completa desde El Oro...' 
  });
  this.meta.updateTag({ property: 'og:image', content: '/assets/og-image.jpg' });
}
```

#### **Checklist Pre-Commit:**
```
[ ] Componente tipado con interfaces
[ ] Estilos usan variables del design system (no colores hardcodeados)
[ ] Accesibilidad: aria-labels, alt texts, roles semánticos
[ ] Responsive: mobile-first, breakpoints consistentes
[ ] Performance: lazy loading, change detection OnPush donde aplique
[ ] Copy revisado (ortografía, tono de marca)
[ ] Sin console.logs o comentarios de debug
```

---

## 🛠️ Skills Requeridas

### Skills Técnicas (Frontend)

#### 1. **Angular Framework**
```
- Versión: 17+
- Módulos: Standalone components (preferido) o NgModules
- Routing: Lazy loading de secciones si es app multi-página
- Forms: Reactive forms para formulario de contacto
- HTTP: HttpClient para integración con backend (futuro)
```

#### 2. **Diseño & Estilos**
```
- SCSS con arquitectura 7-1 (base, components, layout, pages, themes, abstracts, vendors)
- Sistema de diseño basado en tokens
- Mobile-first responsive design
- Flexbox y CSS Grid
- Animaciones con CSS (no librerías pesadas)
```

#### 3. **Performance**
```
- Lazy loading de imágenes
- Intersection Observer para animaciones en scroll
- OnPush change detection
- Optimización de bundle (tree shaking)
- Preload de assets críticos
```

#### 4. **Accesibilidad (WCAG 2.1 AA)**
```
- Navegación por teclado
- Screen reader friendly
- Contraste de colores adecuado
- Alt texts descriptivos
- Focus states visibles
```

### Skills de Contenido

#### 1. **Copywriting**
```
- Storytelling emocional pero profesional
- SEO-friendly (keywords: camarón ecuatoriano, camarón premium, El Oro)
- Microcopy persuasivo
- Tono de marca consistente
```

#### 2. **Fotografía/Imágenes**
```
Necesarias:
- Hero: Camarones frescos en primer plano (alta calidad)
- Founders: Pareja fundadora (ya existe en PDF)
- Legacy: Padre/fundador original (ya existe en PDF)
- Process: Larvas, piscinas, empaque (solicitar a partners)
- Product: Camarones empacados, platos preparados
- Lifestyle: Familias disfrutando, chefs cocinando
```

#### 3. **Video (Opcional pero Recomendado)**
```
- Hero background: Olas del océano, piscinas camaroneras (loop 10-15s)
- Testimonial video: Cliente/chef hablando (30-60s)
- Proceso: Tour por granja (1-2 min)
```

---

## 🚀 Roadmap de Implementación

### **Fase 1: Setup & Foundation (Semana 1)**

#### Sprint 1.1: Configuración Inicial
```bash
# Crear proyecto Angular
ng new marea-alta-landing --routing --style=scss

# Instalar dependencias
npm install @angular/animations
npm install swiper (para carrusel de testimonios, si aplica)

# Configurar linter y formatter
npm install --save-dev eslint prettier
```

**Entregables:**
- [x] Proyecto Angular inicializado
- [x] Sistema de diseño en SCSS (_variables, _mixins, _typography)
- [x] Estructura de carpetas completa
- [x] README con instrucciones de desarrollo

#### Sprint 1.2: Componentes Compartidos
```typescript
// Crear componentes base
ng generate component shared/components/navbar
ng generate component shared/components/footer
ng generate component shared/components/cta-button
ng generate component shared/components/section-title

// Crear directivas
ng generate directive shared/directives/scroll-reveal

// Crear servicios
ng generate service core/services/scroll-animation
```

**Entregables:**
- [x] Navbar responsive con menú hamburguesa
- [x] Footer con links, redes sociales, contacto
- [x] Componente de botón reutilizable
- [x] Directiva de animación al scroll

---

### **Fase 2: Secciones Core (Semana 2-3)**

#### Sprint 2.1: Hero + Story Origin
```bash
ng generate component features/landing/components/hero-section
ng generate component features/landing/components/story-origin
```

**Checklist Hero:**
- [ ] Layout responsive (imagen + contenido)
- [ ] Animación de fade-in al cargar
- [ ] Botones CTA funcionales
- [ ] Scroll indicator animado
- [ ] Video de fondo (opcional)

**Checklist Story Origin:**
- [ ] Layout dos columnas (desktop) / stacked (mobile)
- [ ] Foto de founders integrada
- [ ] Quote destacada con estilo especial
- [ ] Animación parallax suave

**Testing:**
- [ ] Verificar en Chrome, Firefox, Safari
- [ ] Responsive: 320px, 768px, 1024px, 1440px
- [ ] Lighthouse score >90 en Performance

#### Sprint 2.2: Legacy Timeline + Traceability
```bash
ng generate component features/landing/components/legacy-timeline
ng generate component features/landing/components/traceability-flow
```

**Checklist Timeline:**
- [ ] 4 eventos renderizados correctamente
- [ ] Iconos personalizados (no Font Awesome genérico)
- [ ] Animación de revelado al scroll
- [ ] Foto del padre integrada
- [ ] Responsive: vertical en mobile, horizontal en desktop

**Checklist Traceability:**
- [ ] 3 cards interactivas (Genética, Cultivo, Empaque)
- [ ] Hover/click para expandir detalles
- [ ] Flechas conectoras animadas
- [ ] Badges de partners
- [ ] Imágenes de cada etapa

**Testing:**
- [ ] Interacciones funcionan en touch y mouse
- [ ] Animaciones suaves (60fps)
- [ ] Contenido legible en todos los tamaños

---

### **Fase 3: Conversión & Social Proof (Semana 4)**

#### Sprint 3.1: Values Grid + Testimonials
```bash
ng generate component features/landing/components/values-grid
ng generate component features/landing/components/testimonials
```

**Checklist Values:**
- [ ] Grid 2x2 responsive
- [ ] Iconos custom (SVG)
- [ ] Hover effects
- [ ] Contenido alineado verticalmente

**Checklist Testimonials:**
- [ ] Carrusel funcional (manual o auto-play)
- [ ] Estrellas de rating
- [ ] Navegación (prev/next)
- [ ] Al menos 3 testimonios (placeholder si es necesario)

#### Sprint 3.2: Final CTA + Integración
```bash
ng generate component features/landing/components/final-cta
```

**Checklist CTA:**
- [ ] Formulario reactivo con validación
- [ ] Integración con backend (o EmailJS temporal)
- [ ] Estados: loading, success, error
- [ ] Opción de WhatsApp directo
- [ ] Google reCAPTCHA (anti-spam)

**Integración Full Page:**
- [ ] Todas las secciones en orden correcto
- [ ] Scroll suave entre secciones
- [ ] Navbar sticky funcional
- [ ] Footer al final

---

### **Fase 4: Polish & Launch (Semana 5)**

#### Sprint 4.1: Optimización
```
Performance:
- [ ] Imágenes optimizadas (WebP + fallback)
- [ ] Lazy loading implementado
- [ ] Bundle size < 500KB inicial
- [ ] Critical CSS inlined

SEO:
- [ ] Meta tags completos
- [ ] Schema.org markup (LocalBusiness, Product)
- [ ] Open Graph tags
- [ ] Sitemap.xml
- [ ] robots.txt

Accesibilidad:
- [ ] Navegación por teclado completa
- [ ] Alt texts en todas las imágenes
- [ ] Contraste WCAG AA
- [ ] Focus states visibles
- [ ] Screen reader testing
```

#### Sprint 4.2: Testing & QA
```
Cross-browser:
- [ ] Chrome (Windows, Mac, Android)
- [ ] Firefox (Windows, Mac)
- [ ] Safari (Mac, iOS)
- [ ] Edge (Windows)

Devices:
- [ ] iPhone SE (320px)
- [ ] iPhone 12/13 (390px)
- [ ] iPad (768px)
- [ ] Desktop 1920px

Tools:
- [ ] Lighthouse (>90 todas las métricas)
- [ ] WAVE (0 errores de accesibilidad)
- [ ] GTmetrix (grado A)
- [ ] PageSpeed Insights (>90)
```

#### Sprint 4.3: Deployment
```bash
# Build de producción
ng build --configuration production

# Analizar bundle
npm install --save-dev webpack-bundle-analyzer
ng build --stats-json
webpack-bundle-analyzer dist/marea-alta-landing/stats.json

# Deploy (opciones)
# - Netlify (recomendado para JAMstack)
# - Vercel
# - AWS S3 + CloudFront
# - Firebase Hosting
```

**Pre-launch Checklist:**
- [ ] Analytics instalado (Google Analytics 4)
- [ ] Formulario conectado a backend/email
- [ ] WhatsApp link con mensaje predefinido
- [ ] Favicon y app icons
- [ ] 404 page personalizada
- [ ] Privacy policy y términos (si aplica)

---

## 📊 Métricas de Éxito

### KPIs Técnicos
```
Performance:
- Lighthouse Performance Score: >90
- First Contentful Paint: <1.5s
- Largest Contentful Paint: <2.5s
- Cumulative Layout Shift: <0.1
- Time to Interactive: <3.5s

SEO:
- Lighthouse SEO Score: 100
- Mobile-friendly test: Pass
- Indexación en Google: Dentro de 48h

Accesibilidad:
- Lighthouse Accessibility Score: 100
- WAVE errors: 0
- Keyboard navigation: Completa
```

### KPIs de Negocio (Post-Launch)
```
Tráfico:
- Visitantes únicos/mes: Meta inicial 1,000
- Bounce rate: <60%
- Tiempo promedio en página: >2min

Conversión:
- Formulario de contacto: >5% de visitantes
- Click en WhatsApp: >8% de visitantes
- Scroll depth 100%: >40% de visitantes

Engagement:
- Compartidos en redes: Trackear con UTM
- Video views (si hay): >60% completion rate
```

---

## 🔗 Recursos y Referencias

### Assets Necesarios
```
Imágenes (Alta resolución):
- [ ] Logo Marea Alta (SVG + PNG)
- [ ] Foto pareja fundadora (min 1200x800px)
- [ ] Foto padre/fundador original (min 800x600px)
- [ ] Fotos de proceso (larvas, piscinas, empaque) - 3x min 1000x667px
- [ ] Fotos de producto (camarones) - 5x min 1200x800px
- [ ] Fotos lifestyle (opcional) - 3x min 1200x800px

Logos de Partners:
- [ ] Grupo Lardelce logo
- [ ] Coinmarpez S.A. logo
- [ ] Granja Rossana Aurelia logo (si existe)

Iconos:
- [ ] Set de iconos custom (DNA, pond, package, family, flag, star, etc.)
- Herramienta recomendada: Figma con plugin Iconify
```

### Herramientas de Desarrollo
```
Design:
- Figma (diseño UI/UX)
- Adobe Photoshop/Lightroom (edición de fotos)
- Squoosh (optimización de imágenes)

Development:
- VS Code + extensiones Angular
- Angular DevTools (Chrome extension)
- Git + GitHub/GitLab

Testing:
- BrowserStack (cross-browser testing)
- Lighthouse (Chrome DevTools)
- WAVE (accessibility checker)
- GTmetrix (performance)
```

### Documentación de Referencia
```
Angular:
- https://angular.io/docs
- https://angular.io/guide/styleguide

Accesibilidad:
- https://www.w3.org/WAI/WCAG21/quickref/
- https://webaim.org/resources/contrastchecker/

Performance:
- https://web.dev/vitals/
- https://web.dev/fast/

SEO:
- https://developers.google.com/search/docs
- https://schema.org/LocalBusiness
```

---

## 🎓 Guía de Estilo de Código

### TypeScript
```typescript
// ✅ Buenas prácticas
export class HeroSectionComponent implements OnInit {
  // Propiedades públicas primero
  @Input() title: string = '';
  @Output() ctaClick = new EventEmitter<void>();
  
  // Propiedades privadas después
  private subscriptions = new Subscription();
  
  constructor(
    private scrollService: ScrollAnimationService
  ) {}
  
  ngOnInit(): void {
    this.initAnimations();
  }
  
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  
  // Métodos públicos
  handleCtaClick(): void {
    this.ctaClick.emit();
  }
  
  // Métodos privados
  private initAnimations(): void {
    // ...
  }
}

// ❌ Evitar
export class BadComponent {
  public myVar; // Sin tipo
  constructor() {
    console.log('Debug'); // Console logs en producción
  }
  doStuff() { // Nombre poco descriptivo
    // Lógica compleja sin comentarios
  }
}
```

### HTML Templates
```html
<!-- ✅ Semántico y accesible -->
<section class="hero-section" role="region" aria-labelledby="hero-title">
  <h1 id="hero-title" class="hero-title">{{ title }}</h1>
  <p class="hero-subtitle">{{ subtitle }}</p>
  <button 
    type="button"
    class="cta-primary"
    (click)="handleCtaClick()"
    aria-label="Conoce nuestra historia completa"
  >
    {{ ctaText }}
  </button>
</section>

<!-- ❌ Evitar -->
<div class="hero">
  <div class="title">{{ title }}</div>
  <div onclick="doStuff()">Click me</div>
</div>
```

### SCSS
```scss
// ✅ BEM + Variables del design system
.hero-section {
  background: $marea-azul-profundo;
  padding: $spacing-3xl 0;
  
  &__content {
    max-width: 600px;
  }
  
  &__title {
    @include heading-1;
    color: $marea-blanco;
    margin-bottom: $spacing-md;
  }
  
  &--inverted {
    background: $marea-blanco;
    
    .hero-section__title {
      color: $marea-azul-profundo;
    }
  }
  
  @media (max-width: 768px) {
    padding: $spacing-2xl 0;
  }
}

// ❌ Evitar
.hero {
  background: #0A2647; // Color hardcodeado
  padding: 64px 0; // Valor hardcodeado
  
  .title { // Anidación sin BEM
    color: white;
    font-size: 48px;
  }
}
```

---

## 🤝 Contribución y Colaboración

### Git Workflow
```bash
# Branches
main          # Producción
develop       # Desarrollo
feature/*     # Nuevas características
fix/*         # Bug fixes
hotfix/*      # Fixes urgentes en producción

# Naming conventions
feature/hero-section-component
fix/timeline-mobile-layout
hotfix/contact-form-validation

# Commits (Conventional Commits)
feat: add hero section component
fix: correct timeline spacing on mobile
docs: update README with deployment steps
style: format code with Prettier
refactor: simplify traceability card logic
test: add unit tests for contact form
```

### Code Review Checklist
```
Funcionalidad:
- [ ] El código hace lo que se supone que debe hacer
- [ ] No hay bugs evidentes
- [ ] Edge cases considerados

Calidad:
- [ ] Código legible y bien estructurado
- [ ] Nombres descriptivos
- [ ] Comentarios donde sea necesario (no obvios)
- [ ] Sin código duplicado

Performance:
- [ ] No hay loops innecesarios
- [ ] Imágenes optimizadas
- [ ] Change detection optimizada

Estándares:
- [ ] Sigue guía de estilo del proyecto
- [ ] Tipado correcto
- [ ] Accesibilidad considerada
```

---

## 📞 Contactos y Recursos

### Stakeholders del Proyecto
```
Cliente: Marea Alta
Contacto principal: [Nombre fundador]
Email: [email]
WhatsApp: [número]

Diseñador: [Si aplica]
Desarrollador: [Tu nombre/equipo]
SEO Specialist: [Si aplica]
```

### Assets y Accesos
```
Repositorio Git: [URL]
Figma Design: [URL]
Google Drive (imágenes): [URL]
Staging URL: [URL]
Production URL: mareaalta.com.ec (ejemplo)
Analytics: [Acceso GA4]
```

---

## ✅ Checklist Final de Entrega

### Pre-Producción
- [ ] Todos los componentes implementados y testeados
- [ ] Contenido final revisado (copy, imágenes)
- [ ] Performance optimizada (Lighthouse >90)
- [ ] SEO completo (meta tags, schema, sitemap)
- [ ] Accesibilidad verificada (WCAG AA)
- [ ] Cross-browser testing completo
- [ ] Mobile responsive verificado
- [ ] Formulario de contacto funcional
- [ ] Analytics instalado y testeado
- [ ] Errores de consola: 0

### Documentación
- [ ] README actualizado con instrucciones
- [ ] Comentarios en código complejo
- [ ] Variables de entorno documentadas
- [ ] Guía de deployment
- [ ] Handoff al cliente (si aplica)

### Post-Launch
- [ ] Monitoring configurado (uptime, errors)
- [ ] Backups automatizados
- [ ] Plan de mantenimiento acordado
- [ ] Training al cliente (CMS si aplica)
- [ ] Primeros datos de analytics revisados

---

## 🚨 Troubleshooting Común

### Problema: Animaciones laggy en mobile
```scss
// Solución: Usar will-change con moderación
.animated-element {
  will-change: transform, opacity;
  
  &:hover {
    transform: translateY(-4px);
  }
}

// O usar transform3d para forzar GPU
.animated-element {
  transform: translate3d(0, 0, 0);
}
```

### Problema: Imágenes grandes afectan performance
```typescript
// Solución: Lazy loading + srcset
<img 
  loading="lazy"
  [src]="image.src"
  [srcset]="image.srcset"
  [alt]="image.alt"
/>

// En TypeScript
export interface ResponsiveImage {
  src: string;
  srcset: string;
  alt: string;
}
```

### Problema: Formulario no envía en algunos navegadores
```typescript
// Solución: Validar y prevenir default correctamente
handleSubmit(event: Event): void {
  event.preventDefault();
  
  if (this.contactForm.valid) {
    this.submitForm();
  } else {
    this.markFormAsTouched();
  }
}

private markFormAsTouched(): void {
  Object.keys(this.contactForm.controls).forEach(key => {
    this.contactForm.get(key)?.markAsTouched();
  });
}
```

---

## 📚 Glosario de Términos

**Semiextensivo**: Método de cultivo de camarón con densidad media, que permite crecimiento natural sin hacinamiento.

**Aguaje**: Marea alta extraordinaria causada por la alineación del sol y la luna.

**Co-packing**: Proceso de empaque realizado por terceros bajo contrato.

**Trazabilidad**: Capacidad de seguir el rastro de un producto desde su origen hasta el consumidor final.

**Larva PL** (Post-Larva): Estadio de desarrollo del camarón listo para siembra en piscinas.

**CTA** (Call To Action): Elemento que invita al usuario a realizar una acción específica.

**Above the fold**: Contenido visible sin hacer scroll.

**Parallax**: Efecto visual donde elementos se mueven a diferentes velocidades al hacer scroll.

---

## 🎯 Próximos Pasos Sugeridos

### Inmediato (Este Sprint)
1. ✅ Revisar este documento completo
2. [ ] Configurar proyecto Angular
3. [ ] Implementar sistema de diseño en SCSS
4. [ ] Crear componentes compartidos (navbar, footer)
5. [ ] Solicitar assets al cliente (imágenes de alta calidad)

### Corto Plazo (1-2 Semanas)
1. [ ] Implementar Hero + Story Origin sections
2. [ ] Implementar Legacy Timeline
3. [ ] Implementar Traceability Flow
4. [ ] Primera ronda de testing responsive

### Mediano Plazo (3-4 Semanas)
1. [ ] Implementar Values + Testimonials
2. [ ] Implementar Final CTA con formulario
3. [ ] Optimización de performance
4. [ ] Testing completo cross-browser
5. [ ] Deploy a staging

### Largo Plazo (Post-Launch)
1. [ ] Analizar métricas de uso
2. [ ] A/B testing de CTAs
3. [ ] Agregar más contenido (blog, recetas)
4. [ ] Integrar e-commerce (si aplica)
5. [ ] Expansión a inglés (mercado exportación)

---

**Versión del documento**: 1.0  
**Última actualización**: 2025-04-15  
**Autor**: Plan generado para Marea Alta Landing Page  
**Framework**: Angular 17+  
**Propósito**: Guía maestra para agentes IA y desarrolladores

---

## 💡 Tips Finales para el Desarrollo

### Para Claude Code / Cursor
```
Al generar código:
1. SIEMPRE lee este documento completo antes de empezar
2. Usa las interfaces y tipos definidos aquí
3. Respeta el sistema de diseño (colores, spacing, tipografía)
4. Sigue los ejemplos de código proporcionados
5. Si tienes dudas sobre el copy, usa los textos de la sección "Contenido y Copy"
6. Prioriza accesibilidad y performance en cada decisión

Al hacer cambios:
1. Verifica que no rompe el diseño responsive
2. Comprueba que las animaciones siguen siendo suaves
3. Valida que el formulario sigue funcionando
4. Asegúrate de que los colores vienen de variables SCSS
5. Confirma que los alt texts son descriptivos
```

### Para Desarrolladores Humanos
```
Este documento es tu fuente de verdad. Si algo no está claro:
1. Revisa la sección correspondiente en detalle
2. Mira los ejemplos de código
3. Consulta las referencias externas
4. Pregunta al cliente solo si es decisión de negocio

Para mantener calidad:
1. Haz commits pequeños y frecuentes
2. Testea en mobile ANTES de pasar a desktop
3. Usa Lighthouse en cada feature nueva
4. Pide code review para cambios importantes
5. Documenta decisiones técnicas importantes en comentarios
```

---

**¡Éxito con el proyecto! 🌊🦐**
