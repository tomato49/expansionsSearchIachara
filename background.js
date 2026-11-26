const VIEWER_URL = chrome.runtime.getURL('viewer.html');

// 検索画面のタブ自身が起動時に VIEWER_READY を送ってくるので、そのタブIDを覚えておく。
// (URLでタブを探す方法は権限の都合で当てにならないため、IDで管理する)
async function getViewerTab() {
  const { viewerTabId } = await chrome.storage.session.get('viewerTabId');
  if (viewerTabId == null) return null;
  try {
    const tab = await chrome.tabs.get(viewerTabId);
    // 別のページに移動されていたら対象外
    if (tab.url && !tab.url.startsWith(VIEWER_URL)) return null;
    return tab;
  } catch (_) {
    return null; // タブは閉じられている
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function createViewerTab() {
  const tab = await chrome.tabs.create({ url: VIEWER_URL });
  // 起動直後の連打で複数開かないよう、作った時点で登録する
  await chrome.storage.session.set({ viewerTabId: tab.id });
}

// 検索画面のタブを開く。すでに開いていれば新しく作らず、それを前面に出す。
//  - data あり(マイページのボタン): 内容が変わっていれば保存して再読み込み、同じならそのまま前面へ
//  - data なし(ツールバーのアイコン): 保存済みのデータでそのまま開く
async function openViewer(data) {
  const tab = await getViewerTab();

  if (data) {
    const { charaData: old } = await chrome.storage.session.get('charaData');
    const changed = JSON.stringify(old) !== JSON.stringify(data);
    if (changed) {
      await chrome.storage.session.set({ charaData: data, receivedAt: Date.now() });
    }
    if (tab) {
      if (changed) await chrome.tabs.reload(tab.id);
      await focusTab(tab);
      return;
    }
  } else if (tab) {
    await focusTab(tab);
    return;
  }

  await createViewerTab();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === 'OPEN_VIEWER') openViewer(msg.data);
  if (msg.type === 'VIEWER_READY' && sender.tab) {
    chrome.storage.session.set({ viewerTabId: sender.tab.id });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { viewerTabId } = await chrome.storage.session.get('viewerTabId');
  if (viewerTabId === tabId) await chrome.storage.session.remove('viewerTabId');
});

chrome.action.onClicked.addListener(() => openViewer(null));
