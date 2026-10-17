"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RECOVERY_MARKER="kanatli_password_recovery";

export default function PasswordRecoveryGuard(){
  const pathname=usePathname();
  const supabase=useMemo(()=>createClient(),[]);

  useEffect(()=>{
    if(typeof window==="undefined") return;

    const sendToReset=()=>{
      window.sessionStorage.setItem(RECOVERY_MARKER,"1");
      if(!window.location.pathname.startsWith("/auth/reset-password")){
        window.location.replace("/auth/reset-password?recovery=1");
      }
    };

    const query=new URLSearchParams(window.location.search);
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
    if(query.get("type")==="recovery"||hash.get("type")==="recovery"){
      sendToReset();
    }else if(
      window.sessionStorage.getItem(RECOVERY_MARKER)==="1"&&
      !pathname.startsWith("/auth/reset-password")
    ){
      sendToReset();
    }

    const{data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
      if(event==="PASSWORD_RECOVERY") sendToReset();
    });
    return()=>subscription.unsubscribe();
  },[pathname,supabase]);

  return null;
}

export {RECOVERY_MARKER};
