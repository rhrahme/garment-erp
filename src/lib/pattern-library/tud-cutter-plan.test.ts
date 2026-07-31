import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCutterPlanFromTud, flattenCutterPlan } from "./tud-cutter-plan.ts";
import { parseTudFile } from "./tud-parser.ts";

const HEADER = [
  "@ Begin",
  "/F  C:\\TUKAdata\\Shirt\\Ajlan Cotton Shirt Final.tud",
  "-K  StyleCaption  Ajlan Cotton Shirt Final",
  "-F  Ajlan_Cotton_Shirt_Final",
  "-S  M  1",
  "-X  M         SHEEL     1  13493.7173  1621.5273",
  "-X  M         LINING    1    368.0679  189.8496",
  "-Y  M         1  13861.7853  1811.3770",
  '-P  "CUFF" "C_4" ""',
  "-Q  CUFF  4",
  "-M  SHEEL",
  "-E  CUFF  M  1      0.0200   69.40",
  '-P  "FRONT_1" "C_2" ""',
  "-Q  FRONT_1  2",
  "-M  SHEEL",
  "-E  FRONT_1  M  1      0.2433  213.79",
  '-P  "COLLAR_FINISH" "C_1" ""',
  "-Q  COLLAR_FINISH  1",
  "-M  LINING",
  "-E  COLLAR_FINISH  M  1      0.0194   92.08",
  "@ End",
].join("\r\n");

describe("tud-cutter-plan", () => {
  it("reads TUD header codes and builds cutter piece plan", () => {
    const parsed = parseTudFile(Buffer.from(HEADER, "latin1"));
    assert.ok(parsed);
    assert.equal(parsed.metadata.style_file, "Ajlan_Cotton_Shirt_Final");
    const front = parsed.metadata.pieces.find((p) => p.name === "FRONT_1");
    assert.equal(front?.code, "C_2");
    assert.equal(parsed.metadata.pieces.find((p) => p.name === "CUFF")?.code, "C_4");

    const plan = buildCutterPlanFromTud(parsed.metadata, { size: "M", double_fold: true });
    assert.ok(plan);
    assert.equal(plan!.size, "M");
    assert.equal(plan!.total_cut_pieces, 7);
    assert.ok(plan!.shell_pieces.length >= 2);
    assert.ok(plan!.other_pieces.some((p) => p.name === "COLLAR_FINISH"));
    const cuff = flattenCutterPlan(plan!).find((p) => p.name === "CUFF");
    assert.ok(cuff);
    assert.equal(cuff!.cut_quantity, 4);
    assert.equal(cuff!.fabric_role, "shell");
    assert.ok(cuff!.approx_width_cm > 0);
    assert.ok(cuff!.approx_height_cm > 0);
    assert.match(cuff!.place_hint, /fold/i);
    assert.match(plan!.other_pieces[0]!.place_hint, /Lining/i);
  });
});
