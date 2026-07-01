import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  message,
  Tag,
  Space,
  Flex,
  Typography,
  Select,
  DatePicker,
  Modal,
  Tabs,
  Checkbox,
  Card,
  Row,
  Col,
  Statistic,
  Input,
} from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  DeleteOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  fetchReports,
  fetchReportSummary,
  fetchResults,
  fetchReportStations,
  fetchReportRegions,
  deleteSingleReport,
  deleteReportsBatch,
  getExportUrl,
  getBatchDownloadUrl,
  getReportsExportExcelUrl,
  fetchBatchResults,
} from "../api/client";
import type {
  Report,
  ReportBatch,
  ReportSummary,
  DetectionResult,
  SummaryResponse,
  DetailResponse,
} from "../types";

const { Title } = Typography;
const { RangePicker } = DatePicker;

const FLAG_COLORS: Record<string, string> = {
  Severe: "red",
  Warning: "orange",
  General: "green",
  Info: "blue",
};

const RISK_OPTIONS = [
  { value: "", label: "全部风险" },
  { value: "severe_only", label: "仅含严重" },
  { value: "severe_warning", label: "仅含严重/警告" },
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const Y = d.getFullYear();
    const M = d.getMonth() + 1;
    const D = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${Y}/${M}/${D} ${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}

function getRowClassName(record: ReportBatch | Report) {
  if ("stations" in record) {
    const batch = record as ReportBatch;
    if (batch.total_flags === 0) return "row-no-risk";
    if (batch.severe_count > 0) return "row-severe";
    return "";
  }
  const r = record as Report;
  if (r.total_flags === 0) return "row-no-risk";
  if (r.severe_count > 0) return "row-severe";
  return "";
}

function parseBatchTime(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const iso = trimmed
    .replace(/\//g, "-")
    .replace("T", " ")
    .replace(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/, (_, y, m, d, h, min, s) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min.padStart(2, "0")}:${s.padStart(2, "0")}`
    );
  if (iso === trimmed) return null;
  return iso;
}

export default function ReportPage() {
  const [viewType, setViewType] = useState<"summary" | "detail">("summary");
  const [loading, setLoading] = useState(false);

  const [regions, setRegions] = useState<string[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<[string, string] | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [batchTimeInput, setBatchTimeInput] = useState<string>("");

  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [availableStations, setAvailableStations] = useState<string[]>([]);

  const [summaryData, setSummaryData] = useState<ReportBatch[]>([]);
  const [detailData, setDetailData] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [reportResults, setReportResults] = useState<DetectionResult[]>([]);
  const [batchResultsTitle, setBatchResultsTitle] = useState<string>("");

  useEffect(() => {
    loadFilterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ps = viewType === "summary" ? pageSize : 20;
      const batchTime = parseBatchTime(batchTimeInput);
      const data = await fetchReports({
        view_type: viewType,
        regions: regions.length > 0 ? regions.join(",") : undefined,
        stations: stations.length > 0 ? stations.join(",") : undefined,
        start_time: timeRange ? timeRange[0] : undefined,
        end_time: timeRange ? timeRange[1] : undefined,
        risk_filter: riskFilter || undefined,
        batch_detect_time: batchTime || undefined,
        page,
        page_size: ps,
      });

      if (data.view_type === "summary") {
        const sr = data as SummaryResponse;
        setSummaryData(sr.batches);
        setTotal(sr.total);
      } else {
        const dr = data as DetailResponse;
        setDetailData(dr.records);
        setTotal(dr.total);
      }
    } catch {
      message.error("数据加载失败，请稍后重试");
    }
    setLoading(false);
  }, [viewType, regions, stations, timeRange, riskFilter, batchTimeInput, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function loadFilterOptions() {
    const [rs, ss] = await Promise.all([
      fetchReportRegions(),
      fetchReportStations(),
    ]);
    setAvailableRegions(rs);
    setAvailableStations(ss);
  }

  function handleView(report: Report) {
    setLoading(true);
    setBatchResultsTitle("");
    Promise.all([
      fetchReportSummary(report.id),
      fetchResults({ report_id: report.id }),
    ])
      .then(([sum, res]) => {
        setSelectedReport(report);
        setReportSummary(sum);
        setReportResults(res);
      })
      .catch(() => message.error("加载报告详情失败"))
      .finally(() => setLoading(false));
  }

  function handleBatchClick(batch: ReportBatch) {
    setLoading(true);
    setSelectedReport(null);
    setReportSummary(null);
    setBatchResultsTitle(`${batch.region_name.replace("RegionalStation", "")} - ${formatTime(batch.created_at)}`);
    fetchBatchResults(batch.region_name, batch.created_at)
      .then((res) => {
        setReportResults(res);
      })
      .catch(() => message.error("加载批次检测结果失败"))
      .finally(() => setLoading(false));
  }

  function handleSingleDelete(report: Report) {
    Modal.confirm({
      title: "确认删除",
      content: "确认删除该站点本次检测报告？数据与文件永久删除，不可恢复。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteSingleReport(report.id);
          message.success("删除成功");
          loadData();
          loadFilterOptions();
        } catch {
          message.error("删除失败");
        }
      },
    });
  }

  function handleBatchDelete(batch: ReportBatch) {
    const count = batch.station_count;
    Modal.confirm({
      title: "批量删除确认",
      content: `当前批次共包含 ${count} 个站点检测记录，确认全部删除？删除后报告不可找回。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteReportsBatch({
            region: batch.region_name,
            detect_time: batch.created_at,
          });
          message.success("批量删除成功");
          loadData();
          loadFilterOptions();
          setSelectedRowKeys([]);
        } catch {
          message.error("批量删除失败");
        }
      },
    });
  }

  function handleGlobalBatchDelete() {
    if (selectedRowKeys.length === 0) return;
    const label = viewType === "summary" ? "批次" : "条检测记录";
    Modal.confirm({
      title: "批量删除确认",
      content: `已选中 ${selectedRowKeys.length} ${label}，确认删除？删除后检测报告文件与数据将永久清除，无法恢复。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (viewType === "detail") {
            await deleteReportsBatch({ ids: selectedRowKeys });
          } else {
            for (const key of selectedRowKeys) {
              const [region, detectTime] = key.split("||");
              await deleteReportsBatch({ region, detect_time: detectTime });
            }
          }
          message.success("删除成功");
          setSelectedRowKeys([]);
          loadData();
          loadFilterOptions();
        } catch {
          message.error("删除失败");
        }
      },
    });
  }

  function handleReset() {
    setRegions([]);
    setStations([]);
    setTimeRange(null);
    setRiskFilter("");
    setBatchTimeInput("");
    setPage(1);
  }

  function handleQuery() {
    setPage(1);
    setExpandedRowKeys([]);
    loadData();
  }

  function handleRefresh() {
    loadData();
    loadFilterOptions();
  }

  function handleTabChange(key: string) {
    setViewType(key as "summary" | "detail");
    setSelectedRowKeys([]);
    setExpandedRowKeys([]);
    setPage(1);
    if (key === "detail") {
      setPageSize(20);
    } else {
      setPageSize(10);
    }
  }

  function handleExportExcel() {
    const batchTime = parseBatchTime(batchTimeInput);
    const url = getReportsExportExcelUrl({
      view_type: viewType,
      regions: regions.length > 0 ? regions.join(",") : undefined,
      stations: stations.length > 0 ? stations.join(",") : undefined,
      start_time: timeRange ? timeRange[0] : undefined,
      end_time: timeRange ? timeRange[1] : undefined,
      risk_filter: riskFilter || undefined,
      batch_detect_time: batchTime || undefined,
    });
    window.open(url, "_blank");
  }

  const batchColumns: ColumnsType<ReportBatch> = [
    {
      title: "折叠",
      key: "expand",
      width: 50,
      render: (_: unknown, record: ReportBatch) => {
        const key = `${record.region_name}||${record.created_at}`;
        const expanded = expandedRowKeys.includes(key);
        return (
          <Button
            type="text"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (expanded) {
                setExpandedRowKeys(expandedRowKeys.filter((k) => k !== key));
              } else {
                setExpandedRowKeys([...expandedRowKeys, key]);
              }
            }}
          >
            {expanded ? "▼" : "▶"}
          </Button>
        );
      },
    },
    { title: "所属区域", dataIndex: "region_name", key: "region_name" },
    { title: "检测批次时间", dataIndex: "created_at", key: "created_at", render: formatTime },
    { title: "站点总数", dataIndex: "station_count", key: "station_count" },
    {
      title: "风险汇总",
      key: "risk_summary",
      render: (_: unknown, record: ReportBatch) => (
        <Space size={4}>
          <Tag color="red">严重 {record.severe_count}</Tag>
          <Tag color="orange">警告 {record.warning_count}</Tag>
          <Tag color="green">一般 {record.general_count}</Tag>
          <Tag color="blue">提示 {record.info_count}</Tag>
        </Space>
      ),
    },
    { title: "总问题条数", dataIndex: "total_flags", key: "total_flags" },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: ReportBatch) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleBatchClick(record);
            }}
          >
            查看结果
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              window.open(getBatchDownloadUrl(record.region_name, record.created_at), "_blank");
            }}
          >
            批量下载
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleBatchDelete(record);
            }}
          >
            批量删除
          </Button>
        </Space>
      ),
    },
  ];

  const detailColumns: ColumnsType<Report> = [
    { title: "站点", dataIndex: "station_name", key: "station_name" },
    { title: "所属区域", dataIndex: "region_name", key: "region_name", render: (v: string) => v?.replace("RegionalStation", "") || "-" },
    { title: "检测时间", dataIndex: "created_at", key: "created_at", render: formatTime },
    { title: "严重", dataIndex: "severe_count", key: "severe_count", render: (v: number) => <Tag color="red">{v}</Tag> },
    { title: "警告", dataIndex: "warning_count", key: "warning_count", render: (v: number) => <Tag color="orange">{v}</Tag> },
    { title: "一般", dataIndex: "general_count", key: "general_count", render: (v: number) => <Tag color="green">{v}</Tag> },
    { title: "提示", dataIndex: "info_count", key: "info_count", render: (v: number) => <Tag color="blue">{v}</Tag> },
    { title: "总计", dataIndex: "total_flags", key: "total_flags" },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: Report) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => window.open(getExportUrl(record.id), "_blank")}>
            下载
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleSingleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const subDetailColumns: ColumnsType<Report> = [
    { title: "站点", dataIndex: "station_name", key: "station_name" },
    { title: "所属区域", dataIndex: "region_name", key: "region_name", render: (v: string) => v?.replace("RegionalStation", "") || "-" },
    { title: "检测时间", dataIndex: "created_at", key: "created_at", render: formatTime },
    { title: "严重", dataIndex: "severe_count", key: "severe_count", render: (v: number) => <Tag color="red">{v}</Tag> },
    { title: "警告", dataIndex: "warning_count", key: "warning_count", render: (v: number) => <Tag color="orange">{v}</Tag> },
    { title: "一般", dataIndex: "general_count", key: "general_count", render: (v: number) => <Tag color="green">{v}</Tag> },
    { title: "提示", dataIndex: "info_count", key: "info_count", render: (v: number) => <Tag color="blue">{v}</Tag> },
    { title: "总计", dataIndex: "total_flags", key: "total_flags" },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: Report) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => window.open(getExportUrl(record.id), "_blank")}>
            下载
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleSingleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const batchResultsRowKey = (r: DetectionResult) => `${r.station_id}-${r.datetime}-${r.detector}-${r.trigger_rule}`;
  const singleReportRowKey = (r: DetectionResult) => `${r.datetime}-${r.detector}-${r.trigger_rule}`;

  const resultColumns = useMemo<ColumnsType<DetectionResult>>(
    () => [
      { title: "站点", dataIndex: "station_id", key: "station_id", width: 90 },
      { title: "时间", dataIndex: "datetime", key: "datetime", width: 160 },
      {
        title: "数据表",
        dataIndex: "data_type",
        key: "data_type",
        width: 130,
        filters: [
          { text: "降雨摘录表", value: "excerpt" },
          { text: "逐日降水表", value: "daily" },
          { text: "月年对照表", value: "monthly" },
          { text: "时段最大表", value: "period_max" },
        ],
        onFilter: (value, record) => record.data_type === value,
        render: (v: string) => {
          const map: Record<string, string> = {
            excerpt: "降雨摘录表",
            daily: "逐日降水表",
            monthly: "月年对照表",
            period_max: "时段最大表",
          };
          return map[v] || v;
        },
      },
      { title: "实测值", dataIndex: "value", key: "value", width: 80 },
      {
        title: "标记级别",
        dataIndex: "flag_level",
        key: "flag_level",
        width: 90,
        filters: [
          { text: <Tag color="red">严重</Tag>, value: "Severe" },
          { text: <Tag color="orange">警告</Tag>, value: "Warning" },
          { text: <Tag color="green">一般</Tag>, value: "General" },
          { text: <Tag color="blue">提示</Tag>, value: "Info" },
        ],
        onFilter: (value, record) => record.flag_level === value,
        render: (v: string) => <Tag color={FLAG_COLORS[v]}>{v}</Tag>,
      },
      { title: "触发规则", dataIndex: "trigger_rule", key: "trigger_rule", ellipsis: true },
      { title: "检测器", dataIndex: "detector", key: "detector", width: 160 },
      {
        title: "说明",
        dataIndex: "detail",
        key: "detail",
        ellipsis: true,
        render: (v: string) => (
          <span style={{ fontSize: 12, color: "#666" }}>{v}</span>
        ),
      },
    ],
    []
  );

  const isBatchDeleteEnabled = selectedRowKeys.length > 0;

  const isSummaryView = viewType === "summary";

  const tablePagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showTotal: (t: number) => `共 ${isSummaryView ? `${t} 个批次, ` : ""}${t} 条记录`,
    onChange: (p, ps) => {
      setPage(p);
      if (ps !== pageSize) setPageSize(ps);
      setExpandedRowKeys([]);
    },
  };

  const batchRowKey = (record: ReportBatch) => `${record.region_name}||${record.created_at}`;

  return (
    <div>
      <style>{`
        .row-severe { background-color: #fff1f0 !important; }
        .row-no-risk { background-color: #f5f5f5 !important; }
      `}</style>

      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Title level={5} style={{ margin: 0 }}>检测报告历史</Title>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            disabled={!isBatchDeleteEnabled}
            onClick={handleGlobalBatchDelete}
          >
            批量删除
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExportExcel}>
            导出 Excel
          </Button>
        </Space>
      </Space>

      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          mode="multiple"
          placeholder="所属区域"
          value={regions}
          onChange={setRegions}
          options={availableRegions.map((r) => ({ value: r, label: r.replace("RegionalStation", "") }))}
          style={{ minWidth: 160 }}
          allowClear
          maxTagCount={2}
        />
        <Select
          mode="multiple"
          placeholder="站点"
          value={stations}
          onChange={setStations}
          options={availableStations.map((s) => ({ value: s, label: s }))}
          style={{ minWidth: 160 }}
          allowClear
          maxTagCount={2}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
        />
        <RangePicker
          showTime
          value={null}
          placeholder={["起始时间", "结束时间"]}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setTimeRange([dates[0].toISOString(), dates[1].toISOString()]);
            } else {
              setTimeRange(null);
            }
          }}
        />
        <Input
          placeholder="检测批次时间 (如 2026/6/30 00:36:05)"
          value={batchTimeInput}
          onChange={(e) => setBatchTimeInput(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          placeholder="风险筛选"
          value={riskFilter}
          onChange={setRiskFilter}
          options={RISK_OPTIONS}
          style={{ minWidth: 140 }}
        />
        <Button type="primary" onClick={handleQuery}>查询</Button>
        <Button onClick={handleReset}>重置</Button>
      </Space>

      <Tabs
        activeKey={viewType}
        onChange={handleTabChange}
        style={{ marginBottom: 8 }}
        items={[
          { key: "summary", label: "批次汇总视图" },
          { key: "detail", label: "全量明细视图" },
        ]}
      />

      {isSummaryView ? (
        <Checkbox
          style={{ marginBottom: 8 }}
          checked={selectedRowKeys.length > 0 && selectedRowKeys.length === summaryData.length}
          indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < summaryData.length}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedRowKeys(summaryData.map(batchRowKey));
            } else {
              setSelectedRowKeys([]);
            }
          }}
        >
          全选
        </Checkbox>
      ) : (
        <Checkbox
          style={{ marginBottom: 8 }}
          checked={selectedRowKeys.length > 0 && selectedRowKeys.length === detailData.length}
          indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < detailData.length}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedRowKeys(detailData.map((r) => r.id));
            } else {
              setSelectedRowKeys([]);
            }
          }}
        >
          全选
        </Checkbox>
      )}

      {isSummaryView ? (
        <Table<ReportBatch>
          dataSource={summaryData}
          columns={batchColumns}
          rowKey={batchRowKey}
          loading={loading}
          pagination={tablePagination}
          rowClassName={getRowClassName}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
          }}
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
            expandedRowRender: (record: ReportBatch) => (
              <Table<Report>
                dataSource={record.stations}
                columns={subDetailColumns}
                rowKey="id"
                pagination={false}
                size="small"
                rowClassName={getRowClassName}
              />
            ),
            expandIcon: () => null,
          }}
          locale={{
            emptyText: regions.length > 0 || stations.length > 0 || timeRange || riskFilter ? (
              <Flex vertical gap="small">
                <span>暂无匹配筛选条件的检测报告</span>
                <Button onClick={handleReset}>重置筛选</Button>
              </Flex>
            ) : (
              <Flex vertical gap="small">
                <span>暂无检测报告数据</span>
              </Flex>
            ),
          }}
        />
      ) : (
        <Table<Report>
          dataSource={detailData}
          columns={detailColumns}
          rowKey="id"
          loading={loading}
          pagination={tablePagination}
          rowClassName={getRowClassName}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
          }}
          locale={{
            emptyText: regions.length > 0 || stations.length > 0 || timeRange || riskFilter ? (
              <Flex vertical gap="small">
                <span>暂无匹配筛选条件的检测报告</span>
                <Button onClick={handleReset}>重置筛选</Button>
              </Flex>
            ) : (
              <Flex vertical gap="small">
                <span>暂无检测报告数据</span>
              </Flex>
            ),
          }}
        />
      )}

      {selectedReport && reportSummary && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>检测结果</Title>
          <Card title="报告详情" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={4}><Statistic title="站点" value={reportSummary.station_name} /></Col>
              <Col span={4}><Statistic title="总异常" value={reportSummary.total_flags} /></Col>
              <Col span={4}><Statistic title="严重" value={reportSummary.severe_count} valueStyle={{ color: "#ff4d4f" }} /></Col>
              <Col span={4}><Statistic title="警告" value={reportSummary.warning_count} valueStyle={{ color: "#faad14" }} /></Col>
              <Col span={4}><Statistic title="一般" value={reportSummary.general_count} valueStyle={{ color: "#52c41a" }} /></Col>
              <Col span={4}><Statistic title="提示" value={reportSummary.info_count} valueStyle={{ color: "#1890ff" }} /></Col>
            </Row>
          </Card>
          <Table
            dataSource={reportResults}
            columns={resultColumns}
            rowKey={singleReportRowKey}
            size="small"
            scroll={{ x: 1200 }}
          />
        </>
      )}

      {!selectedReport && batchResultsTitle && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>检测结果 - {batchResultsTitle}</Title>
          <Table
            dataSource={reportResults}
            columns={resultColumns}
            rowKey={batchResultsRowKey}
            size="small"
            scroll={{ x: 1200 }}
          />
        </>
      )}
    </div>
  );
}
