function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (insideQuotes) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      insideQuotes = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      row.push(value);
      if (row.some((field) => field.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
    } else {
      value += character;
    }
  }

  if (insideQuotes) {
    throw new Error("Le fichier CSV contient une valeur mal formée.");
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    if (row.some((field) => field.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function encoderValeurCsv(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function encoderLigneCsv(values) {
  return values.map(encoderValeurCsv).join(",");
}

module.exports = { parseCsv, encoderValeurCsv, encoderLigneCsv };
