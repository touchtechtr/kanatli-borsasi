import { redirect } from "next/navigation";

export default function TraderPanelRedirect() {
  redirect("/profil/teklifler?direction=outgoing");
}
