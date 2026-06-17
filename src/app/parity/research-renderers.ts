import { $, clear, html } from './shared';

export function renderResearchTable(targetId: string, headers: string[], rows: string[][], emptyText: string): void {
  const box = $(targetId);
  clear(box);
  if (!box) return;
  if (!rows.length) {
    box.append(html('div', { className: 'research-summary', text: emptyText }));
    return;
  }
  const table = html('table', { className: 'research-table' });
  const head = html('tr');
  headers.forEach((header) => head.append(html('th', { text: header })));
  table.append(head);
  rows.forEach((cells) => {
    const tr = html('tr');
    cells.forEach((cell) => tr.append(html('td', { text: cell })));
    table.append(tr);
  });
  box.append(table);
}
