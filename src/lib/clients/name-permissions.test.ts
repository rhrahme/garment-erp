import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertClientDeleteAllowed,
  assertClientRenameAllowed,
  clientNamesEqual,
  isClientNameLocked,
} from "./name-permissions.ts";

describe("client name permissions", () => {
  it("locks rename once first+last are set", () => {
    assert.equal(isClientNameLocked({ first_name: "Ada", middle_name: null, last_name: "Lovelace" }), true);
    assert.equal(isClientNameLocked({ first_name: "", middle_name: null, last_name: "" }), false);
    assert.equal(isClientNameLocked(undefined), false);
  });

  it("treats empty middle as equal to null", () => {
    assert.equal(
      clientNamesEqual(
        { first_name: "Ada", middle_name: null, last_name: "Lovelace" },
        { first_name: "Ada", middle_name: "", last_name: "Lovelace" }
      ),
      true
    );
  });

  it("allows rename for admins and for new / unlocked clients", () => {
    const previous = { first_name: "Ada", middle_name: null, last_name: "Lovelace" };
    const renamed = { first_name: "Augusta", middle_name: null, last_name: "Lovelace" };

    assert.equal(assertClientRenameAllowed(true, previous, renamed), null);
    assert.equal(assertClientRenameAllowed(false, undefined, renamed), null);
    assert.equal(assertClientRenameAllowed(false, previous, previous), null);
  });

  it("blocks non-admin rename of an existing named client", () => {
    const previous = { first_name: "Ada", middle_name: null, last_name: "Lovelace" };
    const renamed = { first_name: "Augusta", middle_name: null, last_name: "Lovelace" };
    const error = assertClientRenameAllowed(false, previous, renamed);
    assert.ok(error);
    assert.match(error, /Only admins can rename/i);
  });

  it("blocks non-admin implicit delete via omitted clients", () => {
    const previous = [{ id: "c1", code: "GL-1", first_name: "Ada", middle_name: null, last_name: "Lovelace" }];
    assert.equal(assertClientDeleteAllowed(true, previous, []), null);
    assert.equal(assertClientDeleteAllowed(false, previous, [{ id: "c1" }]), null);
    const error = assertClientDeleteAllowed(false, previous, []);
    assert.ok(error);
    assert.match(error, /Only admins can delete/i);
  });
});
