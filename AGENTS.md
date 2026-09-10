# Guía para trabajar en este repositorio

Antes de cambiar código, identifica el área en `docs/ARCHITECTURE.md` y lee solo sus archivos y dependencias directas.

## Reglas

- Prioriza código simple, eficiente, legible e idiomático.
- Haz cambios pequeños y enfocados. No introduzcas capas, patrones o abstracciones sin una necesidad actual.
- Conserva la autoridad del servidor: permisos y reglas de partida se validan en PHP, no solo en la interfaz.
- No leas ni uses `legacy_documentation`, `database/private`, `database/res`, `storage/media` o `exports` salvo que la tarea trate expresamente sobre esos datos.
- No edites seeds o migraciones antiguas para cambiar el esquema. Añade una migración nueva y actualiza `database/schema.sql` cuando corresponda.
- No mezcles un refactor amplio con un cambio funcional.
- Formatea y valida antes de finalizar.

## Validación mínima

```bash
npm run format:check
find src public bin tests -name '*.php' -print0 | xargs -0 -n1 php -l
node --check public/assets/app.js
find public/assets/js -name '*.js' -print0 | xargs -0 -n1 node --check
composer test # requiere MariaDB inicializada
```

No escanees recursos binarios ni datasets para cambios normales de aplicación.
