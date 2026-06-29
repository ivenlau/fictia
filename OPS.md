# Fictia 远程开发环境运维

> 通过公网 + basic auth 在远程机器上调试代码。

## 三个脚本的关系

| 脚本 | 何时跑 | 作用 |
|---|---|---|
| `install-dev.sh` | **首次 / 重新装机器后** | 一键准备环境（依赖、nginx、auth、配置） |
| `start-dev.sh`   | 每次想跑 dev 服务时 | 后台启动 vite + express |
| `stop-dev.sh`    | 想停服务时 | 清理 dev 进程释放 3001/5173 |

`install-dev.sh` 是**幂等**的，重复跑不会破坏现有状态。新机器上克隆完代码后跑一次即可。

## 配置（环境变量）

| 变量 | 默认 | 用途 |
|---|---|---|
| `FICTIA_AUTH_USER` | `admin` | basic auth 用户名 |
| `FICTIA_AUTH_PASS` | `yourpassword` | basic auth 密码（默认是占位符，**必改**） |
| `FICTIA_PUBLIC_IP` | (自动检测) | 公网 IP；自动检测失败时手动设置 |
| `FICTIA_PUBLIC_PORT` | `8080` | 公网暴露端口 |

```bash
# 例：自定义凭据
FICTIA_AUTH_USER=alice FICTIA_AUTH_PASS='s3cret!' ./install-dev.sh

# 例：自动检测不到 IP 时手动指定
FICTIA_PUBLIC_IP=1.2.3.4 ./install-dev.sh
```

修改已写入的凭据：`sudo htpasswd /etc/nginx/.htpasswd <user>`

## 架构

```
Internet (你的公网 IP:8080)
        │  basic auth (见 FICTIA_AUTH_USER/PASS)
        ▼
  ┌──────────┐
  │  nginx   │ 监听 0.0.0.0:8080
  └────┬─────┘
       │ 127.0.0.1
       ▼
  ┌──────────┐
  │  Vite    │ 127.0.0.1:5173  (HMR + 前端静态)
  └────┬─────┘
       │ /api 代理
       ▼
  ┌──────────┐
  │ Express  │ 127.0.0.1:3001  (后端 API + SQLite)
  └──────────┘
```

> 三个进程都不直接暴露到公网。公网只看到 8080/TCP，且有 basic auth。

## 端口分配

| 端口 | 进程 | 绑定 | 公网可访问 |
|---|---|---|---|
| 8080 (或 `FICTIA_PUBLIC_PORT`) | nginx | 0.0.0.0 | ✅ (需 basic auth) |
| 5173 | vite | 127.0.0.1 | ❌ |
| 3001 | express | 127.0.0.1 | ❌ |

## 启动

```bash
/root/code/fictia/start-dev.sh
```

会自动：检查 `@fictia/shared` 是否 build、检查端口冲突、后台启动 `pnpm dev`、等待端口起来再返回。日志写到 `~/fictia-logs/dev.log`。

Vite 的 HMR 是热加载的，改 `apps/web/src/**` 直接生效；改 `apps/server/src/**` 由 `tsx watch` 自动重启 Express；改 `packages/shared/src/**` 需要重新 `pnpm --filter @fictia/shared build` 然后 server 会自动重启（`start-dev.sh` 下次启动时也会自动 build）。

## 停止

```bash
/root/code/fictia/stop-dev.sh
```

会清理 3001/5173 端口并停掉 vite/tsx watch/concurrently。

## 日志

```bash
# 实时
tail -f ~/fictia-logs/dev.log

# 关键字过滤
grep -i error ~/fictia-logs/dev.log
```

## Nginx

```bash
# 改完配置后
sudo nginx -t && sudo systemctl reload nginx

# 配置位置
/etc/nginx/sites-available/fictia
/etc/nginx/.htpasswd          # basic auth 凭据
```

## Basic auth 凭据修改

```bash
# 改密码（保留用户名）
sudo htpasswd /etc/nginx/.htpasswd <username>

# 加新用户
sudo htpasswd /etc/nginx/.htpasswd <new-username>
# 默认会改 nginx 配置（`auth_basic_user_file` 路径不变）
sudo nginx -t && sudo systemctl reload nginx
```

## 公网访问

- URL: `http://<你的公网 IP>:<端口>` — 跑完 `start-dev.sh` 时会打印
- 用户名 / 密码: `install-dev.sh` / `start-dev.sh` 跑完会打印；默认 `admin` / `yourpassword`（**默认密码不安全，公网暴露前必改**）

> ⚠️ 当前是 HTTP（明文），basic auth 走的是 base64，不是 HTTPS。**不要在公共网络下使用**——本机/受信任内网访问即可。需要 HTTPS 的话要加证书（certbot 之类），不在本次搭建范围。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 8080 返回 502 | vite 没起 | 看 `dev.log`，重启 `pnpm dev` |
| 8080 返回 401 | basic auth 失败 | 重新核对用户名/密码 |
| `/api/*` 返回 502 | express 没起 | 看 `dev.log`，检查 3001 端口 |
| 改了 `shared/src/` 没生效 | 忘了 rebuild | `pnpm --filter @fictia/shared build` |
| HMR 不刷新 | ws 透传失败 | `sudo nginx -t && sudo systemctl reload nginx` |
| 8080 访问特别慢 | 第一次 SSR/transform | Vite 第一次冷启动，正常现象 |

## 改了源码但服务没自启？

Vite 和 tsx watch 都会监听文件变化自动重启。如果没反应：

```bash
# 看一下进程在不在
ss -tlnp | grep -E ':(3001|5173) '

# 不在就重启
pkill -f "concurrently" 2>/dev/null
nohup pnpm dev > ~/fictia-logs/dev.log 2>&1 &
disown
```
