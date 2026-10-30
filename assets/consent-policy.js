// Public policy release identifier; update together with Firestore rule CURRENT_POLICY_VERSION.
export const CURRENT_POLICY_VERSION = "2026-10-30-v1";
export const acceptancePath = (uid) => ["agreements", uid, "versions", CURRENT_POLICY_VERSION];
