// 拡張機能側(isolated world)。データを保持し、マイページにボタンを出す。
const BTN_ID = 'coc-roster-open-btn';
let latest = null;

// 検索に使う項目だけに絞る(保存容量・転送量の削減)
function optimizeChars(chars) {
  return chars.map((ch) => {
    const d = ch.data || {};
    return {
      id: ch.id,
      data: {
        version: d.version,
        profile: d.profile,
        abilities: d.abilities,
        actionSkills: d.actionSkills,
        battleSkills: d.battleSkills,
        searchSkills: d.searchSkills,
        knowledgeSkills: d.knowledgeSkills,
        negotiationSkills: d.negotiationSkills,
      },
    };
  });
}

window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.type === 'COC_CHARA_DATA') {
    let parsed = e.data.data;
    if (!Array.isArray(parsed)) parsed = [parsed];
    latest = optimizeChars(parsed);
    updateButton();
  }
});

const isMyPage = () => location.pathname.startsWith('/mypage');

// 拡張機能が更新・再読み込みされると、開きっぱなしのタブに残った古いスクリプトは
// 拡張機能本体と繋がらなくなる(chrome.runtime.id が消える)。その状態を検出する。
const STALE_LABEL = '拡張機能が更新されました。クリックでページを再読み込みします';
let stale = false;

function isContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

function markStale() {
  stale = true;
  const btn = document.getElementById(BTN_ID);
  if (btn) applyState(btn);
}

function isInvalidatedError(err) {
  return /context invalidated/i.test(String((err && err.message) || err));
}

function onSendError(err) {
  // 「Extension context invalidated」のほか、chrome.runtime 自体が消えた場合も同じ扱いにする
  if (isInvalidatedError(err) || !isContextValid()) {
    markStale();
    location.reload();
  } else {
    console.warn('[いあきゃら✦探索者検索]', err);
  }
}

function openViewer() {
  // 繋がりが切れていたら、再読み込みして新しい拡張機能につなぎ直す
  if (stale || !isContextValid()) {
    markStale();
    location.reload();
    return;
  }
  if (!latest) return;
  try {
    chrome.runtime.sendMessage({ type: 'OPEN_VIEWER', data: latest }).catch(onSendError);
  } catch (err) {
    onSendError(err);
  }
}

function createButton() {
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  Object.assign(btn.style, {
    position: 'fixed', left: '16px', bottom: '16px', zIndex: '99999',
    width: '44px', height: '44px', padding: '0', border: 'none',
    background: 'none', cursor: 'pointer', borderRadius: '10px',
    boxShadow: '0 0 0 1px rgba(83,255,167,.55), 0 2px 8px rgba(0,0,0,.35)',
    transition: 'transform .15s, opacity .15s'
  });

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/icon48.png');
  img.alt = '';
  Object.assign(img.style, {
    display: 'block', width: '100%', height: '100%',
    borderRadius: '10px', pointerEvents: 'none'
  });
  btn.append(img);

  btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.transform = 'scale(1.08)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  btn.addEventListener('click', openViewer);
  return btn;
}

// ボタンの見た目(有効/無効・説明文)を、今の状態に合わせる
function applyState(btn) {
  let label, enabled;
  if (stale) {
    label = STALE_LABEL; enabled = true;
  } else if (latest) {
    label = 'いあきゃら✦探索者検索を開く'; enabled = true;
  } else {
    label = 'データ取得待ち…'; enabled = false;
  }
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '.5';
  btn.style.cursor = enabled ? 'pointer' : 'default';
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// Next.jsのSPA遷移に対応するため、定期的に状態を合わせる
function updateButton() {
  let btn = document.getElementById(BTN_ID);
  if (!isMyPage()) { if (btn) btn.remove(); return; }
  if (!document.body) return;
  if (!stale && !isContextValid()) stale = true;
  // 拡張機能と切れている間は、新しいボタンを作らない(chrome.runtime.getURL が例外になるため)
  if (!btn) {
    if (stale) return;
    btn = createButton();
    document.body.append(btn);
  }
  applyState(btn);
}
setInterval(updateButton, 1000);
