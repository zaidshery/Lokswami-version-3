# Reconstructed R10: reader loading and error boundaries

The original R10 acceptance criteria remain unavailable. The owner authorized reconstructed work on 11 October 2026 from the recovered loading/error boundary reference.

## Verified gap and acceptance criteria

Admin route boundaries exist, but the reader `/main` segment had no Next.js `loading.tsx` or `error.tsx`. Unexpected child route failures therefore lacked a reader-specific recovery screen.

- Suspended reader child routes announce loading in Hindi and English with a polite status region.
- Unexpected reader child route failures show a localized generic alert with retry and a home link.
- Retry invokes Next.js `reset`; internal exception text and digest are not rendered.
- Boundaries fit inside the existing reader main landmark, respect reduced motion, and retain usable mobile button sizes.

The boundary covers descendants of `/main`. Next.js segment error boundaries do not catch errors in their own layout; root/layout failures and legacy routes outside `/main` remain outside this correction. Existing page-specific empty states and API behavior are unchanged.

Validation: focused English/Hindi loading and recovery tests, lint, typecheck, full CI tests and production build. These checks establish the reconstructed scope, not recovery of the original audit criteria. Real content, device and screen-reader acceptance remain launch gates.
