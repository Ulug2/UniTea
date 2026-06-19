// Supabase Edge Function - Runs on Deno runtime
// Admin-only: runs the Hungarian-algorithm matchmaking and writes results.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

type ScoringType = "similarity" | "complementarity";

type Question = {
  id: string;
  weight: number;
  scoringType: ScoringType;
  optionCount: number;
};

// Mirrors src/features/matchmaking/config/questions.ts (weights + scoringType)
const QUESTIONS: Question[] = [
  { id: "q1", weight: 3, scoringType: "similarity",       optionCount: 4 },
  { id: "q2", weight: 3, scoringType: "similarity",       optionCount: 4 },
  { id: "q3", weight: 3, scoringType: "similarity",       optionCount: 4 },
  { id: "q4", weight: 2, scoringType: "complementarity",  optionCount: 4 },
  { id: "q5", weight: 2, scoringType: "similarity",       optionCount: 4 },
  { id: "q6", weight: 2, scoringType: "similarity",       optionCount: 4 },
  { id: "q7", weight: 1, scoringType: "similarity",       optionCount: 4 },
  { id: "q8", weight: 1, scoringType: "similarity",       optionCount: 4 },
  { id: "q9", weight: 1, scoringType: "similarity",       optionCount: 4 },
];

function computeQuestionScore(q: Question, a: number, b: number): number {
  if (q.scoringType === "similarity") {
    if (a === b) return q.weight;
    if (Math.abs(a - b) === 1) return q.weight / 2;
    return 0;
  }
  if (q.scoringType === "complementarity") {
    const maxDiff = q.optionCount - 1;
    const diff = Math.abs(a - b);
    if (diff === maxDiff) return q.weight;
    if (diff >= maxDiff / 2) return q.weight / 2;
    return 0;
  }
  return 0;
}

function computeCompatibility(
  answersA: Record<string, number>,
  answersB: Record<string, number>,
): number {
  return QUESTIONS.reduce((sum, q) => {
    const a = answersA[q.id] ?? 0;
    const b = answersB[q.id] ?? 0;
    return sum + computeQuestionScore(q, a, b);
  }, 0);
}

// ── Hungarian Algorithm (Munkres / optimal assignment) ───────────────────────
// Finds the maximum-weight perfect matching in a bipartite graph.
// Rows = pool A, Cols = pool B (may be unequal size — padded with zeros).

function hungarianMaxWeight(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;
  const size = Math.max(n, m);

  // Pad to square matrix with zeros
  const c: number[][] = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      i < n && j < m ? costMatrix[i][j] : 0,
    ),
  );

  // Convert max → min by negating (standard trick)
  const maxVal = c.flat().reduce((a, b) => Math.max(a, b), 0);
  const cost: number[][] = c.map((row) => row.map((v) => maxVal - v));

  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0); // column → row matching
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minDist = new Array(size + 1).fill(Infinity);
    const used = new Array(size + 1).fill(false);

    do {
      used[j0] = true;
      let i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const val = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (val < minDist[j]) {
            minDist[j] = val;
            way[j] = j0;
          }
          if (minDist[j] < delta) {
            delta = minDist[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minDist[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // Extract assignment: result[i] = j matched to row i (0-based)
  const result = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0 && p[j] - 1 < n) {
      result[p[j] - 1] = j - 1;
    }
  }
  return result;
}

// ── Match pool helper ────────────────────────────────────────────────────────

type Profile = {
  user_id: string;
  answers: Record<string, number>;
};

type MatchResult = {
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number;
  match_type: "primary" | "wingman";
};

function matchPool(
  poolA: Profile[],
  poolB: Profile[],
  matchType: "primary" | "wingman",
): { matches: MatchResult[]; unmatchedA: Profile[]; unmatchedB: Profile[] } {
  if (poolA.length === 0 || poolB.length === 0) {
    return { matches: [], unmatchedA: poolA, unmatchedB: poolB };
  }

  const matrix = poolA.map((a) =>
    poolB.map((b) => computeCompatibility(a.answers, b.answers)),
  );

  const assignment = hungarianMaxWeight(matrix);

  const matches: MatchResult[] = [];
  const matchedBIndices = new Set<number>();

  assignment.forEach((bIdx, aIdx) => {
    if (bIdx >= 0 && bIdx < poolB.length) {
      const a = poolA[aIdx];
      const b = poolB[bIdx];
      const score = computeCompatibility(a.answers, b.answers);
      const [ua, ub] =
        a.user_id < b.user_id ? [a.user_id, b.user_id] : [b.user_id, a.user_id];
      matches.push({ user_a_id: ua, user_b_id: ub, compatibility_score: score, match_type: matchType });
      matchedBIndices.add(bIdx);
    }
  });

  const matchedAIndices = new Set(
    assignment.map((b, i) => (b >= 0 && b < poolB.length ? i : -1)).filter((i) => i !== -1),
  );

  const unmatchedA = poolA.filter((_, i) => !matchedAIndices.has(i));
  const unmatchedB = poolB.filter((_, i) => !matchedBIndices.has(i));

  return { matches, unmatchedA, unmatchedB };
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Auth — must be an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("get_my_is_admin");
    if (adminCheckError || !isAdmin) throw new Error("Admin access required");

    // 2. Fetch all profiles (service role bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profiles, error: profilesError } = await adminClient
      .from("launch_event_profiles")
      .select("user_id, university_id, gender, answers");

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profiles to match", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Group by university
    const byUniversity = new Map<string, typeof profiles>();
    for (const p of profiles) {
      const list = byUniversity.get(p.university_id) ?? [];
      list.push(p);
      byUniversity.set(p.university_id, list);
    }

    const allMatches: (MatchResult & { university_id: string })[] = [];
    const summary: { university_id: string; primary: number; wingman: number; unmatched: number }[] = [];

    for (const [universityId, uProfiles] of byUniversity) {
      const males   = uProfiles.filter((p) => p.gender === "male")  .map((p) => ({ user_id: p.user_id, answers: p.answers as Record<string, number> }));
      const females = uProfiles.filter((p) => p.gender === "female").map((p) => ({ user_id: p.user_id, answers: p.answers as Record<string, number> }));
      const others  = uProfiles.filter((p) => p.gender === "other") .map((p) => ({ user_id: p.user_id, answers: p.answers as Record<string, number> }));

      // Primary: male × female
      const primary = matchPool(males, females, "primary");
      primary.matches.forEach((m) => allMatches.push({ ...m, university_id: universityId }));

      // Overflow: collect unmatched from primary + all 'other' gender users
      const overflow = [
        ...primary.unmatchedA,
        ...primary.unmatchedB,
        ...others,
      ];

      let wingmanCount = 0;
      // Run wingman matching within the overflow pool in pairs of 2
      if (overflow.length >= 2) {
        const half = Math.floor(overflow.length / 2);
        const wingmanResult = matchPool(
          overflow.slice(0, half),
          overflow.slice(half),
          "wingman",
        );
        wingmanResult.matches.forEach((m) => allMatches.push({ ...m, university_id: universityId }));
        wingmanCount = wingmanResult.matches.length;
      }

      summary.push({
        university_id: universityId,
        primary: primary.matches.length,
        wingman: wingmanCount,
        unmatched: overflow.length - wingmanCount * 2,
      });
    }

    // 4. Write matches (upsert so re-runs are idempotent on the unique constraints)
    if (allMatches.length > 0) {
      const { error: insertError } = await adminClient
        .from("launch_event_matches")
        .upsert(allMatches, { onConflict: "user_a_id" });
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ matched: allMatches.length, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("run-matchmaking error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
