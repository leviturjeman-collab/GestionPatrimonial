import { readFileSync } from 'fs';
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;

const r1 = await pdfParse(readFileSync('CUENTA PERDIDAS Y GANANCIAS.pdf'));
const r2 = await pdfParse(readFileSync('BALANCE DE SITUACION.pdf'));
console.log('=== PYG ===\n', r1.text);
console.log('=== BALANCE ===\n', r2.text);
