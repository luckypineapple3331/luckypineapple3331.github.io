// background.js - Service Worker

// 监听来自 content.js 的页面检测结果
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_DETECTED') {
    const tabId = sender.tab.id;
    if (message.isRecruitment) {
      // 设置绿色徽章
      chrome.action.setBadgeText({ text: '✓', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    } else {
      // 清除徽章
      chrome.action.setBadgeText({ text: '', tabId });
    }
    sendResponse({ ok: true });
  }
  return true;
});

// 页面切换时重置徽章
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, { type: 'CHECK_PAGE' }, () => {
    // 忽略错误（页面可能没有 content script）
    void chrome.runtime.lastError;
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { type: 'CHECK_PAGE' }, () => {
      void chrome.runtime.lastError;
    });
  }
});
