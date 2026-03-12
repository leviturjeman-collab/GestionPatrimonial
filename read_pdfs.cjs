const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const run = async () => {
    const d1 = await pdfParse(fs.readFileSync(path.join(__dirname, 'CUENTA PERDIDAS Y GANANCIAS.pdf')));
    process.stdout.write('=PYG=\n' + d1.text + '\n');
    const d2 = await pdfParse(fs.readFileSync(path.join(__dirname, 'BALANCE DE SITUACION.pdf')));
    process.stdout.write('=BAL=\n' + d2.text + '\n');
};
run().catch(e => { console.error(e.message); process.exit(1); });
