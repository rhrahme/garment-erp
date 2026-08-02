import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientColumnDelta,
  clientColumnHeaderLabel,
  orderedGridColumns,
  removeClientFitColumn,
  sanitizeClientColumnValues,
  upsertClientFitColumn,
} from "./client-fit-columns.ts";
import type { BasePatternClientColumn } from "@/lib/types/pattern-library";

const baseFixture = {
  sizes: ["S", "M", "L", "XL", "2XL"],
  points: [
    { point_id: "half-waist", name: "1/2 Waist" },
    { point_id: "front-rise", name: "Front rise" },
  ] as never,
  client_columns: undefined as BasePatternClientColumn[] | undefined,
};

function makeColumn(patch: Partial<BasePatternClientColumn> = {}): BasePatternClientColumn {
  return {
    id: "bpcc-1",
    client_id: "client-1",
    client_code: "FR-0526-0002",
    client_name: "Youssef Al Rashed",
    base_size: "XL",
    values: { "half-waist": 47.5 },
    created_by: "hagan.dp1@gmail.com",
    updated_by: "hagan.dp1@gmail.com",
    created_at: "2026-08-02T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    ...patch,
  };
}

test("sanitizeClientColumnValues drops unknown points and non-finite values", () => {
  const values = sanitizeClientColumnValues(
    {
      "half-waist": 47.5,
      "front-rise": "28",
      "not-a-point": 12,
      "half-waist-extra": null,
    },
    baseFixture
  );
  assert.deepEqual(values, { "half-waist": 47.5, "front-rise": null });
});

test("upsertClientFitColumn creates a new column anchored to a valid size", () => {
  const result = upsertClientFitColumn(
    baseFixture,
    {
      client_id: "client-1",
      client_code: "FR-0526-0002",
      client_name: "Youssef Al Rashed",
      base_size: "XL",
      values: { "half-waist": 47.5 },
    },
    { actor: "hagan.dp1@gmail.com", timestamp: "2026-08-02T10:00:00.000Z" }
  );
  assert.ok(result.ok);
  assert.equal(result.columns.length, 1);
  assert.equal(result.column.base_size, "XL");
  assert.equal(result.column.created_by, "hagan.dp1@gmail.com");
  assert.deepEqual(result.column.values, { "half-waist": 47.5 });
});

test("upsertClientFitColumn rejects a size that is not on the pattern", () => {
  const result = upsertClientFitColumn(baseFixture, {
    client_id: "client-1",
    client_name: "Youssef Al Rashed",
    base_size: "5XL",
  });
  assert.ok(!result.ok);
  assert.match(result.error, /5XL/);
});

test("upsertClientFitColumn requires client identity", () => {
  const result = upsertClientFitColumn(baseFixture, {
    client_id: "  ",
    client_name: "",
    base_size: "XL",
  });
  assert.ok(!result.ok);
});

test("upsertClientFitColumn updates an existing client column in place", () => {
  const existing = makeColumn();
  const result = upsertClientFitColumn(
    { ...baseFixture, client_columns: [existing] },
    {
      client_id: "client-1",
      client_name: "Youssef Al Rashed",
      base_size: "L",
      values: { "front-rise": 28.5, "half-waist": null },
    },
    { actor: "someone.else@hagan.pro", timestamp: "2026-08-02T12:00:00.000Z" }
  );
  assert.ok(result.ok);
  assert.equal(result.columns.length, 1);
  const column = result.columns[0]!;
  // Identity + creation metadata survive; base size and values are replaced.
  assert.equal(column.id, existing.id);
  assert.equal(column.created_at, existing.created_at);
  assert.equal(column.created_by, existing.created_by);
  assert.equal(column.base_size, "L");
  assert.equal(column.updated_by, "someone.else@hagan.pro");
  assert.deepEqual(column.values, { "front-rise": 28.5, "half-waist": null });
});

test("upsertClientFitColumn keeps other clients' columns untouched", () => {
  const other = makeColumn({ id: "bpcc-2", client_id: "client-2", client_name: "Ajlan" });
  const result = upsertClientFitColumn(
    { ...baseFixture, client_columns: [other] },
    {
      client_id: "client-1",
      client_name: "Youssef Al Rashed",
      base_size: "XL",
    }
  );
  assert.ok(result.ok);
  assert.equal(result.columns.length, 2);
  assert.deepEqual(result.columns[0], other);
});

test("removeClientFitColumn removes only the requested client", () => {
  const a = makeColumn();
  const b = makeColumn({ id: "bpcc-2", client_id: "client-2", client_name: "Ajlan" });
  const removed = removeClientFitColumn([a, b], "client-1");
  assert.ok(removed);
  assert.equal(removed.removed.client_id, "client-1");
  assert.deepEqual(removed.columns, [b]);
  assert.equal(removeClientFitColumn([b], "client-1"), null);
  assert.equal(removeClientFitColumn(undefined, "client-1"), null);
});

test("orderedGridColumns inserts client columns right after their base size", () => {
  const column = makeColumn();
  const order = orderedGridColumns(baseFixture.sizes, [column]);
  const kinds = order.map((entry) =>
    entry.kind === "size" ? entry.size : `client:${entry.column.client_id}`
  );
  assert.deepEqual(kinds, ["S", "M", "L", "XL", "client:client-1", "2XL"]);
});

test("orderedGridColumns keeps columns visible when their base size was removed", () => {
  const column = makeColumn({ base_size: "3XL" });
  const order = orderedGridColumns(baseFixture.sizes, [column]);
  const last = order[order.length - 1]!;
  assert.equal(last.kind, "client");
});

test("clientColumnDelta returns signed differences and hides zero/empty", () => {
  assert.equal(clientColumnDelta(46, 47.5), 1.5);
  assert.equal(clientColumnDelta(46, 44.5), -1.5);
  assert.equal(clientColumnDelta(46, 46), null);
  assert.equal(clientColumnDelta(null, 47.5), null);
  assert.equal(clientColumnDelta(46, null), null);
});

test("clientColumnHeaderLabel uses the client's first name and base size", () => {
  assert.equal(clientColumnHeaderLabel(makeColumn()), "Youssef (from XL)");
});
