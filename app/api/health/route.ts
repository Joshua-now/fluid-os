import { NextResponse } from "next/server";

const SERVICES = [
  { label: "n8n",         url: "https://n8n-production-5955.up.railway.app/healthz" },
  { label: "Switchboard", url: "https://switchboard-v5-production.up.railway.app/health" },
];

export async function GET() {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      try {
        const res = await fetch(svc.url, {
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        return { label: svc.label, status: res.ok ? "online" : "offline" };
      } catch {
        return { label: svc.label, status: "offline" };
      }
    })
  );

  return NextResponse.json(results);
}
