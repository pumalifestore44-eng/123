// Generate public Supabase config from the existing Pumalife app.
const fs=require('fs'),path=require('path');
const raw=fs.readFileSync(path.resolve(__dirname,'../../supabase-config.mjs'),'utf8');
const m=raw.match(/Object\.freeze\((\{[\s\S]*?\})\)/);
if(!m)throw Error('Could not read primary Supabase settings');
const settings=JSON.parse(m[1]);
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(settings.url) || !settings.anonKey)
 throw Error('Invalid Supabase URL/anon key');
fs.writeFileSync(path.join(__dirname,'config.mjs'),
 '// Public Supabase anon key only. NEVER include service_role credentials.\n'+
 'export const SUPABASE_URL = '+JSON.stringify(settings.url)+';\n'+
 'export const SUPABASE_ANON_KEY = '+JSON.stringify(settings.anonKey)+';\n');
console.log('Generated config.mjs with Pumalife public Supabase settings.');
