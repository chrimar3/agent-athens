/**
 * Scripts' import path for the URL-column write helper. The implementation
 * lives in src/db/url-columns.ts so src/ writers (src/db/database.ts,
 * src/images/image-pipeline.ts, src/ingest/email-ingestion.ts) use the same
 * code; see that file for the rules.
 */
export * from '../../src/db/url-columns';
