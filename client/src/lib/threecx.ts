/**
 * Opens the 3CX live chat panel programmatically.
 * The <call-us id="tcx-call-us"> element is permanently hidden via CSS.
 * We temporarily show it, click its internal trigger, then re-hide it.
 * The chat panel itself opens independently and stays open.
 */
export function openThreeCXChat(): void {
  const host = document.getElementById("tcx-call-us") as HTMLElement | null;
  if (!host) {
    console.warn("[3CX] call-us element not found in DOM");
    return;
  }

  // Briefly show so the Web Component can render its internal button
  host.style.setProperty("display", "block", "important");

  // Use setTimeout to allow the component one tick to initialise
  setTimeout(() => {
    // Try shadow DOM first (most 3CX versions)
    const shadowBtn =
      host.shadowRoot?.querySelector<HTMLElement>("button") ??
      host.shadowRoot?.querySelector<HTMLElement>("[class*='call']") ??
      host.shadowRoot?.querySelector<HTMLElement>("[class*='chat']");

    if (shadowBtn) {
      shadowBtn.click();
    } else {
      // Fallback: click the host itself
      host.click();
    }

    // Re-hide the host — the panel stays open independently
    host.style.setProperty("display", "none", "important");
  }, 80);
}

/**
 * Initiates a 3CX VoIP call programmatically.
 * Uses the same host element; the call UI opens inside the 3CX panel.
 */
export function openThreeCXCall(): void {
  // TODO: if 3CX exposes a direct-call API in future, wire it here
  // 3CX handles call vs chat mode via its own internal routing.
  // Opening the panel is sufficient — the user selects call from within.
  openThreeCXChat();
}
