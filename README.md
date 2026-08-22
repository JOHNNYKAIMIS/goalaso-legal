# goalaso-legal — οι νομικές σελίδες του Goalaso

Τρεις στατικές σελίδες, δίγλωσσες (EL + EN στο ίδιο αρχείο): [`index.html`](index.html),
[`privacy.html`](privacy.html), [`terms.html`](terms.html). Δημοσιεύονται από το **main** μέσω GitHub Pages στο
<https://johnnykaimis.github.io/goalaso-legal/> — **κάθε push στο main είναι παραγωγή** μέσα σε δευτερόλεπτα.
Ποιος τις διαβάζει: οι χρήστες της εφαρμογής, τα stores, και όποιος ασκήσει δικαίωμα GDPR.

## Πού βρισκόμαστε

- [`docs/SCORECARD.md`](docs/SCORECARD.md) — η πηγή αλήθειας για την ποιότητα: 6 διαστάσεις, βαθμός 0-10, κάθε
  γραμμή με την εντολή που τη μετρά. Βαθμός ανεβαίνει μόνο όταν ξαναμετρηθεί στο SHA που μπήκε στο main.
- [`docs/failure-catalogue/`](docs/failure-catalogue/) — οι κλάσεις αστοχίας (G01-G05), ένα αρχείο ανά κλάση.
  Η κατάστασή τους **παράγεται**: [`STATUS.md`](docs/failure-catalogue/STATUS.md) από `node scripts/catalogue-status.mjs`.
- [`docs/claims.json`](docs/claims.json) — κάθε ισχυρισμός της πολιτικής απορρήτου δεμένος με το κείμενο και με μέτρηση
  στον κώδικα της εφαρμογής ([`JOHNNYKAIMIS/goalaso`](https://github.com/JOHNNYKAIMIS/goalaso)).
- [`docs/known-debt.json`](docs/known-debt.json) — το γνωστό χρέος: επιτρέπεται να μείνει, απαγορεύεται να μεγαλώσει,
  κάθε εγγραφή με λόγο και **ημερομηνία λήξης** (μετά, το CI κοκκινίζει επίτηδες).

## Πριν από κάθε push

```bash
npm run check      # όλοι οι φύλακες + οι αποδείξεις τους + έλεγχος ότι το STATUS.md είναι ενημερωμένο (χωρίς εξαρτήσεις, Node ≥ 18)
```

| Φύλακας | Τι φυλάει | Απόδειξη |
|---|---|---|
| `html:check` | δομή HTML, εσωτερικά links, UTF-8 χωρίς BOM, 0 mojibake (G04) | `html:prove` |
| `bilingual:check` | ίδια δομή h2/ul/li/a/p, ίδια ημερομηνία, αγγλικό τμήμα σε `lang="en"` (G02) | `bilingual:prove` |
| `date:check` | «Τελευταία ενημέρωση» = author date του τελευταίου ουσιώδους commit (G03) | `date:prove` |
| `deploy:check` | το live σερβίρει byte-προς-byte το `origin/main`, χωρίς CDN cache (G05) | `deploy:prove` |
| `claims:check` | ο κατάλογος ισχυρισμών δένει με το κείμενο· με `--app <φάκελος>` ξαναμετρά στον κώδικα (G01) | `claims:prove` |

Κάθε φύλακας τυπώνει **από πόσα** έλεγξε («✓ 3 αρχεία, 2 links…») και δίνει `exit 2` όταν δεν μπορεί να κρίνει
(0 αρχεία, όχι git, δίκτυο κάτω) — ποτέ πράσινο από απουσία. Οι αποδείξεις σπάνε επίτηδες αντίγραφα σε
προσωρινό φάκελο και επιβεβαιώνουν ότι ο φύλακας κοκκινίζει· τρέχουν και στο CI. Το ίδιο τρέχει σε κάθε
push και PR ([`.github/workflows/quality.yml`](.github/workflows/quality.yml)) και καθημερινά για το live
([`deploy-smoke.yml`](.github/workflows/deploy-smoke.yml)).

## Οι συμβάσεις (διάβασέ τες πριν αγγίξεις σελίδα)

1. **Ουσιώδης αλλαγή σε σελίδα = νέα ημερομηνία**, και στις δύο γλώσσες, ίση με τη μέρα του commit.
   Μη ουσιώδης (markup, τυπογραφικό, `lang`) = `[no-date]` στο θέμα του commit. Τρίτη επιλογή δεν υπάρχει — ο
   `date:check` πέφτει.
2. **Ό,τι αλλάζει στα ελληνικά αλλάζει και στα αγγλικά** στο ίδιο commit — ο `bilingual:check` μετρά δομή και
   ημερομηνία, όχι νόημα· το νόημα είναι δική σου ευθύνη.
3. **Αν η αλλαγή αφορά ισχυρισμό για την εφαρμογή**, ενημέρωσε το `docs/claims.json` (anchors EL + EN, μέτρηση) —
   αλλιώς ο `claims:check` πέφτει επειδή το anchor χάθηκε. Ψευδής ή ελλιπής δήλωση που μένει = εγγραφή στο
   `known-debt.json` με λόγο και λήξη.
4. **Merge χωρίς squash** («Create a merge commit» ή «Rebase and merge»): το squash φτιάχνει νέο commit με
   σημερινή ημερομηνία και η σελίδα παύει να λέει αλήθεια. Η απόδειξη του G03 το δείχνει.
5. **Ένα PR τη φορά**, πράσινο πριν το merge. Η ετυμηγορία μετρά στο SHA που μπήκε στο main, όχι στο πράσινο του PR.
6. Πριν από κάθε release της εφαρμογής: [`docs/app-release-checklist.md`](docs/app-release-checklist.md)
   (`node ../goalaso-legal/scripts/claims-check.mjs --app .` μέσα από τον φάκελο της εφαρμογής).

## Τι ΔΕΝ κάνουν οι φύλακες

Δεν κρίνουν νομική επάρκεια, δεν ελέγχουν αν το email επικοινωνίας απαντά, δεν κάνουν fetch εξωτερικούς
συνδέσμους, δεν βλέπουν την περιοχή του live Supabase. Κάθε τέτοιο «ΔΕΝ ΜΕΤΡΗΘΗΚΕ» είναι γραμμένο ρητά στο
SCORECARD — ένα «μάλλον καλά» είναι χειρότερο από ένα «δεν ξέρω».
