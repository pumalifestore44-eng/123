import {fileURLToPath} from 'node:url';
import {supabase,supabaseAiEditing} from '../../../autoclick/web-app/src/lib/supabase.js';
process.env.POSTS_SUPABASE_URL=supabase.supabaseUrl;process.env.POSTS_SUPABASE_KEY=supabase.supabaseKey;
process.env.AI_EDITING_SUPABASE_URL=supabaseAiEditing.supabaseUrl;process.env.AI_EDITING_SUPABASE_KEY=supabaseAiEditing.supabaseKey;
const action=process.argv[2];if(!['--check','--publish'].includes(action))throw Error('Choose --check or --publish');
const manifest=fileURLToPath(new URL('./manifest.json',import.meta.url));
process.chdir(fileURLToPath(new URL('../../../autoclick/web-app/',import.meta.url)));
process.argv=[process.execPath,'scripts/publish-reviewed.mjs',action,manifest];
await import('../../../autoclick/web-app/scripts/publish-reviewed.mjs');
