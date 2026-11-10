// Desktop bridge shim.
// app.js owns window.desktopOrderBridgeExecute because it has access to the app's
// internal Supabase context. Do not overwrite that handler here.
window.desktopOrderBridgeReady = true;
