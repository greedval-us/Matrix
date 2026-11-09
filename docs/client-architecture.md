# Matrix client architecture

## Boundaries

The renderer calls narrow APIs exposed by the Electron preload. Components do not own gRPC clients or persisted collections. IPC handlers translate requests; main-process services own transport, filesystem and persistence.

Shared policies contain plain data and functions only. Server defaults and numeric bounds are in `src/shared/constants/serverConfig.js`; search field definitions are in `src/shared/constants/searchItems.js`. Lucide icons live in the renderer. IPC channel names and bridge payload shapes are shared by preload and handlers.

Main-process `grpcConnection` helpers share channel options and API-key metadata between search and records. Their transport lifetimes stay separate: search reuses connections, while records opens a transport per operation. `GrpcRecordsRepository` orchestrates those operations; `recordsProtocol` validates/maps responses, `recordsErrors` translates failures, and `recordsFileTransfer` handles upload/download streams. `recordsTransferPolicy` names the file, batch, chunk and timeout limits used by validation and streaming.

The preload is built as a CommonJS bundle using the existing Vite dependency. Electron loads `build/main/preload.cjs` with context isolation and sandboxing enabled. Build the preload before launching Electron; the package scripts do this automatically.

## State and workflows

Pinia stores own persisted and shared reactive collections. Notes, tasks and history services only adapt persistence calls. Collection actions use a pending counter and `finally`, so loading remains accurate during concurrent operations and errors. Temporary server pages can live in a route-scoped composable: the records page keeps its request state in `useRecordsTable`, with lifecycle and concurrency rules in the testable `recordsWorkflow`.

`recordsWorkflow` composes a list workflow, attachment actions and record CRUD actions. The list workflow owns request versions, debounce and pagination. All actions share `recordsOperationContext` for page lifetime and row/file locks, so editing and attachment transfers cannot independently modify the same row. Disposal invalidates every action, and confirmed CRUD mutations invalidate older list replies before refreshing.

Search sessions are owned by a renderer and tab. Pending connections are registered before awaiting readiness and are invalidated when cancelled, replaced, reset or destroyed. gRPC streams finalize once, release their active call and preserve the original failure when cleanup also fails.

Normal and batch search share session lifecycle and field/query policies. Batch execution preserves raw nonempty input rows and duplicates; cancellation is checked between asynchronous stages. Export format descriptors supply extensions and exporter keys explicitly.

Settings, status polling and result actions are composables. Result cards and suggestions communicate through props and events. Status polling stops on unmount and ignores late replies. Saving a result uses the notes store so persistence and the visible collection stay consistent.

Per-tab report jobs live in `reportTabWorkflow`, separately from ordinary search orchestration. The search UI store supplies reactive state, tab/query access and report service adapters. The workflow owns collection, cancellation, saving and stale-result guards; clearing a tab invalidates both collection callbacks and pending save notifications without coupling the workflow to Vue.

Result cards and file exports omit fields whose values are null, undefined, empty strings or whitespace-only strings. Zero and false remain visible. Original result values and record counts are preserved.

The catalogue store retains the complete source list and applies filtering, sorting and totals before selecting a page. The table renders at most 50 sources at once. Page navigation preserves access to every source and resets the table scroll position; changing a filter or sort starts from the first page, and refreshing clamps the current page when the list shrinks.

## Export

Shared builders construct TXT, CSV, XLSX workbooks and PDF definitions. Existing browser exporters download their output; filesystem exporters return text or bytes. FileService owns dialogs, reading and writing, including binary detection. Format builders do not choose folders or call IPC.

Exports use the same nonempty-field policy as result cards. CSV and XLSX retain columns populated in any record, keeping empty cells where needed for row alignment. Sources with no populated record fields retain the existing no-data message. DOCX starts with a table of all found searchable values grouped by field, followed by a table of complete record bundles for each concrete database. Identical bundles found in several databases have a row for each database; shared names or identifiers do not merge different records. Actual server aggregates remain explicitly separate rows in the second table with their known or missing database provenance. A brief explanation appears when collection is incomplete; technical history and a duplicate full-record appendix are omitted. The collected report retains its complete records and provenance internally.

To add a field, update its shared descriptor and renderer icon mapping, then check query-contract and field-validation tests. Changing protobuf fields requires coordination with the server. To add an export format, provide its descriptor and browser/filesystem adapters and add content/IO tests. To add persisted data, define the main storage API and narrow preload methods, then place the reactive collection in a store.

## Offline validation

`npm test` exercises the client using fake gRPC, Electron and storage APIs. `npm run test:ui` compiles and renders the extracted result components, including pagination, escaped values and errors. `npm run test:preload` builds the preload and checks its sandbox-compatible bundle and IPC payloads using a fake Electron module. `npm run build:client` builds renderer and preload without packaging or contacting the backend.

`npm run dev` launches Vite and Electron with a watched preload build. `npm start` builds local assets and loads them directly. `npm run client:check` contacts the configured server and is a separate integration check.

No dependency or protobuf version migration is part of this refactoring. Real server integration and packaged installers require their respective environments.

The records page and row attachments use a separate prepared repository; see [records-client.md](records-client.md) for DTOs and the future server adapter boundary. No existing search/catalogue RPC is used to simulate this API.

Search reports use a pure identifier traversal workflow, an isolated session adapter and a separate DOCX builder. See [search-reports.md](search-reports.md) for the collection policy, duplicate handling, batch behavior and current server coverage limitations.
