// Isolated so Jest (CommonJS ts-jest, which cannot parse import.meta) can
// jest.mock this module instead of parsing it. Keep ALL import.meta access here.
//
// The casts below work around a repo-level type collision: @types/bun (a
// devDependency for the bun-run catalog/ingest scripts) declares a global
// `ImportMetaEnv` with only a `[key: string]: string | undefined` index
// signature. That ambient declaration is auto-included by tsconfig.json
// (no explicit "types" allowlist) and clobbers Vite's more specific
// `ImportMetaEnv` (BASE_URL: string, PROD: boolean, ...), widening every
// property here to `string | undefined` at the type level even though Vite
// guarantees the real runtime values are a string and a boolean.
export const BASE_URL: string = import.meta.env.BASE_URL as unknown as string;
export const IS_PROD: boolean = import.meta.env.PROD as unknown as boolean;
