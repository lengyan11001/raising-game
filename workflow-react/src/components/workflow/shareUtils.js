export function buildWorkflowShareUrl(canvasId = "", inviteCode = "") {
  const cleanId = String(canvasId || "").trim();
  if (!cleanId || typeof window === "undefined") return "";
  const params = new URLSearchParams();
  params.set("canvas", cleanId);
  const cleanCode = String(inviteCode || "").trim();
  if (cleanCode) params.set("code", cleanCode);
  return `${window.location.origin}${window.location.pathname}#workflow?${params.toString()}`;
}

export async function copyTextToClipboard(text = "") {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return ok;
  } catch {
    return false;
  }
}
