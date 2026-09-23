/**
 * The owner's X account as the React app uses it (the follow popup). The static
 * HTML shells, and the footer strings the tables keep in step with them, carry
 * their own literal copies.
 *
 * The profile URL rather than x.com/intent/follow on purpose: on phones it opens
 * the X app through universal links, while the intent page sends logged-out
 * mobile browsers to a login wall.
 */
export const X_HANDLE = "israfilv2";
export const X_PROFILE_URL = `https://x.com/${X_HANDLE}`;
