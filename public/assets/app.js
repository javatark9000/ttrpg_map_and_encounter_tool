import { $, $$, api, esc, toast } from './js/core.js';
import {
  dialog,
  dialogForm,
  installDefaultDialogHandlers,
  openForm,
  releaseDialog,
} from './js/dialogs.js';
import { openNpcCreatureInfo } from './js/codex.js';
import { state } from './js/state.js';

const DRAW_POINT_MIN_DISTANCE = 0.18;
function displayHp(v, t = null) {
  return Math.max(t?.kind === 'PLAYER' || t?.actor_type === 'PLAYER' ? -10 : 0, Number(v ?? 0));
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}

// Authentication and initial application state.
$$('[data-auth-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      $$('[data-auth-tab]').forEach((x) => x.classList.toggle('active', x === b));
      $('#login-form').hidden = b.dataset.authTab !== 'login';
      $('#guest-access').hidden = b.dataset.authTab !== 'login';
      $('#register-form').hidden = b.dataset.authTab !== 'register';
    }),
);
$('#register-form [name=role]').onchange = (e) =>
  ($('#invite-wrap').hidden = e.target.value !== 'DM');
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    await start();
  } catch (x) {
    $('#auth-error').textContent = x.message;
  }
};
$('#register-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/auth/register', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    await start();
  } catch (x) {
    $('#auth-error').textContent = x.message;
  }
};
$('#guest-login').onclick = async () => {
  const button = $('#guest-login');
  button.disabled = true;
  $('#auth-error').textContent = '';
  try {
    await api('/auth/guest', { method: 'POST', body: '{}' });
    await start();
  } catch (x) {
    $('#auth-error').textContent = x.message;
    button.disabled = false;
  }
};
$('#logout').onclick = async () => {
  await api('/auth/logout', { method: 'POST', body: '{}' });
  location.reload();
};

async function start() {
  const me = await api('/me');
  if (!me.user) {
    $('#auth').hidden = false;
    $('#app').hidden = true;
    return;
  }
  state.user = me.user;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#user-label').textContent = `${me.user.name} · ${me.user.role}`;
  document.body.classList.toggle('is-dm', me.user.role === 'DM');
  document.body.classList.toggle('is-guest', me.user.role === 'GUEST');
  $$('.dm-only').forEach((e) => (e.hidden = me.user.role !== 'DM'));
  $$('.player-only').forEach((e) => (e.hidden = me.user.role !== 'PLAYER'));
  $('#characters-panel').hidden = me.user.role !== 'PLAYER';
  if (me.user.role === 'GUEST') {
    $('[data-mode="pan"]').hidden = true;
    $('#zoom-in').hidden = true;
    $('#zoom-out').hidden = true;
    $('#zoom-label').hidden = true;
    $('#empty h2').textContent = 'Esperando al DM';
    $('#empty p').textContent = 'El mapa aparecerá cuando el DM visualice un escenario activo.';
  }
  await loadBootstrap();
  connectWs();
}
async function loadBootstrap() {
  state.bootstrap = await api('/bootstrap');
  renderSidebar();
}
function controlledPlayer() {
  if (!state.data || !state.selectedCharacter) return null;
  return (
    state.data.players.find(
      (p) =>
        +p.user_id === +state.user.id && +p.character_id === +state.selectedCharacter && +p.placed,
    ) || null
  );
}
function renderSidebar() {
  const list = $('#scenario-list');
  list.innerHTML = '';
  state.bootstrap.scenarios.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'scenario-item' + (s.id === state.scenarioId ? ' active' : '');
    b.innerHTML = `<span>${esc(s.name)}</span>${s.active ? '<span class="dot">●</span>' : ''}`;
    b.onclick = () => openScenario(s.id);
    list.append(b);
  });
  const chars = $('#character-list');
  chars.innerHTML = '';
  state.bootstrap.characters.forEach((c) => {
    const b = document.createElement('button'),
      placed =
        state.data &&
        +state.data.scenario?.id === +state.scenarioId &&
        state.data.players.some(
          (p) => +p.user_id === +state.user.id && +p.character_id === +c.id && +p.placed,
        );
    b.textContent = `${c.name} (${c.max_health} PV)${placed ? ' · en mapa' : ''}`;
    b.classList.toggle('active', state.selectedCharacter === +c.id);
    b.onclick = () => {
      state.selectedCharacter = +c.id;
      state.path = [];
      document.body.classList.remove('menu-open');
      renderSidebar();
      draw();
      toast(`Controlando a ${c.name}`);
    };
    chars.append(b);
  });
}
$('#new-scenario').onclick = async () => {
  const values = await openForm({
    title: 'Crear escenario',
    description: 'Configura el nombre y las dimensiones de la cuadrícula.',
    submitText: 'Crear escenario',
    fields: [
      { name: 'name', label: 'Nombre', required: true, placeholder: 'Ej. Bosque encantado' },
      {
        name: 'width',
        label: 'Ancho de la cuadrícula',
        type: 'number',
        value: 25,
        min: 5,
        max: 60,
        required: true,
        help: 'Entre 5 y 60 casillas.',
      },
      {
        name: 'height',
        label: 'Alto de la cuadrícula',
        type: 'number',
        value: 25,
        min: 5,
        max: 60,
        required: true,
        help: 'Entre 5 y 60 casillas.',
      },
    ],
  });
  if (!values) return;
  try {
    const d = await api('/scenarios', {
      method: 'POST',
      body: JSON.stringify({
        campaignId: +state.bootstrap.campaigns[0].id,
        name: values.name,
        width: +values.width,
        height: +values.height,
      }),
    });
    await loadBootstrap();
    openScenario(d.id);
  } catch (e) {
    toast(e.message);
  }
};
$('#new-character').onclick = async () => {
  const values = await openForm({
    title: 'Crear personaje',
    description: 'Podrás cambiar su avatar después.',
    submitText: 'Crear personaje',
    fields: [
      { name: 'name', label: 'Nombre del personaje', required: true, placeholder: 'Ej. Arannis' },
      {
        name: 'maxHealth',
        label: 'Vida Máxima',
        type: 'number',
        value: 10,
        min: 1,
        required: true,
      },
    ],
  });
  if (!values) return;
  try {
    await api('/characters', {
      method: 'POST',
      body: JSON.stringify({
        campaignId: +state.bootstrap.campaigns[0].id,
        name: values.name,
        maxHealth: +values.maxHealth,
      }),
    });
    await loadBootstrap();
  } catch (e) {
    toast(e.message);
  }
};
$('#menu-btn').onclick = () => document.body.classList.toggle('menu-open');
$('#right-panel-toggle').onclick = () => document.body.classList.toggle('right-panel-collapsed');

// Realtime synchronization, chat, and encounter panels.
function wsUrl() {
  const configured = $('meta[name=ws-url]').content;
  if (configured) return configured;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8081`;
}
function connectWs() {
  const ws = new WebSocket(wsUrl());
  state.ws = ws;
  ws.onopen = () => {
    $('#connection').textContent = 'online';
    $('#connection').className = 'pill online';
    if (state.scenarioId) subscribe();
    ws._beat = setInterval(
      () => ws.readyState === 1 && ws.send(JSON.stringify({ action: 'heartbeat' })),
      20000,
    );
  };
  ws.onclose = () => {
    clearInterval(ws._beat);
    $('#connection').textContent = 'offline';
    $('#connection').className = 'pill offline';
    setTimeout(connectWs, 2500);
  };
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'snapshot') handleSnapshot(m.data);
    else if (m.type === 'refresh' && m.scenarioId === state.scenarioId) subscribe();
    else if (m.type === 'scenarios.changed') await syncScenarioList();
    else if (m.type === 'dm.view.changed') await followDmView(m);
    else if (m.type === 'chat.message') handleChatMessage(m.data);
    else if (m.type === 'draw.event') handleDrawEvent(m.data);
    else if (m.type === 'command.error') toast(m.error);
    else if (m.type === 'error') toast(m.error);
  };
}
async function syncScenarioList() {
  await loadBootstrap();
  if (state.scenarioId && !state.bootstrap.scenarios.some((s) => +s.id === +state.scenarioId)) {
    state.scenarioId = null;
    state.data = null;
    state.path = [];
    state.selectedObjects.clear();
    state.selectedNpcs.clear();
    $('#workspace').hidden = true;
    $('#right-panel').hidden = true;
    $('#empty').hidden = false;
    $('#empty h2').textContent = 'Mapa no disponible';
    $('#empty p').textContent =
      state.user.role === 'DM'
        ? 'El mapa fue eliminado/ocultado.'
        : 'El DM ocultó o desactivó este mapa. Elige otro escenario activo.';
    toast(
      state.user.role === 'DM' ? 'Mapa eliminado/ocultado' : 'El escenario ya no está disponible',
    );
  }
  if (state.user.role === 'GUEST' && state.ws?.readyState === 1)
    state.ws.send(JSON.stringify({ action: 'guest.view.get' }));
}
async function openScenario(id) {
  state.scenarioId = +id;
  state.path = [];
  state.drawings = [];
  state.drawStroke = null;
  state.selectedObjects.clear();
  state.selectedNpcs.clear();
  state.selectedPlayers.clear();
  state.lastPendingRequestIds = new Set();
  state.chatThreads = [];
  state.openChats.clear();
  $('#chat-windows').innerHTML = '';
  state.encounterSelecting = false;
  state.visibilityAnimations.clear();
  state.followCamera = null;
  state.camera = { x: 30, y: state.user.role === 'DM' ? 30 - cellSize * 5 : 30, z: 1 };
  renderSidebar();
  document.body.classList.remove('menu-open');
  $('#empty').hidden = true;
  $('#workspace').hidden = false;
  $('#right-panel').hidden = false;
  resize();
  if (state.ws?.readyState === 1) subscribe();
  else {
    try {
      state.data = await api(`/scenarios/${id}/snapshot`);
      fitMapFocusForPlayers();
      renderSidebar();
      renderDetails();
      draw();
    } catch (e) {
      toast(e.message);
    }
  }
}
function subscribe() {
  state.ws.send(
    JSON.stringify({ action: 'subscribe', scenarioId: state.scenarioId, camera: sharedCamera() }),
  );
}
function sharedCamera() {
  const r = canvas.getBoundingClientRect(),
    z = state.camera.z;
  return {
    centerX: (r.width / 2 - state.camera.x) / (cellSize * z),
    centerY: (r.height / 2 - state.camera.y) / (cellSize * z),
    zoom: z,
  };
}
function applySharedCamera(camera) {
  if (!camera) return;
  state.followCamera = camera;
  const r = canvas.getBoundingClientRect(),
    z = Math.min(3, Math.max(0.25, +camera.zoom || 1));
  state.camera.z = z;
  state.camera.x = r.width / 2 - (+camera.centerX || 0) * cellSize * z;
  state.camera.y = r.height / 2 - (+camera.centerY || 0) * cellSize * z;
  $('#zoom-label').textContent = Math.round(z * 100) + '%';
  draw();
}
async function followDmView(message) {
  if (state.user.role !== 'GUEST') return;
  if (!state.bootstrap.scenarios.some((s) => +s.id === +message.scenarioId)) await loadBootstrap();
  if (!state.bootstrap.scenarios.some((s) => +s.id === +message.scenarioId)) return;
  if (+state.scenarioId !== +message.scenarioId) await openScenario(+message.scenarioId);
  applySharedCamera(message.camera);
}
function publishDmView() {
  if (
    state.user?.role !== 'DM' ||
    !state.scenarioId ||
    !+state.data?.scenario?.active ||
    state.ws?.readyState !== 1
  )
    return;
  clearTimeout(state.viewPublishTimer);
  state.viewPublishTimer = setTimeout(
    () =>
      state.ws?.readyState === 1 &&
      state.ws.send(
        JSON.stringify({ action: 'dm.view', scenarioId: state.scenarioId, camera: sharedCamera() }),
      ),
    80,
  );
}
function command(type, payload = {}) {
  if (state.ws?.readyState !== 1) {
    toast('Sin conexión');
    return;
  }
  state.ws.send(
    JSON.stringify({
      action: 'command',
      type,
      requestId: crypto.randomUUID().replaceAll('-', ''),
      payload: { ...payload, scenarioId: state.scenarioId },
    }),
  );
}
function handleSnapshot(data) {
  prepareAnimations(state.data, data);
  const prev = state.lastPendingRequestIds;
  state.data = data;
  fitMapFocusForPlayers();
  renderSidebar();
  renderDetails();
  draw();
  if (state.user?.role === 'DM') {
    const pending = new Set((data.pendingMovements || []).map((x) => +x.id));
    for (const r of data.pendingMovements || [])
      if (!prev.has(+r.id))
        notifyApp(`Solicitud de ${r.user_name}`, r.reason || 'Movimiento pendiente', focusRequests);
    state.lastPendingRequestIds = pending;
  }
  loadChatThreads().catch(() => {});
}
function notifyApp(title, body, onClick) {
  if (matchMedia('(max-width:850px)').matches && 'Notification' in window) {
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission === 'default')
      Notification.requestPermission().then((p) => {
        if (p === 'granted') new Notification(title, { body });
      });
  }
  const stack = $('#notification-stack');
  if (!stack) return;
  const b = document.createElement('button');
  b.className = 'app-notification';
  b.innerHTML = `<strong>${esc(title)}</strong><p>${esc(body)}</p>`;
  b.onclick = () => {
    b.remove();
    onClick?.();
  };
  stack.append(b);
  setTimeout(() => b.remove(), 9000);
}
function focusRequests() {
  const p = $('#requests-panel');
  p?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  p?.closest('details')?.setAttribute('open', '');
}
async function downloadEncounterLog() {
  if (!confirm('¿Quieres descargar el log del encuentro anterior?')) return;
  try {
    const res = await fetch(`/api/scenarios/${state.scenarioId}/encounter-log`, {
      credentials: 'same-origin',
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({ error: 'No se pudo descargar el log' }))).error,
      );
    const blob = await res.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `encounter-${state.scenarioId}-log.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast(e.message);
  }
}
async function loadChatThreads() {
  if (!state.scenarioId || state.user.role === 'GUEST') return;
  const data = await api(`/scenarios/${state.scenarioId}/chats`);
  state.chatThreads = data.threads || [];
  renderChatThreads();
}
function renderChatThreads() {
  const target = state.user.role === 'DM' ? $('#dm-chat-list') : $('#player-chat-list');
  if (!target) return;
  target.innerHTML = '';
  for (const t of state.chatThreads) {
    const b = document.createElement('button');
    b.className = 'chat-thread';
    b.innerHTML = `${state.user.role === 'DM' ? esc(t.player_name) : 'Chat con DM'} ${+t.unread ? `<span class="badge">${+t.unread}</span>` : ''}<br><small>${esc(t.last_message || 'Sin mensajes')}</small>`;
    b.onclick = () => openChat(+t.id, t.player_name || 'DM');
    target.append(b);
  }
  if (!state.chatThreads.length) target.innerHTML = '<p class="muted">Sin chats.</p>';
}
async function openChat(chatId, title = 'Chat') {
  const data = await api(`/chats/${chatId}/messages`);
  let win = state.openChats.get(chatId);
  if (!win) {
    win = document.createElement('div');
    win.className = 'chat-window';
    win.innerHTML = `<header><strong></strong><button type="button" class="icon-button">×</button></header><div class="chat-messages"></div><form class="chat-send"><input name="message" autocomplete="off" maxlength="2000" placeholder="Mensaje…"><button>Enviar</button></form>`;
    win.querySelector('.icon-button').onclick = () => {
      state.openChats.delete(chatId);
      win.remove();
    };
    win.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const input = e.target.elements.message,
        msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      state.ws.send(
        JSON.stringify({
          action: 'chat.send',
          scenarioId: state.scenarioId,
          payload: { chatId, message: msg },
        }),
      );
    };
    $('#chat-windows').append(win);
    state.openChats.set(chatId, win);
  }
  win.querySelector('header strong').textContent = title;
  renderChatWindow(win, data.messages || []);
  loadChatThreads().catch(() => {});
}
function renderChatWindow(win, messages) {
  const box = win.querySelector('.chat-messages');
  box.innerHTML = messages
    .map(
      (m) =>
        `<div class="chat-msg ${+m.sender_id === +state.user.id ? 'mine' : ''}"><small>${esc(m.sender_name)} · ${esc(m.created_at)}</small>${esc(m.message)}</div>`,
    )
    .join('');
  box.scrollTop = box.scrollHeight;
}
function handleChatMessage(msg) {
  loadChatThreads().catch(() => {});
  const open = state.openChats.get(+msg.chat_id);
  if (open) openChat(+msg.chat_id, msg.player_name || 'Chat');
  else
    notifyApp(
      state.user.role === 'DM' ? `Chat de ${msg.player_name}` : 'Mensaje del DM',
      msg.message,
      () => openChat(+msg.chat_id, msg.player_name || 'DM'),
    );
}
function handleEncounterStart() {
  if (!state.encounterSelecting) {
    state.encounterSelecting = true;
    state.selectedPlayers = new Set(state.data.players.filter((p) => +p.placed).map((p) => +p.id));
    state.selectedNpcs = new Set(
      state.data.npcs.filter((n) => +n.visible && +n.health > 0).map((n) => +n.id),
    );
    state.selectedObjects.clear();
    $('#encounter-start').textContent = 'Confirmar';
    setMode('select');
    toast('Deselecciona las fichas que no participarán y pulsa Confirmar');
    draw();
    return;
  }
  const participants = [...state.selectedPlayers]
    .map((id) => ({ kind: 'PLAYER', id }))
    .concat([...state.selectedNpcs].map((id) => ({ kind: 'NPC', id })));
  state.encounterSelecting = false;
  $('#encounter-start').textContent = 'Iniciar combate';
  command('encounter.start', { participants });
}
function renderPlayerHp() {
  const list = $('#player-hp-list');
  if (!list || state.user.role !== 'PLAYER') return;
  const mine = (state.data?.players || []).filter(
    (p) => +p.user_id === +state.user.id && p.health !== undefined,
  );
  list.innerHTML = mine.length
    ? mine
        .map(
          (p) =>
            `<div class="hp-card ${+p.health <= 0 ? 'down' : ''}"><div><strong>${esc(p.name || p.user_name || 'Personaje')}${+p.health <= 0 ? ' · Caído' : ''}</strong><br><span>${esc(displayHp(p.health, { kind: 'PLAYER' }))} / ${esc(p.max_health ?? p.health)} PV</span></div><div class="row"><button data-rot-left="${+p.id}" title="Rotar -45°">↶</button><button data-rot-right="${+p.id}" title="Rotar +45°">↷</button></div></div>`,
        )
        .join('')
    : '<p class="muted">No tienes fichas colocadas en este mapa.</p>';
  list.querySelectorAll('[data-rot-left]').forEach(
    (b) =>
      (b.onclick = () => {
        const p = mine.find((x) => +x.id === +b.dataset.rotLeft);
        if (p)
          command('player.rotate', {
            id: +p.id,
            rotation_degrees: ((+p.rotation_degrees || 0) - 45 + 360) % 360,
          });
      }),
  );
  list.querySelectorAll('[data-rot-right]').forEach(
    (b) =>
      (b.onclick = () => {
        const p = mine.find((x) => +x.id === +b.dataset.rotRight);
        if (p)
          command('player.rotate', {
            id: +p.id,
            rotation_degrees: ((+p.rotation_degrees || 0) + 45) % 360,
          });
      }),
  );
}
function renderRoundOrder() {
  const panel = $('#round-order-panel'),
    list = $('#round-order-list');
  if (!panel || !list) return;
  const encounter = state.data?.encounter,
    show = state.user.role === 'DM' && encounter && encounter.state !== 'OFF';
  panel.hidden = !show;
  if (!show) {
    list.innerHTML = '';
    return;
  }
  const rows = [...state.data.participants]
    .filter((p) => p.state !== 'REMOVED')
    .sort(
      (a, b) =>
        Number(b.initiative ?? -999) - Number(a.initiative ?? -999) ||
        +a.tie_order - +b.tie_order ||
        +a.id - +b.id,
    )
    .map((p) => {
      const token =
        p.actor_type === 'PLAYER'
          ? state.data.players.find((x) => +x.id === +p.actor_id)
          : state.data.npcs.find((x) => +x.id === +p.actor_id);
      if (!token) return null;
      if (p.actor_type === 'PLAYER' && !+token.placed) return null;
      if (p.actor_type === 'NPC' && !+token.visible) return null;
      const current =
        encounter.current_participant_id && +encounter.current_participant_id === +p.id;
      const max =
        p.actor_type === 'PLAYER'
          ? (token.max_health ?? token.health)
          : (token.max_health ?? token.health);
      return {
        name: token.name || token.user_name || 'Token',
        initiative: p.initiative ?? token.initiative ?? '—',
        hp: token.health === undefined ? '—' : displayHp(token.health, { kind: p.actor_type }),
        max: max ?? '—',
        current,
      };
    })
    .filter(Boolean);
  list.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<li class="${r.current ? 'current-round-token' : ''}"><span>${esc(r.name)} <small>(IR: ${esc(r.initiative)})</small></span><strong>${esc(r.hp)} / ${esc(r.max)}</strong></li>`,
        )
        .join('')
    : '<li class="muted">No hay fichas visibles con iniciativa en el encounter.</li>';
}

function movementPathPreview(m, anchor) {
  let path = [];
  try {
    path = typeof m.path === 'string' ? JSON.parse(m.path) : m.path || [];
  } catch {}
  if (!path.length) return;
  $('.movement-preview')?.remove();
  const player = state.data.players.find((p) => +p.id === +m.scenario_player_id),
    points = [
      player ? { x: +player.x, y: +player.y } : path[0],
      ...path.map((c) => ({ x: +c.x, y: +c.y })),
    ],
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys),
    w = maxX - minX + 1,
    h = maxY - minY + 1,
    box = document.createElement('div'),
    canvas = document.createElement('canvas'),
    cw = 220,
    ch = 160,
    pad = 18,
    scale = Math.min((cw - pad * 2) / Math.max(1, w), (ch - pad * 2) / Math.max(1, h));
  canvas.width = cw;
  canvas.height = ch;
  box.className = 'movement-preview floating';
  box.innerHTML = `<strong>${esc(m.character_name || m.user_name)}</strong><small>${points.length - 1} paso${points.length - 1 === 1 ? '' : 's'} solicitados</small>`;
  box.append(canvas);
  document.body.append(box);
  const ctx = canvas.getContext('2d'),
    sx = (x) => pad + (x - minX + 0.5) * scale,
    sy = (y) => pad + (y - minY + 0.5) * scale;
  ctx.fillStyle = '#100d0ae8';
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = '#d7aa5233';
  ctx.lineWidth = 1;
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      ctx.strokeRect(pad + (x - minX) * scale, pad + (y - minY) * scale, scale, scale);
  ctx.strokeStyle = '#58aee4aa';
  ctx.lineWidth = Math.max(4, scale * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
  ctx.stroke();
  points.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#5d9c63cc' : i === points.length - 1 ? '#d7aa52dd' : '#58aee488';
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), Math.max(4, scale * 0.18), 0, Math.PI * 2);
    ctx.fill();
  });
  const r = anchor.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(innerWidth - 250, r.left - 235)) + 'px';
  box.style.top = Math.max(8, Math.min(innerHeight - 210, r.top)) + 'px';
}
function renderDetails() {
  const d = state.data,
    s = d.scenario;
  $('#scenario-title').textContent = s.name;
  $('#scenario-status').textContent =
    `${s.width}×${s.height} · ${+s.active ? 'Activo' : 'Inactivo'}`;
  $('#toggle-active').textContent = +s.active ? 'Desactivar' : 'Activar';
  $('#turn-info').textContent = d.encounter
    ? `${d.encounter.state} · Ronda ${d.encounter.round_no || 0}`
    : 'Sin encounter';
  if ($('#encounter-log'))
    $('#encounter-log').hidden = !(state.user.role === 'DM' && d.previousEncounterLog);
  if (!state.encounterSelecting) $('#encounter-start').textContent = 'Iniciar combate';
  renderPlayerHp();
  renderRoundOrder();
  const req = $('#movement-requests');
  req.innerHTML = '';
  $('.movement-preview')?.remove();
  d.pendingMovements.forEach((m) => {
    const x = document.createElement('div');
    x.className = 'request';
    x.innerHTML = `<strong>${esc(m.user_name)}${m.character_name ? ` · ${esc(m.character_name)}` : ''}</strong><br><small>${esc(m.reason || 'Requiere revisión')}</small><br><button data-a>✓ Aprobar</button><button data-r>✕ Rechazar</button>`;
    x.onclick = (e) => {
      if (e.target.closest('button')) return;
      movementPathPreview(m, x);
    };
    x.onmouseenter = () => movementPathPreview(m, x);
    x.onmouseleave = () =>
      setTimeout(() => {
        if (!$('.movement-preview:hover')) $('.movement-preview')?.remove();
      }, 120);
    x.querySelector('[data-a]').onclick = (e) => {
      e.stopPropagation();
      command('movement.approve', { movementId: +m.id });
    };
    x.querySelector('[data-r]').onclick = (e) => {
      e.stopPropagation();
      command('movement.reject', { movementId: +m.id });
    };
    req.append(x);
  });
  if (selectionCount()) renderEntitySelection();
  else draw();
}
$('#toggle-active').onclick = async () => {
  const active = +state.data.scenario.active;
  if (active) {
    const accepted = await openForm({
      title: 'Desactivar escenario',
      description:
        'Los jugadores saldrán del escenario, pero se conservarán posiciones, vida, iniciativas, notas y el estado del encounter.',
      submitText: 'Desactivar',
      danger: true,
      fields: [],
    });
    if (!accepted) return;
  }
  command(active ? 'scenario.deactivate' : 'scenario.activate');
};
$('#copy-alive-previous').onclick = async () => {
  const accepted = await openForm({
    title: 'Copiar tokens vivos',
    description:
      'Copiará al mapa actual solo los tokens no-jugador vivos del escenario anterior, conservando vida, iniciativa, visibilidad, imagen y posición aproximada.',
    submitText: 'Copiar',
    fields: [],
  });
  if (accepted) command('scenario.copy_alive_previous');
};
$('#delete-scenario').onclick = async () => {
  if (!state.data?.scenario) return;
  const accepted = await openForm({
    title: 'Eliminar Mapa',
    description: `${state.data.scenario.name} se ocultará para DM, jugadores e invitados. No se borrará de la base de datos y solo podrá recuperarse desde la DB.`,
    submitText: 'Eliminar Mapa',
    danger: true,
    fields: [],
  });
  if (!accepted) return;
  command('scenario.hide');
};
let uploadTarget = null;
$('#upload-background').onclick = () => {
  uploadTarget = 'background';
  $('#image-file').click();
};
$('#upload-avatar').onclick = () => {
  if (!state.selectedCharacter) return toast('Selecciona un personaje');
  uploadTarget = 'avatar';
  $('#image-file').click();
};
$('#image-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    toast('La imagen supera el límite de 15 MB');
    e.target.value = '';
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Usa una imagen JPEG, PNG o WebP');
    e.target.value = '';
    return;
  }
  try {
    toast('Subiendo imagen…');
    const fd = new FormData();
    fd.append('image', file);
    const asset = await api('/assets', { method: 'POST', body: fd });
    if (uploadTarget === 'background')
      await api(`/scenarios/${state.scenarioId}/background`, {
        method: 'POST',
        body: JSON.stringify({ assetId: asset.id }),
      });
    else if (uploadTarget === 'avatar')
      await api(`/characters/${state.selectedCharacter}/avatar`, {
        method: 'POST',
        body: JSON.stringify({ assetId: asset.id }),
      });
    else if (uploadTarget?.bulkItems)
      command('tokens.bulk_update', { items: uploadTarget.bulkItems, image_asset_id: asset.id });
    else if (uploadTarget?.bulkObjectIds)
      command('objects.bulk_update', {
        objectIds: uploadTarget.bulkObjectIds,
        image_asset_id: asset.id,
      });
    else if (uploadTarget?.kind)
      command('token.update', {
        kind: uploadTarget.kind,
        id: +uploadTarget.id,
        image_asset_id: asset.id,
      });
    state.images.clear();
    await loadBootstrap();
    subscribe();
    toast('Imagen actualizada');
  } catch (x) {
    toast(x.message);
  } finally {
    e.target.value = '';
  }
};
if ($('#player-chat-open'))
  $('#player-chat-open').onclick = async () => {
    await loadChatThreads();
    const t = state.chatThreads[0];
    if (t) openChat(+t.id, 'DM');
  };
$('#encounter-prepare').onclick = () => command('encounter.prepare');
$('#encounter-start').onclick = () => handleEncounterStart();
$('#encounter-log').onclick = () => downloadEncounterLog();
$('#encounter-stop').onclick = () => command('encounter.stop');
$('#restart-round').onclick = () => command('encounter.restart_round');
$('#turn-rollback').onclick = () => command('turn.rollback');
$('#turn-next').onclick = () => command('turn.next');
$('#order-ties').onclick = async () => {
  const ps = state.data.participants;
  if (!ps.length) return toast('No hay participantes');
  const values = await openForm({
    title: 'Ordenar iniciativas empatadas',
    description: 'Asigna números menores a quienes deben actuar primero.',
    submitText: 'Aplicar orden',
    fields: ps.map((p, index) => ({
      name: `order_${p.id}`,
      label: `${participantName(p)} · iniciativa ${p.initiative ?? 'sin asignar'}`,
      type: 'number',
      value: index + 1,
      min: 1,
      required: true,
    })),
  });
  if (!values) return;
  const ids = [...ps]
    .sort((a, b) => +values[`order_${a.id}`] - +values[`order_${b.id}`])
    .map((p) => +p.id);
  command('initiative.reorder_tie', { participantIds: ids });
};

// Canvas rendering and map coordinates.
const canvas = $('#map'),
  ctx = canvas.getContext('2d');
function resize() {
  const r = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.user?.role === 'GUEST' && state.followCamera) {
    const z = Math.min(3, Math.max(0.25, +state.followCamera.zoom || 1));
    state.camera.z = z;
    state.camera.x = r.width / 2 - (+state.followCamera.centerX || 0) * cellSize * z;
    state.camera.y = r.height / 2 - (+state.followCamera.centerY || 0) * cellSize * z;
  }
  fitMapFocusForPlayers();
  draw();
}
function fitMapFocusForPlayers() {
  const f = state.data?.mapFocus;
  if (!f || state.user?.role === 'DM') return;
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const z = Math.min(
    r.width / (+f.width_cells * cellSize),
    r.height / (+f.height_cells * cellSize),
  );
  state.camera.z = Math.min(3, Math.max(0.25, z));
  state.camera.x =
    (r.width - +f.width_cells * cellSize * state.camera.z) / 2 - +f.x * cellSize * state.camera.z;
  state.camera.y =
    (r.height - +f.height_cells * cellSize * state.camera.z) / 2 - +f.y * cellSize * state.camera.z;
  $('#zoom-label').textContent = Math.round(state.camera.z * 100) + '%';
}
new ResizeObserver(resize).observe($('#map-wrap'));
const cellSize = 64;
function worldToScreen(x, y) {
  return {
    x: state.camera.x + x * cellSize * state.camera.z,
    y: state.camera.y + y * cellSize * state.camera.z,
  };
}
function screenToCell(x, y) {
  return {
    x: Math.floor((x - state.camera.x) / (cellSize * state.camera.z)),
    y: Math.floor((y - state.camera.y) / (cellSize * state.camera.z)),
  };
}
function screenToWorld(x, y) {
  return {
    x: (x - state.camera.x) / (cellSize * state.camera.z),
    y: (y - state.camera.y) / (cellSize * state.camera.z),
  };
}
function validCell(c) {
  const s = state.data?.scenario;
  return s && c.x >= 0 && c.y >= 0 && c.x < +s.width && c.y < +s.height;
}
function draw() {
  if (!state.data || !canvas.width) return;
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  const s = state.data.scenario,
    z = state.camera.z,
    cs = cellSize * z,
    origin = worldToScreen(0, 0);
  if (s.background_asset_id) {
    const img = image(+s.background_asset_id);
    if (img.complete) ctx.drawImage(img, origin.x, origin.y, +s.width * cs, +s.height * cs);
  } else {
    ctx.fillStyle = '#201b16';
    ctx.fillRect(origin.x, origin.y, +s.width * cs, +s.height * cs);
  }
  ctx.fillStyle = '#51302c99';
  state.data.blocked.forEach((c) => {
    const p = worldToScreen(+c.x, +c.y);
    ctx.fillRect(p.x, p.y, cs, cs);
  });
  if (state.mode === 'path') drawAdjacentCells(cs);
  ctx.strokeStyle = '#77665088';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= +s.width; x++) {
    const p = worldToScreen(x, 0);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, origin.y + s.height * cs);
  }
  for (let y = 0; y <= +s.height; y++) {
    const p = worldToScreen(0, y);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(origin.x + s.width * cs, p.y);
  }
  ctx.stroke();
  if (state.data.mapFocus && state.user?.role === 'DM') drawMapFocusBorder(cs);
  if (state.objectDraft) drawObjectDraft(cs);
  if (state.selectionDraft) drawSelectionDraft(cs);
  state.path.forEach((c, i) => {
    const p = worldToScreen(c.x, c.y);
    ctx.fillStyle = '#58aee477';
    ctx.fillRect(p.x + 2, p.y + 2, cs - 4, cs - 4);
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(10, 14 * z)}px sans-serif`;
    ctx.fillText(String(i + 1), p.x + 5, p.y + 17 * z);
  });
  state.data.objects.forEach((object) => drawMapObject({ ...object, kind: 'OBJECT' }, cs));
  const groups = groupTokens();
  for (const [, tokens] of groups) drawGroup(tokens, cs);
  drawFreehand();
  drawVisibilityEffects(cs);
}
function fallbackDrawingColor(seed) {
  const palette = [
    '#ff4d4d',
    '#4da3ff',
    '#54d66a',
    '#ffd84d',
    '#c77dff',
    '#ff7bd5',
    '#48e0d4',
    '#ff9f43',
  ];
  return palette[Math.abs(+seed || 0) % palette.length];
}
function drawingColorForToken(t) {
  return t?.drawing_color || fallbackDrawingColor(t?.user_id || t?.character_id || state.user?.id);
}
function currentDrawingColor() {
  if (state.user?.role === 'PLAYER') {
    const own = controlledPlayer();
    if (own?.drawing_color) return own.drawing_color;
    const ch =
      state.bootstrap?.characters?.find((c) => +c.id === +state.selectedCharacter) ||
      state.bootstrap?.characters?.[0];
    if (ch?.drawing_color) return ch.drawing_color;
  }
  return fallbackDrawingColor(state.user?.id);
}
function drawFreehand() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of state.drawings) {
    if (!s.points || s.points.length < 2) continue;
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = s.color || fallbackDrawingColor(s.userId);
    ctx.lineWidth = Math.max(1, +s.size || 6) * state.camera.z;
    ctx.beginPath();
    s.points.forEach((pt, i) => {
      const p = worldToScreen(+pt.x, +pt.y);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}
function objectDraftArea() {
  if (!state.objectDraft) return null;
  const a = state.objectDraft.start,
    b = state.objectDraft.current;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    widthCells: Math.abs(a.x - b.x) + 1,
    heightCells: Math.abs(a.y - b.y) + 1,
  };
}
function drawMapFocusBorder(cs) {
  const f = state.data.mapFocus,
    p = worldToScreen(+f.x, +f.y);
  ctx.save();
  ctx.strokeStyle = '#fff36b';
  ctx.lineWidth = Math.max(3, cs * 0.07);
  ctx.shadowColor = '#fff36b';
  ctx.shadowBlur = 18;
  ctx.strokeRect(p.x, p.y, +f.width_cells * cs, +f.height_cells * cs);
  ctx.restore();
}
function drawObjectDraft(cs) {
  const area = objectDraftArea();
  if (!area) return;
  const p = worldToScreen(area.x, area.y);
  ctx.save();
  ctx.fillStyle = '#d7aa5244';
  ctx.strokeStyle = '#ffd782';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.fillRect(p.x, p.y, area.widthCells * cs, area.heightCells * cs);
  ctx.strokeRect(p.x + 1, p.y + 1, area.widthCells * cs - 2, area.heightCells * cs - 2);
  ctx.setLineDash([]);
  ctx.fillStyle = '#17130fdd';
  ctx.fillRect(p.x + 6, p.y + 6, Math.max(62, 72 * state.camera.z), 24);
  ctx.fillStyle = '#fff1c9';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`${area.widthCells} × ${area.heightCells}`, p.x + 12, p.y + 23);
  ctx.restore();
}
function selectionDraftArea() {
  if (!state.selectionDraft) return null;
  const a = state.selectionDraft.start,
    b = state.selectionDraft.current;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    widthCells: Math.abs(a.x - b.x) + 1,
    heightCells: Math.abs(a.y - b.y) + 1,
  };
}
function drawSelectionDraft(cs) {
  const area = selectionDraftArea();
  if (!area) return;
  const p = worldToScreen(area.x, area.y);
  ctx.save();
  ctx.fillStyle = '#66aaff28';
  ctx.strokeStyle = '#8bc5ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.fillRect(p.x, p.y, area.widthCells * cs, area.heightCells * cs);
  ctx.strokeRect(p.x + 1, p.y + 1, area.widthCells * cs - 2, area.heightCells * cs - 2);
  ctx.restore();
}
function drawMapObject(t, cs, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const selected = state.selectedObjects.has(+t.id),
    widthCells = Math.max(1, +t.width_cells || 1),
    heightCells = Math.max(1, +t.height_cells || 1),
    visualWidth = Math.max(0.25, widthCells - 0.75),
    visualHeight = Math.max(0.25, heightCells - 0.75),
    p = worldToScreen(+t.x + 0.375, +t.y + 0.375),
    width = visualWidth * cs,
    height = visualHeight * cs,
    img = t.image_asset_id ? image(+t.image_asset_id) : null;
  ctx.fillStyle = '#b88d52';
  ctx.fillRect(p.x, p.y, width, height);
  if (img?.complete && img.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, width, height);
    ctx.clip();
    ctx.drawImage(img, p.x, p.y, width, height);
    ctx.restore();
  }
  ctx.strokeStyle = selected ? '#fff19b' : '#e0b66f';
  ctx.lineWidth = selected ? Math.max(3, cs * 0.06) : Math.max(1, cs * 0.025);
  ctx.strokeRect(p.x, p.y, width, height);
  ctx.restore();
}
function groupTokens() {
  const m = new Map(),
    push = (t) => {
      const k = `${Math.floor(t.renderX ?? t.x)},${Math.floor(t.renderY ?? t.y)}`;
      (m.get(k) || m.set(k, []).get(k)).push(t);
    };
  state.data.npcs.forEach((x) => push({ ...x, kind: 'NPC' }));
  state.data.players
    .filter((x) => +x.placed || state.user.role === 'DM')
    .forEach((x) => {
      const pos = animatedPos(x);
      push({ ...x, kind: 'PLAYER', renderX: pos.x, renderY: pos.y });
    });
  return m;
}
function drawGroup(ts, cs) {
  const base = worldToScreen(+(ts[0].renderX ?? ts[0].x), +(ts[0].renderY ?? ts[0].y)),
    many = ts.length >= 4,
    shown = many ? [ts[0]] : ts;
  shown.forEach((t, i) => {
    const cols = ts.length > 1 ? 2 : 1,
      row = Math.floor(i / cols),
      col = i % cols,
      size =
        (t.kind === 'OBJECT' ? 0.25 : t.kind === 'NPC' ? 0.98 : 0.48) *
        cs *
        (ts.length > 1 ? 0.72 : 1),
      cx = base.x + cs * (ts.length === 1 ? 0.5 : 0.28 + 0.44 * col),
      cy = base.y + cs * (ts.length === 1 ? 0.5 : 0.28 + 0.44 * row);
    const current = isCurrent(t),
      selected =
        (t.kind === 'NPC' && state.selectedNpcs.has(+t.id)) ||
        (t.kind === 'PLAYER' && state.selectedPlayers.has(+t.id)) ||
        (t.kind === 'PLAYER' &&
          state.user.role === 'PLAYER' &&
          +t.user_id === +state.user.id &&
          +t.character_id === +state.selectedCharacter);
    if (current) {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24c88';
      ctx.fill();
    }
    const img = t.image_asset_id ? image(+t.image_asset_id) : null;
    if (t.kind === 'OBJECT') {
      ctx.fillStyle = '#b88d52';
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      if (img?.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - size / 2, cy - size / 2, size, size);
        ctx.clip();
        ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
      }
      ctx.strokeStyle = '#e0b66f';
      ctx.lineWidth = Math.max(1, cs * 0.025);
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      if (t.kind !== 'NPC' || !t.image_asset_id) {
        const fill = t.kind === 'PLAYER' ? t.token_color || '#4c8cc7' : '#a04f4f';
        if (fill !== 'transparent') {
          ctx.fillStyle = fill;
          ctx.fill();
        }
      }
      ctx.save();
      ctx.clip();
      if (img?.complete && img.naturalWidth) {
        const imgScale = t.kind === 'NPC' ? 1.35 : 1,
          imgSize = size * imgScale;
        if (['NPC', 'PLAYER'].includes(t.kind) && +t.rotation_degrees) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((+t.rotation_degrees * Math.PI) / 180);
          ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
          ctx.restore();
        } else ctx.drawImage(img, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
      }
      ctx.restore();
      if (['NPC', 'PLAYER'].includes(t.kind)) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((+t.rotation_degrees || 0) * Math.PI) / 180);
        ctx.fillStyle = '#ffe2a5';
        ctx.strokeStyle = '#24180c';
        ctx.lineWidth = Math.max(1, cs * 0.02);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.43);
        ctx.lineTo(size * 0.12, size * 0.22);
        ctx.lineTo(-size * 0.12, size * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (selected) {
        ctx.strokeStyle = '#fff19b';
        ctx.lineWidth = Math.max(3, cs * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (+t.health <= 0 && state.user.role === 'DM') {
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - size / 3, cy - size / 3);
        ctx.lineTo(cx + size / 3, cy + size / 3);
        ctx.moveTo(cx + size / 3, cy - size / 3);
        ctx.lineTo(cx - size / 3, cy + size / 3);
        ctx.stroke();
      }
    }
  });
  if (many) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(base.x + cs * 0.72, base.y + cs * 0.28, cs * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(10, cs * 0.2)}px sans-serif`;
    ctx.fillText(String(ts.length), base.x + cs * 0.72, base.y + cs * 0.28);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
function drawVisibilityEffects(cs) {
  if (!['PLAYER', 'GUEST'].includes(state.user?.role) || !state.visibilityAnimations.size) return;
  const now = performance.now();
  let active = false;
  for (const [key, a] of state.visibilityAnimations) {
    const progress = Math.min(1, (now - a.start) / a.duration);
    if (progress >= 1) {
      state.visibilityAnimations.delete(key);
      continue;
    }
    active = true;
    if (a.type === 'disappear') {
      const alpha = 1 - progress;
      if (a.kind === 'OBJECT') drawMapObject({ ...a.entity, kind: 'OBJECT' }, cs, alpha);
      else drawNpcGhost(a.entity, cs, alpha);
    }
    drawVisibilityHighlight(a, cs, progress);
  }
  if (active) requestAnimationFrame(draw);
}
function drawNpcGhost(t, cs, alpha) {
  const p = worldToScreen(+t.x + 0.5, +t.y + 0.5),
    size = 0.98 * cs,
    img = t.image_asset_id ? image(+t.image_asset_id) : null;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  if (!t.image_asset_id) {
    ctx.fillStyle = '#a04f4f';
    ctx.fill();
  }
  ctx.clip();
  if (img?.complete && img.naturalWidth) {
    const imgSize = size * 1.35;
    if (+t.rotation_degrees) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((+t.rotation_degrees * Math.PI) / 180);
      ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    } else ctx.drawImage(img, p.x - imgSize / 2, p.y - imgSize / 2, imgSize, imgSize);
  }
  ctx.restore();
}
function drawVisibilityHighlight(a, cs, progress) {
  const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 8),
    alpha = (1 - progress) * (0.45 + 0.45 * pulse),
    expand = (a.type === 'appear' ? progress : 1 - progress) * cs * 0.22;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = a.type === 'appear' ? '#fff36b' : '#ff9b55';
  ctx.lineWidth = Math.max(3, cs * 0.07);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 18;
  if (a.kind === 'OBJECT') {
    const w = Math.max(1, +a.entity.width_cells || 1),
      h = Math.max(1, +a.entity.height_cells || 1),
      visualW = Math.max(0.25, w - 0.75) * cs,
      visualH = Math.max(0.25, h - 0.75) * cs,
      p = worldToScreen(+a.entity.x + 0.375, +a.entity.y + 0.375);
    ctx.strokeRect(p.x - expand, p.y - expand, visualW + expand * 2, visualH + expand * 2);
  } else {
    const p = worldToScreen(+a.entity.x + 0.5, +a.entity.y + 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.38 * cs + expand, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
function isAdjacent(a, b) {
  const dx = Math.abs(+a.x - +b.x),
    dy = Math.abs(+a.y - +b.y);
  return Math.max(dx, dy) === 1;
}
function blockedKey(c) {
  return `${+c.x},${+c.y}`;
}
function blockedSet() {
  return new Set((state.data?.blocked || []).map(blockedKey));
}
function movementRoute(from, to) {
  if (!validCell(to)) return null;
  const blocked = blockedSet(),
    targetKey = blockedKey(to);
  if (blocked.has(targetKey)) return null;
  const start = { x: +from.x, y: +from.y },
    startKey = blockedKey(start);
  if (startKey === targetKey) return [];
  const q = [start],
    prev = new Map([[startKey, null]]),
    dirs = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];
  let found = false;
  for (let head = 0; head < q.length && !found; head++) {
    const cur = q[head];
    dirs.sort(
      (a, b) =>
        Math.hypot(cur.x + a[0] - to.x, cur.y + a[1] - to.y) -
        Math.hypot(cur.x + b[0] - to.x, cur.y + b[1] - to.y),
    );
    for (const [dx, dy] of dirs) {
      const n = { x: cur.x + dx, y: cur.y + dy },
        k = blockedKey(n);
      if (!validCell(n) || blocked.has(k) || prev.has(k)) continue;
      if (
        dx &&
        dy &&
        (blocked.has(`${cur.x + dx},${cur.y}`) || blocked.has(`${cur.x},${cur.y + dy}`))
      )
        continue;
      prev.set(k, cur);
      if (k === targetKey) {
        found = true;
        break;
      }
      q.push(n);
    }
  }
  if (!found) return null;
  const path = [];
  let cur = to;
  while (blockedKey(cur) !== startKey) {
    path.push({ x: +cur.x, y: +cur.y });
    cur = prev.get(blockedKey(cur));
  }
  return path.reverse();
}
function drawAdjacentCells(cs) {
  const own = controlledPlayer();
  if (!own) return;
  ctx.fillStyle = '#56c87822';
  const blocked = blockedSet();
  for (let y = 0; y < +state.data.scenario.height; y++)
    for (let x = 0; x < +state.data.scenario.width; x++) {
      const c = { x, y };
      if (blocked.has(blockedKey(c))) continue;
      const p = worldToScreen(x, y);
      ctx.fillRect(p.x + 2, p.y + 2, cs - 4, cs - 4);
    }
}
function prepareAnimations(oldData, newData) {
  prepareVisibilityAnimations(oldData, newData);
  if (!oldData || +oldData.scenario?.id !== +newData.scenario?.id) return;
  for (const p of newData.players) {
    const old = oldData.players.find((x) => +x.id === +p.id);
    if (!old || (+old.x === +p.x && +old.y === +p.y)) continue;
    let path = [];
    try {
      path = typeof p.last_path === 'string' ? JSON.parse(p.last_path) : p.last_path || [];
    } catch {}
    if (path.length) {
      const last = path.at(-1);
      if (+last.x === +p.x && +last.y === +p.y)
        state.animations.set(+p.id, {
          points: [{ x: +old.x, y: +old.y }, ...path.map((c) => ({ x: +c.x, y: +c.y }))],
          start: performance.now(),
          step: 220,
        });
      else state.animations.delete(+p.id);
    }
  }
  if (state.animations.size) requestAnimationFrame(draw);
}
function prepareVisibilityAnimations(oldData, newData) {
  if (
    !['PLAYER', 'GUEST'].includes(state.user?.role) ||
    !oldData ||
    +oldData.scenario?.id !== +newData.scenario?.id
  )
    return;
  const now = performance.now();
  for (const [kind, oldList, newList] of [
    ['OBJECT', oldData.objects, newData.objects],
    ['NPC', oldData.npcs, newData.npcs],
  ]) {
    const oldIds = new Set(oldList.map((x) => +x.id)),
      newIds = new Set(newList.map((x) => +x.id));
    for (const entity of newList)
      if (!oldIds.has(+entity.id))
        state.visibilityAnimations.set(`${kind}:${entity.id}`, {
          kind,
          type: 'appear',
          entity,
          start: now,
          duration: 1500,
        });
    for (const entity of oldList)
      if (!newIds.has(+entity.id))
        state.visibilityAnimations.set(`${kind}:${entity.id}`, {
          kind,
          type: 'disappear',
          entity,
          start: now,
          duration: 1100,
        });
  }
  if (state.visibilityAnimations.size) requestAnimationFrame(draw);
}
function animatedPos(t) {
  const a = state.animations.get(+t.id);
  if (!a) return { x: +t.x, y: +t.y };
  const elapsed = performance.now() - a.start,
    index = Math.floor(elapsed / a.step),
    f = (elapsed % a.step) / a.step;
  if (index >= a.points.length - 1) {
    state.animations.delete(+t.id);
    return { x: +t.x, y: +t.y };
  }
  const from = a.points[index],
    to = a.points[index + 1];
  requestAnimationFrame(draw);
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
}
function isCurrent(t) {
  const e = state.data.encounter;
  if (!e?.current_participant_id) return false;
  const p = state.data.participants.find((x) => +x.id === +e.current_participant_id);
  return p && p.actor_type === t.kind && +p.actor_id === +t.id;
}
function image(id) {
  if (!state.images.has(id)) {
    const i = new Image();
    i.onload = draw;
    i.src = `/api/assets/${id}`;
    state.images.set(id, i);
  }
  return state.images.get(id);
}

// Canvas tools and pointer interaction.
$$('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
function setMode(m) {
  state.mode = m;
  state.objectDraft = null;
  state.selectionDraft = null;
  $$('[data-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mode === m));
  if (m !== 'path') state.path = [];
  if (m === 'object') toast('Arrastra sobre el mapa para definir el área del objeto');
  if (m === 'mapfocus') toast('Arrastra para elegir la parte del mapa que verán los jugadores');
  if (m === 'select')
    toast(
      'Arrastra o toca para alternar selección; lo seleccionado se mantiene mientras sigas en Seleccionar',
    );
  draw();
}
function setDrawingMode(on) {
  state.mode = on ? 'draw' : 'pan';
  state.drawStroke = null;
  $$('[data-main-tool]').forEach((x) => (x.hidden = on));
  $$('[data-draw-tool]').forEach(
    (x) => (x.hidden = !on || (+x.classList.contains('dm-only') && state.user.role !== 'DM')),
  );
  $$('[data-mode]').forEach((x) => x.classList.toggle('active', !on && x.dataset.mode === 'pan'));
  $('#draw-mode').classList.toggle('active', on);
  updateDrawButtons();
  if (!on) sendDraw({ op: 'clearUser' });
  draw();
}
function updateDrawButtons() {
  $('#draw-pen').classList.toggle('active', state.drawTool === 'pen');
  $('#draw-eraser').classList.toggle('active', state.drawTool === 'eraser');
  $('#draw-size-label').textContent = `Tamaño: ${state.drawSize}`;
}
$('#draw-mode').onclick = () => setDrawingMode(true);
$('#draw-exit').onclick = () => setDrawingMode(false);
$('#draw-pen').onclick = () => {
  state.drawTool = 'pen';
  updateDrawButtons();
};
$('#draw-eraser').onclick = () => {
  state.drawTool = 'eraser';
  updateDrawButtons();
};
$('#draw-size-down').onclick = () => {
  state.drawSize = Math.max(2, state.drawSize - 2);
  updateDrawButtons();
};
$('#draw-size-up').onclick = () => {
  state.drawSize = Math.min(40, state.drawSize + 2);
  updateDrawButtons();
};
$('#draw-clear-all').onclick = () => {
  if (confirm('¿Borrar todos los dibujos del mapa?')) sendDraw({ op: 'clearAll' });
};
$('#clear-map-focus').onclick = () => command('map.focus.clear');
$('#zoom-in').onclick = () => zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
$('#zoom-out').onclick = () => zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
function zoomAt(f, x, y) {
  if (state.user?.role === 'GUEST') return;
  const old = state.camera.z,
    n = Math.min(3, Math.max(0.25, old * f));
  state.camera.x = x - ((x - state.camera.x) * n) / old;
  state.camera.y = y - ((y - state.camera.y) * n) / old;
  state.camera.z = n;
  $('#zoom-label').textContent = Math.round(n * 100) + '%';
  draw();
  publishDmView();
}
function focusZoomAt(x, y) {
  if (state.user?.role === 'GUEST' || !state.data?.scenario?.active) return;
  const old = state.camera.z,
    target = old < 1.9 ? 2 : old < 2.9 ? 3 : 1,
    r = canvas.getBoundingClientRect(),
    wx = (x - state.camera.x) / (cellSize * old),
    wy = (y - state.camera.y) / (cellSize * old);
  state.camera.z = target;
  state.camera.x = r.width / 2 - wx * cellSize * target;
  state.camera.y = r.height / 2 - wy * cellSize * target;
  $('#zoom-label').textContent = Math.round(target * 100) + '%';
  draw();
  publishDmView();
}
function maybeDoubleTap(e, drag) {
  if (state.mode !== 'pan' || drag?.moved || drag?.multiTouch) return false;
  const now = performance.now(),
    last = state.lastTap,
    cur = { x: e.offsetX, y: e.offsetY, t: now };
  state.lastTap = cur;
  if (!last || now - last.t > 330 || Math.hypot(cur.x - last.x, cur.y - last.y) > 34) return false;
  state.lastTap = null;
  focusZoomAt(e.offsetX, e.offsetY);
  return true;
}
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
canvas.onpointerdown = (e) => {
  const forcePan = e.button === 1;
  if (forcePan) e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (state.pointers.size === 1) {
    state.drag = {
      x: e.offsetX,
      y: e.offsetY,
      cx: state.camera.x,
      cy: state.camera.y,
      moved: false,
      forcePan,
    };
    if (!forcePan && state.mode === 'draw') {
      startDrawStroke(e.offsetX, e.offsetY);
      draw();
    } else if (!forcePan && state.mode === 'object') {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.objectDraft = { start: cell, current: cell };
        draw();
      }
    } else if (
      !forcePan &&
      ['select', 'mapfocus'].includes(state.mode) &&
      state.user.role === 'DM'
    ) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft = { start: cell, current: cell };
        draw();
      }
    }
  }
  if (forcePan) canvas.classList.add('grabbing');
  if (!forcePan && ['block', 'unblock'].includes(state.mode)) paintAt(e.offsetX, e.offsetY);
};
canvas.addEventListener('auxclick', (e) => {
  if (e.button === 1) e.preventDefault();
});
canvas.onpointermove = (e) => {
  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (state.pointers.size === 2) {
    state.objectDraft = null;
    state.selectionDraft = null;
    if (state.drag) {
      state.drag.moved = true;
      state.drag.multiTouch = true;
    }
    const ps = [...state.pointers.values()];
    if (!state.pinch)
      state.pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), z: state.camera.z };
    else {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
        mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      zoomAt((state.pinch.z * d) / state.pinch.d / state.camera.z, mid.x, mid.y);
    }
    return;
  }
  if (state.drag) {
    const dx = e.offsetX - state.drag.x,
      dy = e.offsetY - state.drag.y;
    if (Math.hypot(dx, dy) > 5) state.drag.moved = true;
    const touchMapPan =
      e.pointerType === 'touch' && (['path', 'place'].includes(state.mode) || state.moveToken);
    if (state.drag.forcePan || state.mode === 'pan' || touchMapPan) {
      if (state.user.role !== 'GUEST') {
        state.camera.x = state.drag.cx + dx;
        state.camera.y = state.drag.cy + dy;
        draw();
        publishDmView();
      }
    } else if (state.mode === 'object' && state.objectDraft) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.objectDraft.current = cell;
        draw();
      }
    } else if (['select', 'mapfocus'].includes(state.mode) && state.selectionDraft) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft.current = cell;
        draw();
      }
    } else if (state.mode === 'draw' && state.drawStroke) addDrawPoint(e.offsetX, e.offsetY);
    else if (['block', 'unblock'].includes(state.mode)) paintAt(e.offsetX, e.offsetY);
  }
};
function isTouchTap(e, drag) {
  return (
    e.pointerType === 'touch' &&
    !drag?.multiTouch &&
    Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) <= 24
  );
}
canvas.onpointerup = (e) => {
  const was = state.drag,
    draft = state.objectDraft,
    selection = state.selectionDraft,
    touchTap = was && isTouchTap(e, was) && ['place', 'path', 'npc'].includes(state.mode);
  state.pointers.delete(e.pointerId);
  if (state.pointers.size < 2) state.pinch = null;
  if (was?.multiTouch) {
    state.objectDraft = null;
    state.selectionDraft = null;
    state.drag = null;
    draw();
    return;
  }
  if (was?.forcePan) {
    canvas.classList.remove('grabbing');
  } else if (e.type === 'pointercancel') {
    state.objectDraft = null;
    state.selectionDraft = null;
    draw();
  } else if (state.mode === 'draw' && state.drawStroke) {
    finishDrawStroke();
  } else if (draft && state.mode === 'object') {
    const area = objectDraftArea();
    state.objectDraft = null;
    draw();
    if (area) void createObjectArea(area);
  } else if (selection && ['select', 'mapfocus'].includes(state.mode)) {
    const area = selectionDraftArea();
    state.selectionDraft = null;
    if (state.mode === 'mapfocus') {
      if (was?.moved && area)
        command('map.focus', {
          x: area.x,
          y: area.y,
          widthCells: area.widthCells,
          heightCells: area.heightCells,
        });
      draw();
    } else if (was?.moved && area) selectEntitiesInArea(area);
    else {
      draw();
      tap(e.offsetX, e.offsetY, { additive: e.shiftKey || e.ctrlKey || e.metaKey });
    }
  } else if (['block', 'unblock'].includes(state.mode) && state.paint.size) {
    command('map.cells.paint', {
      cells: [...state.paint.values()],
      blocked: state.mode === 'block',
    });
    state.paint.clear();
  } else if (was && (!was.moved || touchTap)) {
    if (maybeDoubleTap(e, was)) {
      if (!state.pointers.size) state.drag = null;
      return;
    }
    tap(e.offsetX, e.offsetY, { additive: e.shiftKey || e.ctrlKey || e.metaKey });
  }
  if (!state.pointers.size) state.drag = null;
};
canvas.onpointercancel = canvas.onpointerup;
function sendDraw(payload) {
  const local = {
    ...payload,
    userId: +state.user.id,
    userName: state.user.name || '',
    role: state.user.role,
  };
  if (['clearUser', 'clearAll'].includes(payload.op)) handleDrawEvent(local);
  if (state.ws?.readyState === 1)
    state.ws.send(JSON.stringify({ action: 'draw', scenarioId: state.scenarioId, payload }));
}
function startDrawStroke(x, y) {
  const p = screenToWorld(x, y);
  state.drawStroke = {
    id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
    userId: +state.user.id,
    userName: state.user.name || '',
    color: currentDrawingColor(),
    size: state.drawSize,
    points: [p],
  };
  if (state.drawTool === 'eraser') eraseAt(p);
  else state.drawings.push(state.drawStroke);
}
function addDrawPoint(x, y) {
  const p = screenToWorld(x, y),
    s = state.drawStroke,
    last = s.points.at(-1);
  if (Math.hypot(p.x - last.x, p.y - last.y) < DRAW_POINT_MIN_DISTANCE) return;
  s.points.push(p);
  if (state.drawTool === 'eraser') eraseAt(p);
  draw();
}
function finishDrawStroke() {
  const s = state.drawStroke;
  state.drawStroke = null;
  if (!s) return;
  if (state.drawTool === 'pen' && s.points.length > 1) sendDraw({ op: 'stroke', stroke: s });
  else if (state.drawTool === 'eraser')
    sendDraw({
      op: 'erase',
      points: s.points,
      radius: (state.drawSize / (cellSize * state.camera.z)) * 1.8,
    });
}
function eraseAt(p) {
  const size = (state.drawSize / (cellSize * state.camera.z)) * 1.8,
    dm = state.user.role === 'DM';
  state.drawings = state.drawings.filter((s) => {
    if (!dm && +s.userId !== +state.user.id) return true;
    return !s.points.some((pt) => Math.hypot(+pt.x - p.x, +pt.y - p.y) <= size);
  });
  draw();
}
function handleDrawEvent(e) {
  if (!e) return;
  if (e.op === 'stroke') state.drawings.push(e.stroke);
  else if (e.op === 'clearUser')
    state.drawings = state.drawings.filter((s) => +s.userId !== +e.userId);
  else if (e.op === 'clearAll') state.drawings = [];
  else if (e.op === 'erase') {
    const dm = e.role === 'DM',
      size = +e.radius || 0.1;
    for (const p of e.points || [])
      state.drawings = state.drawings.filter((s) => {
        if (!dm && +s.userId !== +e.userId) return true;
        return !s.points.some((pt) => Math.hypot(+pt.x - p.x, +pt.y - p.y) <= size);
      });
  }
  draw();
}
function paintAt(x, y) {
  const c = screenToCell(x, y);
  if (validCell(c)) {
    state.paint.set(`${c.x},${c.y}`, c);
    const exists = state.data.blocked.some((b) => +b.x === c.x && +b.y === c.y);
    if (state.mode === 'block' && !exists) state.data.blocked.push(c);
    if (state.mode === 'unblock' && exists)
      state.data.blocked = state.data.blocked.filter((b) => +b.x !== c.x || +b.y !== c.y);
    draw();
  }
}
function tap(x, y, options = {}) {
  const c = screenToCell(x, y);
  if (!validCell(c)) return;
  if (state.moveToken) {
    const t = state.moveToken;
    state.moveToken = null;
    command('token.move_dm', { kind: t.kind, id: +t.id, ...c });
    return;
  }
  if (state.cloneSource && state.user.role === 'DM' && state.mode === 'select') {
    command('token.clone', { kind: state.cloneSource.kind, id: +state.cloneSource.id, ...c });
    return;
  }
  if (state.encounterSelecting && state.user.role === 'DM') {
    const tokens = tokensAtCell(c).filter(
      (t) =>
        (t.kind === 'PLAYER' && +t.placed) || (t.kind === 'NPC' && +t.visible && +t.health > 0),
    );
    if (tokens.length) {
      const t = tokens[0],
        set = t.kind === 'PLAYER' ? state.selectedPlayers : state.selectedNpcs,
        id = +t.id;
      set.has(id) ? set.delete(id) : set.add(id);
      draw();
      toast(`${set.has(id) ? 'Incluido' : 'Excluido'}: ${t.name || t.user_name}`);
    }
    return;
  }
  if (state.mode === 'path') {
    const own = controlledPlayer();
    if (!own) {
      toast('Selecciona y coloca en el mapa el personaje que quieres mover');
      return;
    }
    const last = state.path.at(-1),
      prev = state.path.at(-2);
    if (last && last.x === c.x && last.y === c.y) {
      state.path.pop();
      draw();
      return;
    }
    if (prev && prev.x === c.x && prev.y === c.y) {
      state.path.pop();
      draw();
      return;
    }
    if (!prev && last && +own.x === c.x && +own.y === c.y) {
      state.path.pop();
      draw();
      return;
    }
    const existing = state.path.findIndex((p) => p.x === c.x && p.y === c.y);
    if (existing >= 0) {
      state.path = state.path.slice(0, existing + 1);
      draw();
      return;
    }
    const anchor = last || { x: +own.x, y: +own.y };
    const route = movementRoute(anchor, c);
    if (!route) {
      toast('No hay ruta transitable hasta esa casilla');
      return;
    }
    state.path.push(...route);
    draw();
    return;
  }
  if (state.mode === 'place') {
    void placeCharacterAt(c);
    return;
  }
  if (state.user.role !== 'DM') {
    const ownTokens = tokensAtCell(c).filter(
      (t) => t.kind === 'PLAYER' && +t.user_id === +state.user.id,
    );
    if (ownTokens.length === 1) selectMapEntity(ownTokens[0]);
    else if (ownTokens.length > 1) showCellMenu(ownTokens, x, y);
    return;
  }
  if (state.mode === 'npc') {
    void createNpcAt(c);
    return;
  }
  if (state.mode === 'object') return;
  const tokens = tokensAtCell(c),
    stickySelect = state.user.role === 'DM' && state.mode === 'select';
  if (tokens.length === 1) selectMapEntity(tokens[0], stickySelect || !!options.additive);
  else if (tokens.length > 1) showCellMenu(tokens, x, y, stickySelect || !!options.additive);
  else if (state.user.role === 'DM' && state.mode === 'select') {
    if (selectionCount()) {
      clearEntitySelection();
      return;
    }
    void editCellNote(c);
  }
}
// Token creation, selection, and inspection.
async function placeCharacterAt(c) {
  if (!state.selectedCharacter) {
    toast('Selecciona un personaje');
    return;
  }
  if (state.data?.players?.some((p) => +p.character_id === +state.selectedCharacter && +p.placed)) {
    toast('Ya colocaste este personaje en este escenario. Pide al DM que lo mueva.');
    setMode('pan');
    return;
  }
  const character = state.bootstrap.characters.find((x) => +x.id === +state.selectedCharacter);
  let tokenColor = character?.token_color || '';
  if (!tokenColor) {
    tokenColor = await openPlayerTokenColorPopup();
    if (!tokenColor) return;
  }
  command('player.place', { characterId: state.selectedCharacter, tokenColor, ...c });
  setMode('pan');
}
function openPlayerTokenColorPopup() {
  return new Promise((resolve) => {
    if (dialog.open) dialog.close();
    $('#dialog-back').hidden = true;
    $('#dialog-title').textContent = 'Color del token';
    $('#dialog-description').textContent = 'Elige el color de fondo para tu token en el mapa.';
    $('#dialog-description').hidden = false;
    $('#dialog-error').textContent = '';
    $('#dialog-submit').textContent = 'Colocar';
    $('#dialog-submit').className = 'primary';
    const colors = [
      ['transparent', 'Transparente'],
      ['#4c8cc7', 'Azul'],
      ['#c74c4c', 'Rojo'],
      ['#5d9c63', 'Verde'],
      ['#d7aa52', 'Dorado'],
      ['#8e5ad7', 'Morado'],
      ['#d75aa5', 'Rosa'],
      ['#52b8b8', 'Turquesa'],
      ['#f4ead7', 'Blanco'],
      ['#30271e', 'Oscuro'],
    ];
    const wrap = $('#dialog-fields');
    wrap.innerHTML = `<div class="token-color-palette">${colors.map(([v, n], i) => `<label class="token-color-choice" title="${esc(n)}"><input type="radio" name="tokenColor" value="${esc(v)}" ${i === 1 ? 'checked' : ''}><span style="--token-color:${esc(v)}" class="${v === 'transparent' ? 'transparent' : ''}"></span><small>${esc(n)}</small></label>`).join('')}</div>`;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      releaseDialog();
      dialog.close();
      installDefaultDialogHandlers();
      resolve(v);
    };
    dialog.showModal();
    $('#dialog-cancel').onclick = () => finish(null);
    $('#dialog-close').onclick = () => finish(null);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    dialogForm.onsubmit = (e) => {
      e.preventDefault();
      finish(dialogForm.elements.tokenColor.value);
    };
  });
}
async function createNpcAt(c) {
  const values = await openNpcCreatePopup(c);
  if (!values) return;
  const payload = {
    ...c,
    name: values.name,
    health: +values.health,
    armorClass: values.armorClass === '' ? null : +values.armorClass,
    initiative: values.initiative === '' ? null : +values.initiative,
    visible: values.visible,
    notes: values.notes,
    codexCreatureId: values.codexCreatureId || null,
  };
  if (values.rotationDegrees !== undefined) payload.rotationDegrees = +values.rotationDegrees || 0;
  command('npc.create', payload);
}
function openNpcCreatePopup(c) {
  return new Promise((resolve) => {
    if (dialog.open) dialog.close();
    $('#dialog-back').hidden = true;
    let selectedCreature = null,
      timer = null,
      done = false;
    $('#dialog-title').textContent = 'Agregar personaje del DM';
    $('#dialog-description').textContent =
      `Casilla ${c.x + 1}, ${c.y + 1}. Puedes buscar una criatura del Codex para usar su nombre y token.`;
    $('#dialog-description').hidden = false;
    $('#dialog-error').textContent = '';
    $('#dialog-submit').textContent = 'Agregar NPC';
    $('#dialog-submit').className = 'primary';
    const wrap = $('#dialog-fields');
    wrap.innerHTML =
      '<label><span>Buscar criatura del Codex</span><div class="inline-search"><input id="npc-creature-search" autocomplete="off" placeholder="Buscar por nombre, tipo, tag…"><button id="npc-creature-clear" type="button">Limpiar</button></div><small id="npc-creature-help">Opcional. Busca con “contiene”; incluye criaturas custom.</small></label><div id="npc-creature-results" class="codex-search-results"></div><p id="npc-creature-picked" class="muted"></p><label><span>Nombre</span><input name="name" value="NPC" required></label><label><span>Puntos de vida</span><input name="health" type="number" value="10" required></label><label><span>Clase de armadura</span><input name="armorClass" type="number" placeholder="Sin CA"></label><label><span>Rotación del token</span><div class="inline-search"><button id="npc-rotate-left" type="button">↶</button><input name="rotationDegrees" type="number" value="0" readonly><button id="npc-rotate-right" type="button">↷</button></div><small>Gira en pasos de 45°; inicia mirando a 0°.</small></label><label><span>Iniciativa (opcional)</span><input name="initiative" type="number" placeholder="Sin iniciativa"></label><label class="check-field"><input name="visible" type="checkbox" checked><span>Visible para los jugadores</span></label><label><span>Notas privadas</span><textarea name="notes" rows="6" placeholder="Información que solo verá el DM"></textarea></label>';
    const finish = (v) => {
      if (done) return;
      done = true;
      releaseDialog();
      dialog.close();
      installDefaultDialogHandlers();
      resolve(v);
    };
    const search = async () => {
      const q = $('#npc-creature-search').value.trim(),
        res = $('#npc-creature-results'),
        help = $('#npc-creature-help');
      res.innerHTML = '';
      if (q.length < 2) {
        help.textContent = 'Escribe al menos 2 caracteres para buscar.';
        return;
      }
      help.textContent = 'Buscando…';
      try {
        const data = await api(
          `/codex/category-records?category=creatures&q=${encodeURIComponent(q)}&page=1&limit=15`,
        );
        help.textContent = `${+data.total} resultado${+data.total === 1 ? '' : 's'} encontrado${+data.total === 1 ? '' : 's'}.`;
        for (const r of data.records || []) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'codex-row';
          const meta = [r.type_name, r.subtype_name, r.source_name]
            .filter(Boolean)
            .map(esc)
            .join(' · ');
          b.innerHTML = `<div><strong>${esc(r.name)}</strong><br><small>${meta}</small>${r.short_description ? `<p class="muted">${esc(r.short_description)}</p>` : ''}</div><span class="codex-count">Elegir</span>`;
          b.onclick = () => {
            selectedCreature = r;
            dialogForm.elements.name.value = r.name;
            const n = (v) => {
              const m = String(v || '').match(/\d+/);
              return m ? m[0] : '';
            };
            const hp = n(r.hit_points_text),
              ac = n(r.armor_class_text);
            if (hp) dialogForm.elements.health.value = hp;
            if (ac) dialogForm.elements.armorClass.value = ac;
            $('#npc-creature-picked').textContent =
              `Seleccionado: ${r.name}. PV${hp ? `: ${hp}` : ''}${ac ? ` · CA: ${ac}` : ''}. El NPC usará el token/retrato de esta criatura si existe.`;
            res.innerHTML = '';
          };
          res.append(b);
        }
        if (!data.records?.length) res.innerHTML = '<p class="muted">Sin resultados.</p>';
      } catch (e) {
        help.textContent = 'Error de búsqueda';
        res.innerHTML = `<p class="error">${esc(e.message)}</p>`;
      }
    };
    $('#npc-creature-search').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(search, 250);
    };
    $('#npc-creature-search').onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        search();
      }
    };
    $('#npc-creature-clear').onclick = () => {
      selectedCreature = null;
      $('#npc-creature-search').value = '';
      $('#npc-creature-results').innerHTML = '';
      $('#npc-creature-picked').textContent = '';
      $('#npc-creature-help').textContent =
        'Opcional. Busca con “contiene”; incluye criaturas custom.';
    };
    let rotation = 0,
      rotationTouched = false;
    const setRotation = (v) => {
      rotationTouched = true;
      rotation = ((v % 360) + 360) % 360;
      dialogForm.elements.rotationDegrees.value = rotation;
    };
    $('#npc-rotate-left').onclick = () => setRotation(rotation - 45);
    $('#npc-rotate-right').onclick = () => setRotation(rotation + 45);
    dialog.showModal();
    requestAnimationFrame(() => $('#npc-creature-search').focus());
    $('#dialog-cancel').onclick = () => finish(null);
    $('#dialog-close').onclick = () => finish(null);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    dialogForm.onsubmit = (e) => {
      e.preventDefault();
      if (!dialogForm.reportValidity()) return;
      const values = Object.fromEntries(new FormData(dialogForm));
      values.visible = dialogForm.elements.visible.checked;
      values.codexCreatureId = selectedCreature ? +selectedCreature.id : null;
      if (!rotationTouched) delete values.rotationDegrees;
      finish(values);
    };
  });
}
async function createObjectArea(area) {
  const values = await openObjectCreatePopup(area);
  if (!values) return;
  let imageAssetId = null;
  if (values.imageFile) {
    try {
      toast('Subiendo imagen…');
      const fd = new FormData();
      fd.append('image', values.imageFile);
      const asset = await api('/assets', { method: 'POST', body: fd });
      imageAssetId = asset.id;
    } catch (e) {
      toast(e.message);
      return;
    }
  }
  command('object.create', {
    x: area.x,
    y: area.y,
    widthCells: area.widthCells,
    heightCells: area.heightCells,
    name: values.name,
    visible: values.visible,
    notes: values.notes,
    imageAssetId,
  });
}
function openObjectCreatePopup(area) {
  return new Promise((resolve) => {
    if (dialog.open) dialog.close();
    $('#dialog-back').hidden = true;
    let imageFile = null,
      done = false;
    const visualWidth = Math.max(0.25, area.widthCells - 0.75),
      visualHeight = Math.max(0.25, area.heightCells - 0.75);
    $('#dialog-title').textContent = 'Agregar objeto';
    $('#dialog-description').textContent =
      `Área dibujada: ${area.widthCells} × ${area.heightCells} casillas. Tamaño visual: ${visualWidth} × ${visualHeight} casillas.`;
    $('#dialog-description').hidden = false;
    $('#dialog-error').textContent = '';
    $('#dialog-submit').textContent = 'Agregar objeto';
    $('#dialog-submit').className = 'primary';
    const wrap = $('#dialog-fields');
    wrap.innerHTML =
      '<label><span>Nombre</span><input name="name" value="Objeto" required></label><label><span>Imagen del objeto</span><div class="inline-search"><button id="object-image-pick" type="button">Subir imagen…</button><button id="object-image-clear" type="button" hidden>Quitar</button></div><small id="object-image-help">Opcional. Esta imagen se usará como token del objeto en el mapa.</small></label><label class="check-field"><input name="visible" type="checkbox" checked><span>Visible para los jugadores</span></label><label><span>Notas privadas</span><textarea name="notes" rows="6" placeholder="Descripción, contenido o información para el DM"></textarea></label>';
    const finish = (v) => {
      if (done) return;
      done = true;
      releaseDialog();
      dialog.close();
      installDefaultDialogHandlers();
      resolve(v);
    };
    $('#object-image-pick').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        if (f.size > 15 * 1024 * 1024) {
          toast('La imagen supera el límite de 15 MB');
          return;
        }
        imageFile = f;
        $('#object-image-help').textContent = `Seleccionada: ${f.name}`;
        $('#object-image-clear').hidden = false;
      };
      input.click();
    };
    $('#object-image-clear').onclick = () => {
      imageFile = null;
      $('#object-image-help').textContent =
        'Opcional. Esta imagen se usará como token del objeto en el mapa.';
      $('#object-image-clear').hidden = true;
    };
    dialog.showModal();
    requestAnimationFrame(() => dialogForm.elements.name.focus());
    $('#dialog-cancel').onclick = () => finish(null);
    $('#dialog-close').onclick = () => finish(null);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    dialogForm.onsubmit = (e) => {
      e.preventDefault();
      if (!dialogForm.reportValidity()) return;
      const values = Object.fromEntries(new FormData(dialogForm));
      values.visible = dialogForm.elements.visible.checked;
      values.imageFile = imageFile;
      finish(values);
    };
  });
}
async function editCellNote(c) {
  const current = state.data.cellNotes.find((n) => +n.x === c.x && +n.y === c.y)?.notes || '';
  const values = await openForm({
    title: 'Nota de casilla',
    description: `Casilla ${c.x + 1}, ${c.y + 1}. Esta nota solo es visible para el DM.`,
    submitText: 'Guardar nota',
    fields: [
      {
        name: 'notes',
        label: 'Notas',
        type: 'textarea',
        rows: 8,
        value: current,
        placeholder: 'Escribe información sobre esta casilla…',
      },
    ],
  });
  if (values) command('cell.note', { ...c, notes: values.notes });
}
$('#apply-path').onclick = () => {
  const own = controlledPlayer();
  if (!own) return toast('Selecciona y coloca el personaje que quieres mover');
  if (!state.path.length) return toast('Selecciona un camino');
  command('movement.submit', { characterId: +own.character_id, path: state.path });
  state.path = [];
  draw();
};
$('#place-character').onclick = () => {
  if (!state.selectedCharacter) return toast('Selecciona un personaje en el menú');
  if (state.data?.players?.some((p) => +p.character_id === +state.selectedCharacter && +p.placed))
    return toast('Ya colocaste este personaje en este escenario. Pide al DM que lo mueva.');
  document.body.classList.remove('menu-open');
  setMode('place');
  toast('Toca una casilla para colocar el personaje');
};
$('#delay-turn').onclick = async () => {
  const options = state.data.participants.filter(
    (p) => +p.id !== +state.data.encounter?.current_participant_id,
  );
  if (!options.length) return toast('No hay objetivo disponible');
  const values = await openForm({
    title: 'Retrasar turno',
    description:
      'Tu turno se activará cuando el participante seleccionado termine, muera o salga del combate.',
    submitText: 'Retrasar turno',
    fields: [
      {
        name: 'target',
        label: 'Esperar al turno de',
        type: 'select',
        required: true,
        options: options.map((p) => ({
          value: p.id,
          label: `${participantName(p)} · iniciativa ${p.initiative ?? '—'}`,
        })),
      },
    ],
  });
  if (values) command('turn.delay', { targetParticipantId: +values.target });
};
function tokensAtCell(c) {
  const tokens = [];
  for (const o of state.data.objects) {
    const width = Math.max(1, +o.width_cells || 1),
      height = Math.max(1, +o.height_cells || 1);
    if (c.x >= +o.x && c.x < +o.x + width && c.y >= +o.y && c.y < +o.y + height)
      tokens.push({ ...o, kind: 'OBJECT' });
  }
  for (const n of state.data.npcs)
    if (+n.x === c.x && +n.y === c.y) tokens.push({ ...n, kind: 'NPC' });
  for (const p of state.data.players)
    if ((+p.placed || state.user.role === 'DM') && +p.x === c.x && +p.y === c.y)
      tokens.push({ ...p, kind: 'PLAYER' });
  return tokens;
}
function toggleSetItem(set, id) {
  set.has(id) ? set.delete(id) : set.add(id);
}
function selectEntitiesInArea(area) {
  if (state.encounterSelecting && state.user.role === 'DM') {
    for (const p of state.data.players)
      if (
        +p.placed &&
        +p.x >= area.x &&
        +p.x < area.x + area.widthCells &&
        +p.y >= area.y &&
        +p.y < area.y + area.heightCells
      )
        toggleSetItem(state.selectedPlayers, +p.id);
    for (const n of state.data.npcs)
      if (
        +n.visible &&
        +n.health > 0 &&
        +n.x >= area.x &&
        +n.x < area.x + area.widthCells &&
        +n.y >= area.y &&
        +n.y < area.y + area.heightCells
      )
        toggleSetItem(state.selectedNpcs, +n.id);
    draw();
    return;
  }
  for (const object of state.data.objects) {
    const x = +object.x,
      y = +object.y,
      w = Math.max(1, +object.width_cells || 1),
      h = Math.max(1, +object.height_cells || 1);
    if (
      x < area.x + area.widthCells &&
      x + w > area.x &&
      y < area.y + area.heightCells &&
      y + h > area.y
    )
      toggleSetItem(state.selectedObjects, +object.id);
  }
  for (const npc of state.data.npcs)
    if (
      +npc.x >= area.x &&
      +npc.x < area.x + area.widthCells &&
      +npc.y >= area.y &&
      +npc.y < area.y + area.heightCells
    )
      toggleSetItem(state.selectedNpcs, +npc.id);
  renderEntitySelection();
  draw();
}
function selectMapEntity(entity, additive = false) {
  if (
    state.user.role === 'PLAYER' &&
    entity.kind === 'PLAYER' &&
    +entity.user_id === +state.user.id
  ) {
    state.selectedCharacter = +entity.character_id;
    state.path = [];
    renderSidebar();
    toast(`Controlando a ${entity.name}`);
  }
  if (state.user.role === 'DM' && ['OBJECT', 'NPC'].includes(entity.kind)) {
    const id = +entity.id,
      set = entity.kind === 'OBJECT' ? state.selectedObjects : state.selectedNpcs;
    if (!additive) {
      state.selectedObjects.clear();
      state.selectedNpcs.clear();
      set.add(id);
    } else if (set.has(id)) set.delete(id);
    else set.add(id);
    renderEntitySelection();
    draw();
    return;
  }
  clearEntitySelection(false);
  inspect(entity);
}
function clearEntitySelection(resetInspector = true) {
  state.selectedObjects.clear();
  state.selectedNpcs.clear();
  state.selectedPlayers.clear();
  draw();
  if (resetInspector)
    $('#inspector').innerHTML =
      '<h2>Selección</h2><p class="muted">Toca un token para inspeccionarlo.</p>';
}
function selectionItems() {
  const items = [];
  state.selectedObjects = new Set(
    [...state.selectedObjects].filter((id) => state.data.objects.some((o) => +o.id === id)),
  );
  state.selectedNpcs = new Set(
    [...state.selectedNpcs].filter((id) => state.data.npcs.some((n) => +n.id === id)),
  );
  for (const id of state.selectedObjects) {
    const entity = state.data.objects.find((o) => +o.id === id);
    if (entity) items.push({ ...entity, kind: 'OBJECT' });
  }
  for (const id of state.selectedNpcs) {
    const entity = state.data.npcs.find((n) => +n.id === id);
    if (entity) items.push({ ...entity, kind: 'NPC' });
  }
  return items;
}
function selectionCount() {
  return state.selectedObjects.size + state.selectedNpcs.size;
}
function renderEntitySelection() {
  const items = selectionItems();
  if (!items.length) {
    clearEntitySelection();
    return;
  }
  if (items.length === 1) {
    inspect(items[0]);
    return;
  }
  const objectCount = items.filter((x) => x.kind === 'OBJECT').length,
    npcCount = items.filter((x) => x.kind === 'NPC').length,
    refs = items.map((x) => ({ kind: x.kind, id: +x.id })),
    healable = items.filter((x) => x.health !== undefined),
    i = $('#inspector'),
    summary = [
      objectCount && `${objectCount} objeto${objectCount === 1 ? '' : 's'}`,
      npcCount && `${npcCount} personaje${npcCount === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(' y ');
  i.innerHTML = `<h2>Selección múltiple</h2><div class="token-card"><strong>${summary}</strong><p class="muted">${items.map((x) => esc(x.name)).join(', ')}</p><div class="row">${healable.length ? '<button id="bulk-heal" class="ok-action">Curar</button>' : ''}<button id="bulk-show">Hacer visibles</button><button id="bulk-hide">Ocultar</button><button id="bulk-image">Imagen común…</button><button id="bulk-delete" class="danger-action">Eliminar</button><button id="bulk-clear">Limpiar selección</button></div></div>`;
  i.scrollTop = 0;
  if ($('#bulk-heal')) $('#bulk-heal').onclick = () => healTokens(healable);
  $('#bulk-show').onclick = () => command('tokens.bulk_update', { items: refs, visible: true });
  $('#bulk-hide').onclick = () => command('tokens.bulk_update', { items: refs, visible: false });
  $('#bulk-image').onclick = () => {
    uploadTarget = { bulkItems: refs };
    $('#image-file').click();
  };
  $('#bulk-delete').onclick = () => {
    if (!confirm(`¿Eliminar ${items.length} tokens seleccionados del mapa?`)) return;
    command('tokens.delete', { items: refs });
    clearEntitySelection();
  };
  $('#bulk-clear').onclick = () => clearEntitySelection();
}
async function healTokens(tokens) {
  if (state.user.role === 'PLAYER')
    tokens = tokens.filter((t) => t.kind === 'PLAYER' && +t.user_id === +state.user.id);
  const values = await openForm({
    title: 'Curar',
    description:
      'Por favor ingrese un valor número entero para recuperar puntos de vida al personaje.',
    submitText: 'Curar',
    fields: [
      {
        name: 'amount',
        label: 'Puntos de vida a recuperar',
        type: 'number',
        value: 1,
        min: 0,
        step: 'any',
        required: true,
        placeholder: 'Ej. 8',
      },
    ],
  });
  if (!values) return;
  const amount = Math.max(0, Math.ceil(Number(values.amount) || 0));
  if (amount <= 0) return toast('Ingresa un valor mayor que 0');
  for (const t of tokens) {
    const max = Number(t.max_health ?? t.health ?? 0),
      current = displayHp(t.health, t),
      next = max > 0 ? Math.min(max, current + amount) : current + amount;
    t.health = next;
    command(state.user.role === 'PLAYER' ? 'player.health.set' : 'health.set', {
      kind: t.kind,
      id: +t.id,
      health: next,
    });
  }
  toast(`Curación aplicada: ${amount} PV`);
}
function showCellMenu(tokens, x, y, additive = false) {
  const menu = $('#cell-menu');
  menu.innerHTML = '';
  tokens.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = `${t.kind === 'OBJECT' ? '■' : '●'} ${t.name || t.user_name}`;
    b.onclick = () => {
      menu.hidden = true;
      selectMapEntity(t, additive);
    };
    menu.append(b);
  });
  menu.style.left = Math.min(x, canvas.clientWidth - 290) + 'px';
  menu.style.top = Math.min(y, canvas.clientHeight - 220) + 'px';
  menu.hidden = false;
}
function inspect(t) {
  const i = $('#inspector'),
    encounterOn = state.data?.encounter && state.data.encounter.state !== 'OFF',
    combatOn = state.data?.encounter && state.data.encounter.state === 'RUNNING',
    canSelfHeal =
      state.user.role === 'PLAYER' && t.kind === 'PLAYER' && +t.user_id === +state.user.id,
    canEndTurn = state.user.role === 'DM' && t.kind === 'NPC' && combatOn && isCurrent(t),
    canClone = state.user.role === 'DM' && t.kind !== 'PLAYER' && !canEndTurn,
    cloneActive =
      state.cloneSource && state.cloneSource.kind === t.kind && +t.id === +state.cloneSource.id;
  const maxHealth = Number(t.max_health ?? t.health ?? 0),
    damageReceived = Math.max(0, maxHealth - Number(t.health ?? maxHealth));
  let html = `<h2>Selección</h2><div class="token-card"><div class="inspect-title"><strong>${esc(t.name || t.user_name)}</strong>${t.kind === 'PLAYER' && state.user.role === 'DM' ? `<span class="draw-color-dot" style="--draw-color:${drawingColorForToken(t)}" title="Color de dibujo"></span>` : ''}${t.kind === 'NPC' && state.user.role === 'DM' && t.codex_creature_id ? '<button id="inspect-creature-info" type="button" class="info-button" title="Ver ficha de criatura">i</button>' : ''}</div><p>${esc(t.kind)}</p>`;
  if (state.user.role === 'DM')
    html += `<div class="row inspect-top-actions">${canEndTurn ? '<button id="inspect-end-turn" class="primary">Terminar Turno</button>' : canClone ? `<button id="inspect-clone" class="${cloneActive ? 'active' : ''}">Clonar</button>` : ''}<button id="inspect-move">Mover aquí…</button>${t.kind === 'NPC' ? '<button id="inspect-rotate-left" title="Rotar -45°">↶</button><button id="inspect-rotate-right" title="Rotar +45°">↷</button>' : ''}</div>`;
  if (t.health !== undefined) {
    if (encounterOn)
      html += `<label><span>Daño Recibido</span><div class="inline-search"><strong id="inspect-damage-total" class="damage-total">${esc(damageReceived)}</strong><input id="inspect-damage" type="number" min="0" step="1" value="" placeholder="Daño nuevo"></div><small>Total recibido / daño a añadir. PV actual: <span id="inspect-current-hp">${esc(displayHp(t.health, t))}</span> / ${esc(maxHealth)}.</small></label>`;
    else
      html += `<label><span>Vida de ${esc(t.name || t.user_name || 'Token')}</span><div class="inline-search"><input id="inspect-hp" type="number" value="${+t.health}" title="Vida actual"><span class="muted" style="align-self:center">/</span><input id="inspect-max-hp" type="number" min="1" value="${esc(maxHealth || +t.health)}" title="Vida máxima"></div><small>Vida actual / vida máxima.</small></label>`;
    if (state.user.role === 'DM' || canSelfHeal)
      html += '<button id="inspect-heal" class="ok-action">Curar</button>';
  }
  if (t.kind === 'NPC' && state.user.role === 'DM')
    html += `<label>Clase de armadura<input id="inspect-ac" type="number" value="${t.armor_class ?? ''}" placeholder="Sin CA"></label>`;
  if (t.initiative !== undefined)
    html += `<label>Iniciativa<input id="inspect-init" type="number" value="${t.initiative ?? ''}"></label>`;
  if (t.kind === 'PLAYER' && state.user.role === 'DM')
    html += `<label>Notas privadas del jugador<textarea id="inspect-player-notes" rows="6">${esc(t.dm_notes || '')}</textarea></label>`;
  if (t.kind !== 'PLAYER' && state.user.role === 'DM')
    html += `<label>Nombre<input id="inspect-name" value="${esc(t.name || '')}"></label><label>Notas privadas<textarea id="inspect-notes" rows="6">${esc(t.notes || '')}</textarea></label>`;
  if (t.kind === 'OBJECT' && state.user.role === 'DM')
    html += `<div class="row"><label>Ancho (casillas)<input id="inspect-width" type="number" min="1" max="${+state.data.scenario.width - +t.x}" value="${+t.width_cells || 1}"></label><label>Alto (casillas)<input id="inspect-height" type="number" min="1" max="${+state.data.scenario.height - +t.y}" value="${+t.height_cells || 1}"></label></div><label class="check-field"><input id="inspect-visible" type="checkbox" ${+t.visible ? 'checked' : ''}><span>Visible para los jugadores <small>· guardado automático</small></span></label><p class="muted">Tamaño visual: ${Math.max(0.25, (+t.width_cells || 1) - 0.75)} × ${Math.max(0.25, (+t.height_cells || 1) - 0.75)} casillas.</p>`;
  if (t.kind === 'NPC' && state.user.role === 'DM')
    html += `<label class="check-field"><input id="inspect-visible" type="checkbox" ${+t.visible ? 'checked' : ''}><span>Visible para los jugadores <small>· guardado automático</small></span></label>`;
  if (state.user.role === 'DM') {
    const inEncounter = state.data.participants.some(
      (p) => p.actor_type === t.kind && +p.actor_id === +t.id && p.state !== 'REMOVED',
    );
    if (encounterOn && ['NPC', 'PLAYER'].includes(t.kind) && !inEncounter)
      html += '<button id="inspect-include-combat" class="primary">Incluir en Combate</button>';
    if (t.kind !== 'PLAYER')
      html += '<div class="inspect-image-row"><button id="inspect-image">Imagen…</button></div>';
    html += `<div class="row inspect-bottom-actions"><button id="inspect-save">Guardar</button>${t.kind !== 'PLAYER' ? '<button id="inspect-delete" class="danger-action">Eliminar</button>' : ''}</div>`;
  }
  html += '</div>';
  i.innerHTML = html;
  i.scrollTop = 0;
  if (canSelfHeal && $('#inspect-heal')) $('#inspect-heal').onclick = () => healTokens([t]);
  if (state.user.role === 'DM') {
    if ($('#inspect-visible'))
      $('#inspect-visible').onchange = (e) =>
        command('token.update', { kind: t.kind, id: +t.id, visible: e.target.checked });
    const applyIncomingDamage = () => {
      const el = $('#inspect-damage');
      if (!el || el.value === '') return;
      const damage = Math.max(0, +el.value || 0);
      if (!damage) return;
      const floor = t.kind === 'PLAYER' ? -10 : 0,
        next = Math.max(floor, Number(t.health ?? 0) - damage);
      t.health = next;
      el.value = '';
      const total = $('#inspect-damage-total');
      if (total) total.textContent = String(Math.max(0, maxHealth - next));
      const cur = $('#inspect-current-hp');
      if (cur) cur.textContent = String(displayHp(next, t));
      command('health.set', { kind: t.kind, id: +t.id, health: next });
    };
    const saveInspect = () => {
      applyIncomingDamage();
      if ($('#inspect-hp'))
        command('health.set', {
          kind: t.kind,
          id: +t.id,
          health: +$('#inspect-hp').value,
          ...($('#inspect-max-hp') ? { maxHealth: +$('#inspect-max-hp').value } : {}),
        });
      if ($('#inspect-init'))
        command('initiative.set', {
          kind: t.kind,
          id: +t.id,
          initiative: $('#inspect-init').value === '' ? null : +$('#inspect-init').value,
        });
      if (t.kind !== 'PLAYER') {
        const changes = {
          kind: t.kind,
          id: +t.id,
          name: $('#inspect-name').value,
          notes: $('#inspect-notes').value,
        };
        if (t.kind === 'OBJECT') {
          changes.width_cells = +$('#inspect-width').value;
          changes.height_cells = +$('#inspect-height').value;
          changes.visible = $('#inspect-visible').checked;
        } else if (t.kind === 'NPC') {
          changes.visible = $('#inspect-visible').checked;
          changes.armor_class = $('#inspect-ac').value === '' ? null : +$('#inspect-ac').value;
        }
        command('token.update', changes);
      } else
        command('player.note', { playerId: +t.user_id, notes: $('#inspect-player-notes').value });
    };
    $('#inspect-save').onclick = saveInspect;
    if ($('#inspect-damage')) {
      $('#inspect-damage').addEventListener('change', applyIncomingDamage);
      $('#inspect-damage').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyIncomingDamage();
        }
      });
    }
    if ($('#inspect-heal')) $('#inspect-heal').onclick = () => healTokens([t]);
    let saveTimer = null;
    [
      'inspect-hp',
      'inspect-max-hp',
      'inspect-ac',
      'inspect-init',
      'inspect-name',
      'inspect-notes',
      'inspect-width',
      'inspect-height',
      'inspect-player-notes',
    ].forEach((id) => {
      const el = $('#' + id);
      if (el)
        el.addEventListener('input', () => {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(saveInspect, 650);
        });
    });
    $('#inspect-move').onclick = () => {
      setMode('select');
      state.moveToken = t;
      toast('Toca la casilla de destino');
    };
    if ($('#inspect-rotate-left'))
      $('#inspect-rotate-left').onclick = () =>
        command('token.update', {
          kind: 'NPC',
          id: +t.id,
          rotation_degrees: ((+t.rotation_degrees || 0) - 45 + 360) % 360,
        });
    if ($('#inspect-rotate-right'))
      $('#inspect-rotate-right').onclick = () =>
        command('token.update', {
          kind: 'NPC',
          id: +t.id,
          rotation_degrees: ((+t.rotation_degrees || 0) + 45) % 360,
        });
    if ($('#inspect-creature-info'))
      $('#inspect-creature-info').onclick = () => openNpcCreatureInfo(+t.codex_creature_id);
    if ($('#inspect-include-combat'))
      $('#inspect-include-combat').onclick = () =>
        command('encounter.include', { kind: t.kind, id: +t.id });
    if ($('#inspect-end-turn')) $('#inspect-end-turn').onclick = () => command('turn.next');
    if ($('#inspect-image'))
      $('#inspect-image').onclick = () => {
        uploadTarget = { kind: t.kind, id: +t.id };
        $('#image-file').click();
      };
    if ($('#inspect-clone'))
      $('#inspect-clone').onclick = () => {
        const same =
          state.cloneSource && state.cloneSource.kind === t.kind && +state.cloneSource.id === +t.id;
        state.cloneSource = same ? null : { kind: t.kind, id: +t.id };
        setMode('select');
        renderEntitySelection();
        toast(same ? 'Clonado desactivado' : 'Clonado activado: toca casillas para crear copias');
      };
    if ($('#inspect-delete'))
      $('#inspect-delete').onclick = () => {
        if (!confirm(`¿Eliminar ${t.kind === 'NPC' ? 'este NPC' : 'este objeto'} del mapa?`))
          return;
        command('token.delete', { kind: t.kind, id: +t.id });
        state.selectedObjects.delete(+t.id);
        state.selectedNpcs.delete(+t.id);
        clearEntitySelection();
      };
  }
}
function participantName(p) {
  if (p.actor_type === 'PLAYER') {
    const x = state.data.players.find((v) => +v.id === +p.actor_id);
    return x?.name || x?.user_name || 'Jugador';
  }
  const x = state.data.npcs.find((v) => +v.id === +p.actor_id);
  return x?.name || 'NPC';
}
