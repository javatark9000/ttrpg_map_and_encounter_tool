import { $ } from './core.js';

export const dialog = $('#form-dialog'),
  dialogForm = $('#dialog-form');
let dialogResolve = null,
  dialogFields = [];
export function openForm({
  title,
  description = '',
  fields = [],
  submitText = 'Guardar',
  danger = false,
  showBack = false,
  backValue = '__back__',
  wide = false,
  collapsible = false,
} = {}) {
  if (dialog.open) dialog.close();
  dialog.classList.toggle('wide-dialog', !!wide);
  dialogFields = fields;
  $('#dialog-title').textContent = title;
  $('#dialog-description').textContent = description;
  $('#dialog-description').hidden = !description;
  $('#dialog-error').textContent = '';
  const back = $('#dialog-back');
  back.hidden = !showBack;
  back.onclick = () => finishDialog(backValue);
  const wrap = $('#dialog-fields');
  wrap.innerHTML = '';
  const sectionOf = (f) => {
    if (f.section) return f.section;
    if (
      ['name', 'customIdentifier', 'customTag', 'shortDescription', 'description'].includes(f.name)
    )
      return 'Básico';
    if (
      ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(
        f.name,
      )
    )
      return 'Atributos';
    if (
      [
        'creatureTypeId',
        'creatureSizeId',
        'armorClassText',
        'hitPointsText',
        'speedText',
        'challengeRatingText',
        'experiencePoints',
      ].includes(f.name)
    )
      return 'Estadísticas';
    if (
      [
        'spellLevel',
        'magicSchoolId',
        'activationTypeId',
        'rangeText',
        'durationText',
        'componentsText',
        'requiresConcentration',
        'isRitual',
      ].includes(f.name)
    )
      return 'Datos del conjuro';
    if (
      [
        'savingThrowTypeId',
        'attackRollTypeId',
        'damageText',
        'healingText',
        'scalingText',
      ].includes(f.name)
    )
      return 'Efectos y escalado';
    if (
      [
        'itemTypeId',
        'itemRarityId',
        'requiresAttunement',
        'isMagical',
        'isConsumable',
        'weightText',
        'valueText',
      ].includes(f.name)
    )
      return 'Datos del objeto';
    return 'Detalles adicionales';
  };
  const renderField = (f, parent) => {
    const label = document.createElement('label');
    if (f.type === 'checkbox') label.className = 'check-field';
    const caption = document.createElement('span');
    caption.textContent = f.label;
    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = f.rows || 5;
    } else if (f.type === 'select') {
      input = document.createElement('select');
      for (const option of f.options || []) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        input.append(el);
      }
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
    }
    input.name = f.name;
    if (f.value !== undefined) {
      if (f.type === 'checkbox') input.checked = !!f.value;
      else input.value = f.value;
    }
    if (f.required) input.required = true;
    if (f.min !== undefined) input.min = f.min;
    if (f.max !== undefined) input.max = f.max;
    if (f.step !== undefined) input.step = f.step;
    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.type === 'checkbox') label.append(input, caption);
    else label.append(caption, input);
    if (f.help) {
      const help = document.createElement('small');
      help.textContent = f.help;
      label.append(help);
    }
    parent.append(label);
  };
  if (collapsible) {
    const groups = new Map();
    for (const f of fields) {
      const k = sectionOf(f);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    for (const [name, items] of groups) {
      const d = document.createElement('details');
      d.className =
        'custom-section ' + (['Estadísticas', 'Atributos'].includes(name) ? 'compact-stats' : '');
      const s = document.createElement('summary');
      s.textContent = `${name} (${items.length})`;
      d.append(s);
      const body = document.createElement('div');
      body.className = 'custom-section-body';
      items.forEach((f) => renderField(f, body));
      d.append(body);
      wrap.append(d);
    }
  } else fields.forEach((f) => renderField(f, wrap));
  $('#dialog-submit').textContent = submitText;
  $('#dialog-submit').className = danger ? 'danger-action' : 'primary';
  dialog.showModal();
  requestAnimationFrame(() =>
    wrap.querySelector('input:not([type=checkbox]),select,textarea')?.focus(),
  );
  return new Promise((resolve) => (dialogResolve = resolve));
}
export function releaseDialog() {
  dialogResolve = null;
}

function finishDialog(value) {
  if (!dialogResolve) return;
  const resolve = dialogResolve;
  dialogResolve = null;
  dialog.close();
  resolve(value);
}
export function installDefaultDialogHandlers() {
  $('#dialog-cancel').onclick = () => finishDialog(null);
  $('#dialog-close').onclick = () => finishDialog(null);
  dialog.oncancel = (e) => {
    e.preventDefault();
    finishDialog(null);
  };
  dialogForm.onsubmit = (e) => {
    e.preventDefault();
    if (!dialogForm.reportValidity()) return;
    const values = Object.fromEntries(new FormData(dialogForm));
    for (const f of dialogFields)
      if (f.type === 'checkbox') values[f.name] = dialogForm.elements[f.name].checked;
    finishDialog(values);
  };
}
installDefaultDialogHandlers();
