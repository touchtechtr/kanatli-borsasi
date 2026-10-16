import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyOperation =
  | "create_livestock_listing"
  | "create_feed_listing"
  | "create_agri_listing"
  | "create_general_listing"
  | "bid_livestock"
  | "bid_feed"
  | "provide_expertise"
  | "publish_contract"
  | "manage_slaughterhouse"
  | "create_slaughterhouse_purchase"
  | "bid_slaughterhouse_purchase";

export type CompanyOperationAccess = {
  allowed: boolean;
  code: string;
  message: string;
  operation?: CompanyOperation;
  company_id?: string;
  required_activities?: string[];
};

export async function getCompanyOperationAccess(
  supabase: SupabaseClient,
  companyId: string,
  operation: CompanyOperation,
): Promise<CompanyOperationAccess> {
  const { data, error } = await supabase.rpc("get_company_operation_access", {
    p_company_id: companyId,
    p_operation_code: operation,
  });

  if (error) {
    return {
      allowed: false,
      code: error.code || "access_check_failed",
      message: error.message || "İşlem yetkisi kontrol edilemedi.",
      operation,
      company_id: companyId,
    };
  }

  return data as CompanyOperationAccess;
}

export function activityApplicationHref(access: CompanyOperationAccess) {
  const activity = access.required_activities?.[0];
  return activity
    ? `/profil/faaliyetler?activity=${encodeURIComponent(activity)}`
    : "/profil/faaliyetler";
}
