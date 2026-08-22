<!--catalogue
id: G05
title: Το ζωντανό site αποκλίνει από το main
kind: guarded
guard: scripts/deploy-check.mjs
prove: scripts/deploy-prove.mjs
-->

# G05 — Το ζωντανό site αποκλίνει από το main

## Το περιστατικό (μετρημένο 2026-08-22)

Δεν έχει συμβεί — μετρήθηκε: τα 3/3 αρχεία του `https://johnnykaimis.github.io/goalaso-legal/`
ταυτίζονται byte-προς-byte με το `origin/main` (`curl` + `cmp`). Είναι κλάση επειδή **αν συνέβαινε,
κανείς δεν θα το έβλεπε** (κλίμακα ≤4):

```bash
gh api repos/JOHNNYKAIMIS/goalaso-legal/pages/builds/latest --jq .commit
# 9bfa4b69… — το ΠΡΟΗΓΟΥΜΕΝΟ commit, ενώ το περιεχόμενο που σερβίρεται είναι του 30421cc:
# το μόνο σήμα που δίνει το GitHub για «τι είναι live» λέει ψέματα
curl -sI https://johnnykaimis.github.io/goalaso-legal/privacy.html | grep -i cache-control
# Cache-Control: max-age=600 — το CDN μπορεί να σερβίρει 10 λεπτά παλιό περιεχόμενο·
# έλεγχος χωρίς cache-buster θα έβλεπε το παλιό και θα έλεγε «όλα καλά»
gh api repos/JOHNNYKAIMIS/goalaso-legal/pages --jq '.source'
# {"branch":"main","path":"/"} — ρύθμιση εκτός repo· αν αλλάξει (branch, path, απενεργοποίηση), κανένα σήμα εδώ
```

## Γιατί ξαναγυρίζει

Το deploy είναι του GitHub, εκτός repo: δεν υπάρχει commit, diff ή test που να λέει «ο χρήστης
βλέπει ό,τι εγκρίθηκε». Η μόνη απόδειξη είναι να διαβάσεις το live και να το συγκρίνεις με το main
— κάθε φορά, όχι μία φορά.

## Τι το κλείνει μόνιμα

Smoke που κατεβάζει κάθε σελίδα από το live **χωρίς cache** και τη συγκρίνει byte-προς-byte με το
**main** (όχι με το checkout — σε PR που αλλάζει HTML το live είναι ακόμα το main). Τρέχει μετά από
κάθε push στο main (με αναμονή για το deploy), σε κάθε PR, και καθημερινά (drift στη ρύθμιση του
Pages). Με απόδειξη σε τοπικό HTTP server που παίζει το live.

## Ο φύλακας (γύρος 3 — 2026-08-22)

| | |
|---|---|
| Φύλακας | `node scripts/deploy-check.mjs [--base URL] [--ref origin/main] [--timeout S]` — για κάθε `*.html` του `origin/main` (`git ls-tree` + `git show`), `fetch` του `<base>/<αρχείο>?nocache=<ms>` με `Cache-Control: no-cache`, σύγκριση bytes. Polling μέχρι το παράθυρο (`DEPLOY_CHECK_TIMEOUT`, προεπιλογή 60 s· 600 s σε push στο main) |
| Απόδειξη | `node scripts/deploy-prove.mjs` — τοπικός HTTP server + προσωρινό git repo με `refs/remotes/origin/main`: ίδια bytes → πράσινο· ένα byte διαφορά, 404, 500, παλιό περιεχόμενο πέρα από το παράθυρο → κόκκινο· παλιό που φρεσκάρει μέσα στο παράθυρο → πράσινο (η αναμονή δουλεύει)· άλλα headers → πράσινο· ο server βλέπει cache-buster σε ΚΑΘΕ αίτημα· ref λείπει / 0 αρχεία / server κλειστός → exit 2. Πρώτα: το πραγματικό live ↔ origin/main → πράσινο |
| Πού τρέχει | `.github/workflows/quality.yml` (push + PR, παράθυρο 600 s στο main) και `.github/workflows/deploy-smoke.yml` (καθημερινά 06:17 UTC + χειροκίνητα — drift) |
| Λογοδοσία | «✓ deploy:check — 3/3 αρχεία του origin/main @ 30421cc ταυτίζονται byte-προς-byte με https://… (index.html 603 B, privacy.html 8104 B, terms.html 5941 B) — δοκιμή 1, 0,8 s, χωρίς CDN cache» |
| Fail-closed | ref `origin/main` δεν υπάρχει (ρηχό checkout), 0 αρχεία HTML στο main, καμία απάντηση HTTP → exit 2. HTTP 404/5xx ή διαφορά μετά το παράθυρο → exit 1 |

**Τι ΔΕΝ φυλάει (ρητά):** ότι το Pages δεν θα σερβίρει και άλλα αρχεία (π.χ. `docs/*.md` — σερβίρονται
ως raw, ακίνδυνο)· ότι το custom domain (`goalaso.net`) δείχνει εδώ — δεν δείχνει, είναι το SPA της
εφαρμογής (βλ. SCORECARD). Εξάρτηση από δίκτυο: αν το github.io πέσει, το CI κοκκινίζει — επίτηδες,
γιατί τότε ούτε οι χρήστες βλέπουν τις σελίδες.
