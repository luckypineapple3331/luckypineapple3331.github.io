// content.js - 页面检测与自动填充核心逻辑

let pageIsRecruitment = false;

// ================== 页面检测 ==================

function checkAndReportPage() {
  pageIsRecruitment = isRecruitmentPage();
  chrome.runtime.sendMessage({
    type: 'PAGE_DETECTED',
    isRecruitment: pageIsRecruitment
  }, () => void chrome.runtime.lastError);
  return pageIsRecruitment;
}

// 初始检测
setTimeout(checkAndReportPage, 1000);

// ================== 表单分析 ==================

// 获取页面所有可见的输入框（input/textarea/select）
function getAllInputs() {
  return Array.from(document.querySelectorAll('input, textarea, select'))
    .filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
}

// 收集输入框所有上下文信息，拼成一个字符串用于匹配
// 不再"找到一个就返回"，而是把所有线索都合并进来
function getInputContext(inputEl) {
  const parts = [];

  // input 自身属性（type、name、id）
  if (inputEl.type && inputEl.type !== 'text' && inputEl.type !== 'password') {
    parts.push(inputEl.type); // email / tel / date 等直接是强线索
  }
  if (inputEl.name) parts.push(inputEl.name);
  if (inputEl.id) parts.push(inputEl.id);

  // aria-label
  const ariaLabel = inputEl.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  // aria-labelledby 关联元素的文字
  const labelledBy = inputEl.getAttribute('aria-labelledby');
  if (labelledBy) {
    const el = document.getElementById(labelledBy);
    if (el) parts.push(el.textContent.trim());
  }

  // placeholder（排除无意义的通用占位文字）
  const placeholder = inputEl.placeholder;
  if (placeholder && !/^(请输入|请填写|input|enter|fill)$/i.test(placeholder.trim())) {
    parts.push(placeholder);
  }

  // label[for] 关联
  if (inputEl.id) {
    const label = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
    if (label) parts.push(label.textContent.trim());
  }

  // 父级 label 元素
  const parentLabel = inputEl.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
    parts.push(clone.textContent.trim());
  }

  // 前面最近的兄弟节点（常见的 label-div + input-div 结构）
  let prev = inputEl.previousElementSibling;
  for (let i = 0; i < 4 && prev; i++) {
    const text = prev.textContent?.trim();
    if (text && text.length < 50) parts.push(text);
    prev = prev.previousElementSibling;
  }

  // 向上遍历父容器，克隆后删掉输入框，取剩余文字
  // 注意：必须用 textContent 而非 innerText，因为 innerText 在离屏节点上依赖 CSS 布局，会返回空
  let parent = inputEl.parentElement;
  for (let i = 0; i < 6 && parent && parent !== document.body; i++) {
    const clone = parent.cloneNode(true);
    clone.querySelectorAll('input, textarea, select, button, script, style').forEach(el => el.remove());
    const text = clone.textContent?.replace(/\s+/g, ' ').trim();
    if (text && text.length > 0 && text.length < 80) {
      parts.push(text);
      break; // 找到有意义的父容器文字就停止
    }
    parent = parent.parentElement;
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

// 获取输入框在指定容器边界内的局部上下文
// boundaryEl 限制了向上遍历的范围，避免受到外层板块标题文字干扰
function getLocalContext(inputEl, boundaryEl) {
  const parts = [];

  // input 自身属性
  if (inputEl.type && inputEl.type !== 'text' && inputEl.type !== 'password') {
    parts.push(inputEl.type);
  }
  if (inputEl.name) parts.push(inputEl.name);
  if (inputEl.id) parts.push(inputEl.id);

  const ariaLabel = inputEl.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  const labelledBy = inputEl.getAttribute('aria-labelledby');
  if (labelledBy) {
    const el = document.getElementById(labelledBy);
    if (el) parts.push(el.textContent.trim());
  }

  const placeholder = inputEl.placeholder;
  if (placeholder && !/^(请输入|请填写|input|enter|fill)$/i.test(placeholder.trim())) {
    parts.push(placeholder);
  }

  // label[for] 关联
  if (inputEl.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
      if (label) parts.push(label.textContent.trim());
    } catch {}
  }

  // 父级 label 元素
  const parentLabel = inputEl.closest('label');
  if (parentLabel && (!boundaryEl || boundaryEl.contains(parentLabel))) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
    parts.push(clone.textContent.trim());
  }

  // 前面的兄弟节点（局部范围内）
  let prev = inputEl.previousElementSibling;
  for (let i = 0; i < 3 && prev; i++) {
    const text = prev.textContent?.trim();
    if (text && text.length < 40) parts.push(text);
    prev = prev.previousElementSibling;
  }

  // 向上遍历父容器，但不超过 boundaryEl（关键：避免被外层板块标题污染）
  let parent = inputEl.parentElement;
  for (let depth = 0; depth < 4 && parent && parent !== boundaryEl && parent !== document.body; depth++) {
    const clone = parent.cloneNode(true);
    clone.querySelectorAll('input, textarea, select, button').forEach(el => el.remove());
    const text = clone.textContent?.replace(/\s+/g, ' ').trim();
    if (text && text.length > 0 && text.length < 60) {
      parts.push(text);
      break;
    }
    parent = parent.parentElement;
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

// 兼容旧调用
function getLabelText(inputEl) {
  return getInputContext(inputEl);
}

// 查找"新增条目"按钮（支持各种说法，搜索范围扩展到容器父级）
function findAddButton(sectionContainer) {
  const addKeywords = ['新增', '添加', '增加', '继续', '添加新', '新建', 'add'];
  const excludeKeywords = /保存|提交|删除|取消|确定|submit|save|delete|cancel/i;

  // 搜索范围：容器本身 + 父元素（按钮可能在板块容器外面紧邻）
  const searchAreas = [sectionContainer];
  if (sectionContainer.parentElement) searchAreas.push(sectionContainer.parentElement);

  for (const area of searchAreas) {
    const candidates = area.querySelectorAll(
      'button, [role="button"], a[class*="add"], span[class*="add"], div[class*="add-btn"], [class*="add-item"]'
    );
    for (const btn of candidates) {
      const text = (btn.innerText || btn.textContent)?.trim().toLowerCase();
      if (!text) continue;
      if (excludeKeywords.test(text)) continue;
      if (addKeywords.some(kw => text.includes(kw))) return btn;
    }
  }
  return null;
}

// 等待新条目出现（点击添加按钮后，结构化布局专用）
async function waitForNewGroup(container, prevCount) {
  const maxWait = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (getItemGroups(container).length > prevCount) return;
    await sleep(150);
  }
}

// 等待新输入框出现（点击添加按钮后，平铺布局专用）
async function waitForNewInputs(container, beforeSet) {
  const maxWait = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const all = container.querySelectorAll('input, textarea, select');
    if (Array.from(all).some(el => !beforeSet.has(el))) return;
    await sleep(150);
  }
}

// 分析页面中的所有板块
function analyzeSections() {
  const sections = [];

  // 查找板块标题（h1-h6, 带特定class的div/span等）
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="section"], [class*="header"], [class*="group"]');

  headings.forEach(heading => {
    const text = heading.innerText?.trim();
    if (!text || text.length > 50) return;

    const sectionType = matchSectionType(text);
    if (sectionType) {
      // 找到该标题下的所有输入框
      let container = heading.parentElement;
      for (let i = 0; i < 3 && container; i++) {
        const inputs = container.querySelectorAll('input, textarea, select');
        if (inputs.length > 0) {
          sections.push({
            type: sectionType,
            title: text,
            element: container,
            inputs: Array.from(inputs)
          });
          break;
        }
        container = container.parentElement;
      }
    }
  });

  return sections;
}

// （旧版 findAddButton 已由上方新版替换，此处删除重复定义）

// 设置输入框的值（兼容 React/Vue 等框架）
function setInputValue(input, value) {
  if (!input || value === undefined || value === null) return;
  const val = String(value);
  if (input.value === val) return; // 已经是目标值就跳过

  // 用原生 setter 绕过框架拦截
  const proto = input.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(input, val);
  } else {
    input.value = val;
  }

  // 依次触发 InputEvent + Event，兼容 React16/17/18 和 Vue2/3
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: val }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

// ================== 自动填充逻辑 ==================

async function fillPage(resumeData) {
  const results = {
    filled: 0,
    failed: [],
    warnings: []
  };

  // 归一化：如果条目使用 startDate/endDate（月份选择器输出），合并成 dateRange
  function normItems(arr) {
    return (arr || []).map(item => {
      if (!item.dateRange && (item.startDate || item.endDate)) {
        item = { ...item, dateRange: [item.startDate, item.endDate].filter(Boolean).join('-') };
      }
      return item;
    });
  }

  const allPageInputs = getAllInputs();
  console.log('[ResumeFiller] ▶ 开始填充，页面可见输入框数量:', allPageInputs.length);
  console.log('[ResumeFiller] 简历数据摘要:', {
    name: resumeData.basic?.name,
    internship: resumeData.internship?.length,
    project: resumeData.project?.length,
    education: resumeData.education?.length
  });

  // 填充基础信息
  fillBasicInfo(resumeData.basic, results);

  // 填充教育经历
  if (resumeData.education?.length > 0) {
    await fillSections('education', normItems(resumeData.education), results);
  }

  // 填充实习经历
  if (resumeData.internship?.length > 0) {
    await fillSections('internship', normItems(resumeData.internship), results);
  }

  // 填充项目经历（campus 条目始终作为兜底合并进项目，保证校园经历在无专属板块时也能填入）
  const campusItems = resumeData.campus || [];
  const allProjectItems = [
    ...normItems(resumeData.project || []),
    ...campusItems.map(c => ({ name: c.name, role: c.role, description: c.description }))
  ];
  if (allProjectItems.length > 0) {
    await fillSections('project', allProjectItems, results);
  }

  // 填充校园经历（逻辑与实习/项目完全相同：直接找板块，找不到 fillSections 自动 warning+return）
  if (campusItems.length > 0) {
    await fillSections('campus', campusItems, results);
  }

  // 填充获奖经历（逻辑与实习/项目完全相同）
  if (resumeData.awards?.length > 0) {
    await fillSections('awards', resumeData.awards, results);
  }

  // 填充技能证书
  if (resumeData.skills) {
    fillSkills(resumeData.skills, results);
  }

  // 填充个人简介
  if (resumeData.selfIntro) {
    fillSelfIntro(resumeData.selfIntro, results);
  }

  // 填充作品集
  if (resumeData.portfolio) {
    fillPortfolio(resumeData.portfolio, results);
  }

  // 校验必填字段
  validateRequired(resumeData, results);

  console.log('[ResumeFiller] ▶ 填充完成，共填充:', results.filled, '警告:', results.warnings);
  return results;
}

// 填充基础信息
function fillBasicInfo(basic, results) {
  if (!basic) return;

  const inputs = getAllInputs();
  console.log('[ResumeFiller] fillBasicInfo: 扫描', inputs.length, '个输入框');

  for (const input of inputs) {
    const context = getInputContext(input);

    // 检测是否属于父母/家长行——先看自身上下文，再看同行内其他输入的上下文
    const isParentField = (() => {
      // 自身上下文已含家长标记
      if (/父亲|母亲|家长|紧急联系|配偶|监护|兄弟|姐妹|guardian|parent|spouse|emergency/i.test(context)) return true;
      // 向上找"同行"容器（含 2-8 个输入的最小祖先），检查行文本
      let el = input.parentElement;
      for (let i = 0; i < 6 && el && el !== document.body; i++) {
        const cnt = el.querySelectorAll('input, textarea').length;
        if (cnt >= 2 && cnt <= 8) {
          const rowText = (el.textContent || '').replace(/\s+/g, ' ');
          return /父亲|母亲|家长|紧急联系|配偶|监护|guardian|parent|spouse|emergency/i.test(rowText);
        }
        el = el.parentElement;
      }
      return false;
    })();

    let value = null;

    // 优先用 input.type 直接判断（最可靠）
    if (input.type === 'email') {
      value = basic.email;
    } else if (input.type === 'tel' && !isParentField) {
      value = basic.phone;
    } else if (input.type === 'date' && basic.birthDate) {
      value = basic.birthDate;
    } else if (context) {
      if (!isParentField && matchesKeywords(context, RESUME_KEYWORDS.basicInfo.name)) {
        value = basic.name;
      } else if (!isParentField && matchesKeywords(context, RESUME_KEYWORDS.basicInfo.phone)) {
        value = basic.phone;
      } else if (matchesKeywords(context, RESUME_KEYWORDS.basicInfo.email)) {
        value = basic.email;
      } else if (matchesKeywords(context, RESUME_KEYWORDS.basicInfo.address)) {
        value = basic.address;
      } else if (matchesKeywords(context, RESUME_KEYWORDS.basicInfo.birthDate)) {
        value = basic.birthDate;
      }
    }

    if (value) {
      console.log('[ResumeFiller] 基础信息填充:', input.tagName, input.name || input.id || '(无name/id)', '← 上下文:', context.slice(0, 30));
      setInputValue(input, value);
      results.filled++;
    }
  }
}

// 匹配关键词
function matchesKeywords(text, keywords) {
  const t = text.toLowerCase().trim();
  if (!t) return false; // 空上下文不匹配任何关键词，避免 k.includes('') 永远为 true
  return keywords.some(kw => {
    const k = kw.toLowerCase();
    return t.includes(k) || k.includes(t) || calcSimilarity(t, k) >= 0.7;
  });
}

// 填充多条目板块（实习、教育、项目）
// 统一策略：填第1条 → 点击添加 → 等新表单出现（新元素 OR 值被清空）→ 填下一条
async function fillSections(sectionType, items, results) {
  const sectionKeywords = RESUME_KEYWORDS.sections[sectionType];
  const sectionContainer = findSectionContainer(sectionKeywords);

  if (!sectionContainer) {
    results.warnings.push(`未找到${sectionType}板块`);
    return;
  }

  // 第1条：填当前可见的第一个条目组
  const initialGroups = getItemGroups(sectionContainer);
  const firstGroup = initialGroups[0]; // flat → container 本身，structured → 第一张卡片
  fillInputArray(
    Array.from(firstGroup.querySelectorAll('input, textarea, select')),
    items[0], sectionType, results, firstGroup
  );
  await sleep(200);

  // 第 2..N 条：点击添加 → 检测新表单 → 填新表单
  for (let i = 1; i < items.length; i++) {
    const addBtn = findAddButton(sectionContainer);
    if (!addBtn) {
      console.log('[ResumeFiller] ⚠ 未找到添加按钮，停止', sectionType, '第', i + 1, '条');
      break;
    }
    console.log('[ResumeFiller] 点击添加按钮:', addBtn.tagName, addBtn.textContent?.trim().slice(0, 30));

    // 记录点击前的所有输入框及其当前值
    const prevEls  = Array.from(sectionContainer.querySelectorAll('input, textarea, select'));
    const prevSet  = new Set(prevEls);
    const prevVals = new Map(prevEls.map(el => [el, el.value]));

    addBtn.click();

    // 等待：出现新元素 OR 旧元素值被清空（均代表新表单已就绪）
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const curr = Array.from(sectionContainer.querySelectorAll('input, textarea, select'));
      if (curr.some(el => !prevSet.has(el))) break;                                          // 新元素出现
      if (curr.some(el => prevVals.has(el) && el.value !== (prevVals.get(el) || ''))) break; // 值被清空
      await sleep(150);
    }

    const afterAll  = Array.from(sectionContainer.querySelectorAll('input, textarea, select'));
    const newInputs = afterAll.filter(el => !prevSet.has(el));
    console.log('[ResumeFiller]', sectionType, '第', i + 1, '条: 新增输入框', newInputs.length, '个');

    if (newInputs.length > 0) {
      // 累加模式：出现了全新的 input 元素，直接填它们
      fillInputArray(newInputs, items[i], sectionType, results, null);
    } else {
      // 替换模式：同一批 input 元素被清空/重置，填当前可见的最后一个条目组
      const currGroups = getItemGroups(sectionContainer);
      const lastGroup  = currGroups[currGroups.length - 1];
      fillInputArray(
        Array.from(lastGroup.querySelectorAll('input, textarea, select')),
        items[i], sectionType, results, lastGroup
      );
    }
    await sleep(200);
  }
}

// 查找板块容器
// 策略：先找匹配关键词的标题元素，从标题向上走到第一个包含 input 的祖先（最精确的板块容器）
// 兜底：再扫描所有元素的直接文本
function findSectionContainer(keywords) {
  // === 策略1：标题优先 ===
  // 找页面上所有可能是标题的元素
  const headingEls = Array.from(document.querySelectorAll(
    'h1,h2,h3,h4,h5,h6,legend,' +
    '[class*="title"],[class*="header"],[class*="section-name"],' +
    '[class*="group-title"],[class*="card-title"],[class*="panel-title"]'
  ));

  for (const heading of headingEls) {
    // 只取第一行可见文本，避免 textContent 包含子节点文字（如页面标题"腾讯校园招聘"的子节点含"校园经历"）
    const rawLine = ((heading.innerText !== undefined ? heading.innerText : heading.textContent) || '').split('\n')[0];
    const text = rawLine.replace(/\s+/g, '').toLowerCase();
    if (!text || text.length > 30) continue;

    const matched = keywords.some(kw => {
      const k = kw.toLowerCase().replace(/\s/g, '');
      return text.includes(k) || k.includes(text) || calcSimilarity(text, k) >= 0.65;
    });
    if (!matched) continue;

    // 从标题向上走，找第一个包含 input/textarea 且大小合理的祖先（即该板块的容器）
    // 输入框超过 80 个视为页面级容器，跳过此标题
    let el = heading.parentElement;
    while (el && el !== document.body) {
      const cnt = el.querySelectorAll('input, textarea').length;
      if (cnt > 80) break; // 容器太大，是页面级包装，放弃此标题
      if (cnt > 0) {
        console.log('[ResumeFiller] 找到板块容器（标题法）:', heading.textContent.trim(), '→', el.tagName, el.className.slice(0, 40));
        return el;
      }
      el = el.parentElement;
    }
  }

  // === 策略2：直接文本匹配（兜底）===
  const allElements = document.querySelectorAll('div, section, article, fieldset');
  for (const el of allElements) {
    const directText = getDirectText(el).replace(/\s+/g, '').toLowerCase();
    if (!directText) continue;
    for (const kw of keywords) {
      const k = kw.toLowerCase().replace(/\s/g, '');
      if (directText.includes(k) || calcSimilarity(directText, k) >= 0.6) {
        const cnt2 = el.querySelectorAll('input, textarea').length;
        if (cnt2 > 0 && cnt2 <= 80) { // 超过 80 个输入框视为页面级容器，跳过
          console.log('[ResumeFiller] 找到板块容器（文本法）:', kw, '→', el.tagName, el.className.slice(0, 40));
          return el;
        }
      }
    }
  }

  console.log('[ResumeFiller] ⚠ 未找到板块容器，关键词:', keywords.slice(0, 3));
  return null;
}

// 获取元素直接文本（不包含子元素的文本）
function getDirectText(el) {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  // 也检查第一个子标题元素
  const heading = el.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="header"]');
  if (heading) text += ' ' + heading.innerText;
  return text.trim();
}

// ================== 日期工具函数 ==================

// 解析日期字符串为 {year, month, day}，日期不存在时默认为 1
// 支持：2024.05 / 2024-05 / 2024/05 / 2024年5月 / 2024.05.20 / 至今/现在
function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  if (/至今|现在|now|present/i.test(str)) {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: 1 };
  }
  let m;
  m = str.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  m = str.match(/(\d{4})[.\-\/](\d{1,2})/);
  if (m) return { year: +m[1], month: +m[2], day: 1 };
  m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  m = str.match(/(\d{4})年(\d{1,2})月/);
  if (m) return { year: +m[1], month: +m[2], day: 1 };
  return null;
}

// 把日期对象格式化成 input[type=date] 需要的 YYYY-MM-DD
function toDateInputVal(d) {
  if (!d) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// 把日期对象格式化成 input[type=month] 需要的 YYYY-MM
function toMonthInputVal(d) {
  if (!d) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

// 从时间段字符串（如 "2024.05-2024.09" 或 "2024.05至2024.09"）取开始/结束
// 特殊处理 YYYY-MM-YYYY-MM 格式（4段数字被3个-连接，避免误切年月内的-）
function splitDateRange(dateRange) {
  if (!dateRange) return { start: '', end: '' };

  // 优先：匹配两个 YYYY-MM 或 YYYY.MM 格式的日期（中间用任意分隔符）
  const m = dateRange.match(/^(\d{4}[.\-\/]\d{1,2})\s*[-至~～—\s]+(\d{4}[.\-\/]\d{1,2})/);
  if (m) return { start: m[1].trim(), end: m[2].trim() };

  // 次选：4 段纯数字被 3 个 - 分隔 → YYYY-MM-YYYY-MM
  const dashParts = dateRange.split('-');
  if (dashParts.length === 4 && dashParts.every(p => /^\d+$/.test(p.trim()))) {
    return { start: dashParts[0] + '-' + dashParts[1], end: dashParts[2] + '-' + dashParts[3] };
  }

  // 兜底：按中文"至"或 ~/～/— 分割
  const parts = dateRange.split(/\s*[至~～—]\s*/);
  if (parts.length >= 2) return { start: parts[0].trim(), end: parts[1].trim() };

  return { start: dateRange.trim(), end: '' };
}

// 智能设置日期类输入框的值（兼容 type=date/month 和自定义日期选择器）
function setDateFieldValue(input, dateStr) {
  if (!dateStr) return false;

  const parsed = parseDate(dateStr);

  if (input.type === 'date') {
    const val = toDateInputVal(parsed);
    if (val) { setInputValue(input, val); return true; }
  }
  if (input.type === 'month') {
    const val = toMonthInputVal(parsed);
    if (val) { setInputValue(input, val); return true; }
  }
  if (input.type === 'number' && input.max && +input.max <= 31) {
    // 可能是某些日期组件拆出来的"日"字段
    const val = parsed ? String(parsed.day) : '1';
    setInputValue(input, val); return true;
  }

  // 自定义日期选择器：先尝试直接写入内层的原生 input
  const innerInput = input.closest('[class*="date"],[class*="picker"],[class*="calendar"]')
    ?.querySelector('input:not([type="hidden"])');
  if (innerInput && innerInput !== input) {
    setInputValue(innerInput, dateStr); return true;
  }

  // 通用文本框：直接填入（如 "2024.05" 或 "2024.05-2024.09"）
  setInputValue(input, dateStr);
  return true;
}

// 判断输入框是否是日期类控件
function isDateInput(input, context) {
  if (['date', 'month', 'datetime-local'].includes(input.type)) return true;
  const cls = (input.className || '').toLowerCase();
  if (/date|picker|calendar|time/.test(cls)) return true;
  if (/时间|日期|date|time/.test(context)) return true;
  return false;
}

// ================== 条目组检测 ==================

// 获取条目组列表
// 关键原则：每个"条目组"代表一整条经历（公司+岗位+时间+内容），必须含 2+ 个输入框
// 如果返回的是只有 1 个输入框的行元素，说明层级识别有误
function getItemGroups(container) {
  const MIN = 2; // 至少 2 个输入框才算一个完整条目

  // 优先：直接子元素中含 2+ 输入框的（最常见结构）
  const byDirect = Array.from(container.children)
    .filter(el => el.querySelectorAll('input, textarea').length >= MIN);
  if (byDirect.length > 0) return byDirect;

  // 其次：向下多一层（容器多套了一层 wrapper）
  for (const child of container.children) {
    const byGrand = Array.from(child.children)
      .filter(el => el.querySelectorAll('input, textarea').length >= MIN);
    if (byGrand.length > 0) return byGrand;
  }

  // 语义化 class 名（item/record/entry/block），要求 2+ 输入框
  const bySemantic = Array.from(container.querySelectorAll(
    '[class*="item"],[class*="record"],[class*="entry"],[class*="block"],[class*="card"]'
  )).filter(el => el.querySelectorAll('input, textarea').length >= MIN);
  if (bySemantic.length > 0) return bySemantic;

  // 兜底：整个容器当一个条目（只有一条且没有包装层的简单表单）
  return [container];
}

// 统计条目组数量
function countItemGroups(container) {
  return getItemGroups(container).length;
}

// 设置下拉框的值（模糊匹配选项文字）
function setSelectValue(select, value) {
  if (!value || !select.options || select.options.length === 0) return false;
  const val = String(value).trim().toLowerCase();
  const options = Array.from(select.options);

  // 1. 精确匹配文字或 value 属性
  let best = options.find(o => o.text.trim().toLowerCase() === val || o.value.toLowerCase() === val);
  // 2. 包含匹配
  if (!best) best = options.find(o =>
    o.text.trim().toLowerCase().includes(val) || val.includes(o.text.trim().toLowerCase())
  );
  // 3. 相似度匹配
  if (!best) {
    let bestScore = 0;
    for (const o of options) {
      const score = calcSimilarity(o.text.trim().toLowerCase(), val);
      if (score > bestScore && score >= 0.55) { bestScore = score; best = o; }
    }
  }

  if (best) {
    select.value = best.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }
  return false;
}

// 公共填充函数：给一批 input/textarea/select 逐一匹配并填值
// boundaryEl 不为 null 时使用局部上下文（避免板块标题干扰），为 null 时用全局上下文
function fillInputArray(inputs, data, sectionType, results, boundaryEl) {
  if (!data || !inputs || inputs.length === 0) return;

  // 日期：优先使用 popup 月份选择器直接存储的 startDate/endDate，
  // 兜底才 splitDateRange（兼容旧格式 dateRange 字符串）
  const startDate = data.startDate || splitDateRange(data.dateRange || '').start;
  const endDate   = data.endDate   || splitDateRange(data.dateRange || '').end;
  const dateRange = data.dateRange || [startDate, endDate].filter(Boolean).join(' 至 ');

  console.log('[ResumeFiller] fillInputArray:', sectionType, '数据:', JSON.stringify(data).slice(0, 80),
    '输入框数量:', inputs.length, '边界:', boundaryEl ? boundaryEl.tagName + '.' + boundaryEl.className.slice(0, 20) : 'null');

  for (const input of inputs) {
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') continue;

    const isSelect = input.tagName === 'SELECT';
    const context = boundaryEl
      ? getLocalContext(input, boundaryEl)
      : getInputContext(input);
    const isDate = isDateInput(input, context);
    let value = null;
    let isDateField = false;

    if (sectionType === 'education') {
      if (matchesKeywords(context, RESUME_KEYWORDS.fields.schoolName)) value = data.school;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.major)) value = data.major;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.degree)) value = data.degree;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.courses)) value = data.courses;
      // 自定义下拉框：上下文包含学历级别选项 → 学历选择器
      if (value === null && data.degree && /本科|硕士|博士|大专|专科|研究生|高中/.test(context)) {
        value = data.degree;
      }

    } else if (sectionType === 'internship') {
      if (matchesKeywords(context, RESUME_KEYWORDS.fields.companyName)) value = data.company;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.jobTitle)) value = data.title;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.workContent)) value = data.content;

    } else if (sectionType === 'project') {
      // 注意顺序：role 先于 name，避免"项目中职责"被"项目名称"的泛化词吞掉
      if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectRole)) value = data.role;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectName)) value = data.name;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectDesc)) value = data.description;

    } else if (sectionType === 'awards') {
      // desc 先于 name：避免"奖项说明"里含"奖项"被误判为奖项名称
      if (matchesKeywords(context, RESUME_KEYWORDS.fields.awardRole)) value = data.role;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.awardDesc)) value = data.description;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.awardName)) value = data.name;
      // 获奖时间跳过，留给用户手动填

    } else if (sectionType === 'campus') {
      // 职务先于名称，避免泛化词误匹配
      if (matchesKeywords(context, RESUME_KEYWORDS.fields.campusRole)) value = data.role;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.campusName)) value = data.name;
      else if (matchesKeywords(context, RESUME_KEYWORDS.fields.campusDesc)) value = data.description;
      // 任职时间跳过，留给用户手动填

      // 兜底：如果上下文匹配到项目类字段，也能填进去（校园经历当项目填时的兼容）
      if (value === null) {
        if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectRole)) value = data.role;
        else if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectName)) value = data.name;
        else if (matchesKeywords(context, RESUME_KEYWORDS.fields.projectDesc)) value = data.description;
      }
    }

    // textarea 兜底：上下文不够时，按板块类型填说明字段
    if (value === null && input.tagName === 'TEXTAREA') {
      if (sectionType === 'internship' && data.content) value = data.content;
      else if (sectionType === 'project' && data.description) value = data.description;
      else if (sectionType === 'education' && data.courses) value = data.courses;
      else if (sectionType === 'awards' && data.description) value = data.description;
      else if (sectionType === 'campus' && data.description) value = data.description;
    }

    console.log('[ResumeFiller]  →', input.tagName, input.name || input.placeholder || '(无标识)',
      '| 上下文:', context.slice(0, 40), '| 匹配值:', value ?? '❌无匹配');

    if (value) {
      if (isSelect) {
        if (setSelectValue(input, value)) results.filled++;
      } else if (isDateField || isDate) {
        setDateFieldValue(input, value);
        results.filled++;
      } else {
        setInputValue(input, value);
        results.filled++;
      }
    }
  }
}

// 填充单个条目组（委托给 fillInputArray，保留向下兼容接口）
function fillItemGroup(groupEl, data, sectionType, results) {
  if (!groupEl || !data) return;
  const allInGroup = Array.from(groupEl.querySelectorAll('input, textarea, select'));
  fillInputArray(allInGroup, data, sectionType, results, groupEl);
}

// 填充技能证书
function fillSkills(skills, results) {
  const inputs = getAllInputs();

  for (const input of inputs) {
    const label = getLabelText(input).toLowerCase();
    if (!label) continue;

    let value = null;
    if (matchesKeywords(label, RESUME_KEYWORDS.fields.toolSkills)) {
      value = skills.tools;
    } else if (matchesKeywords(label, RESUME_KEYWORDS.fields.languageSkills)) {
      value = skills.languages;
    } else if (matchesKeywords(label, RESUME_KEYWORDS.fields.certificates)) {
      value = skills.certificates;
    } else if (matchesKeywords(label, RESUME_KEYWORDS.sections.skills)) {
      value = [skills.tools, skills.languages, skills.certificates].filter(Boolean).join('；');
    }

    if (value) {
      setInputValue(input, value);
      results.filled++;
    }
  }
}

// 填充个人简介
function fillSelfIntro(intro, results) {
  const inputs = getAllInputs();

  for (const input of inputs) {
    const label = getLabelText(input).toLowerCase();
    if (!label) continue;

    if (matchesKeywords(label, RESUME_KEYWORDS.sections.selfIntro)) {
      setInputValue(input, intro);
      results.filled++;
    }
  }
}

// 填充作品集
function fillPortfolio(portfolio, results) {
  const keywords = ['作品集', '作品链接', '个人主页', '个人网站', '作品', 'portfolio', 'website', '网址', '主页', '链接'];
  const inputs = getAllInputs();

  for (const input of inputs) {
    const label = getLabelText(input).toLowerCase();
    if (!label) continue;

    if (matchesKeywords(label, keywords)) {
      setInputValue(input, portfolio);
      results.filled++;
    }
  }
}

// 校验必填字段
function validateRequired(resumeData, results) {
  const requiredFields = ['name', 'phone', 'email'];
  const allInputs = getAllInputs();

  for (const input of allInputs) {
    const label = getLabelText(input).toLowerCase();

    const isName = matchesKeywords(label, RESUME_KEYWORDS.basicInfo.name);
    const isPhone = matchesKeywords(label, RESUME_KEYWORDS.basicInfo.phone);
    const isEmail = matchesKeywords(label, RESUME_KEYWORDS.basicInfo.email);

    if ((isName || isPhone || isEmail) && !input.value.trim()) {
      results.failed.push(label || '必填字段');
    }

    // 格式校验
    if (isPhone && input.value && !/^1[3-9]\d{9}$/.test(input.value.replace(/\s/g, ''))) {
      results.warnings.push(`手机号格式可能有误：${input.value}`);
    }
    if (isEmail && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
      results.warnings.push(`邮箱格式可能有误：${input.value}`);
    }
  }
}

// 工具函数：sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================== 消息监听 ==================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_PAGE') {
    const result = checkAndReportPage();
    sendResponse({ isRecruitment: result });
  }

  if (message.type === 'GET_PAGE_STATUS') {
    sendResponse({ isRecruitment: pageIsRecruitment });
  }

  if (message.type === 'FILL_PAGE') {
    const resumeData = message.data;
    fillPage(resumeData).then(results => {
      sendResponse({ success: true, results });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 异步响应
  }

  if (message.type === 'FORCE_DETECT') {
    // 强制重新检测
    pageIsRecruitment = true; // 手动触发时强制认为是招聘页
    chrome.runtime.sendMessage({ type: 'PAGE_DETECTED', isRecruitment: true }, () => void chrome.runtime.lastError);
    sendResponse({ isRecruitment: true });
  }

  return true;
});
