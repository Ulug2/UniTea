#!/usr/bin/env node
/**
 * Captures the best anonymous posts of one campus as Instagram-ready PNGs
 * (1290×1612, 4:5) using the read-only web post card preview.
 *
 *   npx expo start --web                         # in another terminal
 *   npm run capture:posts -- --campus nu         # then --campus sdu
 *
 * Options:
 *   --campus nu|sdu      required
 *   --count 5            how many posts to capture
 *   --days 90            only consider posts from the last N days
 *   --pick id,id,...     capture these post ids instead of auto-picking
 *   --dry-run            list the picks without capturing or recording them
 *   --base-url http://localhost:8081
 *
 * Signs in as a normal student of that campus — never a service-role key —
 * so RLS limits reads to that campus exactly as in the app. Reads only:
 * the one write is appending captured ids to docs/instagram/used-posts.json
 * so later runs skip them. Credentials come from the environment (or an
 * untracked .env.local), never from the command line:
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
 *   UNITEE_CAPTURE_NU_EMAIL / UNITEE_CAPTURE_NU_PASSWORD,
 *   UNITEE_CAPTURE_SDU_EMAIL / UNITEE_CAPTURE_SDU_PASSWORD
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { CAMPUSES, selectPosts } = require("./selectPosts");

const ROOT = path.resolve(__dirname, "../..");
const REGISTRY_PATH = path.join(ROOT, "docs/instagram/used-posts.json");
const OUTPUT_DIR = path.join(ROOT, "captures");
const CANDIDATE_LIMIT = 200;

function parseArgs(argv) {
  const args = { count: 5, days: 90, baseUrl: "http://localhost:8081" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    if (flag === "--campus") args.campus = next();
    else if (flag === "--count") args.count = Number(next());
    else if (flag === "--days") args.days = Number(next());
    else if (flag === "--pick") args.pick = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (flag === "--base-url") args.baseUrl = next();
    else if (flag === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!CAMPUSES[args.campus]) throw new Error("--campus must be nu or sdu");
  return args;
}

/** Loads KEY=value lines from .env.local without overriding the environment. */
function loadEnvFile() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (set it in the environment or .env.local)`);
  return value;
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

function recordCaptures(entries) {
  const registry = readRegistry();
  registry.posts.push(...entries);
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
}

async function signIn(campus) {
  const url = requireEnv("EXPO_PUBLIC_SUPABASE_URL");
  const supabase = createClient(url, requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const key = campus.toUpperCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: requireEnv(`UNITEE_CAPTURE_${key}_EMAIL`),
    password: requireEnv(`UNITEE_CAPTURE_${key}_PASSWORD`),
  });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("university_id, university:universities(domain)")
    .eq("id", data.user.id)
    .single();
  if (profileError) throw profileError;
  if (profile.university?.domain !== CAMPUSES[campus].domain) {
    throw new Error(
      `This account belongs to ${profile.university?.domain ?? "no university"}, not ${CAMPUSES[campus].domain}`,
    );
  }
  return { supabase, session: data.session, universityId: profile.university_id, url };
}

async function fetchCandidates(supabase, universityId, { days, pick }) {
  let query = supabase
    .from("posts_summary_view")
    .select("*")
    .eq("university_id", universityId)
    .eq("post_type", "feed")
    .or("is_banned.is.null,is_banned.eq.false");
  if (pick) {
    query = query.in("post_id", pick);
  } else {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query
      .eq("is_anonymous", true)
      .is("community_id", null)
      .gte("created_at", since)
      .order("vote_score", { ascending: false })
      .limit(CANDIDATE_LIMIT);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function capture(picks, { campus, session, supabaseUrl, baseUrl }) {
  const { chromium } = require("playwright");
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(OUTPUT_DIR, campus);
  fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 430, height: 538 },
      deviceScaleFactor: 3,
    });
    // Hand the preview the same session the app would hold after sign-in.
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, JSON.stringify(session)],
    );

    const files = [];
    for (const [index, post] of picks.entries()) {
      await page.goto(`${baseUrl}/preview/post-card?postId=${post.post_id}`, {
        waitUntil: "networkidle",
        timeout: 120000,
      });
      await page.getByTestId("preview-card").waitFor({ timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const file = path.join(dir, `${stamp}-${index + 1}-${post.post_id.slice(0, 8)}.png`);
      await page.getByTestId("preview-artboard").screenshot({ path: file });
      files.push(file);
      console.log(`  saved ${path.relative(ROOT, file)}`);
    }
    return files;
  } finally {
    await browser.close();
  }
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  const { supabase, session, universityId, url } = await signIn(args.campus);
  try {
    const rows = await fetchCandidates(supabase, universityId, args);
    const usedEntries = readRegistry().posts;
    const picks = selectPosts(rows, {
      campus: args.campus,
      count: args.pick ? args.pick.length : args.count,
      usedEntries,
    });

    console.log(`${CAMPUSES[args.campus].label}: ${picks.length} post(s) picked from ${rows.length} candidate(s)`);
    for (const post of picks) {
      console.log(`\n[${post.post_id}] score ${post.vote_score} · ${post.comment_count} comments · ${post.created_at}`);
      console.log(`  ${String(post.content).replace(/\n/g, "\n  ")}`);
    }
    if (args.pick && picks.length < args.pick.length) {
      console.warn("\nSome --pick ids were skipped (used already, not anonymous, has images, or doesn't fit the card).");
    }
    if (args.dryRun || picks.length === 0) return;

    console.log("\nCapturing:");
    const files = await capture(picks, {
      campus: args.campus,
      session,
      supabaseUrl: url,
      baseUrl: args.baseUrl,
    });
    const capturedAt = new Date().toISOString();
    recordCaptures(
      picks.map((post, i) => ({
        post_id: post.post_id,
        campus: args.campus,
        captured_at: capturedAt,
        file: path.relative(ROOT, files[i]),
      })),
    );
    console.log(`\nRecorded ${picks.length} post(s) in ${path.relative(ROOT, REGISTRY_PATH)}.`);
  } finally {
    // Local scope: ends only this script's session, never the account's
    // sessions on phones or other devices.
    await supabase.auth.signOut({ scope: "local" });
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
