import { $, $$, esc, toast } from './core.js';
import { state } from './state.js';

const paths = {
  dice: 'M12 3 3 8v9l9 5 9-5V8L12 3Zm0 0v7m-9-2 9 2 9-2m-9 2v12M3 17l9-7 9 7',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8m5 10v-2a4 4 0 0 0-3-3.87',
  book: 'M12 5v16m0-16C9 2 5 2 2 4v16c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-2-7-2-10 1Z',
  chat: 'M21 11a9 9 0 0 1-9 9H4l-3 2 1-6a9 9 0 1 1 19-5Z',
  sword: 'm14 3 7-1-1 7L8 21l-5-5L14 3Zm-8 9 6 6m-8 1-2 3m13-16 3 3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  chevron: 'm9 5 7 7-7 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  hidden:
    'm3 3 18 18M10.6 5.1C16.7 4.2 22 12 22 12a22 22 0 0 1-4 4M6.2 6.2C3.7 8.2 2 12 2 12s4 7 10 7c1.8 0 3.4-.6 4.8-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2',
  cursor: 'm4 3 16 9-8 2-3 8-5-19Z',
  hand: 'M7 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-4-2-6-4l-4-5a2 2 0 0 1 3-2l2 1Z',
  fog: 'M4 13a4 4 0 0 1 0-8 6 6 0 0 1 11-1 5 5 0 0 1 4 9M3 17h12m3 0h3M6 21h12',
  grid: 'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
  pen: 'm16 3 5 5L8 21H3v-5L16 3Zm-2 2 5 5',
  eraser: 'm16 3 6 6-12 12H6l-4-4L16 3Zm-9 9 6 6m-3 3h12',
  lock: 'M5 10h14v11H5V10Zm3 0V7a4 4 0 0 1 8 0v3m-4 4v3',
  unlock: 'M5 10h14v11H5V10Zm3 0V7a4 4 0 0 1 8 0m-4 7v3',
  note: 'M4 3h16v14l-4 4H4V3Zm4 5h8m-8 4h8m-8 4h4m4 5v-4h4',
  shield: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Z',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  search: 'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 6 6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
  clock: 'M12 8v5l3 2m7-3a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z',
  rotate: 'M3 10a9 9 0 1 1 2 8M3 3v7h7',
  copy: 'M9 8h12v13H9V8Zm7-3V2H3v14h3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  route: 'M5 5a2 2 0 1 0 0 .01M19 19a2 2 0 1 0 0 .01M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9',
  box: 'm12 2 10 5v10l-10 5-10-5V7l10-5Zm0 10L2 7m10 5L22 7m-10 5v10M7 4l10 6',
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.shield}"/></svg>`;
}
export function avatar(token) {
  const id = Number(token?.image_asset_id || token?.avatar_asset_id);
  return `<span class="avatar" aria-hidden="true">${id > 0 ? `<img src="/api/assets/${id}" alt="" loading="lazy">` : icon(token?.kind === 'OBJECT' ? 'box' : 'users')}</span>`;
}
// Replace only a list, retaining its keyboard target and scroll. Never replace the map node.
export function updateList(element, html) {
  if (element.innerHTML === html) return;
  const active = element.contains(document.activeElement) ? document.activeElement.id : null;
  const scroll = element.scrollTop;
  element.innerHTML = html;
  element.scrollTop = scroll;
  if (active) document.getElementById(active)?.focus({ preventScroll: true });
}
let actions = {};
export function initInterface(callbacks) {
  actions = callbacks;
  $$('[data-icon]').forEach((node) => (node.innerHTML = icon(node.dataset.icon)));
  $$('[data-page]').forEach((button) =>
    button.addEventListener('click', () => navigate(button.dataset.page)),
  );
  $('#roll-d20').onclick = () => setDiceMenuOpen($('#dice-menu').hidden, true);
  $('#roll-d20').onkeydown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setDiceMenuOpen(true, true);
    }
  };
  $$('#dice-menu button').forEach((button) => {
    button.onclick = () => {
      setDiceMenuOpen(false, true);
      actions.rollDice?.(+button.dataset.diceSides);
    };
  });
  $('#dice-menu').onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDiceMenuOpen(false, true);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const buttons = $$('#dice-menu button');
    const index = buttons.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + buttons.length) %
            buttons.length;
    buttons[next].focus();
  };
  $('#encounter-toggle').onclick = () => setEncounterOpen(!state.encounterOpen, true);
  $('#encounter-close').onclick = () => setEncounterOpen(false, true);
  $('#requests-toggle').onclick = () => setRequestsOpen(!state.requestsOpen);
  $('#requests-close').onclick = () => setRequestsOpen(false, true);
  $('#encounter-order-tab').onclick = () => setEncounterTab('order');
  $('#encounter-inspector-tab').onclick = () => setEncounterTab('inspector');
  $('#selected-token').onclick = () => showInspector(!state.inspectorOpen);
  $('#encounter-tabs').onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...$('#encounter-tabs').querySelectorAll('button:not(:disabled)')];
    const index = tabs.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next]?.click();
    tabs[next]?.focus();
  };
  document.addEventListener('pointerdown', (event) => {
    if (!$('#dice-menu').contains(event.target) && !$('#roll-d20').contains(event.target))
      setDiceMenuOpen(false);
    if (
      state.requestsOpen &&
      !$('#requests-panel').contains(event.target) &&
      !$('#requests-toggle').contains(event.target)
    )
      setRequestsOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!$('#dice-menu').hidden) {
      event.preventDefault();
      setDiceMenuOpen(false, true);
    } else if ($('#session-menu').open) {
      $('#session-menu').open = false;
      $('#session-menu summary').focus();
    } else if (state.requestsOpen) setRequestsOpen(false, true);
    else if ($('#encounter-actions-menu').open) {
      $('#encounter-actions-menu').open = false;
      $('#encounter-actions-menu summary').focus();
    } else if (state.encounterOpen && state.encounterTab === 'inspector')
      setEncounterTab('order', true);
    else if (state.encounterOpen) setEncounterOpen(false, true);
    else if (state.inspectorOpen) showInspector(false);
    else actions.cancelMapAction?.();
  });
  document.addEventListener('focusin', (event) => {
    if (!$('#dice-menu').contains(event.target) && !$('#roll-d20').contains(event.target))
      setDiceMenuOpen(false);
  });
  window.addEventListener('resize', positionDiceMenu);
  window.addEventListener('scroll', positionDiceMenu, true);
  window.visualViewport?.addEventListener('resize', positionDiceMenu);
  window.visualViewport?.addEventListener('scroll', positionDiceMenu);
  window.addEventListener('resize', positionRequests);
  window.addEventListener('scroll', positionRequests, true);
  window.visualViewport?.addEventListener('resize', positionRequests);
  window.visualViewport?.addEventListener('scroll', positionRequests);
  document.fonts.ready.then(positionRequests);
  $('#scenario-dialog-close').onclick = () => $('#scenario-dialog').close();
  $$('dialog').forEach((dialog) =>
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      ) {
        dialog.dispatchEvent(new Event('cancel', { cancelable: true })) && dialog.close();
      }
    }),
  );
}
export function setDiceMenuOpen(open, focus = false) {
  const menu = $('#dice-menu'),
    button = $('#roll-d20');
  if (open && (button.disabled || !['DM', 'PLAYER'].includes(state.user?.role))) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    positionDiceMenu();
    if (focus) menu.querySelector('button').focus();
  } else if (focus) button.focus({ preventScroll: true });
}
function positionDiceMenu() {
  const menu = $('#dice-menu');
  if (menu.hidden) return;
  const rect = $('#roll-d20').getBoundingClientRect(),
    viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0,
    left = viewport?.offsetLeft || 0;
  const width = viewport?.width || innerWidth;
  menu.style.maxHeight = `${Math.max(72, rect.top - top - 20)}px`;
  menu.style.left = `${Math.max(left + 12, Math.min(rect.right - menu.offsetWidth, left + width - menu.offsetWidth - 12))}px`;
  menu.style.top = `${Math.max(top + 8, rect.top - menu.offsetHeight - 10)}px`;
}
export function navigate(page, focus = false) {
  setDiceMenuOpen(false);
  if (!state.user || state.user.role === 'GUEST') page = 'map';
  if (!['map', 'worlds', 'characters', 'codex', 'chat'].includes(page)) page = 'map';
  if (page !== 'map') {
    setEncounterOpen(false);
    state.inspectorOpen = false;
  }
  setRequestsOpen(false);
  $('#session-menu').open = false;
  state.page = page;
  $('#map-page').hidden = page !== 'map';
  $('#library').hidden = page === 'map';
  $('#library').classList.toggle('b-worlds-library', page === 'worlds');
  $('#worlds-heading').hidden = page !== 'worlds';
  $('#library-eyebrow').hidden = page === 'worlds';
  $('#new-scenario').hidden = page !== 'worlds' || state.user?.role !== 'DM';
  $$('[data-library]').forEach((section) => (section.hidden = section.dataset.library !== page));
  $$('#dock [data-page]').forEach((button) => {
    const selected = button.dataset.page === page;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  refreshInterface();
  Promise.resolve(actions.pageChanged?.(page)).catch((error) => toast(error.message));
  if (focus) $('#main').focus({ preventScroll: true });
}
export function setEncounterOpen(open, focus = false) {
  open = !!open && state.user?.role === 'DM';
  if (open && state.page !== 'map') navigate('map');
  state.encounterOpen = open;
  if (!open) {
    state.inspectorOpen = false;
    actions.cancelDraft?.();
    $('#encounter-actions-menu').open = false;
    state.encounterTab = 'order';
  }
  refreshInterface();
  if (focus)
    (open ? $('#encounter-order-tab') : $('#encounter-toggle')).focus({ preventScroll: true });
}
export function setEncounterTab(tab, focus = false) {
  if (tab === 'inspector' && !state.inspected && !actions.hasSelection?.()) return;
  state.encounterTab = tab;
  if (tab === 'inspector') state.inspectorOpen = true;
  refreshInterface();
  if (focus) $(`#encounter-${tab}-tab`).focus({ preventScroll: true });
}
export function showInspector(open = true) {
  state.inspectorOpen = open;
  if (state.encounterOpen) state.encounterTab = open ? 'inspector' : 'order';
  refreshInterface();
  if (!open && state.encounterOpen) $('#encounter-order-tab').focus({ preventScroll: true });
  else if (!open && !$('#selected-token').hidden)
    $('#selected-token').focus({ preventScroll: true });
}
export function refreshInterface() {
  const dm = state.user?.role === 'DM';
  const hasInspector = !!state.inspected || !!actions.hasSelection?.();
  const review = !!state.selectedMovementPreview && !state.requestsOpen;
  $('#encounter-panel').hidden = !state.encounterOpen || !dm;
  $('#map-page').classList.toggle('has-encounter', state.encounterOpen && dm);
  $('#map-page').classList.toggle('has-request-review', review);
  $('#encounter-toggle').setAttribute('aria-expanded', String(state.encounterOpen));
  $('#encounter-toggle').classList.toggle('active', state.encounterOpen);
  $('#encounter-toggle').disabled = !state.data;
  const inspector = $('#inspector');
  const parent = state.encounterOpen ? $('#encounter-inspector-view') : $('#floating-inspector');
  if (inspector.parentElement !== parent) parent.append(inspector);
  if (!hasInspector && state.encounterTab === 'inspector') state.encounterTab = 'order';
  $('#encounter-inspector-tab').disabled = !hasInspector;
  for (const tab of ['order', 'inspector']) {
    const selected = state.encounterTab === tab;
    const button = $(`#encounter-${tab}-tab`);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`#encounter-${tab}-view`).hidden = !selected;
  }
  $('#encounter-order-tab').textContent = state.encounterSelecting
    ? 'Preparación'
    : 'Orden de turnos';
  $('#floating-inspector').hidden =
    state.encounterOpen || !hasInspector || !state.inspectorOpen || review;
  $('#selected-token').hidden = state.encounterOpen || !hasInspector || review || !state.data;
  if (hasInspector) {
    const token = actions.inspectedToken?.();
    $('#selected-token').innerHTML =
      `${avatar(token)}<span><small>${dm ? 'INSPECTOR' : 'FICHA SELECCIONADA'}</small><strong>${esc(token?.name || token?.user_name || 'Selección múltiple')}</strong></span>${icon(state.inspectorOpen ? 'close' : 'chevron')}`;
  }
  $('#movement-review').hidden = !review || !dm;
  $('#path-actions').hidden = state.mode !== 'path' || !state.path.length;
  $('#requests-panel').hidden = !state.requestsOpen || !dm;
  $('#requests-toggle').setAttribute('aria-expanded', String(state.requestsOpen));
  $('#requests-toggle').classList.toggle('active', state.requestsOpen);
  $('#map').tabIndex = state.user?.role === 'GUEST' ? -1 : 0;
  const delay = $('#delay-turn');
  if (delay && state.page === 'characters' && delay.parentElement !== $('#own-turn-actions'))
    $('#own-turn-actions').append(delay);
  else if (
    delay &&
    state.page === 'map' &&
    $('#inspect-own-turn') &&
    delay.parentElement !== $('#inspect-own-turn')
  )
    $('#inspect-own-turn').append(delay);
  positionRequests();
}
export function setRequestsOpen(open, focus = false) {
  state.requestsOpen = !!open && state.user?.role === 'DM';
  refreshInterface();
  if (focus && !open) $('#requests-toggle').focus({ preventScroll: true });
}
export function positionRequests() {
  if (!state.requestsOpen) return;
  const button = $('#requests-toggle').getBoundingClientRect();
  const dock = $('#dock').getBoundingClientRect();
  if (button.right <= dock.left || button.left >= dock.right) {
    state.requestsOpen = false;
    $('#requests-panel').hidden = true;
    $('#requests-toggle').setAttribute('aria-expanded', 'false');
    return;
  }
  const viewport = window.visualViewport;
  const leftEdge = viewport?.offsetLeft || 0;
  const topEdge = viewport?.offsetTop || 0;
  const width = viewport?.width || innerWidth;
  const panel = $('#requests-panel');
  const panelWidth = Math.min(320, width - 24);
  const left = Math.max(
    leftEdge + 12,
    Math.min(button.left + button.width / 2 - panelWidth / 2, leftEdge + width - panelWidth - 12),
  );
  panel.style.width = `${panelWidth}px`;
  panel.style.left = `${left}px`;
  panel.style.bottom = `${innerHeight - button.top + 10}px`;
  panel.style.maxHeight = `${Math.max(80, Math.min(420, button.top - topEdge - 22))}px`;
  panel.style.setProperty(
    '--requests-arrow-left',
    `${Math.max(12, Math.min(panelWidth - 12, button.left + button.width / 2 - left))}px`,
  );
}
