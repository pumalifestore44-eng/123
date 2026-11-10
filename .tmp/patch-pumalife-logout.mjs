import {readFileSync,writeFileSync} from 'node:fs';
const p=new URL('../app.js',import.meta.url);let s=readFileSync(p,'utf8');
const edits=[
["import { getPumalifeAccessToken, signInPumalife } from './pumalife-session.mjs';","import { getPumalifeAccessToken, signInPumalife, clearPumalifeSession } from './pumalife-session.mjs';"],
["                localStorage.removeItem('is_logged_in');\n                window.location.reload();","                clearPumalifeSession();\n                window.location.reload();"]
];
for(const [a,b] of edits){if(s.split(a).length!==2)throw Error('Expected one match: '+a);s=s.replace(a,b)}
writeFileSync(p,s);
console.log('Logout clears Supabase Auth session and old login flag');
