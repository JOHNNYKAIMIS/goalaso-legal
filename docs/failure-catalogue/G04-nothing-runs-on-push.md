<!--catalogue
id: G04
title: Τίποτα δεν τρέχει σε push
kind: open
-->

# G04 — Τίποτα δεν τρέχει σε push

## Το περιστατικό (μετρημένο 2026-08-21)

```bash
ls -A .github 2>/dev/null    # τίποτα — κανένα workflow
ls package.json Makefile 2>/dev/null    # τίποτα — κανένα τοπικό tooling
```

Ό,τι γίνει push στο main δημοσιεύεται όπως είναι. Σπασμένο tag, mojibake στα ελληνικά (η
γνωστή κατάρα των Windows-1252 εργαλείων), νεκρό εσωτερικό link — κανένα από αυτά δεν θα
σταματήσει πουθενά. Στη μέτρηση 2026-08-21 όλα ήταν καθαρά: 0 mojibake, 2/2 εσωτερικά links
υπαρκτά, charset=utf-8 και στα 3 αρχεία. Αλλά «καθαρό σήμερα» χωρίς φύλακα σημαίνει μόνο
«κανείς δεν έχει σπάσει τίποτα ΑΚΟΜΑ».

Ακρίβεια (μετρημένο 2026-08-22): ΕΝΑ πράγμα τρέχει σε push — το deploy, όχι έλεγχος:

```bash
gh api repos/JOHNNYKAIMIS/goalaso-legal/actions/workflows --jq '.workflows[].path'
# dynamic/pages/pages-build-deployment — μόνο το GitHub Pages deploy (4/4 runs success), δεν ζει στο repo
gh api repos/JOHNNYKAIMIS/goalaso-legal/branches/main/protection    # 404 — καμία προστασία
```

Δηλαδή κάθε push στο main δημοσιεύεται μέσα σε δευτερόλεπτα (push 16:23:26Z → run 16:23:31Z)
χωρίς να το σταματά τίποτα. Το «τίποτα δεν τρέχει» είναι χειρότερο απ' όσο ακούγεται: τρέχει
ακριβώς το βήμα που κάνει το λάθος ορατό σε χρήστες.

## Γιατί ξαναγυρίζει

Είναι η κλάση που επιτρέπει όλες τις άλλες: G01/G02/G03 δεν μπορούν να αποκτήσουν φύλακα αν δεν
υπάρχει πουθενά μέρος να τρέξει. Repo χωρίς κανένα check είναι repo όπου το πρώτο λάθος
ανακαλύπτεται από χρήστη.

## Τι το κλείνει μόνιμα

Ένα workflow (push + PR) με: (α) HTML validity και στα 3 αρχεία, (β) εσωτερικά links υπαρκτά,
(γ) έλεγχο mojibake/charset, (δ) τους φύλακες G02 + G03. Με λογοδοσία πλήθους («✓ 3 αρχεία,
N links») και fail-closed (0 αρχεία HTML → exit 2, όχι πράσινο). Και το workflow αποκτά
απόδειξη: ένα prove script που σπάει επίτηδες ένα αντίγραφο και επιβεβαιώνει το κόκκινο.

Επειδή main = παραγωγή, το workflow πρέπει να τρέχει και σε `pull_request`· μέχρι να μπει branch
protection (απόφαση ιδιοκτήτη, GitHub UI) η μόνη πύλη είναι ο κανόνας «ένα PR τη φορά, πράσινο
πριν merge». Μετά το deploy: smoke που κάνει diff live ↔ HEAD (βλ. SCORECARD, Γ).
