# 需求实施计划

- [x] 1. 项目骨架搭建
  - 创建 server/ 和 client/ 目录结构，初始化 Python 虚拟环境和 React+Vite 项目
  - 安装后端依赖（FastAPI、pandas、numpy、scipy、PyYAML、openpyxl、pydantic）
  - 安装前端依赖（React 18、TypeScript、Ant Design 5、axios）
  - 配置 Vite 反向代理（`/api` → `localhost:8000`）和 `allowedHosts: ['.monkeycode-ai.online']`
  - reference: requirements #13, #15

- [x] 2. 后端数据模型与解析器
  - [x] 2.1 实现 Pydantic 数据模型（Station、RainfallExcerpt、DailyPrecip、MonthlyYearly、PeriodMax、DetectionResult、Report）
  - [x] 2.2 实现 CSV/Excel 解析器（parser.py）——将四种表文件解析为 DataFrame，自动识别列名映射，处理空值和带"*"的降雪标记
  - [x] 2.3 实现 StationLoader（station_loader.py）——扫描 data/ 目录下所有 RegionalStation*/ 子目录，读取各站 station.yaml 和数据表文件，返回结构化数据

- [x] 3. 检测引擎核心
  - [x] 3.1 实现 BaseDetector 抽象基类和 Detector Registry 注册机制
  - [x] 3.2 实现 PersistentTraceDetector（持续性微量降雨检测）
  - [x] 3.3 实现 StagnationDetector（僵直值检测）
  - [x] 3.4 实现 ClimateExtremeDetector（气候极值检查）
  - [x] 3.5 实现 JumpStepDetector（突跳/阶跃检测）
  - [x] 3.6 实现 CrossStationComparator（跨站横向对比）

- [x] 4. 检测引擎输出层
  - [x] 4.1 实现 QualityFlagEngine——根据各检测器配置段中的 *_tiers 映射四级标记级别
  - [x] 4.2 实现 ReportGenerator——生成 Report 对象和单站 Excel 文件
  - [x] 4.3 实现 DetectionPipeline——编排检测全流程

- [x] 5. 检查点 - 验证后端检测引擎可独立运行
  - 使用示例数据验证 Pipeline 输出正确的 DetectionResult 列表和 Excel 文件
  - 确保所有阈值从配置正确读取

- [x] 6. 后端 API 端点
  - [x] 6.1 实现站点管理 API
  - [x] 6.2 实现文件上传 API
  - [x] 6.3 实现配置管理 API
  - [x] 6.4 实现检测执行 API 和结果查询 API
  - [x] 6.5 实现 Excel 下载 API

- [x] 7. 检查点 - 验证后端 API 全部可用

- [x] 8. 前端页面开发
  - [x] 8.1 实现站点管理页面
  - [x] 8.2 实现数据上传组件
  - [x] 8.3 实现阈值配置页面
  - [x] 8.4 实现检测执行与结果页面
  - [x] 8.5 实现汇总统计组件和 Excel 下载

- [x] 9. 最终检查点 - 端到端验证
  - 创建示例站点目录和测试数据，通过 Web 界面执行完整流程
  - 确认 Excel 文件格式和内容正确
