import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  Space,
  message,
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { fetchStations, createStation, updateStation, uploadTable } from "../api/client";
import type { Station } from "../types";

const TABLE_TYPES = [
  { value: "excerpt", label: "降雨摘录表" },
  { value: "daily", label: "逐日降水表" },
  { value: "monthly", label: "月年降水对照表" },
  { value: "period_max", label: "各时段最大降水量表" },
];

export default function StationPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [form] = Form.useForm();
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadStation, setUploadStation] = useState("");
  const [uploadType, setUploadType] = useState("excerpt");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => { loadStations(); }, []);

  async function loadStations() {
    setLoading(true);
    try {
      const data = await fetchStations();
      setStations(data);
    } catch {
      message.error("加载站点列表失败");
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingStation(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(station: Station) {
    setEditingStation(station);
    form.setFieldsValue(station);
    setModalOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    try {
      if (editingStation) {
        await updateStation(editingStation.name, values);
        message.success("站点已更新");
      } else {
        await createStation(values);
        message.success("站点已创建");
      }
      setModalOpen(false);
      loadStations();
    } catch {
      message.error("操作失败");
    }
  }

  function openUpload(stationName: string) {
    setUploadStation(stationName);
    setUploadFile(null);
    setUploadModal(true);
  }

  async function handleUpload() {
    if (!uploadFile) {
      message.warning("请选择文件");
      return;
    }
    try {
      await uploadTable(uploadStation, uploadType, uploadFile);
      message.success("上传成功");
      setUploadModal(false);
    } catch {
      message.error("上传失败");
    }
  }

  const columns = [
    { title: "站点名", dataIndex: "name", key: "name" },
    { title: "经度", dataIndex: "longitude", key: "longitude" },
    { title: "纬度", dataIndex: "latitude", key: "latitude" },
    { title: "高程(m)", dataIndex: "elevation", key: "elevation" },
    {
      title: "观测方式",
      dataIndex: "obs_type",
      key: "obs_type",
      render: (v: string) => (v === "auto" ? "自动站" : "人工站"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: Station) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" icon={<UploadOutlined />} onClick={() => openUpload(record.name)}>
            上传数据
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
        创建站点
      </Button>
      <Table dataSource={stations} columns={columns} rowKey="name" loading={loading} />

      <Modal
        title={editingStation ? "编辑站点" : "创建站点"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="站点名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="longitude" label="经度" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="latitude" label="纬度" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="elevation" label="高程(m)" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="obs_type" label="观测方式" rules={[{ required: true }]}>
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
        title={`上传数据 - ${uploadStation}`}
        open={uploadModal}
        onOk={handleUpload}
        onCancel={() => setUploadModal(false)}
      >
        <Form layout="vertical">
          <Form.Item label="数据表类型">
            <Select options={TABLE_TYPES} value={uploadType} onChange={setUploadType} />
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
