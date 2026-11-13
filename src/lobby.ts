// The "play together" screen. Plain HTML on top of the game, because a phone
// keyboard and a share link are far easier that way than inside the canvas.

import { sfx, unlockAudio } from './audio';
import { CHARACTERS } from './characters';
import { GuestLink, HostLink, type NetStatus, type StartMsg, normaliseCode, randomCode } from './net';
import type { Difficulty, MatchMode, TeamLineup } from './sim';

export interface LobbyResult {
  role: 'host' | 'guest';
  link: HostLink | GuestLink;
  start: Omit<StartMsg, 't'>;
}

export interface LobbyOpts {
  charId: string;
  difficulty: Difficulty;
  onPlay: (r: LobbyResult) => void;
  onCancel: () => void;
}

const CSS = `
.bm-lobby{position:fixed;inset:0;z-index:20;display:flex;align-items:flex-start;justify-content:center;
  background:rgba(10,45,20,.92);font-family:'Trebuchet MS','Arial Rounded MT Bold',Arial,sans-serif;color:#fff;
  padding:16px;box-sizing:border-box;overflow:auto;-webkit-overflow-scrolling:touch}
.bm-card{margin:auto;background:#146b2e;border:5px solid rgba(255,255,255,.9);border-radius:26px;padding:22px 24px;
  max-width:560px;width:100%;box-sizing:border-box;text-align:center;box-shadow:0 14px 0 rgba(0,0,0,.25)}
.bm-card h2{margin:0 0 6px;font-size:30px;color:#ffe14d;text-shadow:0 3px 0 #0b3d1a}
.bm-card p{margin:6px 0 14px;font-size:17px;color:#dff5df;line-height:1.35}
.bm-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.bm-btn{appearance:none;border:4px solid rgba(255,255,255,.9);border-radius:16px;padding:14px 20px;
  font:inherit;font-size:20px;font-weight:bold;color:#fff;background:#2f7bff;cursor:pointer;
  box-shadow:0 5px 0 rgba(0,0,0,.25);min-height:56px;flex:1 1 200px}
.bm-btn:active{transform:translateY(4px);box-shadow:none}
.bm-btn.green{background:#3fae52}.bm-btn.grey{background:#54705c}.bm-btn.gold{background:#e2a32a}
.bm-code{font-size:56px;letter-spacing:12px;font-weight:bold;color:#ffe14d;text-shadow:0 4px 0 #0b3d1a;margin:10px 0}
.bm-input{font:inherit;font-size:40px;letter-spacing:12px;text-align:center;text-transform:uppercase;
  width:100%;max-width:300px;box-sizing:border-box;padding:10px;border-radius:14px;border:4px solid #fff;
  background:#0d4f21;color:#ffe14d;margin:6px 0 14px}
.bm-note{font-size:14px;color:#bcdcc0;margin-top:12px}
.bm-pick{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:4px 0 12px}
.bm-pick button{width:60px;height:60px;border-radius:50%;border:4px solid rgba(255,255,255,.5);
  font-size:28px;cursor:pointer;background:#0d4f21}
.bm-pick button[aria-pressed="true"]{border-color:#ffe14d;box-shadow:0 0 0 3px rgba(255,225,77,.4)}
/* A phone held sideways is short: shrink everything so nothing is cut off. */
@media (max-height:540px){
  .bm-card{padding:12px 16px;border-radius:18px;border-width:4px}
  .bm-card h2{font-size:22px;margin-bottom:2px}
  .bm-card p{font-size:14px;margin:4px 0 8px}
  .bm-btn{font-size:17px;padding:10px 14px;min-height:46px;border-width:3px;border-radius:13px}
  .bm-code{font-size:40px;letter-spacing:9px;margin:4px 0}
  .bm-input{font-size:30px;letter-spacing:9px;margin:2px 0 8px;padding:6px}
  .bm-pick{margin:2px 0 8px;gap:6px}
  .bm-pick button{width:46px;height:46px;font-size:22px;border-width:3px}
  .bm-note{font-size:12px;margin-top:6px}
}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const STATUS_TEXT: Record<NetStatus, string> = {
  idle: '',
  opening: 'Préparation…',
  waiting: 'En attente de ton copain…',
  connecting: 'Connexion…',
  connected: 'Connecté !',
  closed: 'Connexion perdue.',
  error: 'Impossible de se connecter.',
};

export function openLobby(opts: LobbyOpts): () => void {
  if (!document.getElementById('bm-lobby-css')) {
    const style = el('style');
    style.id = 'bm-lobby-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = el('div', 'bm-lobby');
  const card = el('div', 'bm-card');
  root.appendChild(card);
  document.body.appendChild(root);

  let link: HostLink | GuestLink | null = null;
  let guestChar = opts.charId;

  const close = () => {
    root.remove();
  };
  const abort = () => {
    link?.close();
    link = null;
    close();
    opts.onCancel();
  };

  const lineups = (hostChar: string, otherChar: string, mode: MatchMode): { home: TeamLineup; away: TeamLineup } => {
    const by = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    const mine = by(hostChar);
    const yours = by(otherChar === hostChar ? (CHARACTERS.find((c) => c.id !== hostChar) ?? CHARACTERS[1]).id : otherChar);
    const rest = CHARACTERS.filter((c) => c.id !== mine.id && c.id !== yours.id);
    const pick = (i: number) => rest[i % rest.length];
    if (mode === 'coop') {
      // Both children on the same team: seat 0 is the forward, seat 1 the defender.
      return {
        home: { fwd: mine, def: yours, gk: pick(0) },
        away: { fwd: pick(1), def: pick(2), gk: pick(3) },
      };
    }
    return {
      home: { fwd: mine, def: pick(0), gk: pick(1) },
      away: { fwd: yours, def: pick(2), gk: pick(3) },
    };
  };

  // ---------------------------------------------------------------- views

  const showChoice = (): void => {
    card.innerHTML = '';
    card.appendChild(el('h2', '', 'Jouer à deux'));
    card.appendChild(el('p', '', 'Chacun sur son téléphone. Un de vous crée la partie, l\'autre entre le code.'));
    const row = el('div', 'bm-row');
    const create = el('button', 'bm-btn green', '🎮 Créer une partie');
    const join = el('button', 'bm-btn', '🔑 Rejoindre');
    const back = el('button', 'bm-btn grey', '◀ Retour');
    create.onclick = () => { unlockAudio(); sfx.click(); showMode(); };
    join.onclick = () => { unlockAudio(); sfx.click(); showJoin(''); };
    back.onclick = () => { sfx.click(); abort(); };
    const row2 = el('div', 'bm-row');
    row2.appendChild(back);
    row.append(create, join);
    card.append(row, row2);
  };

  const showMode = (): void => {
    card.innerHTML = '';
    card.appendChild(el('h2', '', 'Vous jouez comment ?'));
    const row = el('div', 'bm-row');
    const coop = el('button', 'bm-btn green', '🤝 Ensemble<br><small>contre l\'ordinateur</small>');
    const versus = el('button', 'bm-btn gold', '⚔️ L\'un contre l\'autre');
    coop.onclick = () => { sfx.click(); startHost('coop'); };
    versus.onclick = () => { sfx.click(); startHost('versus'); };
    const back = el('button', 'bm-btn grey', '◀ Retour');
    back.onclick = () => { sfx.click(); showChoice(); };
    const row2 = el('div', 'bm-row');
    row2.appendChild(back);
    row.append(coop, versus);
    card.append(row, row2);
  };

  const startHost = (mode: MatchMode): void => {
    const code = randomCode();
    card.innerHTML = '';
    card.appendChild(el('h2', '', 'Ton code de partie'));
    const codeEl = el('div', 'bm-code', code);
    const state = el('p', '', STATUS_TEXT.opening);
    card.append(codeEl, state);

    const url = `${location.origin}${location.pathname}?p=${code}`;
    const share = el('button', 'bm-btn', '🔗 Copier le lien');
    share.onclick = async () => {
      sfx.click();
      try {
        const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
        if (nav.share) await nav.share({ title: 'Bouskimatch', url });
        else { await navigator.clipboard.writeText(url); share.textContent = '✅ Lien copié !'; }
      } catch { share.textContent = url; }
    };
    const back = el('button', 'bm-btn grey', '◀ Annuler');
    back.onclick = () => { sfx.click(); abort(); };
    const row = el('div', 'bm-row');
    row.append(share, back);
    card.append(row, el('div', 'bm-note', 'Ton copain ouvre le lien, ou tape le code dans « Rejoindre ».'));

    link = new HostLink({
      onStatus: (s, detail) => {
        state.textContent = STATUS_TEXT[s] + (s === 'error' && detail ? ` (${detail})` : '');
      },
      onHello: (charId) => { guestChar = charId; },
      onPeerLeft: () => { state.textContent = 'Ton copain est parti.'; },
    }, code);

    // Wait for the guest to say which character it wants, then kick off.
    const waitAndStart = () => {
      const host = link as HostLink;
      if (!host || !host.ready) return;
      const { home, away } = lineups(opts.charId, guestChar, mode);
      const start = { difficulty: opts.difficulty, mode, seed: Math.floor(Math.random() * 1e9), home, away };
      host.sendStart(start);
      close();
      opts.onPlay({ role: 'host', link: host, start });
    };
    const timer = window.setInterval(() => {
      if (!document.body.contains(root)) { window.clearInterval(timer); return; }
      if (link && link.ready) { window.clearInterval(timer); window.setTimeout(waitAndStart, 350); }
    }, 120);
  };

  const showJoin = (prefill: string): void => {
    card.innerHTML = '';
    card.appendChild(el('h2', '', 'Rejoindre une partie'));
    card.appendChild(el('p', '', 'Tape le code que ton copain te donne.'));

    const input = el('input', 'bm-input');
    input.setAttribute('maxlength', '4');
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', 'text');
    input.placeholder = '····';
    input.value = prefill;
    card.appendChild(input);

    card.appendChild(el('p', '', 'Ton perso :'));
    const pick = el('div', 'bm-pick');
    CHARACTERS.forEach((c) => {
      const b = el('button', '', c.face);
      b.title = c.name;
      b.setAttribute('aria-pressed', String(c.id === guestChar));
      b.onclick = () => {
        guestChar = c.id;
        sfx.click();
        pick.querySelectorAll('button').forEach((o, i) => o.setAttribute('aria-pressed', String(CHARACTERS[i].id === guestChar)));
      };
      pick.appendChild(b);
    });
    card.appendChild(pick);

    const state = el('p', '', '');
    const go = el('button', 'bm-btn green', '▶ Rejoindre');
    const back = el('button', 'bm-btn grey', '◀ Retour');
    back.onclick = () => { sfx.click(); link?.close(); link = null; showChoice(); };
    const row = el('div', 'bm-row');
    row.append(go, back);
    card.append(row, state);

    go.onclick = () => {
      const code = normaliseCode(input.value);
      if (code.length !== 4) { state.textContent = 'Il faut 4 lettres.'; return; }
      unlockAudio();
      sfx.click();
      go.disabled = true;
      input.disabled = true;
      state.textContent = STATUS_TEXT.connecting;
      link = new GuestLink({
        onStatus: (s, detail) => {
          state.textContent = STATUS_TEXT[s] + (s === 'error' && detail ? ` (${detail})` : '');
          if (s === 'error' || s === 'closed') { go.disabled = false; input.disabled = false; }
        },
        onStart: (msg) => {
          const guest = link as GuestLink;
          close();
          opts.onPlay({ role: 'guest', link: guest, start: msg });
        },
      }, code, guestChar);
    };
    if (prefill.length === 4) window.setTimeout(() => go.click(), 100);
  };

  // A link like ...?p=ABCD goes straight to joining that game.
  const fromUrl = normaliseCode(new URLSearchParams(location.search).get('p') ?? '');
  if (fromUrl.length === 4) showJoin(fromUrl);
  else showChoice();

  return abort;
}
