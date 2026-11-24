# 🔒 安全加固指南 - Airports 项目

## 📋 问题诊断报告

### ❌ **已发现的高危风险**

1. **明文凭证泄露**
   - Gmail 邮箱：`collector@example.invalid` 等至少 50 次暴露
   - 密码明文：`fixture-password-not-for-use`, `R12wgetcl9K` 等直接写入代码
   - 验证码：`524294`, `839812` 等实时验证码被记录

2. **Chrome 配置文件风险**
   - `_chrome_r10/` 和 `_r9_gmail_profile/` 包含完整的浏览器会话数据
   - 可能包含登录 Cookie、Local Storage、IndexedDB 等敏感信息

3. **缺乏访问控制**
   - `data.js` 是公开数据文件，没有权限验证
   - 如果部署到服务器，任何人都可以下载

---

## 🚨 紧急修复措施（立即执行）

### 步骤 1: 删除敏感信息

运行脱敏脚本:
```bash
cd <LEGACY_APP_DIR>
python sanitize_sensitive_data.py
```

这个脚本会自动:
- ✅ 替换所有邮箱为 `[邮箱已脱敏]`
- ✅ 清除所有密码明文
- ✅ 隐藏验证码数字

### 步骤 2: 清理 Chrome 配置文件

**重要警告**: 这些文件夹包含你的浏览器隐私数据！

```powershell
# 方案 A: 彻底删除（推荐）
Remove-Item -Recurse -Force "./<legacy-chrome-profile>"
Remove-Item -Recurse -Force "./<legacy-mail-profile>"

# 方案 B: 迁移到外部存储（如果需要保留数据）
Move-Item "./<legacy-chrome-profile>" "<OFFLINE_BACKUP_DIR>/chrome_cache"
```

### 步骤 3: 创建 .gitignore

防止敏感文件被提交到 Git:

```bash
# .gitignore 内容
# 临时文件和备份
backup_*.py
*_backup.py
*.backup_*
_temp_*.py
_.py  # 以_开头的测试脚本

# Chrome 配置数据
_chrome*/
_*_profile/
*Profile*/

# Python 缓存
__pycache__/
*.pyc
*.pyo

# IDE
.vscode/
.idea/
*.swp

# 日志
*.log
logs/

# Node.js
node_modules/
package-lock.json

# 其他敏感文件
.env
.env.local
*.pem
*.key
credentials.json
```

---

## 🛡️ 长期安全防护方案

### 1. 敏感信息管理

**禁止在代码中硬编码敏感信息**,使用环境变量:

```javascript
// ❌ 错误做法
const TEST_EMAIL = "collector@example.invalid";
const TEST_PASSWORD = "fixture-password-not-for-use";

// ✅ 正确做法
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
```

创建 `.env.example` (提交到 git):
```env
# 测试账号（请使用临时邮箱，不要用真实邮箱！）
TEST_EMAIL=your_test@tempmail.com
TEST_PASSWORD=your_temp_password

# API 密钥（如果有）
GOOGLE_API_KEY=
OPENAI_API_KEY=
```

### 2. 数据分层策略

将数据分为三个层级:

| 层级 | 内容 | 存储方式 | 访问控制 |
|------|------|---------|---------|
| **public** | 机场名称、价格、标签 | 公开的 JSON | 无需验证 |
| **internal** | 面板 URL、API 端点 | 加密存储 | 内部网络 |
| **secret** | 注册账号、密码、Cookie | 本地环境变量 | 仅开发者 |

示例结构:
```
data/
├── public/              # 公开数据
│   ├── airports.json
│   └── prices.json
├── internal/            # 内部数据（需加密）
│   └── panels.enc       # 使用 AES 加密
└── secret/              # 个人凭据（不上传）
    └── .env             # 本地环境文件
```

### 3. 部署防护

如果要将项目部署到服务器:

#### Nginx 安全配置 (`nginx.conf`)
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 根目录（公开静态文件）
    root /var/www/airports/public;
    
    # 禁止访问敏感目录
    location ~ ^/(internal|secret|backup) {
        deny all;
        return 403;
    }
    
    # 限制 data.js 下载频率
    location = /data.js {
        limit_req zone=api burst=10 nodelay;
        
        add_header Cache-Control "public, max-age=3600";
        add_header X-RateLimit-Remaining $limit_req_leaky;
    }
    
    # 启用安全头
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# 限流区域定义
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

#### Docker Compose 防护
```yaml
version: '3'

services:
  vpn-finder:
    build: .
    container_name: vpn_finder_app
    ports:
      - "443:443"  # 只暴露 HTTPS
    restart: unless-stopped
    
    # 资源限制
    mem_limit: 256m
    cpus: 0.5
    
    # 安全选项
    security_opt:
      - no-new-privileges:true
    
    # 只读文件系统（除了必要目录）
    read_only: true
    tmpfs:
      - /tmp
      - /var/cache/nginx
    
    volumes:
      - ./public:/usr/share/nginx/html:ro
      # 敏感数据通过 secrets 挂载
      - secrets/data_secrets:/etc/secrets/data:ro
```

### 4. 监控与审计

#### 访问日志记录
```python
# middleware/access_log.py
import logging
from datetime import datetime

logger = logging.getLogger('access')

def log_access(request):
    logger.info({
        'timestamp': datetime.utcnow().isoformat(),
        'ip': request.ip_address,
        'user_agent': request.user_agent,
        'path': request.path,
        'method': request.method,
    })
```

#### 定期扫描敏感信息
```bash
#!/bin/bash
# scripts/check_sensitive.sh

echo "🔍 扫描代码库中的敏感信息..."

# 检查邮箱模式
grep -rn "@gmail\.com" src/ --include="*.js" --include="*.py"

# 检查密码关键词
grep -rn "password\|pwd\|passwd" src/ --include="*.js" --include="*.py" | grep -v "process.env"

# 检查 API Key
grep -rn "API_KEY\|SECRET_KEY\|TOKEN" src/ --include="*.js" --include="*.py" | grep -v "example"

echo "✅ 扫描完成"
```

---

## 📞 应急响应预案

### 如果发现凭证已泄露:

1. **立即修改相关账号密码**
2. **撤销所有 Session/Cookie**
3. **检查登录历史，登出异常设备**
4. **启用双重验证 (2FA)**
5. **审计访问日志，确认泄露范围**

### 如果是生产环境被爬取:

1. **临时封禁高频 IP**
2. **提高验证码频率**
3. **联系 CDN/防火墙服务商加强防护**
4. **评估是否需要重置相关数据**

---

## 🎯 安全检查清单

- [ ] 已运行 `sanitize_sensitive_data.py` 清理现有数据
- [ ] 已删除 `_chrome_r10/` 和 `_r9_gmail_profile/` 配置文件
- [ ] 已创建 `.gitignore` 并添加到版本控制
- [ ] 已将敏感信息移至环境变量（`.env`）
- [ ] 已在服务器上配置 HTTPS
- [ ] 已设置访问频率限制
- [ ] 已禁用敏感目录的直接访问
- [ ] 已配置访问日志记录
- [ ] 已定期运行敏感信息扫描脚本

---

## 🆘 获取帮助

如有安全问题或疑虑:
- 查看项目的 [README.md](README.md)
- 检查 [SECURITY.md](SECURITY.md) 详细指南
- 联系项目负责人

---

**最后更新时间**: 2026-10-17  
**版本**: v1.0 (Security Hardening Guide)
