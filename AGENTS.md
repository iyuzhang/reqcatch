# Project guidelines

This is an independent open-source browser extension. Keep examples generic and synthetic. Never add private traffic, credentials, internal domains, personal paths, signing material, or references to unrelated workspaces.

Use `npm ci` and `npm run check`. Share classification, storage policy, and UI across adapters. Keep browser-specific network capture in `src/adapters`. Validate external messages and stored records with Zod. Render traffic as text. Keep extension code entirely local. Document permission and browser-coverage changes.

Do not upload or publish releases without the user's authorization. Do not store publisher credentials in the repository.
