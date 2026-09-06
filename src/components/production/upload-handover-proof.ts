export async function uploadHandoverProofFile(
  target: "work_order" | "sample",
  targetId: string,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const prepareResponse = await fetch("/api/handover-proof/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        target_id: targetId,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    });
    const prepared = (await prepareResponse.json().catch(() => ({}))) as {
      mode?: string;
      image_id?: string;
      stored_filename?: string;
      content_type?: string;
      upload_url?: string;
      error?: string;
    };
    if (!prepareResponse.ok) {
      return { ok: false, error: prepared.error ?? "Upload failed." };
    }

    if (prepared.mode === "signed" && prepared.upload_url) {
      const put = await fetch(prepared.upload_url, {
        method: "PUT",
        headers: { "Content-Type": prepared.content_type ?? file.type },
        body: file,
      });
      if (!put.ok) return { ok: false, error: "Upload to storage failed. Try again." };
      const registerResponse = await fetch("/api/handover-proof/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          target_id: targetId,
          image_id: prepared.image_id,
          stored_filename: prepared.stored_filename,
          filename: file.name,
          content_type: prepared.content_type ?? file.type,
        }),
      });
      const registered = (await registerResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!registerResponse.ok) {
        return { ok: false, error: registered.error ?? "Could not register the upload." };
      }
      return { ok: true };
    }

    const form = new FormData();
    form.set("target", target);
    form.set("target_id", targetId);
    form.set("file", file);
    const response = await fetch("/api/handover-proof/upload", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: payload.error ?? "Upload failed." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error during upload. Try again." };
  }
}
