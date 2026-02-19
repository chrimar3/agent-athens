// Configuration types
export interface ScrapeConfig {
  version: string;
  email_ingestion?: EmailIngestionConfig;
  sources: Source[];
}

export interface EmailIngestionConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  command: string[];
  timeout_ms: number;
  retry_count: number;
  priority: number;
}

export interface Source {
  id: string;
  name: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  scraper: ScraperConfig;
  parser: ParserConfig;
  importer: ImporterConfig;
  rate_limit_ms: number;
  priority: number;
}

export interface ScraperConfig {
  type: 'python' | 'node';
  command: string[];
  timeout_ms: number;
  retry_count: number;
}

export interface ParserConfig {
  type: 'python' | 'node';
  categories?: string[];
  script: string;
  input_pattern: string;
}

export interface ImporterConfig {
  type: 'bun' | 'node';
  script: string;
}

// State types
export interface ScrapeState {
  version: string;
  last_updated: string;
  email_ingestion?: SourceState;
  sources: Record<string, SourceState>;
}

export interface SourceState {
  last_scraped: string | null;
  last_success: string | null;
  last_failure: string | null;
  scrape_count: number;
  failure_count: number;
  events_imported: number;
  last_error?: string;
}

// Result types
export interface ScrapeResult {
  source_id: string;
  success: boolean;
  timestamp: string;
  events_imported?: number;
  error?: string;
  duration_ms?: number;
}

export interface OrchestrationResult {
  total_sources: number;
  scraped_sources: number;
  skipped_sources: number;
  successful_sources: number;
  failed_sources: number;
  total_events_imported: number;
  duration_ms: number;
  results: ScrapeResult[];
}
