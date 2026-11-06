# 🚀 AGENTS.md — Guía para Agentes de Codificación IA (Frontend Ionic/Angular + TypeScript)

> **Propósito:**  
> Este documento define las reglas operativas, estándares técnicos y estructura modular que los agentes de codificación IA deben seguir al trabajar en el repositorio frontend con Ionic + Angular.  
> El objetivo es lograr código tipado, modular, reutilizable y mantenible, adecuado para aplicaciones móviles e híbridas.

---

## 🛠️ Configuración y Validación del Entorno

```bash
npm install
npm test
npm run lint
npm run typecheck
```

> ⚠️ **Regla:** No se aceptarán cambios que produzcan errores en `typecheck`, fallos en pruebas o advertencias críticas en `lint`.

---

## 📁 Estructura Modular (Feature Modules) para Ionic + Angular

```
src/
└── app/
    ├── core/
    │   ├── services/
    │   ├── guards/
    │   ├── interceptors/
    │   └── core.module.ts
    ├── shared/
    │   ├── components/
    │   ├── directives/
    │   ├── pipes/
    │   └── shared.module.ts
    ├── features/
    │   ├── example/
    │   │   ├── example-routing.module.ts
    │   │   ├── example.module.ts
    │   │   ├── components/
    │   │   ├── services/
    │   │   ├── models/
    │   │   └── pages/
    ├── pages/
    ├── assets/
    ├── environments/
    └── app-routing.module.ts
```

---

## ✏️ Convenciones de Codificación

### Nomenclatura

| Elemento | Regla | Ejemplo |
|---------|-------|---------|
| Modelos/Interfaces | PascalCase | User, ProductModel |
| Componentes | PascalCase + sufijo | UserListComponent |
| Servicios | PascalCase / instancia camelCase | UserService / userService |
| Archivos | kebab-case | user-list.component.ts |

### Principios

- **SRP:** Cada clase o archivo debe tener una única responsabilidad.
- **DRY:** Código repetido debe extraerse a `shared/`.
- **Composición sobre herencia:** Usar inyección de dependencias.
- **Components = UI / Services = lógica**.

---

## 🏁 Objetivo

Producir código móvil‑first, modular, probado y altamente mantenible.
