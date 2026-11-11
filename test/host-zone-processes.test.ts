import { describe, expect, it } from "vitest";

import { runBuiltPackageScript } from "./support/run.js";
import { READS_BUILD } from "./support/runtime.js";

// Criterion: the same conversion, taking no explicit zone argument, produces identical results
// under two different host TZ settings. `convert.test.ts` changes the zone inside one process;
// this file starts two processes under two `TZ` values and runs the BUILT package in each, so it
// is apart from the suite StrykerJS runs (see `vitest.mutation.config.ts`). Under Deno it is
// skipped: there is no build to run (see `support/runtime.ts`).
describe("the host time zone changes nothing, across processes", () => {
  it.skipIf(!READS_BUILD)(
    "produces identical results across two processes started under different TZ values",
    () => {
      const script = `
import { toISO, toTemporal, toInstant, precisionOf } from '@cosyte/dates';
const withOffset = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
const noOffset = { year: 1988, month: 5, day: 7, hour: 13, minute: 45 };
let refusal = 'none';
try { toInstant(noOffset); } catch (error) { refusal = error.name; }
process.stdout.write(JSON.stringify({
  host: Intl.DateTimeFormat().resolvedOptions().timeZone,
  yearOnly: toISO({ year: 1988 }),
  dayOnly: toISO({ year: 1988, month: 5, day: 7 }),
  withOffset: toISO(withOffset),
  plainDate: toTemporal({ year: 1988, month: 5, day: 7 }).toString(),
  zoned: toTemporal(withOffset).toString(),
  instant: toInstant(withOffset).toString(),
  precision: precisionOf({ year: 1988, month: 5 }),
  refusal,
}));
`;

      const utc = runBuiltPackageScript("tz-utc.mjs", script, { env: { TZ: "UTC" } });
      const kiritimati = runBuiltPackageScript("tz-kiritimati.mjs", script, {
        env: { TZ: "Pacific/Kiritimati" },
      });

      expect(utc.stderr).toBe("");
      expect(kiritimati.stderr).toBe("");

      const fromUtc = JSON.parse(utc.stdout) as Record<string, string>;
      const fromKiritimati = JSON.parse(kiritimati.stdout) as Record<string, string>;

      // The two processes really did run under different host zones.
      expect(fromUtc["host"]).toBe("UTC");
      expect(fromKiritimati["host"]).toBe("Pacific/Kiritimati");

      delete fromUtc["host"];
      delete fromKiritimati["host"];
      expect(fromUtc).toEqual(fromKiritimati);
      expect(fromUtc["refusal"]).toBe("MissingZoneError");
    },
  );
});
