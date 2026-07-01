import { useEffect, useState, useMemo } from "react";
import {
  Select,
  Button,
  Table,
  Tag,
  Space,
  message,
  Statistic,
  Row,
  Col,
  Card,
  Typography,
} from "antd";
import { PlayCircleOutlined, DownloadOutlined } from "@ant-design/icons";
import {
  fetchStations,
  runDetection,
  getExportUrl,
} from "../api/client";
import type { ColumnsType } from "antd/es/table";
import type { Station, DetectionResult, Report } from "../types";

const { Title } = Typography;

const DATA_TYPE_LABELS: Record<string, string> = {
  excerpt: "降雨摘录表",
  daily: "逐日降水表",
  monthly: "月年对照表",
  period_max: "时段最大表",
};

const FLAG_COLORS: Record<string, string> = {
  Severe: "red",
  Warning: "orange",
  General: "green",
  Info: "blue",
};



export default function DetectionPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>("");
  const [detecting, setDetecting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [loadingResults, _setLoadingResults] = useState(false);

  useEffect(() => {
    fetchStations().then(setStations).catch(() => message.error("加载站点失败"));
  }, []);

  async function handleDetect() {
    if (!selectedStation) {
      message.warning("请选择站点");
      return;
    }
    setDetecting(true);
    try {
      const data = await runDetection(selectedStation);
      setReport({
        id: data.id,
        station_name: data.station_name,
        created_at: data.created_at,
        total_flags: data.total_flags,
        severe_count: data.severe_count,
        warning_count: data.warning_count,
        general_count: data.general_count,
        info_count: data.info_count,
      });
      setResults(data.results);
      message.success(`检测完成，发现 ${data.total_flags} 条异常`);
    } catch {
      message.error("检测失败");
    }
    setDetecting(false);
  }

  function handleDownload() {
    if (report) {
      window.open(getExportUrl(report.id), "_blank");
    }
  }

  const columns = useMemo<ColumnsType<DetectionResult>>(
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
        render: (v: string) => DATA_TYPE_LABELS[v] || v,
      },
      { title: "实测值", dataIndex: "value", key: "value", width: 80 },
      { title: "期望值", dataIndex: "expected_value", key: "expected_value", width: 80 },
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

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Select
            showSearch
            placeholder="选择目标站点"
            style={{ width: 300 }}
            value={selectedStation || undefined}
            onChange={setSelectedStation}
            filterOption={(input, option) =>
              (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
            }
            options={stations.map((s) => ({
              value: s.name,
              label: s.region ? `${s.name} (${s.region.replace("RegionalStation", "")})` : s.name,
            }))}
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleDetect}
            loading={detecting}
          >
            执行检测
          </Button>
        </Space>
      </Card>

      {report && (
        <>
          <Title level={5}>检测结果</Title>
          <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={4}>
              <Statistic title="总异常数" value={report.total_flags} />
            </Col>
            <Col span={4}>
              <Statistic title="严重" value={report.severe_count} valueStyle={{ color: "#ff4d4f" }} />
            </Col>
            <Col span={4}>
              <Statistic title="警告" value={report.warning_count} valueStyle={{ color: "#faad14" }} />
            </Col>
            <Col span={4}>
              <Statistic title="一般" value={report.general_count} valueStyle={{ color: "#52c41a" }} />
            </Col>
            <Col span={4}>
              <Statistic title="提示" value={report.info_count} valueStyle={{ color: "#1890ff" }} />
            </Col>
            <Col span={4}>
              <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                下载 Excel
              </Button>
            </Col>
          </Row>
        </Card>
        </>
      )}

      <Table
        dataSource={results}
        columns={columns}
        rowKey={(r) => `${r.station_id}-${r.datetime}-${r.detector}-${r.trigger_rule}`}
        loading={loadingResults}
        size="small"
        scroll={{ x: 1200 }}
      />
    </div>
  );
}
