# Records page: prepared client

The `/records` route displays dynamic columns and a fixed attachment column. It preserves the Matrix logo, green accent and current light/dark themes. Production uses `UnavailableRecordsRepository`: the page explains that its server API is not connected. Test data exists only in tests and the visual harness.

## Responsibilities

- Presentation components in `src/renderer/components/records/` receive props and emit user actions.
- `useRecordsTable` owns route-scoped reactive state. `recordsWorkflow` handles debounced searches, paging, stale responses and confirmed file mutations.
- The renderer `RecordsService` validates DTOs and calls the narrow `window.recordsAPI` bridge.
- `RecordsHandler` checks the caller and dispatches IPC. The main `RecordsService` validates requests, opens native dialogs and streams downloads to disk.
- A main-process repository adapts the future authenticated server API. No renderer filesystem paths or direct database access are exposed.

## Internal client DTOs

These shapes describe the client boundary, not an agreed remote HTTP/gRPC contract.

```js
// getCapabilities()
{
  available: true,
  list: true,
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
uploadFiles({ rowId }) // -> { cancelled: true, files: [] } or { cancelled: false, files: [metadata] }
downloadFile({ rowId, fileId }) // -> { cancelled: true, saved: false } or { cancelled: false, saved: true }
removeFile({ rowId, fileId }) // -> { removed: true } after confirmed removal
```

Cancellation is a normal outcome and does not show a success message. A failed deletion leaves the file visible and keeps the confirmation dialog open. Pending operations prevent duplicate actions on that row. Searches ignore late responses from previous requests; leaving the page also invalidates outstanding UI updates. Confirmed upload/removal is reflected locally even if the subsequent list refresh fails.

## Connecting the server later

Implement the interface shown in `src/main/services/records/UnavailableRecordsRepository.js`, then inject that repository into the main `RecordsService` in `IPCManager`.

- `getCapabilities` returns only operations supported for the current user/session.
- `list` translates the client request and normalizes the server response to the DTO above.
- `uploadFiles({ rowId, files })` receives main-only `{ path, name, size }` objects after native selection; stream files through the future transport and return `{ files: [confirmedMetadata] }`. Choose permissions, size limits and atomic/partial batch behavior when the server contract is agreed.
- `downloadFile({ rowId, fileId })` returns `{ name, stream }`, where `stream` is a readable stream or async iterable of byte chunks. The service asks for a destination and writes a unique temporary file, then renames it after transfer succeeds. Cancellation/errors close the source and clean up the owned temporary file.
- `removeFile({ rowId, fileId })` resolves only after server-confirmed deletion. The main service converts that success to `{ removed: true }`.

Authentication, authorization, remote deadlines/cancellation, error mapping and any upload limits belong to this adapter/server boundary. Existing search and catalogue protobuf services have no row-file API and are unchanged.

## Offline checks

`npm test` covers DTO validation, request races, pagination, dialog cancellation, attachment outcomes and main filesystem/IPC behavior. `npm run test:ui` checks rendering and escaping. `npm run test:visual` uses a real Electron window with an isolated fixture bridge, including whole-dataset search/sorting, attachments, empty/offline states and screenshots. It makes no backend requests.
