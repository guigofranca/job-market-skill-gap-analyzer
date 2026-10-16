import { z } from 'zod'

/*
 * Zod v4 probes `new Function` to JIT-compile object parsers. The production CSP forbids eval
 * (no 'unsafe-eval'), so the probe is blocked — harmless, but browsers report it as a CSP
 * violation. `jitless` skips the probe and always uses the interpreted parser.
 * Imported first in main.tsx so it runs before any schema parses.
 */
z.config({ jitless: true })
