export async function shareText(
  message: string,
): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text: message });
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled";
      throw error;
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return "copied";
  }
  throw new Error("Selecione o texto abaixo para copiar e compartilhar.");
}
