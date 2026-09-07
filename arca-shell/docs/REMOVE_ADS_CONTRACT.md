# Contrato: Quitar anuncios

Implementado en el juego (`src/bridge.ts`). El shell responde en Fase 4.

## Juego → Shell

```ts
{ type: "request_remove_ads", requestId: string }
```

## Shell → Juego

```ts
{
  type: "remove_ads_result",
  requestId: string,
  status: "completed" | "cancelled" | "error"
}
```

| status | Comportamiento del juego |
|---|---|
| `completed` | Persiste `arca-ads-removed`, actualiza el botón HUD, cierra el modal |
| `cancelled` | Modal abierto, mensaje “Compra cancelada.” |
| `error` | Modal abierto, mensaje “Compra fallida.” |

Timeout 45s → `error`.

## Stub del navegador

Default: `completed` inmediato.

```js
window.arcaBridgeStub = { removeAds: "cancelled" }  // o "error" | "timeout"
```

Debug: `arcaDebug.clearAdsRemoved()` borra el flag y restaura el botón.
