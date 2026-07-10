"use strict";

// ============================================================
// Settings Panel — Client-side logic
// ============================================================

const SettingsPanel = (() => {
  let isOpen = false;
  let activeTab = 'llm';

  // DOM refs (populated on init)
  const el = {};

  function init() {
    el.overlay = document.getElementById('settings-overlay');
    el.drawer  = document.getElementById('settings-drawer');
    el.gearBtn = document.getElementById('settings-btn');
    el.closeBtn = document.getElementById('settings-close-btn');
    el.tabs    = document.querySelectorAll('.settings-tab');
    el.panels  = document.querySelectorAll('.settings-tab-content');
    el.saveBtn = document.getElementById('settings-save-btn');
    el.testSSH = document.getElementById('test-ssh-btn');
    el.testSSHResult = document.getElementById('test-ssh-result');
    el.toast   = document.getElementById('settings-toast');

    // Form fields
    el.provider  = document.getElementById('set-provider');
    el.apiKey    = document.getElementById('set-api-key');
    el.toggleKey = document.getElementById('toggle-api-key');
    el.modelName = document.getElementById('set-model-name');
    el.baseUrl   = document.getElementById('set-base-url');
    el.sshHost   = document.getElementById('set-ssh-host');
    el.sshPort   = document.getElementById('set-ssh-port');
    el.sshUser   = document.getElementById('set-ssh-user');
    el.sshKeyPath = document.getElementById('set-ssh-key-path');
    el.sandboxRoot = document.getElementById('set-sandbox-root');

    // Server tab
    el.serverUpdateBtn  = document.getElementById('server-update-btn');
    el.serverRestartBtn = document.getElementById('server-restart-btn');
    el.serverLog        = document.getElementById('server-log');
    el.srvUptime        = document.getElementById('srv-uptime');
    el.srvNode          = document.getElementById('srv-node');
    el.srvPlatform      = document.getElementById('srv-platform');
    el.srvMemory        = document.getElementById('srv-memory');

    // Events
    el.gearBtn.addEventListener('click', toggle);
    el.overlay.addEventListener('click', (e) => {
      if (e.target === el.overlay) close();
    });
    el.closeBtn.addEventListener('click', close);
    el.tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    el.saveBtn.addEventListener('click', save);
    el.testSSH.addEventListener('click', testSSH);
    el.toggleKey.addEventListener('click', toggleApiKeyVisibility);
    el.serverUpdateBtn.addEventListener('click', serverUpdate);
    el.serverRestartBtn.addEventListener('click', serverRestart);

    // Provider change → auto-fill model name hint
    el.provider.addEventListener('change', updateModelHint);

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function open() {
    isOpen = true;
    loadSettings();
    el.overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      el.overlay.classList.add('visible');
      el.drawer.classList.add('open');
    });
  }

  function close() {
    isOpen = false;
    el.overlay.classList.remove('visible');
    el.drawer.classList.remove('open');
    setTimeout(() => el.overlay.classList.add('hidden'), 300);
  }

  function switchTab(tabName) {
    activeTab = tabName;
    el.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    el.panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));
    if (tabName === 'server') loadServerStatus();
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();

      el.provider.value   = data.PRIMARY_LLM || 'groq';
      el.apiKey.value     = data.API_KEY || '';
      el.modelName.value  = data.MODEL_NAME || '';
      el.baseUrl.value    = data.BASE_URL || '';
      el.sshHost.value    = data.SSH_HOST || '';
      el.sshPort.value    = data.SSH_PORT || 22;
      el.sshUser.value    = data.SSH_USER || '';
      el.sshKeyPath.value = data.SSH_KEY_PATH || '~/.ssh/id_ed25519';
      el.sandboxRoot.value = data.SANDBOX_ROOT || '~/AI_Sandbox';

      updateModelHint();
    } catch (err) {
      showToast('❌ Failed to load settings: ' + err.message, 'error');
    }
  }

  async function save() {
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving…';

    const payload = {
      PRIMARY_LLM: el.provider.value,
      API_KEY: el.apiKey.value,
      MODEL_NAME: el.modelName.value,
      BASE_URL: el.baseUrl.value || undefined,
      SSH_HOST: el.sshHost.value,
      SSH_PORT: Number(el.sshPort.value),
      SSH_USER: el.sshUser.value,
      SSH_KEY_PATH: el.sshKeyPath.value,
      SANDBOX_ROOT: el.sandboxRoot.value,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ ' + data.message, 'success');
      } else {
        showToast('❌ ' + data.message, 'error');
      }
    } catch (err) {
      showToast('❌ Network error: ' + err.message, 'error');
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = '💾 Save Settings';
    }
  }

  async function testSSH() {
    el.testSSH.disabled = true;
    el.testSSH.textContent = 'Testing…';
    el.testSSHResult.className = 'test-result';
    el.testSSHResult.textContent = '';

    const payload = {
      SSH_HOST: el.sshHost.value,
      SSH_PORT: Number(el.sshPort.value),
      SSH_USER: el.sshUser.value,
      SSH_KEY_PATH: el.sshKeyPath.value,
    };

    try {
      const res = await fetch('/api/settings/test-ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      el.testSSHResult.className = 'test-result ' + (data.success ? 'success' : 'error');
      el.testSSHResult.textContent = data.success
        ? '✅ ' + data.message
        : '❌ ' + data.message;
    } catch (err) {
      el.testSSHResult.className = 'test-result error';
      el.testSSHResult.textContent = '❌ Network error';
    } finally {
      el.testSSH.disabled = false;
      el.testSSH.textContent = '🔌 Test Connection';
    }
  }

  function toggleApiKeyVisibility() {
    const isPassword = el.apiKey.type === 'password';
    el.apiKey.type = isPassword ? 'text' : 'password';
    el.toggleKey.textContent = isPassword ? '🙈' : '👁';
  }

  function updateModelHint() {
    const hints = {
      groq: 'llama-3.3-70b-versatile',
      gemini: 'gemini-2.0-flash',
      openai: 'gpt-4o',
      deepseek: 'deepseek-chat',
    };
    el.modelName.placeholder = hints[el.provider.value] || 'model-name';
  }

  function showToast(message, type) {
    el.toast.textContent = message;
    el.toast.className = 'settings-toast visible ' + type;
    clearTimeout(el.toast._timer);
    el.toast._timer = setTimeout(() => {
      el.toast.className = 'settings-toast';
    }, 4000);
  }

  // ── Server Control Functions ────────────────────────

  async function loadServerStatus() {
    try {
      const res = await fetch('/api/server/status');
      const data = await res.json();
      el.srvUptime.textContent = data.uptime;
      el.srvNode.textContent = data.nodeVersion;
      el.srvPlatform.textContent = `${data.platform} (${data.arch})`;
      el.srvMemory.textContent = `${data.memoryMB} MB`;
    } catch {
      el.srvUptime.textContent = 'Offline';
      el.srvNode.textContent = '—';
      el.srvPlatform.textContent = '—';
      el.srvMemory.textContent = '—';
    }
  }

  async function serverUpdate() {
    el.serverUpdateBtn.disabled = true;
    el.serverUpdateBtn.querySelector('strong').textContent = 'Updating…';
    el.serverLog.textContent = '⏳ Running: git pull && npm install && npm run build...\n';
    el.serverLog.style.display = 'block';

    try {
      const res = await fetch('/api/server/update', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        el.serverLog.textContent += '✅ ' + data.message + '\n';
        if (data.stdout) el.serverLog.textContent += '\n' + data.stdout;
        showToast('✅ Update completed!', 'success');
      } else {
        el.serverLog.textContent += '❌ ' + data.message + '\n';
        if (data.stderr) el.serverLog.textContent += '\n' + data.stderr;
        showToast('❌ Update failed', 'error');
      }
    } catch (err) {
      el.serverLog.textContent += '❌ Network error: ' + err.message + '\n';
      showToast('❌ Network error', 'error');
    } finally {
      el.serverUpdateBtn.disabled = false;
      el.serverUpdateBtn.querySelector('strong').textContent = 'Update & Rebuild';
    }
  }

  async function serverRestart() {
    if (!confirm('Bạn có chắc muốn restart server? Trang sẽ tạm mất kết nối trong vài giây.')) return;

    el.serverRestartBtn.disabled = true;
    el.serverRestartBtn.querySelector('strong').textContent = 'Restarting…';

    try {
      await fetch('/api/server/restart', { method: 'POST' });
      showToast('🔄 Server đang khởi động lại...', 'success');

      // Poll until server comes back
      setTimeout(() => pollServerReady(0), 3000);
    } catch {
      showToast('❌ Failed to restart', 'error');
      el.serverRestartBtn.disabled = false;
      el.serverRestartBtn.querySelector('strong').textContent = 'Restart Server';
    }
  }

  function pollServerReady(attempts) {
    if (attempts > 20) {
      showToast('❌ Server không phản hồi sau 30s. Kiểm tra terminal Pi.', 'error');
      el.serverRestartBtn.disabled = false;
      el.serverRestartBtn.querySelector('strong').textContent = 'Restart Server';
      return;
    }
    fetch('/api/server/status')
      .then(r => r.json())
      .then(() => {
        showToast('✅ Server đã khởi động lại thành công!', 'success');
        el.serverRestartBtn.disabled = false;
        el.serverRestartBtn.querySelector('strong').textContent = 'Restart Server';
        loadServerStatus();
      })
      .catch(() => setTimeout(() => pollServerReady(attempts + 1), 1500));
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SettingsPanel.init);
} else {
  SettingsPanel.init();
}
