# Κατάσταση κλάσεων αστοχίας — ΠΑΡΑΓΕΤΑΙ, μην το γράφεις με το χέρι

> Παράγεται από `node scripts/catalogue-status.mjs`, που τρέχει τον φύλακα ΚΑΙ την απόδειξη κάθε κλάσης.
> Το CI τρέχει `--check`: αν αυτό το αρχείο δεν ταιριάζει με ό,τι παράγουν οι φύλακες, κοκκινίζει.
> ΦΥΛΑΣΣΕΤΑΙ = φύλακας πράσινος ΚΑΙ απόδειξη πράσινη · ΑΝΟΙΧΤΗ = κανένας φύλακας · ΣΠΑΣΜΕΝΟΣ ΦΥΛΑΚΑΣ = υπάρχει αλλά πέφτει.

| # | Κλάση | Κατάσταση | Φύλακας | Απόδειξη |
|---|---|---|---|---|
| G01 | [Η πολιτική μένει πίσω από την εφαρμογή](G01-policy-lags-app.md) | ΑΝΟΙΧΤΗ | — | — |
| G02 | [Δίγλωσση απόκλιση EL ↔ EN](G02-bilingual-divergence.md) | **ΦΥΛΑΣΣΕΤΑΙ** | `node scripts/bilingual-check.mjs` → ✓ bilingual:check — 2 δίγλωσσες σελίδες (privacy.html, terms.html), 1 μονόγλωσσες παραλείφθηκαν (index.html), h2 7=7/8=8 · ul 2=2/0=0 · li 8=8/0=0 · a 3=3/1=1 · p 7=7/10=10, ημερομηνίες EL=EN 2/2, lang="en" 0/2 (+2 γνωστό χρέος, λήγει 2026-09-21) | `node scripts/bilingual-prove.mjs` → ✓ bilingual:prove — 12/12 μεταλλάξεις κόκκινες, 3/3 αθώες πράσινες, fail-closed 2/2 |
| G03 | [Χειρόγραφη ημερομηνία «Τελευταία ενημέρωση»](G03-hand-maintained-date.md) | **ΦΥΛΑΣΣΕΤΑΙ** | `node scripts/date-check.mjs` → ✓ date:check — 2 σελίδες με ημερομηνία (privacy.html, terms.html), 1 χωρίς (index.html), 1/2 = τελευταίο ουσιώδες commit (+1 γνωστό χρέος: privacy.html 2026-08-04 ≠ 2026-08-03, λήγει 2026-09-21), 0 [no-date] commits αγνοήθηκαν | `node scripts/date-prove.mjs` → ✓ date:prove — 11/11 μεταλλάξεις κόκκινες, 3/3 αθώες πράσινες, fail-closed 3/3 |
| G04 | [Τίποτα δεν τρέχει σε push](G04-nothing-runs-on-push.md) | **ΦΥΛΑΣΣΕΤΑΙ** | `node scripts/html-check.mjs` → ✓ html:check — 3 αρχεία (index.html, privacy.html, terms.html), 2 εσωτερικά links (2 υπαρκτά), 2 εξωτερικά (ΔΕΝ ελέγχθηκαν), 6 mailto, 0 mojibake, UTF-8 χωρίς BOM 3/3 | `node scripts/html-prove.mjs` → ✓ html:prove — 13/13 μεταλλάξεις κόκκινες, 5/5 αθώες πράσινες, fail-closed 2/2 |
| G05 | [Το ζωντανό site αποκλίνει από το main](G05-live-diverges-from-main.md) | **ΦΥΛΑΣΣΕΤΑΙ** | `node scripts/deploy-check.mjs` → ✓ πράσινο (εξαρτάται από live/main — λογοδοσία στο log του CI) | `node scripts/deploy-prove.mjs` → ✓ deploy:prove — 4/4 μεταλλάξεις κόκκινες, 4/4 αθώες πράσινες, fail-closed 3/3 |

Σύνολο: 5 κλάσεις — 4 ΦΥΛΑΣΣΕΤΑΙ, 1 ΑΝΟΙΧΤΕΣ, 0 σπασμένοι φύλακες.
