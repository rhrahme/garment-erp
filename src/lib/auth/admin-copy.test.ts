import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_COPY_UNLOCK_CLASS, isAdminCopyUnlocked } from "@/lib/auth/admin-copy";

describe("admin copy unlock", () => {
  it("is off without a document class and on when admin class is set", () => {
    assert.equal(ADMIN_COPY_UNLOCK_CLASS, "admin-copy-unlock");
    if (typeof document === "undefined") {
      assert.equal(isAdminCopyUnlocked(), false);
      return;
    }
    document.documentElement.classList.remove(ADMIN_COPY_UNLOCK_CLASS);
    assert.equal(isAdminCopyUnlocked(), false);
    document.documentElement.classList.add(ADMIN_COPY_UNLOCK_CLASS);
    assert.equal(isAdminCopyUnlocked(), true);
    document.documentElement.classList.remove(ADMIN_COPY_UNLOCK_CLASS);
  });
});
