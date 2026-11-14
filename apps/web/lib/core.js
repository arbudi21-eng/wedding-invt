// Single import point for the generator engine.
//
// lib/core.js at the repository root is the only implementation of slug
// generation and page building. Never fork it here: this file exists so app
// code can use `@/lib/core` without reaching across the filesystem everywhere.
import core from '../../../lib/core.js';

export const { build, configJs, headers, jwtRole, makeSlug, slugify } = core;

export default core;
