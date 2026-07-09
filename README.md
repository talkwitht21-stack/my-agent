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
                                         │  FastAPI + SQLite  │
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
   - **Yêu cầu:** Chạy backend Python (FastAPI).
   - **Nhiệm vụ:** Chứa API Keys, quản lý Web UI, kết nối LLM, chấm điểm rủi ro (Risk Engine), hiển thị HITL modal qua WebSocket, lưu Audit Log vào SQLite, và SSH xuống Client Node để chạy lệnh.
3. **LLM Server (Cloud APIs):**
   - **Vai trò:** "Reasoning Engine".
   - **Nhiệm vụ:** Nhận ngữ cảnh từ Gateway (đã nén), suy luận và trả về JSON chứa cấu trúc Tool Call (`execute_command`).

---

## 🔄 Luồng thực thi chi tiết (Execution Flow)

1. **User Input:** Bạn nhập yêu cầu (VD: *"Xóa các file .log cũ hơn 7 ngày trong mục logs"*) trên Web UI.
2. **Context Compression:** Pi 5 nén lịch sử chat, ghép với System Prompt và gửi lên LLM Cloud.
3. **Reasoning:** LLM Cloud trả về JSON quyết định sẽ chạy lệnh `find ./logs -name "*.log" -mtime +7 -delete`.
4. **Risk Assessment:** Risk Engine trên Pi 5 chấm điểm lệnh này dựa trên các Regex Policies. Điểm rủi ro sẽ rơi vào 3 ngưỡng:
   - 🟢 **ALLOW (0-40):** An toàn, chạy ngay.
   - 🟡 **ASK (41-70):** Rủi ro trung bình, đẩy Modal qua WebSocket lên Web UI chờ bạn duyệt (HITL).
   - 🔴 **DENY (71-100):** Vi phạm chính sách nghiêm trọng (VD: chứa `sudo`, `rm -rf /`), chặn ngay lập tức.
5. **Execution:** Nếu lệnh được ALLOW hoặc bạn đã duyệt (ASK -> Allow), Pi 5 dùng `asyncssh` kết nối xuống Laptop và chạy lệnh trong Sandbox (`cd ~/AI_Sandbox && <command>`).
6. **Audit & Return:** Kết quả (stdout, stderr, exit code) được lưu vào SQLite kèm SHA-256 hash chống sửa đổi, và hiển thị lại cho bạn.

---

## 🚀 Hướng dẫn Cài đặt & Triển khai Chi tiết

### Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|------------|----------|
| **Python** | Version ≥ 3.11 |
| **Gateway (Pi 5)** | OS Linux (Raspbian, Ubuntu, Debian), có cài `git`, `python3-venv` |
| **Client (Laptop)** | Windows/macOS/Linux có chạy OpenSSH Server |
| **API Keys** | Cần ít nhất 1 key: [Groq](https://console.groq.com/keys) (tốc độ cao) hoặc [Gemini](https://aistudio.google.com/app/apikey) (suy luận tốt) |

### Bước 1: Thiết lập Gateway Node (Raspberry Pi 5 / Linux)

1. Clone mã nguồn từ GitHub:
   ```bash
   git clone https://github.com/talkwitht21-stack/my-agent.git /opt/autonomous-os-agent
   cd /opt/autonomous-os-agent
   ```
2. Tạo Virtual Environment (Môi trường ảo):
   ```bash
   # Nếu máy báo thiếu package, hãy cài bằng: sudo apt update && sudo apt install python3-venv
   python3 -m venv venv
   ```
3. Kích hoạt môi trường ảo:
   ```bash
   source venv/bin/activate
   ```
   *(Bạn sẽ thấy chữ `(venv)` hiện lên ở đầu dòng lệnh)*
4. Cài đặt thư viện:
   ```bash
   # Dùng `python -m pip` để tránh lỗi "Externally Managed Environment" (PEP-668) trên Pi 5:
   python -m pip install -r requirements.txt
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
PRIMARY_LLM=groq       # Khuyên dùng Groq cho tốc độ
FALLBACK_LLM=gemini    # Dùng Gemini làm backup
```

### Bước 5: Khởi chạy Server

Đảm bảo bạn đã kích hoạt môi trường ảo `(venv)` trước khi chạy. Lệnh khởi động sẽ khác nhau tùy hệ điều hành:

**Trên Linux / Raspberry Pi 5 / macOS:**
```bash
PYTHONPATH=src python -m agent.main
```

**Trên Windows (PowerShell):**
```powershell
$env:PYTHONPATH="src"; python -m agent.main
```

**Trên Windows (Command Prompt / CMD):**
```cmd
set PYTHONPATH=src && python -m agent.main
```

Bạn sẽ thấy log báo hiệu hệ thống đã khởi động thành công:
```text
INFO | agent | SQLite database initialised at ./data/agent.db
INFO | agent | SSH connection established to 192.168.1.100
INFO | agent | Frontend served from /opt/autonomous-os-agent/frontend
INFO | agent | Starting Agent 2.0 on 0.0.0.0:8000
```

### Bước 6: Sử dụng
Mở trình duyệt trên bất kỳ máy nào cùng mạng LAN và truy cập: `http://<IP_cua_Pi5>:8000`

---

## 🖥️ Hướng dẫn sử dụng Web UI

Web UI được thiết kế Single-Page với Dark Theme (Glassmorphism), tập trung vào trải nghiệm bàn phím (Keyboard-first).

### 1. Khu vực Chat & Lệnh
- Ô input ở góc trái dưới: Gõ yêu cầu bằng ngôn ngữ tự nhiên (VD: "Kiểm tra xem thư mục này có bao nhiêu file ảnh").
- Nhấn **Enter** để gửi.
- Hệ thống sẽ hiển thị trạng thái xử lý (loading spinner).

### 2. Human-in-the-Loop (HITL) Modal
Nếu LLM đề xuất một lệnh nguy hiểm (Risk Score: 41-70), một Modal sẽ popup ngay giữa màn hình với hiệu ứng border đỏ/vàng nhấp nháy. Modal cung cấp:
- **Lệnh chuẩn bị chạy.**
- **Điểm rủi ro (Risk Score)** & Mức độ (ASK).
- **Lý do (Reasons):** Cụ thể Regex rule nào đã bị vi phạm (VD: `MEDIUM RISK: 'med_rm' matched (+25)`).

**Phím tắt xử lý nhanh:**
- 🟢 Nhấn **`Enter`**: Chấp thuận (Allow) - Lệnh lập tức được thực thi.
- 🔴 Nhấn **`Escape`**: Từ chối (Deny) - Lệnh bị hủy, Agent sẽ được báo là người dùng đã từ chối.

### 3. Trạng thái kết nối
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

### 4. Immutable Audit Trail (`sqlite_repo.py` & `audit.py`)
Mọi hành động (nhận task, kết quả LLM, chấm điểm Risk, quyết định HITL, kết quả chạy lệnh) đều được lưu vào SQLite.
- **Tính toàn vẹn (Integrity):** Mỗi record tự động tính `SHA-256 hash` (dựa trên TaskID, Action, Timestamp, Command) lúc khởi tạo model. Đảm bảo lịch sử không thể bị giả mạo.

---

## 🧠 Hạ tầng LLM (Dynamic Infrastructure)

### 1. Dynamic LLM Switcher & Resilience (`switcher.py`)
Hệ thống sử dụng thư viện `tenacity` để xử lý vấn đề API Free hay bị lỗi hoặc hết quota (429 Rate Limit):
- Gọi Provider chính (Mặc định: **Groq - Llama-3.3-70b-versatile**).
- Nếu lỗi, **thử lại (Retry) tối đa 3 lần** với Exponential Backoff (đợi 1s ➔ 2s ➔ 4s ➔ 8s).
- Nếu cả 3 lần đều lỗi, tự động **chuyển (Failover)** sang Provider dự phòng (Mặc định: **Gemini - Gemini-2.0-flash**).
- Ghi nhớ Provider đang hoạt động để dùng cho các request tiếp theo.

### 2. Context Compressor (`compressor.py`)
Tiết kiệm Token (Do Gemini/Groq Free có giới hạn TPM/RPM):
- Dùng cơ chế **Sliding Window**: Chỉ giữ lại `System Prompt` và `N` tin nhắn gần nhất (Mặc định `CONTEXT_WINDOW_SIZE=10`).
- Ước lượng Token rẻ tiền bằng thuật toán `len(string) // 4`.
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
   Environment="PYTHONPATH=src"
   ExecStart=/opt/autonomous-os-agent/venv/bin/python -m agent.main
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
| **Không thể kết nối SSH** (Log báo `SSH connection deferred`) | Laptop đóng port 22, sai username/IP, hoặc chưa copy Public Key. | Chạy `ssh -i ~/.ssh/id_ed25519 user@ip` bằng tay từ Pi 5 để xem lỗi chi tiết. |
| **Path validation failed** (Exit code 126) | LLM cố truy cập file ngoài Sandbox. | Tính năng bảo mật đang hoạt động. Nếu cần đổi Sandbox, hãy sửa `SANDBOX_ROOT` trong `.env`. |
| **Lỗi 'externally managed environment'** | OS chặn `pip install` hệ thống để bảo vệ. | Ép chạy qua venv bằng lệnh: `python -m pip install -r requirements.txt` |
| **Lỗi 'ModuleNotFoundError' (uvicorn)** | Cài đặt package bị thất bại hoặc quên bật venv. | Kích hoạt lại `source venv/bin/activate` và chạy lại `python -m pip install...` |
| **LLM Call Failed / 429 Too Many Requests** | Groq và Gemini đều hết Quota Free. | Chờ 1-2 phút để API reset limit. Kiểm tra Dashboard của Groq/Google. |
| **HITL Approval timed out** | Không ai nhấn Allow/Deny trong 120s. | Mặc định timeout. Lệnh tự động bị Deny để an toàn. Gửi lại yêu cầu. |
| **Web UI hiện hình tròn đỏ (Disconnected)** | Server FastAPI bị tắt hoặc bị chặn bởi Firewall. | Đảm bảo `uvicorn` đang chạy. Mở port 8000 trên firewall Pi 5 (`sudo ufw allow 8000`). |

---

## 📜 License & Disclaimer

- **License:** MIT License. Bạn có thể tự do sửa đổi và sử dụng.
- **Disclaimer:** Hãy hết sức cẩn thận khi cấu hình SSH keys. Không bao giờ chạy Agent bằng tài khoản `root` trên Client Node. Tác giả không chịu trách nhiệm về mọi mất mát dữ liệu do LLM sinh ra các lệnh ngoài ý muốn (dù đã có Risk Engine chặn lọc).
