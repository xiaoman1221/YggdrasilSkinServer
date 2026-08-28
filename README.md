# YggdrasilSkinServer(YSS)

自托管 Minecraft 皮肤站与 Yggdrasil/authlib-injector 认证服务器。使用Go语言编写


支持Yggdrasil Protocol API

支持Minecraft Profiles

## 技术栈

**后端**
- Go + Gin
- GORM + 主流数据库系统(默认SQLite)
- JWT 认证

**前端**
- React 18 + Vite
- Ant Design 5
- React Router
- axios

### 账号与站点 API

- `POST /api/v1/auth/setup`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- 会话管理、Passkey、头像、外部认证 provider、分权 operator 和图形验证码策略。
- 项目 API 使用统一 envelope 和稳定 `YSSErrorCode`。

### Yggdrasil 协议 API

协议根路径：

```text
/api/yggdrasil
```

常用端点：

```text
GET  /api/yggdrasil
POST /api/yggdrasil/authserver/authenticate
POST /api/yggdrasil/authserver/refresh
POST /api/yggdrasil/authserver/validate
POST /api/yggdrasil/authserver/invalidate
POST /api/yggdrasil/authserver/signout

POST /api/yggdrasil/sessionserver/session/minecraft/join
GET  /api/yggdrasil/sessionserver/session/minecraft/hasJoined
GET  /api/yggdrasil/sessionserver/session/minecraft/profile/{uuid}

POST /api/yggdrasil/api/profiles/minecraft
GET  /api/yggdrasil/textures/{hash}
```

协议端点返回 Yggdrasil/authlib-injector 兼容响应，不套 `/api/v1` 的项目 envelope。

站点首页 `/` 会返回：

```text
X-Authlib-Injector-API-Location: /api/yggdrasil/
```

支持 API Location Indication 的启动器可以通过站点根地址发现协议根路径。

### Minecraft profile

当前用户 API：

```text
GET    /api/v1/profiles/minecraft
POST   /api/v1/profiles/minecraft
GET    /api/v1/profiles/minecraft/{uuid}/textures
PUT    /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
DELETE /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
DELETE /api/v1/profiles/minecraft/{uuid}
```

管理员 API：

```text
GET    /api/v1/admin/minecraft-profiles
GET    /api/v1/admin/minecraft-profiles/{uuid}
GET    /api/v1/admin/users/{user_id}/minecraft-profiles
GET    /api/v1/admin/minecraft-profiles/{uuid}/textures
DELETE /api/v1/admin/minecraft-profiles/{uuid}/textures/{skin|cape}
DELETE /api/v1/admin/minecraft-textures/{hash}
PUT    /api/v1/admin/minecraft-profiles/{uuid}/name
DELETE /api/v1/admin/minecraft-profiles/{uuid}
```

profile name 支持通过用户或管理员 API 受控改名。改名会保留 UUID、材质绑定和审计链路，并临时失效绑定该 profile 的 Yggdrasil token，让启动器通过 refresh 获取新名称。

### 材质系统

站点用户可以先上传 wardrobe 材质，再绑定到 profile：

```text
GET    /api/v1/wardrobe/textures
POST   /api/v1/wardrobe/textures/{skin|cape}
DELETE /api/v1/wardrobe/textures/{texture_id}
PUT    /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
DELETE /api/v1/profiles/minecraft/{uuid}/textures/{skin|cape}
```

启动器或兼容工具可以走 Yggdrasil 上传接口：

```text
PUT    /api/yggdrasil/api/user/profile/{uuid}/{skin|cape}
DELETE /api/yggdrasil/api/user/profile/{uuid}/{skin|cape}
GET    /api/yggdrasil/textures/{hash}
```

上传文件必须是 PNG。服务端会校验 MIME、尺寸、上传开关和 profile 所属关系，把图片重编码为安全 PNG，再按处理后的内容计算 hash。

公共材质库 API 支持用户发布和复用 wardrobe 材质：

```text
GET    /api/v1/texture-library/tags
GET    /api/v1/texture-library/textures
GET    /api/v1/texture-library/textures/{texture_id}
POST   /api/v1/texture-library/textures/{texture_id}/copy
POST   /api/v1/texture-library/textures/{texture_id}/reports
POST   /api/v1/wardrobe/textures/{texture_id}/library-submission
DELETE /api/v1/wardrobe/textures/{texture_id}/library-submission
```

管理员和拥有 `texture_library` scope 的 operator 可以审核提交、管理标签、处理举报和下架公共材质：

```text
GET  /api/v1/admin/texture-library/textures
POST /api/v1/admin/texture-library/textures/{texture_id}/approve
POST /api/v1/admin/texture-library/textures/{texture_id}/reject
POST /api/v1/admin/texture-library/textures/{texture_id}/unpublish

GET  /api/v1/admin/texture-library/reports
POST /api/v1/admin/texture-library/reports/{report_id}/accept
POST /api/v1/admin/texture-library/reports/{report_id}/reject
```

### YSM 模型（Yes Steve Model）

皮肤站支持上传、存储与分发 YSM（Yes Steve Model）模型文件（`.ysm` 加密模型或含模型描述文件的 `.zip` 压缩包），
并可将模型绑定到 Minecraft 档案。YSM 模组通过本地文件夹（`config/yes_steve_model/custom|auth`）加载模型，
玩家可在档案页下载绑定的模型文件放入该目录使用。

```text
GET    /api/v1/wardrobe/ysm                     # 我的 YSM 模型
POST   /api/v1/wardrobe/ysm                     # 上传 .ysm / .zip（multipart: file/name/description）
DELETE /api/v1/wardrobe/ysm/{model_id}          # 删除我的模型
PUT    /api/v1/profiles/minecraft/{uuid}/ysm/{model_id}  # 绑定模型到档案
DELETE /api/v1/profiles/minecraft/{uuid}/ysm    # 解绑档案模型
GET    /ysm/{hash}.ysm|.zip                     # 公开下载链接（静态文件）

# 管理员
GET    /api/v1/admin/ysm
DELETE /api/v1/admin/ysm/{model_id}
```

上传时服务端按文件内容识别格式（`YSGP` 魔数 → ysm；合法 zip 且含 json/yml 描述 → zip），
按 SHA-256 内容 hash 存储。绑定模型的档案，其 Yggdrasil `textures` 属性中会附带 `YSM` 条目
（`{ "YSM": { "url": ..., "name": ... } }`），便于兼容工具发现模型下载地址。

## 项目结构

```text
YggdrasilSkinServer/
├── main.go                     # 入口：加载配置、初始化数据库、注册路由、启动服务
├── config/
│   └── config.go               # 环境变量配置（服务器/数据库/JWT/Yggdrasil/存储/上传）
├── internal/
│   ├── envelope/               # 项目 API 统一响应 envelope + AsterErrorCode
│   ├── model/                  # GORM 模型（User/Session/Profile/Texture/TextureLibrary/Report/AuditLog/Token）
│   ├── database/               # GORM 初始化（SQLite/MySQL/PostgreSQL）+ 自动迁移
│   ├── middleware/             # JWT 认证、operator 分权
│   ├── service/                # 业务逻辑（auth/yggdrasil/profile/texture/texture_library/audit）
│   ├── handler/                # HTTP 处理器（绑定请求 → 调用 service → 写响应）
│   ├── router/                 # 路由注册（/api/v1、/api/yggdrasil、/textures 静态、首页）
│   └── util/                   # jwt / password / uuid / png（校验与重编码）
└── web/                        # 前端（React 18 + Vite + Ant Design 5 + React Router + axios）
    └── src/
        ├── api/                # axios 实例（envelope 解包、鉴权拦截）+ 各模块 API
        ├── stores/             # 登录态管理（AuthProvider）
        ├── router/             # 路由
        ├── layouts/            # 主布局
        └── pages/              # 登录/注册/控制台/材质仓库/公共材质库

```

## 快速开始

### 后端（同时托管前端）

```bash
# 一键：构建前端并启动后端（后端直接托管 ./web/dist）
.\run.ps1

# 或分开执行
cd web && npm run build && cd ..
go run .
```

默认监听 `0.0.0.0:8080`，使用 SQLite（`data/yss.db`），纹理存储在 `data/textures/`。
后端会直接托管前端构建产物 `web/dist/`：访问 `http://localhost:8080` 即为站点界面
（`/api`、`/textures` 等接口路径不会被 SPA fallback 拦截）。
若 `web/dist` 未构建，后端仅返回带 `X-Authlib-Injector-API-Location` 头的最小首页。
首次启动后调用 `POST /api/v1/auth/setup` 初始化管理员：

```bash
curl -X POST http://localhost:8080/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"admin123"}'
```

常用环境变量（均以 `YSS_` 前缀，可覆盖默认值）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `YSS_SERVER_PORT` | `8080` | 监听端口 |
| `YSS_DATABASE_TYPE` | `sqlite` | `sqlite` / `mysql` / `postgres` |
| `YSS_DATABASE_PATH` | `data/yss.db` | SQLite 文件路径 |
| `YSS_JWT_SECRET` | `change-me-in-production` | JWT 密钥（生产环境务必修改） |
| `YSS_STORAGE_BASE_URL` | `http://localhost:8080` | 对外公开地址，用于拼接纹理 URL |
| `YSS_STORAGE_TEXTURE_DIR` | `data/textures` | 纹理存储目录 |
| `YSS_STORAGE_YSM_DIR` | `data/ysm` | YSM 模型存储目录 |
| `YSS_UPLOAD_MAX_YSM_SIZE` | `16777216`（16MB） | 单个 YSM 模型文件大小上限 |
| `YSS_UPLOAD_ENABLED` | `true` | 是否允许上传纹理 |
| `YSS_WEB_DIST` | `web/dist` | 前端构建产物目录（后端托管 SPA） |

### 前端（独立开发模式）

```bash
cd web
npm install
npm run dev     # 开发模式，http://localhost:5173（/api 代理到 :8080）
npm run build   # 生产构建到 web/dist，由后端直接托管
```

前端视觉向 Blessing Skin Server 靠拢：
白底 + 蓝色强调、顶栏 + 侧边栏布局、卡片网格；皮肤/披风以 **skinview3d 3D 预览**
（与 Blessing Skin 同款引擎，懒加载 + 默认 Steve 回退）展示。
「材质仓库」页支持上传与管理 **YSM 模型**（.ysm/.zip），绑定档案并获取下载链接；
`UID = 1` 的用户为超级管理员，可在「站点设置」页修改站点基础设置（含 YSM 上传开关与大小上限），
并可在「模型管理」页管理全部 YSM 模型。

### 接入 authlib-injector

启动器配置服务器地址为站点根地址（如 `http://localhost:8080`）。
站点首页返回 `X-Authlib-Injector-API-Location: /api/yggdrasil/`，支持 API Location Indication 的启动器可自动发现协议根路径。







