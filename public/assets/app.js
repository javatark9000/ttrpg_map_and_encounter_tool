import { $, $$, api, esc, toast } from './js/core.js';
import {
  dialog,
  dialogForm,
  installDefaultDialogHandlers,
  openForm,
  releaseDialog,
} from './js/dialogs.js';
import { openNpcCreatureInfo, openCodexLibrary } from './js/codex.js';
import {
  icon,
  avatar,
  updateList,
  initInterface,
  navigate,
  setEncounterOpen,
  setEncounterTab,
  showInspector,
  refreshInterface,
  setRequestsOpen,
} from './js/interface.js';
import { state } from './js/state.js';
import { createD20Renderer } from './js/dice.js';

const DRAW_POINT_MIN_DISTANCE = 0.18;
let diceHideTimer = null,
  diceRenderer = null,
  pendingDiceRequestId = null,
  animatedMapTimer = null;
function displayHp(v, t = null) {
  return Math.max(t?.kind === 'PLAYER' || t?.actor_type === 'PLAYER' ? -10 : 0, Number(v ?? 0));
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}
function canUsePlayerCharacters() {
  return ['DM', 'PLAYER'].includes(state.user?.role);
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
  document.body.classList.toggle('is-player', me.user.role === 'PLAYER');
  document.body.classList.toggle('is-guest', me.user.role === 'GUEST');
  if (me.user.role !== 'DM') $$('.dm-only').forEach((element) => (element.hidden = true));
  if (me.user.role !== 'PLAYER') $$('.player-only').forEach((element) => (element.hidden = true));
  $$('.character-owner-only').forEach((e) => (e.hidden = !['DM', 'PLAYER'].includes(me.user.role)));
  $$('.authenticated-only').forEach((element) => (element.hidden = me.user.role === 'GUEST'));
  $$('.guest-only').forEach((element) => (element.hidden = me.user.role !== 'GUEST'));
  await loadBootstrap();
  navigate('map');
  if (me.user.role === 'GUEST') {
    $('#empty h1').textContent = 'Esperando al DM';
    $('#empty p').textContent = 'El mapa aparecerá cuando el DM comparta un escenario activo.';
  } else {
    let lastScenarioId = null;
    try {
      lastScenarioId = Number(localStorage.getItem(`ttrpg:last-scenario:${me.user.id}`));
    } catch {
      // El almacenamiento puede estar bloqueado; la elección manual sigue disponible.
    }
    const lastScenario = state.bootstrap.scenarios.find(
      (scenario) =>
        +scenario.id === lastScenarioId && (me.user.role === 'DM' || +scenario.active === 1),
    );
    if (lastScenario) {
      try {
        await openScenario(lastScenario.id);
      } catch (error) {
        toast(error.message);
        navigate('worlds');
      }
    } else {
      navigate('worlds');
    }
  }
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
  const scenarios = state.bootstrap.scenarios;
  $('#scenario-count').textContent = String(scenarios.length);
  updateList(
    $('#scenario-list'),
    scenarios.length
      ? scenarios
          .map(
            (s) =>
              `<article class="b-world-entry ${state.user.role === 'DM' ? 'has-settings' : ''} ${+s.id === state.scenarioId ? 'is-current' : ''}"><button type="button" id="scene-open-${+s.id}" data-open-scenario="${+s.id}" class="b-world-open"><span><strong class="b-world-name">${esc(s.name)}</strong><span class="b-world-meta"><span class="b-world-status ${s.active ? 'is-active' : ''}">${s.active ? 'Activo' : 'En preparación'}</span><span>${+s.width} × ${+s.height}</span>${+s.id === state.scenarioId ? '<span class="b-world-current">Actual</span>' : ''}</span></span>${icon('chevron')}</button>${state.user.role === 'DM' ? `<button type="button" id="scene-settings-${+s.id}" data-scenario-settings="${+s.id}" class="icon-button" aria-label="Administrar ${esc(s.name)}">${icon('settings')}</button>` : ''}</article>`,
          )
          .join('')
      : '<div class="empty-state"><h3>Sin escenarios activos</h3><p>Los mapas disponibles aparecerán aquí.</p></div>',
  );
  $$('[data-open-scenario]').forEach(
    (button) =>
      (button.onclick = () =>
        openScenario(+button.dataset.openScenario).catch((error) => toast(error.message))),
  );
  $$('[data-scenario-settings]').forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          await openScenario(+button.dataset.scenarioSettings);
          $('#scenario-dialog').showModal();
        } catch (error) {
          toast(error.message);
        }
      }),
  );
  const characters = state.bootstrap.characters;
  if (state.selectedCharacter && !characters.some((c) => +c.id === +state.selectedCharacter))
    state.selectedCharacter = null;
  updateList(
    $('#character-list'),
    characters.length
      ? characters
          .map((c) => {
            const player = state.data?.players.find((p) => +p.character_id === +c.id && +p.placed);
            const hp = player?.health ?? c.current_health ?? c.max_health;
            const canPlace = state.data && +state.data.scenario.campaign_id === +c.campaign_id;
            return `<article class="character-card ${state.selectedCharacter === +c.id ? 'is-selected' : ''}"><div class="character-heading">${avatar(c)}<h2>${esc(c.name)}</h2></div><div class="health-value">${displayHp(hp, { kind: 'PLAYER' })} <small>/ ${+c.max_health} PV</small></div><div class="health-track"><i style="--health:${Math.max(0, Math.min(100, (+hp / Math.max(1, +c.max_health)) * 100))}%"></i></div><div class="character-card-actions"><button type="button" class="primary" id="character-place-${+c.id}" data-character-place="${+c.id}" ${canPlace ? '' : 'disabled'}>${icon(player ? 'map' : 'plus')}${player ? 'Ver en el mapa' : 'Colocar'}</button><button type="button" id="character-avatar-${+c.id}" data-character-avatar="${+c.id}">${icon('pen')}Personalizar</button></div>${!canPlace ? '<p class="muted">Abre un escenario de su campaña para colocar la ficha.</p>' : ''}</article>`;
          })
          .join('')
      : '<div class="empty-state"><h3>Aún no tienes personajes</h3><p>Crea tu primer personaje para unirte a la mesa.</p></div>',
  );
  $$('[data-character-place]').forEach(
    (button) =>
      (button.onclick = () => {
        state.selectedCharacter = +button.dataset.characterPlace;
        state.path = [];
        navigate('map');
        const player = controlledPlayer();
        if (player) {
          selectMapEntity({ ...player, kind: 'PLAYER' });
          centerToken(player);
        } else beginCharacterPlacement();
        renderSidebar();
      }),
  );
  $$('[data-character-avatar]').forEach(
    (button) =>
      (button.onclick = () => {
        state.selectedCharacter = +button.dataset.characterAvatar;
        openImagePicker('avatar');
      }),
  );
  if (!state.data) {
    $('#empty h1').textContent = scenarios.length ? 'Elige un escenario' : 'Sin escenarios activos';
    $('#empty p').textContent =
      state.user.role === 'DM'
        ? 'Abre Mundos para crear o elegir un escenario.'
        : 'Tus personajes y el Codex siguen disponibles mientras el DM prepara la mesa.';
  }
  updateDelayTurnControl();
  updatePasteControl();
  refreshInterface();
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
    const scenarioCampaignId =
        state.data?.scenario?.campaign_id ||
        state.bootstrap.scenarios.find((scenario) => +scenario.id === +state.scenarioId)
          ?.campaign_id,
      created = await api('/characters', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: +(scenarioCampaignId || state.bootstrap.campaigns[0].id),
          name: values.name,
          maxHealth: +values.maxHealth,
        }),
      });
    state.selectedCharacter = +created.id;
    await loadBootstrap();
  } catch (e) {
    toast(e.message);
  }
};
function activateDmPanelTab(name) {
  if (name === 'encounter') {
    setEncounterOpen(true);
    setEncounterTab('order');
  } else if (name === 'inspector') showInspector(true);
}
$('#table-tools-open').onclick = () => {
  $('#session-menu').open = false;
  $('#clear-map-fog').disabled = !state.data;
  $('#encounter-log').disabled = !state.data;
  renderDiceRollLog();
  $('#table-tools-dialog').showModal();
};
$('#table-tools-close').onclick = () => $('#table-tools-dialog').close();

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
    $('#connection').textContent = 'En línea';
    updateTurnControls();
    $('#connection').className = 'pill online';
    updatePasteControl();
    if (state.scenarioId) subscribe();
    ws._beat = setInterval(
      () => ws.readyState === 1 && ws.send(JSON.stringify({ action: 'heartbeat' })),
      20000,
    );
  };
  ws.onclose = () => {
    clearInterval(ws._beat);
    pendingDiceRequestId = null;
    resetDiceAnimation();
    state.pendingTurn = null;
    state.pendingPasteRequestId = null;
    state.pendingMovementRequestId = null;
    state.draftRequestId = null;
    updateTurnControls();
    updatePasteControl();
    $('#connection').textContent = 'Sin conexión · reconectando';
    $('#encounter-error').textContent =
      'Sin conexión. Espera a la reconexión para enviar acciones.';
    $('#encounter-error').hidden = false;
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
    else if (m.type === 'dice.roll.started') handleDiceRollStarted(m);
    else if (m.type === 'dice.roll.revealed') handleDiceRollRevealed(m.data);
    else if (m.type === 'command.accepted' && m.requestId === state.pendingPasteRequestId) {
      state.pendingPasteRequestId = null;
      state.tokenClipboard = null;
      updatePasteControl();
      toast('Personajes pegados');
    } else if (m.type === 'command.accepted' && m.requestId === state.pendingTurn?.requestId) {
      state.pendingTurn.version = +m.event.version;
      if (+state.data?.scenario?.version >= +m.event.version) handleSnapshot(state.data);
    } else if (m.type === 'command.accepted' && m.requestId === state.pendingMovementRequestId) {
      state.pendingMovementRequestId = null;
      state.selectedMovementPreview = null;
      refreshInterface();
    } else if (m.type === 'command.error') {
      if (m.requestId === state.pendingMovementRequestId) {
        state.pendingMovementRequestId = null;
        renderMovementRequests();
      }
      if (m.requestId === pendingDiceRequestId) {
        pendingDiceRequestId = null;
        $('#roll-d20').disabled = false;
      }
      if (m.requestId === state.pendingTurn?.requestId) {
        state.pendingTurn = null;
        state.draftRequestId = null;
        $('#encounter-error').textContent = m.error;
        $('#encounter-error').hidden = false;
        updateTurnControls();
        if (state.scenarioId) subscribe();
      }
      if (m.requestId === state.pendingPasteRequestId) {
        state.pendingPasteRequestId = null;
        updatePasteControl();
      }
      toast(m.error);
    } else if (m.type === 'error') toast(m.error);
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
    state.selectedPlayers.clear();
    state.inspected = null;
    state.inspectorOpen = false;
    state.selectedMovementPreview = null;
    state.lastPublicRoll = null;
    state.chatThreads = [];
    state.drawings = [];
    state.drawStroke = null;
    state.images.clear();
    state.openChats.clear();
    $('#chat-windows').innerHTML = '';
    $('#scenario-dialog').close();
    $('#table-tools-dialog').close();
    setEncounterOpen(false);
    setRequestsOpen(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('#empty').hidden = false;
    $('#empty h1').textContent = 'Mapa no disponible';
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
  navigate('map');
  if (+state.scenarioId === +id && state.data) return;
  state.pendingTurn = null;
  state.pendingMovementRequestId = null;
  cancelEncounterDraft();
  setEncounterOpen(false);
  state.inspected = null;
  state.inspectorOpen = false;
  state.lastPublicRoll = null;
  $('#public-roll').innerHTML = '';
  state.scenarioId = +id;
  state.data = null;
  resetDiceAnimation();
  state.path = [];
  state.drawings = [];
  state.drawStroke = null;
  state.selectedObjects.clear();
  state.selectedNpcs.clear();
  state.selectedPlayers.clear();
  state.cloneSource = null;
  state.moveToken = null;
  state.lastPendingRequestIds = new Set();
  state.selectedMovementPreview = null;
  state.hoveredMovementPreview = null;
  state.encounterTokenHighlight = null;
  state.chatThreads = [];
  state.openChats.clear();
  $('#chat-windows').innerHTML = '';
  state.encounterSelecting = false;
  state.visibilityAnimations.clear();
  state.followCamera = null;
  state.camera = { x: 30, y: state.user.role === 'DM' ? 30 - cellSize * 5 : 30, z: 1 };
  renderSidebar();
  $('#empty').hidden = false;
  $('#empty h1').textContent = 'Cargando escenario…';
  $('#empty p').textContent = 'Recuperando el estado de la mesa.';
  $('#workspace').hidden = true;
  refreshInterface();
  try {
    const data = await api(`/scenarios/${id}/snapshot`);
    if (+state.scenarioId !== +id) return;
    $('#workspace').hidden = false;
    $('#empty').hidden = true;
    resize();
    handleSnapshot(data);
    if (state.user.role !== 'GUEST') {
      try {
        localStorage.setItem(`ttrpg:last-scenario:${state.user.id}`, String(id));
      } catch {
        // No impedir abrir el mapa si el navegador no permite recordar la selección.
      }
    }
    if (state.ws?.readyState === 1) subscribe();
  } catch (error) {
    if (+state.scenarioId !== +id) return;
    state.scenarioId = null;
    $('#empty h1').textContent = 'No se pudo abrir el escenario';
    $('#empty p').textContent = error.message;
    refreshInterface();
    throw error;
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
function generateRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function')
    return globalThis.crypto.randomUUID().replaceAll('-', '');
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function')
    globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.random() * 256;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function command(type, payload = {}) {
  if (state.ws?.readyState !== 1) {
    toast('Sin conexión');
    return null;
  }
  const turnCommand = type.startsWith('turn.') || type.startsWith('encounter.');
  const requestId = generateRequestId();
  if (turnCommand) {
    if (state.pendingTurn || !state.data) return;
    payload = { ...payload, expectedVersion: +state.data.scenario.version };
    state.pendingTurn = { requestId, scenarioId: state.scenarioId, version: null, type };
    $('#encounter-error').hidden = true;
    updateTurnControls();
  }
  state.ws.send(
    JSON.stringify({
      action: 'command',
      type,
      requestId,
      payload: { ...payload, scenarioId: state.scenarioId },
    }),
  );
  return requestId;
}
function selectedCharacterHasTurn() {
  const controlled = controlledPlayer(),
    encounter = state.data?.encounter,
    current = state.data?.participants?.find(
      (participant) => +participant.id === +encounter?.current_participant_id,
    );
  return !!(
    controlled &&
    encounter?.state === 'RUNNING' &&
    current?.actor_type === 'PLAYER' &&
    current.state === 'ACTIVE' &&
    +current.actor_id === +controlled.id
  );
}
function updateDelayTurnControl() {
  const button = $('#delay-turn');
  if (!button) return;
  button.hidden = !selectedCharacterHasTurn();
  button.disabled = !!state.pendingTurn || state.ws?.readyState !== 1;
}
function updateTurnControls() {
  $$(
    '#turn-next, #turn-rollback, #restart-round, #inspect-end-turn, #encounter-start, #encounter-prepare, #encounter-stop',
  ).forEach((button) => {
    button.disabled =
      !!state.pendingTurn ||
      state.ws?.readyState !== 1 ||
      (button.id === 'turn-rollback' && !state.data?.canRollbackTurn);
  });
  $('#encounter-start').textContent = state.draftRequestId ? 'Iniciando…' : 'Iniciar encuentro';
  $('#encounter-cancel').disabled = !!state.draftRequestId;
  $('#encounter-prepare-another').disabled = !!state.pendingTurn || state.ws?.readyState !== 1;
  updateDelayTurnControl();
}
function handleSnapshot(data) {
  if (+data.scenario.id !== state.scenarioId) return;
  const initialScenarioSnapshot = +state.data?.scenario?.id !== +data.scenario.id;
  if (!initialScenarioSnapshot && +data.scenario.version < +state.data.scenario.version) return;
  if (state.pendingTurn?.version != null && +data.scenario.version >= state.pendingTurn.version) {
    if (state.pendingTurn.requestId === state.draftRequestId) {
      state.draftRequestId = null;
      cancelEncounterDraft();
      setEncounterTab('order');
    }
    state.pendingTurn = null;
  }
  prepareAnimations(state.data, data);
  const prev = state.lastPendingRequestIds;
  state.data = data;
  if (state.user?.role === 'PLAYER' && state.path.length) {
    const fogged = foggedCellSet();
    if (state.path.some((cell) => fogged.has(blockedKey(cell)))) {
      state.path = [];
      toast('La niebla oculta parte del recorrido. Vuelve a trazar el camino.');
    }
  }
  const pendingMovementIds = new Set((data.pendingMovements || []).map((item) => +item.id));
  if (!pendingMovementIds.has(+state.selectedMovementPreview)) state.selectedMovementPreview = null;
  if (!pendingMovementIds.has(+state.hoveredMovementPreview)) state.hoveredMovementPreview = null;
  if (initialScenarioSnapshot) fitVisibleCellsForPlayers();
  if (state.inspected && !inspectedToken()) {
    state.inspected = null;
    state.inspectorOpen = false;
    if ($('#inspector').contains($('#delay-turn'))) $('#own-turn-actions').append($('#delay-turn'));
    $('#inspector').innerHTML = '';
  }
  if (!state.encounterSelecting) selectionItems();
  renderSidebar();
  renderDetails();
  draw();
  if (state.user?.role === 'DM') {
    const pending = new Set((data.pendingMovements || []).map((x) => +x.id));
    for (const r of data.pendingMovements || [])
      if (!initialScenarioSnapshot && !prev.has(+r.id))
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
async function confirmToast(title, body) {
  return !!(await openForm({
    title,
    description: body,
    submitText: 'Sí, continuar',
    danger: true,
  }));
}
function focusRequests() {
  $('#requests-toggle').scrollIntoView({ block: 'nearest', inline: 'nearest' });
  setRequestsOpen(true);
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
  const scenarioId = state.scenarioId;
  const data = await api(`/scenarios/${scenarioId}/chats`);
  if (scenarioId !== state.scenarioId) return;
  state.chatThreads = data.threads || [];
  renderChatThreads();
}
function renderChatThreads() {
  const target = state.user.role === 'DM' ? $('#dm-chat-list') : $('#player-chat-list');
  if (!target) return;
  updateList(
    target,
    state.chatThreads.length
      ? state.chatThreads
          .map(
            (t) =>
              `<button type="button" id="chat-thread-${+t.id}" data-chat-id="${+t.id}" class="chat-thread ${state.openChats.has(+t.id) && !state.openChats.get(+t.id).hidden ? 'active' : ''}"><strong>${state.user.role === 'DM' ? esc(t.player_name) : 'Chat con DM'}</strong> ${+t.unread ? `<span class="badge">${+t.unread}</span>` : ''}<small>${esc(t.last_message || 'Sin mensajes')}</small></button>`,
          )
          .join('')
      : '<p class="muted">Sin conversaciones.</p>',
  );
  target.querySelectorAll('[data-chat-id]').forEach(
    (button) =>
      (button.onclick = () => {
        const thread = state.chatThreads.find((t) => +t.id === +button.dataset.chatId);
        openChat(+thread.id, state.user.role === 'DM' ? thread.player_name : 'Chat con DM').catch(
          (error) => toast(error.message),
        );
      }),
  );
  updateActivityBadge();
}
async function openChat(chatId, title = 'Chat', focus = true) {
  const scenarioId = state.scenarioId;
  const data = await api(`/chats/${chatId}/messages`);
  if (scenarioId !== state.scenarioId) return;
  if (focus) navigate('chat');
  $('#chat-empty')?.remove();
  for (const [id, element] of state.openChats) element.hidden = +id !== +chatId;
  let win = state.openChats.get(chatId);
  if (win) win.hidden = false;
  if (!win) {
    win = document.createElement('div');
    win.className = 'chat-window';
    win.innerHTML = `<header><strong></strong><button type="button" class="icon-button" aria-label="Cerrar conversación">${icon('close')}</button></header><div class="chat-messages" role="log" aria-live="polite"></div><form class="chat-send"><label class="sr-only" for="chat-input-${chatId}">Mensaje</label><input id="chat-input-${chatId}" name="message" autocomplete="off" maxlength="2000" placeholder="Mensaje…"><button>Enviar</button></form>`;
    win.querySelector('.icon-button').onclick = () => {
      state.openChats.delete(chatId);
      win.remove();
    };
    win.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const input = e.target.elements.message,
        msg = input.value.trim();
      if (!msg) return;
      if (state.ws?.readyState !== 1) {
        toast('Sin conexión. Tu mensaje no se ha enviado.');
        return;
      }
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
  const atEnd = box.scrollHeight - box.clientHeight - box.scrollTop < 48;
  const scroll = box.scrollTop;
  box.innerHTML = messages
    .map(
      (m) =>
        `<div class="chat-msg ${+m.sender_id === +state.user.id ? 'mine' : ''}"><small>${esc(m.sender_name)} · ${esc(m.created_at)}</small>${esc(m.message)}</div>`,
    )
    .join('');
  box.scrollTop = atEnd ? box.scrollHeight : scroll;
}
function startD20Animation(rollId) {
  diceRenderer ||= createD20Renderer($('#dice-roll-canvas'), $('#dice-effects-canvas'));
  diceRenderer.start(rollId);
}
function handleDiceRollStarted(message) {
  if (+message.scenarioId !== +state.scenarioId) return;
  pendingDiceRequestId = null;
  clearTimeout(diceHideTimer);
  const overlay = $('#dice-roll-overlay');
  overlay.hidden = false;
  overlay.className = 'rolling';
  overlay.dataset.rollId = String(message.rollId);
  startD20Animation(message.rollId);
  $('#dice-roller-name').textContent = `${message.rollerName} lanza un d20`;
  $('#dice-roll-status').textContent = 'Preparando lanzamiento…';
  $('#dice-roll-value').textContent = '?';
  $('#roll-d20').disabled = true;
  diceHideTimer = setTimeout(() => {
    resetDiceAnimation();
    toast('No se pudo revelar el resultado del dado.');
  }, 5000);
}
function handleDiceRollRevealed(roll) {
  if (+roll.scenario_id !== +state.scenarioId) return;
  const overlay = $('#dice-roll-overlay');
  if (+overlay.dataset.rollId !== +roll.id) return;
  clearTimeout(diceHideTimer);
  diceHideTimer = null;
  const result = +roll.result;
  overlay.className = 'settling';
  $('#dice-roll-status').textContent = 'Lanzando…';
  diceRenderer?.land(result, () => {
    if (+overlay.dataset.rollId !== +roll.id || +state.scenarioId !== +roll.scenario_id) return;
    overlay.className = `revealed${result === 20 ? ' critical' : result === 1 ? ' fumble' : ''}`;
    $('#dice-roll-value').textContent = String(result);
    $('#dice-roll-status').textContent =
      result === 20
        ? '¡20 natural · Crítico!'
        : result === 1
          ? '¡1 natural · Pifia!'
          : `Resultado: ${result}`;
    state.lastPublicRoll = roll;
    $('#public-roll').innerHTML =
      `<div class="public-roll">${icon('dice')}<strong>${result}</strong><span>${esc(roll.roller_name)}<small>Última tirada · d20</small></span></div>`;
    // Start the reading time at physical rest, never while the die is still bouncing.
    diceHideTimer = setTimeout(resetDiceAnimation, result === 1 || result === 20 ? 3200 : 2000);
  });
  if (state.user?.role === 'DM' && state.data) {
    state.data.diceRolls ||= [];
    if (!state.data.diceRolls.some((item) => +item.id === +roll.id))
      state.data.diceRolls.unshift(roll);
    renderDiceRollLog();
  }
}
function resetDiceAnimation() {
  clearTimeout(diceHideTimer);
  diceHideTimer = null;
  diceRenderer?.stop();
  const overlay = $('#dice-roll-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.className = '';
    delete overlay.dataset.rollId;
  }
  const button = $('#roll-d20');
  if (button) button.disabled = false;
}
$('#roll-d20').onclick = () => {
  if (!state.scenarioId || state.ws?.readyState !== 1 || pendingDiceRequestId) {
    toast('No se puede lanzar el dado ahora.');
    return;
  }
  pendingDiceRequestId = generateRequestId();
  $('#roll-d20').disabled = true;
  state.ws.send(
    JSON.stringify({
      action: 'dice.roll',
      scenarioId: state.scenarioId,
      requestId: pendingDiceRequestId,
    }),
  );
};
function formatCostaRicaTime(roll) {
  const date = roll.created_at_unix
    ? new Date(+roll.created_at_unix * 1000)
    : new Date(String(roll.created_at || '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(roll.created_at || '');
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}
function renderDiceRollLog() {
  const list = $('#dice-roll-log');
  if (!list || state.user?.role !== 'DM') return;
  const rolls = state.data?.diceRolls || [];
  list.innerHTML = rolls.length
    ? rolls
        .map(
          (roll) =>
            `<div class="dice-roll-entry"><span class="roll-result">${+roll.result}</span><div><strong>${esc(roll.roller_name)}</strong><small>${+roll.in_combat ? `En combate${roll.round_no ? ` · Ronda ${+roll.round_no}` : ''}` : 'Fuera de combate'} · Hora CR: ${esc(formatCostaRicaTime(roll))}</small></div><button type="button" class="dice-roll-delete" data-roll-delete="${+roll.id}" aria-label="Eliminar lanzamiento de ${esc(roll.roller_name)}">×</button></div>`,
        )
        .join('')
    : '<p class="muted">Todavía no hay lanzamientos.</p>';
  list.querySelectorAll('[data-roll-delete]').forEach(
    (button) =>
      (button.onclick = async () => {
        const roll = rolls.find((item) => +item.id === +button.dataset.rollDelete);
        const accepted = await openForm({
          title: 'Eliminar lanzamiento',
          description: `¿Seguro que quieres eliminar el resultado de ${roll?.roller_name || 'este lanzamiento'}?`,
          submitText: 'Sí, eliminar',
          danger: true,
        });
        if (accepted) command('dice.roll.delete', { id: +button.dataset.rollDelete });
      }),
  );
}
function handleChatMessage(msg) {
  loadChatThreads().catch(() => {});
  const open = state.openChats.get(+msg.chat_id);
  if (open && !open.hidden && state.page === 'chat')
    openChat(+msg.chat_id, state.user.role === 'DM' ? msg.player_name : 'Chat con DM', false).catch(
      (error) => toast(error.message),
    );
  else
    notifyApp(
      state.user.role === 'DM' ? `Chat de ${msg.player_name}` : 'Mensaje del DM',
      msg.message,
      () => openChat(+msg.chat_id, msg.player_name || 'DM'),
    );
}
function encounterCandidates() {
  if (!state.data) return [];
  return [
    ...state.data.players.filter((p) => +p.placed).map((p) => ({ ...p, kind: 'PLAYER' })),
    ...state.data.npcs
      .filter((n) => +n.visible && +n.health > 0)
      .map((n) => ({ ...n, kind: 'NPC' })),
  ];
}
function beginEncounterDraft() {
  if (!state.data || state.pendingTurn) return;
  state.encounterSelecting = true;
  state.encounterDraft = new Set(encounterCandidates().map((t) => `${t.kind}:${t.id}`));
  $('#encounter-actions-menu').open = false;
  $('#encounter-error').hidden = true;
  setEncounterOpen(true);
  setEncounterTab('order');
  setMode('select');
  renderEncounterControls();
  draw();
}
function cancelEncounterDraft() {
  if (!state.encounterSelecting) return;
  state.encounterSelecting = false;
  state.encounterDraft = null;
  $('#encounter-error').hidden = true;
  // A submitted command remains authoritative even if its panel is closed.
  renderEncounterControls();
  draw();
}
async function handleEncounterStart() {
  if (!state.encounterSelecting || state.pendingTurn) return;
  const scenarioId = state.scenarioId;
  if (
    state.data.encounter?.state === 'RUNNING' &&
    !(await confirmToast(
      '¿Sustituir el encuentro?',
      'Se iniciará un nuevo encuentro con esta selección. Se limpiarán las esperas, el historial de turnos y el log de salud anterior.',
    ))
  )
    return;
  if (scenarioId !== state.scenarioId || !state.encounterDraft) return;
  const participants = encounterCandidates()
    .filter((t) => state.encounterDraft.has(`${t.kind}:${t.id}`))
    .map((t) => ({ kind: t.kind, id: +t.id }));
  state.draftRequestId = command('encounter.start', { prepare: true, participants });
  updateTurnControls();
}
function renderEncounterDraft() {
  const candidates = encounterCandidates();
  if (state.encounterDraft) {
    const valid = new Set(candidates.map((t) => `${t.kind}:${t.id}`));
    state.encounterDraft = new Set([...state.encounterDraft].filter((key) => valid.has(key)));
  }
  updateList(
    $('#encounter-candidates'),
    candidates.length
      ? candidates
          .map((t) => {
            const key = `${t.kind}:${t.id}`;
            return `<div class="b-participant-option"><label><input id="draft-${t.kind}-${+t.id}" type="checkbox" data-draft-key="${key}" ${state.encounterDraft?.has(key) ? 'checked' : ''} ${state.pendingTurn ? 'disabled' : ''}>${avatar(t)}<span>${esc(t.name || t.user_name)}<small>${t.kind === 'PLAYER' ? 'Jugador' : 'NPC'} · IR ${esc(t.initiative ?? '—')} · ${displayHp(t.health, t)} / ${+t.max_health} PV</small></span></label><button type="button" id="draft-inspect-${t.kind}-${+t.id}" class="icon-button" data-draft-inspect="${key}" aria-label="Inspeccionar ${esc(t.name || t.user_name)}">${icon('search')}</button></div>`;
          })
          .join('')
      : '<div class="empty-state">Coloca personajes o añade NPCs visibles al mapa.</div>',
  );
  $$('[data-draft-key]').forEach(
    (input) =>
      (input.onchange = () => {
        if (!state.encounterDraft) return;
        input.checked
          ? state.encounterDraft.add(input.dataset.draftKey)
          : state.encounterDraft.delete(input.dataset.draftKey);
        draw();
      }),
  );
  $$('[data-draft-inspect]').forEach(
    (button) =>
      (button.onclick = () => {
        const token = candidates.find((t) => `${t.kind}:${t.id}` === button.dataset.draftInspect);
        if (token) inspect(token);
      }),
  );
}
function renderEncounterControls() {
  const encounter = state.data?.encounter;
  const active = encounter && encounter.state !== 'OFF';
  const draft = state.encounterSelecting;
  $('#turn-info').textContent = draft
    ? 'Preparación del encuentro'
    : active
      ? `Ronda ${+encounter.round_no || 0} · ${encounter.state === 'RUNNING' ? 'En curso' : 'Preparado'}`
      : 'Exploración libre. Prepara un encuentro cuando la mesa esté lista.';
  $('#encounter-prepare').hidden = !!active || draft;
  $('#encounter-prepare').disabled = !state.data;
  $('#encounter-start').hidden = !draft;
  $('#encounter-cancel').hidden = !draft;
  $('#encounter-draft').hidden = !draft;
  $('#encounter-actions-menu').hidden = !active || draft;
  $('#encounter-prepare-another').textContent =
    encounter?.state === 'RUNNING' ? 'Preparar otro encuentro' : 'Elegir participantes';
  $('#restart-round').hidden = encounter?.state !== 'RUNNING';
  $('#turn-next').hidden = encounter?.state !== 'RUNNING' || draft;
  $('#turn-rollback').hidden = encounter?.state !== 'RUNNING' || draft;
  if (draft) renderEncounterDraft();
  renderEncounterBar();
  renderRoundOrder();
  updateTurnControls();
  refreshInterface();
}
function updateActivityBadge() {
  const badge = $('#activity-badge');
  if (!badge || state.user?.role === 'GUEST') return;
  const pending = state.data?.pendingMovements?.length || 0;
  const unread = state.chatThreads.reduce((total, thread) => total + (+thread.unread || 0), 0);
  badge.textContent = String(pending);
  badge.hidden = pending === 0;
  $('#chat-badge').textContent = String(unread);
  $('#chat-badge').hidden = unread === 0;
}

function currentEncounterActor() {
  const encounter = state.data?.encounter;
  const participant = state.data?.participants?.find(
    (item) => +item.id === +encounter?.current_participant_id,
  );
  const token = participant
    ? participant.actor_type === 'PLAYER'
      ? state.data.players.find((item) => +item.id === +participant.actor_id)
      : state.data.npcs.find((item) => +item.id === +participant.actor_id)
    : null;
  return { participant, token };
}

function focusCurrentParticipant() {
  const { token } = currentEncounterActor();
  if (!token) return toast('No hay un participante actual para centrar');
  centerToken(token);
}
function centerToken(token) {
  const bounds = canvas.getBoundingClientRect();
  let width = bounds.width;
  if (state.encounterOpen && matchMedia('(max-width:900px)').matches) {
    width = Math.max(50, $('#encounter-panel').getBoundingClientRect().left - bounds.left);
  }
  state.camera.x = width / 2 - (+token.x + 0.5) * cellSize * state.camera.z;
  state.camera.y = bounds.height / 2 - (+token.y + 0.5) * cellSize * state.camera.z;
  draw();
  publishDmView();
}

function renderEncounterBar() {
  const encounter = state.data?.encounter;
  const active = encounter && encounter.state !== 'OFF';
  const { participant, token } = currentEncounterActor();
  $('#player-turn-summary').hidden = state.user?.role !== 'PLAYER' || !active;
  const ownTurn =
    encounter?.state === 'RUNNING' &&
    participant?.actor_type === 'PLAYER' &&
    participant.state === 'ACTIVE' &&
    +token?.user_id === +state.user?.id;
  $('#player-turn-name').textContent = ownTurn
    ? `Tu momento, ${token.name || 'aventurero'}`
    : 'El destino se mueve';
  $('#encounter-current-focus').hidden = !active || state.encounterSelecting || !token;
  if (state.user?.role !== 'DM' || !active) return;
  $('#encounter-bar-round').textContent =
    encounter.state === 'RUNNING'
      ? `Ronda ${encounter.round_no || 0} · Turno ${encounter.turn_sequence || 0}`
      : encounter.state;
  $('#encounter-current-avatar').innerHTML = avatar(token);
  $('#encounter-bar-current').textContent = token
    ? token.name || token.user_name || participant.actor_type
    : encounter.state === 'PREPARING'
      ? 'Selecciona los participantes'
      : 'Sin turno actual';
  $('#encounter-bar-health').textContent =
    token?.health === undefined
      ? ''
      : `${displayHp(token.health, { kind: participant.actor_type })} / ${token.max_health ?? token.health} PV`;
  $('#encounter-current-focus').disabled = !token;
}

function renderRoundOrder() {
  const panel = $('#round-order-panel'),
    list = $('#round-order-list');
  if (!panel || !list) return;
  const encounter = state.data?.encounter,
    show =
      state.user.role === 'DM' &&
      encounter &&
      encounter.state !== 'OFF' &&
      !state.encounterSelecting;
  panel.hidden = !show;
  if (!show) {
    state.encounterTokenHighlight = null;
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
      const status =
        p.state === 'WAITING'
          ? ' · Esperando'
          : p.state === 'DEAD'
            ? ' · Muerto'
            : p.initiative === null
              ? ' · Sin iniciativa'
              : '';
      const hidden = p.actor_type === 'NPC' && !+token.visible ? ' · Oculto' : '';
      const current =
        encounter.current_participant_id && +encounter.current_participant_id === +p.id;
      const max =
        p.actor_type === 'PLAYER'
          ? (token.max_health ?? token.health)
          : (token.max_health ?? token.health);
      return {
        participantId: +p.id,
        kind: p.actor_type,
        tokenId: +token.id,
        token: { ...token, kind: p.actor_type },
        name: token.name || token.user_name || 'Ficha',
        status: (p.actor_type === 'PLAYER' ? 'Jugador' : 'NPC') + status + hidden,
        initiative: p.initiative ?? token.initiative ?? '—',
        hp: token.health === undefined ? '—' : displayHp(token.health, { kind: p.actor_type }),
        max: max ?? '—',
        current,
      };
    })
    .filter(Boolean);
  const highlighted = state.encounterTokenHighlight;
  if (
    highlighted &&
    !rows.some((row) => row.kind === highlighted.kind && row.tokenId === highlighted.id)
  )
    state.encounterTokenHighlight = null;
  updateList(
    list,
    rows.length
      ? rows
          .map((r) => {
            const previewed =
              state.encounterTokenHighlight?.kind === r.kind &&
              state.encounterTokenHighlight?.id === r.tokenId;
            return `<li class="b-turn-row"><button type="button" id="participant-${r.participantId}" data-participant-id="${r.participantId}" class="turn-card ${r.current ? 'current-round-token' : ''}${previewed ? ' encounter-preview-token' : ''}" aria-label="Resaltar ${esc(r.name)}${r.current ? ', turno actual' : ''}"><span class="turn-init">${esc(r.initiative)}</span>${avatar(r.token)}<span class="turn-name"><strong>${esc(r.name)}</strong><small>${r.current ? 'Turno actual · ' : ''}${esc(r.status)}</small></span><span class="turn-hp">${esc(r.hp)}<small>/ ${esc(r.max)}</small></span></button><button type="button" id="inspect-participant-${r.participantId}" data-inspect-participant="${r.participantId}" class="icon-button" aria-label="Inspeccionar ${esc(r.name)}">${icon('search')}</button></li>`;
          })
          .join('')
      : '<li class="empty-state">No hay fichas incluidas en el encuentro.</li>',
  );
  list.querySelectorAll('[data-inspect-participant]').forEach(
    (button) =>
      (button.onclick = () => {
        const row = rows.find((r) => r.participantId === +button.dataset.inspectParticipant);
        if (row) selectMapEntity(row.token);
      }),
  );
  list.querySelectorAll('[data-participant-id]').forEach((item) => {
    const row = rows.find((candidate) => candidate.participantId === +item.dataset.participantId);
    item.onclick = () => {
      state.encounterTokenHighlight = { kind: row.kind, id: row.tokenId };
      list
        .querySelectorAll('[data-participant-id]')
        .forEach((entry) => entry.classList.toggle('encounter-preview-token', entry === item));
      draw();
    };
    item.ondblclick = () => {
      state.encounterTokenHighlight = null;
      list
        .querySelectorAll('[data-participant-id]')
        .forEach((entry) => entry.classList.remove('encounter-preview-token'));
      selectMapEntity(row.token);
    };
  });
}

function movementRequestPath(request) {
  try {
    const path = typeof request.path === 'string' ? JSON.parse(request.path) : request.path || [];
    return Array.isArray(path) ? path : [];
  } catch {
    return [];
  }
}
function previewedMovementRequest() {
  if (state.user?.role !== 'DM') return null;
  const id = state.hoveredMovementPreview || state.selectedMovementPreview;
  return (state.data?.pendingMovements || []).find((request) => +request.id === +id) || null;
}
function renderMovementRequests() {
  const requests = state.data?.pendingMovements || [];
  updateList(
    $('#movement-requests'),
    requests.length
      ? requests
          .map((m) => {
            const player = state.data.players.find((p) => +p.id === +m.scenario_player_id);
            return `<button type="button" id="request-${+m.id}" data-movement-id="${+m.id}" class="b-request-item ${+m.id === +state.selectedMovementPreview ? 'is-current' : ''}">${avatar(player)}<span><strong>${esc(m.character_name || m.user_name)}</strong></span>${icon('chevron')}</button>`;
          })
          .join('')
      : '<div class="empty-state"><h3>Todo al día</h3><p>No hay solicitudes pendientes.</p></div>',
  );
  $$('[data-movement-id]').forEach(
    (button) =>
      (button.onclick = () => {
        const id = +button.dataset.movementId;
        if (!state.data?.pendingMovements.some((m) => +m.id === id)) return;
        navigate('map');
        state.selectedMovementPreview = id;
        state.hoveredMovementPreview = null;
        setRequestsOpen(false);
        renderMovementRequests();
        draw();
        canvas.focus({ preventScroll: true });
      }),
  );
  const current = requests.find((m) => +m.id === +state.selectedMovementPreview);
  $('#movement-review-name').textContent = current
    ? `${current.character_name || current.user_name} · ${current.reason || 'Movimiento pendiente'}`
    : '';
  for (const id of ['movement-approve', 'movement-reject'])
    $(`#${id}`).disabled =
      !current || !!state.pendingMovementRequestId || state.ws?.readyState !== 1;
  refreshInterface();
}
function renderDetails() {
  if (!state.data) return;
  const s = state.data.scenario;
  $('#scene-name').textContent = s.name;
  $('#scenario-title').textContent = s.name;
  $('#scenario-status').textContent =
    `${s.width} × ${s.height} · ${+s.active ? 'Activo' : 'En preparación'}`;
  $('#toggle-active').textContent = +s.active ? 'Desactivar' : 'Activar';
  renderEncounterControls();
  renderDiceRollLog();
  renderMovementRequests();
  updateActivityBadge();
  const token = inspectedToken();
  if (token) inspect(token, true);
  else if (selectionCount() && !state.encounterSelecting) renderEntitySelection(true);
  refreshInterface();
  draw();
}
$('#movement-review-close').onclick = () => {
  state.selectedMovementPreview = null;
  refreshInterface();
  draw();
};
for (const [id, type] of [
  ['movement-approve', 'movement.approve'],
  ['movement-reject', 'movement.reject'],
]) {
  $(`#${id}`).onclick = () => {
    const movementId = state.selectedMovementPreview;
    if (!movementId || state.pendingMovementRequestId) return;
    state.pendingMovementRequestId = command(type, { movementId });
    renderMovementRequests();
  };
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
const staticImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
function openImagePicker(target, allowGif = false) {
  uploadTarget = target;
  $('#image-file').accept = [...staticImageTypes, ...(allowGif ? ['image/gif'] : [])].join(',');
  $('#image-file').click();
}
$('#upload-background').onclick = () => openImagePicker('background', true);

$('#image-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    toast('La imagen supera el límite de 15 MB');
    e.target.value = '';
    return;
  }
  const allowedTypes =
      uploadTarget === 'background' ? [...staticImageTypes, 'image/gif'] : staticImageTypes,
    detectedType =
      file.type || (uploadTarget === 'background' && /\.gif$/i.test(file.name) ? 'image/gif' : '');
  if (!allowedTypes.includes(detectedType)) {
    toast(
      uploadTarget === 'background'
        ? 'Usa una imagen JPEG, PNG, WebP o GIF'
        : 'Usa una imagen JPEG, PNG o WebP',
    );
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
$('#encounter-current-focus').onclick = () => {
  focusCurrentParticipant();
  activateDmPanelTab('encounter', true);
};
$('#encounter-prepare').onclick = beginEncounterDraft;
$('#encounter-prepare-another').onclick = beginEncounterDraft;
$('#encounter-cancel').onclick = cancelEncounterDraft;
$('#encounter-start').onclick = () => handleEncounterStart();
$('#encounter-log').onclick = () => downloadEncounterLog();
$('#encounter-stop').onclick = async () => {
  const confirmed = await confirmToast(
    '¿Terminar el encounter?',
    'Se terminará el encounter actual. Este cambio es irreversible. ¿Deseas continuar?',
  );
  if (confirmed) {
    $('#encounter-actions-menu').open = false;
    command('encounter.stop');
  }
};
$('#restart-round').onclick = async () => {
  const confirmed = await confirmToast(
    '¿Reiniciar la ronda?',
    'Se reiniciará la ronda actual y se limpiarán las esperas. Este cambio es irreversible. ¿Deseas continuar?',
  );
  if (confirmed) {
    $('#encounter-actions-menu').open = false;
    command('encounter.restart_round');
  }
};
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
let canvasViewSize = null;
function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = devicePixelRatio || 1,
    previous = canvasViewSize,
    playerCenter =
      ['DM', 'PLAYER'].includes(state.user?.role) &&
      state.data &&
      previous?.width &&
      previous?.height
        ? {
            x: (previous.width / 2 - state.camera.x) / (cellSize * state.camera.z),
            y: (previous.height / 2 - state.camera.y) / (cellSize * state.camera.z),
          }
        : null;
  canvasViewSize = { width: r.width, height: r.height };
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.user?.role === 'GUEST' && state.followCamera) {
    const z = Math.min(3, Math.max(0.25, +state.followCamera.zoom || 1));
    state.camera.z = z;
    state.camera.x = r.width / 2 - (+state.followCamera.centerX || 0) * cellSize * z;
    state.camera.y = r.height / 2 - (+state.followCamera.centerY || 0) * cellSize * z;
  } else if (playerCenter) {
    state.camera.x = r.width / 2 - playerCenter.x * cellSize * state.camera.z;
    state.camera.y = r.height / 2 - playerCenter.y * cellSize * state.camera.z;
  }
  draw();
}
function foggedCellSet() {
  return new Set((state.data?.foggedCells || []).map((cell) => `${+cell.x},${+cell.y}`));
}
function visibleCellBounds() {
  const scenario = state.data?.scenario,
    fogged = foggedCellSet();
  if (!scenario || !fogged.size) return null;
  let minX = +scenario.width,
    minY = +scenario.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < +scenario.height; y++)
    for (let x = 0; x < +scenario.width; x++)
      if (!fogged.has(`${x},${y}`)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
function fitVisibleCellsForPlayers() {
  if (state.user?.role !== 'PLAYER') return;
  const bounds = visibleCellBounds(),
    r = canvas.getBoundingClientRect();
  if (!bounds || !r.width || !r.height) return;
  const z = Math.min(r.width / (bounds.width * cellSize), r.height / (bounds.height * cellSize));
  state.camera.z = Math.min(3, Math.max(0.25, z));
  state.camera.x =
    (r.width - bounds.width * cellSize * state.camera.z) / 2 - bounds.x * cellSize * state.camera.z;
  state.camera.y =
    (r.height - bounds.height * cellSize * state.camera.z) / 2 -
    bounds.y * cellSize * state.camera.z;
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
  $('#path-actions').hidden = state.mode !== 'path' || !state.path.length;
  if (!state.data || !canvas.width || state.page !== 'map') return;
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  const s = state.data.scenario,
    z = state.camera.z,
    cs = cellSize * z,
    origin = worldToScreen(0, 0),
    fogged = foggedCellSet(),
    restrictVisibility = state.user?.role !== 'DM' && fogged.size > 0;
  if (restrictVisibility) {
    ctx.save();
    ctx.beginPath();
    for (let y = 0; y < +s.height; y++)
      for (let x = 0; x < +s.width; x++)
        if (!fogged.has(`${x},${y}`)) {
          const p = worldToScreen(x, y);
          ctx.rect(p.x, p.y, cs, cs);
        }
    ctx.clip();
  }
  if (s.background_asset_id) {
    const img = image(+s.background_asset_id);
    if (img.complete && img.naturalWidth)
      ctx.drawImage(img, origin.x, origin.y, +s.width * cs, +s.height * cs);
  } else {
    ctx.fillStyle = '#291c24';
    ctx.fillRect(origin.x, origin.y, +s.width * cs, +s.height * cs);
  }
  ctx.fillStyle = '#51302c99';
  state.data.blocked.forEach((c) => {
    const p = worldToScreen(+c.x, +c.y);
    ctx.fillRect(p.x, p.y, cs, cs);
  });
  if (state.mode === 'path') drawAdjacentCells(cs);
  ctx.strokeStyle = state.gridVisible ? 'rgba(237, 200, 165, 0.5)' : 'transparent';
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
  if (fogged.size && state.user?.role === 'DM') drawFoggedCells(cs, fogged);
  if (state.objectDraft) drawObjectDraft(cs);
  if (state.selectionDraft) drawSelectionDraft(cs);
  state.path.forEach((c, i) => {
    const p = worldToScreen(c.x, c.y);
    ctx.fillStyle = '#efaa7844';
    ctx.fillRect(p.x + 2, p.y + 2, cs - 4, cs - 4);
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(10, 14 * z)}px sans-serif`;
    ctx.fillText(String(i + 1), p.x + 5, p.y + 17 * z);
  });
  drawPendingMovementPath(cs);
  state.data.objects.forEach((object) => drawMapObject({ ...object, kind: 'OBJECT' }, cs));
  const groups = groupTokens();
  for (const [, tokens] of groups) drawGroup(tokens, cs);
  drawFreehand();
  if (state.user?.role === 'DM') {
    ctx.save();
    ctx.strokeStyle = '#efaa78';
    ctx.fillStyle = '#291c24';
    ctx.lineWidth = 1;
    for (const note of state.data.cellNotes || []) {
      const point = worldToScreen(+note.x, +note.y);
      const size = Math.max(10, 14 * z);
      ctx.fillRect(point.x + 4, point.y + 4, size, size);
      ctx.strokeRect(point.x + 4, point.y + 4, size, size);
      ctx.beginPath();
      ctx.moveTo(point.x + 7, point.y + 8);
      ctx.lineTo(point.x + size, point.y + 8);
      ctx.moveTo(point.x + 7, point.y + 12);
      ctx.lineTo(point.x + size, point.y + 12);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawVisibilityEffects(cs);
  drawEncounterTokenHighlight(cs);
  if (restrictVisibility) ctx.restore();
  scheduleAnimatedMapRedraw(s.background_mime === 'image/gif');
}
function scheduleAnimatedMapRedraw(animated) {
  if (!animated) {
    clearTimeout(animatedMapTimer);
    animatedMapTimer = null;
    return;
  }
  if (animatedMapTimer) return;
  animatedMapTimer = setTimeout(
    () => {
      animatedMapTimer = null;
      requestAnimationFrame(draw);
    },
    document.hidden ? 250 : 50,
  );
}
function drawEncounterTokenHighlight(cs) {
  const highlighted = state.encounterTokenHighlight;
  if (!highlighted || state.user?.role !== 'DM') return;
  const tokens = highlighted.kind === 'PLAYER' ? state.data.players : state.data.npcs,
    token = tokens.find((item) => +item.id === +highlighted.id);
  if (!token || (highlighted.kind === 'PLAYER' && !+token.placed)) return;
  const center = worldToScreen(+token.x + 0.5, +token.y + 0.5),
    radius = cs * 0.6;
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.setLineDash([Math.max(5, cs * 0.1), Math.max(4, cs * 0.07)]);
  ctx.lineWidth = Math.max(2, cs * 0.045);
  ctx.strokeStyle = '#efaa78';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = Math.max(3, cs * 0.06);
  ctx.stroke();
  ctx.restore();
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
  if (canUsePlayerCharacters()) {
    const own = controlledPlayer();
    if (own?.drawing_color) return own.drawing_color;
    const ch =
      state.bootstrap?.characters?.find((c) => +c.id === +state.selectedCharacter) ||
      state.bootstrap?.characters?.[0];
    if (ch?.drawing_color) return ch.drawing_color;
  }
  return fallbackDrawingColor(state.user?.id);
}
function drawPendingMovementPath(cs) {
  const request = previewedMovementRequest();
  if (!request) return;
  const path = movementRequestPath(request);
  if (!path.length) return;
  const player = state.data.players.find((item) => +item.id === +request.scenario_player_id),
    selectedColor = player?.token_color,
    color =
      selectedColor && selectedColor !== 'transparent'
        ? selectedColor
        : drawingColorForToken(player),
    points = [
      player ? { x: +player.x, y: +player.y } : { x: +path[0].x, y: +path[0].y },
      ...path.map((cell) => ({ x: +cell.x, y: +cell.y })),
    ],
    centers = points.map((cell) => worldToScreen(cell.x + 0.5, cell.y + 0.5));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path.forEach((cell) => {
    const p = worldToScreen(+cell.x, +cell.y);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.fillRect(p.x + 3, p.y + 3, cs - 6, cs - 6);
  });
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#090706';
  ctx.lineWidth = Math.max(7, cs * 0.16);
  ctx.beginPath();
  centers.forEach((point, index) =>
    index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
  );
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(8, cs * 0.18);
  ctx.lineWidth = Math.max(4, cs * 0.09);
  ctx.stroke();
  ctx.shadowBlur = 0;
  centers.forEach((point, index) => {
    const end = index === centers.length - 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(6, cs * (end ? 0.16 : 0.11)), 0, Math.PI * 2);
    ctx.fillStyle = end ? color : '#17130f';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cs * 0.04);
    ctx.stroke();
    if (index > 0) {
      ctx.fillStyle = end ? '#17130f' : '#ffffff';
      ctx.font = `bold ${Math.max(10, cs * 0.18)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index), point.x, point.y);
    }
  });
  const destination = centers.at(-1);
  ctx.font = `bold ${Math.max(11, cs * 0.2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 5;
  ctx.fillText(
    request.character_name || request.user_name || 'Movimiento pendiente',
    destination.x,
    destination.y - Math.max(10, cs * 0.2),
  );
  ctx.restore();
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
function drawFoggedCells(cs, fogged) {
  ctx.save();
  ctx.fillStyle = '#22172080';
  ctx.strokeStyle = '#efaa7840';
  ctx.lineWidth = Math.max(1, cs * 0.025);
  for (const key of fogged) {
    const [x, y] = key.split(',').map(Number),
      p = worldToScreen(x, y);
    ctx.fillRect(p.x, p.y, cs, cs);
    ctx.strokeRect(p.x, p.y, cs, cs);
  }
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
function cellsInArea(area) {
  const cells = [];
  for (let y = area.y; y < area.y + area.heightCells; y++)
    for (let x = area.x; x < area.x + area.widthCells; x++) cells.push({ x, y });
  return cells;
}
function applyPaintCells(cells, add, mode) {
  const collection = mode === 'fog' ? 'foggedCells' : 'blocked',
    changed = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  if (add) {
    const existing = new Set(state.data[collection].map((cell) => `${+cell.x},${+cell.y}`));
    for (const cell of cells)
      if (!existing.has(`${cell.x},${cell.y}`)) state.data[collection].push(cell);
  } else {
    state.data[collection] = state.data[collection].filter(
      (cell) => !changed.has(`${+cell.x},${+cell.y}`),
    );
  }
}
function drawSelectionDraft(cs) {
  const area = selectionDraftArea();
  if (!area) return;
  const p = worldToScreen(area.x, area.y),
    restricting = state.drag?.paintRectangle && state.drag.paintAdd;
  ctx.save();
  ctx.fillStyle = restricting ? '#e1856938' : '#efaa7828';
  ctx.strokeStyle = restricting ? '#e18569' : '#efaa78';
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
    .filter((x) => +x.placed)
    .forEach((x) => {
      const pos = animatedPos(x);
      push({ ...x, kind: 'PLAYER', renderX: pos.x, renderY: pos.y });
    });
  return m;
}
function tokenBaseSize() {
  return innerWidth >= 1700
    ? 53
    : innerWidth <= 480
      ? 34
      : innerWidth <= 760
        ? 38
        : innerWidth <= 1000
          ? 42
          : 46;
}
function drawGroup(ts, cs) {
  const base = worldToScreen(+(ts[0].renderX ?? ts[0].x), +(ts[0].renderY ?? ts[0].y)),
    many = ts.length >= 4,
    shown = many ? [ts[0]] : ts;
  shown.forEach((t, i) => {
    const cols = ts.length > 1 ? 2 : 1,
      row = Math.floor(i / cols),
      col = i % cols,
      size = tokenBaseSize() * state.camera.z * (ts.length > 1 ? 0.72 : 1),
      cx = base.x + cs * (ts.length === 1 ? 0.5 : 0.28 + 0.44 * col),
      cy = base.y + cs * (ts.length === 1 ? 0.5 : 0.28 + 0.44 * row);
    ctx.save();
    if (t.kind === 'NPC' && t.visible !== undefined && !+t.visible) ctx.globalAlpha = 0.65;
    const current = isCurrent(t),
      inDraft = state.encounterSelecting && state.encounterDraft?.has(`${t.kind}:${t.id}`),
      selected =
        (t.kind === 'NPC' && state.selectedNpcs.has(+t.id)) ||
        (t.kind === 'PLAYER' && state.selectedPlayers.has(+t.id)) ||
        (t.kind === 'PLAYER' &&
          canUsePlayerCharacters() &&
          +t.user_id === +state.user.id &&
          +t.character_id === +state.selectedCharacter);
    if (current) {
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 + 9 * state.camera.z, 0, Math.PI * 2);
      ctx.strokeStyle = '#e5a274';
      ctx.lineWidth = 1;
      ctx.stroke();
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
        const fill = t.kind === 'PLAYER' ? t.token_color || '#37242c' : '#49313a';
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
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.strokeStyle = t.kind === 'NPC' ? '#b46d78' : '#c6a17b';
      ctx.lineWidth = Math.max(1, 2 * state.camera.z);
      if (t.kind === 'NPC' && t.visible !== undefined && !+t.visible) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected || inDraft) {
        ctx.strokeStyle = inDraft ? '#e8b988' : '#efaa78';
        ctx.lineWidth = Math.max(3, cs * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (+t.health <= 0 && state.user.role === 'DM') {
        ctx.strokeStyle = '#d88699';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - size / 3, cy - size / 3);
        ctx.lineTo(cx + size / 3, cy + size / 3);
        ctx.moveTo(cx + size / 3, cy - size / 3);
        ctx.lineTo(cx - size / 3, cy + size / 3);
        ctx.stroke();
      }
    }
    ctx.restore();
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
    size = tokenBaseSize() * state.camera.z,
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
  const blocked = new Set((state.data?.blocked || []).map(blockedKey));
  if (state.user?.role === 'PLAYER') for (const key of foggedCellSet()) blocked.add(key);
  return blocked;
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
  ctx.fillStyle = '#efaa7812';
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
function setMode(m, keepPendingAction = false) {
  if (state.drag?.paintMode) {
    clearTimeout(state.drag.longPressTimer);
    cancelCellPaint();
    state.drag = null;
    state.pointers.clear();
    state.pinch = null;
  }
  if (!keepPendingAction) {
    state.cloneSource = null;
    state.moveToken = null;
  }
  state.mode = m;
  state.objectDraft = null;
  state.selectionDraft = null;
  $$('[data-mode]').forEach((x) => {
    x.classList.toggle('active', x.dataset.mode === m);
    x.setAttribute('aria-pressed', String(x.dataset.mode === m));
  });
  const help = {
    select: 'Selecciona fichas · Alt + arrastre: selección múltiple',
    fog: 'Revelar: izquierdo · ocultar: derecho · Ctrl: rectángulo · táctil: mantén pulsado para ocultar',
    terrain:
      'Transitable: izquierdo · bloquear: derecho · Ctrl: rectángulo · táctil: mantén pulsado para bloquear',
    note: 'Toca una casilla para editar su nota privada',
    npc: 'Toca una casilla para añadir un NPC',
    object: 'Arrastra para definir el área del objeto',
    path: 'Elige el recorrido de tu personaje',
    place: 'Toca una casilla para colocar el personaje',
    paste: 'Toca la casilla de anclaje del grupo',
  };
  $('#map-hint').textContent = help[m] || '';
  $('#map-hint').hidden = !help[m];
  refreshInterface();
  if (m !== 'path') state.path = [];
  updatePasteControl();
  draw();
}
function updatePasteControl() {
  const button = $('#paste-tokens'),
    count = state.tokenClipboard?.npcIds?.length || 0,
    available = state.user?.role === 'DM' && count >= 2;
  if (!button) return;
  button.hidden = !available;
  button.disabled =
    !state.data || !!state.pendingPasteRequestId || state.ws?.readyState !== WebSocket.OPEN;
  button.innerHTML = icon('copy');
  button.title = available ? `Pegar ${count} NPCs` : 'Pegar grupo';
  button.setAttribute('aria-label', button.title);
  button.classList.toggle('active', available && state.mode === 'paste');
}
$('#paste-tokens').onclick = () => {
  if (!state.tokenClipboard?.npcIds?.length || !state.data) return;
  setMode('paste');
  toast('Toca la casilla donde comenzará el grupo copiado');
};
function setDrawingMode(on) {
  state.cloneSource = null;
  state.moveToken = null;
  state.mode = on ? 'draw' : 'pan';
  state.drawStroke = null;
  $$('[data-main-tool]').forEach(
    (x) =>
      (x.hidden =
        on ||
        (x.classList.contains('dm-only') && state.user.role !== 'DM') ||
        (x.classList.contains('player-only') && state.user.role !== 'PLAYER') ||
        (x.classList.contains('character-owner-only') && !canUsePlayerCharacters())),
  );
  $$('[data-draw-tool]').forEach(
    (x) => (x.hidden = !on || (+x.classList.contains('dm-only') && state.user.role !== 'DM')),
  );
  $$('[data-mode]').forEach((x) => x.classList.toggle('active', !on && x.dataset.mode === 'pan'));
  $('#draw-mode').classList.toggle('active', on);
  $('#draw-mode').setAttribute('aria-pressed', String(on));
  $('#map-hint').hidden = !on;
  $('#map-hint').textContent = 'Dibuja sobre el mapa. Al salir se borran tus trazos.';
  refreshInterface();
  updatePasteControl();
  updateDrawButtons();
  if (!on) sendDraw({ op: 'clearUser' });
  draw();
}
function updateDrawButtons() {
  $('#draw-pen').classList.toggle('active', state.drawTool === 'pen');
  $('#draw-eraser').classList.toggle('active', state.drawTool === 'eraser');
  $('#draw-size-label').textContent = String(state.drawSize);
  $('#draw-size-label').setAttribute('aria-label', `Tamaño del lápiz: ${state.drawSize}`);
}
$('#draw-mode').onclick = () => setDrawingMode(true);
$('#toggle-grid').onclick = () => {
  state.gridVisible = !state.gridVisible;
  $('#toggle-grid').setAttribute('aria-pressed', String(state.gridVisible));
  draw();
};
$('#cancel-path').onclick = () => {
  state.path = [];
  refreshInterface();
  draw();
};
$$('.tool-group').forEach((group) => {
  group.ontoggle = () => {
    if (!group.open) return;
    $$('.tool-group').forEach((other) => {
      if (other !== group) other.open = false;
    });
  };
  group
    .querySelectorAll('button')
    .forEach((button) => button.addEventListener('click', () => (group.open = false)));
});
document.addEventListener('pointerdown', (event) => {
  const menu = $('#encounter-actions-menu');
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
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
$('#clear-map-fog').onclick = async () => {
  if (!state.data?.foggedCells?.length) {
    toast('El mapa completo ya está revelado');
    return;
  }
  const confirmed = await openForm({
    title: 'Revelar todo el mapa',
    description: '¿Seguro que quieres quitar la niebla de todas las casillas?',
    submitText: 'Sí, revelar todo',
  });
  if (confirmed) command('map.fog.clear');
};
canvas.addEventListener('keydown', (event) => {
  if (
    state.user?.role === 'GUEST' ||
    !state.data ||
    event.target !== canvas ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    event.preventDefault();
  if (['+', '='].includes(event.key)) zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
  else if (event.key === '-') zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
  else if (event.key === '0') {
    const bounds = canvas.getBoundingClientRect(),
      s = state.data.scenario;
    state.camera.z = Math.min(
      3,
      Math.max(
        0.5,
        Math.min(bounds.width / (+s.width * cellSize), bounds.height / (+s.height * cellSize)) *
          0.9,
      ),
    );
    state.camera.x = (bounds.width - +s.width * cellSize * state.camera.z) / 2;
    state.camera.y = (bounds.height - +s.height * cellSize * state.camera.z) / 2;
    draw();
    publishDmView();
  } else if (event.key.startsWith('Arrow')) {
    state.camera.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
    state.camera.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
    draw();
    publishDmView();
  }
});
function zoomAt(f, x, y) {
  if (state.user?.role === 'GUEST') return;
  const old = state.camera.z,
    n = Math.min(3, Math.max(0.5, old * f));
  state.camera.x = x - ((x - state.camera.x) * n) / old;
  state.camera.y = y - ((y - state.camera.y) * n) / old;
  state.camera.z = n;

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
function isCellPaintMode(mode) {
  return mode === 'fog' || mode === 'terrain';
}
function cancelCellPaint() {
  const hadPreview = state.paint.size > 0;
  state.paint.clear();
  if (hadPreview && state.scenarioId && state.ws?.readyState === 1) subscribe();
}
canvas.onpointerdown = (e) => {
  if (!state.data || state.user?.role === 'GUEST') return;
  canvas.focus({ preventScroll: true });
  const forcePan = e.button === 1,
    forceSelect =
      state.user.role === 'DM' && e.pointerType === 'mouse' && e.button === 0 && e.altKey,
    mode = forceSelect ? 'select' : state.mode,
    cellPaint = isCellPaintMode(mode) && !forcePan,
    paintRectangle = cellPaint && e.pointerType !== 'touch' && e.ctrlKey;
  if (cellPaint) {
    if (state.user.role !== 'DM' || ![0, 2].includes(e.button)) return;
    if (state.ws?.readyState !== 1) return toast('Sin conexión');
  }
  if (forcePan || forceSelect || cellPaint) e.preventDefault();
  if (forceSelect) state.lastTap = null;
  canvas.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (state.pointers.size === 1) {
    state.paint.clear();
    state.drag = {
      x: e.offsetX,
      y: e.offsetY,
      cx: state.camera.x,
      cy: state.camera.y,
      moved: false,
      forcePan,
      forceSelect,
      pointerId: e.pointerId,
      scenarioId: state.scenarioId,
      paintMode: cellPaint ? mode : null,
      paintAdd: e.pointerType !== 'touch' && e.button === 2,
      paintRectangle,
      longPressTimer: null,
    };
    if (cellPaint && e.pointerType === 'touch')
      state.drag.longPressTimer = setTimeout(() => {
        const drag = state.drag;
        if (
          !drag ||
          drag.pointerId !== e.pointerId ||
          drag.moved ||
          drag.multiTouch ||
          state.mode !== mode
        )
          return;
        drag.paintAdd = true;
        state.paint.clear();
        paintAt(drag.x, drag.y, true);
        toast(mode === 'fog' ? 'Ocultando casillas…' : 'Bloqueando casillas…');
      }, 500);
    if (paintRectangle) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft = { start: cell, current: cell };
        draw();
      }
    } else if (!forcePan && mode === 'draw') {
      startDrawStroke(e.offsetX, e.offsetY);
      draw();
    } else if (!forcePan && mode === 'object') {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.objectDraft = { start: cell, current: cell };
        draw();
      }
    } else if (!forcePan && mode === 'select' && state.user.role === 'DM') {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft = { start: cell, current: cell };
        draw();
      }
    }
  }
  if (state.pointers.size > 1 && state.drag) {
    clearTimeout(state.drag.longPressTimer);
    state.drag.longPressTimer = null;
    state.drag.multiTouch = true;
    if (state.drag.paintMode) {
      cancelCellPaint();
      state.selectionDraft = null;
      draw();
    }
  }
  if (forcePan) canvas.classList.add('grabbing');
  if (cellPaint && !paintRectangle && state.pointers.size === 1)
    paintAt(e.offsetX, e.offsetY, state.drag.paintAdd);
};
canvas.addEventListener('auxclick', (e) => {
  if (e.button === 1) e.preventDefault();
});
canvas.addEventListener('contextmenu', (e) => {
  if (isCellPaintMode(state.mode)) e.preventDefault();
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
  if (state.drag && !state.drag.multiTouch) {
    const mode = state.drag.forceSelect ? 'select' : state.mode,
      dx = e.offsetX - state.drag.x,
      dy = e.offsetY - state.drag.y;
    if (Math.hypot(dx, dy) > 5) {
      state.drag.moved = true;
      if (state.drag.longPressTimer) clearTimeout(state.drag.longPressTimer);
      state.drag.longPressTimer = null;
    }
    const touchMapPan =
      e.pointerType === 'touch' &&
      (['path', 'place', 'paste'].includes(state.mode) || state.moveToken);
    if (state.drag.forcePan || mode === 'pan' || touchMapPan) {
      if (state.user.role !== 'GUEST') {
        state.camera.x = state.drag.cx + dx;
        state.camera.y = state.drag.cy + dy;
        draw();
        publishDmView();
      }
    } else if (state.drag.paintRectangle && state.selectionDraft) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft.current = cell;
        draw();
      }
    } else if (mode === 'object' && state.objectDraft) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.objectDraft.current = cell;
        draw();
      }
    } else if (mode === 'select' && state.selectionDraft) {
      const cell = screenToCell(e.offsetX, e.offsetY);
      if (validCell(cell)) {
        state.selectionDraft.current = cell;
        draw();
      }
    } else if (mode === 'draw' && state.drawStroke) addDrawPoint(e.offsetX, e.offsetY);
    else if (!state.drag.paintRectangle && isCellPaintMode(mode))
      paintAt(e.offsetX, e.offsetY, state.drag.paintAdd);
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
    mode = was?.forceSelect ? 'select' : state.mode,
    selectionOnly = !!was?.forceSelect,
    draft = state.objectDraft,
    selection = state.selectionDraft,
    touchTap = was && isTouchTap(e, was) && ['place', 'path', 'npc', 'paste'].includes(mode);
  state.pointers.delete(e.pointerId);
  if (was?.longPressTimer) clearTimeout(was.longPressTimer);
  if (state.pointers.size < 2) state.pinch = null;
  if (was?.multiTouch) {
    state.objectDraft = null;
    state.selectionDraft = null;
    state.drag = null;
    cancelCellPaint();
    draw();
    return;
  }
  if (was?.forcePan) {
    canvas.classList.remove('grabbing');
  } else if (
    e.type === 'pointercancel' ||
    (was?.paintMode && was.scenarioId !== state.scenarioId)
  ) {
    state.objectDraft = null;
    state.selectionDraft = null;
    cancelCellPaint();
    draw();
  } else if (mode === 'draw' && state.drawStroke) {
    finishDrawStroke();
  } else if (was?.paintMode) {
    const area = selectionDraftArea(),
      cells = was.paintRectangle ? (area ? cellsInArea(area) : []) : [...state.paint.values()],
      fogPaint = was.paintMode === 'fog';
    state.selectionDraft = null;
    if (cells.length) {
      const requestId = command(fogPaint ? 'map.fog.paint' : 'map.cells.paint', {
        cells,
        ...(fogPaint ? { fogged: was.paintAdd } : { blocked: was.paintAdd }),
      });
      if (requestId && was.paintRectangle) applyPaintCells(cells, was.paintAdd, was.paintMode);
    }
    state.paint.clear();
    draw();
  } else if (draft && mode === 'object') {
    const area = objectDraftArea();
    state.objectDraft = null;
    draw();
    if (area) void createObjectArea(area);
  } else if (selection && mode === 'select') {
    const area = selectionDraftArea();
    if (was?.moved && area) {
      state.selectionDraft = null;
      selectEntitiesInArea(area);
    } else {
      state.selectionDraft = null;
      draw();
      tap(e.offsetX, e.offsetY, {
        additive: selectionOnly || e.shiftKey || e.ctrlKey || e.metaKey,
        selectionOnly,
      });
    }
  } else if (was && (!was.moved || touchTap)) {
    if (!selectionOnly && maybeDoubleTap(e, was)) {
      if (!state.pointers.size) state.drag = null;
      return;
    }
    tap(e.offsetX, e.offsetY, {
      additive: selectionOnly || e.shiftKey || e.ctrlKey || e.metaKey,
      selectionOnly,
    });
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
    id: generateRequestId(),
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
function paintAt(x, y, add = false) {
  const cell = screenToCell(x, y);
  if (!validCell(cell)) return;
  state.paint.set(`${cell.x},${cell.y}`, cell);
  const collection = state.mode === 'fog' ? 'foggedCells' : 'blocked',
    exists = state.data[collection].some((item) => +item.x === cell.x && +item.y === cell.y);
  if (add && !exists) state.data[collection].push(cell);
  if (!add && exists)
    state.data[collection] = state.data[collection].filter(
      (item) => +item.x !== cell.x || +item.y !== cell.y,
    );
  draw();
}
function tap(x, y, options = {}) {
  if (!state.data || state.user?.role === 'GUEST') return;
  const c = screenToCell(x, y),
    selectionOnly = state.user.role === 'DM' && !!options.selectionOnly,
    mode = selectionOnly ? 'select' : state.mode;
  if (!validCell(c)) return;
  if (!selectionOnly && mode === 'paste' && state.tokenClipboard) {
    const requestId = command('tokens.paste', { ...state.tokenClipboard, ...c });
    if (!requestId) return;
    state.pendingPasteRequestId = requestId;
    setMode('pan');
    toast('Pegando personajes…');
    return;
  }
  if (!selectionOnly && state.moveToken) {
    const t = state.moveToken;
    state.moveToken = null;
    command('token.move_dm', { kind: t.kind, id: +t.id, ...c });
    return;
  }
  if (!selectionOnly && state.cloneSource && state.user.role === 'DM' && mode === 'select') {
    command('token.clone', { kind: state.cloneSource.kind, id: +state.cloneSource.id, ...c });
    return;
  }
  if (mode === 'note' && state.user.role === 'DM') {
    void editCellNote(c);
    return;
  }
  if (
    state.encounterSelecting &&
    state.user.role === 'DM' &&
    mode === 'select' &&
    !state.pendingTurn
  ) {
    const tokens = tokensAtCell(c).filter(
      (t) =>
        (t.kind === 'PLAYER' && +t.placed) || (t.kind === 'NPC' && +t.visible && +t.health > 0),
    );
    if (tokens.length) {
      const t = tokens[0],
        key = `${t.kind}:${t.id}`;
      toggleSetItem(state.encounterDraft, key);
      renderEncounterDraft();
      draw();
      toast(`${state.encounterDraft.has(key) ? 'Incluido' : 'Excluido'}: ${t.name || t.user_name}`);
    }
    return;
  }
  if (mode === 'path') {
    if (state.user.role === 'PLAYER' && foggedCellSet().has(blockedKey(c))) {
      toast('No puedes trazar un camino por casillas ocultas por la niebla.');
      return;
    }
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
  if (mode === 'place') {
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
  if (mode === 'npc') {
    void createNpcAt(c);
    return;
  }
  if (mode === 'object') return;
  const tokens = tokensAtCell(c),
    stickySelect = state.user.role === 'DM' && mode === 'select';
  if (tokens.length === 1) selectMapEntity(tokens[0], stickySelect || !!options.additive);
  else if (tokens.length > 1) showCellMenu(tokens, x, y, stickySelect || !!options.additive);
  else if (state.user.role === 'DM' && mode === 'select' && !selectionOnly) {
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
    toast(
      state.user.role === 'DM'
        ? 'Este personaje ya está colocado en el escenario.'
        : 'Ya colocaste este personaje en este escenario. Pide al DM que lo mueva.',
    );
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
    let rotation = 0;
    const setRotation = (v) => {
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
  refreshInterface();
  draw();
};
function beginCharacterPlacement() {
  if (!state.data) return toast('Abre un escenario antes de colocar el personaje');
  if (!state.selectedCharacter) return toast('Selecciona un personaje en el menú');
  if (state.data?.players?.some((p) => +p.character_id === +state.selectedCharacter && +p.placed))
    return toast(
      state.user.role === 'DM'
        ? 'Este personaje ya está colocado en el escenario.'
        : 'Ya colocaste este personaje en este escenario. Pide al DM que lo mueva.',
    );
  document.body.classList.remove('menu-open');
  setMode('place');
  toast('Toca una casilla para colocar el personaje');
}

$('#delay-turn').onclick = async () => {
  if (!selectedCharacterHasTurn()) return toast('El personaje seleccionado no tiene el turno');
  const options = state.data.participants.filter(
    (p) =>
      +p.id !== +state.data.encounter?.current_participant_id &&
      p.state === 'ACTIVE' &&
      p.initiative !== null,
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
    if (+p.placed && +p.x === c.x && +p.y === c.y) tokens.push({ ...p, kind: 'PLAYER' });
  return tokens;
}
function toggleSetItem(set, id) {
  set.has(id) ? set.delete(id) : set.add(id);
}
function selectEntitiesInArea(area) {
  if (state.encounterSelecting && state.user.role === 'DM') {
    if (state.pendingTurn) return;
    for (const p of state.data.players)
      if (
        +p.placed &&
        +p.x >= area.x &&
        +p.x < area.x + area.widthCells &&
        +p.y >= area.y &&
        +p.y < area.y + area.heightCells
      )
        toggleSetItem(state.encounterDraft, `PLAYER:${p.id}`);
    for (const n of state.data.npcs)
      if (
        +n.visible &&
        +n.health > 0 &&
        +n.x >= area.x &&
        +n.x < area.x + area.widthCells &&
        +n.y >= area.y &&
        +n.y < area.y + area.heightCells
      )
        toggleSetItem(state.encounterDraft, `NPC:${n.id}`);
    renderEncounterDraft();
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
    state.user?.role === 'GUEST' ||
    (state.user?.role === 'PLAYER' &&
      (entity.kind !== 'PLAYER' || +entity.user_id !== +state.user.id))
  )
    return;
  if (state.encounterSelecting) {
    inspect(entity);
    return;
  }
  if (canUsePlayerCharacters() && entity.kind === 'PLAYER' && +entity.user_id === +state.user.id) {
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
  if (resetInspector) {
    state.inspected = null;
    state.inspectorOpen = false;
    state.inspectorToken = null;
    if ($('#inspector').contains($('#delay-turn'))) $('#own-turn-actions').append($('#delay-turn'));
    $('#inspector').innerHTML = '';
    refreshInterface();
  }
}
function selectionItems() {
  const items = [];
  if (!state.data) return items;
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
function renderEntitySelection(refresh = false) {
  const items = selectionItems();
  if (!items.length) {
    clearEntitySelection();
    return;
  }
  if (items.length === 1) {
    inspect(items[0], refresh);
    return;
  }
  const objectCount = items.filter((x) => x.kind === 'OBJECT').length,
    copyableNpcs = items.filter((x) => x.kind === 'NPC'),
    npcCount = copyableNpcs.length,
    refs = items.map((x) => ({ kind: x.kind, id: +x.id })),
    healable = items.filter((x) => x.health !== undefined),
    i = $('#inspector'),
    summary = [
      objectCount && `${objectCount} objeto${objectCount === 1 ? '' : 's'}`,
      npcCount && `${npcCount} personaje${npcCount === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(' y ');
  if ($('#inspector').contains($('#delay-turn'))) $('#own-turn-actions').append($('#delay-turn'));
  i.innerHTML = `<h2>Selección múltiple</h2><div class="token-card"><strong>${summary}</strong><p class="muted">${items.map((x) => esc(x.name)).join(', ')}</p><div class="row">${copyableNpcs.length >= 2 ? '<button id="bulk-copy">Copiar</button>' : ''}${healable.length ? '<button id="bulk-heal" class="ok-action">Curar</button>' : ''}<button id="bulk-show">Hacer visibles</button><button id="bulk-hide">Ocultar</button><button id="bulk-image">Imagen común…</button><button id="bulk-delete" class="danger-action">Eliminar</button><button id="bulk-clear">Limpiar selección</button></div></div>`;
  state.inspected = null;
  if (!refresh) showInspector(true);
  refreshInterface();
  if ($('#bulk-copy'))
    $('#bulk-copy').onclick = () => {
      state.tokenClipboard = {
        sourceScenarioId: +state.scenarioId,
        npcIds: copyableNpcs.map((npc) => +npc.id),
      };
      updatePasteControl();
      toast(`${copyableNpcs.length} personajes copiados. Pulsa Pegar aquí o abre otro mapa.`);
    };
  if ($('#bulk-heal')) $('#bulk-heal').onclick = () => healTokens(healable);
  $('#bulk-show').onclick = () => command('tokens.bulk_update', { items: refs, visible: true });
  $('#bulk-hide').onclick = () => command('tokens.bulk_update', { items: refs, visible: false });
  $('#bulk-image').onclick = () => openImagePicker({ bulkItems: refs });
  $('#bulk-delete').onclick = () => {
    if (!confirm(`¿Eliminar ${items.length} tokens seleccionados del mapa?`)) return;
    command('tokens.delete', { items: refs });
    clearEntitySelection();
  };
  $('#bulk-clear').onclick = () => clearEntitySelection();
}
async function healTokens(tokens) {
  if (state.user.role !== 'DM') return;
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
    command('health.set', {
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
  menu.style.left = Math.max(8, Math.min(x, canvas.clientWidth - 290)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, canvas.clientHeight - 220)) + 'px';
  menu.hidden = false;
}
function inspectedToken() {
  if (!state.inspected || !state.data) return null;
  const { kind, id } = state.inspected;
  const list =
    kind === 'PLAYER' ? state.data.players : kind === 'NPC' ? state.data.npcs : state.data.objects;
  const token = list.find((item) => +item.id === +id);
  return token ? { ...token, kind } : null;
}
function inspect(t, refresh = false) {
  if (
    state.user.role === 'GUEST' ||
    (state.user.role === 'PLAYER' && (t.kind !== 'PLAYER' || +t.user_id !== +state.user.id))
  )
    return;
  const i = $('#inspector');
  const same = state.inspected?.kind === t.kind && +state.inspected?.id === +t.id;
  if (same && state.inspectorToken) {
    Object.assign(state.inspectorToken, t);
    t = state.inspectorToken;
  } else {
    clearTimeout(state.inspectorSaveTimer);
    state.inspectorSaveTimer = null;
    state.inspectorToken = t;
  }
  state.inspected = { kind: t.kind, id: +t.id };
  if (!refresh) showInspector(true);
  if (refresh && same && (i.contains(document.activeElement) || state.inspectorSaveTimer)) {
    if ($('#inspect-health-display'))
      $('#inspect-health-display').textContent = String(displayHp(t.health, t));
    if ($('#inspect-current-hp'))
      $('#inspect-current-hp').textContent = String(displayHp(t.health, t));
    if ($('#inspect-health-track'))
      $('#inspect-health-track').style.setProperty(
        '--health',
        `${Math.max(0, Math.min(100, (+t.health / Math.max(1, +t.max_health)) * 100))}%`,
      );
    return;
  }
  const previousScroll = i.parentElement.scrollTop;
  const encounterOn = state.data?.encounter && state.data.encounter.state !== 'OFF',
    combatOn = state.data?.encounter && state.data.encounter.state === 'RUNNING',
    canEndTurn = state.user.role === 'DM' && t.kind === 'NPC' && combatOn && isCurrent(t),
    canClone = state.user.role === 'DM' && t.kind !== 'PLAYER' && !canEndTurn,
    cloneActive =
      state.cloneSource && state.cloneSource.kind === t.kind && +t.id === +state.cloneSource.id;
  const maxHealth = Number(t.max_health ?? t.health ?? 0),
    damageReceived = Math.max(0, maxHealth - Number(t.health ?? maxHealth));
  let html = `<div class="b-inspector-header">${avatar(t)}<div class="b-inspector-identity"><h2>${esc(t.name || t.user_name)}</h2><p>${t.kind === 'PLAYER' ? 'Personaje de jugador' : t.kind === 'NPC' ? 'NPC' : 'Objeto'}${t.visible !== undefined && !+t.visible ? ' · Oculto' : ''}${t.health !== undefined && +t.health <= 0 ? ' · Caído' : ''}</p></div><button id="inspect-close" class="icon-button" type="button" aria-label="Cerrar Inspector">${icon('close')}</button></div><div class="token-card">${t.kind === 'NPC' && state.user.role === 'DM' && t.codex_creature_id ? '<button id="inspect-creature-info" type="button">Ver ficha de criatura</button>' : ''}`;
  if (t.health !== undefined)
    html += `<div class="health-value"><span id="inspect-health-display">${displayHp(t.health, t)}</span> <small>/ ${maxHealth} PV</small></div><div class="health-track"><i id="inspect-health-track" style="--health:${Math.max(0, Math.min(100, (+t.health / Math.max(1, maxHealth)) * 100))}%"></i></div>`;
  if (state.user.role === 'DM')
    html += `<div class="inspect-top-actions">${canEndTurn ? '<button id="inspect-end-turn" class="primary">Terminar turno</button>' : canClone ? `<button id="inspect-clone" class="${cloneActive ? 'active' : ''}">Clonar</button>` : ''}<button id="inspect-move">Mover aquí…</button></div>`;
  if (t.kind === 'NPC' || (t.kind === 'PLAYER' && +t.user_id === +state.user.id))
    html += `<div class="inspector-rotation"><button id="inspect-rotate-left" type="button" aria-label="Rotar menos 45 grados">${icon('rotate')}−45°</button><button id="inspect-rotate-right" type="button" aria-label="Rotar más 45 grados">${icon('rotate')}+45°</button></div>`;
  if (t.kind === 'PLAYER' && +t.user_id === +state.user.id)
    html +=
      '<button id="inspect-avatar" type="button">Personalizar avatar</button><div id="inspect-own-turn"></div>';
  if (t.health !== undefined) {
    if (state.user.role === 'DM' && encounterOn)
      html += `<label><span>Daño Recibido</span><div class="inline-search"><strong id="inspect-damage-total" class="damage-total">${esc(damageReceived)}</strong><input id="inspect-damage" type="number" min="0" step="1" value="" placeholder="Daño nuevo"></div><small>Total recibido / daño a añadir. PV actual: <span id="inspect-current-hp">${esc(displayHp(t.health, t))}</span> / ${esc(maxHealth)}.</small></label>`;
    else if (state.user.role === 'DM')
      html += `<label><span>Vida de ${esc(t.name || t.user_name || 'Token')}</span><div class="inline-search"><input id="inspect-hp" type="number" value="${+t.health}" title="Vida actual"><span class="muted" style="align-self:center">/</span><input id="inspect-max-hp" type="number" min="1" value="${esc(maxHealth || +t.health)}" title="Vida máxima"></div><small>Vida actual / vida máxima.</small></label>`;
    if (state.user.role === 'DM')
      html += '<button id="inspect-heal" class="ok-action">Curar</button>';
  }
  if (state.user.role === 'DM' && t.kind !== 'OBJECT') html += '<div class="stat-grid">';
  if (t.kind === 'NPC' && state.user.role === 'DM')
    html += `<label><span>Clase de armadura</span><input id="inspect-ac" type="number" value="${t.armor_class ?? ''}" placeholder="Sin CA"></label>`;
  if (t.initiative !== undefined && state.user.role === 'DM')
    html += `<label><span>Iniciativa</span><input id="inspect-init" type="number" value="${t.initiative ?? ''}"></label>`;
  if (state.user.role === 'DM' && t.kind !== 'OBJECT') html += '</div>';
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
  if ($('#inspector').contains($('#delay-turn'))) $('#own-turn-actions').append($('#delay-turn'));
  i.innerHTML = html;
  i.parentElement.scrollTop = refresh ? previousScroll : 0;
  $('#inspect-close').onclick = () => showInspector(false);
  if ($('#inspect-own-turn')) $('#inspect-own-turn').append($('#delay-turn'));
  if ($('#inspect-avatar'))
    $('#inspect-avatar').onclick = () => {
      state.selectedCharacter = +t.character_id;
      openImagePicker('avatar');
    };
  if ($('#inspect-rotate-left'))
    $('#inspect-rotate-left').onclick = () =>
      command(t.kind === 'PLAYER' ? 'player.rotate' : 'token.rotate', {
        kind: t.kind,
        id: +t.id,
        delta: -45,
      });
  if ($('#inspect-rotate-right'))
    $('#inspect-rotate-right').onclick = () =>
      command(t.kind === 'PLAYER' ? 'player.rotate' : 'token.rotate', {
        kind: t.kind,
        id: +t.id,
        delta: 45,
      });
  updateDelayTurnControl();
  refreshInterface();
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
    const card = i.querySelector('.token-card');
    const inspectorScenario = state.scenarioId;
    const saveInspect = () => {
      state.inspectorSaveTimer = null;
      if (inspectorScenario !== state.scenarioId) return;
      if (!card.isConnected || !i.contains(card)) return;
      applyIncomingDamage();
      const dirty = (id) => $('#' + id)?.dataset.dirty === 'true';
      if (dirty('inspect-hp') || dirty('inspect-max-hp'))
        command('health.set', {
          kind: t.kind,
          id: +t.id,
          health: dirty('inspect-hp') ? +$('#inspect-hp').value : +t.health,
          ...(dirty('inspect-max-hp') ? { maxHealth: +$('#inspect-max-hp').value } : {}),
        });
      if (dirty('inspect-init')) {
        const initiative = $('#inspect-init').value === '' ? null : +$('#inspect-init').value;
        const previous = t.initiative == null ? null : +t.initiative;
        if (initiative !== previous)
          command('initiative.set', { kind: t.kind, id: +t.id, initiative });
      }
      if (t.kind !== 'PLAYER') {
        const changes = { kind: t.kind, id: +t.id };
        if (dirty('inspect-name')) changes.name = $('#inspect-name').value;
        if (dirty('inspect-notes')) changes.notes = $('#inspect-notes').value;
        if (dirty('inspect-width')) changes.width_cells = +$('#inspect-width').value;
        if (dirty('inspect-height')) changes.height_cells = +$('#inspect-height').value;
        if (dirty('inspect-ac'))
          changes.armor_class = $('#inspect-ac').value === '' ? null : +$('#inspect-ac').value;
        if (Object.keys(changes).length > 2) command('token.update', changes);
      } else if (dirty('inspect-player-notes'))
        command('player.note', { playerId: +t.user_id, notes: $('#inspect-player-notes').value });
      if (state.ws?.readyState === 1)
        card.querySelectorAll('[data-dirty]').forEach((field) => delete field.dataset.dirty);
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
          el.dataset.dirty = 'true';
          clearTimeout(state.inspectorSaveTimer);
          state.inspectorSaveTimer = setTimeout(saveInspect, 650);
        });
    });
    $('#inspect-move').onclick = () => {
      setMode('select');
      state.moveToken = t;
      toast('Toca la casilla de destino');
    };

    if ($('#inspect-creature-info'))
      $('#inspect-creature-info').onclick = () => openNpcCreatureInfo(+t.codex_creature_id);
    if ($('#inspect-include-combat'))
      $('#inspect-include-combat').onclick = () =>
        command('encounter.include', { kind: t.kind, id: +t.id });
    if ($('#inspect-end-turn')) $('#inspect-end-turn').onclick = () => command('turn.next');
    updateTurnControls();
    if ($('#inspect-image'))
      $('#inspect-image').onclick = () => openImagePicker({ kind: t.kind, id: +t.id });
    if ($('#inspect-clone'))
      $('#inspect-clone').onclick = () => {
        const same =
          state.cloneSource && state.cloneSource.kind === t.kind && +state.cloneSource.id === +t.id;
        if (same) {
          setMode('pan');
          renderEntitySelection();
          toast('Clonado desactivado');
          return;
        }
        state.cloneSource = { kind: t.kind, id: +t.id };
        setMode('select', true);
        renderEntitySelection();
        toast('Clonado activado: toca casillas para crear copias');
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

initInterface({
  cancelDraft: cancelEncounterDraft,
  hasSelection: () => !state.encounterSelecting && selectionCount() > 0,
  inspectedToken,
  cancelMapAction: () => {
    state.selectedMovementPreview = null;
    state.path = [];
    $('#cell-menu').hidden = true;
    setMode('pan');
  },
  pageChanged: async (page) => {
    if (page === 'map') {
      requestAnimationFrame(resize);
      return;
    }
    if (page === 'codex') await openCodexLibrary();
    if (page === 'chat') {
      $('#chat-status').textContent = state.scenarioId
        ? ''
        : 'Abre un escenario para acceder a sus conversaciones.';
      await loadChatThreads();
      if (state.user.role === 'PLAYER' && state.chatThreads.length && !state.openChats.size)
        await openChat(+state.chatThreads[0].id, 'Chat con DM', false);
    }
  },
});

// Restore the cookie-backed session on every page load, after all handlers are installed.
start().catch((error) => {
  $('#auth-error').textContent = error.message;
  toast(error.message);
});
