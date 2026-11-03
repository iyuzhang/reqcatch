# Release preparation

1. Run `npm ci` and `npm run check` from a clean checkout. Run both browser integration tests. Review permission changes, the privacy policy, all screenshots, and the source archive for captured traffic or identifiers.
2. Set the package version; both manifests derive it automatically. The Firefox extension ID is a stable project identifier, not a publisher account. Keep it stable after the first signed release.
3. Create the public GitHub repository, configure private vulnerability reporting, and publish this source under MIT. Configure the publisher identity, repository/support links, and a hosted privacy-policy URL in the listings. No account information belongs in source files or example configuration.
4. Prepare descriptions and screenshots using only the local synthetic fixture. Do not claim support for capture cases listed as unsupported in README. The Chrome debugger permission requires a clear explanation; disclose the debugging banner and interruption by DevTools.
5. Submit `artifacts/request-lens-firefox-VERSION.zip` to Mozilla Add-ons. Provide the corresponding source snapshot, lockfile, Node.js version, and `npm ci && npm run build` reproduction instructions when requested. Firefox permanent installation requires Mozilla signing.
6. Submit `artifacts/request-lens-chrome-VERSION.zip` to Chrome Web Store. Complete the single-purpose, permissions, and privacy disclosures. Local-only handling still counts as handling user data. Align all answers with PRIVACY.md.
7. Keep signing/API credentials in publisher tooling or encrypted CI secrets. The included CI builds and validates; it does not upload, sign, or publish. Store acceptance is a separate review and is not guaranteed by a successful build.

Official references:

- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://extensionworkshop.com/documentation/publish/source-code-submission/
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/extensions/reference/api/debugger
