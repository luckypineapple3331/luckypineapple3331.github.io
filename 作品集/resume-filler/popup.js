// popup.js - 弹窗主逻辑

// ================== 数据默认结构 ==================
const DEFAULT_RESUME = {
  basic: { name: '', birthDate: '', phone: '', email: '', address: '' },
  education: [],
  internship: [],
  project: [],
  campus: [],
  awards: [],
  skills: { tools: '', languages: '', certificates: '' },
  selfIntro: '',
  portfolio: ''
};

const DEFAULT_SETTINGS = {
  enablePassword: false,
  passwordHash: '',
  isLocked: false
};

let resumeData = JSON.parse(JSON.stringify(DEFAULT_RESUME));
let settings = { ...DEFAULT_SETTINGS };
let isUnlocked = true;

// ================== 初始化 ==================
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  await checkPageStatus();
  initUI();
});

async function loadData() {
  return new Promise(resolve => {
    chrome.storage.local.get(['resumeData', 'settings'], (result) => {
      if (result.resumeData) resumeData = result.resumeData;
      if (result.settings) settings = result.settings;
      resolve();
    });
  });
}

async function saveData() {
  return new Promise(resolve => {
    chrome.storage.local.set({ resumeData, settings }, resolve);
  });
}

// ================== 密码锁 ==================
async function checkLock() {
  if (!settings.enablePassword || !settings.passwordHash) {
    isUnlocked = true;
    return;
  }

  // 如果本次会话已解锁，直接通过
  const session = await new Promise(resolve => {
    chrome.storage.session?.get?.(['unlocked'], r => resolve(r)) || resolve({});
  });
  if (session.unlocked) {
    isUnlocked = true;
    return;
  }

  // 显示锁屏
  isUnlocked = false;
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('mainApp').style.display = 'none';
}

function setupLockScreen() {
  const unlockBtn = document.getElementById('unlockBtn');
  const unlockInput = document.getElementById('unlockInput');
  const lockError = document.getElementById('lockError');

  const tryUnlock = async () => {
    const input = unlockInput.value;
    const inputHash = await hashPassword(input);
    if (inputHash === settings.passwordHash) {
      isUnlocked = true;
      document.getElementById('lockScreen').classList.add('hidden');
      document.getElementById('mainApp').style.display = 'flex';
      // 保存会话状态
      chrome.storage.session?.set?.({ unlocked: true });
      renderForm();
    } else {
      lockError.classList.remove('hidden');
      unlockInput.value = '';
      unlockInput.focus();
    }
  };

  unlockBtn.addEventListener('click', tryUnlock);
  unlockInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'resume-filler-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ================== 页面状态检测 ==================
async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' }, r => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(r);
      });
    });

    const banner = document.getElementById('pageDetectBanner');
    const successEl = document.getElementById('detectSuccess');
    const failEl = document.getElementById('detectFail');

    banner.classList.remove('hidden');
    if (response?.isRecruitment) {
      successEl.classList.remove('hidden');
      failEl.classList.add('hidden');
    } else {
      failEl.classList.remove('hidden');
      successEl.classList.add('hidden');
    }
  } catch {
    // 页面可能没有 content script（如 chrome:// 页面），静默处理
    const banner = document.getElementById('pageDetectBanner');
    const failEl = document.getElementById('detectFail');
    banner.classList.remove('hidden');
    failEl.classList.remove('hidden');
    document.getElementById('detectSuccess').classList.add('hidden');
  }
}

// ================== UI 初始化 ==================
function initUI() {
  setupLockScreen();
  setupTabs();
  setupSections();
  setupAddButtons();
  setupFooter();
  setupSettings();
  setupFillButtons();
  renderForm();
  checkLock();
}

// 标签页切换
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    });
  });
}

// 板块折叠/展开
function setupSections() {
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const sectionName = header.dataset.section;
      const body = document.getElementById(`body-${sectionName}`);
      const isCollapsed = body.classList.contains('collapsed');
      if (isCollapsed) {
        body.classList.remove('collapsed');
        header.classList.remove('collapsed');
      } else {
        body.classList.add('collapsed');
        header.classList.add('collapsed');
      }
    });
  });
}

// 新增条目按钮
function setupAddButtons() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.add;
      addItem(type);
    });
  });
}

// 底部保存/重置按钮
function setupFooter() {
  document.getElementById('btnSave').addEventListener('click', async () => {
    collectFormData();
    await saveData();
    showToast('保存成功 ✓');
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('确定要重置所有简历信息吗？')) {
      resumeData = JSON.parse(JSON.stringify(DEFAULT_RESUME));
      renderForm();
    }
  });
}

// 填充按钮
function setupFillButtons() {
  document.getElementById('btnAutoFill')?.addEventListener('click', () => triggerFill());
  document.getElementById('btnRefill')?.addEventListener('click', () => triggerFill());
  document.getElementById('btnForceDetect')?.addEventListener('click', forceDetect);
  document.getElementById('btnSettings')?.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('tab-settings').classList.remove('hidden');
  });
}

// 向 content script 发送填充消息，失败返回 null（不抛出异常）
function sendFillMessage(tabId, data) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'FILL_PAGE', data }, r => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(r);
    });
  });
}

// ================== 填充逻辑 ==================
async function triggerFill() {
  // 先保存当前表单数据
  collectFormData();
  await saveData();

  // 校验：有基础信息才能填充
  if (!resumeData.basic.name && !resumeData.basic.phone) {
    showStatus('error', '请先填写并保存简历信息');
    return;
  }

  showStatus('loading', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 先尝试直接发消息给已注入的 content script
    let response = await sendFillMessage(tab.id, resumeData);

    // 如果 content script 没响应（页面刷新后脚本失效），重新注入再试一次
    if (response === null) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['keywords.js'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await new Promise(r => setTimeout(r, 300)); // 等脚本初始化
        response = await sendFillMessage(tab.id, resumeData);
      } catch {
        // 部分页面（如 chrome:// ）不允许注入，给出友好提示
        showStatus('error', '此页面不允许注入脚本，请在招聘网站页面使用');
        return;
      }
    }

    if (response === null) {
      showStatus('error', '无法连接到页面，请手动刷新页面后重试');
      return;
    }

    if (response?.success) {
      const { filled, failed, warnings } = response.results;
      if (failed.length > 0) {
        showStatus('warning', `部分必填字段未填充：${failed.join('、')}，请手动补充`);
      } else if (warnings.length > 0) {
        showStatus('warning', warnings[0]);
      } else {
        showStatus('success', filled);
      }
    } else {
      showStatus('error', response?.error || '填充失败，请重试');
    }
  } catch (err) {
    showStatus('error', '无法连接到页面，请刷新后重试');
  }
}

async function forceDetect() {
  // 手动识别：直接相信用户判断，立即显示填充按钮
  // 不依赖 content script 是否响应，填充失败再报错
  const banner = document.getElementById('pageDetectBanner');
  const successEl = document.getElementById('detectSuccess');
  const failEl = document.getElementById('detectFail');
  banner.classList.remove('hidden');
  successEl.classList.remove('hidden');
  failEl.classList.add('hidden');

  // 后台通知 content script（如果还活着就更新它的状态，失败了也不影响UI）
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'FORCE_DETECT' }, () => void chrome.runtime.lastError);
  } catch {
    // 静默处理，不影响填充按钮的显示
  }
}

// 显示填充状态
function showStatus(type, data) {
  const statusEl = document.getElementById('fillStatus');
  const loadingEl = document.getElementById('fillLoading');
  const successEl = document.getElementById('fillSuccess');
  const warningEl = document.getElementById('fillWarning');
  const errorEl = document.getElementById('fillError');

  statusEl.classList.remove('hidden');
  loadingEl.classList.add('hidden');
  successEl.classList.add('hidden');
  warningEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  if (type === 'loading') {
    loadingEl.classList.remove('hidden');
  } else if (type === 'success') {
    document.getElementById('fillCount').textContent = data;
    successEl.classList.remove('hidden');
  } else if (type === 'warning') {
    document.getElementById('fillWarningText').textContent = data;
    warningEl.classList.remove('hidden');
  } else if (type === 'error') {
    document.getElementById('fillErrorText').textContent = data;
    errorEl.classList.remove('hidden');
  }
}

// ================== 表单渲染 ==================
function renderForm() {
  // 基础信息
  document.getElementById('basic-name').value = resumeData.basic.name || '';
  document.getElementById('basic-birth').value = resumeData.basic.birthDate || '';
  document.getElementById('basic-phone').value = resumeData.basic.phone || '';
  document.getElementById('basic-email').value = resumeData.basic.email || '';
  document.getElementById('basic-address').value = resumeData.basic.address || '';

  // 多条目板块
  renderItemList('education', resumeData.education);
  renderItemList('internship', resumeData.internship);
  renderItemList('project', resumeData.project);
  renderItemList('campus', resumeData.campus);
  renderItemList('awards', resumeData.awards);

  // 技能
  document.getElementById('skills-tools').value = resumeData.skills?.tools || '';
  document.getElementById('skills-languages').value = resumeData.skills?.languages || '';
  document.getElementById('skills-certificates').value = resumeData.skills?.certificates || '';

  // 个人简介
  document.getElementById('selfIntro-text').value = resumeData.selfIntro || '';

  // 作品集
  document.getElementById('portfolio-text').value = resumeData.portfolio || '';

  // 设置
  renderSettings();
}

// 渲染条目列表
function renderItemList(type, items) {
  const listEl = document.getElementById(`${type}-list`);
  listEl.innerHTML = '';

  if (!items || items.length === 0) return;

  items.forEach((item, index) => {
    const card = createItemCard(type, item, index);
    listEl.appendChild(card);
  });
}

// 创建条目卡片
function createItemCard(type, data, index) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.index = index;
  card.dataset.type = type;

  const header = document.createElement('div');
  header.className = 'item-card-header';
  header.innerHTML = `
    <div class="item-number">${index + 1}</div>
    <div class="item-title">${getItemTitle(type, data)}</div>
    <div class="item-actions">
      <button class="item-btn delete" data-action="delete" title="删除">✕</button>
    </div>
  `;

  const body = document.createElement('div');
  body.innerHTML = getItemFormHTML(type, data, index);

  card.appendChild(header);
  card.appendChild(body);

  // 绑定删除事件
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    deleteItem(type, index);
  });

  // 绑定输入事件（实时同步到数据）
  card.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('change', () => syncItemData(type, index, card));
  });

  return card;
}

// 获取条目标题
function getItemTitle(type, data) {
  if (type === 'education') return data.school || '新建教育经历';
  if (type === 'internship') return `${data.company || '公司'} · ${data.title || '岗位'}`;
  if (type === 'project') return data.name || '新建项目经历';
  if (type === 'campus') return data.name || '新建校园经历';
  if (type === 'awards') return data.name || '新建获奖经历';
  return '新建条目';
}

// 获取条目表单 HTML
function getItemFormHTML(type, data, idx) {
  const item = normalizeItemDates({ ...data });
  if (type === 'education') {
    return `
      <div class="form-row"><label>学校名称</label><input type="text" data-field="school" value="${esc(item.school)}"></div>
      <div class="form-row"><label>专业</label><input type="text" data-field="major" value="${esc(item.major)}"></div>
      <div class="form-row"><label>学历</label><input type="text" data-field="degree" value="${esc(item.degree)}" placeholder="如：本科"></div>
      <div class="form-row">
        <label>就读时间段</label>
        <div class="date-range-row">
          <input type="month" data-field="startDate" value="${esc(item.startDate)}">
          <span>至</span>
          <input type="month" data-field="endDate" value="${esc(item.endDate)}">
        </div>
      </div>
      <div class="form-row"><label>主修课程</label><textarea data-field="courses" rows="2">${esc(item.courses)}</textarea></div>
    `;
  }
  if (type === 'internship') {
    return `
      <div class="form-row"><label>公司名称</label><input type="text" data-field="company" value="${esc(item.company)}"></div>
      <div class="form-row"><label>岗位名称</label><input type="text" data-field="title" value="${esc(item.title)}"></div>
      <div class="form-row">
        <label>实习时间段</label>
        <div class="date-range-row">
          <input type="month" data-field="startDate" value="${esc(item.startDate)}">
          <span>至</span>
          <input type="month" data-field="endDate" value="${esc(item.endDate)}">
        </div>
      </div>
      <div class="form-row"><label>工作内容</label><textarea data-field="content" rows="3">${esc(item.content)}</textarea></div>
    `;
  }
  if (type === 'project') {
    return `
      <div class="form-row"><label>项目名称</label><input type="text" data-field="name" value="${esc(item.name)}"></div>
      <div class="form-row"><label>项目角色</label><input type="text" data-field="role" value="${esc(item.role)}"></div>
      <div class="form-row">
        <label>项目时间段</label>
        <div class="date-range-row">
          <input type="month" data-field="startDate" value="${esc(item.startDate)}">
          <span>至</span>
          <input type="month" data-field="endDate" value="${esc(item.endDate)}">
        </div>
      </div>
      <div class="form-row"><label>项目职责及成果</label><textarea data-field="description" rows="3">${esc(item.description)}</textarea></div>
    `;
  }
  if (type === 'awards') {
    return `
      <div class="form-row"><label>奖项名称</label><input type="text" data-field="name" value="${esc(item.name)}"></div>
      <div class="form-row">
        <label>获奖时间</label>
        <div class="date-range-row">
          <input type="month" data-field="startDate" value="${esc(item.startDate)}">
          <span>至</span>
          <input type="month" data-field="endDate" value="${esc(item.endDate)}">
        </div>
      </div>
      <div class="form-row"><label>担任角色</label><input type="text" data-field="role" value="${esc(item.role)}" placeholder="如：负责人、队长"></div>
      <div class="form-row"><label>奖项描述</label><textarea data-field="description" rows="2">${esc(item.description)}</textarea></div>
    `;
  }
  if (type === 'campus') {
    return `
      <div class="form-row"><label>经历名称</label><input type="text" data-field="name" value="${esc(item.name)}" placeholder="如：学生会主席团、班级团支书"></div>
      <div class="form-row"><label>担任职务</label><input type="text" data-field="role" value="${esc(item.role)}" placeholder="如：副主席、宣传委员"></div>
      <div class="form-row">
        <label>任职时间</label>
        <div class="date-range-row">
          <input type="month" data-field="startDate" value="${esc(item.startDate)}">
          <span>至</span>
          <input type="month" data-field="endDate" value="${esc(item.endDate)}">
        </div>
      </div>
      <div class="form-row"><label>职务描述</label><textarea data-field="description" rows="2">${esc(item.description)}</textarea></div>
    `;
  }
  return '';
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 将旧格式 dateRange 字符串（如 "2021.09-2025.06"）拆成月份选择器需要的 YYYY-MM 格式
function parseDateRangeToMonths(dateRange) {
  if (!dateRange) return { start: '', end: '' };

  const toMonthVal = (str) => {
    if (!str) return '';
    str = str.trim();
    const m = str.match(/(\d{4})[.\-\/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    return '';
  };

  // 优先：正则匹配两个 YYYY-MM 或 YYYY.MM 格式（不被中间的-或至误切割）
  const m = dateRange.match(/^(\d{4}[.\-\/]\d{1,2})\s*[-至~～—\s]+(\d{4}[.\-\/]\d{1,2})/);
  if (m) return { start: toMonthVal(m[1]), end: toMonthVal(m[2]) };

  // 4 段纯数字被 3 个 - 分隔 → YYYY-MM-YYYY-MM
  const dashParts = dateRange.split('-');
  if (dashParts.length === 4 && dashParts.every(p => /^\d+$/.test(p.trim()))) {
    return {
      start: dashParts[0] + '-' + dashParts[1].padStart(2, '0'),
      end:   dashParts[2] + '-' + dashParts[3].padStart(2, '0'),
    };
  }

  // 按非-分隔符（至 ~ — 等）分割
  const parts = dateRange.split(/\s*[至~～—]\s*/);
  if (parts.length >= 2) return { start: toMonthVal(parts[0]), end: toMonthVal(parts[1]) };

  return { start: toMonthVal(dateRange), end: '' };
}

// 兼容旧数据：确保条目同时拥有 startDate/endDate 字段
function normalizeItemDates(item) {
  if (!item) return item;
  // 旧数据只有 dateRange，没有 startDate/endDate
  if (!item.startDate && !item.endDate && item.dateRange) {
    const { start, end } = parseDateRangeToMonths(item.dateRange);
    item.startDate = start;
    item.endDate = end;
  }
  return item;
}

// 添加条目
function addItem(type) {
  const emptyItem = getEmptyItem(type);
  if (!resumeData[type]) resumeData[type] = [];
  resumeData[type].push(emptyItem);
  renderItemList(type, resumeData[type]);
}

function getEmptyItem(type) {
  if (type === 'education') return { school: '', major: '', degree: '', startDate: '', endDate: '', courses: '' };
  if (type === 'internship') return { company: '', title: '', startDate: '', endDate: '', content: '' };
  if (type === 'project') return { name: '', role: '', startDate: '', endDate: '', description: '' };
  if (type === 'campus') return { name: '', role: '', startDate: '', endDate: '', description: '' };
  if (type === 'awards') return { name: '', startDate: '', endDate: '', role: '', description: '' };
  return {};
}

// 删除条目
function deleteItem(type, index) {
  resumeData[type].splice(index, 1);
  renderItemList(type, resumeData[type]);
}

// 同步条目数据
function syncItemData(type, index, card) {
  const item = resumeData[type][index];
  if (!item) return;
  card.querySelectorAll('[data-field]').forEach(input => {
    item[input.dataset.field] = input.value;
  });
  // 合并 startDate/endDate 为 dateRange
  if (item.startDate !== undefined || item.endDate !== undefined) {
    item.dateRange = [item.startDate, item.endDate].filter(Boolean).join('-');
  }
  // 更新卡片标题
  const titleEl = card.querySelector('.item-title');
  if (titleEl) titleEl.textContent = getItemTitle(type, item);
}

// ================== 数据收集 ==================
function collectFormData() {
  // 基础信息
  resumeData.basic = {
    name: document.getElementById('basic-name').value.trim(),
    birthDate: document.getElementById('basic-birth').value.trim(),
    phone: document.getElementById('basic-phone').value.trim(),
    email: document.getElementById('basic-email').value.trim(),
    address: document.getElementById('basic-address').value.trim(),
  };

  // 多条目板块
  ['education', 'internship', 'project', 'campus', 'awards'].forEach(type => {
    const cards = document.querySelectorAll(`.item-card[data-type="${type}"]`);
    resumeData[type] = [];
    cards.forEach(card => {
      const item = {};
      card.querySelectorAll('[data-field]').forEach(input => {
        item[input.dataset.field] = input.value.trim();
      });
      // 将 startDate + endDate 合并成 dateRange（供 content.js 使用）
      if (item.startDate !== undefined || item.endDate !== undefined) {
        item.dateRange = [item.startDate, item.endDate].filter(Boolean).join('-');
      }
      resumeData[type].push(item);
    });
  });

  // 技能
  resumeData.skills = {
    tools: document.getElementById('skills-tools').value.trim(),
    languages: document.getElementById('skills-languages').value.trim(),
    certificates: document.getElementById('skills-certificates').value.trim(),
  };

  // 个人简介
  resumeData.selfIntro = document.getElementById('selfIntro-text').value.trim();

  // 作品集
  resumeData.portfolio = document.getElementById('portfolio-text').value.trim();
}

// ================== 设置 ==================
function renderSettings() {
  const enablePwdEl = document.getElementById('enablePassword');
  enablePwdEl.checked = settings.enablePassword || false;
  document.getElementById('passwordFields').classList.toggle('hidden', !settings.enablePassword);
}

function setupSettings() {
  // 密码开关
  document.getElementById('enablePassword').addEventListener('change', function () {
    settings.enablePassword = this.checked;
    document.getElementById('passwordFields').classList.toggle('hidden', !this.checked);
    if (!this.checked) {
      settings.passwordHash = '';
      saveData();
    }
  });

  // 保存密码
  document.getElementById('savePasswordBtn').addEventListener('click', async () => {
    const pwd = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (!pwd || pwd.length < 4) { showToast('密码至少4位'); return; }
    if (pwd !== confirm) { showToast('两次密码不一致'); return; }
    settings.passwordHash = await hashPassword(pwd);
    settings.enablePassword = true;
    await saveData();
    showToast('密码设置成功');
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  });

  // 导出数据
  document.getElementById('exportBtn').addEventListener('click', () => {
    collectFormData();
    const json = JSON.stringify(resumeData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 清除数据
  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (confirm('确定要清除所有简历数据吗？此操作不可恢复！')) {
      resumeData = JSON.parse(JSON.stringify(DEFAULT_RESUME));
      settings = { ...DEFAULT_SETTINGS };
      await saveData();
      renderForm();
      showToast('数据已清除');
    }
  });
}

// ================== 提示 Toast ==================
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.75); color: white; padding: 6px 14px;
      border-radius: 20px; font-size: 12px; z-index: 9999; white-space: nowrap;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
