import { $, api, esc, toast } from './core.js';
import {
  dialog,
  dialogForm,
  installDefaultDialogHandlers,
  openForm,
  releaseDialog,
} from './dialogs.js';
import { state } from './state.js';

const codexDialog = $('#codex-dialog');
$('#codex-close').onclick = () => codexDialog.close();
$('#codex-edit').onclick = () => {};
const codexStack = [];
$('#codex-back').onclick = () => codexGoBack();
$('#codex-button').onclick = async () => {
  try {
    await openCodex();
  } catch (e) {
    toast(e.message);
  }
};
function slug(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function formatAbilityScore(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 30) return value;
  const modifier = Math.floor((score - 10) / 2);
  return `${score} (${modifier >= 0 ? '+' : ''}${modifier})`;
}
function opt(rows, empty = '— Sin cambiar —') {
  return [
    { value: '', label: empty },
    ...(rows || []).map((x) => ({ value: x.id, label: x.name })),
  ];
}
async function openCodex() {
  codexStack.length = 0;
  await renderCodexHome();
  if (!codexDialog.open) codexDialog.showModal();
}
async function renderCodexHome() {
  $('#codex-back').hidden = true;
  $('#codex-edit').hidden = true;
  $('#codex-delete').hidden = true;
  $('#codex-title').textContent = 'Codex';
  const data = await api('/codex/categories'),
    wrap = $('#codex-content');
  wrap.innerHTML = '<div class="codex-list"></div>';
  const list = wrap.firstChild;
  data.categories.forEach((c) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'codex-row';
    row.innerHTML = `<div><strong>${esc(c.name)}</strong><br><small>${esc(c.description)}</small></div><span class="codex-count">${+c.count}</span>`;
    row.onclick = () => openCodexCategory(c);
    list.append(row);
  });
  if (state.user?.role === 'DM') {
    const personalize = document.createElement('button');
    personalize.className = 'codex-row';
    personalize.type = 'button';
    personalize.innerHTML =
      '<div><strong>Personalizar</strong><br><small>Buscar por nombre o etiquetas existentes y guardar una copia homebrew modificada.</small></div><span class="codex-count">＋</span>';
    personalize.onclick = () => {
      codexDialog.close();
      openCustomizeSearch();
    };
    list.append(personalize);
  }
}
async function openCodexCategory(category, query = '') {
  codexStack.push({ type: 'home' });
  await renderCodexCategory(category, query);
}
async function renderCodexCategory(category, query = '', searched = false) {
  $('#codex-back').hidden = false;
  $('#codex-edit').hidden = true;
  $('#codex-delete').hidden = true;
  $('#codex-title').textContent = category.name;
  const wrap = $('#codex-content');
  wrap.innerHTML =
    '<label><span>Buscar</span><div class="inline-search"><input id="codex-category-search" autocomplete="off" placeholder="Buscar por nombre, descripción, categoría o tag…"><button id="codex-category-submit" type="button">Buscar</button></div><small id="codex-category-help">Mostrando 15 resultados aleatorios al abrir.</small></label><div id="codex-category-results" class="codex-search-results"></div><div id="codex-pagination" class="codex-pagination"></div>';
  const input = $('#codex-category-search'),
    help = $('#codex-category-help'),
    pager = $('#codex-pagination');
  input.value = query;
  let didSearch = searched || query.trim() !== '';
  const render = (data, q, page) => {
    const records = data.records || [],
      res = $('#codex-category-results');
    res.innerHTML = '';
    pager.innerHTML = '';
    if (data.random) help.textContent = 'Mostrando 15 resultados aleatorios al abrir.';
    else
      help.textContent = `${+data.total} resultado${+data.total === 1 ? '' : 's'} encontrado${+data.total === 1 ? '' : 's'}.`;
    records.forEach((r) => {
      const meta = ['actions', 'spells'].includes(category.code)
        ? [
            r.category_name || 'Acción',
            r.owner_names ? `Criatura: ${r.owner_names}` : null,
            r.spell_level !== null && r.spell_level !== undefined
              ? `Nivel ${+r.spell_level}`
              : null,
            r.magic_school,
            r.source_name,
          ]
            .filter(Boolean)
            .map(esc)
            .join(' · ')
        : [r.type_name, r.subtype_name, r.source_name].filter(Boolean).map(esc).join(' · ');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'codex-row codex-result-row';
      card.innerHTML = `<div><strong>${esc(r.name)}</strong><br><small>${meta || esc(category.name)}</small>${(!data.random || state.user?.role === 'DM') && r.short_description ? `<p class="muted">${esc(r.short_description)}</p>` : ''}</div>`;
      card.onclick = () => openCodexRecordDetail(category, +r.id, q);
      res.append(card);
    });
    if (!records.length) res.innerHTML = '<p class="muted">Sin resultados.</p>';
    if (!data.random && +data.pages > 1) {
      const prev = document.createElement('button'),
        next = document.createElement('button'),
        label = document.createElement('span');
      prev.type = next.type = 'button';
      prev.textContent = 'Anterior';
      next.textContent = 'Siguiente';
      label.textContent = `Página ${+data.page} de ${+data.pages}`;
      prev.disabled = +data.page <= 1;
      next.disabled = +data.page >= +data.pages;
      prev.onclick = () => load(q, +data.page - 1).catch((e) => toast(e.message));
      next.onclick = () => load(q, +data.page + 1).catch((e) => toast(e.message));
      pager.append(prev, label, next);
    }
  };
  const load = async (q = input.value.trim(), page = 1) => {
    if (q === '') {
      if (didSearch) {
        help.textContent = 'Escribe una búsqueda para ver resultados.';
        $('#codex-category-results').innerHTML =
          '<p class="muted">Sin resultados. Cierra y vuelve a abrir la categoría para ver otros registros aleatorios.</p>';
        pager.innerHTML = '';
        return;
      }
      const data = await api(
        `/codex/category-records?category=${encodeURIComponent(category.code)}&q=&limit=15`,
      );
      render(data, '', 1);
      return;
    }
    didSearch = true;
    const data = await api(
      `/codex/category-records?category=${encodeURIComponent(category.code)}&q=${encodeURIComponent(q)}&page=${page}&limit=15`,
    );
    render(data, q, page);
  };
  $('#codex-category-submit').onclick = () =>
    load(input.value.trim(), 1).catch((e) => toast(e.message));
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      load(input.value.trim(), 1).catch((x) => toast(x.message));
    }
  };
  await load(query.trim(), 1);
  requestAnimationFrame(() => input.focus());
}
async function openCodexRecordDetail(category, id, query) {
  codexStack.push({ type: 'category', category, query });
  if (['actions', 'spells'].includes(category.code))
    await renderCodexActionDetail(category, id, query);
  else await renderCodexGenericDetail(category, id, query);
}
async function renderCodexActionDetail(category, id, query = '') {
  $('#codex-back').hidden = false;
  const data = await api(`/codex/action?id=${id}`),
    r = data.record;
  $('#codex-title').textContent = r.name;
  setupCodexEdit(r.category_code === 'spell' ? 'spell' : null, r);
  const wrap = $('#codex-content');
  wrap.innerHTML =
    '<label><span>Buscar</span><input id="codex-category-search" autocomplete="off" placeholder="Buscar por nombre, descripción, categoría o tag…"><small>Escribe para volver a resultados de búsqueda.</small></label><div id="codex-category-results" class="codex-search-results"></div>';
  const input = $('#codex-category-search');
  input.value = query;
  input.oninput = () =>
    renderCodexCategory(category, input.value.trim(), true).catch((e) => toast(e.message));
  const fields = [
    ['Categoría', r.category_name],
    ['Activación', r.activation_name],
    [
      'Nivel',
      r.spell_level !== null && r.spell_level !== undefined ? String(+r.spell_level) : null,
    ],
    ['Escuela', r.magic_school],
    ['Alcance', r.range_text],
    ['Duración', r.duration_text],
    ['Componentes', r.components_text],
    ['Clases', data.classes?.join(', ')],
    ['Criaturas', data.owners?.join(', ')],
    ['Tags', data.tags?.join(', ')],
    ['Fuente', r.source_name],
  ].filter((x) => x[1]);
  const primary = data.media?.find((m) => m.purpose === 'icon') || data.media?.[0];
  const media = primary
    ? `<a class="codex-portrait" href="${esc(primary.url)}" target="_blank" rel="noopener" title="Ver imagen completa"><img src="${esc(primary.url)}" alt="${esc(primary.altText || r.name)}"></a>`
    : '';
  $('#codex-category-results').innerHTML =
    `<article class="codex-detail ${primary ? 'has-media' : ''}">${media}<div class="codex-detail-main"><h3>${esc(r.name)}</h3><dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${r.description ? `<div class="description">${esc(r.description)}</div>` : ''}</div></article>`;
  requestAnimationFrame(() => input.focus());
}
async function renderCodexGenericDetail(category, id, query = '') {
  $('#codex-back').hidden = false;
  const data = await api(`/codex/record?category=${encodeURIComponent(category.code)}&id=${id}`),
    r = data.record,
    labels = data.labels || {};
  $('#codex-title').textContent = r.name;
  setupCodexEdit(
    category.code === 'creatures' ? 'creature' : category.code === 'items' ? 'item' : null,
    r,
  );
  const wrap = $('#codex-content');
  wrap.innerHTML =
    '<label><span>Buscar</span><input id="codex-category-search" autocomplete="off" placeholder="Buscar por nombre, descripción, categoría o tag…"><small>Escribe para volver a resultados de búsqueda.</small></label><div id="codex-category-results" class="codex-search-results"></div>';
  const input = $('#codex-category-search');
  input.value = query;
  input.oninput = () =>
    renderCodexCategory(category, input.value.trim(), true).catch((e) => toast(e.message));
  const yn = (v) => (+v ? 'Sí' : null);
  const fields = [
    [
      'Tipo',
      labels.type ||
        r.background_type_code ||
        r.lineage_type_code ||
        r.hit_die_text ||
        r.subclass_type_text,
    ],
    ['Tamaño', labels.size],
    ['Rareza', labels.rarity],
    ['Especie', labels.species],
    ['Trasfondo', labels.background],
    ['Clase', labels.class],
    ['Fuente', r.source_name],
    ['CA', r.armor_class_text],
    ['PV', r.hit_points_text],
    ['Dados de golpe', r.hit_dice_text || r.hit_points_roll_text],
    ['Velocidad', r.speed_text],
    ['STR', formatAbilityScore(r.strength)],
    ['DEX', formatAbilityScore(r.dexterity)],
    ['CON', formatAbilityScore(r.constitution)],
    ['INT', formatAbilityScore(r.intelligence)],
    ['WIS', formatAbilityScore(r.wisdom)],
    ['CHA', formatAbilityScore(r.charisma)],
    ['Tiradas de salvación', r.saving_throws_text],
    ['Habilidades', r.skills_text],
    ['Resistencias', r.damage_resistances_text],
    ['Inmunidades al daño', r.damage_immunities_text],
    ['Vulnerabilidades', r.damage_vulnerabilities_text],
    ['Inmunidades a condiciones', r.condition_immunities_text],
    ['Sentidos', r.senses_text],
    ['Idiomas', r.languages_text],
    ['Prerrequisitos', r.prerequisites_text || r.requirements_text],
    ['Competencias', r.skill_proficiencies_text],
    ['Herramientas', r.tool_proficiencies_text],
    ['Idiomas', r.languages_text],
    ['Equipo', r.equipment_text],
    ['Rasgo/feature', r.feature_text],
    ['Características sugeridas', r.suggested_characteristics_text],
    ['Tamaño', r.size_text],
    ['Puntuaciones', r.ability_score_text],
    ['Edad', r.age_text],
    ['Alineamiento', r.alignment_text],
    ['Rasgos', r.traits_text],
    ['Beneficios', r.benefits_text],
    ['Daño', r.damage_text],
    ['Propiedades', r.properties_text],
    ['Valor', r.value_text],
    ['Peso', r.weight_text],
    ['Sintonización', yn(r.requires_attunement)],
    ['Mágico', yn(r.is_magical)],
    ['Consumible', yn(r.is_consumable)],
    ['Desafío', r.challenge_rating_text],
    ['Entorno', r.environment_text],
    ['Tags', data.tags?.join(', ')],
  ].filter((x) => x[1]);
  const primary = data.media?.find((m) => m.purpose === 'portrait') || data.media?.[0];
  const media = primary
    ? `<a class="codex-portrait" href="${esc(primary.url)}" target="_blank" rel="noopener" title="Ver imagen completa"><img src="${esc(primary.url)}" alt="${esc(primary.altText || r.name)}"></a>`
    : '';
  $('#codex-category-results').innerHTML =
    `<article class="codex-detail ${primary ? 'has-media' : ''}">${media}<div class="codex-detail-main"><h3>${esc(r.name)}</h3><dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${r.description ? `<div class="description">${esc(r.description)}</div>` : ''}</div></article>`;
  requestAnimationFrame(() => input.focus());
}
async function codexGoBack() {
  const prev = codexStack.pop();
  if (!prev) return;
  if (prev.type === 'home') await renderCodexHome();
  else if (prev.type === 'category') await renderCodexCategory(prev.category, prev.query || '');
}
function setupCodexEdit(kind, record) {
  const editBtn = $('#codex-edit'),
    delBtn = $('#codex-delete');
  editBtn.hidden = !(state.user?.role === 'DM' && kind);
  editBtn.onclick = () => kind && customizeCodexRecord(kind, record, true);
  delBtn.hidden = !(state.user?.role === 'DM' && kind === 'creature' && +record.is_custom === 1);
  delBtn.onclick = async () => {
    if (!confirm(`¿Eliminar/desactivar ${record.name}? No se borrará de la DB.`)) return;
    try {
      await api(`/codex/customize/creature/${+record.id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast('Criatura custom desactivada');
      await codexGoBack();
    } catch (e) {
      toast(e.message);
    }
  };
}
async function customizeCodexRecord(kind, record, returnToCodex = false) {
  try {
    codexDialog.close();
    const edit = +record.is_custom === 1,
      options = await api('/codex/customization/options'),
      fields =
        kind === 'creature'
          ? creatureCustomFields(record, options, edit)
          : kind === 'spell'
            ? spellCustomFields(record, options, edit)
            : itemCustomFields(record, options, edit);
    const values = await openForm({
      title: `${edit ? 'Editar' : 'Personalizar'} ${record.name}`,
      description: edit
        ? 'Sobrescribe este registro custom existente.'
        : 'Creación personalizada que añadirá nuevo contenido a la base de datos sin modificar el objeto, hechizo o criatura seleccionad@.',
      submitText: edit ? 'Guardar cambios' : 'Guardar custom',
      fields,
      wide: true,
      collapsible: true,
      showBack: returnToCodex,
    });
    if (values === '__back__') {
      if (returnToCodex && !codexDialog.open) codexDialog.showModal();
      return;
    }
    if (!values) return;
    const saved = edit
      ? await api(`/codex/customize/${kind}/${+record.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ kind, ...values }),
        })
      : await api('/codex/customize', {
          method: 'POST',
          body: JSON.stringify({ kind, sourceId: +record.id, ...values }),
        });
    toast(
      edit
        ? `Custom actualizado: ${saved.customIdentifier}`
        : `Custom guardado: ${saved.customIdentifier}`,
    );
    await maybeUploadCustomCodexImage(saved);
  } catch (e) {
    toast(e.message || 'No se pudo abrir personalización');
  }
}
async function openCustomizeSearch() {
  try {
    while (true) {
      const pick = await openCodexSearchPopup();
      if (!pick) return;
      const edit = +pick.record.is_custom === 1;
      const options = await api('/codex/customization/options');
      const fields =
        pick.kind === 'creature'
          ? creatureCustomFields(pick.record, options, edit)
          : pick.kind === 'spell'
            ? spellCustomFields(pick.record, options, edit)
            : itemCustomFields(pick.record, options, edit);
      const values = await openForm({
        title: `${edit ? 'Editar' : 'Personalizar'} ${pick.record.name}`,
        description: edit
          ? 'Sobrescribe este registro custom existente.'
          : 'Creación personalizada que añadirá nuevo contenido a la base de datos sin modificar el objeto, hechizo o criatura seleccionad@.',
        submitText: edit ? 'Guardar cambios' : 'Guardar custom',
        fields,
        showBack: true,
        wide: true,
        collapsible: true,
      });
      if (values === '__back__') continue;
      if (!values) return;
      const saved = edit
        ? await api(`/codex/customize/${pick.kind}/${+pick.record.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ kind: pick.kind, ...values }),
          })
        : await api('/codex/customize', {
            method: 'POST',
            body: JSON.stringify({ kind: pick.kind, sourceId: +pick.record.id, ...values }),
          });
      toast(
        edit
          ? `Custom actualizado: ${saved.customIdentifier}`
          : `Custom guardado: ${saved.customIdentifier}`,
      );
      await maybeUploadCustomCodexImage(saved);
      return;
    }
  } catch (e) {
    toast(e.message || 'No se pudo abrir personalización');
  }
}
async function maybeUploadCustomCodexImage(saved) {
  const labels = { creature: 'criatura', item: 'objeto', spell: 'conjuro' };
  const choice = await openForm({
    title: 'Imagen custom',
    description: `Opcional: sube una imagen para representar este ${labels[saved.kind] || 'registro'} homebrew en el Codex.`,
    submitText: 'Elegir imagen',
    fields: [],
  });
  if (!choice) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('La imagen supera el límite de 15 MB');
    try {
      const fd = new FormData();
      fd.append('kind', saved.kind);
      fd.append('id', saved.id);
      fd.append('image', file);
      await api('/codex/customize/media', { method: 'POST', body: fd });
      toast('Imagen custom subida');
    } catch (e) {
      toast(e.message);
    }
  };
  input.click();
}
function openCodexSearchPopup() {
  return new Promise((resolve) => {
    if (dialog.open) dialog.close();
    $('#dialog-back').hidden = true;
    $('#dialog-title').textContent = 'Personalizar contenido';
    $('#dialog-description').textContent = 'Elige una categoría y busca por nombre o etiquetas.';
    $('#dialog-description').hidden = false;
    $('#dialog-error').textContent = '';
    $('#dialog-submit').textContent = 'Cerrar';
    $('#dialog-submit').className = 'primary';
    const wrap = $('#dialog-fields');
    wrap.innerHTML =
      '<fieldset><legend>Categoría</legend><label class="check-field"><input type="radio" name="customKind" value="creature" checked><span>Criaturas</span></label><label class="check-field"><input type="radio" name="customKind" value="item"><span>Objetos / ítems</span></label><label class="check-field"><input type="radio" name="customKind" value="spell"><span>Conjuros</span></label></fieldset><label><span>Buscar</span><input id="custom-search" autocomplete="off" placeholder="Ej. goblin, espada, fuego…"><small>Resultados sugeridos automáticamente desde la DB de la categoría elegida.</small></label><div id="custom-results" class="codex-search-results"></div>';
    let timer = null,
      done = false;
    const kindLabel = { creature: 'Criatura', item: 'Objeto', spell: 'Conjuro' };
    const finish = (v) => {
      if (done) return;
      done = true;
      releaseDialog();
      dialog.close();
      installDefaultDialogHandlers();
      resolve(v);
    };
    const currentKind = () =>
      wrap.querySelector('input[name="customKind"]:checked')?.value || 'creature';
    const search = async () => {
      const q = $('#custom-search').value.trim(),
        kind = currentKind(),
        res = $('#custom-results');
      res.innerHTML = '';
      if (q.length < 2) return;
      try {
        const data = await api(
          `/codex/records?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`,
        );
        data.records.forEach((r) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'codex-row';
          const meta =
            kind === 'creature'
              ? `${r.creature_size_name || ''} ${r.creature_type_name || ''}`
              : kind === 'spell'
                ? [
                    r.spell_level !== null && r.spell_level !== undefined
                      ? `Nivel ${+r.spell_level}`
                      : null,
                    r.magic_school_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : r.item_type_name || 'Objeto';
          b.innerHTML = `<div><strong>${esc(r.name)}</strong><br><small>${esc(meta || kindLabel[kind])}${r.tag_names ? ` · Tags: ${esc(r.tag_names)}` : ''}</small></div><span class="codex-count">Elegir</span>`;
          b.onclick = () => finish({ kind, record: r });
          res.append(b);
        });
        if (!data.records.length) res.innerHTML = '<p class="muted">Sin resultados.</p>';
      } catch (e) {
        res.innerHTML = `<p class="error">${esc(e.message)}</p>`;
      }
    };
    $('#custom-search').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(search, 250);
    };
    wrap.querySelectorAll('input[name="customKind"]').forEach(
      (r) =>
        (r.onchange = () => {
          $('#custom-results').innerHTML = '';
          clearTimeout(timer);
          timer = setTimeout(search, 150);
        }),
    );
    dialog.showModal();
    requestAnimationFrame(() => $('#custom-search').focus());
    $('#dialog-cancel').onclick = () => finish(null);
    $('#dialog-close').onclick = () => finish(null);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    dialogForm.onsubmit = (e) => {
      e.preventDefault();
      finish(null);
    };
  });
}
function baseCustomFields(r, edit = false) {
  return [
    {
      name: 'name',
      label: 'Nombre custom',
      required: true,
      value: edit ? r.name : `${r.name} Custom`,
    },
    {
      name: 'customIdentifier',
      label: 'Identificador custom',
      required: true,
      value: edit
        ? r.custom_identifier || `hb_${slug(r.name)}_custom`
        : `hb_${slug(r.name)}_custom`,
      help: edit
        ? 'Debe seguir siendo único.'
        : 'Código único para homebrew, por ejemplo hb_goblin_jefe. Las etiquetas/tags se copian del material base.',
    },
    { name: 'customTag', label: 'Tag custom', value: r.custom_tag || 'Homebrew' },
    { name: 'shortDescription', label: 'Resumen', value: r.short_description || '' },
    {
      name: 'description',
      label: 'Descripción',
      type: 'textarea',
      rows: 6,
      value: r.description || '',
    },
  ];
}
function creatureCustomFields(r, o, edit = false) {
  return [
    ...baseCustomFields(r, edit),
    {
      name: 'creatureTypeId',
      label: 'Tipo de criatura',
      type: 'select',
      options: opt(o.creatureTypes),
      value: r.creature_type_id || '',
    },
    {
      name: 'creatureSizeId',
      label: 'Tamaño',
      type: 'select',
      options: opt(o.creatureSizes),
      value: r.creature_size_id || '',
    },
    { name: 'armorClassText', label: 'Clase de armadura', value: r.armor_class_text || '' },
    { name: 'hitPointsText', label: 'Puntos de golpe', value: r.hit_points_text || '' },
    { name: 'speedText', label: 'Velocidad', value: r.speed_text || '' },
    ...['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((k) => ({
      name: k,
      label: {
        strength: 'STR',
        dexterity: 'DEX',
        constitution: 'CON',
        intelligence: 'INT',
        wisdom: 'WIS',
        charisma: 'CHA',
      }[k],
      type: 'number',
      min: 1,
      max: 30,
      value: r[k] || 10,
    })),
    {
      name: 'challengeRatingText',
      label: 'Challenge Rating',
      value: r.challenge_rating_text || '',
    },
    {
      name: 'experiencePoints',
      label: 'Experiencia',
      type: 'number',
      min: 0,
      value: r.experience_points || '',
    },
    {
      name: 'traitsText',
      label: 'Rasgos / acciones / notas',
      type: 'textarea',
      rows: 8,
      value: r.traits_text || '',
    },
    {
      name: 'equipmentText',
      label: 'Equipo',
      type: 'textarea',
      rows: 3,
      value: r.equipment_text || '',
    },
    { name: 'environmentText', label: 'Entorno', value: r.environment_text || '' },
  ];
}
export async function openNpcCreatureInfo(id) {
  let panel = $('#creature-info-popover');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'creature-info-popover';
    panel.className = 'creature-info-popover';
    document.body.append(panel);
  }
  panel.innerHTML =
    '<header><strong>Cargando…</strong><button type="button" class="icon-button">×</button></header><div class="creature-info-body"></div>';
  panel.querySelector('button').onclick = () => panel.remove();
  try {
    const data = await api(`/codex/record?category=creatures&id=${id}`),
      r = data.record,
      labels = data.labels || {};
    const fields = [
      ['Tipo', labels.type],
      ['Tamaño', labels.size],
      ['CA', r.armor_class_text],
      ['PV', r.hit_points_text],
      ['Velocidad', r.speed_text],
      ['STR', formatAbilityScore(r.strength)],
      ['DEX', formatAbilityScore(r.dexterity)],
      ['CON', formatAbilityScore(r.constitution)],
      ['INT', formatAbilityScore(r.intelligence)],
      ['WIS', formatAbilityScore(r.wisdom)],
      ['CHA', formatAbilityScore(r.charisma)],
      ['Tiradas de salvación', r.saving_throws_text],
      ['Habilidades', r.skills_text],
      ['Resistencias', r.damage_resistances_text],
      ['Inmunidades', r.damage_immunities_text],
      ['Vulnerabilidades', r.damage_vulnerabilities_text],
      ['Condiciones inmunes', r.condition_immunities_text],
      ['Sentidos', r.senses_text],
      ['Idiomas', r.languages_text],
      ['Desafío', r.challenge_rating_text],
      ['Entorno', r.environment_text],
      ['Tags', data.tags?.join(', ')],
    ].filter((x) => x[1]);
    const primary = data.media?.find((m) => m.purpose === 'portrait') || data.media?.[0];
    panel.innerHTML = `<header><strong>${esc(r.name)}</strong><button type="button" class="icon-button" aria-label="Cerrar">×</button></header><div class="creature-info-body">${primary ? `<a class="codex-portrait" href="${esc(primary.url)}" target="_blank" rel="noopener"><img src="${esc(primary.url)}" alt="${esc(primary.altText || r.name)}"></a>` : ''}<dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${r.traits_text ? `<h4>Rasgos</h4><div class="description">${esc(r.traits_text)}</div>` : ''}${r.description ? `<h4>Descripción</h4><div class="description">${esc(r.description)}</div>` : ''}</div>`;
    panel.querySelector('button').onclick = () => panel.remove();
  } catch (e) {
    panel.querySelector('.creature-info-body').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}
function itemCustomFields(r, o, edit = false) {
  return [
    ...baseCustomFields(r, edit),
    {
      name: 'itemTypeId',
      label: 'Tipo de objeto',
      type: 'select',
      options: opt(o.itemTypes),
      value: r.item_type_id || '',
    },
    {
      name: 'itemRarityId',
      label: 'Rareza',
      type: 'select',
      options: opt(o.itemRarities),
      value: r.item_rarity_id || '',
    },
    {
      name: 'requiresAttunement',
      label: 'Requiere sintonización',
      type: 'checkbox',
      value: +r.requires_attunement,
    },
    { name: 'isMagical', label: 'Es mágico', type: 'checkbox', value: +r.is_magical },
    { name: 'isConsumable', label: 'Es consumible', type: 'checkbox', value: +r.is_consumable },
    { name: 'weightText', label: 'Peso', value: r.weight_text || '' },
    { name: 'valueText', label: 'Valor', value: r.value_text || '' },
    { name: 'armorClassText', label: 'Clase de armadura', value: r.armor_class_text || '' },
    { name: 'damageText', label: 'Daño', value: r.damage_text || '' },
    {
      name: 'propertiesText',
      label: 'Propiedades',
      type: 'textarea',
      rows: 4,
      value: r.properties_text || '',
    },
    { name: 'chargesText', label: 'Cargas', value: r.charges_text || '' },
    { name: 'resourceCostText', label: 'Coste / recurso', value: r.resource_cost_text || '' },
    {
      name: 'requirementsText',
      label: 'Requisitos',
      type: 'textarea',
      rows: 3,
      value: r.requirements_text || '',
    },
  ];
}
function spellCustomFields(r, o, edit = false) {
  return [
    ...baseCustomFields(r, edit),
    {
      name: 'spellLevel',
      label: 'Nivel',
      type: 'number',
      min: 0,
      max: 9,
      value: r.spell_level ?? 0,
    },
    {
      name: 'magicSchoolId',
      label: 'Escuela',
      type: 'select',
      options: opt(o.magicSchools),
      value: r.magic_school_id || '',
    },
    {
      name: 'activationTypeId',
      label: 'Activación',
      type: 'select',
      options: opt(o.activationTypes),
      value: r.activation_type_id || '',
    },
    { name: 'rangeText', label: 'Alcance', value: r.range_text || '' },
    { name: 'durationText', label: 'Duración', value: r.duration_text || '' },
    { name: 'componentsText', label: 'Componentes', value: r.components_text || '' },
    {
      name: 'requiresConcentration',
      label: 'Requiere concentración',
      type: 'checkbox',
      value: +r.requires_concentration,
    },
    { name: 'isRitual', label: 'Ritual', type: 'checkbox', value: +r.is_ritual },
    {
      name: 'savingThrowTypeId',
      label: 'Tirada de salvación',
      type: 'select',
      options: opt(o.savingThrowTypes),
      value: r.saving_throw_type_id || '',
    },
    {
      name: 'attackRollTypeId',
      label: 'Tirada de ataque',
      type: 'select',
      options: opt(o.attackRollTypes),
      value: r.attack_roll_type_id || '',
    },
    { name: 'damageText', label: 'Daño', value: r.damage_text || '' },
    { name: 'healingText', label: 'Curación', value: r.healing_text || '' },
    { name: 'resourceCostText', label: 'Coste / recurso', value: r.resource_cost_text || '' },
    {
      name: 'scalingText',
      label: 'Escalado / niveles superiores',
      type: 'textarea',
      rows: 4,
      value: r.scaling_text || '',
    },
  ];
}
