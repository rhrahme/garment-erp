import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertClientDeleteAllowed,
  assertClientRenameAllowed,
  CLIENT_CREATE_NAME_GRACE_MS,
  clientNamesEqual,
  isClientNameLocked,
  isWithinClientCreateNameGrace,
} from "./name-permissions.ts";

describe("client name permissions", () => {
  it("locks rename once first+last are set (outside create grace)", () => {
    const oldJoin = new Date(Date.now() - CLIENT_CREATE_NAME_GRACE_MS - 60_000).toISOString();
    assert.equal(
      isClientNameLocked({ first_name: "Ada", middle_name: null, last_name: "Lovelace" }, oldJoin),
      true
    );
    assert.equal(isClientNameLocked({ first_name: "", middle_name: null, last_name: "" }), false);
    assert.equal(isClientNameLocked(undefined), false);
  });

  it("keeps recently joined clients renameable during create grace", () => {
    const recentJoin = new Date(Date.now() - 60_000).toISOString();
    assert.equal(
      isClientNameLocked({ first_name: "Turki", middle_name: null, last_name: "Al Lu" }, recentJoin),
      false
    );
    assert.equal(isWithinClientCreateNameGrace(recentJoin), true);
    assert.equal(
      isWithinClientCreateNameGrace(new Date(Date.now() - CLIENT_CREATE_NAME_GRACE_MS - 1).toISOString()),
      false
    );
  });

  it("treats a title stored in first_name as equal to title + given name", () => {
    assert.equal(
      clientNamesEqual(
        { first_name: "Pr", middle_name: "Khaled Bin", last_name: "Salman" },
        { title: "Pr", first_name: "Khaled", middle_name: "Bin", last_name: "Salman" }
      ),
      true
    );
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

  it("allows non-admin rename during create grace so auto-save cannot freeze a partial name", () => {
    const previous = { first_name: "Abdallah", middle_name: null, last_name: "Al L" };
    const completed = { first_name: "Abdallah", middle_name: null, last_name: "Al Luqayan" };
    const recentJoin = new Date().toISOString();
    assert.equal(assertClientRenameAllowed(false, previous, completed, recentJoin), null);
  });

  it("blocks non-admin rename of an existing named client outside grace", () => {
    const previous = { first_name: "Ada", middle_name: null, last_name: "Lovelace" };
    const renamed = { first_name: "Augusta", middle_name: null, last_name: "Lovelace" };
    const oldJoin = new Date(Date.now() - CLIENT_CREATE_NAME_GRACE_MS - 60_000).toISOString();
    const error = assertClientRenameAllowed(false, previous, renamed, oldJoin);
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
