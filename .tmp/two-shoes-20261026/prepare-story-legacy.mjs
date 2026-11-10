import fs from 'node:fs/promises';
const m=JSON.parse(await fs.readFile(new URL('./story-manifest.json',import.meta.url),'utf8'));m.taskId+='-legacy-mirror';await fs.writeFile(new URL('./story-legacy-manifest.json',import.meta.url),JSON.stringify(m,null,2));
let runner=await fs.readFile(new URL('./run-story-reviewed.mjs',import.meta.url),'utf8');runner=runner.replace('{supabase,supabaseAiEditing}','{supabaseLegacy as supabase,supabaseAiEditing}').replace("'./story-manifest.json'","'./story-legacy-manifest.json'");await fs.writeFile(new URL('./run-story-legacy.mjs',import.meta.url),runner);
