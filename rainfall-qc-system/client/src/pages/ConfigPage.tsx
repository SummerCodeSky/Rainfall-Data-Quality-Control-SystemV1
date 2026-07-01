import { useEffect, useState } from "react";
import { Switch, InputNumber, Button, message, Space, Flex, Collapse, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { fetchConfig, updateConfig } from "../api/client";
import type { DetectionConfig } from "../types";

const { Text } = Typography;

const DETECTOR_LABELS: Record<string, string> = {
  persistent_trace: "持续性微量降雨检测",
  stagnation: "僵直值检测",
  climate_extreme: "气候极值检查",
  jump_step: "突跳/阶跃检测",
  cross_station: "降雨摘录表跨站横向对比",
  daily_cross_station: "逐日降水表跨站横向对比",
  human_error: "人为错误检测",
  monthly_comparison: "月降水对照表检查",
  yearly_comparison: "年降水/降水日数联合检查",
  period_max: "各时段最大降水量表检查",
};

export default function ConfigPage() {
  const [config, setConfig] = useState<DetectionConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => message.error("加载配置失败"));
  }, []);

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

  async function handleSave() {
    if (!config) return;
    setLoading(true);
    try {
      await updateConfig(config);
      message.success("配置已保存");
    } catch {
      message.error("保存失败");
    }
    setLoading(false);
  }

  if (!config) return <div>加载中...</div>;

  const items = Object.entries(config.detection).map(([key, cfg]) => ({
    key,
    label: (
      <Space>
        <Switch
          size="small"
          checked={cfg.enabled as boolean}
          onChange={(v) => setEnabled(key, v)}
        />
        <span>{DETECTOR_LABELS[key] || key}</span>
      </Space>
    ),
    children: (
      <div>
        {key === "persistent_trace" && (
          <Flex vertical gap="small">
            <Space><Text>滑动窗口(h):</Text><InputNumber value={cfg.window_hours as number} onChange={(v) => setDetectorValue(key, "window_hours", v)} /></Space>
            <Space><Text>目标微量值(mm):</Text><InputNumber value={(cfg.target_values as number[])[0]} onChange={(v) => setDetectorValue(key, "target_values", [v, (cfg.target_values as number[])[1] ?? 0.2])} step={0.1} /></Space>
            <Space><Text>打断阈值(mm):</Text><InputNumber value={cfg.max_break as number} onChange={(v) => setDetectorValue(key, "max_break", v)} step={0.1} /></Space>
          </Flex>
        )}
        {key === "stagnation" && (
          <Text>僵直值列表和分档阈值: 见完整配置</Text>
        )}
        {key === "climate_extreme" && (
          <Flex vertical gap="small">
            <Space><Text>时雨量上限(mm):</Text><InputNumber value={cfg.hourly_max as number} onChange={(v) => setDetectorValue(key, "hourly_max", v)} /></Space>
            <Space><Text>百分位数:</Text><InputNumber value={cfg.percentile as number} onChange={(v) => setDetectorValue(key, "percentile", v)} step={0.1} /></Space>
          </Flex>
        )}
        {key === "jump_step" && (
          <Flex vertical gap="small">
            <Space><Text>最小倍率:</Text><InputNumber value={cfg.min_ratio as number} onChange={(v) => setDetectorValue(key, "min_ratio", v)} step={0.5} /></Space>
            <Space><Text>最小差值(mm):</Text><InputNumber value={cfg.min_abs_diff as number} onChange={(v) => setDetectorValue(key, "min_abs_diff", v)} step={1} /></Space>
          </Flex>
        )}
        {key === "cross_station" && (
          <Text>Z-Score和差距分档阈值: 见完整配置</Text>
        )}
        {key === "daily_cross_station" && (
          <Flex vertical gap="small">
            <Space><Text>异常偏小因子:</Text><InputNumber value={cfg.outlier_small_factor as number} onChange={(v) => setDetectorValue(key, "outlier_small_factor", v)} step={0.01} /></Space>
            <Space><Text>异常偏大因子:</Text><InputNumber value={cfg.outlier_large_factor as number} onChange={(v) => setDetectorValue(key, "outlier_large_factor", v)} step={0.5} /></Space>
            <Space><Text>绝对微雨阈值(mm):</Text><InputNumber value={cfg.absolute_micro_threshold as number} onChange={(v) => setDetectorValue(key, "absolute_micro_threshold", v)} step={0.1} /></Space>
          </Flex>
        )}
        {key === "human_error" && (
          <Text>汛期/非汛期月份配置: 见完整配置</Text>
        )}
        {key === "monthly_comparison" && (
          <Flex vertical gap="small">
            <Space><Text>非汛期最大差值(mm):</Text><InputNumber value={cfg.non_flood_diff_max as number} onChange={(v) => setDetectorValue(key, "non_flood_diff_max", v)} step={1} /></Space>
            <Space><Text>非汛期最大倍数:</Text><InputNumber value={cfg.non_flood_ratio_max as number} onChange={(v) => setDetectorValue(key, "non_flood_ratio_max", v)} step={0.5} /></Space>
            <Space><Text>汛期最大差值(mm):</Text><InputNumber value={cfg.flood_diff_max as number} onChange={(v) => setDetectorValue(key, "flood_diff_max", v)} step={1} /></Space>
            <Space><Text>汛期最大倍数:</Text><InputNumber value={cfg.flood_ratio_max as number} onChange={(v) => setDetectorValue(key, "flood_ratio_max", v)} step={0.5} /></Space>
          </Flex>
        )}
        {key === "yearly_comparison" && (
          <Flex vertical gap="small">
            <Space><Text>年降水最小差值(mm):</Text><InputNumber value={cfg.precip_diff_min as number} onChange={(v) => setDetectorValue(key, "precip_diff_min", v)} step={10} /></Space>
            <Space><Text>年降水最大倍数:</Text><InputNumber value={cfg.precip_ratio_max as number} onChange={(v) => setDetectorValue(key, "precip_ratio_max", v)} step={0.5} /></Space>
            <Space><Text>年降水日数最小差值:</Text><InputNumber value={cfg.days_diff_min as number} onChange={(v) => setDetectorValue(key, "days_diff_min", v)} step={1} /></Space>
            <Space><Text>年降水日数最大倍数:</Text><InputNumber value={cfg.days_ratio_max as number} onChange={(v) => setDetectorValue(key, "days_ratio_max", v)} step={0.5} /></Space>
          </Flex>
        )}
        {key === "period_max" && (
          <Flex vertical gap="small">
            <Space><Text>僵直连续次数阈值:</Text><InputNumber value={cfg.stagnation_count as number} onChange={(v) => setDetectorValue(key, "stagnation_count", v)} /></Space>
            <Space><Text>低值阈值(mm):</Text><InputNumber value={cfg.low_value_threshold as number} onChange={(v) => setDetectorValue(key, "low_value_threshold", v)} step={0.1} /></Space>
            <Space><Text>低值连续次数:</Text><InputNumber value={cfg.low_value_count as number} onChange={(v) => setDetectorValue(key, "low_value_count", v)} /></Space>
          </Flex>
        )}
      </div>
    ),
  }));

  return (
    <div>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading} style={{ marginBottom: 16 }}>
        保存配置
      </Button>
      <Collapse items={items} />
    </div>
  );
}
