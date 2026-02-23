const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function parseFile(filePath, mimetype) {
  const buffer = fs.readFileSync(filePath);

  if (
    mimetype === 'application/pdf' ||
    path.extname(filePath).toLowerCase() === '.pdf'
  ) {
    return parsePdf(buffer);
  }

  if (
    mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    path.extname(filePath).toLowerCase() === '.docx'
  ) {
    return parseDocx(buffer);
  }

  if (
    mimetype === 'text/plain' ||
    path.extname(filePath).toLowerCase() === '.txt'
  ) {
    return buffer.toString('utf-8');
  }

  throw new Error(
    `Unsupported file type: ${mimetype || path.extname(filePath)}`
  );
}

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

module.exports = { parseFile };
