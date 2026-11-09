#!/usr/bin/env python3
"""Re-extract structured rubrics for all papers that have a mark scheme URL."""
import json
import os
import subprocess
import sys

SUPABASE_URL = "https://akjbejexhdawelrfygub.supabase.co"
ENV_PATH = "/Users/admin/Desktop/Malvern/Malvern /Projects/Mentora-/Mentora/.env"
SKIP_PAPER = "0a710384-21f5-44c3-afd6-74cbc859ee29"  # already re-extracted


def load_anon_key() -> str:
    with open(ENV_PATH, "rb") as f:
        raw = f.read()
    txt = None
    try:
        txt = raw.decode("utf-8")
    except UnicodeDecodeError:
        if raw.startswith(b"\xff\xfe"):  # UTF-16LE BOM
            raw = raw[2:]
        txt = raw.decode("utf-16-le", errors="ignore")
    for line in txt.splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("anon key not found")


def main():
    anon = load_anon_key()

    # 1. Get all papers with a mark scheme URL (except the one already done)
    r = subprocess.run(
        ["curl", "-s", f"{SUPABASE_URL}/rest/v1/papers?select=id,paper_number,year,subject&mark_scheme_url=not.is.null",
         "-H", f"apikey: {anon}", "-H", f"Authorization: Bearer {anon}"],
        capture_output=True, text=True, timeout=30,
    )
    papers = json.loads(r.stdout or "[]")
    targets = [p for p in papers if p["id"] != SKIP_PAPER]
    print(f"{len(targets)} paper(s) to re-extract")

    # 2. Extract each
    for p in targets:
        label = f"{p['subject']} P{p['paper_number']} ({p['year']})"
        print(f"\n=== {label} — {p['id'][:8]}… ===")
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{SUPABASE_URL}/functions/v1/process-marking-scheme",
             "-H", f"Authorization: Bearer {anon}", "-H", f"apikey: {anon}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"paper_id": p["id"]})],
            capture_output=True, text=True, timeout=280,
        )
        try:
            body = json.loads(r.stdout or "{}")
        except json.JSONDecodeError:
            print(f"  ✗ non-JSON response: {(r.stdout or '')[:200]}")
            continue
        if body.get("error"):
            print(f"  ✗ {body['error']}")
            continue
        print(f"  saved: {body.get('solutions_saved')} structured rubrics")
        for d in body.get("rubric_details", []):
            status = "✓" if d["marks_match"] else "✗ MISMATCH"
            print(f"    Q{d['question_number']}: rubric {d['rubric_rows']} rows / {d['rubric_marks_total']} marks vs official {d['official_marks']} {status}")


if __name__ == "__main__":
    main()
