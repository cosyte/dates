/**
 * `@cosyte/dates` - date and time utilities for the `@cosyte/*` healthcare
 * parsers.
 *
 * Two promises hold across the whole surface.
 *
 * PRECISION IS PRESERVED. A year-only value stays a year. Nothing here adds a
 * month, a day or a midnight that the value did not state.
 *
 * NO ZONE IS EVER GUESSED. A value whose offset is unknown cannot be turned into
 * an absolute instant until the caller says which zone applies. There is no
 * fallback to the host time zone and none to UTC.
 */

export { PRECISION_LADDER } from './types.js';
export type {
  DateParts,
  IssueCode,
  InvalidPartsResult,
  PartName,
  Precision,
  ValidPartsResult,
  ValidationIssue,
  ValidationResult,
  ZoneOptions,
} from './types.js';

export {
  AmbiguousLocalTimeError,
  DatePartsError,
  MissingZoneError,
  PrecisionError,
} from './errors.js';

export { assertValidParts, isValidParts, precisionOf, validateParts } from './validate.js';

export { toISO, toInstant, toTemporal, toZonedDateTime } from './convert.js';
export type { TemporalValue } from './convert.js';

/**
 * The Temporal implementation this package converts into, re-exported so a
 * consumer works with the same objects rather than installing a second copy.
 * Two Temporal implementations do not share `instanceof`.
 */
export { Temporal } from 'temporal-polyfill';
