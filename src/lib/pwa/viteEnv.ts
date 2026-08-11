// Isolated so Jest (CommonJS ts-jest, which cannot parse import.meta) can
// jest.mock this module instead of parsing it. Keep ALL import.meta access here.
//
// The `?? "/"` and Boolean() are not paranoia about Vite: Vite always defines
// both at build time. They exist because this project's TS program picks up
// @types/bun's `ImportMetaEnv` (an index signature of `string | undefined`)
// rather than Vite's typed one, so these read as possibly-undefined. Coercing
// keeps the exported types honest without asserting anything that could be false.
export const BASE_URL: string = import.meta.env.BASE_URL ?? "/";
export const IS_PROD: boolean = Boolean(import.meta.env.PROD);
