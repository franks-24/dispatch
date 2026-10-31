// Fail-closed staff preview: enable only after a trusted /api/dispatcher/session
// backend, Workspace Directory group checks and real Google OAuth are verified.
export const dispatcherConfig=Object.freeze({enabled:false,sessionApi:"/api/dispatcher/session"});
