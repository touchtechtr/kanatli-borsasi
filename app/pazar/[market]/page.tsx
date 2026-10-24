import MarketDirectory from "@/components/market/MarketDirectory";
export default async function MarketPage({params}:{params:Promise<{market:string}>}){const{market}=await params;return <MarketDirectory initialMarket={market}/>}

