import axios from "axios";
import type {
  Station,
  DetectionResult,
  Report,
  ReportSummary,
  DetectionConfig,
  RegionInfo,
  RegionDetail,
  RegionDetectResult,
  AllDetectResult,
  SummaryResponse,
  DetailResponse,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export async function fetchStations(): Promise<Station[]> {
  const { data } = await api.get("/stations");
  return data;
}

export async function createStation(body: Partial<Station>): Promise<void> {
  await api.post("/stations", body);
}

export async function updateStation(name: string, body: Partial<Station>): Promise<void> {
  await api.put(`/stations/${name}`, body);
}

export async function uploadTable(
  name: string,
  tableType: string,
  file: File
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api.post(`/stations/${name}/upload/${tableType}`, form);
}

export async function fetchRegions(): Promise<RegionInfo[]> {
  const { data } = await api.get("/regions");
  return data;
}

export async function createRegion(name: string): Promise<{ name: string }> {
  const { data } = await api.post("/regions", { name });
  return data;
}

export async function fetchRegion(name: string): Promise<RegionDetail> {
  const { data } = await api.get(`/regions/${name}`);
  return data;
}

export async function addRegionStation(
  regionName: string,
  body: Partial<Station>
): Promise<void> {
  await api.post(`/regions/${regionName}/stations`, body);
}

export async function updateRegionStation(
  regionName: string,
  stationName: string,
  body: Partial<Station>
): Promise<void> {
  await api.put(`/regions/${regionName}/stations/${stationName}`, body);
}

export async function deleteRegionStation(
  regionName: string,
  stationName: string
): Promise<void> {
  await api.delete(`/regions/${regionName}/stations/${stationName}`);
}

export async function uploadRegionFile(
  regionName: string,
  category: string,
  file: File
): Promise<void> {
  const form = new FormData();
  form.append("category", category);
  form.append("file", file);
  await api.post(`/regions/${regionName}/upload`, form);
}

export async function deleteRegionFile(
  regionName: string,
  filename: string
): Promise<void> {
  await api.delete(`/regions/${regionName}/files/${filename}`);
}

export async function deleteRegion(name: string): Promise<void> {
  await api.delete(`/regions/${name}`);
}

export async function detectRegion(name: string): Promise<RegionDetectResult> {
  const { data } = await api.post(`/regions/${name}/detect`);
  return data;
}

export async function detectAllRegions(): Promise<AllDetectResult> {
  const { data } = await api.post("/regions/detect-all");
  return data;
}

export async function fetchConfig(): Promise<DetectionConfig> {
  const { data } = await api.get("/config");
  return data;
}

export async function updateConfig(config: DetectionConfig): Promise<void> {
  await api.put("/config", config);
}

export async function runDetection(station: string): Promise<Report & { results: DetectionResult[] }> {
  const { data } = await api.post("/detect", { station });
  return data;
}

export async function fetchResults(params?: {
  report_id?: string;
  station?: string;
  flag_level?: string;
  detector?: string;
}): Promise<DetectionResult[]> {
  const { data } = await api.get("/results", { params });
  return data;
}

export async function fetchReports(params?: {
  view_type?: string;
  regions?: string;
  stations?: string;
  start_time?: string;
  end_time?: string;
  risk_filter?: string;
  batch_detect_time?: string;
  page?: number;
  page_size?: number;
}): Promise<SummaryResponse | DetailResponse> {
  const { data } = await api.get("/reports", { params });
  return data;
}

export async function fetchReportSummary(reportId: string): Promise<ReportSummary> {
  const { data } = await api.get(`/report/${reportId}/summary`);
  return data;
}

export async function fetchReportStations(): Promise<string[]> {
  const { data } = await api.get("/reports/stations");
  return data;
}

export async function fetchReportRegions(): Promise<string[]> {
  const { data } = await api.get("/reports/regions");
  return data;
}

export async function deleteSingleReport(reportId: string): Promise<void> {
  await api.delete(`/reports/${reportId}`);
}

export async function deleteReportsBatch(payload: {
  ids?: string[];
  region?: string;
  detect_time?: string;
}): Promise<{ ok: boolean; deleted: number }> {
  const { data } = await api.post("/reports/batch-delete", payload);
  return data;
}

export function getExportUrl(reportId: string): string {
  return `/api/export/${reportId}`;
}

export function getBatchDownloadUrl(region: string, detectTime: string): string {
  return `/api/reports/batch-download?region=${encodeURIComponent(region)}&detect_time=${encodeURIComponent(detectTime)}`;
}

export async function fetchBatchResults(region: string, detectTime: string): Promise<DetectionResult[]> {
  const { data } = await api.get("/reports/batch-results", {
    params: { region, detect_time: detectTime },
  });
  return data;
}

export function getReportsExportExcelUrl(filter: {
  view_type: string;
  regions?: string;
  stations?: string;
  start_time?: string;
  end_time?: string;
  risk_filter?: string;
  batch_detect_time?: string;
}): string {
  const params = new URLSearchParams();
  params.set("view_type", filter.view_type);
  if (filter.regions) params.set("regions", filter.regions);
  if (filter.stations) params.set("stations", filter.stations);
  if (filter.start_time) params.set("start_time", filter.start_time);
  if (filter.end_time) params.set("end_time", filter.end_time);
  if (filter.risk_filter) params.set("risk_filter", filter.risk_filter);
  return `/api/reports/export-excel?${params.toString()}`;
}
