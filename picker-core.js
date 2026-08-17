(function initPickerCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PickerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickerCore() {
  'use strict';

  const FACETS = [
    { key: 'fund', label: 'funding bucket', weight: 30 },
    { key: 'phase', label: 'phase', weight: 24 },
    { key: 'discipline', label: 'discipline', weight: 26 },
    { key: 'costType', label: 'cost type', weight: 20 },
  ];

  function clean(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function terms(value) {
    return clean(value)
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1);
  }

  function valuesFor(entry, key) {
    const value = entry[key];
    return (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
  }

  function getFacetOptions(catalog, key) {
    const options = new Set();
    for (const entry of Array.isArray(catalog) ? catalog : []) {
      if (!entry || entry.active === false) continue;
      for (const value of valuesFor(entry, key)) {
        if (value !== 'all') options.add(value);
      }
    }
    return [...options].sort((left, right) => left.localeCompare(right));
  }

  function readCsvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text == null ? '' : text).replace(/^\uFEFF/, '');

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ',') {
        row.push(field);
        field = '';
      } else if (character === '\n') {
        row.push(field.replace(/\r$/, ''));
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }

    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
  }

  function splitList(value) {
    return String(value == null ? '' : value)
      .split(/[;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseBoolean(value, defaultValue) {
    const normalized = clean(value);
    if (!normalized) return defaultValue;
    return ['true', 'yes', '1', 'active'].includes(normalized);
  }

  function parseCatalogCsv(text) {
    const rows = readCsvRows(text);
    if (!rows.length) return { catalog: [], errors: [] };
    const headers = rows[0].map((header) => clean(header).replace(/[^a-z0-9]+/g, '_'));
    const catalog = [];
    const errors = [];
    const seenCodes = new Set();

    rows.slice(1).forEach((values, rowIndex) => {
      const source = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      const field = (key) => String(source[key] == null ? '' : source[key]).trim();
      const code = field('code');
      const name = field('name');
      const displayRow = rowIndex + 2;

      if (!code) {
        errors.push(`Row ${displayRow}: code is required.`);
        return;
      }
      if (!name) {
        errors.push(`Row ${displayRow}: name is required.`);
        return;
      }
      if (seenCodes.has(clean(code))) {
        errors.push(`Row ${displayRow}: duplicate code “${code}”.`);
        return;
      }
      seenCodes.add(clean(code));

      catalog.push({
        code,
        name,
        description: field('description'),
        fund: splitList(field('fund')),
        phase: splitList(field('phase')),
        discipline: splitList(field('discipline')),
        costType: splitList(field('cost_type')),
        keywords: splitList(field('keywords')),
        active: parseBoolean(field('active'), true),
        requiresReview: parseBoolean(field('requires_review'), false),
        reviewNote: field('review_note'),
      });
    });
    return { catalog, errors };
  }

  function buildDesignation(entry, context = {}) {
    if (!entry) return '';
    const label = (value) => {
      const text = String(value == null ? '' : value).replace(/[-_]+/g, ' ').trim();
      return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
    };
    const amountValue = Number(String(context.amount == null ? '' : context.amount).replace(/[$,\s]/g, ''));
    const amount = Number.isFinite(amountValue) && String(context.amount || '').trim()
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountValue)
      : String(context.amount || '').trim();
    const fund = valuesFor(entry, 'fund')[0];
    const lines = ['PROJECT CONTROLS CODE SELECTION'];

    if (String(context.project || '').trim()) {
      lines.push(`Project / reference: ${String(context.project).trim()}`);
    }
    if (String(context.purpose || '').trim()) {
      lines.push(`Purpose: ${String(context.purpose).trim()}`);
    }
    if (amount) lines.push(`Amount: ${amount}`);
    lines.push(`Code: ${entry.code}`);
    lines.push(`Code name: ${entry.name}`);
    if (fund) lines.push(`Funding bucket: ${label(fund)}`);
    if (String(context.catalogName || '').trim()) {
      lines.push(`Catalog: ${String(context.catalogName).trim()}`);
    }
    lines.push('Status: Pending Project Controls / Finance confirmation');
    if (entry.requiresReview && String(entry.reviewNote || '').trim()) {
      lines.push(`Review note: ${String(entry.reviewNote).trim()}`);
    }
    return lines.join('\n');
  }

  function suggestCodes(catalog, criteria = {}) {
    const queryTerms = terms(criteria.query);

    return (Array.isArray(catalog) ? catalog : [])
      .filter((entry) => entry && (criteria.includeInactive || entry.active !== false))
      .filter((entry) => FACETS.every((facet) => {
        const selected = clean(criteria[facet.key]);
        if (!selected) return true;
        const options = valuesFor(entry, facet.key);
        return options.includes(selected) || options.includes('all');
      }))
      .map((entry) => {
        let score = 0;
        const matchedFacets = [];

        for (const facet of FACETS) {
          const selected = clean(criteria[facet.key]);
          if (!selected) continue;
          const options = valuesFor(entry, facet.key);
          if (options.includes(selected) || options.includes('all')) {
            score += facet.weight;
            matchedFacets.push(facet.label);
          } else {
            score -= facet.weight;
          }
        }

        const haystack = clean([
          entry.code,
          entry.name,
          entry.description,
          ...(Array.isArray(entry.keywords) ? entry.keywords : [entry.keywords]),
        ].join(' '));
        const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
        score += matchedTerms.length * 12;
        if (queryTerms.length && matchedTerms.length === queryTerms.length) score += 8;

        const confidence = matchedFacets.length >= 3 && (!queryTerms.length || matchedTerms.length)
          ? 'strong'
          : matchedFacets.length >= 2 || matchedTerms.length >= 2
            ? 'possible'
            : 'broad';

        return { ...entry, score, confidence, matchedFacets, matchedTerms };
      })
      .filter((result) => !queryTerms.length || result.matchedTerms.length > 0)
      .sort((left, right) =>
        right.score - left.score || String(left.code).localeCompare(String(right.code)),
      );
  }

  return {
    buildDesignation,
    getFacetOptions,
    parseCatalogCsv,
    suggestCodes,
  };
});
