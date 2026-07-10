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

  return { init };
})();

document.addEventListener('DOMContentLoaded', SettingsPanel.init);
