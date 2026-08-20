import { parsePatternNoticeEmails } from "@/lib/auth/permissions";
import {
  appendPatternOperatorNotice,
  getPatternOperatorNoticeById,
  updatePatternOperatorNotice,
} from "@/lib/data/pattern-operator-notices";
import { notifyIntegration } from "@/lib/integrations";
import { sendEmail } from "@/lib/email/smtp";
import {
  emailOwnerPatternHowToSeen,
  emailOwnerPatternHowToSent,
} from "@/lib/integrations/pattern-howto-owner-alert";
import {
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_BODY,
  CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_TITLE,
  PATTERN_HOWTO_NOTICES,
} from "@/lib/pattern/pattern-operator-notice-copy";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

export {
  CONSOLIDATE_FABRICS_HOWTO_BODY,
  CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_TITLE,
  PATTERN_HOWTO_NOTICES,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE,
} from "@/lib/pattern/pattern-operator-notice-copy";

export async function createPatternOperatorNotice(input: {
  id?: string;
  title: string;
  body: string;
  href?: string | null;
  href_label?: string | null;
  created_by: string;
  email?: boolean;
  forceEmail?: boolean;
}): Promise<{ notice: PatternOperatorNotice; created: boolean; emailed: boolean }> {
  const existing = input.id ? getPatternOperatorNoticeById(input.id) : null;
  if (existing) {
    const nextTitle = input.title.trim();
    const nextBody = input.body.trim();
    const nextHref = input.href?.trim() || existing.href;
    const nextHrefLabel = input.href_label?.trim() || existing.href_label;
    const synced =
      existing.title !== nextTitle ||
      existing.body !== nextBody ||
      existing.href !== nextHref ||
      existing.href_label !== nextHrefLabel
        ? (await updatePatternOperatorNotice(existing.id, {
            title: nextTitle,
            body: nextBody,
            href: nextHref,
            href_label: nextHrefLabel,
          })) ?? existing
        : existing;
    let emailed = Boolean(synced.emailed_at);
    if (input.email !== false && (input.forceEmail || !synced.emailed_at)) {
      emailed = await emailPatternOperatorNotice(synced);
      if (emailed) {
        const updated = await updatePatternOperatorNotice(synced.id, {
          emailed_at: new Date().toISOString(),
        });
        if (
          input.forceEmail &&
          synced.id === ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID
        ) {
          await emailOwnerPatternHowToSent(updated ?? synced).catch(() => false);
        }
        return { notice: updated ?? synced, created: false, emailed: true };
      }
    }
    return { notice: synced, created: false, emailed };
  }

  const notice: PatternOperatorNotice = {
    id: input.id?.trim() || `pon-${Date.now()}`,
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    title: input.title.trim(),
    body: input.body.trim(),
    href: input.href?.trim() || null,
    href_label: input.href_label?.trim() || null,
    status: "open",
    acknowledged_at: null,
    acknowledged_by: null,
    emailed_at: null,
  };

  const saved = await appendPatternOperatorNotice(notice);
  await notifyIntegration("pattern.operator_notice_created", {
    id: saved.id,
    title: saved.title,
    href: saved.href,
    created_by: saved.created_by,
  });

  let emailed = false;
  if (input.email !== false) {
    emailed = await emailPatternOperatorNotice(saved);
    if (emailed) {
      const updated = await updatePatternOperatorNotice(saved.id, {
        emailed_at: new Date().toISOString(),
      });
      if (saved.id === ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID) {
        await emailOwnerPatternHowToSent(updated ?? saved).catch(() => false);
      }
      return { notice: updated ?? saved, created: true, emailed: true };
    }
  }

  return { notice: saved, created: true, emailed: false };
}

export async function acknowledgePatternOperatorNotice(
  id: string,
  acknowledgedBy: string
): Promise<PatternOperatorNotice | null> {
  const existing = getPatternOperatorNoticeById(id);
  if (!existing) return null;
  if (existing.status === "acknowledged") return existing;

  const updated = await updatePatternOperatorNotice(id, {
    status: "acknowledged",
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: acknowledgedBy,
  });
  if (updated) {
    await notifyIntegration("pattern.operator_notice_acknowledged", {
      id: updated.id,
      title: updated.title,
      acknowledged_by: acknowledgedBy,
    });
    await recordPatternNoticeSeen(updated.id, acknowledgedBy);
  }
  return updated;
}

export async function recordPatternNoticeSeen(
  id: string,
  seenBy: string
): Promise<{ notice: PatternOperatorNotice | null; newlySeen: boolean }> {
  const actor = seenBy.trim();
  if (!actor) return { notice: getPatternOperatorNoticeById(id), newlySeen: false };
  const existing = getPatternOperatorNoticeById(id);
  if (!existing) return { notice: null, newlySeen: false };
  const seenByMap = { ...(existing.seen_by ?? {}) };
  if (seenByMap[actor]) return { notice: existing, newlySeen: false };

  const now = new Date().toISOString();
  seenByMap[actor] = now;
  const updated = await updatePatternOperatorNotice(id, { seen_by: seenByMap });
  if (updated) {
    await notifyIntegration("pattern.operator_notice_seen", {
      id: updated.id,
      title: updated.title,
      seen_by: actor,
    }).catch(() => {});
    if (updated.id === ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID) {
      await emailOwnerPatternHowToSeen({ notice: updated, seenBy: actor }).catch(() => false);
    }
  }
  return { notice: updated, newlySeen: true };
}

export async function emailPatternOperatorNotice(
  notice: PatternOperatorNotice
): Promise<boolean> {
  const recipients = [...parsePatternNoticeEmails()];
  if (recipients.length === 0) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://erp.hagan.pro";
  const subject = `ERP Pattern: ${notice.title}`;
  const text = [
    "Garment ERP - message for Pattern",
    "",
    notice.title,
    "",
    notice.body,
    "",
    notice.href
      ? `${notice.href_label ?? "Open"}: ${
          notice.href.startsWith("http") ? notice.href : `${appUrl}${notice.href}`
        }`
      : `Open Pattern: ${appUrl}/pattern`,
    "",
    "This notice also appears at the top of your Pattern page until you tap Got it.",
    `All how-tos stay on Pattern -> How-to: ${appUrl}/pattern/how-to`,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to email Pattern operator notice:", error);
    return false;
  }
}

/** Idempotent: posts every catalog how-to once and emails Pattern if not yet emailed. */
export async function ensureAllPatternHowToNotices(
  createdBy = "system"
): Promise<Array<{ notice: PatternOperatorNotice; created: boolean; emailed: boolean }>> {
  const results = [];
  for (const howto of PATTERN_HOWTO_NOTICES) {
    results.push(
      await createPatternOperatorNotice({
        id: howto.id,
        title: howto.title,
        body: howto.body,
        href: howto.href,
        href_label: howto.href_label,
        created_by: createdBy,
        email: true,
      })
    );
  }
  return results;
}

/** Idempotent: posts the consolidate how-to once and emails Pattern if not yet emailed. */
export async function ensureConsolidateFabricsHowToNotice(
  createdBy = "system"
): Promise<{ notice: PatternOperatorNotice; created: boolean; emailed: boolean }> {
  const [consolidate] = (await ensureAllPatternHowToNotices(createdBy)).filter(
    (row) => row.notice.id === CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID
  );
  if (consolidate) return consolidate;
  return createPatternOperatorNotice({
    id: CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
    title: CONSOLIDATE_FABRICS_HOWTO_TITLE,
    body: CONSOLIDATE_FABRICS_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    created_by: createdBy,
    email: true,
  });
}
