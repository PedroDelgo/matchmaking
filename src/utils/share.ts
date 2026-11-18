import { Share } from "react-native";
export async function shareText(
  message: string,
): Promise<"shared" | "copied" | "cancelled"> {
  const result = await Share.share({ message });
  return result.action === Share.dismissedAction ? "cancelled" : "shared";
}
