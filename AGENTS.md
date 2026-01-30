# Agent Operational Memory

## Core Instructions

### Git & Deployment
*   **Automatic Push:** At the start of every turn where code changes are made (and the user hasn't asked for revisions or a reset), verify if there are uncommitted changes. If so, automatically `git add .`, `git commit`, and `git push`.
*   **Start Over / Revert:** If the user asks to "start over" or "undo", always check out the *previous* commit (`git checkout HEAD~1` or similar logic) to restore the state before the last batch of changes, rather than deleting files manually.

### Project Specifics
*   **Starlink4All:**
    *   **Hosting:** GitHub Pages via `starlink4all.com`.
    *   **Storage:** Gun.js (Decentralized).
    *   **Peers:** Use the curated list in `js/storage.js` (avoid generic Heroku ones if they fail).
    *   **HTTPS:** Enforced via JS redirect.
