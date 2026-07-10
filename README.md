# 🤖 Autonomous OS Agent 2.0

> **Zero-Trust · Human-in-the-Loop (HITL) · Dynamic LLM · Semantic Permission**
>
> Một Agent AI tự động thực thi lệnh hệ điều hành thông qua kiến trúc 3-node phân tán.
> Hệ thống được thiết kế tối ưu cho single-user (cá nhân), với chi phí vận hành 0 đồng (sử dụng 100% Free API), tốc độ cao, tiết kiệm token và đảm bảo an toàn tuyệt đối qua cơ chế Sandbox & Risk Engine.
>
> 🔗 **Repository chính thức:** [https://github.com/talkwitht21-stack/my-agent](https://github.com/talkwitht21-stack/my-agent)

---

## 📐 Kiến trúc 3-Node Phân Tán

Hệ thống được chia làm 3 cụm (nodes) độc lập để đảm bảo bảo mật (tách biệt môi trường thực thi và môi trường điều khiển):

```text
┌──────────────────┐     HTTPS/JSON     ┌───────────────────┐
│  ☁️  LLM Cloud    │◄──────────────────►│  🍓 Gateway Node   │
│  (Groq / Gemini) │   Tool Calls JSON  │  (Raspberry Pi 5) │
└──────────────────┘                     │                   │
                                         │  Fastify + Prisma  │
┌──────────────────┐     SSH (Ed25519)   │  Risk Engine       │
│  💻 Client Node   │◄──────────────────►│  HITL WebSocket    │
│  (Laptop cá nhân)│   stdout/stderr    │  Audit Logger      │
│  ~/AI_Sandbox    │                     └────────┬──────────┘
└──────────────────┘                              │
                                                  │ WebSocket + REST
                                         ┌────────▼──────────┐
                                         │  👤 User (Browser) │
                                         │  Dark Theme Web UI │
                                         └───────────────────┘
```

### Chi tiết các Node:

1. **Client Node (Laptop/PC của bạn):**
   - **Vai trò:** "Dumb Executor" - Chỉ làm nhiệm vụ chạy lệnh.
   - **Yêu cầu:** Chạy OpenSSH Server.
   - **Bảo mật:** KHÔNG lưu bất kỳ API Key nào. KHÔNG chạy code backend. Mọi lệnh bị giam lỏng (confined) trong thư mục `~/AI_Sandbox`.
2. **Gateway Node (Raspberry Pi 5 hoặc Server nhỏ):**
   - **Vai trò:** "Control Plane & Policy Engine".
   - **Yêu cầu:** Chạy backend Node.js (Fastify, TypeScript, Prisma).
   - **Nhiệm vụ:** Chứa API Keys, quản lý Web UI, kết nối LLM, chấm điểm rủi ro (Risk Engine), hiển thị HITL modal qua WebSocket, lưu Audit Log vào SQLite, và SSH xuống Client Node để chạy lệnh.
3. **LLM Server (Cloud APIs):**
   - **Vai trò:** "Reasoning Engine".
   - **Nhiệm vụ:** Nhận ngữ cảnh từ Gateway (đã nén), suy luận và trả về JSON chứa cấu trúc Tool Call (`execute_command`).

## 🔄 Luồng thực thi chi tiết (Execution Flow)

Hệ thống hoạt động dưới dạng **Multi-turn Autonomous Loop** (Vòng lặp đa bước tự chủ):

1. **User Input:** Bạn nhập yêu cầu trên Web UI. Hệ thống tải bối cảnh cũ từ file `.agent_history.md` và `.agent_context.md` (nếu có).
2. **Context Injection:** Pi 5 ghép lịch sử, System Prompt và bối cảnh hiện tại gửi lên LLM Cloud.
3. **Reasoning & Action:** LLM Cloud suy luận và trả về 1 trong 4 hành động (Action):
   - 🔍 **`research`**: Chạy lệnh an toàn (như `ls`, `cat`) để tìm hiểu dự án. Tự động chạy và nạp lại kết quả vào LLM.
   - 📝 **`plan`**: Đề xuất kế hoạch. Sẽ kích hoạt Modal chờ bạn duyệt.
   - ⚡ **`execute`**: Chạy lệnh can thiệp hệ thống (tạo file, biên dịch). Risk Engine sẽ kiểm duyệt và đẩy Modal xin phép bạn (HITL).
   - ✅ **`done`**: Hoàn thành tác vụ và cập nhật bối cảnh vào `.agent_context.md`.
4. **Tự động Fix lỗi:** Nếu bạn cho phép chạy `execute` nhưng lệnh sinh ra lỗi (ví dụ lỗi g++), kết quả lỗi sẽ được trả lại cho LLM. LLM sẽ tự động vòng lại bước `research` hoặc `execute` để tự sửa lỗi cho đến khi thành công.
5. **Execution Logging:** Mọi hành động đều được lưu vào SQLite kèm SHA-256 hash chống sửa đổi và được nối vào file `.agent_history.md` tại thư mục Project.

---

## 🚀 Hướng dẫn Cài đặt & Triển khai Chi tiết

### Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|------------|----------|
| **Node.js** | Version ≥ 18.x |
| **Gateway (Pi 5)** | OS Linux (Raspbian, Ubuntu, Debian), có cài `git`, `node`, `npm` |
| **Client (Laptop)** | Windows/macOS/Linux có chạy OpenSSH Server |
| **API Keys** | Cần ít nhất 1 key: [Groq](https://console.groq.com/keys) (tốc độ cao) hoặc [Gemini](https://aistudio.google.com/app/apikey) (suy luận tốt) |

### Bước 1: Thiết lập Gateway Node (Raspberry Pi 5 / Linux)

1. Clone mã nguồn từ GitHub:
   ```bash
   git clone https://github.com/talkwitht21-stack/my-agent.git /opt/autonomous-os-agent
   cd /opt/autonomous-os-agent
   ```
2. Cài đặt thư viện Node.js:
   ```bash
   npm install
   ```
3. Tạo Database bằng Prisma:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. Biên dịch mã nguồn TypeScript:
   ```bash
   npm run build
   ```
5. Tạo file cấu hình `.env`:
   ```bash
   cp .env.example .env
   ```

### Bước 2: Thiết lập SSH Key (Từ Pi 5 xuống Laptop)

Agent sử dụng chứng thực Ed25519 (không dùng mật khẩu) để SSH.

1. **Trên Pi 5:** Tạo SSH key (nếu chưa có):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
   ```
2. **Copy Public Key sang Laptop:**
   ```bash
   # Thay IP và username bằng của laptop bạn
   ssh-copy-id -i ~/.ssh/id_ed25519.pub your_username@192.168.1.100
   ```
3. **Kiểm tra kết nối (Quan trọng):**
   ```bash
   ssh -i ~/.ssh/id_ed25519 your_username@192.168.1.100 "echo Connection Successful"
   ```

### Bước 3: Thiết lập Sandbox trên Client Node (Laptop)

Thư mục Sandbox là nơi **duy nhất** Agent được phép thực thi lệnh. Agent sẽ bị giam lỏng (confined) hoàn toàn tại đây.

1. Mở terminal trên Laptop (hoặc thông qua SSH).
2. Tạo thư mục làm Sandbox:
   ```bash
   mkdir -p ~/AI_Sandbox
   ```

### Bước 4: Cấu hình biến môi trường (`.env`)

Mở file `.env` trên Pi 5 và điền thông tin:

```ini
# === LLM API Keys (Lấy miễn phí) ===
GROQ_API_KEY=gsk_your_groq_key_here
GEMINI_API_KEY=AIzaSy_your_gemini_key_here

# === SSH Connection (Trỏ tới Laptop của bạn) ===
SSH_HOST=192.168.1.100
SSH_PORT=22
SSH_USER=your_username
SSH_KEY_PATH=~/.ssh/id_ed25519

# === Tùy biến Sandbox ===
# Bạn CÓ THỂ ĐỔI thư mục mặc định sang bất kỳ đâu bạn muốn
# Zero-Trust Validator sẽ tự động khóa mục tiêu vào thư mục này.
SANDBOX_ROOT=~/AI_Sandbox

# === LLM Settings ===
PRIMARY_LLM=groq       # Hỗ trợ openai, groq, deepseek, gemini
# Không cần điền API_KEY và MODEL_NAME ở đây, bạn có thể thiết lập qua Settings Panel trên Web UI!
DATABASE_URL=file:./data/agent.db
```

> **Lưu ý:** Bạn hoàn toàn có thể bỏ qua Bước 4 và tiến hành cấu hình mọi thứ (LLM, SSH, Sandbox) trực tiếp trên giao diện **Settings Panel** của Web UI. Thay đổi sẽ được lưu ngược lại vào file `.env`!

### Bước 5: Khởi chạy Server

Đảm bảo bạn đã cấu hình xong `.env` trước khi chạy.

**Khởi động Server:**
```bash
npm start
```

*(Lưu ý: Bạn cũng có thể dùng `npm run dev` nếu đang code và muốn hot-reload).*

Bạn sẽ thấy log báo hiệu hệ thống đã khởi động thành công:
```text
INFO | Autonomous OS Agent 2.0 running at http://0.0.0.0:8000
```

### Bước 6: Sử dụng
Mở trình duyệt trên bất kỳ máy nào cùng mạng LAN và truy cập: `http://<IP_cua_Pi5>:8000`

### Bước 7: Cập nhật mã nguồn (Khi có phiên bản mới)
Nếu tác giả có cập nhật code mới, bạn cần pull code về và chạy build lại.
**Cách 1 (Khuyên dùng):** Cập nhật thẳng trên Web UI.
- Mở Web UI -> Click biểu tượng Cài đặt (Bánh răng) -> Tab **Server** -> Bấm nút **Update & Rebuild**.

**Cách 2:** Chạy bằng tay dưới Terminal (Raspberry Pi):
```bash
git pull
npm install
npm run build
npm start
```

---

## 🖥️ Hướng dẫn sử dụng Web UI

Web UI được thiết kế Single-Page với Dark Theme (Glassmorphism), tập trung vào trải nghiệm bàn phím (Keyboard-first).

### 1. ⚙️ Settings Panel & Server Controls
Góc trên bên phải có nút **Cài đặt (Gear icon)**. Bấm vào đây sẽ trượt ra một ngăn (drawer) cho phép bạn quản lý:
- **🔑 Tab LLM:** Chọn Provider (Groq/Gemini/OpenAI/DeepSeek) hoặc chọn `+ Add Custom Provider...` để thêm nhà cung cấp tùy ý (vd OpenRouter, LMStudio). Mỗi model/provider lưu một Base URL và API Key độc lập.
- **🖥️ Tab SSH:** Nhập IP, Port, Username, Key Path của máy Windows. Có nút **Test Connection** để thử kết nối ngay trên web.
- **📁 Tab Project:** Chọn `+ Add New Project...` để quản lý nhiều thư mục Sandbox cùng lúc. Chuyển đổi siêu mượt mà không cần sửa code. Mỗi Project có bộ nhớ (history & context) riêng biệt.
- **🍓 Tab Server:** Xem trạng thái server (Uptime, RAM, Node version). Tại đây có nút **Update & Rebuild** (tự động chạy `git pull` -> `npm install` -> `build`) và **Restart Server**.

Mọi thay đổi trên giao diện sẽ được hệ thống tự động lưu vào file `.env` trên Pi.

### 2. Khu vực Chat & Lệnh
- Ô input ở góc trái dưới: Gõ yêu cầu bằng ngôn ngữ tự nhiên (VD: "Kiểm tra xem thư mục này có bao nhiêu file ảnh").
- Nhấn **Enter** để gửi.
- Hệ thống sẽ hiển thị trạng thái xử lý (loading spinner).

### 3. Human-in-the-Loop (HITL) Modal
Nếu LLM đề xuất một lệnh nguy hiểm (Risk Score: 41-70), một Modal sẽ popup ngay giữa màn hình với hiệu ứng border đỏ/vàng nhấp nháy. Modal cung cấp:
- **Lệnh chuẩn bị chạy.**
- **Điểm rủi ro (Risk Score)** & Mức độ (ASK).
- **Lý do (Reasons):** Cụ thể Regex rule nào đã bị vi phạm (VD: `MEDIUM RISK: 'med_rm' matched (+25)`).

**Phím tắt xử lý nhanh:**
- 🟢 Nhấn **`Enter`**: Chấp thuận (Allow) - Lệnh lập tức được thực thi.
- 🔴 Nhấn **`Escape`**: Từ chối (Deny) - Lệnh bị hủy, Agent sẽ được báo là người dùng đã từ chối.

### 4. Trạng thái kết nối
Góc phải trên cùng có chấm tròn biểu thị kết nối WebSocket:
- 🟢 **Connected**: Bạn có thể nhận Modal HITL real-time.
- 🔴 **Disconnected**: Mất kết nối. Hệ thống đang tự động Exponential Backoff (thử lại sau 0.5s, 1s, 2s...) để nối lại.

---

## 🛡️ Đi sâu vào Hệ thống Bảo mật (Zero-Trust Security Core)

Dự án này cực kỳ chú trọng vào bảo mật vì Agent có khả năng chạy Shell command.

### 1. Zero-Trust Path Validator (`path_validator.py`)
Mọi đối số `working_dir` mà LLM sinh ra đều bị ép đi qua lớp kiểm tra:
- Hàm `Path(target).resolve()` sẽ giải mã mọi đường dẫn tương đối (`../`) và **symlinks**.
- Kiểm tra `is_relative_to(sandbox_root)`.
- **Ví dụ chặn đứng:**
  - LLM lừa bằng cách dùng: `working_dir = "../../etc"` ➔ Bị chặn (Path Traversal).
  - LLM lừa bằng cách tạo Symlink trong sandbox trỏ ra ngoài `/etc/passwd` rồi thao tác ➔ Bị chặn khi resolve symlink.

### 2. Risk Engine & Security Policies (`risk_engine.py` & `policies.py`)
Kiểm tra tĩnh lệnh Shell thông qua Regex list (chia làm 4 nhóm):

| Tầng | Mô tả | Regex Rules ví dụ (trong `policies.py`) | Điểm | Xử lý |
|------|-------|-----------------------------------------|------|-------|
| **DENY** | Lệnh phá hoại, Leo thang đặc quyền | ` sudo `, ` rm\s+(-\w*r\w*f)\s+/\s*$`, ` mount `, ` chmod\s+777 ` | 100 | Bị từ chối tự động. |
| **HIGH** | Lệnh can thiệp sâu, mạng, process | ` (curl\|wget) .*\|\s*(ba)?sh `, ` kill\s+-9 `, ` systemctl ` | +40 | Kích hoạt HITL (ASK). |
| **MEDIUM** | Lệnh thay đổi file, git, package | ` rm `, ` pip3?\s+install `, ` docker\s+run ` | +25 | Tùy ngữ cảnh, có thể kích hoạt HITL. |
| **LOW** | Lệnh chỉ đọc (Read-only) | ` ls `, ` cat `, ` grep `, ` find ` | +0 | Chạy tự động (ALLOW). |

**Directory Penalty (+15 điểm):**
Nếu lệnh chứa các thư mục nhạy cảm (`/etc`, `/boot`, `/usr`, `/root`), Risk Engine sẽ tự động cộng thêm 15 điểm.

### 3. Execution Timeout & Truncation (`ssh_client.py`)
- Lệnh bị giam trong khối `asyncio.wait_for(..., timeout=30)`. Tránh tình trạng LLM gọi lệnh `ping 8.8.8.8` (chạy vô hạn) làm treo hệ thống.
- Output (stdout/stderr) bị cắt ngắn (truncate) ở mức **4096 ký tự**. Tránh tràn RAM trên Pi và tiết kiệm token khi gửi lại cho LLM.

### 4. Immutable Audit Trail (Prisma & SQLite)
Mọi hành động (nhận task, kết quả LLM, chấm điểm Risk, quyết định HITL, kết quả chạy lệnh) đều được lưu vào SQLite.
- Dùng Prisma ORM để thao tác nhanh chóng và scale tốt. Đảm bảo lịch sử các lệnh chạy rõ ràng và có thể debug dễ dàng.

---

## 🧠 Hạ tầng LLM (Dynamic Infrastructure)

### 1. Universal Adapter (`universal_adapter.ts`)
Hệ thống sử dụng kiến trúc Adapter tương thích chuẩn OpenAI, dễ dàng map sang các nền tảng Free API như Groq, DeepSeek, hay Gemini.

### 2. Resilience
Tiết kiệm Token (Do Gemini/Groq Free có giới hạn TPM/RPM):
- Tránh tình trạng Context phình to gây quá tải bộ nhớ LLM.

---

## 🔌 API Reference (Cho nhà phát triển)

### 1. REST API

**`POST /api/tasks`** - Gửi task mới
```bash
curl -X POST http://<IP>:8000/api/tasks   -H "Content-Type: application/json"   -d '{"user_message": "Kiểm tra dung lượng ổ đĩa"}'
```
*Kết quả trả về:* JSON `TaskResult` (bao gồm Task ID, command đã chạy, risk score, stdout/stderr, và phản hồi của trợ lý).

**`GET /api/tasks/{task_id}/audits`** - Truy xuất lịch sử
```bash
curl http://<IP>:8000/api/tasks/<task_id>/audits
```

**`GET /api/health`** - Kiểm tra trạng thái
```bash
curl http://<IP>:8000/api/health
```

### 2. WebSocket Protocol (`/ws/hitl`)

Flow của WebSocket HITL:
1. Server đẩy `approval_request`:
   ```json
   {
     "type": "approval_request",
     "task_id": "uuid-...",
     "command": "rm -f temp.txt",
     "risk_score": 45,
     "risk_level": "ask",
     "reasons": ["MEDIUM RISK: 'med_rm' matched (+25)"],
     "matched_policies": ["med_rm"]
   }
   ```
2. Client phản hồi `approval_response`:
   ```json
   {
     "type": "approval_response",
     "task_id": "uuid-...",
     "decision": "allow" // hoặc "deny"
   }
   ```

---

## 🛠️ Cấu hình chạy Production (Systemd)

Để giữ cho Agent chạy 24/7 trên Pi 5, bạn nên dùng Systemd:

1. Tạo file: `sudo nano /etc/systemd/system/os-agent.service`
2. Dán nội dung:
   ```ini
   [Unit]
   Description=Autonomous OS Agent 2.0
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/opt/autonomous-os-agent
   ExecStart=/usr/bin/npm start
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```
3. Kích hoạt và chạy:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable os-agent
   sudo systemctl start os-agent
   ```
4. Xem log theo thời gian thực:
   ```bash
   journalctl -u os-agent -f
   ```

---

## 🚑 Khắc phục sự cố (Troubleshooting)

| Lỗi / Triệu chứng | Nguyên nhân có thể | Cách khắc phục |
|-------------------|--------------------|----------------|
| **tsc: Permission denied** | Mất quyền thực thi của các file binary trong thư mục `node_modules/.bin/` sau khi clone từ Git. | Chạy lệnh `chmod -R +x node_modules/.bin/` hoặc đơn giản là xóa `node_modules` và chạy lại `npm install`. |
| **listen EADDRINUSE: address already in use 0.0.0.0:8000** | Port 8000 đang bị kẹt bởi một process Node.js cũ chưa tắt hẳn (Zombie process). | Tìm và diệt process đang chiếm cổng bằng lệnh: `sudo fuser -k 8000/tcp`. |
| **crypto.randomUUID is not a function** (Lỗi UI) | Hàm này của trình duyệt yêu cầu chuẩn bảo mật HTTPS. Nếu chạy qua HTTP nội bộ (192.168.x.x), hàm này bị vô hiệu hóa. | Sử dụng hàm tạo UUID thủ công (fallback) bằng `Math.random` để thay thế cho `crypto.randomUUID` trên giao diện Web HTTP. |
| **404 Not Found** hoặc **429 Quota Exceeded** (API LLM) | 1. Sai endpoint hoặc model không tồn tại (Ví dụ: `gemini-2.5-flash` chưa được hỗ trợ).<br>2. Hết hạn mức miễn phí (Limit: 0) với Google Gemini. | Chuyển sang sử dụng **GROQ** (model `llama-3.3-70b-versatile` là model mới nhất). Đảm bảo đặt biến môi trường `PRIMARY_LLM=groq` và `MODEL_NAME=llama-3.3-70b-versatile`. |
| **All configured authentication methods failed** (Windows SSH) | 1. Laptop Windows chưa có Public Key của Pi 5.<br>2. Lỗi bảo mật cực đoan của OpenSSH Windows (Bad permissions): File `authorized_keys` bị cấp quyền thừa cho các user/nhóm khác. | 1. Nạp public key của Pi vào `C:\Users\Username\.ssh\authorized_keys`.<br>2. Dùng lệnh `icacls` trên Windows để gỡ toàn bộ các quyền mặc định, **chỉ giữ lại quyền cho SYSTEM** (`icacls authorized_keys /inheritance:r /grant "SYSTEM:F"`). |
| **Web UI hiện hình tròn đỏ (Disconnected)** | Server Node.js bị tắt hoặc bị chặn bởi Firewall. | Đảm bảo `npm start` đang chạy. Mở port 8000 trên firewall Pi 5 (`sudo ufw allow 8000`). |

---

## 📜 License & Disclaimer

- **License:** MIT License. Bạn có thể tự do sửa đổi và sử dụng.
- **Disclaimer:** Hãy hết sức cẩn thận khi cấu hình SSH keys. Không bao giờ chạy Agent bằng tài khoản `root` trên Client Node. Tác giả không chịu trách nhiệm về mọi mất mát dữ liệu do LLM sinh ra các lệnh ngoài ý muốn (dù đã có Risk Engine chặn lọc).
