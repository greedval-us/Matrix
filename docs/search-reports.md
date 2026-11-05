# Search reports (DOCX)

## Using the feature

In ordinary search, enter at least one exact identifier and choose **Собрать отчёт**. Collection has its own progress and cancellation controls. **Сохранить DOCX** opens the native save dialog; cancelling the dialog does not discard the collected report. The ordinary search results remain available independently.

In batch search, choose **Сбор отчётов**, select the identifier type and enter or import one value per line. Select a folder to create one Word document per distinct valid seed. Equivalent formatting is normalized before duplicate seeds are removed. Invalid values are counted and skipped. Stopping collection saves the current partial report if records or server aggregates have already arrived, then prevents the next seed from starting.

Reports use DOCX only. The document includes a summary of unique values, identifiers, complete records, source metadata, server aggregates, query history and collection limitations. Different values and records are retained separately. Matching an identifier establishes a search relationship; it does not establish that every returned record describes the same person.

## Collection policy

Each exact seed field starts an independent global search. Identifiers returned in explicitly supported fields or server search suggestions enter a queue. A normalized field/value pair is searched once per report, so cycles terminate. FIO and birth date are never used to extend collection; their returned values are retained in the document. Wildcards are rejected, and arbitrary free text is not scanned for identifier-shaped numbers.

Exact duplicate records are compared by their sorted field/value contents, excluding technical `id` fields. Their sources, query references and original technical identifiers are retained. Records that differ in any other value remain separate. Summary values are deduplicated within each field, retaining source references.

`ObjectGrouped` responses are preserved as separate server aggregates. Identical groups are deduplicated with query references; counts are not summed across queries. Different counts remain separate groups. Aggregates do not trigger identifier searches. The current proto supplies no source for aggregates, and the document says so explicitly.

Default client limits are 100 queries and 10,000 unique records per report. Each RPC requests the existing server maximum of 10,000 results. Reaching a collection limit, cancellation, failed queries, inconsistent or missing server counters, truncated results or partial shard coverage marks the report as incomplete and records the reason.

The existing `StreamSearch` RPC determines which indexes are searched on the server. It has no per-index selector, offset or continuation token. The client therefore collects from all sources returned by that global search, but cannot force a separate traversal of every catalog index or recover a truncated page. Source counts represent sources in the received data, not proof of complete catalog coverage.

## Responsibilities and extension points

- `src/shared/constants/reportPolicy.js` owns excluded fields, supported identifier aliases and named collection limits.
- `src/shared/utils/reportIdentifiers.js` normalizes and validates exact identifiers using shared search descriptors.
- `src/renderer/services/report/collectReport.js` is a pure collection workflow with injected search, cancellation and progress callbacks. It owns the queue, deduplication, provenance and completeness checks.
- `ReportService.js` owns an isolated transport session and its cleanup. It requests the supported result limit and provides native DOCX saving through the existing file bridge.
- `batchReportRunner.js` owns sequencing and per-seed output; stores own reactive state, tab lifetime and user feedback.
- `reportExport.js` builds a self-contained Word package from the report DTO. It has no dialogs, transport or filesystem access. It uses the existing ZIP implementation shipped with `xlsx`.
- `ReportPanel.vue` and `ReportSummary.vue` present progress and a bounded preview. Full records are exported to DOCX rather than rendering an unbounded result tree.

To support another returned identifier key, add its alias in `reportPolicy.js` and verify normalization against the corresponding shared search descriptor. Supporting a new query field also requires a coordinated protobuf/server contract change. Future pagination or explicit index selection belongs in the transport adapter; the collection workflow should continue to receive query chunks and confirmed completion metadata.

## Offline verification

Unit tests cover linked searches, cycles, exclusions, deduplication, provenance, aggregates, limits, cancellation during connection/streaming, tab lifetime, batch sequencing, file failures and DOCX structure/content. `npm run test:ui` checks SSR output and escaping. `npm run test:visual` uses the real sandboxed preload and a fake local backend to check both modes, DOCX writes, partial results, stop/save cancellation, light/dark appearance and minimum window size. No real server is contacted by these checks.
