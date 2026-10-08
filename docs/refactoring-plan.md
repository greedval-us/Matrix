# Client refactoring

## Goal and compatibility

Keep the current JavaScript ESM, Vue Composition API, Pinia and Electron stack. Preserve protobuf definitions, RPC payloads, TLS and API key precedence, UI behavior, query order, raw batch rows and public preload methods. Work and validation must be possible without the server.

## Responsibility boundaries

- `shared`: frontend-free field, IPC and server configuration policies.
- `main/services`: gRPC connections, session ownership, persistence and filesystem operations.
- `main/handlers`: IPC adaptation and validation; no UI state.
- `renderer/infrastructure`: access to the narrow preload APIs.
- `renderer/services`: stateless storage adapters, search session execution and export encoding.
- `renderer/stores`: the single owner of reactive application state.
- `renderer/composables`: screen workflows and lifecycle cleanup.
- `renderer/components`: presentation through props and events.

## Implementation

1. Characterize errors, cancellation and concurrency with offline regression tests.
2. Consolidate IPC channels and bundle the preload while retaining Electron sandboxing and context isolation. Protect session ownership and pending connection invalidation, fix stream finalization and temporary client cleanup.
3. Share query/field policies and search session lifecycle. Separate batch execution from Pinia state and use explicit export format descriptors.
4. Share TXT/CSV/XLSX/PDF construction between browser and filesystem exporters. Keep encoding separate from downloads and file IO.
5. Remove duplicate collections from services. Use a pending-operation counter with `finally` in stores; extract settings, status polling and result actions from views.
6. Run offline tests, renderer/preload builds and an independent review. Refresh the persistent code graph and document the resulting architecture.

## Result component contracts

`SearchResults` composes the screen and binds its tab ID to `useSearchResults`. The composable owns derived data, pagination and copy/note/search actions. `SearchResultsStatus` receives progress/error values and emits retry. `SearchSuggestions` receives suggestions and labels and emits a preload query. `SearchSourceCard` receives a grouped source, visible count and action state and emits save, copy and showMore. Children do not access stores or Electron APIs.

## Validation boundaries

No real gRPC endpoint or backend is required for unit tests and builds. Live connection, backend integration and packaged installer validation remain separate checks when those environments are available.
