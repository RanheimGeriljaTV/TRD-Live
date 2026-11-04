# Changelog

Alle vesentlige endringer i dette prosjektet vil bli dokumentert i denne filen.
Formatet er basert pa Keep a Changelog og folger Conventional Commits.

Regel: Ingen tankestrek i denne filen.

## [1.5.1] - 2026-11-04

### fix
- Forsterket ultra-tett listevisning med okt vertikal separasjon (gap-1, py-0.5, block truncate) og fast margin mot billettknappen, som forhindrer enhver form for overlapping pa mobil.
- Full synkronisering mot ranheimkraft.no/events/: Fjernet gammel tekstboks som hang igjen i det andre repoet.
- Oppgradert cache-busting til ?v=1.5.1 og localStorage til v4.

## [1.5.0] - 2026-11-04

### feat
- Optimalisert hele applikasjonen for 9:16 mobilskjermer med presis pikseljustering og null skjevheter.
- Omstrukturert den festede filterseksjonen til tre ryddige, faste linjer: Sokelinje med visningsvelger, tidsfilterchips og felles omrade-/kategorispor.
- Gjort Trondheims-ruletten vesentlig mer kompakt pa mobil (side-om-side layout) som sparer over 120px dyrebar vertikal skjermplass.
- Konvertert arrangementsmodalen til et moderne bunn-ark (bottom sheet) pa mobil med rounded-t-3xl og 88vh maks hoyde, tilpasset tommel-rekkevidde.

### fix
- Fikset uonsket linjebrudd i ultra-tett listevisning: Fjernet flex-wrap og lagt inn streng overflow-kontroll og shrink-0 pa tid og dato.
- Fikset kortvisningens tittel-høyde: Erstattet flex-oppsett med dedikert title-clamp-2 container slik at line-clamp-2 fungerer konsistent uten a sprenge boksene.
- Forhindret tekst-kollisjon mellom dato- og kategori-merke pa arrangementsbildene med max-w-65% og truncate.
- Lagt inn touch-scroll-x med -webkit-overflow-scrolling for silkemyk rulling av piller pa iOS og Android.
- Oppgradert cache-busting til ?v=1.5.0 og flyttet localStorage til v3 for umiddelbar oppdatering.

## [1.4.0] - 2026-11-04

### feat
- Plassert Ranheim Kraft overskriften direkte ved siden av isbjorn-maskoten (assets/logo.png og logosove.png) pa en enkelt kompakt linje.
- Fjernet overflodig hero-seksjon for a frigjore maksimal vertikal skjermplass pa mobil.
- Integrert cache-statusindikator og manuell oppdateringsknapp direkte i headeren.
- Lagt til automatisk sove-effekt for isbjornen bade ved musepeker (hover) og beroring (touch pa mobil).

### fix
- Lagt til cache-busting parametere (?v=1.4.0) pa style.css, app.js og fallback-data.js for a sikre at endringer vises umiddelbart pa mobil uten a bli blokkert av nettleser-cache.
- Lagt til Cache-Control og Pragma no-cache meta-tagger i HTML-hodet.
- Oppgradert localStorage cache-nokler til v2 for a forhindre at eldre data henger igjen i mobilminnet.

## [1.3.1] - 2026-11-04

### fix
- Fikset tekst-kollisjon og overlapping pa mobil i ultra-tett listevisning.
- Separert metadata (tid, spillested-badge, dato og pris) og tittel i to krystallklare lag med min-w-0 og ren truncate-stotte.
- Lagt til flex-shrink-0 pa alle filterknapper for a hindre komprimering ved horisontal beroringsskroll pa mobil.

## [1.3.0] - 2026-11-04

### feat
- Implementert Visnings-velger (Toggle mellom Kompakte Kort og Ultra-tett Liste uten bilder).
- Tilfoyd Bydels- og Omradefilter for Trondheim (Ranheim & Ostbyen, Midtbyen & Sentrum, Sorbyen & Tempe).
- Lagt til hurtigknapp for "Ut i kveld (etter 19)" som automatisk sorterer bort formiddagsutstillinger og viser kveldsarrangementer.
- Lagret brukerens foretrukne visningsmodus i localStorage for gjenbruk.

## [1.2.0] - 2026-11-04

### feat
- Fremhevet spillested/lokasjon kraftig med en tydelig, kontrastrik cyan badge og kartnal-ikon pa hvert arrangementskort.
- Fjernet lange beskrivelsestekster fra rutenett-kortene for a sikre en ensartet, ultra-kompakt boks-hoyde uten ujevn strekking.
- Full arrangementsbeskrivelse og nøyaktig gateadresse bevares tilgjengelig i den utvidede modulen ved klikk pa Mer info.
- Redusert bildehoyde (h-28 sm:h-32) og satt fast 2-linjers tittelhoyde for a eliminere all form for tomrom.

## [1.1.0] - 2026-11-04

### feat
- Flyttet tidsfiltre (I dag / I kveld, I helga, Denne uka, Alle dager) helt til toppen i en festet hurtigmeny.
- Redesignet arrangementskortene til et kompakt format uten unodig tomrom (open spaces) i boksene.
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
