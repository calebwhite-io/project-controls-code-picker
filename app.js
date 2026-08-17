(function initCodePickerApp(root, factory) {
  const commonJs = typeof module === 'object' && module.exports;
  const core = commonJs ? require('./picker-core.js') : root.PickerCore;
  const api = factory(core);

  if (commonJs) {
    module.exports = api;
  }
  if (root) {
    root.CodePickerApp = api;
  }

  if (root && root.document) {
    root.__codePickerErrors = root.__codePickerErrors || [];
    root.addEventListener('error', (event) => {
      root.__codePickerErrors.push(event.message || 'Unknown browser error');
    });
    root.addEventListener('unhandledrejection', (event) => {
      root.__codePickerErrors.push(String(event.reason || 'Unhandled promise rejection'));
    });

    const boot = () => {
      try {
        root.CodePickerInstance = api.mount(root.document, root.CodePickerCatalog);
      } catch (error) {
        root.__codePickerErrors.push(error.message);
        const panel = root.document.getElementById('app-error');
        if (panel) {
          panel.textContent = `The code picker could not start: ${error.message}`;
          panel.hidden = false;
        }
      }
    };

    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCodePickerApp(core) {
  'use strict';

  const PRESETS = {
    generator: {
      query: 'purchase generator package',
      fund: 'owner-furnished',
      phase: '3-procurement',
      discipline: 'electrical',
      costType: 'equipment',
    },
    'temp-power': {
      query: 'temporary construction power',
      fund: 'base-capital',
      phase: '4-installation',
      discipline: 'electrical',
      costType: 'temporary-works',
    },
    commissioning: {
      query: 'commissioning authority services',
      fund: 'base-capital',
      phase: '5-commissioning',
      discipline: 'commissioning',
      costType: 'professional-services',
    },
    change: {
      query: 'approved change budget',
      fund: 'approved-change',
      phase: '',
      discipline: '',
      costType: 'other',
    },
  };

  function humanize(value) {
    const text = String(value == null ? '' : value).replace(/[-_]+/g, ' ').trim();
    if (!text) return '';
    const phase = text.match(/^(\d+)\s+(.+)$/);
    const normalized = phase ? phase[2] : text;
    let label = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    label = label
      .replace(/\bBms\b/g, 'BMS')
      .replace(/\bEpms\b/g, 'EPMS')
      .replace(/\bUps\b/g, 'UPS')
      .replace(/\bCctv\b/g, 'CCTV')
      .replace(/\bOem\b/g, 'OEM');
    return phase ? `${phase[1]} · ${label}` : label;
  }

  function hasCriteria(criteria = {}) {
    return ['query', 'fund', 'phase', 'discipline', 'costType']
      .some((key) => String(criteria[key] || '').trim());
  }

  function getResultReason(result, index) {
    const parts = [index === 0 && result.confidence === 'strong' ? 'Best fit' : 'Possible match'];
    const facetCount = Array.isArray(result.matchedFacets) ? result.matchedFacets.length : 0;
    const termCount = Array.isArray(result.matchedTerms) ? result.matchedTerms.length : 0;
    if (facetCount) {
      parts.push(`matches all ${facetCount} selected dimension${facetCount === 1 ? '' : 's'}`);
    }
    if (termCount) {
      parts.push(`${termCount} description term${termCount === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  }

  function mount(doc, initialCatalog) {
    if (!core || typeof core.suggestCodes !== 'function') {
      throw new Error('The selection engine is unavailable.');
    }
    if (!initialCatalog || !Array.isArray(initialCatalog.entries)) {
      throw new Error('No code catalog was loaded.');
    }

    const view = doc.defaultView || globalThis;
    const byId = (id) => {
      const element = doc.getElementById(id);
      if (!element) throw new Error(`Required interface element #${id} is missing.`);
      return element;
    };
    const elements = {
      form: byId('criteria-form'),
      query: byId('scope-query'),
      clearQuery: byId('clear-query'),
      fund: byId('fund-filter'),
      phase: byId('phase-filter'),
      discipline: byId('discipline-filter'),
      costType: byId('cost-type-filter'),
      reset: byId('reset-criteria'),
      results: byId('results'),
      resultCount: byId('result-count'),
      selectionEmpty: byId('selection-empty'),
      selectionContent: byId('selection-content'),
      selectedCode: byId('selected-code'),
      selectedName: byId('selected-name'),
      selectedDescription: byId('selected-description'),
      selectedTags: byId('selected-tags'),
      reviewWarning: byId('review-warning'),
      reviewNote: byId('review-note'),
      projectReference: byId('project-reference'),
      amount: byId('amount'),
      copySummary: byId('copy-summary'),
      copyCode: byId('copy-code'),
      file: byId('catalog-file'),
      restoreDemo: byId('restore-demo'),
      includeInactive: byId('include-inactive'),
      catalogStatus: byId('catalog-status'),
      catalogCount: byId('catalog-count'),
      catalogMode: byId('catalog-mode'),
      catalogErrors: byId('catalog-errors'),
      demoBanner: byId('demo-banner'),
      toast: byId('toast'),
    };

    const demoCatalog = initialCatalog;
    const state = {
      catalog: initialCatalog.entries.slice(),
      catalogName: initialCatalog.name,
      isDemo: Boolean(initialCatalog.isDemo),
      selected: null,
      lastResults: [],
      toastTimer: null,
    };

    function create(tag, className, text) {
      const element = doc.createElement(tag);
      if (className) element.className = className;
      if (text != null) element.textContent = String(text);
      return element;
    }

    function currentCriteria() {
      return {
        query: elements.query.value.trim(),
        fund: elements.fund.value,
        phase: elements.phase.value,
        discipline: elements.discipline.value,
        costType: elements.costType.value,
        includeInactive: elements.includeInactive.checked,
      };
    }

    function primaryValue(entry, key) {
      const values = Array.isArray(entry[key]) ? entry[key] : [entry[key]];
      return values.find((value) => value && value !== 'all') || values.find(Boolean) || '';
    }

    function buildTags(entry, target) {
      target.replaceChildren();
      const values = [
        primaryValue(entry, 'fund'),
        primaryValue(entry, 'phase'),
        primaryValue(entry, 'discipline'),
        primaryValue(entry, 'costType'),
      ].filter(Boolean);
      for (const value of values) {
        target.append(create('span', '', humanize(value)));
      }
    }

    function populateSelect(select, key) {
      const previous = select.value;
      while (select.options.length > 1) select.remove(1);
      for (const value of core.getFacetOptions(state.catalog, key)) {
        const option = create('option', '', humanize(value));
        option.value = value;
        select.add(option);
      }
      if ([...select.options].some((option) => option.value === previous)) {
        select.value = previous;
      }
    }

    function populateFilters() {
      populateSelect(elements.fund, 'fund');
      populateSelect(elements.phase, 'phase');
      populateSelect(elements.discipline, 'discipline');
      populateSelect(elements.costType, 'costType');
    }

    function showEmpty(title, message, marker) {
      const empty = create('div', 'empty-state');
      if (marker) empty.append(create('span', 'empty-index', marker));
      empty.append(create('h3', '', title));
      empty.append(create('p', '', message));
      elements.results.replaceChildren(empty);
    }

    function createResultCard(result, index) {
      const classes = ['result-card'];
      if (index === 0 && result.active !== false) classes.push('best-fit');
      if (result.active === false) classes.push('inactive');
      if (state.selected && state.selected.code === result.code) classes.push('selected');
      const card = create('article', classes.join(' '));
      card.dataset.code = result.code;

      const topline = create('div', 'result-topline');
      topline.append(create('span', 'code-label', result.code));
      if (result.active === false) {
        topline.append(create('span', 'inactive-badge', 'Inactive'));
      } else if (index === 0) {
        topline.append(create('span', 'fit-badge', result.confidence === 'strong' ? 'Best fit' : 'Top match'));
      }
      card.append(topline);
      card.append(create('h3', '', result.name));
      card.append(create('p', '', result.description || 'No catalog description provided.'));
      card.append(create('p', 'match-reason', getResultReason(result, index)));

      const footer = create('div', 'result-footer');
      const tags = create('div', 'result-tags');
      buildTags(result, tags);
      footer.append(tags);
      const button = create('button', 'choose-code', result.active === false ? 'Inactive code' : 'Use this code');
      button.type = 'button';
      button.dataset.selectCode = result.code;
      button.disabled = result.active === false;
      button.setAttribute('aria-label', `${result.active === false ? 'Inactive' : 'Use'} ${result.code}: ${result.name}`);
      footer.append(button);
      card.append(footer);
      return card;
    }

    function renderSelection() {
      if (!state.selected) {
        elements.selectionEmpty.hidden = false;
        elements.selectionContent.hidden = true;
        return;
      }

      elements.selectionEmpty.hidden = true;
      elements.selectionContent.hidden = false;
      elements.selectedCode.textContent = state.selected.code;
      elements.selectedName.textContent = state.selected.name;
      elements.selectedDescription.textContent = state.selected.description || 'No catalog description provided.';
      buildTags(state.selected, elements.selectedTags);
      const needsReview = Boolean(state.selected.requiresReview);
      elements.reviewWarning.hidden = !needsReview;
      elements.reviewNote.textContent = needsReview
        ? state.selected.reviewNote || 'Confirm this designation with the accountable reviewer.'
        : '';
    }

    function renderResults() {
      const criteria = currentCriteria();
      elements.clearQuery.hidden = !criteria.query;
      if (!hasCriteria(criteria)) {
        state.lastResults = [];
        elements.resultCount.textContent = 'Waiting for details';
        showEmpty(
          'Start with the purchase or work.',
          'Describe the spend or choose an example. Add dimensions when you know them to rule out ineligible codes.',
          '01 → 02',
        );
        return;
      }

      const results = core.suggestCodes(state.catalog, criteria);
      state.lastResults = results;
      const activeCount = results.filter((entry) => entry.active !== false).length;
      const inactiveCount = results.length - activeCount;
      elements.resultCount.textContent = inactiveCount
        ? `${activeCount} active · ${inactiveCount} inactive`
        : `${activeCount} match${activeCount === 1 ? '' : 'es'}`;

      if (!results.length) {
        showEmpty(
          'No eligible code matches every detail.',
          'Remove one dimension or use a broader description. If the work is new, route it to Project Controls instead of forcing a near match.',
          'NO MATCH',
        );
        return;
      }

      const fragment = doc.createDocumentFragment();
      results.forEach((result, index) => fragment.append(createResultCard(result, index)));
      elements.results.replaceChildren(fragment);
    }

    function render() {
      renderResults();
      renderSelection();
    }

    function setSelectValue(select, value) {
      const exists = [...select.options].some((option) => option.value === value);
      select.value = exists ? value : '';
      return exists || !value;
    }

    function applyPreset(name) {
      const preset = PRESETS[name];
      if (!preset) return false;
      elements.query.value = preset.query;
      const complete = [
        setSelectValue(elements.fund, preset.fund),
        setSelectValue(elements.phase, preset.phase),
        setSelectValue(elements.discipline, preset.discipline),
        setSelectValue(elements.costType, preset.costType),
      ].every(Boolean);
      state.selected = null;
      render();
      if (!complete) showToast('Some preset dimensions are not present in this catalog.');
      return complete;
    }

    function selectCode(code) {
      const entry = state.catalog.find((candidate) => candidate.code === code && candidate.active !== false);
      if (!entry) return false;
      state.selected = entry;
      render();
      return true;
    }

    function showToast(message) {
      if (state.toastTimer) view.clearTimeout(state.toastTimer);
      elements.toast.textContent = message;
      elements.toast.hidden = false;
      state.toastTimer = view.setTimeout(() => {
        elements.toast.hidden = true;
      }, 2600);
    }

    async function copyText(text, successMessage) {
      if (!text) return false;
      let copied = false;

      if (view.navigator && view.navigator.clipboard && view.isSecureContext) {
        try {
          await view.navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }

      if (!copied) {
        const temporary = create('textarea', '', text);
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        doc.body.append(temporary);
        temporary.select();
        try {
          copied = typeof doc.execCommand === 'function' && doc.execCommand('copy');
        } catch (error) {
          copied = false;
        } finally {
          temporary.remove();
        }
      }

      if (copied) {
        showToast(successMessage);
        return true;
      }
      showToast('Copy was blocked by the browser. Select the text manually.');
      return false;
    }

    function clearSelectionForCriteriaChange() {
      state.selected = null;
      render();
    }

    function showCatalogErrors(errors) {
      elements.catalogErrors.replaceChildren();
      if (!errors.length) {
        elements.catalogErrors.hidden = true;
        return;
      }
      elements.catalogErrors.append(create('strong', '', 'Import not applied. Fix these catalog issues:'));
      const list = create('ul');
      errors.slice(0, 12).forEach((error) => list.append(create('li', '', error)));
      if (errors.length > 12) list.append(create('li', '', `${errors.length - 12} more issue(s)`));
      elements.catalogErrors.append(list);
      elements.catalogErrors.hidden = false;
    }

    function updateCatalogDisplay() {
      const active = state.catalog.filter((entry) => entry.active !== false).length;
      const inactive = state.catalog.length - active;
      elements.catalogStatus.textContent = state.catalogName;
      elements.catalogCount.textContent = `${active} active code${active === 1 ? '' : 's'} · ${inactive} inactive code${inactive === 1 ? '' : 's'}`;
      elements.catalogMode.textContent = state.isDemo ? 'DEMO' : 'IMPORTED';
      elements.catalogMode.className = `mode-badge ${state.isDemo ? 'demo' : 'imported'}`;
      elements.restoreDemo.hidden = state.isDemo;

      const bannerLabel = elements.demoBanner.querySelector('strong');
      const bannerMessage = elements.demoBanner.querySelector('span');
      elements.demoBanner.classList.toggle('imported', !state.isDemo);
      bannerLabel.textContent = state.isDemo ? 'Demo catalog' : 'Imported catalog';
      bannerMessage.textContent = state.isDemo
        ? 'Illustrative DEMO- codes are loaded. Do not use them in a live transaction.'
        : `${state.catalogName} is active for this tab. Confirm it is the current approved source before posting.`;
    }

    function resetWorkspace() {
      elements.form.reset();
      elements.projectReference.value = '';
      elements.amount.value = '';
      elements.includeInactive.checked = false;
      state.selected = null;
    }

    async function importCatalog(file) {
      if (!file) return false;
      let text;
      try {
        text = await file.text();
      } catch (error) {
        showCatalogErrors(['The selected file could not be read.']);
        return false;
      }
      const parsed = core.parseCatalogCsv(text);
      if (parsed.errors.length || !parsed.catalog.length) {
        const errors = parsed.errors.length ? parsed.errors : ['The file contains no usable code rows.'];
        showCatalogErrors(errors);
        return false;
      }

      state.catalog = parsed.catalog;
      state.catalogName = `${file.name} · imported for this tab`;
      state.isDemo = false;
      resetWorkspace();
      populateFilters();
      showCatalogErrors([]);
      updateCatalogDisplay();
      render();
      showToast(`${parsed.catalog.length} code${parsed.catalog.length === 1 ? '' : 's'} imported.`);
      return true;
    }

    function restoreDemoCatalog() {
      state.catalog = demoCatalog.entries.slice();
      state.catalogName = demoCatalog.name;
      state.isDemo = Boolean(demoCatalog.isDemo);
      elements.file.value = '';
      resetWorkspace();
      populateFilters();
      showCatalogErrors([]);
      updateCatalogDisplay();
      render();
      showToast('Demo catalog restored.');
    }

    elements.query.addEventListener('input', clearSelectionForCriteriaChange);
    [elements.fund, elements.phase, elements.discipline, elements.costType]
      .forEach((select) => select.addEventListener('change', clearSelectionForCriteriaChange));
    elements.clearQuery.addEventListener('click', () => {
      elements.query.value = '';
      state.selected = null;
      elements.query.focus();
      render();
    });
    elements.form.addEventListener('reset', () => {
      view.setTimeout(() => {
        state.selected = null;
        elements.projectReference.value = '';
        elements.amount.value = '';
        render();
      }, 0);
    });
    doc.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => applyPreset(button.dataset.preset));
    });
    elements.results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-select-code]');
      if (button) selectCode(button.dataset.selectCode);
    });
    elements.includeInactive.addEventListener('change', render);
    elements.copyCode.addEventListener('click', () => {
      if (state.selected) copyText(state.selected.code, 'Code copied.');
    });
    elements.copySummary.addEventListener('click', () => {
      if (!state.selected) return;
      const summary = core.buildDesignation(state.selected, {
        project: elements.projectReference.value,
        purpose: elements.query.value,
        amount: elements.amount.value,
        catalogName: state.catalogName,
      });
      copyText(summary, 'Designation copied for review.');
    });
    elements.file.addEventListener('change', () => {
      importCatalog(elements.file.files && elements.file.files[0]);
    });
    elements.restoreDemo.addEventListener('click', restoreDemoCatalog);

    populateFilters();
    updateCatalogDisplay();
    render();
    doc.documentElement.dataset.codePickerReady = 'true';

    return {
      applyPreset,
      getState: () => ({
        catalogName: state.catalogName,
        isDemo: state.isDemo,
        selectedCode: state.selected ? state.selected.code : null,
        resultCodes: state.lastResults.map((entry) => entry.code),
      }),
      importCatalog,
      render,
      restoreDemoCatalog,
      selectCode,
    };
  }

  return { getResultReason, hasCriteria, humanize, mount };
});
