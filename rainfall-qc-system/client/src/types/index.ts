export interface Station {
  name: string;
  longitude?: number;
  latitude?: number;
  elevation?: number;
  obs_type?: "auto" | "manual";
  region?: string;
}

export interface RegionInfo {
  name: string;
  station_count: number;
  stations: Station[];
  file_count: number;
  file_counts: Record<string, number>;
}

export interface RegionFileItem {
  name: string;
  path: string;
  size: number;
  month?: number | null;
  station_name?: string | null;
}

export interface RegionFileCategory {
  key: string;
  label: string;
  files: RegionFileItem[];
}

export interface RegionDetail {
  name: string;
  stations: Station[];
  categories: RegionFileCategory[];
}

export interface StationDetectionStats {
  total: number;
  Severe: number;
  Warning: number;
  General: number;
  Info: number;
  error?: string;
}

export interface RegionDetectResult {
  region: string;
  total_flags: number;
  severe_count: number;
  warning_count: number;
  general_count: number;
  info_count: number;
  by_station: Record<string, StationDetectionStats>;
  results: DetectionResult[];
}

export interface AllDetectResult {
  total_flags: number;
  severe_count: number;
  warning_count: number;
  general_count: number;
  info_count: number;
  by_region: Record<string, StationDetectionStats>;
  by_station: Record<string, StationDetectionStats>;
  results: DetectionResult[];
}

export interface DetectionResult {
  report_id?: string;
  station_id: string;
  detector: string;
  data_type: string;
  datetime: string;
  value: number;
  expected_value: number | null;
  deviation: number | null;
  trigger_rule: string;
  flag_level: "Info" | "General" | "Warning" | "Severe";
  detail: string;
}

export interface Report {
  id: string;
  station_name: string;
  region_name?: string;
  created_at: string;
  total_flags: number;
  severe_count: number;
  warning_count: number;
  general_count: number;
  info_count: number;
}

export interface ReportBatch {
  region_name: string;
  created_at: string;
  station_count: number;
  severe_count: number;
  warning_count: number;
  general_count: number;
  info_count: number;
  total_flags: number;
  stations: Report[];
}

export interface PaginatedResponse<_T = unknown> {
  view_type: string;
  total: number;
  page: number;
  page_size: number;
}

export interface SummaryResponse extends PaginatedResponse<ReportBatch> {
  view_type: "summary";
  batches: ReportBatch[];
}

export interface DetailResponse extends PaginatedResponse<Report> {
  view_type: "detail";
  records: Report[];
}

export interface ReportSummary {
  report_id: string;
  station_name: string;
  total_flags: number;
  severe_count: number;
  warning_count: number;
  general_count: number;
  info_count: number;
  detector_stats: Record<string, Record<string, number>>;
}

export interface DetectionConfig {
  detection: Record<string, Record<string, unknown>>;
}

export interface ReportFilter {
  view_type: "summary" | "detail";
  regions?: string[];
  stations?: string[];
  start_time?: string;
  end_time?: string;
  risk_filter?: string;
  batch_detect_time?: string;
  page: number;
  page_size: number;
}
