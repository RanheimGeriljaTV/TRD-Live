# TRD Live - Hva skjer i Trondheim

Offisiell arrangementshub og sanntidsguide for **ranheimkraft.no**.

TRD Live gir en lynrask, moderne og mobil-forst oversikt over hva som rorer seg i bartebyen Trondheim: fra konserter og fotballkamper til teaterforestillinger, kunstutstillinger, quizkvelder og gratisopplevelser for hele familien.

---

## Egenskaper og Funksjonalitet

1. **100 % Klient-side (Ingen backend, ingen database):**
   - Applikasjonen kjorer utelukkende i nettleseren som en moderne statisk webapplikasjon.
   - Krever ingen serverinstallasjon eller eksterne databaser.

2. **Daglig Caching (Maks 1 API-kall per kalenderdag):**
   - For a skane TRD Events sitt offentlige GraphQL API og garantere lynrask lasting pa mobil (0 ms responstid ved gjenbesok), caches hele datasettet lokalt i `localStorage`.
   - Ved oppstart sjekkes dagens dato (`YYYY-MM-DD`) mot `last_fetched_date`.
   - Dersom datoen er den samme som sist lagrede dato, benyttes cachen direkte.
   - Nar en ny dag har startet, gjor applikasjonen ett nytt `fetch`-kall for a oppdatere cachen automatisk.
   - Manuell oppdateringsknapp gir brukeren mulighet til a tvinge en ny henting ved behov.

3. **Visningsvelger (Kompakte Kort vs. Ultra-tett Liste):**
   - **Kortvisning:** Kompakte, innholdsrike bildekort med fast bildehoyde, kraftig fremhevet spillested-badge, starttidspunkt og direkte billettknapp.
   - **Ultra-tett listevisning:** En rad per arrangement (tid, spillested, tittel, pris og billett). Null bilder og null tomrom for lynrask skumming pa mobil.

4. **Bydels- og Omradefilter:**
   - Egen hurtigvelger for geografi i Trondheim:
     - *Alle bydeler*
     - *Ranheim & Ostbyen* (EXTRA Arena, Ranheim, Lademoen, Lade, Solsiden, Leangen, Charlottenlund)
     - *Midtbyen & Sentrum* (Byscenen, Samfundet, Olavshallen, Havet, Nidarosdomen, Torvet, Spektrum)
     - *Sorbyen & Tempe* (Lerkendal, Tempe, Sluppen, Saupstad, Heimdal, Granasen, Bymarka)

5. **Kveld- og Nattelivsfilter ("Ut i kveld etter 19"):**
   - Filtrerer automatisk bort formiddagsutstillinger og morgenkurs, og viser kun konserter, pubkvelder, quiz, standup og kamper som starter etter kl. 19:00.

6. **Trondheims-ruletten ("Overrask meg"):**
   - En interaktiv rulett-funksjon som velger et tilfeldig arrangement fra de kommende dagene.
   - Slot-machine flimmeranimasjon med synthesizert Web Audio-chime.
   - Spotlight hero-kort med glass-effekt, direkte billettlenke og mulighet for nye spinn.

7. **Tids- og Kategori-filtre:**
   - **Tidsfilter:** "I dag / I kveld", "I helga", "Denne uka", "Alle dager" med sanntids tellere.
   - **Kategori-filter:** *Alle*, *Konsert*, *Sport*, *Kultur*, *Gratis*, *Mat & Sosialt*.
   - **Sokefelt:** Instant sok pa tvers av tittel, spillested og beskrivelse.

8. **Kalender- og Delingsverktoy:**
   - Ett-klikks eksport direkte til **Google Kalender**.
   - Nedlasting av standard `.ics`-kalenderfil.
   - Kopiering av direkte arrangements- eller billettlenke.

9. **Robuste Feilhandtering og Frakoblet Modus:**
   - Hvis nettverket er nede eller API-et har midlertidig avbrudd, faller applikasjonen automatisk tilbake pa lagrede data eller det innebygde noed-datasettet.
   - Ingen hvite skjermer eller krasj.

---

## Prosjektstruktur

```text
TRD Events/
|-- assets/
|   |-- polarICON.ico         # Ranheim Kraft favicon
|   |-- logo.png              # Ranheim Kraft isbjorn maskot (vaken)
|   `-- logosove.png          # Ranheim Kraft isbjorn maskot (sover ved hover/touch)
|-- css/
|   `-- style.css             # Glassmorphism, neon glow og animasjoner
|-- js/
|   |-- app.js                # Applikasjonslogikk, API-kall og localStorage cache
|   `-- fallback-data.js      # Lokalt noed-datasett for frakoblet drift
|-- index.html                # Hovedapplikasjon (HTML5 + Tailwind CSS)
|-- CHANGELOG.md              # Versjonshistorikk etter Conventional Commits
`-- README.md                 # Prosjektdokumentasjon
```

---

## Datakilde

Arrangementsdata hentes fra det apne, offentlige GraphQL-endepunktet til **TRD Events** (Trondheim Management):
- Endepunkt: `https://trdevents.no/graphQL`
- Format: GraphQL POST-sporringer med paging og filter
- Autentisering: Ingen token pakrevd for standard anonyme lesekall

---

## Lisens og Opphavsrett

Utviklet for **Ranheim Kraft** (&copy; 2026).
Arrangementsinnhold tilhorer de respektive arrangorer og TRD Events.
