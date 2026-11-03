# Contributing

Use Node.js 22+, run `npm ci`, and run `npm run check` before submitting a change. Keep capture adapters separate from shared UI, record policy, and storage. Use Zod for external messages and persisted data. Never add remote executable code or insert captured values as HTML.

Use only synthetic test traffic, reserved example domains, and loopback fixture servers. Do not commit traffic exports, credentials, internal hostnames, private network addresses, personal paths, production screenshots, browser profiles, or signing material. The privacy checker catches common patterns; it cannot establish that every document or screenshot is safe.

Changes affecting capture behavior need browser integration coverage in addition to unit tests. Explain any permission change and its user-visible consequences. Firefox and Chrome builds must package their own dependencies without references to other checkouts.
