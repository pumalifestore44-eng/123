import {readFileSync,writeFileSync} from 'node:fs';
const path='smax-chat-manager - Copy (2)/app.js';
let src=readFileSync(path,'utf8');
for(const [a,b] of [["            for (const member of activeShipmentBundle.members) {\n                if (typeof window.processChatbotTrigger === 'function')\n                    window.processChatbotTrigger(member.id, 9);\n            }\n            return;","            if (typeof window.processChatbotTrigger === 'function') {\n                // One parcel: avoid sending duplicate post-shipment messages to the same customer.\n                window.processChatbotTrigger(orderId, 9);\n            }\n            return;"],["        prepareGomshipPrintPreview(order.id);","        prepareGomshipPrintPreview(shipmentBundle.root.id);"]]){if(src.split(a).length!==2)throw Error('Expected one match: '+a.slice(0,120));src=src.replace(a,b)}
writeFileSync(path,src);console.log('Updated group UI callbacks and root label lookup');
