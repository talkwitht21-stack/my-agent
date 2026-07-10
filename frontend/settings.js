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
    el.apiKeySelect = document.getElementById('set-api-key-select');
    el.apiKeyInputGroup = document.getElementById('api-key-input-group');
    el.toggleKey = document.getElementById('toggle-api-key');
    el.modelName = document.getElementById('set-model-name');
    el.modelNameSelect = document.getElementById('set-model-name-select');
    el.modelNameInputGroup = document.getElementById('model-name-input-group');
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
    el.srvMemory        = document.getElementById('srv-memory');

    el.customProviderGroup = document.getElementById('custom-provider-group');
    el.customProviderName = document.getElementById('set-custom-provider-name');
    el.projectSelect = document.getElementById('set-project');
    el.customProjectGroup = document.getElementById('custom-project-group');
    el.customProjectName = document.getElementById('set-project-name');

    // Delete buttons
    el.deleteProviderBtn = document.getElementById('delete-provider-btn');
    el.deleteApiKeyBtn = document.getElementById('delete-api-key-btn');
    el.deleteModelBtn = document.getElementById('delete-model-btn');
    el.deleteProjectBtn = document.getElementById('delete-project-btn');

    // In-memory state for dynamic lists
    SettingsPanel.customProviders = [];
    SettingsPanel.projects = [];
    SettingsPanel.providerConfigs = {};

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

    // Provider change → auto-fill model name hint or show custom group
    el.provider.addEventListener('change', () => {
      updateModelHint();
      el.customProviderGroup.classList.toggle('hidden', el.provider.value !== '_add_custom_');
      
      // Show delete provider button if it's a custom provider
      el.deleteProviderBtn.classList.toggle('hidden', !el.provider.value.startsWith('custom_'));

      // Render saved API keys and models for this provider
      renderSavedKeysDropdown(el.provider.value);
      renderSavedModelsDropdown(el.provider.value);

      // Auto-fill if selecting an existing custom provider or built-in provider
      if (el.provider.value === '_add_custom_') {
        // Leave as is or clear
      } else if (el.provider.value.startsWith('custom_')) {
        const cp = SettingsPanel.customProviders.find(p => p.id === el.provider.value);
        if (cp) {
          el.baseUrl.value = cp.baseUrl || '';
        }
      }
    });

    el.apiKeySelect.addEventListener('change', () => {
      const isNew = el.apiKeySelect.value === '_new_';
      el.apiKeyInputGroup.classList.toggle('hidden', !isNew);
      el.deleteApiKeyBtn.classList.toggle('hidden', isNew);
      el.apiKey.value = isNew ? '' : el.apiKeySelect.value;
    });

    el.modelNameSelect.addEventListener('change', () => {
      const isNew = el.modelNameSelect.value === '_new_';
      el.modelNameInputGroup.classList.toggle('hidden', !isNew);
      el.deleteModelBtn.classList.toggle('hidden', isNew);
      el.modelName.value = isNew ? '' : el.modelNameSelect.value;
    });

    el.projectSelect.addEventListener('change', () => {
      const isCustom = el.projectSelect.value !== 'default' && el.projectSelect.value !== '_add_project_';
      el.deleteProjectBtn.classList.toggle('hidden', !isCustom);
      el.customProjectGroup.classList.toggle('hidden', el.projectSelect.value !== '_add_project_');
      
      if (el.projectSelect.value === 'default') {
        el.sandboxRoot.value = '~/AI_Sandbox';
      } else {
        const p = SettingsPanel.projects.find(p => p.id === el.projectSelect.value);
        if (p) el.sandboxRoot.value = p.path || '';
      }
    });

    // Delete Events
    el.deleteProviderBtn.addEventListener('click', deleteProvider);
    el.deleteApiKeyBtn.addEventListener('click', deleteApiKey);
    el.deleteModelBtn.addEventListener('click', deleteModel);
    el.deleteProjectBtn.addEventListener('click', deleteProject);

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  function renderSavedKeysDropdown(providerId) {
    el.apiKeySelect.innerHTML = '<option value="_new_">+ Add New API Key...</option>';
    let keys = [];
    if (providerId.startsWith('custom_')) {
      const cp = SettingsPanel.customProviders.find(p => p.id === providerId);
      if (cp && cp.savedKeys) keys = cp.savedKeys;
      else if (cp && cp.apiKey) keys = [cp.apiKey]; // Backwards compatibility
    } else {
      const pc = SettingsPanel.providerConfigs[providerId];
      if (pc && pc.savedKeys) keys = pc.savedKeys;
      else if (pc && pc.apiKey) keys = [pc.apiKey]; // Backwards compatibility
    }

    // Deduplicate and render
    keys = [...new Set(keys.filter(k => k))];
    keys.forEach((key, index) => {
      const opt = document.createElement('option');
      opt.value = key;
      // Show first 4 and last 4 characters for security
      const displayKey = key.length > 10 ? key.slice(0, 4) + '...' + key.slice(-4) : key;
      opt.textContent = `Key ${index + 1} (${displayKey})`;
      el.apiKeySelect.insertBefore(opt, el.apiKeySelect.lastElementChild);
    });

    if (keys.length > 0) {
      el.apiKeySelect.value = keys[0];
      el.apiKeyInputGroup.classList.add('hidden');
      el.deleteApiKeyBtn.classList.remove('hidden');
    } else {
      el.apiKeySelect.value = '_new_';
      el.apiKeyInputGroup.classList.remove('hidden');
      el.deleteApiKeyBtn.classList.add('hidden');
    }
  }

  function renderSavedModelsDropdown(providerId) {
    el.modelNameSelect.innerHTML = '<option value="_new_">+ Add New Model...</option>';
    let models = [];
    if (providerId.startsWith('custom_')) {
      const cp = SettingsPanel.customProviders.find(p => p.id === providerId);
      if (cp && cp.savedModels) models = cp.savedModels;
      else if (cp && cp.modelName) models = [cp.modelName];
    } else {
      const pc = SettingsPanel.providerConfigs[providerId];
      if (pc && pc.savedModels) models = pc.savedModels;
      else if (pc && pc.modelName) models = [pc.modelName];
    }

    models = [...new Set(models.filter(m => m))];
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      el.modelNameSelect.insertBefore(opt, el.modelNameSelect.lastElementChild);
    });

    if (models.length > 0) {
      el.modelNameSelect.value = models[0];
      el.modelNameInputGroup.classList.add('hidden');
      el.deleteModelBtn.classList.remove('hidden');
    } else {
      el.modelNameSelect.value = '_new_';
      el.modelNameInputGroup.classList.remove('hidden');
      el.deleteModelBtn.classList.add('hidden');
    }
  }

  async function deleteProvider() {
    const val = el.provider.value;
    if (!val.startsWith('custom_') || !confirm('Delete this custom provider?')) return;
    SettingsPanel.customProviders = SettingsPanel.customProviders.filter(p => p.id !== val);
    el.provider.value = 'groq'; // fallback
    await save();
    loadSettings();
  }

  async function deleteProject() {
    const val = el.projectSelect.value;
    if (val === 'default' || val === '_add_project_' || !confirm('Delete this project?')) return;
    SettingsPanel.projects = SettingsPanel.projects.filter(p => p.id !== val);
    el.projectSelect.value = 'default';
    await save();
    loadSettings();
  }

  async function deleteApiKey() {
    const key = el.apiKeySelect.value;
    const providerId = el.provider.value;
    if (key === '_new_' || !confirm('Delete this API Key?')) return;

    if (providerId.startsWith('custom_')) {
      const cp = SettingsPanel.customProviders.find(p => p.id === providerId);
      if (cp && cp.savedKeys) {
        cp.savedKeys = cp.savedKeys.filter(k => k !== key);
        if (cp.apiKey === key) cp.apiKey = cp.savedKeys.length > 0 ? cp.savedKeys[0] : '';
      }
    } else {
      const pc = SettingsPanel.providerConfigs[providerId];
      if (pc && pc.savedKeys) {
        pc.savedKeys = pc.savedKeys.filter(k => k !== key);
        if (pc.apiKey === key) pc.apiKey = pc.savedKeys.length > 0 ? pc.savedKeys[0] : '';
      }
    }
    
    await save();
    renderSavedKeysDropdown(providerId);
  }

  async function deleteModel() {
    const m = el.modelNameSelect.value;
    const providerId = el.provider.value;
    if (m === '_new_' || !confirm('Delete this Model?')) return;

    if (providerId.startsWith('custom_')) {
      const cp = SettingsPanel.customProviders.find(p => p.id === providerId);
      if (cp && cp.savedModels) {
        cp.savedModels = cp.savedModels.filter(k => k !== m);
        if (cp.modelName === m) cp.modelName = cp.savedModels.length > 0 ? cp.savedModels[0] : '';
      }
    } else {
      const pc = SettingsPanel.providerConfigs[providerId];
      if (pc && pc.savedModels) {
        pc.savedModels = pc.savedModels.filter(k => k !== m);
        if (pc.modelName === m) pc.modelName = pc.savedModels.length > 0 ? pc.savedModels[0] : '';
      }
    }
    
    await save();
    renderSavedModelsDropdown(providerId);
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
      
      // Parse custom arrays
      SettingsPanel.customProviders = data.CUSTOM_PROVIDERS ? JSON.parse(data.CUSTOM_PROVIDERS) : [];
      SettingsPanel.projects = data.PROJECTS ? JSON.parse(data.PROJECTS) : [];
      SettingsPanel.providerConfigs = data.PROVIDER_CONFIGS ? JSON.parse(data.PROVIDER_CONFIGS) : {};
      
      // Render custom providers
      document.querySelectorAll('.dyn-provider').forEach(e => e.remove());
      SettingsPanel.customProviders.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.className = 'dyn-provider';
        el.provider.insertBefore(opt, el.provider.querySelector('option[value="_add_custom_"]'));
      });
      el.provider.value = data.PRIMARY_LLM || 'groq';

      renderSavedKeysDropdown(el.provider.value);
      renderSavedModelsDropdown(el.provider.value);

      // Render custom projects
      document.querySelectorAll('.dyn-project').forEach(e => e.remove());
      SettingsPanel.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.className = 'dyn-project';
        el.projectSelect.insertBefore(opt, el.projectSelect.querySelector('option[value="_add_project_"]'));
      });
      
      // Try to select the project based on current sandbox root
      el.sandboxRoot.value = data.SANDBOX_ROOT || '~/AI_Sandbox';
      const matchedProj = SettingsPanel.projects.find(p => p.path === el.sandboxRoot.value);
      if (matchedProj) {
        el.projectSelect.value = matchedProj.id;
      } else if (el.sandboxRoot.value === '~/AI_Sandbox') {
        el.projectSelect.value = 'default';
      } else {
        el.projectSelect.value = '_add_project_';
        el.customProjectGroup.classList.remove('hidden');
        el.customProjectName.value = 'Custom Loaded';
      }

      updateModelHint();
      el.customProviderGroup.classList.toggle('hidden', el.provider.value !== '_add_custom_');
      el.deleteProviderBtn.classList.toggle('hidden', !el.provider.value.startsWith('custom_'));

      const isCustomProj = el.projectSelect.value !== 'default' && el.projectSelect.value !== '_add_project_';
      el.deleteProjectBtn.classList.toggle('hidden', !isCustomProj);
    } catch (err) {
      showToast('❌ Failed to load settings: ' + err.message, 'error');
    }
  }

  async function save() {
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving…';

    const currentKey = el.apiKeySelect.value === '_new_' ? el.apiKey.value : el.apiKeySelect.value;
    const currentModel = el.modelNameSelect.value === '_new_' ? el.modelName.value : el.modelNameSelect.value;

    let primaryLlm = el.provider.value;
    if (primaryLlm === '_add_custom_') {
      primaryLlm = 'custom_' + Date.now();
      SettingsPanel.customProviders.push({
        id: primaryLlm,
        name: el.customProviderName.value || 'Unnamed Provider',
        apiKey: currentKey,
        savedKeys: currentKey ? [currentKey] : [],
        baseUrl: el.baseUrl.value,
        modelName: currentModel,
        savedModels: currentModel ? [currentModel] : []
      });
    } else {
      // Update existing custom provider if selected
      const cp = SettingsPanel.customProviders.find(p => p.id === primaryLlm);
      if (cp) {
        cp.apiKey = currentKey;
        if (!cp.savedKeys) cp.savedKeys = [];
        if (currentKey && !cp.savedKeys.includes(currentKey)) cp.savedKeys.push(currentKey);
        
        cp.modelName = currentModel;
        if (!cp.savedModels) cp.savedModels = [];
        if (currentModel && !cp.savedModels.includes(currentModel)) cp.savedModels.push(currentModel);
        
        cp.baseUrl = el.baseUrl.value;
      } else {
        // Built-in provider
        if (!SettingsPanel.providerConfigs[primaryLlm]) {
          SettingsPanel.providerConfigs[primaryLlm] = { savedKeys: [], savedModels: [] };
        }
        const pc = SettingsPanel.providerConfigs[primaryLlm];
        
        pc.apiKey = currentKey;
        if (!pc.savedKeys) pc.savedKeys = pc.apiKey ? [pc.apiKey] : [];
        if (currentKey && !pc.savedKeys.includes(currentKey)) pc.savedKeys.push(currentKey);
        
        pc.modelName = currentModel;
        if (!pc.savedModels) pc.savedModels = pc.modelName ? [pc.modelName] : [];
        if (currentModel && !pc.savedModels.includes(currentModel)) pc.savedModels.push(currentModel);
      }
    }

    if (el.projectSelect.value === '_add_project_') {
      const projId = 'proj_' + Date.now();
      SettingsPanel.projects.push({
        id: projId,
        name: el.customProjectName.value || 'Unnamed Project',
        path: el.sandboxRoot.value
      });
    } else {
      // Update existing
      const p = SettingsPanel.projects.find(p => p.id === el.projectSelect.value);
      if (p) p.path = el.sandboxRoot.value;
    }

    const payload = {
      PRIMARY_LLM: primaryLlm,
      API_KEY: currentKey,
      MODEL_NAME: currentModel,
      BASE_URL: el.baseUrl.value || undefined,
      SSH_HOST: el.sshHost.value,
      SSH_PORT: Number(el.sshPort.value),
      SSH_USER: el.sshUser.value,
      SSH_KEY_PATH: el.sshKeyPath.value,
      SANDBOX_ROOT: el.sandboxRoot.value,
      CUSTOM_PROVIDERS: JSON.stringify(SettingsPanel.customProviders),
      PROJECTS: JSON.stringify(SettingsPanel.projects),
      PROVIDER_CONFIGS: JSON.stringify(SettingsPanel.providerConfigs)
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
        renderSavedKeysDropdown(primaryLlm);
        renderSavedModelsDropdown(primaryLlm);
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
