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
  btn.addEventListener('click', () => {
    if (!latest) return;
    chrome.runtime.sendMessage({ type: 'OPEN_VIEWER', data: latest });
  });
  return btn;
}

// Next.jsのSPA遷移に対応するため、定期的に状態を合わせる
function updateButton() {
  let btn = document.getElementById(BTN_ID);
  if (!isMyPage()) { if (btn) btn.remove(); return; }
  if (!document.body) return;
  if (!btn) { btn = createButton(); document.body.append(btn); }
  btn.disabled = !latest;
  btn.style.opacity = latest ? '1' : '.5';
  btn.style.cursor = latest ? 'pointer' : 'default';
  const label = latest ? 'いあきゃら✦探索者検索を開く' : 'データ取得待ち…';
  btn.title = label;
  btn.setAttribute('aria-label', label);
}
setInterval(updateButton, 1000);
