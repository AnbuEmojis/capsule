// backend/services/csv.js
function toCsv({ columns, rows }) {
    const esc = v => (v == null ? '' : String(v).replace(/"/g, '""'));
    const head = columns.map(c => `"${c.header}"`).join(',');
    const body = rows
      .map(r => columns.map(c => `"${esc(c.accessor(r))}"`).join(','))
      .join('\n');
    return head + '\n' + body + '\n';
  }
  module.exports = { toCsv };
  