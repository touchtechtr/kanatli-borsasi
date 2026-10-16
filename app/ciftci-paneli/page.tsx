import { redirect } from "next/navigation";

export default function FarmerPanelRedirect() {
  redirect("/profil/teklifler?direction=incoming");
}
