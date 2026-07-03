import { useEffect, useState, useMemo } from "react";
import {
  Switch,
  InputNumber,
  Button,
  message,
  Space,
  Card,
  Row,
  Col,
  Tag,
  Typography,
  Divider,
  Tooltip,
  Badge,
  Popover,
  Alert,
} from "antd";
import {
  SaveOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  BulbOutlined,
  RiseOutlined,
  LineChartOutlined,
  CheckCircleOutlined,
  SwapOutlined,
  CalendarOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  UndoOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { fetchConfig, updateConfig } from "../api/client";
import type { DetectionConfig } from "../types";

const { Title, Text, Paragraph } = Typography;

const LEVEL_COLORS = {
  Severe: "#ff4d4f",
  Warning: "#faad14",
  General: "#52c41a",
  Info: "#1890ff",
};

const LEVEL_ICONS = {
  Severe: <AlertOutlined />,
  Warning: <WarningOutlined />,
  General: <CheckCircleOutlined />,
  Info: <InfoCircleOutlined />,
};

interface DetectorMeta {
  label: string;
  icon: React.ReactNode;
  dataType: string;
  description: string;
}

const DETECTOR_META: Record<string, DetectorMeta> = {
  persistent_trace: {
    label: "持续性微量降雨检测",
    icon: <ClockCircleOutlined />,
    dataType: "降雨摘录表",
    description: "检测持续的微量降雨，识别可能的传感器卡顿或数据异常",
  },
  stagnation: {
    label: "僵直值检测",
    icon: <BulbOutlined />,
    dataType: "降雨摘录表",
    description: "检测连续相同的降水值，识别传感器滞塞问题",
  },
  climate_extreme: {
    label: "气候极值检查",
    icon: <ThunderboltOutlined />,
    dataType: "降雨摘录表",
    description: "检查时雨量是否超历史极值、是否超百分位极端值",
  },
  jump_step: {
    label: "跳变/阶跃检测",
    icon: <RiseOutlined />,
    dataType: "降雨摘录表",
    description: "检测相邻时段降雨量的异常跳变，识别数据突变错误",
  },
  cross_station: {
    label: "摘录表跨站横向对比",
    icon: <SwapOutlined />,
    dataType: "降雨摘录表",
    description: "同一时刻多站点数据横向对比，识别偏离均值的异常站",
  },
  daily_cross_station: {
    label: "逐日降水表跨站对比",
    icon: <LineChartOutlined />,
    dataType: "逐日降水表",
    description: "日降水量多站横向对比，识别异常偏高/偏低站点",
  },
  human_error: {
    label: "人为错误检测",
    icon: <AlertOutlined />,
    dataType: "逐日降水表",
    description: "检测人工观测站非汛期全偶数、自动站汛期奇数等人为错误",
  },
  monthly_comparison: {
    label: "月降水对照表检查",
    icon: <CalendarOutlined />,
    dataType: "月年降水对照表",
    description: "月降水量多站对比，识别汛期/非汛期异常差异",
  },
  yearly_comparison: {
    label: "年降水联合检查",
    icon: <BarChartOutlined />,
    dataType: "月年降水对照表",
    description: "年降水量与降水日数联合检查，识别量级与频次不一致",
  },
  period_max: {
    label: "各时段最大降水量检查",
    icon: <BarChartOutlined />,
    dataType: "各时段最大降水量表",
    description: "检测各时段最大降水量的僵直值、持续性低值及跨站偏离",
  },
};

function isValueChanged(
  current: unknown,
  original: unknown
): boolean {
  if (current === original) return false;
  if (Array.isArray(current) && Array.isArray(original)) {
    if (current.length !== original.length) return true;
    return current.some((v, i) => v !== original[i]);
  }
  return current !== original;
}

function formatValueForDisplay(v: unknown): string {
  if (Array.isArray(v)) {
    return `${v[0]} ~ ${v[1]}`;
  }
  return String(v);
}

function EditableTier({
  level,
  tier,
  originalTier,
  unit,
  onChange,
}: {
  level: "Info" | "General" | "Warning" | "Severe";
  tier: number[] | number;
  originalTier: number[] | number;
  unit?: string;
  onChange: (value: number | number[]) => void;
}) {
  const colors: Record<string, string> = {
    Severe: "red",
    Warning: "gold",
    General: "green",
    Info: "blue",
  };
  const labelMap: Record<string, string> = {
    Severe: "严重",
    Warning: "警告",
    General: "一般",
    Info: "提示",
  };
  const isRange = Array.isArray(tier);
  const changed = isValueChanged(tier, originalTier);

  const inputStyle = changed
    ? {
        borderColor: "#faad14",
        boxShadow: "0 0 0 2px rgba(250, 173, 14, 0.2)",
        backgroundColor: "#fffbe6",
      }
    : {};

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <Tag color={colors[level]} icon={LEVEL_ICONS[level]} style={{ margin: 0, fontSize: 11 }}>
        {labelMap[level]}
      </Tag>
      <Space size={4}>
        {changed && (
          <Popover
            content={
              <div style={{ fontSize: 12 }}>
                <Text type="secondary">原值：</Text>
                <Text strong style={{ color: "#52c41a" }}>{formatValueForDisplay(originalTier)}{unit || ""}</Text>
                <Divider style={{ margin: "8px 0" }} />
                <Text type="secondary">新值：</Text>
                <Text strong style={{ color: "#faad14" }}>{formatValueForDisplay(tier)}{unit || ""}</Text>
              </div>
            }
            title={<Space><ExclamationCircleOutlined style={{ color: "#faad14" }} /><span>值已修改</span></Space>}
            trigger="hover"
          >
            <Tag
              color="warning"
              icon={<EditOutlined />}
              style={{ cursor: "pointer", animation: "pulse 1.5s infinite" }}
            >
              已修改
            </Tag>
          </Popover>
        )}
        {isRange ? (
          <Space size={4}>
            <InputNumber
              size="small"
              min={0}
              step={0.5}
              value={tier[0]}
              onChange={(v) => onChange([v ?? 0, tier[1]])}
              style={{ width: 70, ...inputStyle }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>~</Text>
            <InputNumber
              size="small"
              min={0}
              step={0.5}
              value={tier[1]}
              onChange={(v) => onChange([tier[0], v ?? 0])}
              addonAfter={unit}
              style={{ width: 80, ...inputStyle }}
            />
          </Space>
        ) : (
          <InputNumber
            size="small"
            min={0}
            step={0.5}
            value={tier}
            onChange={(v) => onChange(v ?? 0)}
            addonBefore={`≥`}
            addonAfter={unit}
            style={{ width: 90, ...inputStyle }}
          />
        )}
      </Space>
    </div>
  );
}

function EditableField({
  label,
  value,
  originalValue,
  unit,
  onChange,
  min = 0,
  step = 1,
  width = 100,
}: {
  label: string;
  value: number;
  originalValue: number;
  unit?: string;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  width?: number;
}) {
  const changed = value !== originalValue;

  const inputStyle = changed
    ? {
        borderColor: "#faad14",
        boxShadow: "0 0 0 2px rgba(250, 173, 14, 0.2)",
        backgroundColor: "#fffbe6",
      }
    : {};

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Space size={4}>
        {changed && (
          <Popover
            content={
              <div style={{ fontSize: 12 }}>
                <Text type="secondary">原值：</Text>
                <Text strong style={{ color: "#52c41a" }}>{originalValue}{unit || ""}</Text>
                <Divider style={{ margin: "8px 0" }} />
                <Text type="secondary">新值：</Text>
                <Text strong style={{ color: "#faad14" }}>{value}{unit || ""}</Text>
              </div>
            }
            title={<Space><ExclamationCircleOutlined style={{ color: "#faad14" }} /><span>值已修改</span></Space>}
            trigger="hover"
          >
            <Tag
              color="warning"
              icon={<EditOutlined />}
              style={{ cursor: "pointer", animation: "pulse 1.5s infinite" }}
            >
              已修改
            </Tag>
          </Popover>
        )}
        <InputNumber
          size="small"
          min={min}
          step={step}
          value={value}
          onChange={(v) => onChange(v ?? 0)}
          addonAfter={unit}
          style={{ width, ...inputStyle }}
        />
      </Space>
    </div>
  );
}

export default function ConfigPage() {
  const [config, setConfig] = useState<DetectionConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<DetectionConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchConfig()
      .then((cfg) => {
        setConfig(cfg);
        setOriginalConfig(JSON.parse(JSON.stringify(cfg)));
      })
      .catch(() => message.error("加载配置失败"))
      .finally(() => setLoading(false));
  }, []);

  const changeCount = useMemo(() => {
    if (!config || !originalConfig) return 0;
    let count = 0;

    for (const key of Object.keys(config.detection)) {
      const current = config.detection[key];
      const original = originalConfig.detection[key];

      for (const field of Object.keys(current)) {
        if (field === "enabled") {
          if (current[field] !== original[field]) count++;
        } else if (typeof current[field] === "number") {
          if (current[field] !== original[field]) count++;
        } else if (Array.isArray(current[field])) {
          const currArr = current[field] as number[];
          const origArr = original[field] as number[];
          if (currArr.length !== origArr.length || currArr.some((v, i) => v !== origArr[i])) {
            count++;
          }
        } else if (typeof current[field] === "object" && current[field] !== null) {
          const currObj = current[field] as Record<string, unknown>;
          const origObj = original[field] as Record<string, unknown>;
          for (const subKey of Object.keys(currObj)) {
            if (isValueChanged(currObj[subKey], origObj[subKey])) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }, [config, originalConfig]);

  function setEnabled(key: string, value: boolean) {
    setConfig((prev) =>
      prev
        ? { ...prev, detection: { ...prev.detection, [key]: { ...prev.detection[key], enabled: value } } }
        : prev
    );
  }

  function setDetectorValue(key: string, field: string, value: unknown) {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            detection: {
              ...prev.detection,
              [key]: { ...prev.detection[key], [field]: value },
            },
          }
        : prev
    );
  }

  function setArrayValue(key: string, field: string, index: number, value: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      const arr = [...((prev.detection[key]?.[field] as number[]) || [])];
      arr[index] = value;
      return {
        ...prev,
        detection: {
          ...prev.detection,
          [key]: { ...prev.detection[key], [field]: arr },
        },
      };
    });
  }

  function setNestedValue(key: string, parent: string, level: string, value: number | number[]) {
    setConfig((prev) => {
      if (!prev) return prev;
      const parentObj = { ...((prev.detection[key]?.[parent] as Record<string, unknown>) || {}) };
      parentObj[level] = value;
      return {
        ...prev,
        detection: {
          ...prev.detection,
          [key]: { ...prev.detection[key], [parent]: parentObj },
        },
      };
    });
  }

  function handleReset() {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)));
      message.info("已重置为原始配置");
    }
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await updateConfig(config);
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      message.success("配置已保存成功");
    } catch {
      message.error("保存失败，请重试");
    }
    setSaving(false);
  }

  if (loading || !config) {
    return <div style={{ textAlign: "center", padding: 60 }}>加载中...</div>;
  }

  const dataTypeGroups: Record<string, string[]> = {
    "降雨摘录表": ["persistent_trace", "stagnation", "climate_extreme", "jump_step", "cross_station"],
    "逐日降水表": ["daily_cross_station", "human_error"],
    "月年降水对照表": ["monthly_comparison", "yearly_comparison"],
    "各时段最大降水量表": ["period_max"],
  };

  const enabledCount = Object.values(config.detection).filter((c) => c.enabled).length;
  const totalCount = Object.keys(config.detection).length;

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .changed-field-highlight {
          animation: highlight-flash 0.5s ease-out;
        }
        @keyframes highlight-flash {
          0% { background-color: #fffbe6; }
          100% { background-color: transparent; }
        }
      `}</style>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
      }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>检测阈值配置</Title>
          <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
            共 {totalCount} 个检测器，已启用 <Text strong type="success">{enabledCount}</Text> 个
          </Paragraph>
        </div>
        <Space size={12}>
          {changeCount > 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Space size={8}>
                <Text strong style={{ color: "#faad14" }}>已修改 {changeCount} 个参数</Text>
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={handleReset}
                >
                  重置
                </Button>
              </Space>
            </Alert>
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            size="large"
            disabled={changeCount === 0}
          >
            保存配置 {changeCount > 0 && `(${changeCount})`}
          </Button>
        </Space>
      </div>

      {Object.entries(dataTypeGroups).map(([groupName, detectorKeys]) => (
        <div key={groupName} style={{ marginBottom: 32 }}>
          <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}>
            <Space size={8}>
              <span style={{
                display: "inline-block",
                width: 4,
                height: 16,
                background: "#1890ff",
                borderRadius: 2,
              }} />
              <Text strong style={{ fontSize: 15 }}>{groupName}</Text>
            </Space>
          </Divider>
          <Row gutter={[16, 16]}>
            {detectorKeys.map((key) => {
              const cfg = config.detection[key];
              const origCfg = originalConfig?.detection[key];
              const meta = DETECTOR_META[key];
              if (!cfg || !meta || !origCfg) return null;
              const isEnabled = cfg.enabled as boolean;
              const enabledChanged = isEnabled !== (origCfg.enabled as boolean);

              return (
                <Col xs={24} md={12} xl={8} key={key}>
                  <Card
                    size="small"
                    style={{
                      opacity: isEnabled ? 1 : 0.6,
                      transition: "all 0.2s",
                      border: isEnabled
                        ? enabledChanged
                          ? "2px solid #faad14"
                          : "1px solid #e8e8e8"
                        : "1px dashed #d9d9d9",
                      boxShadow: enabledChanged
                        ? "0 0 8px rgba(250, 173, 14, 0.3)"
                        : "none",
                    }}
                    bodyStyle={{ padding: 16 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: isEnabled ? "#e6f7ff" : "#f5f5f5",
                          color: isEnabled ? "#1890ff" : "#bfbfbf",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 18,
                          transition: "all 0.2s",
                          boxShadow: enabledChanged ? "0 0 0 2px #faad14" : "none",
                        }}>
                          {meta.icon}
                        </div>
                        <div>
                          <Space size={4}>
                            <Text strong style={{ fontSize: 14 }}>{meta.label}</Text>
                            {enabledChanged && (
                              <Tag color="warning" icon={<EditOutlined />} style={{ animation: "pulse 1.5s infinite" }}>
                                {isEnabled ? "已开启" : "已关闭"}
                              </Tag>
                            )}
                          </Space>
                          <div>
                            <Tag style={{ fontSize: 11, margin: 0 }}>{meta.dataType}</Tag>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onChange={(v) => setEnabled(key, v)}
                      />
                    </div>

                    <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12, minHeight: 36 }}>
                      {meta.description}
                    </Paragraph>

                    <div style={{ minHeight: 120 }}>
                      {key === "persistent_trace" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="滑动窗口"
                              value={cfg.window_hours as number}
                              originalValue={origCfg.window_hours as number}
                              unit="h"
                              onChange={(v) => setDetectorValue(key, "window_hours", v)}
                              min={1}
                              width={100}
                            />
                            <EditableField
                              label="打断阈值"
                              value={cfg.max_break as number}
                              originalValue={origCfg.max_break as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "max_break", v)}
                              step={0.1}
                              width={100}
                            />
                            <EditableField
                              label="目标值1"
                              value={(cfg.target_values as number[])[0]}
                              originalValue={(origCfg.target_values as number[])[0]}
                              unit="mm"
                              onChange={(v) => setArrayValue(key, "target_values", 0, v)}
                              step={0.1}
                              width={100}
                            />
                            <EditableField
                              label="目标值2"
                              value={(cfg.target_values as number[])[1]}
                              originalValue={(origCfg.target_values as number[])[1]}
                              unit="mm"
                              onChange={(v) => setArrayValue(key, "target_values", 1, v)}
                              step={0.1}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>持续时长分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.duration_tiers as any).info as number[]}
                            originalTier={(origCfg.duration_tiers as any).info as number[]}
                            unit="h"
                            onChange={(v) => setNestedValue(key, "duration_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.duration_tiers as any).general as number[]}
                            originalTier={(origCfg.duration_tiers as any).general as number[]}
                            unit="h"
                            onChange={(v) => setNestedValue(key, "duration_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.duration_tiers as any).warning as number[]}
                            originalTier={(origCfg.duration_tiers as any).warning as number[]}
                            unit="h"
                            onChange={(v) => setNestedValue(key, "duration_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.duration_tiers as any).severe as number}
                            originalTier={(origCfg.duration_tiers as any).severe as number}
                            unit="h"
                            onChange={(v) => setNestedValue(key, "duration_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "stagnation" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>僵直目标值</Text>
                              <Space size={4}>
                                {(cfg.stagnation_values as number[]).map((v, i) => (
                                  <Tag key={i} color="blue">{v} mm</Tag>
                                ))}
                              </Space>
                            </div>
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>连续次数分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.count_tiers as any).info as number[]}
                            originalTier={(origCfg.count_tiers as any).info as number[]}
                            unit="次"
                            onChange={(v) => setNestedValue(key, "count_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.count_tiers as any).general as number[]}
                            originalTier={(origCfg.count_tiers as any).general as number[]}
                            unit="次"
                            onChange={(v) => setNestedValue(key, "count_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.count_tiers as any).warning as number[]}
                            originalTier={(origCfg.count_tiers as any).warning as number[]}
                            unit="次"
                            onChange={(v) => setNestedValue(key, "count_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.count_tiers as any).severe as number}
                            originalTier={(origCfg.count_tiers as any).severe as number}
                            unit="次"
                            onChange={(v) => setNestedValue(key, "count_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "climate_extreme" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="时雨量上限"
                              value={cfg.hourly_max as number}
                              originalValue={origCfg.hourly_max as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "hourly_max", v)}
                              width={110}
                            />
                            <EditableField
                              label="极端百分位"
                              value={cfg.percentile as number}
                              originalValue={origCfg.percentile as number}
                              unit="%"
                              onChange={(v) => setDetectorValue(key, "percentile", v)}
                              min={90}
                              max={99.99}
                              step={0.1}
                              width={110}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>检测维度</Text>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            <Badge status="warning" text="时雨量超限" />
                            <Badge status="processing" text="百分位极值" />
                            <Badge status="default" text="日雨量超限(可选)" />
                          </div>
                        </div>
                      )}

                      {key === "jump_step" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="最小倍率"
                              value={cfg.min_ratio as number}
                              originalValue={origCfg.min_ratio as number}
                              onChange={(v) => setDetectorValue(key, "min_ratio", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                            <EditableField
                              label="最小差值"
                              value={cfg.min_abs_diff as number}
                              originalValue={origCfg.min_abs_diff as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "min_abs_diff", v)}
                              step={1}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>倍率分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.ratio_tiers as any).info as number[]}
                            originalTier={(origCfg.ratio_tiers as any).info as number[]}
                            onChange={(v) => setNestedValue(key, "ratio_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.ratio_tiers as any).general as number[]}
                            originalTier={(origCfg.ratio_tiers as any).general as number[]}
                            onChange={(v) => setNestedValue(key, "ratio_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.ratio_tiers as any).warning as number[]}
                            originalTier={(origCfg.ratio_tiers as any).warning as number[]}
                            onChange={(v) => setNestedValue(key, "ratio_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.ratio_tiers as any).severe as number}
                            originalTier={(origCfg.ratio_tiers as any).severe as number}
                            onChange={(v) => setNestedValue(key, "ratio_tiers", "severe", v)}
                          />
                          <Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>差值分级（mm）</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.abs_diff_tiers as any).info as number[]}
                            originalTier={(origCfg.abs_diff_tiers as any).info as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "abs_diff_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.abs_diff_tiers as any).general as number[]}
                            originalTier={(origCfg.abs_diff_tiers as any).general as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "abs_diff_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.abs_diff_tiers as any).warning as number[]}
                            originalTier={(origCfg.abs_diff_tiers as any).warning as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "abs_diff_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.abs_diff_tiers as any).severe as number}
                            originalTier={(origCfg.abs_diff_tiers as any).severe as number}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "abs_diff_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "cross_station" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>对比维度</Text>
                              <Space size={4}>
                                <Tag color="blue">Z-Score</Tag>
                                <Tag color="purple">绝对差距</Tag>
                              </Space>
                            </div>
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>Z-Score 分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.std_tiers as any).info as number[]}
                            originalTier={(origCfg.std_tiers as any).info as number[]}
                            unit="σ"
                            onChange={(v) => setNestedValue(key, "std_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.std_tiers as any).general as number[]}
                            originalTier={(origCfg.std_tiers as any).general as number[]}
                            unit="σ"
                            onChange={(v) => setNestedValue(key, "std_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.std_tiers as any).warning as number[]}
                            originalTier={(origCfg.std_tiers as any).warning as number[]}
                            unit="σ"
                            onChange={(v) => setNestedValue(key, "std_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.std_tiers as any).severe as number}
                            originalTier={(origCfg.std_tiers as any).severe as number}
                            unit="σ"
                            onChange={(v) => setNestedValue(key, "std_tiers", "severe", v)}
                          />
                          <Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>差距分级（mm）</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.gap_tiers as any).info as number[]}
                            originalTier={(origCfg.gap_tiers as any).info as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.gap_tiers as any).general as number[]}
                            originalTier={(origCfg.gap_tiers as any).general as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.gap_tiers as any).warning as number[]}
                            originalTier={(origCfg.gap_tiers as any).warning as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.gap_tiers as any).severe as number}
                            originalTier={(origCfg.gap_tiers as any).severe as number}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "daily_cross_station" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="偏小因子"
                              value={cfg.outlier_small_factor as number}
                              originalValue={origCfg.outlier_small_factor as number}
                              onChange={(v) => setDetectorValue(key, "outlier_small_factor", v)}
                              step={0.01}
                              width={100}
                            />
                            <EditableField
                              label="偏大因子"
                              value={cfg.outlier_large_factor as number}
                              originalValue={origCfg.outlier_large_factor as number}
                              onChange={(v) => setDetectorValue(key, "outlier_large_factor", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                            <EditableField
                              label="微雨阈值"
                              value={cfg.micro_threshold as number}
                              originalValue={origCfg.micro_threshold as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "micro_threshold", v)}
                              step={0.1}
                              width={100}
                            />
                            <EditableField
                              label="邻站干燥"
                              value={cfg.neighbor_dry_threshold as number}
                              originalValue={origCfg.neighbor_dry_threshold as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "neighbor_dry_threshold", v)}
                              step={0.1}
                              width={100}
                            />
                            <EditableField
                              label="绝对微雨"
                              value={cfg.absolute_micro_threshold as number}
                              originalValue={origCfg.absolute_micro_threshold as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "absolute_micro_threshold", v)}
                              step={0.05}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>差距分级（mm）</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.gap_tiers as any).info as number[]}
                            originalTier={(origCfg.gap_tiers as any).info as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.gap_tiers as any).general as number[]}
                            originalTier={(origCfg.gap_tiers as any).general as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.gap_tiers as any).warning as number[]}
                            originalTier={(origCfg.gap_tiers as any).warning as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.gap_tiers as any).severe as number}
                            originalTier={(origCfg.gap_tiers as any).severe as number}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "human_error" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>汛期月份</Text>
                              <div style={{ marginTop: 4 }}>
                                {(cfg.flood_months as number[]).map((m) => (
                                  <Tag key={m} color="orange">{m}月</Tag>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>非汛期月份</Text>
                              <div style={{ marginTop: 4 }}>
                                {(cfg.non_flood_months as number[]).map((m) => (
                                  <Tag key={m} color="blue">{m}月</Tag>
                                ))}
                              </div>
                            </div>
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>检测规则</Text>
                          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Badge status="processing" />
                              <Text style={{ fontSize: 12 }}>人工站非汛期全偶数 → General</Text>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Badge status="processing" />
                              <Text style={{ fontSize: 12 }}>自动站汛期奇数 → General</Text>
                            </div>
                          </div>
                        </div>
                      )}

                      {key === "monthly_comparison" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="非汛期最大差值"
                              value={cfg.non_flood_diff_max as number}
                              originalValue={origCfg.non_flood_diff_max as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "non_flood_diff_max", v)}
                              step={1}
                              width={100}
                            />
                            <EditableField
                              label="非汛期最大倍数"
                              value={cfg.non_flood_ratio_max as number}
                              originalValue={origCfg.non_flood_ratio_max as number}
                              onChange={(v) => setDetectorValue(key, "non_flood_ratio_max", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                            <EditableField
                              label="汛期最小差值"
                              value={cfg.flood_diff_min as number}
                              originalValue={origCfg.flood_diff_min as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "flood_diff_min", v)}
                              step={1}
                              width={100}
                            />
                            <EditableField
                              label="汛期最大差值"
                              value={cfg.flood_diff_max as number}
                              originalValue={origCfg.flood_diff_max as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "flood_diff_max", v)}
                              step={1}
                              width={100}
                            />
                            <EditableField
                              label="汛期最大倍数"
                              value={cfg.flood_ratio_max as number}
                              originalValue={origCfg.flood_ratio_max as number}
                              onChange={(v) => setDetectorValue(key, "flood_ratio_max", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>跨站差距分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.gap_tiers as any).info as number[]}
                            originalTier={(origCfg.gap_tiers as any).info as number[]}
                            onChange={(v) => setNestedValue(key, "gap_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.gap_tiers as any).general as number[]}
                            originalTier={(origCfg.gap_tiers as any).general as number[]}
                            onChange={(v) => setNestedValue(key, "gap_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.gap_tiers as any).warning as number[]}
                            originalTier={(origCfg.gap_tiers as any).warning as number[]}
                            onChange={(v) => setNestedValue(key, "gap_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.gap_tiers as any).severe as number}
                            originalTier={(origCfg.gap_tiers as any).severe as number}
                            onChange={(v) => setNestedValue(key, "gap_tiers", "severe", v)}
                          />
                        </div>
                      )}

                      {key === "yearly_comparison" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="年降水最大倍数"
                              value={cfg.precip_ratio_max as number}
                              originalValue={origCfg.precip_ratio_max as number}
                              onChange={(v) => setDetectorValue(key, "precip_ratio_max", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                            <EditableField
                              label="年降水最小差值"
                              value={cfg.precip_diff_min as number}
                              originalValue={origCfg.precip_diff_min as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "precip_diff_min", v)}
                              step={10}
                              width={100}
                            />
                            <EditableField
                              label="日数最大倍数"
                              value={cfg.days_ratio_max as number}
                              originalValue={origCfg.days_ratio_max as number}
                              onChange={(v) => setDetectorValue(key, "days_ratio_max", v)}
                              min={1}
                              step={0.5}
                              width={100}
                            />
                            <EditableField
                              label="日数最小差值"
                              value={cfg.days_diff_min as number}
                              originalValue={origCfg.days_diff_min as number}
                              unit="天"
                              onChange={(v) => setDetectorValue(key, "days_diff_min", v)}
                              step={1}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>判定逻辑</Text>
                          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Badge status="success" />
                              <Text style={{ fontSize: 12 }}>两者均异常 → General</Text>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Badge status="warning" />
                              <Text style={{ fontSize: 12 }}>单一异常 → Warning</Text>
                            </div>
                          </div>
                        </div>
                      )}

                      {key === "period_max" && (
                        <div>
                          <Space direction="vertical" size="small" style={{ width: "100%" }}>
                            <EditableField
                              label="僵直连续次数"
                              value={cfg.stagnation_count as number}
                              originalValue={origCfg.stagnation_count as number}
                              unit="次"
                              onChange={(v) => setDetectorValue(key, "stagnation_count", v)}
                              min={2}
                              width={100}
                            />
                            <EditableField
                              label="低值阈值"
                              value={cfg.low_value_threshold as number}
                              originalValue={origCfg.low_value_threshold as number}
                              unit="mm"
                              onChange={(v) => setDetectorValue(key, "low_value_threshold", v)}
                              step={0.1}
                              width={100}
                            />
                            <EditableField
                              label="低值连续次数"
                              value={cfg.low_value_count as number}
                              originalValue={origCfg.low_value_count as number}
                              unit="次"
                              onChange={(v) => setDetectorValue(key, "low_value_count", v)}
                              min={2}
                              width={100}
                            />
                          </Space>
                          <Divider style={{ margin: "12px 0" }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>跨站差距分级</Text>
                          <EditableTier
                            level="Info"
                            tier={(cfg.gap_tiers as any).info as number[]}
                            originalTier={(origCfg.gap_tiers as any).info as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "info", v)}
                          />
                          <EditableTier
                            level="General"
                            tier={(cfg.gap_tiers as any).general as number[]}
                            originalTier={(origCfg.gap_tiers as any).general as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "general", v)}
                          />
                          <EditableTier
                            level="Warning"
                            tier={(cfg.gap_tiers as any).warning as number[]}
                            originalTier={(origCfg.gap_tiers as any).warning as number[]}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "warning", v)}
                          />
                          <EditableTier
                            level="Severe"
                            tier={(cfg.gap_tiers as any).severe as number}
                            originalTier={(origCfg.gap_tiers as any).severe as number}
                            unit="mm"
                            onChange={(v) => setNestedValue(key, "gap_tiers", "severe", v)}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      ))}
    </div>
  );
}