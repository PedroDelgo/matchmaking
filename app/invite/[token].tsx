import { useLocalSearchParams } from "expo-router";
import { InviteScreen } from "../../src/screens/InviteScreen";
export default function InvitationByToken() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  return <InviteScreen pathToken={token} />;
}
