# Project Controls Code Picker

A dependency-free, browser-based tool that helps employees narrow an approved project-controls code dictionary using a plain-language spend description plus four exact dimensions:

- funding bucket;
- project phase;
- discipline; and
- cost type.

The tool is deterministic and explainable. Selected dimensions act as eligibility filters; description terms rank only the eligible codes. It never posts a transaction or represents a selection as approved.

## Important prototype status

The built-in **demo catalog** contains illustrative `DEMO-` codes only. Do not use those codes in a live system. The interface keeps this warning visible until a CSV is imported.

Every copied designation ends with:

> Status: Pending Project Controls / Finance confirmation

## Open the tool

No install or build is required.

1. Open [`index.html`](index.html) in a modern browser.
2. Describe the purchase or work.
3. Add any funding dimensions you know.
4. Review why each code matched.
5. Select a code and copy the review-ready designation.

For local HTTP testing from this folder:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>.

## Import approved CSV

Use **Catalog settings → Import approved CSV** and choose a controlled export of the current code dictionary. The imported file stays in browser memory for the current tab; the tool does not upload or persist it.

Start with [`code-catalog-template.csv`](code-catalog-template.csv).

| Field | Required | Format |
|---|---:|---|
| `code` | Yes | Unique code shown and copied by the tool |
| `name` | Yes | Controlled short name |
| `description` | Recommended | What belongs in the code |
| `fund` | Recommended | One or more values separated by semicolons |
| `phase` | Recommended | One or more values separated by semicolons |
| `discipline` | Recommended | One or more values separated by semicolons |
| `cost_type` | Recommended | One or more values separated by semicolons |
| `keywords` | Recommended | Plain-language synonyms separated by semicolons |
| `active` | Recommended | `true` or `false`; blank defaults to `true` |
| `requires_review` | Optional | `true` or `false`; blank defaults to `false` |
| `review_note` | Optional | Approval or routing rule shown with the selection |

Use `all` as a wildcard in a dimension. The dropdown vocabulary is derived from the imported catalog, so the tool does not require a fixed set of demo labels.

Imports fail closed when a row has no code, no name, or a duplicate code. Any error leaves the currently loaded catalog unchanged.

## Controls and boundaries

- Suggestions support — and never replace — approved accounting and project-controls authority.
- Inactive codes are hidden by default and cannot be selected even when shown for audit.
- Contingency, change, allowance, reimbursable, and operating-expense examples carry additional review notes.
- The copied output includes the catalog name and a pending-confirmation status.
- Search descriptions, project references, amounts, and imported catalogs stay in the browser tab.

## Verification

Run all automated checks from this folder:

```bash
node --test
```

The tests cover ranking, exact-dimension eligibility, inactive-code handling, CSV parsing and validation, designation formatting, the demo catalog, the CSV template, helper copy, and required interface structure.

Optional syntax checks:

```bash
node --check picker-core.js
node --check catalog.js
node --check app.js
```

## Files

- `index.html` — employee-facing interface
- `styles.css` — responsive visual system
- `picker-core.js` — ranking, CSV validation, facets, and designation formatting
- `catalog.js` — clearly labeled demo catalog
- `app.js` — browser interaction and import workflow
- `code-catalog-template.csv` — starter import structure
- `tests/` — dependency-free Node test suite
