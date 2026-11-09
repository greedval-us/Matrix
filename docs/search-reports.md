# Search reports (DOCX)

## Using the feature

In ordinary search, enter at least one exact identifier and choose **Собрать отчёт**. Collection has its own progress and cancellation controls. **Сохранить DOCX** opens the native save dialog; cancelling the dialog does not discard the collected report. The ordinary search results remain available independently.

Starting an ordinary search collapses the previous report so the new search status and matches are visible. **Показать собранный отчёт** reopens the retained report without collecting it again; it can still be saved. A new collection opens its report automatically. These views are independent for each search tab.

In batch search, choose **Сбор отчётов**, select the identifier type and enter or import one value per line. Select a folder to create one Word document per distinct valid seed. Equivalent formatting is normalized before duplicate seeds are removed. Invalid values are counted and skipped. Stopping collection saves the current partial report if records or server aggregates have already arrived, then prevents the next seed from starting.

Reports use DOCX only. Each document starts with the original query and creation date, followed by **Найденные поисковые значения** and **Данные по базам**. The first table, **Поле — Все найденные значения**, collects all found values for each supported search field into one row. Phone aliases and work, home or mobile roles share the phone row; email aliases share the email row. Valid identifiers use the same normalization as search, and equivalent values appear once. FIO and birth date also appear here when found, although they do not extend collection. Meaningful values that do not pass exact-search validation remain readable. Unknown fields appear in the second table.

The second table, **База данных — Связанные данные**, keeps the nonempty fields found together in a record beside the concrete database where that bundle was found. A bundle found in several databases gets one row for each database. Only exact whole-record bundles within the same database are merged; field order does not affect that comparison. A different phone, birth date, additional field or subset of fields remains a separate row, even when other values repeat. Field names are bold and each field has its own paragraph. FIO and birth date appear before phones, email and other fields. Known phone roles retain readable work, home, mobile, additional, client and counterparty labels. Different raw fields remain separate even if their readable labels match. Multi-value fields stay whole, without inferred individual pairs or combinations of records using shared identifiers. A database without a human name uses its identifier; identical human names include their identifiers for clarity. Missing provenance is shown as **База не указана**.

The database table omits record fields whose values are `null`, `undefined`, empty strings or strings containing only whitespace. Zero, `false`, structured values and nonempty duplicate-key fields remain visible without technical type annotations. Bundle comparisons retain value types, so numeric `0` and string `"0"` remain distinct. Search values remain in the database bundles as well as the first table so their associations stay visible. Observed records, server aggregates, sourced identifiers and found search suggestions can supply the first table; an unobserved seed alone cannot. Source-less suggestions do not fabricate database rows. The document has no third table, full-record appendix, collection statistics, source metadata, source record identifiers or query history. This presentation does not change the collected report DTO: full records, identifiers, metadata, counts and provenance remain available to collection and application code.

Complete reports contain no collection status boilerplate. Partial and stopped reports include a short status and unique reasons, including query failures, without query identifiers or execution metadata. A section without content uses a short message instead of an empty table. Reports with no found search values, nonempty record fields or server aggregate items show only **Данные не найдены** after the query and date. Matching an identifier establishes a search relationship; it does not establish that every returned value describes the same person.

## Collection policy

Each exact seed field starts an independent global search. Identifiers returned in explicitly supported fields or server search suggestions enter a queue. A normalized field/value pair is searched once per report, so cycles terminate. FIO and birth date are never used to extend collection; their returned values are retained in the document. Wildcards are rejected, and arbitrary free text is not scanned for identifier-shaped numbers.

Exact duplicate records are compared by their sorted field/value contents, excluding technical `id` fields. Their sources, query references and original technical identifiers are retained. Records that differ in any other value remain separate. Presentation grouping compares complete nonempty field/value bundles, retains types and repeated fields, and merges provenance only for identical bundles.

`ObjectGrouped` responses are preserved as separate server aggregates. Identical groups are deduplicated with query references; counts are not summed across queries. Different counts remain separate groups. Each aggregate item appears as an explicitly labelled **Сводные данные сервера** row in the database table, with its field, value and count. It remains separate from record bundles and does not imply person-level relationships. The current proto supplies no source for aggregates, so these rows use **База не указана**. Recognized aggregate values also appear in the first table. Aggregates do not trigger identifier searches.

Default client limits are 100 queries and 10,000 unique records per report. Each RPC requests the existing server maximum of 10,000 results. Reaching a collection limit, cancellation, failed queries, inconsistent or missing server counters, truncated results or partial shard coverage marks the report as incomplete and records the reason.

The existing `StreamSearch` RPC determines which indexes are searched on the server. It has no per-index selector, offset or continuation token. The client therefore collects from all sources returned by that global search, but cannot force a separate traversal of every catalog index or recover a truncated page. Source counts represent sources in the received data, not proof of complete catalog coverage.

## Responsibilities and extension points

- `src/shared/constants/reportPolicy.js` owns excluded fields, supported identifier aliases and named collection limits.
- `src/shared/utils/reportIdentifiers.js` normalizes and validates exact identifiers using shared search descriptors.
- `src/renderer/services/report/collectReport.js` is a pure collection workflow with injected search, cancellation and progress callbacks. It owns the queue, deduplication, provenance and completeness checks.
- `ReportService.js` owns an isolated transport session and its cleanup. It requests the supported result limit and provides native DOCX saving through the existing file bridge.
- `batchReportRunner.js` owns sequencing and per-seed output; stores own reactive state, tab lifetime and user feedback.
- `reportExport.js` builds a self-contained Word package from the report DTO. It has no dialogs, transport or filesystem access. It uses the existing ZIP implementation shipped with `xlsx`.
- `src/renderer/utils/reportRecordGroups.js` groups exact nonempty record bundles for presentation without modifying the DTO or inferring identity.
- `src/renderer/utils/reportSearchSummary.js` groups found search values by canonical field for presentation without changing collection or database associations.
- `ReportPanel.vue` and `ReportSummary.vue` present progress and a bounded preview. DOCX contains a typed value summary and database-associated bundles; the full collected DTO remains available internally rather than rendering an unbounded result tree.

To support another returned identifier key, add its alias in `reportPolicy.js` and verify normalization against the corresponding shared search descriptor. Supporting a new query field also requires a coordinated protobuf/server contract change. Future pagination or explicit index selection belongs in the transport adapter; the collection workflow should continue to receive query chunks and confirmed completion metadata.

## Offline verification

Unit tests cover linked searches, cycles, exclusions, deduplication, provenance, aggregates, limits, cancellation during connection/streaming, tab lifetime, batch sequencing, file failures and DOCX structure/content. `npm run test:ui` checks SSR output and escaping. `npm run test:visual` uses the real sandboxed preload and a fake local backend to check both modes, DOCX writes, partial results, stop/save cancellation, light/dark appearance and minimum window size. No real server is contacted by these checks.
