# Records page: operational MySQL API

The `/records` route displays dynamic columns and a fixed attachment column. Production connects through `GrpcRecordsRepository` to `matrix.records.v1.Records` using the existing server settings. Records are stored only in the server's operational Docker MySQL `control` table; this client has no local records store or direct database access. Test data exists only in tests and the visual harness.

## Responsibilities

- Presentation components in `src/renderer/components/records/` receive props and emit user actions.
- `useRecordsTable` owns route-scoped reactive state. `recordsWorkflow` handles debounced searches, paging, stale responses and confirmed file mutations.
- The renderer `RecordsService` validates DTOs and calls the narrow `window.recordsAPI` bridge.
- `RecordsHandler` checks the caller and dispatches IPC. The main `RecordsService` validates requests, opens native dialogs and streams downloads to disk.
- The main-process `GrpcRecordsRepository` adapts the authenticated records API. No renderer filesystem paths or direct database access are exposed.

## Internal client DTOs

These shapes describe the client boundary. The adapter translates the separate protobuf contract in `src/protos/records.proto`.

```js
// getCapabilities()
{
  available: true,
  list: true,
  create: true,
  update: true,
  delete: true,
  upload: true,
  download: true,
  remove: true,
  message: ''
}

// list(request)
{
  query: 'search text',
  sort: { key: 'column-key', direction: 'asc' }, // or null
  page: 1,
  pageSize: 25 // 25, 50 or 100
}

// list response
{
  columns: [
    { key: 'column-key', label: 'Server label', type: 'text', sortable: true }
  ],
  rows: [{
    id: 'stable-row-id',
    values: { 'column-key': 'Value' },
    files: [{ id: 'stable-file-id', name: 'document.pdf', size: 1024, mimeType: 'application/pdf' }]
  }],
  total: 1
}
```

Search and sorting apply to the entire server result before pagination. `total` is the count after filtering. The adapter must preserve a deterministic order, with a stable ID as a tie breaker. Column keys, row IDs and per-row file IDs must be unique and stable. Missing values render as a dash; zero and false retain their meanings. All labels, values and filenames render as escaped text.

Explicit `columns` are preferred, especially for empty pages. If omitted, the renderer builds a union of keys from all rows in the returned page; it cannot infer fields from other pages. `sortable: false` disables sorting for that column. The client does not guess numeric/date ordering from display strings: the adapter/server owns comparison semantics. A data key named `files` remains valid because attachments are stored outside `values`.

```js
// Renderer bridge: no local paths
createRecord({ values }) // -> confirmed server row
updateRecord({ rowId, values }) // -> confirmed server row
deleteRecord({ rowId }) // -> { deleted: true }
uploadFiles({ rowId }) // -> { cancelled: true, files: [] } or { cancelled: false, files: [metadata] }
downloadFile({ rowId, fileId }) // -> { cancelled: true, saved: false } or { cancelled: false, saved: true }
removeFile({ rowId, fileId }) // -> { removed: true } after confirmed removal
```

Cancellation is a normal outcome and does not show a success message. A failed deletion leaves the file visible and keeps the confirmation dialog open. Pending operations prevent duplicate actions on that row. Searches ignore late responses from previous requests; leaving the page also invalidates outstanding UI updates. Confirmed upload/removal is reflected locally even if the subsequent list refresh fails.

## Server connection and permissions

`IPCManager` injects `GrpcRecordsRepository` into the main `RecordsService`. Every operation resolves current `ServerConnectionService` settings, creates a TLS transport with its CA and server name, and sends the existing client key as `x-api-key`. Changing settings applies to the next operation; an in-flight transfer keeps its original connection. Each transport closes after its operation, and application shutdown cancels all outstanding calls and streams.

- `getCapabilities` calls the server. Missing connection settings, an unavailable endpoint or an older server without this API return an honest unavailable state. Authentication and permission errors retain safe Russian messages.
- `list` translates query, sort and pagination to snake-case protobuf fields, converts safe integer totals and file sizes to numbers, preserves string IDs (including MySQL BIGINT values), and maps `mime_type` to `mimeType`.
- `uploadFiles({ rowId, files })` receives main-only `{ path, name, size }` objects after native selection. Before opening the transport, it checks 20 files per batch, 25 MiB per file and 100 MiB total and verifies local file sizes. One client stream sends a header per file followed by chunks of at most 64 KiB, respecting backpressure. The server publishes the batch atomically. The adapter returns only a complete, validated `{ files: [confirmedMetadata] }` response; partial confirmation is an error.
- `downloadFile({ rowId, fileId })` expects metadata as the first server frame, then returns `{ name, stream }` with bounded buffering. It verifies the file identity and actual byte count against metadata. Destroying the source, including cancellation of the native save dialog before reading bytes, cancels gRPC and closes the transport. The main service writes a unique temporary file and renames it only after transfer succeeds; cancellation/errors clean up the owned temporary file.
- `removeFile({ rowId, fileId })` resolves only after `{ deleted: true }` from the server. The main service converts that success to `{ removed: true }`.

The server enforces authorization, batch limits and row/file ownership independently. The same configured client API key authorizes listing, row create/update/delete and attachment operations; no separate administrative key is needed. The server advertises each supported action in its capabilities, and the client uses those capabilities to enable controls. The configured request timeout applies to ordinary RPCs; file RPCs have a deadline of at least 120 seconds. Leaving the Records page invalidates UI updates; it does not cancel already authorized remote mutations. Search and catalogue protobuf services are unchanged.

The supplied columns are date, ID, number, full name, birth date, initiator, executor, note, realization and intersections, followed by the fixed attachment column. The create/edit form exposes all nine data fields in the same order, with initiator immediately before executor. Initiator is optional text, limited to 255 Unicode characters. Calendar dates are ISO strings; number stays text to preserve leading zeros and plus signs. Initiator, executor, note, realization and intersections are plain text. The server-generated ID and attachment metadata cannot be edited through row values. Deleting a row requires confirmation; its attachments must be removed first.

## Offline checks

`npm test` covers DTO validation, request races, pagination, dialog cancellation, attachment outcomes and main filesystem/IPC behavior. The adapter tests use an isolated loopback gRPC server (test-only insecure credentials), plus bounded stream fixtures for backpressure and cancellation; they never contact production services or a database. `npm run test:ui` checks rendering and escaping. `npm run test:visual` uses a real Electron window with an isolated fixture bridge, including whole-dataset search/sorting, attachments, empty/offline states and screenshots. It makes no backend requests.
