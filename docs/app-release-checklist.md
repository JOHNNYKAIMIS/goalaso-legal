# Checklist release της εφαρμογής — «η πολιτική λέει ακόμα αλήθεια;» (κλάση G01)

Η πολιτική απορρήτου ζει εδώ· η εφαρμογή ζει στο `JOHNNYKAIMIS/goalaso`. Κάθε αλλαγή της εφαρμογής
που αγγίζει δεδομένα χρήστη μπορεί να κάνει την πολιτική ψευδή **χωρίς κανένα σήμα εδώ** — συνέβη
στις 2026-08-03 (in-app διαγραφή) και ξανά στις 2026-08-18 (όνομα/επώνυμο). Αυτό το checklist είναι
το βήμα που λείπει από τη ροή release της εφαρμογής, μέχρι να τρέχει μόνο του στο CI της.

## Πριν από κάθε release της εφαρμογής (άνθρωπος, 2 λεπτά)

```bash
# από τον φάκελο της εφαρμογής, με το goalaso-legal δίπλα:
node ../goalaso-legal/scripts/claims-check.mjs --app .
```

- **Πράσινο** → η πολιτική συμφωνεί με τον κώδικα για όλους τους ελέγξιμους ισχυρισμούς. Συνέχισε.
- **Κόκκινο «η εφαρμογή ΑΛΛΑΞΕ»** → ένας ισχυρισμός της πολιτικής δεν ισχύει πια. Πριν το release:
  1. ενημέρωσε το `privacy.html` (και στις δύο γλώσσες — ο φύλακας G02 το ελέγχει),
  2. άλλαξε την ημερομηνία «Τελευταία ενημέρωση» στη μέρα του commit (ουσιώδης αλλαγή — ο φύλακας G03 το ελέγχει),
  3. ενημέρωσε το `docs/claims.json` (anchors, `measured`) και, αν χρειάζεται, το `docs/known-debt.json`.
- **Κόκκινο «ΝΕΚΡΟ χρέος / ΝΕΚΡΟ κενό»** → κάτι που η πολιτική έλεγε λάθος τώρα ισχύει (ή μια λειτουργία έφυγε). Καθάρισε την εγγραφή — η καστάνια μόνο κατεβαίνει.

Μετά από κάθε ξαναμέτρηση: γράψε στο `docs/claims.json` → `app.measuredAt` (σήμερα) και `app.commit`
(`git rev-parse --short HEAD` της εφαρμογής). Ο φύλακας κοκκινίζει εδώ αν η μέτρηση περάσει τις
`maxAgeDays` (60) — επίτηδες: μια πολιτική που δεν ξαναμετρήθηκε δύο μήνες δεν είναι «εντάξει», είναι «δεν ξέρω».

## Τι μετρά ως αλλαγή που αγγίζει δεδομένα (ενημέρωσε πολιτική + ημερομηνία)

- νέα στήλη/πίνακας με στοιχεία προσώπου (`supabase/migrations`): όνομα, email, τηλέφωνο, φωτογραφία, θέση, συσκευή, tokens
- νέο SDK που μιλά σε τρίτο: push (Expo), crash/analytics, χάρτες/τοποθεσία, πληρωμές, διαφημίσεις (`apps/mobile/package.json`, `app.json`)
- νέος επεξεργαστής/φιλοξενία (Render, Supabase region, email provider) ή αλλαγή περιοχής
- αλλαγή στη ροή διαγραφής λογαριασμού ή στο τι μένει μετά (ανωνυμοποίηση)
- νέα συλλογή από μη-χρήστες (καλεσμένοι, λίστες αναμονής, email προσκλήσεων)

## Πρόταση για το CI της εφαρμογής (απόφαση ιδιοκτήτη — άλλο repo)

Ένα workflow στο `goalaso` που τρέχει σε PR όταν αλλάζουν αρχεία που αγγίζουν δεδομένα. Κάνει checkout
το `goalaso-legal` (public) και τρέχει τον φύλακα με `--app`. Κόκκινο = «άλλαξες κάτι που η πολιτική
περιγράφει· ενημέρωσέ την πρώτα».

```yaml
name: privacy-claims
on:
  pull_request:
    paths:
      - "supabase/migrations/**"
      - "apps/mobile/package.json"
      - "apps/mobile/app.json"
      - "backend/src/modules/identity/**"
      - "backend/src/modules/diagnostics/**"
      - "backend/src/modules/events/**"
permissions:
  contents: read
jobs:
  claims:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          repository: JOHNNYKAIMIS/goalaso-legal
          ref: main
          path: .legal
      - name: "claims:check --app — η πολιτική απορρήτου συμφωνεί με τον κώδικα"
        run: node .legal/scripts/claims-check.mjs --cwd .legal --app .
```

Όταν μπει και τρέξει πράσινο εκεί, η γραμμή Α1 του SCORECARD ξαναμετριέται (6 → 7)· όταν αποδειχθεί ότι
κοκκινίζει σε PR που προσθέτει π.χ. `expo-location`, 7 → 8.
