# Changelog

Alle vesentlige endringer i dette prosjektet vil bli dokumentert i denne filen.
Formatet er basert pa Keep a Changelog og folger Conventional Commits.

Regel: Ingen tankestrek i denne filen.

## [1.1.0] - 2026-11-04

### feat
- Flyttet tidsfiltre (I dag / I kveld, I helga, Denne uka, Alle dager) helt til toppen i en festet hurtigmeny.
- Redesignet arrangementskortene til et ultra-kompakt format uten unodig tomrom (open spaces) i boksene.
- Fast bildehoyde og strammere paddings for maksimal utnyttelse av skjermflaten.
- Utvidet rutenettet til 4 kolonner pa store skjermer for hoyere innholdstetthet og mindre skrolling.
- Gjort Trondheims-ruletten-kortet mer kompakt og integrert.

## [1.0.0] - 2026-11-04

### feat
- Initial lansering av TRD Live for ranheimkraft.no.
- 100 % klient-side arkitektur uten backend eller databasekrav.
- Daglig caching i localStorage med tidsstempel-sjekk (maks 1 API-kall per kalenderdag).
- Full GraphQL-integrasjon mot TRD Events (trdevents.no) med automatisk normalisering.
- Ranheim Kraft visuell profil med dyp grafitt-bakgrunn, neon cyan aksenter, Syne overskrifter og glassmorphism.
- Trondheims-ruletten feature med slot-machine animasjon og Web Audio chime.
- Tidsfiltre for I dag / I kveld, I helga, Denne uka og Alle dager med sanntids tellere.
- Kategori-piller med mobilvennlig beroringsskroll (Alle, Konsert, Sport, Kultur, Gratis, Mat & Sosialt).
- Fullstendig modalvisning med detaljer, Google Kalender-eksport og .ics-nedlasting.
- Frakoblet modus og robust fallback-datasett for a hindre krasj ved nettverksbrudd.

### docs
- Opprettet README.md med fullstendig arkitektur, designspesifikasjon og bruksveiledning.
- Opprettet CHANGELOG.md for kontinuerlig sporbarhet.
