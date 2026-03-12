const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'pages', 'RestaurantModelPage.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Remove justEat and deliveryPropio from Inputs interface
c = c.replace(
    /\s*justEatActive: string; justEatOrdersMonth: string; justEatTicket: string; justEatCommission: string\r?\n/g, '\n'
);
c = c.replace(
    /\s*deliveryPropio: string; deliveryPropioOrdersMonth: string; deliveryPropioTicket: string; deliveryPropioCost: string\r?\n/g, '\n'
);

// 2. Remove from DEFAULTS
c = c.replace(
    /\s*justEatActive: 'no', justEatOrdersMonth: '0', justEatTicket: '20', justEatCommission: '25',\r?\n/g, '\n'
);
c = c.replace(
    /\s*deliveryPropio: 'no', deliveryPropioOrdersMonth: '0', deliveryPropioTicket: '24', deliveryPropioCost: '3',\r?\n/g, '\n'
);

// 3. Remove from computeModel - justEat and dp variables + dpExtraCost
c = c.replace(
    /\s*const je = calcPlatform\([^)]+\)\r?\n/g, '\n'
);
c = c.replace(
    /\s*const dp = calcPlatform\([^)]+\)\r?\n/g, '\n'
);
c = c.replace(
    /\s*\/\/ For propio delivery.*\r?\n\s*const dpExtraCost = [^\r\n]+\r?\n/g, '\n'
);
// Update the aggregate lines
c = c.replace(
    'const revDeliveryGross = ue.gross + gl.gross + je.gross + dp.gross',
    'const revDeliveryGross = ue.gross + gl.gross'
);
c = c.replace(
    'const revDelivery = ue.netRev + gl.netRev + je.netRev + dp.netRev - dpExtraCost',
    'const revDelivery = ue.netRev + gl.netRev'
);
c = c.replace(
    'const totalDeliveryCommissions = ue.commissionCost + gl.commissionCost + je.commissionCost',
    'const totalDeliveryCommissions = ue.commissionCost + gl.commissionCost'
);
c = c.replace(
    'const totalDeliveryOrders = ue.orders + gl.orders + je.orders + dp.orders',
    'const totalDeliveryOrders = ue.orders + gl.orders'
);
// Update return value — remove je and dp
c = c.replace(
    'revDeliveryGross, totalDeliveryCommissions, totalDeliveryOrders, ue, gl, je, dp, g',
    'revDeliveryGross, totalDeliveryCommissions, totalDeliveryOrders, ue, gl, g'
);

// 4. Fix line 640 - remove old pctCanalDelivery and ticketDelivery references
c = c.replace(
    /formula=\{`\$\{inp\.pctCanalDelivery\}% canal × \$\{inp\.ticketDelivery\}€ ticket`\}/g,
    `formula={\`Uber Eats + Glovo · Neto: \${fmtEur(model.revDelivery)}\`}`
);

// 5. Remove the Just Eat block from UI (the whole object in the map array)
c = c.replace(
    /\s*\{[\r\n\s]*key: 'justEat', label: '🔴 Just Eat',[^}]+\},[\r\n]/g,
    '\n'
);

// 6. Remove the "Delivery propio" block from UI - find and remove it
// (from {/* Delivery propio */} to the closing </div> + blank line before summary)
const ownDeliveryStart = c.indexOf('{/* Delivery propio */}');
const ownDeliveryEnd = c.indexOf('{/* Delivery summary */}');
if (ownDeliveryStart > -1 && ownDeliveryEnd > -1) {
    c = c.slice(0, ownDeliveryStart) + c.slice(ownDeliveryEnd);
}

// 7. Update summary block to only show UberEats + Glovo
c = c.replace(
    /inp\.justEatActive === 'sí' \|\| inp\.deliveryPropio === 'sí'/g,
    ''
);
c = c.replace(
    '(inp.uberEatsActive === \'sí\' || inp.glovoActive === \'sí\' || )',
    '(inp.uberEatsActive === \'sí\' || inp.glovoActive === \'sí\')'
);
// Fix the condition check
c = c.replace(
    "(inp.uberEatsActive === 'sí' || inp.glovoActive === 'sí' || inp.justEatActive === 'sí' || inp.deliveryPropio === 'sí')",
    "(inp.uberEatsActive === 'sí' || inp.glovoActive === 'sí')"
);
// Remove justEat lines from summary totalGross
c = c.replace(
    /\s*inp\.justEatActive === 'sí' \? [^\n]+justEat[^\n]+: 0,\r?\n/g, '\n'
);
// Remove justEat lines from summary totalComm
c = c.replace(
    /\s*inp\.justEatActive === 'sí' \? [^\n]+[^\n]+: 0,\r?\n/g, '\n'
);

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done. File written:', filePath);
