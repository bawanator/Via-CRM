import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchAll } from "@/lib/crm/search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  try {
    const results = await searchAll(supabase, q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
