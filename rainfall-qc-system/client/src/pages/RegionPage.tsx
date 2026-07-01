import { useEffect, useState } from "react";
import {
  Collapse,
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  Space,
  message,
  Tabs,
  Tag,
  Card,
  Row,
  Col,
  Statistic,
  Spin,
  Popconfirm,
  Typography,
  Divider,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import {
  fetchRegions,
  createRegion,
  fetchRegion,
  addRegionStation,
  updateRegionStation,
  deleteRegionStation,
  uploadRegionFile,
  deleteRegionFile,
  deleteRegion,
  detectRegion,
  detectAllRegions,
} from "../api/client";
import type { RegionInfo, RegionDetail, RegionDetectResult, AllDetectResult, Station, DetectionResult } from "../types";

const { Text } = Typography;

const FLAG_COLORS: Record<string, string> = {
  Severe: "red",
  Warning: "orange",
  General: "green",
  Info: "blue",
};

const CATEGORY_LABELS: Record<string, string> = {
  period_max: "各时段最大降水量表",
  monthly: "各站月年降水量对照表",
  daily: "逐日降水量对照表",
  excerpt: "降水量摘录表",
};

const CATEGORY_DESC: Record<string, string> = {
  period_max: "区域汇总，每年一份",
  monthly: "站间月年对照，每年一份",
  daily: "按月分表，共12个月",
  excerpt: "每站一份，记录全年逐日各时段降水量",
};

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

export default function RegionPage() {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [regionDetails, setRegionDetails] = useState<Record<string, RegionDetail>>({});
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const [stationModal, setStationModal] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [currentRegion, setCurrentRegion] = useState("");
  const [stationForm] = Form.useForm();

  const [uploadModal, setUploadModal] = useState(false);
  const [uploadRegion, setUploadRegion] = useState("");
  const [uploadCategory, setUploadCategory] = useState("period_max");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [detectLoading, setDetectLoading] = useState<Record<string, boolean>>({});
  const [detectResults, setDetectResults] = useState<RegionDetectResult | null>(null);
  const [allDetectResults, setAllDetectResults] = useState<AllDetectResult | null>(null);

  const [createRegionModal, setCreateRegionModal] = useState(false);
  const [createRegionLoading, setCreateRegionLoading] = useState(false);
  const [createRegionForm] = Form.useForm();

  useEffect(() => { loadRegions(); }, []);

  async function loadRegions() {
    setLoading(true);
    try {
      const data = await fetchRegions();
      setRegions(data);
    } catch {
      message.error("加载区域列表失败");
    }
    setLoading(false);
  }

  async function loadRegionDetail(name: string) {
    if (regionDetails[name]) return;
    try {
      const detail = await fetchRegion(name);
      setRegionDetails((prev) => ({ ...prev, [name]: detail }));
    } catch {
      message.error(`加载区域 ${name} 详情失败`);
    }
  }

  function getCatFiles(detail: RegionDetail | undefined, key: string) {
    if (!detail) return [];
    const cat = detail.categories.find((c) => c.key === key);
    return cat?.files || [];
  }

  function openStationModal(regionName: string, station?: Station) {
    setCurrentRegion(regionName);
    setEditingStation(station || null);
    if (station) {
      stationForm.setFieldsValue(station);
    } else {
      stationForm.resetFields();
    }
    setStationModal(true);
  }

  async function handleStationSave() {
    const values = await stationForm.validateFields();
    try {
      if (editingStation) {
        await updateRegionStation(currentRegion, editingStation.name, values);
        message.success("站点已更新");
      } else {
        await addRegionStation(currentRegion, values);
        message.success("站点已创建");
      }
      setStationModal(false);
      const name = currentRegion;
      setRegionDetails((prev) => {
        const d = { ...prev };
        delete d[name];
        return d;
      });
      loadRegionDetail(name);
      loadRegions();
    } catch {
      message.error("操作失败");
    }
  }

  async function handleDeleteStation(regionName: string, stationName: string) {
    try {
      await deleteRegionStation(regionName, stationName);
      message.success("站点已删除");
      setRegionDetails((prev) => {
        const d = { ...prev };
        delete d[regionName];
        return d;
      });
      loadRegionDetail(regionName);
      loadRegions();
    } catch {
      message.error("删除失败");
    }
  }

  function openUploadModal(regionName: string, category: string) {
    setUploadRegion(regionName);
    setUploadCategory(category);
    setUploadFile(null);
    setUploadModal(true);
  }

  async function handleUpload() {
    if (!uploadFile) {
      message.warning("请选择文件");
      return;
    }
    try {
      await uploadRegionFile(uploadRegion, uploadCategory, uploadFile);
      message.success("上传成功");
      setUploadModal(false);
      setRegionDetails((prev) => {
        const d = { ...prev };
        delete d[uploadRegion];
        return d;
      });
      loadRegionDetail(uploadRegion);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      message.error(err?.response?.data?.detail || "上传失败");
    }
  }

  async function handleDeleteFile(regionName: string, filename: string) {
    try {
      await deleteRegionFile(regionName, filename);
      message.success("文件已删除");
      setRegionDetails((prev) => {
        const d = { ...prev };
        delete d[regionName];
        return d;
      });
      loadRegionDetail(regionName);
    } catch {
      message.error("删除失败");
    }
  }

  async function handleDeleteRegion(regionName: string) {
    try {
      await deleteRegion(regionName);
      message.success(`区域 ${regionName} 已删除`);
      setRegionDetails((prev) => {
        const d = { ...prev };
        delete d[regionName];
        return d;
      });
      loadRegions();
    } catch {
      message.error("删除区域失败");
    }
  }

  async function handleDetectRegion(regionName: string) {
    setDetectLoading((prev) => ({ ...prev, [regionName]: true }));
    try {
      const result = await detectRegion(regionName);
      setDetectResults(result);
      setAllDetectResults(null);
      message.success(`${regionName} 检测完成，发现 ${result.total_flags} 条异常`);
    } catch {
      message.error(`检测 ${regionName} 失败`);
    }
    setDetectLoading((prev) => ({ ...prev, [regionName]: false }));
  }

  async function handleDetectAll() {
    setDetectLoading((prev) => ({ ...prev, __all__: true }));
    try {
      const result = await detectAllRegions();
      setAllDetectResults(result);
      setDetectResults(null);
      message.success(`全区域检测完成，发现 ${result.total_flags} 条异常`);
    } catch {
      message.error("全区域检测失败");
    }
    setDetectLoading((prev) => ({ ...prev, __all__: false }));
  }

  async function handleCreateRegion() {
    const values = await createRegionForm.validateFields();
    setCreateRegionLoading(true);
    try {
      await createRegion(values.name);
      message.success(`区域 ${values.name} 已创建`);
      setCreateRegionModal(false);
      createRegionForm.resetFields();
      loadRegions();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      message.error(err?.response?.data?.detail || "创建失败");
    }
    setCreateRegionLoading(false);
  }

  function getStationExcerptFiles(detail: RegionDetail | undefined, stationName: string) {
    return getCatFiles(detail, "excerpt").filter(
      (f) => f.station_name === stationName
    );
  }

  function renderFileLink(regionName: string, f: RegionDetail["categories"][0]["files"][0]) {
    return (
      <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <Text code style={{ fontSize: 12 }}>{f.name}</Text>
        <Space size="small">
          <Text type="secondary" style={{ fontSize: 11 }}>
            {(f.size / 1024).toFixed(0)} KB
          </Text>
          <Popconfirm
            title="确定删除该文件？"
            onConfirm={() => handleDeleteFile(regionName, f.name)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} type="link" />
          </Popconfirm>
        </Space>
      </div>
    );
  }

  function renderTabStations(regionName: string, detail: RegionDetail | undefined) {
    const stations = detail?.stations || regions.find((r) => r.name === regionName)?.stations || [];
    const excerptFiles = getCatFiles(detail, "excerpt");
    const unassociatedExcerpt = excerptFiles.filter((f) => !f.station_name);

    return (
      <div>
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" icon={<PlusOutlined />} onClick={() => openStationModal(regionName)}>
            新增站点
          </Button>
          <Button size="small" icon={<UploadOutlined />} onClick={() => openUploadModal(regionName, "excerpt")}>
            上传摘录表
          </Button>
        </Space>

        <Table
          dataSource={stations}
          rowKey="name"
          size="small"
          pagination={false}
          expandable={{
            expandedRowRender: (station: Station) => {
              const files = detail ? getStationExcerptFiles(detail, station.name) : [];
              if (files.length === 0) {
                return (
                  <div style={{ padding: "4px 0", marginLeft: 32 }}>
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        uploadRegionFile(regionName, "excerpt", file).then(() => {
                          message.success(`${station.name}站 摘录表已上传`);
                          setRegionDetails((prev) => { const d = { ...prev }; delete d[regionName]; return d; });
                          loadRegionDetail(regionName);
                        }).catch(() => message.error("上传失败"));
                        return false;
                      }}
                    >
                      <Button size="small" type="dashed" icon={<UploadOutlined />}>
                        上传 {station.name}站 降水摘录表
                      </Button>
                    </Upload>
                  </div>
                );
              }
              return (
                <div style={{ marginLeft: 32 }}>
                  {files.map((f) => renderFileLink(regionName, f))}
                </div>
              );
            },
            rowExpandable: () => true,
          }}
          columns={[
            { title: "站点名", dataIndex: "name", key: "name", width: 80 },
            {
              title: "摘录表",
              key: "excerpt_status",
              width: 100,
              render: (_: unknown, record: Station) => {
                const files = detail ? getStationExcerptFiles(detail, record.name) : [];
                return files.length > 0 ? (
                  <Tag color="green">已上传</Tag>
                ) : (
                  <Tag color="default">未上传</Tag>
                );
              },
            },
            { title: "经度", dataIndex: "longitude", key: "longitude", width: 80 },
            { title: "纬度", dataIndex: "latitude", key: "latitude", width: 80 },
            { title: "高程(m)", dataIndex: "elevation", key: "elevation", width: 80 },
            {
              title: "观测方式",
              dataIndex: "obs_type",
              key: "obs_type",
              width: 80,
              render: (v: string) => (v === "auto" ? "自动站" : v === "manual" ? "人工站" : v || "-"),
            },
            {
              title: "操作",
              key: "actions",
              width: 120,
              render: (_: unknown, record: Station) => (
                <Space size="small">
                  <Button size="small" onClick={() => openStationModal(regionName, record)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定删除该站点？"
                    onConfirm={() => handleDeleteStation(regionName, record.name)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        {unassociatedExcerpt.length > 0 && (
          <Card size="small" title="未关联站点的摘录表文件" style={{ marginTop: 12 }}>
            {unassociatedExcerpt.map((f) => renderFileLink(regionName, f))}
          </Card>
        )}

        <div style={{ marginTop: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <CalendarOutlined /> 降水摘录表：每个站点一份，记录全年（1-12月）逐日各时段降水量
          </Text>
        </div>
      </div>
    );
  }

  function renderTabDaily(regionName: string, detail: RegionDetail | undefined) {
    const dailyFiles = getCatFiles(detail, "daily");
    const periodMaxFiles = getCatFiles(detail, "period_max");
    const monthlyFiles = getCatFiles(detail, "monthly");

    const byMonth: Record<number, typeof dailyFiles> = {};
    const noMonth: typeof dailyFiles = [];

    for (const f of dailyFiles) {
      if (f.month && f.month >= 1 && f.month <= 12) {
        byMonth[f.month] = byMonth[f.month] || [];
        byMonth[f.month].push(f);
      } else {
        noMonth.push(f);
      }
    }

    return (
      <div>
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <CalendarOutlined /> 逐日降水量对照表：按月份分表，共12个月，每月一份。上传时系统自动从文件名识别月份。
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Upload
            multiple
            showUploadList={{ showDownloadIcon: false, showRemoveIcon: false }}
            beforeUpload={(file) => {
              uploadRegionFile(regionName, "daily", file)
                .then(() => message.success(`${file.name} 已上传`))
                .catch(() => message.error(`${file.name} 上传失败`))
                .finally(() => {
                  setRegionDetails((prev) => {
                    const d = { ...prev };
                    delete d[regionName];
                    return d;
                  });
                  loadRegionDetail(regionName);
                });
              return false;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />}>
              批量上传逐日降水量文件（自动识别月份）
            </Button>
          </Upload>
        </div>

        <Row gutter={[12, 12]}>
          {MONTH_NAMES.map((mName, idx) => {
            const monthNum = idx + 1;
            const monthFiles = byMonth[monthNum] || [];
            const hasFile = monthFiles.length > 0;

            return (
              <Col key={monthNum} xs={24} sm={12} md={8} lg={6} xl={4}>
                <Card
                  size="small"
                  title={mName}
                  style={{ borderColor: hasFile ? "#52c41a" : "#d9d9d9" }}
                  extra={hasFile ? <Tag color="green">已上传</Tag> : <Tag>待上传</Tag>}
                >
                  {hasFile ? (
                    monthFiles.map((f) => renderFileLink(regionName, f))
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>暂无文件</Text>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>

        {noMonth.length > 0 && (
          <Card size="small" title="未识别月份的逐日文件" style={{ marginTop: 12 }}>
            {noMonth.map((f) => renderFileLink(regionName, f))}
          </Card>
        )}

        <Divider />

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card
              size="small"
              title={CATEGORY_LABELS.period_max}
              extra={
                <Button size="small" icon={<UploadOutlined />} onClick={() => openUploadModal(regionName, "period_max")}>
                  上传
                </Button>
              }
            >
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
                {CATEGORY_DESC.period_max}
              </Text>
              {periodMaxFiles.length === 0 ? (
                <Text type="secondary">暂无文件</Text>
              ) : (
                periodMaxFiles.map((f) => renderFileLink(regionName, f))
              )}
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              size="small"
              title={CATEGORY_LABELS.monthly}
              extra={
                <Button size="small" icon={<UploadOutlined />} onClick={() => openUploadModal(regionName, "monthly")}>
                  上传
                </Button>
              }
            >
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
                {CATEGORY_DESC.monthly}
              </Text>
              {monthlyFiles.length === 0 ? (
                <Text type="secondary">暂无文件</Text>
              ) : (
                monthlyFiles.map((f) => renderFileLink(regionName, f))
              )}
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  function renderDetectionStats(result: RegionDetectResult | AllDetectResult | null) {
    if (!result) return null;

    const byStation = "by_station" in result ? result.by_station : {};
    const byRegion = "by_region" in result ? result.by_region : undefined;

    return (
      <Card title="检测结果" style={{ marginTop: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Statistic title="总异常数" value={result.total_flags} />
          </Col>
          <Col span={4}>
            <Statistic title="严重" value={result.severe_count} valueStyle={{ color: "#ff4d4f" }} />
          </Col>
          <Col span={4}>
            <Statistic title="警告" value={result.warning_count} valueStyle={{ color: "#faad14" }} />
          </Col>
          <Col span={4}>
            <Statistic title="一般" value={result.general_count} valueStyle={{ color: "#52c41a" }} />
          </Col>
          <Col span={4}>
            <Statistic title="提示" value={result.info_count} valueStyle={{ color: "#1890ff" }} />
          </Col>
        </Row>

        {byRegion && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>按区域统计：</Text>
            <div style={{ marginTop: 8 }}>
              {Object.entries(byRegion).map(([rName, stats]) => (
                <Tag key={rName} style={{ marginBottom: 4 }}>
                  {rName}: {stats.total} 条
                  <span style={{ color: "#ff4d4f" }}> {stats.Severe}严重</span>
                  <span style={{ color: "#faad14" }}> {stats.Warning}警告</span>
                </Tag>
              ))}
            </div>
          </div>
        )}

        <Text strong>按站点统计：</Text>
        <div style={{ marginTop: 8 }}>
          {Object.entries(byStation).map(([sName, stats]) => (
            <Tag key={sName} style={{ marginBottom: 4 }}>
              {sName}: {stats.total} 条
              <span style={{ color: "#ff4d4f" }}> {stats.Severe}严重</span>
              <span style={{ color: "#faad14" }}> {stats.Warning}警告</span>
              <span style={{ color: "#52c41a" }}> {stats.General}一般</span>
              <span style={{ color: "#1890ff" }}> {stats.Info}提示</span>
            </Tag>
          ))}
        </div>

        <Divider />

        <Table
          dataSource={result.results.slice(0, 50)}
          rowKey={(r: DetectionResult, idx?: number) => `${r.station_id}-${r.datetime}-${r.detector}-${idx ?? 0}`}
          size="small"
          scroll={{ x: 1200 }}
          columns={[
            { title: "站点", dataIndex: "station_id", key: "station_id", width: 80 },
            { title: "时间", dataIndex: "datetime", key: "datetime", width: 150 },
            {
              title: "数据表",
              dataIndex: "data_type",
              key: "data_type",
              width: 110,
              render: (v: string) => CATEGORY_LABELS[v] || v,
            },
            { title: "实测值", dataIndex: "value", key: "value", width: 70 },
            { title: "检测器", dataIndex: "detector", key: "detector", width: 140 },
            { title: "触发规则", dataIndex: "trigger_rule", key: "trigger_rule", ellipsis: true },
            {
              title: "级别",
              dataIndex: "flag_level",
              key: "flag_level",
              width: 70,
              render: (v: string) => <Tag color={FLAG_COLORS[v]}>{v}</Tag>,
            },
            {
              title: "说明",
              dataIndex: "detail",
              key: "detail",
              ellipsis: true,
              render: (v: string) => (
                <span style={{ fontSize: 12, color: "#666" }}>{v}</span>
              ),
            },
          ]}
          pagination={result.results.length > 50 ? { pageSize: 50 } : false}
        />
      </Card>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            createRegionForm.resetFields();
            setCreateRegionModal(true);
          }}
        >
          新增区域
        </Button>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={detectLoading.__all__}
          onClick={handleDetectAll}
        >
          检测全部区域
        </Button>
        <Button icon={<ReloadOutlined />} onClick={loadRegions} loading={loading}>
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Collapse
          activeKey={activeKeys}
          onChange={(keys) => {
            const keyList = typeof keys === "string" ? [keys] : keys;
            setActiveKeys(keyList);
            for (const k of keyList) {
              loadRegionDetail(k);
            }
          }}
          items={regions.map((region) => {
            const detail = regionDetails[region.name];
            return {
              key: region.name,
              label: (
                <Space>
                  <Text strong>{region.name}</Text>
                  <Tag>{region.station_count} 个站点</Tag>
                  <Tag>{region.file_count} 个文件</Tag>
                </Space>
              ),
              extra: (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    loading={detectLoading[region.name]}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDetectRegion(region.name);
                    }}
                  >
                    检测
                  </Button>
                  <Popconfirm
                    title={`确定删除区域 ${region.name} 及其所有数据？`}
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDeleteRegion(region.name);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </Space>
              ),
              children: (
                <div>
                  <Tabs
                    items={[
                      {
                        key: "stations",
                        label: (
                          <Space size={4}>
                            <span>站点与摘录表</span>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              (每站一份降水摘录表)
                            </Text>
                          </Space>
                        ),
                        children: renderTabStations(region.name, detail),
                      },
                      {
                        key: "daily",
                        label: (
                          <Space size={4}>
                            <CalendarOutlined />
                            <span>逐日降水量对照表</span>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              (按月份分表)
                            </Text>
                          </Space>
                        ),
                        children: renderTabDaily(region.name, detail),
                      },
                    ]}
                  />
                </div>
              ),
            };
          })}
        />
      </Spin>

      {renderDetectionStats(detectResults || allDetectResults)}

      <Modal
        title="新增区域"
        open={createRegionModal}
        confirmLoading={createRegionLoading}
        onOk={handleCreateRegion}
        onCancel={() => {
          setCreateRegionModal(false);
          createRegionForm.resetFields();
        }}
      >
        <Form form={createRegionForm} layout="vertical">
          <Form.Item
            name="name"
            label="区域名称"
            rules={[{ required: true, message: "请输入区域名称" }]}
          >
            <Input placeholder="如: 咸阳" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingStation ? "编辑站点" : "新增站点"}
        open={stationModal}
        onOk={handleStationSave}
        onCancel={() => setStationModal(false)}
      >
        <Form form={stationForm} layout="vertical">
          <Form.Item name="name" label="站点名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="longitude" label="经度">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="latitude" label="纬度">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="elevation" label="高程(m)">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="obs_type" label="观测方式">
            <Select
              options={[
                { value: "auto", label: "自动站" },
                { value: "manual", label: "人工站" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`上传文件 - ${uploadRegion}`}
        open={uploadModal}
        onOk={handleUpload}
        onCancel={() => setUploadModal(false)}
      >
        <Form layout="vertical">
          <Form.Item label="文件类别">
            <Select
              value={uploadCategory}
              onChange={setUploadCategory}
              options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Form.Item>
          <Form.Item label="选择文件">
            <Upload
              beforeUpload={(file) => {
                setUploadFile(file);
                return false;
              }}
              maxCount={1}
              onRemove={() => setUploadFile(null)}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
