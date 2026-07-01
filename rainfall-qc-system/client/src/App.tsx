import { useState, Suspense, lazy } from "react";
import { Layout, Menu, Typography, Spin } from "antd";
import {
  EnvironmentOutlined,
  SettingOutlined,
  BugOutlined,
  BarChartOutlined,
} from "@ant-design/icons";

const RegionPage = lazy(() => import("./pages/RegionPage"));
const ConfigPage = lazy(() => import("./pages/ConfigPage"));
const DetectionPage = lazy(() => import("./pages/DetectionPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

export default function App() {
  const [tab, setTab] = useState("regions");

  const items = [
    { key: "regions", icon: <EnvironmentOutlined />, label: "区域站点管理" },
    { key: "config", icon: <SettingOutlined />, label: "阈值配置" },
    { key: "detection", icon: <BugOutlined />, label: "质量检测" },
    { key: "reports", icon: <BarChartOutlined />, label: "检测报告" },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Title level={5} style={{ color: "#fff", margin: 0 }}>
            雨量质控系统
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[tab]}
          items={items}
          onClick={({ key }) => setTab(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", padding: "0 24px", borderBottom: "1px solid #f0f0f0" }}>
          <Title level={4} style={{ margin: "16px 0" }}>
            {items.find((i) => i.key === tab)?.label}
          </Title>
        </Header>
        <Content style={{ margin: 24, background: "#fff", padding: 24, borderRadius: 8 }}>
          <Suspense fallback={<div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>}>
            {tab === "regions" && <RegionPage />}
            {tab === "config" && <ConfigPage />}
            {tab === "detection" && <DetectionPage />}
            {tab === "reports" && <ReportPage />}
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
