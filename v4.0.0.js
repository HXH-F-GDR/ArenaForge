/**
 * HxH GDR — ARENA CELESTE
 * Sistema semi-automatico di risoluzione incontri contro NPC.
 *
 * Da caricare DOPO il markup della pagina (#af-root).
 * L'SDK Firebase viene caricato da qui, a runtime: ForumFree rimuove
 * i tag script verso domini esterni, tranne jsDelivr.
 *
 * Richiede: Firebase Realtime Database
 * Permessi: legge le classi CSS del <body> (admin, g1-g4 = staff)
 */

/* ============================================================
   HxH ARENA CELESTE — motore
   SDK Firebase "compat": script classici, niente ES modules.
   ForumFree/ForumCommunity strippano <script type="module">.
   ============================================================ */
(function(){
"use strict";

/* ---------- CONFIG ---------- */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC9bjAg5mVg31fpBmavZSiOIo3e_CfRVQs",
  authDomain:        "arena-forge-e3970.firebaseapp.com",
  databaseURL:       "https://arena-forge-e3970-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "arena-forge-e3970",
  storageBucket:     "arena-forge-e3970.firebasestorage.app",
  messagingSenderId: "1081806498646",
  appId:             "1:1081806498646:web:7176de268100e85d0004f7"
};

/* Gruppi considerati staff: admin, g1 (GDR Masters), g2 (GDR Mods),
   g3 (GDR Graphers x Masters), g4 (Graphers).
   Il rilevamento avviene tramite le classi CSS del <body>. */

const DB_ROOT = "arena";           // nodo radice su Realtime Database
const SOGLIA_KO = 0.05;            // NPC sconfitto sotto il 5% della vita iniziale

/* ---------- TEMPLATE BBCODE (invariati dall'originale) ---------- */
const MINIATURA_POST = `<div align="center"><div style="width:600px; line-height:100%; font-family: georgia; font-size:14px; color: black;text-align: justify; padding: 10px;"><div style="float: left; width: 150px; height: 150px; border: 5px solid black; border-radius: 100%; margin-right:5px; overflow: hidden;"><div style="width: 100%; height: 100%; background-image: url(IMMAGINE_URL); background-size: cover; background-position: center;"></div></div><div style="width: auto; font-family: times; line-height: 20px; font-size: 20px; color: black; text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 0 1px #7d7459; text-align: right; border-bottom: 5px solid black">NOME_NPC</div></div></div>`;

const MINIATURA_ARBITRO = `\n\n\n\n\n<div align="center"><div style="width:600px; line-height:100%; font-family: georgia; font-size:14px; color: black;text-align: justify; padding: 10px;"><div style="float: left; width: 150px; height: 150px; border: 5px solid black; border-radius: 100%; margin-right:5px; overflow: hidden;"><div style="width: 100%; height: 100%; background-image: url(https://i.imgur.com/zSbKd1D.png); background-size: cover; background-position: center;"></div></div><div style="width: auto; font-family: times; line-height: 20px; font-size: 20px; color: black; text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 0 1px #7d7459; text-align: right; border-bottom: 5px solid black">[color=black]P.L. HILL - ARBITRO[/color]</div><div style="text-align: right; font-family: times; font-size: 14px; padding-top:5px; padding-bottom:3px; padding-left:5px; line-height:90%">Narrato - <i>[color=black]Pensato[/color]</i> - <b>[color=black]Parlato[/color]</b>&nbsp;</div><div style="text-align: justify; font-family: times; font-size: 15px; padding-top:5px; padding-bottom:3px; padding-left:5px; line-height:90%">`;

const ARBITRO_VITTORIA_NPC = MINIATURA_ARBITRO + `L'arbitro osservò NOME_GIOCATORE mentre cadeva a terra, privo di forze.\n\n<b>[color=black]NOME_GIOCATORE non è più in grado di combattere. Il vincitore è NOME_NPC ![/color]</b>\n\nEsclamò, tendendo un braccio in sua direzione.\n\n</div><div style="border-bottom: 5px solid black"></div></div></div>\n\n<p align="center">[size=10]Incontro concluso![/size]</p>`;

const ARBITRO_VITTORIA_GIOCATORE = MINIATURA_ARBITRO + `L'arbitro osservò NOME_NPC mentre cadeva a terra, privo di forze.\n\n<b>[color=black]NOME_NPC non è più in grado di combattere. Il vincitore è NOME_GIOCATORE ![/color]</b>\n\nEsclamò, tendendo un braccio in sua direzione.\n\n</div><div style="border-bottom: 5px solid black"></div></div></div>\n\n<p align="center">[size=10]Incontro concluso![/size]</p>`;

const DISCLAIMER_TESTO = `Risposta generata in modo semiautomatico senza controllo stretto dello Staff. In caso di problemi o dubbi contattare i Master.`;

/* Lo spoiler iniziale include il verbale del tiro: chi legge il post
   può verificare che i valori usati nelle formule siano quelli usciti
   davvero dai dadi. */
function costruisciDisclaimer(tiro){
  if (!tiro) return `[SPOILER]${DISCLAIMER_TESTO}[/SPOILER]`;

  const ora = new Date(tiro.ts);
  const dataOra =
    String(ora.getDate()).padStart(2,"0") + "/" +
    String(ora.getMonth()+1).padStart(2,"0") + "/" + ora.getFullYear() + " " +
    String(ora.getHours()).padStart(2,"0") + ":" +
    String(ora.getMinutes()).padStart(2,"0");

  const dado = "d" + tiro.facce;

  const L = [];
  L.push("[SPOILER]");
  L.push(DISCLAIMER_TESTO);
  L.push("");
  L.push("── VERBALE DEL TIRO ──");
  L.push("Tirato il " + dataOra + "  ·  ID " + tiro.id);
  L.push("");
  L.push("Mossa difensiva ....... " + (tiro.idxDif + 1) + " / " + tiro.nDif);
  L.push("Mossa offensiva ....... " + (tiro.idxAtt + 1) + " / " + tiro.nAtt);
  L.push("Tenacia in difesa ..... " + tiro.tenDif + "  (" + dado +
         (tiro.malus > 0 ? ": " + tiro.rawDif + " − " + tiro.malus + " Fortuna" : "") + ")");
  L.push("Tenacia in attacco .... " + tiro.tenAtt + "  (" + dado +
         (tiro.malus > 0 ? ": " + tiro.rawAtt + " − " + tiro.malus + " Fortuna" : "") + ")");
  if (tiro.fortuna > 0)
    L.push("Fortuna Totale del PG .. " + tiro.fortuna + "  (−" + tiro.malus + " a ogni dado tenacia)");
  L.push("");
  L.push("Lanci effettuati su questo NPC: " + tiro.nTiri +
         (tiro.nTiri > 1 ? "  (!)" : ""));
  L.push("[/SPOILER]");
  return L.join("\n");
}

/* ---------- STATO ---------- */
let NPCS = {};            // { slug: npcObject }
let IS_STAFF = false;
let selDif = null, selAtt = null;   // mosse selezionate (0-4)
let TIRO = null;                   // esito del lancio corrente (null = non ancora tirato)
let CONTA_TIRI = 0;                // quanti lanci su questo NPC in questa sessione
let STORICO = {};                  // { id: lancio } — log condiviso su Firebase
let ORDINE_LOG = "cronologico";    // "cronologico" | "gestione"
let db = null, dbOk = false;

/* ---------- HELPERS ---------- */
const $  = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const escUrl = u => String(u ?? "").replace(/[()'"\\\s]/g, "");
const slug = n => String(n).toLowerCase().trim()
  .replace(/[àáâä]/g,"a").replace(/[èéêë]/g,"e").replace(/[ìíîï]/g,"i")
  .replace(/[òóôö]/g,"o").replace(/[ùúûü]/g,"u")
  .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
const nInt = v => { const n = parseInt(v,10); return isNaN(n) ? 0 : n; };

/* ------------------------------------------------------------
   ForumFree censura la chiamata al metodo di click iniettando un
   asterisco e rompendo il JS. Invochiamo il metodo per nome, così
   quella sequenza non compare mai nel sorgente.
   ------------------------------------------------------------ */
const _CLK = "cl" + "ick";
function clicca(el){ if (el && typeof el[_CLK] === "function") el[_CLK](); }

function toast(msg, tipo="info"){
  const t = document.createElement("div");
  t.className = "af-toast " + tipo;
  t.textContent = msg;
  $("afToasts").appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .3s";
    setTimeout(()=>t.remove(),300); }, 3200);
}

/* Una mossa è "schivata" se è la 5ª o se inizia con € */
const isSchivata = (m, idx) => idx === 4 || String(m?.descrizione||"").startsWith("€");

/* Estrae {ok, ko} da una descrizione-schivata "€Testo ok | Testo ko" */
function parseSchivata(desc){
  const clean = String(desc||"").replace(/^€/,"");
  const parts = clean.split("|");
  return {
    ok: (parts[0]||"").trim(),
    ko: (parts[1]||"").trim()
  };
}

function descrizioneCasuale(sit){
  const arr = FRASI[sit] || [];
  if(!arr.length) return "";
  return arr[Math.floor(Math.random()*arr.length)];
}

/* ============================================================
   DADI
   ------------------------------------------------------------
   Sostituisce i quattro tiri che il giocatore faceva a mano nel
   post: mossa offensiva, mossa difensiva, tenacia in attacco,
   tenacia in difesa.

   Tenacia: d100 indipendenti per attacco e difesa (nessun tetto
   sulla somma). Gli NPC del PIANO 0 tirano invece un d50, perché
   dispongono di 50 punti tenacia anziché 100.
   ============================================================ */
const d = n => 1 + Math.floor(Math.random() * n);   // dado a n facce

/* Quante facce ha il dado della tenacia per questo NPC. */
function facceTenacia(npc){
  return Number(npc?.pianoArenaCeleste) === 0 ? 50 : 100;
}

/* Regola Torre Celeste: ogni 100 di Fortuna Totale in scheda toglie
   10 al valore estratto con il dado tenacia. A scalini interi
   (90→0, 100→-10, 250→-20), applicata sia in attacco che in difesa,
   con minimo 1 come per gli altri dadi. */
function riduzioneFortuna(fortuna){
  const f = Math.max(0, Number(fortuna) || 0);
  return Math.floor(f / 100) * 10;
}

function tiraNPC(npc, fortuna){
  const facce = facceTenacia(npc);
  const malus = riduzioneFortuna(fortuna);

  const rawDif = d(facce);          // valore grezzo del dado
  const rawAtt = d(facce);

  return {
    idxDif: d(npc.movesetDifensivo.length) - 1,   // 1-5 → 0-4
    idxAtt: d(npc.movesetOffensivo.length) - 1,
    rawDif, rawAtt,                                // per il verbale
    tenDif: Math.max(1, rawDif - malus),           // valore effettivo
    tenAtt: Math.max(1, rawAtt - malus),
    facce,
    fortuna: Math.max(0, Number(fortuna) || 0),
    malus                                          // per il verbale
  };
}

/* ============================================================
   PERMESSI
   ------------------------------------------------------------
   ForumFree/ForumCommunity scrivono il gruppo dell'utente nelle
   classi CSS del <body>:  admin, g1, g2, … g14
   Usiamo HxHFramework.groups.isStaff() se disponibile, con un
   fallback autonomo identico nel caso il framework non ci sia
   o non sia ancora stato caricato.
   ============================================================ */
function staffDaBody(){
  const c = document.body.className || "";
  return /\badmin\b/.test(c) || /\b(g1|g2|g3|g4)\b/.test(c);
}

function utenteLoggato(){
  const c = document.body.className || "";
  return /\badmin\b/.test(c) ||
         /\b(g1|g2|g3|g4|g5|g6|g7|g8|g9|g10|g11|g12|g13|g14)\b/.test(c);
}

/* ------------------------------------------------------------
   Nome utente. ForumFree espone un oggetto globale `Commons`
   (lo stesso che HxHFramework usa per Commons.user.id).
   Se non c'è, ripieghiamo sul link del profilo nell'header.
   ------------------------------------------------------------ */
function nomeUtente(){
  // override per test: localStorage.setItem('af_utente','Nome')
  const ov = localStorage.getItem("af_utente");
  if (ov) return ov;

  try{
    const u = window.Commons?.user;
    if (u){
      const n = u.name || u.nickname || u.username || u.display_name;
      if (n) return String(n).trim();
    }
  }catch(e){}

  // ForumFree mette il nick nel link al proprio profilo
  const sel = [
    "#logged-in-as a", ".logged-in a", "#user-info a",
    "a[href*='act=Profile'][href*='MID=']",
    "#userlinks a:first-child", ".userlink"
  ];
  for (const s of sel){
    const el = document.querySelector(s);
    if (el && !el.closest("#af-root")){
      const t = el.textContent.trim();
      if (t && t.length < 40) return t;
    }
  }
  return "";
}

function idUtente(){
  try{ if (window.Commons?.user?.id) return String(window.Commons.user.id); }catch(e){}
  const a = document.querySelector("a[href*='act=Profile'][href*='MID=']");
  const m = a && a.href.match(/MID=(\d+)/);
  return m ? m[1] : "";
}

function rilevaStaff(){
  // override manuale per test (console: localStorage.setItem('af_staff_override','1'))
  const ov = localStorage.getItem("af_staff_override");
  if (ov === "1") return true;
  if (ov === "0") return false;

  // il framework del forum, se presente, è la fonte autorevole
  if (window.HxHFramework?.groups?.isStaff) {
    try { return window.HxHFramework.groups.isStaff(); } catch(e){}
  }
  return staffDaBody();
}

function applicaPermessi(){
  IS_STAFF = rilevaStaff();

  const loggato = utenteLoggato();
  $("afRole").innerHTML = IS_STAFF ? '<i class="fa-solid fa-star"></i> staff' : (loggato ? "utente" : "ospite");
  $("afRole").classList.toggle("on", IS_STAFF);
  $("afRole").style.cursor = "help";
  $("afRole").title = "Clicca per la diagnostica dei permessi";

  $("afTabAdmin").hidden    = !IS_STAFF;
  if (typeof STORICO !== "undefined") renderStorico();   // il tasto "gestisci" dipende dai permessi

  // se la tab Gestione era aperta e l'utente non è (più) staff, torna a Incontro
  if (!IS_STAFF){
    const adminTab = document.querySelector('#af-root .af-tab[data-tab="admin"]');
    if (adminTab?.classList.contains("active"))
      clicca(document.querySelector('#af-root .af-tab[data-tab="combat"]'));
  }

}

/* Diagnostica: cliccando il badge del ruolo si vede COSA ha letto il codice.
   Serve a capire al volo perché un permesso non viene riconosciuto. */
function diagnostica(){
  const cls = document.body.className || "(VUOTO)";
  const fw  = window.HxHFramework ? "presente" : "assente";
  const fwS = window.HxHFramework?.groups?.isStaff
    ? String(window.HxHFramework.groups.isStaff()) : "n/d";
  const ov  = localStorage.getItem("af_staff_override") ?? "nessuno";
  const sdk = window.firebase
    ? (firebase.database ? "OK (app + database)" : "PARZIALE (manca database)")
    : "NON CARICATO";

  alert(
    "DIAGNOSTICA — ARENA CELESTE\n" +
    "══════════════════════════════\n\n" +
    "▸ PERMESSI\n" +
    "Classi del <body>:\n  " + cls + "\n" +
    "HxHFramework: " + fw + "  (isStaff: " + fwS + ")\n" +
    "Test sulle classi: " + staffDaBody() + "\n" +
    "Override manuale: " + ov + "\n" +
    "→ RISULTATO: " + (IS_STAFF ? "STAFF" : "NON staff") + "\n\n" +
    "▸ UTENTE\n" +
    "Nome rilevato: " + (nomeUtente() || "(NESSUNO)") + "\n" +
    "ID: " + (idUtente() || "n/d") + "\n" +
    "window.Commons: " + (window.Commons ? "presente" : "assente") + "\n\n" +
    "▸ FIREBASE\n" +
    "SDK: " + sdk + "\n" +
    "Connessione: " + (dbOk ? "attiva" : "NON attiva") + "\n" +
    "NPC caricati: " + Object.keys(NPCS).length + "\n\n" +
    "══════════════════════════════\n" +
    (cls === "(VUOTO)"
      ? "(!) Il <body> non ha classi: lo script gira fuori\n   dal forum, oppure non sei loggata.\n"
      : "") +
    (!nomeUtente()
      ? "(!) Nome utente non rilevato: i lanci verranno registrati\n    come (sconosciuto). Vedi nomeUtente() in arena.js.\n"
      : "") +
    (sdk === "NON CARICATO"
      ? "(!) L'SDK Firebase non si è caricato: il forum sta\n   bloccando gli script esterni.\n"
      : "")
  );
}

/* Il framework e le classi del <body> possono arrivare in ritardo:
   riproviamo per qualche secondo e osserviamo i cambi di classe. */
function attendiFramework(){
  applicaPermessi();                 // primo tentativo immediato
  if (IS_STAFF) return;

  let tentativi = 0;
  const t = setInterval(() => {
    tentativi++;
    const prima = IS_STAFF;
    applicaPermessi();
    if (IS_STAFF && !prima){
      console.log("[Arena Celeste] permessi staff riconosciuti al tentativo", tentativi);
      clearInterval(t);
      return;
    }
    if (tentativi > 24) clearInterval(t);   // ~6 secondi
  }, 250);

  // se lo skin aggiunge le classi del gruppo dopo il load, ce ne accorgiamo
  try{
    new MutationObserver(() => {
      const prima = IS_STAFF;
      applicaPermessi();
      if (IS_STAFF && !prima)
        console.log("[Arena Celeste] permessi staff riconosciuti via MutationObserver.");
    }).observe(document.body, { attributes:true, attributeFilter:["class"] });
  }catch(e){ /* ambienti senza MutationObserver: pazienza */ }
}

/* ============================================================
   FIREBASE
   ============================================================ */
/* ------------------------------------------------------------
   ForumFree rimuove i tag script che puntano a domini esterni:
   sopravvive solo jsDelivr. Quindi carichiamo l'SDK Firebase da
   qui, a runtime, servendolo anch'esso via jsDelivr.
   ------------------------------------------------------------ */
const SDK_URLS = [
  "https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-app-compat.js",
  "https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-database-compat.js"
];

/* Mirror di riserva, nel caso jsDelivr/npm faccia i capricci. */
const SDK_FALLBACK = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"
];

function caricaScript(url){
  return new Promise((ok, ko) => {
    const el = document.createElement("script");
    el.src   = url;
    el.async = false;                 // preserva l'ordine: app PRIMA di database
    el.onload  = () => ok(url);
    el.onerror = () => ko(new Error("impossibile caricare " + url));
    document.head.appendChild(el);
  });
}

async function caricaSDK(){
  if (window.firebase?.database) return true;    // già presente

  try{
    for (const u of SDK_URLS) await caricaScript(u);
  }catch(e){
    console.warn("[Arena Celeste] jsDelivr fallito, provo gstatic:", e.message);
    for (const u of SDK_FALLBACK) await caricaScript(u);
  }
  return !!window.firebase?.database;
}

async function initFirebase(){
  try{
    $("afSync").innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> carico SDK…';

    const pronto = await caricaSDK();
    if (!pronto){
      $("afSync").innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> SDK non caricato';
      $("afSync").className = "af-badge err";
      toast("Impossibile caricare l'SDK Firebase.","err");
      render();
      return;
    }

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    dbOk = true;

    db.ref(DB_ROOT + "/storico").on("value", snap => {
      STORICO = snap.val() || {};
      renderStorico();
    });

    db.ref(DB_ROOT + "/npcs").on("value", snap => {
      NPCS = snap.val() || {};
      $("afSync").innerHTML = '<i class="fa-solid fa-circle-check"></i> sincronizzato';
      $("afSync").className = "af-badge sync";
      render();
    }, err => {
      $("afSync").innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> errore di lettura';
      $("afSync").className = "af-badge err";
      console.error("[Arena] Firebase:", err);
      toast("Firebase: " + err.message, "err");
    });

  }catch(e){
    $("afSync").innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> firebase ko';
    $("afSync").className = "af-badge err";
    console.error(e);
  }
}

async function salvaNPC(npc){
  if(!IS_STAFF) return toast("Non hai i permessi per modificare gli NPC.","err");
  if(!dbOk)     return toast("Firebase non è connesso.","err");
  await db.ref(DB_ROOT + "/npcs/" + slug(npc.nome)).set(npc);
  toast(`"${npc.nome}" salvato.`,"ok");
}

async function eliminaNPC(key){
  if(!IS_STAFF) return toast("Non hai i permessi.","err");
  await db.ref(DB_ROOT + "/npcs/" + key).remove();
  toast("NPC eliminato.","ok");
}



/* ============================================================
   MOTORE DI COMBATTIMENTO
   ------------------------------------------------------------
   Restituisce { testo, calc } senza toccare il DOM: così è
   testabile e riusabile.
   ============================================================ */
function risolviTurno(o){
  const {
    npc, giocatore, esito,
    idxDif, idxAtt,
    forza, velocita, vitaResidua,
    tenaciaDif, tenaciaAtt,
    ostDif, ostAtt,
    tiro
  } = o;

  const L = [];   // righe del post
  const calc = {};

  L.push(costruisciDisclaimer(tiro), "");
  L.push(MINIATURA_POST
    .replace("IMMAGINE_URL", escUrl(npc.miniatura))
    .replace("NOME_NPC", npc.nome), "");

  /* --- caso 1: l'NPC ha già vinto --- */
  if (esito === "vittoria_npc"){
    const d = descrizioneCasuale("vittoria_npc");
    if (d) L.push(d, "");
    L.push(ARBITRO_VITTORIA_NPC
      .replace(/NOME_GIOCATORE/g, giocatore)
      .replace(/NOME_NPC/g, npc.nome));
    return { testo:L.join("\n"), calc:{ esito:"KO del PG" }, finito:true };
  }

  /* --- FASE DIFENSIVA ---
     I calcoli vengono fatti PRIMA di scrivere il post: solo così
     sappiamo se l'NPC sopravvive. Se cade, la narrazione della
     difesa non va scritta (sarebbe assurdo che "incassi il colpo
     con un sorriso beffardo" mentre viene messo KO): resta solo
     il QUOTE con le formule, seguito dal testo di sconfitta.     */
  const mDif = npc.movesetDifensivo[idxDif];
  const mAtt = npc.movesetOffensivo[idxAtt];

  const schivata = isSchivata(mDif, idxDif);
  const sogliaKO = Math.floor(npc.vitaIniziale * SOGLIA_KO);

  let difesa = 0, danno = 0, vitaDopo = vitaResidua;
  let schivataOk = false;
  let narrazione = "";        // il testo narrativo della difesa
  const Q = [];               // le righe del QUOTE

  if (schivata){
    schivataOk = (npc.riflessi >= velocita) && (npc.destrezza >= velocita);
    const t = parseSchivata(mDif.descrizione);

    if (schivataOk){
      narrazione = t.ok || `${npc.nome} schiva l'attacco.`;
      Q.push("Fase difensiva — schivata");
      Q.push(`Riflessi (${npc.riflessi}) e Destrezza (${npc.destrezza}) ≥ Velocità attacco (${velocita}) → schivata riuscita.`);
      Q.push("Danno subito = 0");
      Q.push(`Vita residua = ${vitaResidua}[/QUOTE]`);
      calc.difesa = "—"; calc.danno = 0; calc.vita = vitaResidua;

    } else {
      narrazione = t.ko || `${npc.nome} cerca di schivare l'attacco, senza riuscirci.`;
      Q.push("Fase difensiva — schivata fallita");
      Q.push(`Riflessi (${npc.riflessi}) e/o Destrezza (${npc.destrezza}) < Velocità attacco (${velocita}) → schivata fallita.`);

      // sulla schivata fallita NON si applica la tenacia (come nell'originale)
      if (ostDif){
        difesa = Math.floor(mDif.valore * 0.5);
        Q.push(`Resistenza base = ${mDif.valore}`);
        Q.push(`Difesa = ${mDif.valore} × 0.5 (malus ostinazione) = ${difesa}`);
      } else {
        difesa = mDif.valore;
        Q.push(`Resistenza base = ${mDif.valore}`);
        Q.push(`Difesa = ${difesa}`);
      }
      danno    = Math.max(0, forza - difesa);
      vitaDopo = Math.max(0, vitaResidua - danno);
      Q.push(`Danno subito = ${forza} − ${difesa} = ${danno}`);
      Q.push(`Vita residua = ${vitaResidua} − ${danno} = ${vitaDopo}[/QUOTE]`);
      calc.difesa = difesa; calc.danno = danno; calc.vita = vitaDopo;
    }

  } else {
    /* difesa normale — la tenacia conta */
    narrazione = mDif.descrizione;
    Q.push("Fase difensiva");
    const base = mDif.valore + (tenaciaDif * 5);
    if (ostDif){
      difesa = Math.floor(base * 0.5);
      Q.push(`Resistenza base = ${mDif.valore}`);
      Q.push(`Difesa = (${mDif.valore} + (${tenaciaDif} × 5)) × 0.5 (malus ostinazione) = ${difesa}`);
    } else {
      difesa = base;
      Q.push(`Resistenza base = ${mDif.valore}`);
      Q.push(`Difesa = ${mDif.valore} + (${tenaciaDif} × 5) = ${difesa}`);
    }
    danno    = Math.max(0, forza - difesa);
    vitaDopo = Math.max(0, vitaResidua - danno);
    Q.push(`Danno subito = ${forza} − ${difesa} = ${danno}`);
    Q.push(`Vita residua = ${vitaResidua} − ${danno} = ${vitaDopo}[/QUOTE]`);
    calc.difesa = difesa; calc.danno = danno; calc.vita = vitaDopo;
  }

  const abbattuto = vitaDopo <= sogliaKO;

  /* La narrazione della difesa si scrive solo se l'NPC regge il colpo. */
  if (!abbattuto) L.push(narrazione, "");

  L.push("[QUOTE]");
  L.push(...Q);
  L.push("");

  /* --- NPC ABBATTUTO: si chiude qui --- */
  if (abbattuto){
    const d = descrizioneCasuale("sconfitta_npc");
    if (d) L.push(d, "");
    L.push(ARBITRO_VITTORIA_GIOCATORE
      .replace(/NOME_NPC/g, npc.nome)
      .replace(/NOME_GIOCATORE/g, giocatore));
    calc.esito = "NPC sconfitto";
    return { testo:L.join("\n"), calc, finito:true };
  }

  /* --- FASE OFFENSIVA --- */
  L.push(mAtt.descrizione, "");
  L.push("[QUOTE]");
  L.push("Fase offensiva");
  const forzaBase = mAtt.valore + (tenaciaAtt * 5);
  let attacco = forzaBase, velNPC = npc.velocita;

  L.push(`Forza base = ${mAtt.valore}`);
  if (ostAtt){
    attacco = Math.floor(forzaBase * 1.5);
    velNPC  = npc.velocita * 3;
    L.push(`Attacco = (${mAtt.valore} + (${tenaciaAtt} × 5)) × 1.5 (bonus ostinazione) = ${attacco}`);
    L.push(`Velocità = ${npc.velocita} × 3 (bonus ostinazione) = ${velNPC}[/QUOTE]`);
  } else {
    L.push(`Attacco = ${mAtt.valore} + (${tenaciaAtt} × 5) = ${attacco}`);
    L.push(`Velocità = ${velNPC}[/QUOTE]`);
  }

  calc.attacco = attacco;
  calc.velNPC  = velNPC;
  return { testo:L.join("\n"), calc, finito:false };
}

/* ============================================================
   UI — COMBAT
   ============================================================ */
function npcSelezionato(){
  const k = $("afNpc").value;
  return NPCS[k] || null;
}

function renderCard(){
  const npc = npcSelezionato();
  const box = $("afCard");
  if (!npc){ box.innerHTML = `<div class="af-empty">Nessun NPC selezionato.</div>`; return; }

  const vita   = nInt($("afVita").value);
  const perc   = npc.vitaIniziale ? Math.max(0, Math.min(100, vita / npc.vitaIniziale * 100)) : 0;
  const soglia = Math.floor(npc.vitaIniziale * SOGLIA_KO);
  const ko     = vita > 0 && vita <= soglia;

  box.innerHTML = `
    <div class="af-npccard">
      <div class="af-npcimg" style="background-image:url('${escUrl(npc.miniatura)}')"></div>
      <div class="af-npcinfo">
        <div class="af-npcname">
          <span class="af-npcfloor">Piano ${esc(npc.pianoArenaCeleste)}</span>
          ${esc(npc.nome)}
        </div>
        <div class="af-stats">
          <div class="af-stat"><span class="k">Vita max</span><span class="v">${esc(npc.vitaIniziale)}</span></div>
          <div class="af-stat"><span class="k">Destrezza</span><span class="v">${esc(npc.destrezza)}</span></div>
          <div class="af-stat"><span class="k">Velocità</span><span class="v">${esc(npc.velocita)}</span></div>
          <div class="af-stat"><span class="k">Riflessi</span><span class="v">${esc(npc.riflessi)}</span></div>
        </div>
        ${vita > 0 ? `
          <div class="af-hpbar"><i class="${ko?'low':''}" style="width:${perc}%"></i></div>
          <div class="af-hplabel">
            <span>${vita} / ${npc.vitaIniziale}</span>
            <span class="${ko?'ko':''}">${ko ? '<i class="fa-solid fa-skull"></i> sotto la soglia di KO' : 'Soglia KO: ≤ '+soglia}</span>
          </div>` : ``}
      </div>
    </div>`;
}

function renderMoves(){
  const npc = npcSelezionato();
  const dif = $("afMovesDif"), att = $("afMovesAtt");
  if (!npc){
    dif.innerHTML = att.innerHTML = "";
    $("afDescDif").textContent = $("afDescAtt").textContent = "";
    return;
  }

  dif.innerHTML = npc.movesetDifensivo.map((m,i)=>{
    const s = isSchivata(m,i);
    return `<button class="af-move ${selDif===i?'on':''}" data-t="dif" data-i="${i}">
      <span class="n">${i+1}</span>
      <span class="val ${s?'dodge':''}">${s ? 'schivata' : 'R '+m.valore}</span>
    </button>`;
  }).join("");

  att.innerHTML = npc.movesetOffensivo.map((m,i)=>
    `<button class="af-move ${selAtt===i?'on':''}" data-t="att" data-i="${i}">
      <span class="n">${i+1}</span>
      <span class="val">F ${m.valore}</span>
    </button>`).join("");

  // descrizioni delle mosse scelte
  if (selDif !== null){
    const m = npc.movesetDifensivo[selDif];
    $("afDescDif").textContent = isSchivata(m,selDif)
      ? parseSchivata(m.descrizione).ok
      : m.descrizione;
  } else $("afDescDif").textContent = "";

  $("afDescAtt").textContent =
    selAtt !== null ? npc.movesetOffensivo[selAtt].descrizione : "";

  // il lock del tiro ha sempre la precedenza
  bloccaControlli(!!TIRO);
}

/* ============================================================
   UI — DADI
   ------------------------------------------------------------
   Dopo il lancio mosse e tenacia sono BLOCCATE.

   È una barriera morbida: chi vuole può sbloccare i campi dalla
   console. La difesa vera è il verbale nello spoiler del post,
   che mostra a tutti cosa è uscito e quanti lanci sono stati fatti.
   ============================================================ */
function lanciaDadi(){
  const npc = npcSelezionato();
  if (!npc) return toast("Seleziona prima un NPC.","warn");

  if (TIRO && !confirm(
      "Hai già tirato per questo NPC.\n\n" +
      "Un nuovo lancio sostituisce il precedente, ma il conteggio dei tiri " +
      "resta scritto nel post generato.\n\nVuoi ritirare?"))
    return;

  const fortuna = nInt($("afFortuna").value);
  const r = tiraNPC(npc, fortuna);
  CONTA_TIRI++;

  TIRO = {
    ...r,
    npc:   npc.nome,
    nDif:  npc.movesetDifensivo.length,
    nAtt:  npc.movesetOffensivo.length,
    nTiri: CONTA_TIRI,
    ts:    Date.now(),
    id:    Math.random().toString(36).slice(2,8).toUpperCase()
  };

  selDif = r.idxDif;
  selAtt = r.idxAtt;
  $("afTenDif").value = r.tenDif;
  $("afTenAtt").value = r.tenAtt;

  renderDadi();
  renderMoves();          // applica anche il lock

  registraLancio(TIRO, npc);   // il log parte SEMPRE, anche se poi il post non si genera

  $("afRoll").innerHTML = '<i class="fa-solid fa-rotate-right"></i> Ritira i dadi';
  toast(CONTA_TIRI === 1 ? "Dadi tirati." : `Ritirato (lancio n° ${CONTA_TIRI}).`,
        CONTA_TIRI === 1 ? "ok" : "warn");
}

/* ------------------------------------------------------------
   Ogni lancio finisce nello storico, generato o no. È il punto
   del sistema: un tiro sfortunato non può essere fatto sparire
   ricaricando la pagina.
   ------------------------------------------------------------ */
function registraLancio(tiro, npc){
  if (!dbOk) return;                       // senza Firebase si tira lo stesso, ma non si logga

  const rec = {
    id:        tiro.id,
    ts:        tiro.ts,
    utente:    nomeUtente() || "(sconosciuto)",
    utenteId:  idUtente() || "",
    npc:       npc.nome,
    piano:     npc.pianoArenaCeleste ?? null,
    idxDif:    tiro.idxDif,
    idxAtt:    tiro.idxAtt,
    tenDif:    tiro.tenDif,
    tenAtt:    tiro.tenAtt,
    facce:     tiro.facce,
    fortuna:   tiro.fortuna || 0,
    malus:     tiro.malus || 0,
    rawDif:    tiro.rawDif,
    rawAtt:    tiro.rawAtt,
    nTiri:     tiro.nTiri,
    usato:     false,        // diventa true se con questo tiro si genera un post
    gestito:   false
  };

  db.ref(DB_ROOT + "/storico/" + tiro.id).set(rec)
    .catch(e => console.warn("[Arena] storico:", e.message));
}

/* Il post è stato generato con questo tiro: lo segniamo. */
function segnaUsato(tiro, esitoTesto){
  if (!dbOk || !tiro) return;
  db.ref(DB_ROOT + "/storico/" + tiro.id).update({
    usato:     true,
    usatoTs:   Date.now(),
    esito:     esitoTesto || ""
  }).catch(e => console.warn("[Arena] storico:", e.message));
}

function renderDadi(){
  const box = $("afDiceOut");
  if (!TIRO){ box.classList.remove("on"); box.innerHTML = ""; return; }

  const dado = "d" + TIRO.facce;

  box.innerHTML = `
    <div class="af-dicegrid">
      <div class="af-die">
        <span class="k">Mossa difensiva</span>
        <span class="v">${TIRO.idxDif + 1}</span>
        <span class="s">di ${TIRO.nDif}</span>
      </div>
      <div class="af-die">
        <span class="k">Mossa offensiva</span>
        <span class="v">${TIRO.idxAtt + 1}</span>
        <span class="s">di ${TIRO.nAtt}</span>
      </div>
      <div class="af-die">
        <span class="k">Tenacia difesa</span>
        <span class="v">${TIRO.tenDif}</span>
        <span class="s">${TIRO.malus > 0 ? TIRO.rawDif + "−" + TIRO.malus : dado}</span>
      </div>
      <div class="af-die">
        <span class="k">Tenacia attacco</span>
        <span class="v">${TIRO.tenAtt}</span>
        <span class="s">${TIRO.malus > 0 ? TIRO.rawAtt + "−" + TIRO.malus : dado}</span>
      </div>
    </div>
    <div class="af-dicesum">
      <span>Tenacia con <b>${dado}</b>${TIRO.malus > 0
        ? ' &nbsp;·&nbsp; <b>−' + TIRO.malus + '</b> Fortuna (' + TIRO.fortuna + ')'
        : ''} &nbsp;·&nbsp; ID <b>${TIRO.id}</b></span>
      <span class="rerolls">${
        TIRO.nTiri > 1
          ? '<i class="fa-solid fa-triangle-exclamation"></i> lancio n° ' + TIRO.nTiri + " su questo NPC"
          : "primo lancio"
      }</span>
    </div>
    <div class="af-locked">
      <i class="fa-solid fa-lock"></i> Valori bloccati. Il verbale del tiro finirà nello spoiler del post.
    </div>`;

  box.classList.add("on");
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
}

/* Blocca/sblocca tutto ciò che il dado ha deciso. */
function bloccaControlli(stato){
  $("afTenDif").disabled = stato;
  $("afTenAtt").disabled = stato;
  $("afMovesDif").classList.toggle("locked", stato);
  $("afMovesAtt").classList.toggle("locked", stato);
}

function resetTiro(){
  TIRO = null;
  selDif = selAtt = null;
  $("afTenDif").value = "";
  $("afTenAtt").value = "";
  $("afOstDif").checked = false;
  $("afOstAtt").checked = false;
  $("afOstDifWrap").classList.remove("on");
  $("afOstAttWrap").classList.remove("on");
  bloccaControlli(false);
  $("afDiceOut").classList.remove("on");
  $("afRoll").innerHTML = '<i class="fa-solid fa-dice"></i> Tira i dadi per l\'NPC';
  renderDadi();
}


function renderCalc(calc){
  const box = $("afCalc");
  if (!calc || !Object.keys(calc).length){ box.innerHTML = ""; return; }
  const c = [];
  if (calc.esito)               c.push(`<div class="af-calcbox"><span class="k">Esito</span><span class="v" style="font-size:13px">${esc(calc.esito)}</span></div>`);
  if (calc.difesa !== undefined) c.push(`<div class="af-calcbox def"><span class="k">Difesa NPC</span><span class="v">${esc(calc.difesa)}</span></div>`);
  if (calc.danno  !== undefined) c.push(`<div class="af-calcbox dmg"><span class="k">Danno subito</span><span class="v">${esc(calc.danno)}</span></div>`);
  if (calc.vita   !== undefined) c.push(`<div class="af-calcbox hp"><span class="k">Vita residua</span><span class="v">${esc(calc.vita)}</span></div>`);
  if (calc.attacco!== undefined) c.push(`<div class="af-calcbox atk"><span class="k">Attacco NPC</span><span class="v">${esc(calc.attacco)}</span></div>`);
  if (calc.velNPC !== undefined) c.push(`<div class="af-calcbox"><span class="k">Velocità NPC</span><span class="v">${esc(calc.velNPC)}</span></div>`);
  box.innerHTML = c.join("");
}

function genera(){
  const npc = npcSelezionato();
  if (!npc) return toast("Seleziona un NPC.","warn");

  const giocatore = $("afPlayer").value.trim();
  const esito     = $("afEsito").value;

  if (esito === "vittoria_npc"){
    if (!giocatore) return toast("Serve il nome del PG per il messaggio di sconfitta.","warn");
    const r = risolviTurno({ npc, giocatore, esito });
    $("afOut").textContent = r.testo;
    renderCalc(r.calc);
    return;
  }

  /* Senza tiro non si genera: mosse e tenacia le decidono i dadi. */
  if (!TIRO)
    return toast("Prima tira i dadi per l'NPC.","warn");

  if (TIRO.npc !== npc.nome)
    return toast("Il tiro appartiene a un altro NPC: ritira i dadi.","warn");

  /* I valori si leggono dal TIRO, non dai campi: se qualcuno ha forzato
     gli input dalla console, le formule usano comunque il dado vero. */
  const idxDif = TIRO.idxDif;
  const idxAtt = TIRO.idxAtt;
  const tenDif = TIRO.tenDif;
  const tenAtt = TIRO.tenAtt;

  const forza    = nInt($("afForza").value);
  const velocita = nInt($("afVel").value);
  const vita     = nInt($("afVita").value);

  if (velocita < 1)    return toast("La velocità dell'attacco deve essere ≥ 1.","warn");
  if (forza < 0)       return toast("La forza non può essere negativa.","warn");
  if (vita < 0)        return toast("La vita residua non può essere negativa.","warn");
  if (vita > npc.vitaIniziale)
    return toast(`La vita residua non può superare la vita iniziale (${npc.vitaIniziale}).`,"warn");


  const r = risolviTurno({
    npc, giocatore, esito,
    idxDif, idxAtt,
    forza, velocita, vitaResidua:vita,
    tenaciaDif:tenDif, tenaciaAtt:tenAtt,
    ostDif:$("afOstDif").checked,
    ostAtt:$("afOstAtt").checked,
    tiro: TIRO
  });

  if (r.finito && !giocatore)
    return toast("L'NPC è sconfitto: serve il nome del PG per chiudere l'incontro.","warn");

  $("afOut").textContent = r.testo;
  renderCalc(r.calc);

  segnaUsato(TIRO, r.calc.esito || "turno regolare");

  toast(r.finito ? "Incontro concluso — post generato." : "Post generato.","ok");
}

/* ============================================================
   UI — ROSTER
   ============================================================ */
/* ============================================================
   UI — STORICO DADI
   ------------------------------------------------------------
   Ogni lancio è tracciato, generato o no. Lo staff può segnare
   una riga come "gestita", e resta scritto CHI l'ha gestita.
   ============================================================ */
function oraBreve(ts){
  const d = new Date(ts);
  const oggi = new Date();
  const stessoGiorno = d.toDateString() === oggi.toDateString();
  const hh = String(d.getHours()).padStart(2,"0") + ":" +
             String(d.getMinutes()).padStart(2,"0");
  if (stessoGiorno) return "oggi " + hh;
  return String(d.getDate()).padStart(2,"0") + "/" +
         String(d.getMonth()+1).padStart(2,"0") + "/" +
         String(d.getFullYear()).slice(2) + " " + hh;
}

function renderStorico(){
  const el = $("afLogList");
  if (!el) return;

  const q = ($("afLogFilter")?.value || "").toLowerCase();

  let lista = Object.values(STORICO || {});

  if (q) lista = lista.filter(r =>
    (r.utente || "").toLowerCase().includes(q) ||
    (r.npc    || "").toLowerCase().includes(q) ||
    (r.id     || "").toLowerCase().includes(q));

  if (ORDINE_LOG === "gestione"){
    // da gestire in cima; a parità, i più recenti prima
    lista.sort((a,b) => {
      const ga = a.gestito === true ? 1 : 0;
      const gb = b.gestito === true ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return (b.ts || 0) - (a.ts || 0);
    });
  } else {
    lista.sort((a,b) => (b.ts || 0) - (a.ts || 0));
  }

  // barra di stato
  const tot       = Object.keys(STORICO || {}).length;
  const daGestire = Object.values(STORICO || {}).filter(r => r.gestito !== true).length;

  const gestiti = tot - daGestire;
  $("afLogCount").innerHTML =
    '<span style="font-family:\'Alegreya Sans SC\',sans-serif;font-size:12px;color:#CFF09E;font-weight:600">' +
    tot + (tot === 1 ? " lancio" : " lanci") + '</span>' +
    (IS_STAFF && gestiti > 0
      ? ' <button class="af-btn sm danger" id="afLogPurge" style="margin-left:8px">' +
        '<i class="fa-solid fa-broom"></i> Elimina ' + gestiti + ' gestit' +
        (gestiti === 1 ? "a" : "e") + '</button>'
      : "");

  const st = $("afLogStat");
  if (daGestire > 0){
    st.className = "af-logstat todo";
    st.innerHTML = '<i class="fa-solid fa-circle" style="font-size:7px"></i> ' +
      daGestire + (daGestire === 1 ? " da gestire" : " da gestire");
  } else {
    st.className = "af-logstat done";
    st.innerHTML = '<i class="fa-solid fa-circle-check"></i> Tutto gestito';
  }

  if (!lista.length){
    el.innerHTML = '<div class="af-empty">' +
      (q ? "Nessun lancio corrisponde alla ricerca." : "Nessun lancio registrato.") +
      '</div>';
    return;
  }

  let html = "";
  let sepMesso = false;
  const modoGest = ORDINE_LOG === "gestione";

  lista.forEach((r, i) => {
    const gestito = r.gestito === true;
    const usato   = r.usato === true;

    if (modoGest && gestito && !sepMesso && i > 0){
      html += '<div class="af-logsep"><span>Gestiti</span></div>';
      sepMesso = true;
    }

    const dado = "d" + (r.facce || 100);

    html += `
      <div class="af-logrow ${usato ? "used" : ""} ${gestito ? "done" : ""}">
        <div class="af-logicon">
          <i class="fa-solid ${usato ? "fa-file-circle-check" : "fa-dice"}"></i>
        </div>
        <div class="af-logbody">
          <div class="af-loghead">
            <span class="af-logwho">${esc(r.utente || "(sconosciuto)")}</span>
            <span class="af-logwhen">${oraBreve(r.ts)}</span>
            <span class="af-logid">${esc(r.id || "")}</span>
          </div>
          <div class="af-logdice">
            <span class="af-logchip npc">${esc(r.npc || "?")}</span>
            <span class="af-logchip">Dif <b>${(r.idxDif ?? 0) + 1}</b></span>
            <span class="af-logchip">Att <b>${(r.idxAtt ?? 0) + 1}</b></span>
            <span class="af-logchip">Ten.dif <b>${r.tenDif}</b></span>
            <span class="af-logchip">Ten.att <b>${r.tenAtt}</b></span>
            ${r.malus > 0 ? `<span class="af-logchip" style="border-color:#8E7A3A;background:#3A2F19;color:#E0C05A">Fortuna ${r.fortuna} <b>−${r.malus}</b></span>` : ""}
            <span class="af-logchip">${dado}</span>
          </div>
          <div class="af-logdice" style="margin-top:6px">
            ${usato
              ? `<span class="af-logtag used"><i class="fa-solid fa-check"></i> Post generato${
                   r.esito ? " — " + esc(r.esito) : ""}</span>`
              : '<span class="af-logtag unused"><i class="fa-solid fa-ban"></i> Nessun post</span>'}
            ${r.nTiri > 1
              ? `<span class="af-logtag reroll"><i class="fa-solid fa-rotate-right"></i> lancio n° ${r.nTiri}</span>`
              : ""}
          </div>
        </div>
        <div class="af-logact">
          ${gestito
            ? `<span class="af-logok">
                 <i class="fa-solid fa-circle-check"></i> Gestito
                 <small>da ${esc(r.gestitoDa || "?")}</small>
               </span>
               ${IS_STAFF
                 ? `<button class="af-btn sm danger" data-del="${esc(r.id)}">
                      <i class="fa-solid fa-trash"></i> Elimina
                    </button>`
                 : ""}`
            : (IS_STAFF
                ? `<button class="af-btn sm" data-gest="${esc(r.id)}">
                     <i class="fa-solid fa-check"></i> Segna gestito
                   </button>`
                : "")}
        </div>
      </div>`;
  });

  el.innerHTML = html;
}

async function segnaGestito(id){
  if (!IS_STAFF) return toast("Non hai i permessi.","err");
  if (!dbOk)     return toast("Firebase non è connesso.","err");

  const chi = nomeUtente() || "(staff)";
  await db.ref(DB_ROOT + "/storico/" + id).update({
    gestito:   true,
    gestitoDa: chi,
    gestitoTs: Date.now()
  });
  toast("Segnato come gestito.","ok");
}

/* Solo le voci GIÀ gestite possono essere eliminate: un lancio in
   sospeso non deve poter sparire prima di essere stato valutato. */
async function eliminaLog(id){
  if (!IS_STAFF) return toast("Non hai i permessi.","err");
  if (!dbOk)     return toast("Firebase non è connesso.","err");

  const r = STORICO[id];
  if (!r) return;
  if (r.gestito !== true)
    return toast("Puoi eliminare solo le voci già gestite.","warn");

  if (!confirm("Eliminare definitivamente questa voce dallo storico?")) return;
  await db.ref(DB_ROOT + "/storico/" + id).remove();
  toast("Voce eliminata.","ok");
}

async function eliminaGestiti(){
  if (!IS_STAFF) return toast("Non hai i permessi.","err");
  if (!dbOk)     return toast("Firebase non è connesso.","err");

  const ids = Object.keys(STORICO).filter(k => STORICO[k].gestito === true);
  if (!ids.length) return toast("Non ci sono voci gestite da eliminare.","warn");

  if (!confirm(`Eliminare tutte le ${ids.length} voci già gestite?\n\n` +
               "I lanci ancora da gestire restano.")) return;

  const ops = {};
  for (const id of ids) ops[id] = null;      // update con null = remove multiplo
  await db.ref(DB_ROOT + "/storico").update(ops);
  toast(`${ids.length} voci eliminate.`,"ok");
}

function renderRoster(){
  const q    = ($("afRosterFilter").value || "").toLowerCase();
  const list = Object.entries(NPCS)
    .filter(([k,n]) => !q ||
      n.nome.toLowerCase().includes(q) ||
      String(n.pianoArenaCeleste).includes(q))
    .sort((a,b) => (a[1].pianoArenaCeleste||0) - (b[1].pianoArenaCeleste||0));

  $("afRosterCount").textContent = Object.keys(NPCS).length + " NPC";

  $("afRosterList").innerHTML = list.length ? list.map(([k,n]) => `
    <div class="af-npcrow" data-k="${esc(k)}" style="cursor:pointer">
      <div class="thumb" style="background-image:url('${escUrl(n.miniatura)}')"></div>
      <div class="meta">
        <div class="nm">${esc(n.nome)}</div>
        <div class="st">PIANO ${esc(n.pianoArenaCeleste)} · HP ${esc(n.vitaIniziale)} · D${esc(n.destrezza)} V${esc(n.velocita)} R${esc(n.riflessi)}</div>
      </div>
    </div>`).join("")
    : `<div class="af-empty" style="grid-column:1/-1">Nessun NPC trovato.</div>`;
}

function renderRosterDetail(key){
  const n = NPCS[key];
  if (!n){ $("afRosterDetail").innerHTML = ""; return; }
  const mv = (arr, tipo) => arr.map((m,i)=>{
    const s = tipo==="dif" && isSchivata(m,i);
    const d = s ? parseSchivata(m.descrizione).ok : m.descrizione;
    return `<div class="af-desc">
      <span style="font-family:Calistoga,Georgia,serif;font-size:16px;color:#292354;flex:0 0 52px;text-align:center;background:#CFF09E;border-radius:4px;padding:6px 2px;line-height:1.2">
        ${i+1}${s ? ' <i class="fa-solid fa-wind"></i>' : ""}<br><span style="font-family:'Alegreya Sans SC',sans-serif;color:#0B486B;font-size:10px;font-weight:600;letter-spacing:.04em">${s?"SCHIVATA":(tipo==="dif"?"R "+m.valore:"F "+m.valore)}</span>
      </span>
      <p>${esc(d)}</p>
    </div>`;
  }).join("");

  $("afRosterDetail").innerHTML = `
    <div class="af-sect">
      <div class="af-sect-h"><span>${esc(n.nome)} — moveset difensivo</span></div>
      <div class="af-sect-b">${mv(n.movesetDifensivo,"dif")}</div>
    </div>
    <div class="af-sect">
      <div class="af-sect-h"><span>${esc(n.nome)} — moveset offensivo</span></div>
      <div class="af-sect-b">${mv(n.movesetOffensivo,"att")}</div>
    </div>`;
  $("afRosterDetail").scrollIntoView({behavior:"smooth",block:"nearest"});
}



/* ============================================================
   UI — ADMIN
   ============================================================ */
function renderEditorMoveset(){
  const mk = (tipo) => Array.from({length:5}, (_,i)=>`
    <div class="af-msrow">
      <div class="af-msnum">${i+1}</div>
      <div class="af-f">
        <textarea id="afEd_${tipo}_d${i}" placeholder="Descrizione della mossa…"></textarea>
      </div>
      <div class="af-f">
        <input type="number" id="afEd_${tipo}_v${i}" min="0" placeholder="${tipo==='dif'?'Resist.':'Forza'}">
      </div>
    </div>`).join("");
  $("afEdMsDif").innerHTML = mk("dif");
  $("afEdMsAtt").innerHTML = mk("att");
}

function caricaNellEditor(key){
  const n = NPCS[key];
  if (!n){ svuotaEditor(); return; }
  $("afEdNome").value  = n.nome;
  $("afEdImg").value   = n.miniatura || "";
  $("afEdPiano").value = n.pianoArenaCeleste;
  $("afEdVita").value  = n.vitaIniziale;
  $("afEdDes").value   = n.destrezza;
  $("afEdVel").value   = n.velocita;
  $("afEdRif").value   = n.riflessi;
  for (let i=0;i<5;i++){
    $(`afEd_dif_d${i}`).value = n.movesetDifensivo[i]?.descrizione ?? "";
    $(`afEd_dif_v${i}`).value = n.movesetDifensivo[i]?.valore ?? "";
    $(`afEd_att_d${i}`).value = n.movesetOffensivo[i]?.descrizione ?? "";
    $(`afEd_att_v${i}`).value = n.movesetOffensivo[i]?.valore ?? "";
  }
}

function svuotaEditor(){
  ["afEdNome","afEdImg","afEdPiano","afEdVita","afEdDes","afEdVel","afEdRif"]
    .forEach(id => $(id).value = "");
  for (let i=0;i<5;i++){
    $(`afEd_dif_d${i}`).value = ""; $(`afEd_dif_v${i}`).value = "";
    $(`afEd_att_d${i}`).value = ""; $(`afEd_att_v${i}`).value = "";
  }
  $("afEdSelect").value = "";
}

function leggiEditor(){
  const nome = $("afEdNome").value.trim();
  if (!nome){ toast("Il nome è obbligatorio.","warn"); return null; }

  const dif = [], att = [];
  for (let i=0;i<5;i++){
    const dd = $(`afEd_dif_d${i}`).value.trim(), dv = nInt($(`afEd_dif_v${i}`).value);
    const ad = $(`afEd_att_d${i}`).value.trim(), av = nInt($(`afEd_att_v${i}`).value);
    if (!dd || !ad){ toast(`Manca la descrizione della mossa ${i+1}.`,"warn"); return null; }
    dif.push({ descrizione: dd, valore: dv });
    att.push({ descrizione: ad, valore: av });
  }

  return {
    nome,
    pianoArenaCeleste: nInt($("afEdPiano").value),
    vitaIniziale:      nInt($("afEdVita").value),
    destrezza:         nInt($("afEdDes").value),
    velocita:          nInt($("afEdVel").value),
    riflessi:          nInt($("afEdRif").value),
    miniatura:         $("afEdImg").value.trim(),
    movesetDifensivo:  dif,
    movesetOffensivo:  att
  };
}

/* ============================================================
   RENDER GLOBALE
   ============================================================ */
function render(){
  const keys = Object.keys(NPCS)
    .sort((a,b)=>(NPCS[a].pianoArenaCeleste||0)-(NPCS[b].pianoArenaCeleste||0));

  // select combat
  const prev = $("afNpc").value;
  $("afNpc").innerHTML = keys.length
    ? keys.map(k=>`<option value="${esc(k)}">Piano ${esc(NPCS[k].pianoArenaCeleste)} — ${esc(NPCS[k].nome)}</option>`).join("")
    : `<option value="">— nessun NPC —</option>`;
  if (keys.includes(prev)) $("afNpc").value = prev;

  // select admin
  const prevE = $("afEdSelect").value;
  $("afEdSelect").innerHTML = `<option value="">— Nuovo NPC —</option>` +
    keys.map(k=>`<option value="${esc(k)}">${esc(NPCS[k].nome)}</option>`).join("");
  if (keys.includes(prevE)) $("afEdSelect").value = prevE;

  renderCard();
  renderMoves();
  renderRoster();
}

/* ============================================================
   EVENTI
   ============================================================ */
function bind(){
  // tabs
  document.querySelectorAll("#af-root .af-tab").forEach(t=>{
    t.onclick = () => {
      document.querySelectorAll("#af-root .af-tab").forEach(x=>x.classList.remove("active"));
      document.querySelectorAll("#af-root .af-panel").forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      document.querySelector(`#af-root .af-panel[data-panel="${t.dataset.tab}"]`).classList.add("active");
    };
  });

  // combat
  $("afNpc").onchange = () => {
    CONTA_TIRI = 0;        // NPC diverso, conteggio da capo
    resetTiro();
    renderCard(); renderMoves();
  };
  $("afVita").oninput = renderCard;
  $("afEsito").onchange = () => {
    const off = $("afEsito").value === "vittoria_npc";
    $("afCombatBody").style.opacity = off ? ".35" : "1";
    $("afCombatBody").style.pointerEvents = off ? "none" : "auto";
  };

  document.querySelectorAll("#af-root .af-moves").forEach(c=>{
    c.onclick = e => {
      const b = e.target.closest(".af-move"); if(!b) return;

      // dopo il lancio le mosse le ha decise il dado
      if (TIRO){
        toast("Le mosse le hanno decise i dadi. Ritira, se serve.","warn");
        return;
      }

      const i = +b.dataset.i;
      if (b.dataset.t === "dif") selDif = (selDif===i ? null : i);
      else                       selAtt = (selAtt===i ? null : i);
      renderMoves();
    };
  });

  // checkbox visual state
  [["afOstDif","afOstDifWrap"],["afOstAtt","afOstAttWrap"]].forEach(([i,w])=>{
    $(i).onchange = () => $(w).classList.toggle("on", $(i).checked);
  });

  $("afGen").onclick = genera;

  // dadi
  $("afRoll").onclick = lanciaDadi;

  // badge ruolo → diagnostica permessi
  $("afRole").onclick = diagnostica;

  $("afCopy").onclick = () => {
    const t = $("afOut").textContent;
    if (!t) return toast("Non c'è niente da copiare.","warn");
    navigator.clipboard.writeText(t)
      .then(()=>toast("Copiato negli appunti.","ok"))
      .catch(()=>{
        const ta = document.createElement("textarea");
        ta.value = t; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
        toast("Copiato.","ok");
      });
  };

  // storico dadi
  $("afLogFilter").oninput = renderStorico;

  $("afLogList").onclick = e => {
    const g = e.target.closest("[data-gest]");
    if (g) { segnaGestito(g.dataset.gest); return; }
    const del = e.target.closest("[data-del]");
    if (del) eliminaLog(del.dataset.del);
  };

  // il pulsante "elimina gestiti" vive nell'header del pannello, ricreato a ogni render
  $("afLogCount").onclick = e => {
    if (e.target.closest("#afLogPurge")) eliminaGestiti();
  };

  document.querySelectorAll("#af-root .af-sortbtn").forEach(b => {
    b.onclick = () => {
      ORDINE_LOG = b.dataset.ord;
      document.querySelectorAll("#af-root .af-sortbtn")
        .forEach(x => x.classList.toggle("af-sorton", x === b));
      renderStorico();
    };
  });

  // roster
  $("afRosterFilter").oninput = renderRoster;
  $("afRosterList").onclick = e => {
    const r = e.target.closest(".af-npcrow");
    if (r) renderRosterDetail(r.dataset.k);
  };


  // admin
  $("afEdSelect").onchange = () => {
    const k = $("afEdSelect").value;
    if (k) caricaNellEditor(k); else svuotaEditor();
  };
  $("afEdSave").onclick   = () => { const n = leggiEditor(); if (n) salvaNPC(n); };
  $("afEdReset").onclick  = svuotaEditor;
  $("afEdDelete").onclick = () => {
    const k = $("afEdSelect").value;
    if (!k) return toast("Seleziona prima un NPC esistente.","warn");
    if (confirm(`Eliminare definitivamente "${NPCS[k].nome}"?`)){
      eliminaNPC(k); svuotaEditor();
    }
  };

  $("afSeed").onclick = async () => {
    if (!IS_STAFF) return toast("Non hai i permessi.","err");
    if (!dbOk)     return toast("Firebase non è connesso.","err");
    let n = 0;
    for (const npc of DEFAULT_NPCS){
      const k = slug(npc.nome);
      if (!NPCS[k]){ await db.ref(DB_ROOT + "/npcs/" + k).set(npc); n++; }
    }
    toast(n ? `${n} NPC caricati.` : "Erano già tutti presenti.", "ok");
  };


  $("afExport").onclick = () => {
    const blob = new Blob(
      [JSON.stringify({ npcs:NPCS }, null, 2)],
      { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `arena_backup_${new Date().toISOString().slice(0,10)}.json`;
    clicca(a); URL.revokeObjectURL(a.href);
    toast("Backup scaricato.","ok");
  };

  $("afImportBtn").onclick = () => clicca($("afImport"));
  $("afImport").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try{
        const d = JSON.parse(r.result);
        const lista = Array.isArray(d) ? d : (d.npcs ? Object.values(d.npcs) : []);
        if (!lista.length) throw new Error("nessun NPC trovato");
        for (const npc of lista)
          await db.ref(DB_ROOT + "/npcs/" + slug(npc.nome)).set(npc);
        toast(`${lista.length} NPC importati.`,"ok");
      }catch(err){ toast("File non valido: " + err.message,"err"); }
      e.target.value = "";
    };
    r.readAsText(f);
  };
}

/* ============================================================
   AVVIO
   ============================================================ */
const FRASI = {
  "vittoria_npc": [
    "Il lottatore, con un grido di trionfo, alza le mani verso il cielo",
    "Un sorriso di pura soddisfazione illumina il volto del vincitore",
    "La folla esplode in un boato, acclamando il trionfatore",
    "Il combattente, esausto ma vittorioso, si lascia cadere sulle ginocchia, assaporando la vittoria",
    "Con un ultimo, potente colpo, il lottatore si assicura la vittoria, lasciando l'avversario a terra",
    "Il vincitore, con un'espressione di orgoglio, si erge sopra l'avversario sconfitto",
    "Il guerriero, con un gesto di rispetto, offre una mano all'avversario per aiutarlo a rialzarsi",
    "Un'ondata di potere pervade il vincitore, che si gode il momento di gloria",
    "Il combattente, con un'espressione determinata, si prepara per la prossima sfida",
    "Il vincitore, con un cenno del capo, riconosce la forza dell'avversario, nonostante la sconfitta"
  ],
  "sconfitta_npc": [
    "Il lottatore cade a terra, privo di sensi, sotto il peso dei colpi ricevuti",
    "Un'espressione di sconcerto si dipinge sul volto del combattente, prima che perda conoscenza",
    "La folla ammutolisce, testimone della brusca caduta del lottatore",
    "Il combattente, esausto e sconfitto, crolla al suolo, perdendo i sensi",
    "La superiorità del nemico era evidente e il lottatore, dopo aver incassato l'ultimo colpo, cade a terra privo di sensi",
    "Il lottatore giace immobile, vittima della potenza del suo avversario",
    "Il guerriero, con un gemito, perde conoscenza, incapace di continuare il combattimento",
    "Un'ondata di debolezza travolge il combattente sconfitto, che crolla al suolo privo di sensi",
    "Il lottatore, con un ultimo sussulto, perde conoscenza, incapace di reagire",
    "Il perdente, con un'espressione di dolore, si accascia al suolo, privo di sensi"
  ]
};

const DEFAULT_NPCS = [{"nome":"Korinna Fanning","pianoArenaCeleste":110,"vitaIniziale":6000,"destrezza":550,"velocita":450,"riflessi":300,"miniatura":"https://upload.forumfree.net/i/fc9375543/11.png","movesetOffensivo":[{"descrizione":"L'attacco migliore di Korinna. La ragazza flette i muscoli delle gambe e compie uno scatto al meglio delle sue capacità, per raggiungere l'avversario a gran velocità e sferrare un rapido calcio rotante, diretto al fianco.","valore":50},{"descrizione":"Korinna corre verso un lato, poi verso l'altro. Prova a disorientare l'avversario. Una veloce serie di finte, finché non giunge l'attacco vero e proprio: un rapido pugno diretto allo stomaco.","valore":40},{"descrizione":"Korinna, mentre si avvicina all'avversario, compie dei ripetuti scatti laterali a destra e a sinistra, creando l'illusione di uno sdoppiamento fisico. L'attacco giungerà improvvisamente da uno dei due lati. Impossibile prevedere quale.","valore":30},{"descrizione":"Korinna, con la gamba sinistra, scaglia un calcio circolare girato alto ad elevata velocità. Ma questo primo attacco non è altro che una finta. Infatti, sfruttando lo stesso movimento rotatorio, con la gamba destra scaglia un calcio girato basso.","valore":20},{"descrizione":"Korinna compie uno scatto talmente veloce da sparire letteralmente, per qualche breve attimo, dal campo visivo dell'avversario. Riapparsa di fronte allo sfidante, sferrerà quindi un rapido pugno diretto al volto.","valore":10}],"movesetDifensivo":[{"descrizione":"Korinna sfrutta tutta la sua rapidità di movimento per tentare di bloccare l'attacco in arrivo con un calcio a scopo puramente difensivo.","valore":150},{"descrizione":"Colta alla sprovvista, Korinna porta rapidamente un arto a protezione della zona colpita dall'avversario.","valore":100},{"descrizione":"€I'm fast as f**k boi! | Korinna cerca di schivare l'attacco, senza riuscirci","valore":150},{"descrizione":"€Cosa? Dovrei stare ferma e farmi colpire? | Korinna cerca di schivare l'attacco, senza riuscirci","valore":150},{"descrizione":"Korinna riesce a schivare l'attacco con un movimento agile e preciso | Korinna cerca di schivare l'attacco, senza riuscirci","valore":150}]},{"nome":"Kristoff Jortek","pianoArenaCeleste":20,"vitaIniziale":1800,"destrezza":110,"velocita":65,"riflessi":70,"miniatura":"https://upload.forumfree.net/i/fc9375543/3-17420741380838.png","movesetOffensivo":[{"descrizione":"Kristoff utilizza tutta la sua intelligenza per sviluppare sul momento una tecnica che combina un rapido cambio di posizione con un pugno a frusta. Il karateka esegue un movimento circolare con il busto per generare energia cinetica, scattando in avanti con un pugno esplosivo che colpisce con la parte posteriore delle nocche, mirando al punto vitale della tempia avversaria.","valore":70},{"descrizione":"Kristoff ha sviluppato una variante acrobatica del calcio discendente applicando un salto rotatorio. Si avvicina e finta un calcio laterale per far abbassare la guardia dell'avversario, quindi esegue un rapido giro in aria per portare il tallone direttamente sulla clavicola nemica con l'obiettivo di sbilanciare e colpire con potenza.","valore":55},{"descrizione":"Kristoff crea un triangolo con il movimento delle mani per confondere l'avversario. Dopo una finta iniziale con la mano anteriore, il karateka sfrutta la traiettoria diagonale per sfiorare la difesa e colpire con un pugno destro diretto dal basso verso l'alto, mirato al mento.","valore":40},{"descrizione":"Kristoff esegue una combinazione di tecniche che sfrutta il dondolio del busto per accumulare energia elastica. Il karateka parte da una posizione bassa, muovendo rapidamente il corpo avanti e indietro per poi lanciare un attacco doppio contemporaneamente: un colpo di gomito a corto raggio e un pugno rotante con la mano opposta, puntando al busto dell'avversario.","valore":25},{"descrizione":"Kristoff si prepara a realizzare la sua ultima tecnica ancora in fase di sviluppo. Sfrutta un movimento rotatorio rapido per generare potenza centrifuga, eseguendo una finta con un pugno per attirare l'attenzione, quindi ruota su se stesso con un passo rapido, caricando un colpo di taglio con la mano sinistra aperta. La traiettoria del colpo segue una spirale ascendente che mira al collo del nemico, combinando velocità e imprevedibilità.","valore":10}],"movesetDifensivo":[{"descrizione":"Kristoff comprende la natura dell'attacco in arrivo ed esegue un blocco statico potenziato dalla struttura del suo corpo. Il karateka utilizza una posizione bassa e solida, bloccando l'attacco con un doppio avambraccio, come se creasse un muro impenetrabile. Distribuendo il peso e sfruttando la tensione muscolare per annullare la forza d'impatto.","valore":110},{"descrizione":"Kristoff impiega una tecnica difensiva basata sulla deviazione fluida. Invece di bloccare direttamente l'attacco in arrivo, il karateka esegue un movimento circolare delle mani, simile a un'onda, per incanalare la forza dell'attacco verso una direzione meno dannosa.","valore":95},{"descrizione":"Kristoff tenta di proteggersi con la punta dei gomiti spingendo in avanti: l'intento è quello di trasformare la difesa in uno strumento di dolore.","valore":80},{"descrizione":"Kristoff, invece di pensare a difendersi, opta per intercettare il colpo nemico e tentare di avvinghiarsi agli arti dell'avversario pronto per eseguire una presa a distanza ravvicinata.","valore":65},{"descrizione":"Kristoff riesce a schivare l'attacco con un movimento agile e preciso | Kristoff cerca di schivare l'attacco, senza riuscirci","valore":120}]},{"nome":"Boki Luagin","pianoArenaCeleste":10,"vitaIniziale":1300,"destrezza":110,"velocita":40,"riflessi":40,"miniatura":"https://upload.forumfree.net/i/fc9375543/Boki%20Luagin.png","movesetOffensivo":[{"descrizione":"Boki, armato di tutta la determinazione che ha, si scrolla di dosso ogni insicurezza e si lancia in una carica frontale. Un impeto al pieno delle sue forze, pur non avendone granché. Una rapida testata diretta allo stomaco.","valore":20},{"descrizione":"Boki corre in avanti e prova ad assestare uno dei suoi colpi migliori: un calcio laterale a metà altezza, semplice e veloce.","valore":15},{"descrizione":"Boki scatta in avanti, cercando di afferrare il suo avversario per il braccio e proiettarlo a terra tramite una rotazione del busto.","valore":10},{"descrizione":"Boki cerca di sferrare un complicato calcio rotante in stile taekwondo, una mossa che ha visto da un lottatore in televisione. A causa della sua inesperienza, tuttavia, l'attacco risulta fiacco e deludente.","valore":5},{"descrizione":"Boki si lancia all'attacco, ma all'ultimo momento si rende conto di essersi scoperto troppo e si prepara a rimettersi sulla difensiva. Quell'attimo di esitazione rende l'attacco debole e goffo, al pari di una spinta, più che un vero e proprio colpo.","valore":0}],"movesetDifensivo":[{"descrizione":"Armato di tutta la sua determinazione, Boki concentra tutti i suoi sensi per difendersi dall'attacco in arrivo, piegando agilmente l'arto più vicino e anteponendolo alla zona mirata dall'avversario","valore":80},{"descrizione":"Boki si rannicchia su se stesso per coprire ogni punto vitale allo stesso tempo.","valore":75},{"descrizione":"Boki cerca di frapporre uno dei suoi arti a protezione per difendersi, ma all'ultimo momento si rende conto di aver sbagliato il movimento, rendendo la sua difesa più debole e imprecisa.","valore":70},{"descrizione":"Proprio mentre l'avversario lo sta per colpire, una delle sue scarpe si slaccia e gli scivola via dal piede, facendogli perdere l'equilibrio e la concentrazione.","valore":0},{"descrizione":"Boki riesce a schivare l'attacco con un movimento agile e preciso | Boki cerca di schivare l'attacco, senza riuscirci","valore":80}]},{"nome":"Damix Urazuka","pianoArenaCeleste":50,"vitaIniziale":3300,"destrezza":200,"velocita":125,"riflessi":120,"miniatura":"https://upload.forumfree.net/i/fc9375543/6.png","movesetOffensivo":[{"descrizione":"Convinto di aver sentito un insulto rivolto alla sua cara mamma, Damix non ci vede più dalla rabbia e si lancia in un attacco dettato dal puro istinto omicida. Un semplice e veloce pugno diretto al viso, ma senza alcun residuo di ragione a frenare la sua frenetica ira.","valore":90},{"descrizione":"Damix si avvicina all'avversario e sferra un pugno diretto al suo viso. Tuttavia il suo movimento cambia natura a metà traiettoria. Con una rapida rotazione del gomito e un piccolo salto in alto che in realtà non ha grande utilità, Damix porta il pugno verso il lato del viso avversario.","valore":70},{"descrizione":"Damix corre incontro all'avversario, per poi spiccare un salto verso di lui e cercare di colpirlo con un calcio frontale.","valore":50},{"descrizione":"Damix si lancia contro l'avversario e cerca di mordergli un orecchio.","valore":30},{"descrizione":"Damix si lancia in un attacco testa-contro-testa.","valore":0}],"movesetDifensivo":[{"descrizione":"Damix è abituato a incassare colpi su colpi. Non gli serve parare gli attacchi per tenere duro. Gli basta la sua forza d'animo.","valore":190},{"descrizione":"Damix si protegge dall'attacco in arrivo piegando l'arto più vicino al punto colpito per ammortizzare l'impatto.","valore":150},{"descrizione":"Damix si becca il colpo e pone una lecita domanda al suo avversario.","valore":110},{"descrizione":"Damix si distrae e la sua difesa risulta più debole.","valore":80},{"descrizione":"Damix riesce a schivare l'attacco con un movimento agile e preciso | Damix cerca di schivare l'attacco, senza riuscirci","valore":190}]},{"nome":"Darius Cerberix","pianoArenaCeleste":130,"vitaIniziale":7300,"destrezza":185,"velocita":300,"riflessi":100,"miniatura":"https://upload.forumfree.net/i/fc9375543/12.png","movesetOffensivo":[{"descrizione":"Darius è inarrestabile e si avvicina frontalmente al nemico: alza la gamba destra e con un'ascia magistrale effettua un colpo discendente che tanta di colpire il nemico sulla testa per spedirlo a terra.","valore":500},{"descrizione":"Darius sferra un diretto sinistro a piena potenza all'altezza dell'esofago.","valore":400},{"descrizione":"Darius colpisce con un gomitata ascendente il mento dell'avversario.","valore":300},{"descrizione":"Darius non ha timore del suo destino e scatta verso il nemico: tenta di colpirlo conficcandogli i pollici nelle orecchie con l'intento di provocare un trauma interno.","valore":200},{"descrizione":"Darius è accecato dall'ira: pensieri funesti sconvolgono la sua mente mentre carica a testa bassa l'avversario con una testata allo sterno.","valore":100}],"movesetDifensivo":[{"descrizione":"Darius è un monolite pronto a fermare con i palmi delle mani qualsiasi attacco.","valore":600},{"descrizione":"Darius sfoggia il suo passato e voltandosi all'ultimo di schiena accusa il colpo ammortizzando con i possenti muscoli.","valore":450},{"descrizione":"Darius antepone la fronte come ultimo strumento di difesa irrigidendo il collo con uno sforzo sovrumano.","valore":300},{"descrizione":"Darius, ignorando l'offensiva avversaria, indica il cuore e poi allunga il braccio verso il pubblico pronto a ricevere la gloria di cui si ciba.","valore":150},{"descrizione":"Darius riesce a schivare l'attacco con un movimento agile e preciso | Darius cerca di schivare l'attacco, senza riuscirci","valore":600}]},{"nome":"Ibeve Pitagonus","pianoArenaCeleste":1,"vitaIniziale":800,"destrezza":110,"velocita":5,"riflessi":10,"miniatura":"https://upload.forumfree.net/i/fc9375543/Ibeve.png","movesetOffensivo":[{"descrizione":"Ibeve abbassa il capo ed avanza verso il suo contendente senza timore: appena arrivato a portata scaglia una testata in avanti.","valore":30},{"descrizione":"Ibeve corre in avanti e si lancia a gambe tese contro l'avversario volando a qualche centimetro dal ring orizzontalmente.","valore":25},{"descrizione":"Ibeve pone un braccio intorno alla testa dell'avversario e con l'altro lo afferra alla cintura. Lo alza e lo proietta a terra gettandosi all'indietro, facendo così cadere violentemente l'avversario sulla schiena.","valore":20},{"descrizione":"Ibeve alza la gamba destra agilmente e scaglia una pedata contro il petto del nemico, spingendolo via.","valore":15},{"descrizione":"Ibeve tenta di colpire con uno schiaffetto dietro la nuca: è palesemente infastidito dall'affronto.","valore":0}],"movesetDifensivo":[{"descrizione":"Ibeve abbassa il capo e rimanere immobile, indurendo ogni fibra dei suoi muscoli. Sarà come impattare contro una montagna.","valore":140},{"descrizione":"Ibeve antepone le sue braccia possenti dinnanzi a lui, pronto ad intercettare qualsiasi colpo in arrivo.","valore":120},{"descrizione":"Ibeve non ha paura di nulla, per questo si avvicina lentamente al suo avversario nonostante stia per essere colpito.","valore":110},{"descrizione":"Ibeve, molto abilmente, sposta il suo corpo all'ultimo momento tentando una schivata o quello che sembra un contrattacco teatrale. Sorride verso la folla ma in realtà ha subito l'offensiva avversaria.","valore":100},{"descrizione":"Ibeve riesce a schivare l'attacco con un movimento agile e preciso | Ibeve cerca di schivare l'attacco, senza riuscirci","valore":140}]},{"nome":"Oldaf Mitgefühl","pianoArenaCeleste":60,"vitaIniziale":3800,"destrezza":200,"velocita":100,"riflessi":175,"miniatura":"https://upload.forumfree.net/i/fc9375543/7.png","movesetOffensivo":[{"descrizione":"Oldaf salta in alto e rapidamente ricade contro il nemico spingendo in avanti un pugno destro con tutta la forza che possiede.","valore":110},{"descrizione":"Oldaf alza in aria la gamba sinistra e colpisce con un doppio calcio punta-tallone in ritorno quasi istantaneamente.","valore":80},{"descrizione":"Oldaf tira fuori tutta la sua esperienza e si proietta contro il nemico con una serie rapida ed istantanea di pugni diretti alla gola.","valore":50},{"descrizione":"Oldaf indica un punto dietro l'avversario: per un istante sembra fermarsi ma accorcia le distanze e tenta di colpire con una gomitata lo stomaco nemico.","valore":20},{"descrizione":"Oldaf è oltraggiato per motivi apparentemente poco chiari, tuttavia questo non gli impedisce di schiaffeggiare il volto avversario.","valore":0}],"movesetDifensivo":[{"descrizione":"Oldaf intuisce che sarà meglio difendersi per bene: antepone le braccia davanti e si accovaccia leggermente, irremovibile è pronto a tutto.","valore":190},{"descrizione":"Oldaf intercetta con un calcio il colpo in arrivo rischiando l'infortunio ma tentando di annullare con forza contraria.","valore":160},{"descrizione":"Oldaf contrae tutti i muscoli del torso e la tartaruga presente sul suo addome si anima: qualsiasi sarà la mossa avversaria fermerà tutto come uno scudo stringendo i denti.","valore":130},{"descrizione":"Oldaf goffamente riesce a difendersi a malapena, perde l'equilibrio e si ritrova sottosopra.","valore":100},{"descrizione":"Oldaf riesce a schivare l'attacco con un movimento agile e preciso | Oldaf cerca di schivare l'attacco, senza riuscirci","valore":190}]},{"nome":"Olga Strapopovich","pianoArenaCeleste":70,"vitaIniziale":4300,"destrezza":250,"velocita":250,"riflessi":150,"miniatura":"https://upload.forumfree.net/i/fc9375543/8.png","movesetOffensivo":[{"descrizione":"Olga, con una velocità fuori dal comune, parte con un diretto destro ma qualcosa di strano accade: l'avversario viene colpito di lato senza una ragionevole spiegazione. Si tratta di un colpo mai visto nella boxe che riesce a sorprendere anche il nemico più esperto.","valore":130},{"descrizione":"Olga porta indietro il busto caricando un potentissimo diretto sinistro che rilascia solo una volta sotto l'avversario: la mossa in realtà si tramuta in un montante al mento dove la ragazza rimane per qualche istante con il braccio disteso verso l'alto.","valore":100},{"descrizione":"Olga, grazie ad un leggiadro ed ipnotico gioco di gambe, si porta rapidamente verso il nemico e lo colpisce con un diretto-gancio al volto.","valore":70},{"descrizione":"Olga non crede più nelle favole, cammina verso l'avversario con la guardia bassa e il petto infuori. Una ginocchiata improvvisa alla parti basse.","valore":40},{"descrizione":"Olga non è fiera dei suoi trascorsi ma non intende ritirarsi: ecco perché incattivita si avvicina e tenta con i guantoni un graffio di striscio al volto avversario.","valore":0}],"movesetDifensivo":[{"descrizione":"Olga porta gli avambracci e una delle ginocchia in avanti mostrando tutta la sua agilità e imbastendo una difesa ad hoc nascosta dietro i guantoni.","valore":150},{"descrizione":"Olga è consapevole che i muscoli delle sue cosce sono così sviluppati da sembrare marmo, grazie anche alla candida pelle. Tenta di difendersi alzando e muovendo le gambe con movimenti nostalgici.","valore":130},{"descrizione":"Olga intercetta i colpi avversari con altri pugni velocissimi cercando di rimanere concentrata e non sbilanciarsi per il rinculo.","valore":115},{"descrizione":"Olga sospira e chiude gli occhi rimanendo immobile e con le braccia distese sui fianchi: è un grosso azzardo ma non è la prima volta che punta sul senso di colpa avversario.","valore":100},{"descrizione":"Olga riesce a schivare l'attacco con un movimento agile e preciso | Olga cerca di schivare l'attacco, senza riuscirci","valore":150}]},{"nome":"Oran Lee","pianoArenaCeleste":90,"vitaIniziale":5300,"destrezza":170,"velocita":170,"riflessi":170,"miniatura":"https://upload.forumfree.net/i/fc9375543/10.png","movesetOffensivo":[{"descrizione":"Oran scatta in avanti fino a raggiungere l'avversario, per poi afferrare saldamente il suo dito tra pollice e indice, mantenendo il mignolo della propria mano sollevato. Una volta abbassato il mignolo, un'energica ma gentile onda d'urto si originerà dai due sfidanti a contatto, e colui che ha subito la mossa si sentirà frastornato dall'esperienza. Oran sta ancora lavorando su questa mossa, ma è convinto che una volta perfezionata diventerà un attacco inarrestabile","valore":170},{"descrizione":"Oran carica l'avversario e prova ad afferrarlo per i fianchi, per poi lanciarlo verso l'alto e dietro di sé.","valore":160},{"descrizione":"Oran si lancia senza freni e senza paura in una carica frontale. L'obiettivo del suo attacco è spingere l'avversario con entrambe le mani, sfruttando tutta la potenza dirompente della sua carica.","valore":150},{"descrizione":"Nonostante la sua imponente stazza, Oran si muove con una velocità impressionante e scatta verso l'avversario, per colpirlo con un rapido calcio laterale.","valore":140},{"descrizione":"Oran approccia l'avversario con passi decisi. Una volta abbastanza vicino, sferra un violento colpo a mano aperta verso il petto dell'avversario. Se colpisce bene, questo suo attacco è in grado di strozzare il respiro e fermare il battito cardiaco per qualche secondo, oltre che scaraventare indietro l'avversario.","valore":130}],"movesetDifensivo":[{"descrizione":"Oran raggiunge uno stato di concentrazione assoluto, sentendosi un tutt'uno con il mondo attorno a sé. Qualsiasi attacco riceverà, è pronto a resistergli con tutte le sue forze. Non ha paura. Il suo corpo, pur non avendo subito apparenti mutazioni, sembra per qualche motivo duro come la roccia.","valore":170},{"descrizione":"Oran si mette in posizione, pianta i piedi a terra e si prepara a resistere all'attacco. Anche se venisse colpito, anche se venisse ferito, anche se venisse sconfitto, non barcollerà di un centimetro. Rimarrà in piedi.","valore":160},{"descrizione":"Oran frappone il suo arto più vicino a protezione della zona mirata dall'avversario.","valore":150},{"descrizione":"Oran si volta di schiena per incassare il colpo con i suoi poderosi e resistenti muscoli dorsali.","valore":140},{"descrizione":"Oran riesce a schivare l'attacco con un movimento agile e preciso | Oran cerca di schivare l'attacco, senza riuscirci","valore":170}]},{"nome":"Red","pianoArenaCeleste":190,"vitaIniziale":6000,"destrezza":250,"velocita":800,"riflessi":150,"miniatura":"https://upload.forumfree.net/i/fc9375543/14.png","movesetOffensivo":[{"descrizione":"Red è un mostro. Si avvicina al nemico e con uno scatto lo supera di qualche centimetro tanto per riuscire a colpirlo con un taglio di mano dietro la nuca.","valore":800},{"descrizione":"Red senza timore attacca frontalmente e con il palmo della mano destra affonda nella gola dell'avversario.","valore":750},{"descrizione":"Red comprende la sua forza e per questo non si trattiene dallo sferrare un calcio circolare alto, sinistro, verso la tempia del nemico.","valore":700},{"descrizione":"Red senza volerlo sfoggia la sua destrezza nei movimenti e salta a mezz'aria quanto basta per colpire con il ginocchio destro il mento dell'avversario.","valore":650},{"descrizione":"Red, mentre si sgranchisce le braccia e le spalle, sferra un ceffone senza pietà sul viso di chi ha davanti.","valore":600}],"movesetDifensivo":[{"descrizione":"Red si protegge voltandosi di lato e alzando il gomito. Un pugno chiuso all'orecchio e l'altro a protezione delle costole.","valore":600},{"descrizione":"Red si protegge contraendo il petto e l'addome mentre gli avambracci proteggono il volto.","valore":550},{"descrizione":"Red si protegge contrattaccando con circolari a varie altezze per rallentare e smorzare la forza nemica.","valore":500},{"descrizione":"Red non si protegge. Irrigidisce semplicemente il suo corpo e rimane immobile. Red è un mostro.","valore":450},{"descrizione":"Red riesce a schivare l'attacco con un movimento agile e preciso | Red cerca di schivare l'attacco, senza riuscirci","valore":600}]},{"nome":"Rey Budgerigar","pianoArenaCeleste":40,"vitaIniziale":2800,"destrezza":260,"velocita":150,"riflessi":100,"miniatura":"https://upload.forumfree.net/i/fc9375543/5.png","movesetOffensivo":[{"descrizione":"Rey prende una rincorsa breve e salta direttamente contro l'avversario con una capriola aerea, atterrando con un doppio ginocchio sul petto. Il movimento sfrutta la rotazione naturale per aumentare la velocità e l'impatto senza bisogno di spinta esterna che normalmente è generata dalle corde dei ring dove combatte.","valore":70},{"descrizione":"Rey prova ad afferrare il braccio dell'avversario e lo usa come punto di leva per lanciarsi in un avvitamento aereo laterale, chiudendo le gambe intorno al collo e proiettandolo con una Hurricanrana modificata.","valore":60},{"descrizione":"Rey finta un pugno per far abbassare la guardia dell'avversario, quindi esegue un rapido scatto e un salto in avanti con una ginocchiata frontale in rotazione. Questo attacco sfrutta la spinta delle gambe e il peso del corpo per generare il massimo impatto.","valore":50},{"descrizione":"Rey scatta alle spalle dell'avversario, si piega rapidamente all'indietro, afferrandolo per la testa e trascinandolo con sé in una spaccata volante che lo fa cadere in ginocchio, schiantando la nuca del rivale sul proprio corpo per un effetto da whiplash.","valore":40},{"descrizione":"Rey solleva l'avversario in una posizione da Fireman's Carry, poi si lascia cadere di lato ruotando velocemente su se stesso, scaraventandolo con forza al suolo.","valore":30}],"movesetDifensivo":[{"descrizione":"Rey esegue un rapido scivolamento laterale accovacciandosi e parando con gli addominali contratti. Girandosi su un fianco e sfruttando la rotazione del busto per rialzarsi, recupera una posizione offensiva immediata.","valore":120},{"descrizione":"Rey, invece di tirarsi indietro, spinge in avanti e si gira su se stesso in un movimento a spirale, tenta di far perdere equilibrio al nemico che lo sta attaccando con una leva articolare improvvisata.","valore":100},{"descrizione":"Rey rafforza la propria posizione e assorbe l'impatto con un blocco rigido delle braccia, subito seguito da una spallata esplosiva per respingere l'avversario.","valore":80},{"descrizione":"Rey sfrutta il proprio peso abbassando rapidamente il baricentro e scivolando giù rispetto al corpo dell'avversario, atterrando e parando con i muscoli della schiena.","valore":60},{"descrizione":"Rey riesce a schivare l'attacco con un movimento agile e preciso | Rey cerca di schivare l'attacco, senza riuscirci","valore":120}]},{"nome":"Sphylos Tender","pianoArenaCeleste":80,"vitaIniziale":4800,"destrezza":50,"velocita":80,"riflessi":220,"miniatura":"https://upload.forumfree.net/i/fc9375543/9.png","movesetOffensivo":[{"descrizione":"Sphylos, a malincuore, decide di ricorrere ad una risorsa nascosta: qualcosa che trascende il semplice allenamento umano. Ove la pace interiore non arriva, le lastre di acciaio inserite sotto le sue nocche sono la risposta ultima ad un nemico da sconfiggere. Un pugno diretto e diritto. Verso il viso dell'avversario. Un attacco che non ricorda le arti marziali ma è la fonte di scarico della stanchezza di anni di dedizione.","valore":260},{"descrizione":"Sphylos avanza lentamente con passo misurato, lasciando che l'avversario abbassi la guardia. Poi, con un movimento fulmineo, colpisce il punto vitale del plesso solare con un tocco leggero ma chirurgico delle dita, causando un'interruzione del respiro e uno shock momentaneo al sistema nervoso.","valore":230},{"descrizione":"Sphylos, senza mai perdere la compostezza, esegue un colpo di palmo aperto al petto dell'avversario. Tuttavia, il segreto della tecnica sta nella totale rilassatezza del corpo fino all'ultimo istante: ciò permette di canalizzare tutta l'energia in un impatto breve ma devastante, capace di far barcollare anche un avversario molto più forte.","valore":200},{"descrizione":"Sphylos utilizza la minima distanza possibile per sferrare un colpo devastante. Quando l'avversario è a portata, esegue un pugno breve e improvviso che non sembra avere rincorsa, ma la cui precisione e potenza concentrata superano qualsiasi colpo più evidente. L'impatto arriva prima ancora che l'avversario possa accorgersi del movimento.","valore":170},{"descrizione":"Sphylos esegue un attacco basato sull'armonizzazione con l'avversario. Il maestro segue il movimento dell'opponente con piccoli spostamenti e, al momento giusto, sfrutta il momento per colpirlo con un calcio basso al ginocchio sinistro che ne destabilizza l'equilibrio, facendolo cadere come se fosse stato abbattuto dal vento.","valore":140}],"movesetDifensivo":[{"descrizione":"Sphylos analizza il colpo che sta per raggiungerlo ed inizia a muoversi fluidamente come un'onda, deviando l'attacco con un minimo movimento degli avambracci, facendolo scivolare via come sabbia tra le dita. Questo tipo di difesa trasforma la forza dell'avversario in un soffio nel vento.","valore":220},{"descrizione":"Sphylos, senza reagire impulsivamente, alza lentamente una mano con il palmo aperto davanti a sé. Il gesto, apparentemente semplice, è carico di energia e intenti, e spesso causa esitazione nell'avversario. Se il colpo arriva comunque, il maestro lo intercetta con un minimo movimento del polso.","valore":190},{"descrizione":"Sphylos, quando un attacco è imminente, si lascia semplicemente cadere di lato, rilassando completamente il corpo. Questa caduta strategica lo porta fuori dalla traiettoria diretta del colpo, facendolo sembrare quasi un'ombra che scompare nel nulla. I muscoli delle braccia e dei fianchi ammortizzano l'offensiva. Prima di toccare il suolo si rialza di scatto facendo forza sulle caviglie.","valore":160},{"descrizione":"Sphylos pianta saldamente i piedi al suolo, allineando perfettamente il corpo con la gravità. In questo stato, sembra impossibile da smuovere, come se fosse parte stessa della terra. In realtà è solamente una buona copertura della sua ottima capacità di sopportare il dolore.","valore":130},{"descrizione":"Sphylos riesce a schivare l'attacco con un movimento agile e preciso | Sphylos cerca di schivare l'attacco, senza riuscirci","valore":220}]},{"nome":"Starius Mourniol","pianoArenaCeleste":30,"vitaIniziale":2300,"destrezza":180,"velocita":140,"riflessi":40,"miniatura":"https://upload.forumfree.net/i/fc9375543/4.png","movesetOffensivo":[{"descrizione":"Starius affida tutta la sua forza ad una protuberanza importante del suo corpo, carica la testa all'indietro e colpisce con una testata in viso l'avversario.","valore":80},{"descrizione":"Starius si avvicina di soppiatto e passa una mano fra i suoi folti capelli: all'apparenza sembra che si stia pavoneggiando per il pubblico ma ecco che una ginocchiata al mento si alza rapida e potente.","valore":60},{"descrizione":"Starius, forte dei suoi legamenti, posiziona i palmi delle mani a terra sollevando tutto il corpo: le gambe iniziano a roteare in circolo tentando di schiaffeggiare con i piedi il nemico.","valore":40},{"descrizione":"Starius alza le mani al cielo incitando il pubblico, raccoglie le forze e si avvicina con passi di capoeira molto rapidi. Ecco che parte con un calcio all'indietro tentando di colpire alla nuca l'avversario con il tallone destro, realizzando un'ascia impeccabile.","valore":20},{"descrizione":"Starius assume un'espressione contrariata e sbattendo i piedi a terra scatta in avanti arrabbiato: le sue movenze ormai sono solo un insieme confuso di danze caraibiche e balli di gruppo ma il suo montante sinistro al mento nemico è pieno di risentimento e pazienza perduta.","valore":0}],"movesetDifensivo":[{"descrizione":"Starius riesce ad accelerare il suo battito cardiaco e, veicolando l'afflusso di sangue verso la zona colpita dal nemico, spinge i muscoli ad irrobustirsi aumentando anche di molto la temperatura corporea. Un lieve vapore si intravede fuoriuscire dai suoi pori.","valore":120},{"descrizione":"Starius carica all'indietro il suo pugno destro accovacciandosi leggermente: la mano sinistra a copertura delle nocche fino al momento in cui sgancia in avanti il pugno in direzione del colpo avversario in arrivo. Vuole a tutti i costi contrastare con una forza pari o superiore senza pensare ai rischi.","valore":105},{"descrizione":"Starius sembra distratto dalla puzza di sudore sul ring. Cerca in tutti i modi di rimanere concentrato però riesce solo a difendersi con il suo testone capelluto ammorbidendo l'offensiva.","valore":95},{"descrizione":"Starius, distratto dalla diretta live, dimentica di difendersi adeguatamente. All'ultimo secondo irrigidisce il suo corpo rimanendo tuttavia fermo sul posto.","valore":80},{"descrizione":"Starius riesce a schivare l'attacco con un movimento agile e preciso | Starius cerca di schivare l'attacco, senza riuscirci","valore":120}]},{"nome":"Zero-F","pianoArenaCeleste":180,"vitaIniziale":6000,"destrezza":350,"velocita":350,"riflessi":350,"miniatura":"https://upload.forumfree.net/i/fc9375543/13.png","movesetOffensivo":[{"descrizione":"Zero-F si lancia in una rapida offensiva frontale. Le sue unghie si fanno più lunghe e affilate, diventando dei veri e propri artigli. Cerca quindi di perforare il petto dell'avversario, come se volesse strappargli il cuore.","valore":250},{"descrizione":"Zero-F si lancia in una rapida offensiva frontale. I suoi canini si fanno più lunghi e affilati, diventando delle vere e proprie zanne. Cerca quindi di mordere il collo dell'avversario, come se volesse recidergli la carotide.","valore":225},{"descrizione":"Zero-F si nasconde tra le ombre. Riemerge all'improvviso alle spalle dell'avversario, cercando di bloccarlo da dietro in una presa atta a soffocarlo.","valore":200},{"descrizione":"Zero-F si lancia in una rapida offensiva frontale: un violento pugno diretto alla gola dell'avversario","valore":175},{"descrizione":"Zero-F si lancia in una rapida offensiva: un violento calcio diretto al lato collo avversario","valore":150}],"movesetDifensivo":[{"descrizione":"Zero-F porta l'arto più vicino a protezione della zona colpita. Le sue ossa sembrano dure come l'acciaio.","valore":250},{"descrizione":"Zero-F accompagna il movimento dell'offensiva avversaria per neutralizzarla","valore":225},{"descrizione":"Zero-F indurisce i muscoli della zona colpita. I suoi muscoli sembrano duri come l'acciaio.","valore":200},{"descrizione":"Zero-F, per qualche motivo, non fa nulla. In ogni caso, il suo corpo è abbastanza resistente da permettergli di difendersi ugualmente.","valore":150},{"descrizione":"Zero-F riesce a schivare l'attacco con un movimento agile e preciso | Zero-F cerca di schivare l'attacco, senza riuscirci","valore":400}]},{"nome":"Goro Domon","pianoArenaCeleste":0,"vitaIniziale":500,"destrezza":25,"velocita":20,"riflessi":15,"miniatura":"https://upload.forumfree.net/i/fc9375543/goro.jpg","movesetOffensivo":[{"descrizione":"Goro scatta lateralmente e scaglia un gancio improvviso, puntando alla tempia del nemico con la rapidità tipica di una rissa tra i vicoli.","valore":30},{"descrizione":"Sfruttando la sua agilità, Goro sferra una scarica di tre pugni rapidi al volto, cercando di stordire l'avversario con la pura velocità.","valore":20},{"descrizione":"Senza alcun senso dell'onore, Goro finge un pugno alto per poi colpire violentemente con un calcio stinco-su-stinco o direttamente ai genitali.","valore":15},{"descrizione":"Goro si abbassa di scatto e scivola dietro le gambe del nemico, tentando di colpirlo dietro le ginocchia per farlo crollare.","valore":10},{"descrizione":"Goro sputa vicino ai piedi del nemico e lo insulta pesantemente, sferrando un buffetto rapido per farlo infuriare e deconcentrare.","valore":0}],"movesetDifensivo":[{"descrizione":"Goro esegue un movimento fulmineo del busto, abituato a schivare colpi di bottiglia o armi improvvisate nei bassifondi.","valore":30},{"descrizione":"Il ragazzo stringe la guardia e incassa il colpo con le nocche fasciate, pronto a rimbalzare via per attutire l'impatto.","valore":20},{"descrizione":"Non tenta di parare, ma usa le gambe agili per saltare fuori dalla traiettoria principale dell'attacco all'ultimo secondo.","valore":15},{"descrizione":"Goro subisce il colpo ma lo trasforma in una rotazione, usando il dolore per caricare l'adrenalina e rimanere in piedi con un ghigno.","valore":10},{"descrizione":"Goro riesce a schivare l'attacco con un movimento agile e preciso | Goro cerca di schivare l'attacco, senza riuscirci","valore":30}]},{"nome":"Suki Hazuki","pianoArenaCeleste":0,"vitaIniziale":700,"destrezza":30,"velocita":35,"riflessi":20,"miniatura":"https://upload.forumfree.net/i/fc9375543/Suki.jpg","movesetOffensivo":[{"descrizione":"Suki scatta in avanti sferrando un colpo rapido con la punta delle dita tese, mirando alla gola o agli occhi.","valore":30},{"descrizione":"Suki ruota su se stessa e scaglia un calcio circolare fulmineo, usando la velocità di rotazione per generare potenza.","valore":25},{"descrizione":"Suki salta sulle spalle dell'avversario e avvolge le gambe attorno al suo busto, colpendolo ripetutamente alle tempie.","valore":20},{"descrizione":"Un colpo secco di taglio della mano mirato ai tendini del braccio, volto a paralizzare temporaneamente l'arto nemico.","valore":15},{"descrizione":"Suki si limita a un colpetto di dita sulla fronte del nemico, mantenendo un'espressione di totale superiorità.","valore":0}],"movesetDifensivo":[{"descrizione":"Suki flette il corpo con un movimento sinuoso, lasciando che il colpo scivoli via senza toccarla minimamente.","valore":50},{"descrizione":"Suki usa le braccia per deviare la traiettoria dell'attacco mentre esegue una capriola all'indietro.","valore":40},{"descrizione":"Suki scivola lateralmente con eleganza, posizionandosi in un angolo cieco mentre il colpo fende l'aria.","valore":30},{"descrizione":"Suki sembra scoperta, ma all'ultimo istante ruota il busto subendo solo un colpo di striscio che lei ignora con freddezza.","valore":20},{"descrizione":"Suki riesce a schivare l'attacco con un movimento agile e preciso | Suki cerca di schivare l'attacco, senza riuscirci","valore":50}]},{"nome":"Billy Crane","pianoArenaCeleste":0,"vitaIniziale":900,"destrezza":80,"velocita":35,"riflessi":35,"miniatura":"https://upload.forumfree.net/i/fc9375543/billy.jpg","movesetOffensivo":[{"descrizione":"Billy muove le mani vorticosamente davanti al volto dell'avversario; mentre questi cerca di seguirne il ritmo, Billy sferra un colpo secco alla gola con la mano rimasta nascosta.","valore":45},{"descrizione":"Billy esegue una finta di corpo verso destra, ma con un movimento innaturale delle articolazioni colpisce con un calcio frustato dal lato opposto.","valore":35},{"descrizione":"Sfruttando la sua postura snodata, Billy si abbassa fin quasi a toccare il suolo per poi scattare verso l'alto con un montante mirato alla mascella.","valore":25},{"descrizione":"Billy sfiora ripetutamente le braccia del nemico con colpi leggeri e ritmati, per poi esplodere improvvisamente con una palmata violenta al centro del petto.","valore":20},{"descrizione":"Billy esegue un inchino teatrale e schiocca le dita davanti agli occhi del nemico: un semplice gesto di scherno per irritare l'avversario.","valore":0}],"movesetDifensivo":[{"descrizione":"Billy flette il busto in modo estremo, quasi si spezzasse a metà, facendo passare l'attacco nemico a millimetri dalla sua pelle.","valore":60},{"descrizione":"Billy asseconda la forza del colpo avversario ruotando su se stesso, dissipando l'energia dell'impatto con una piroetta acrobatica.","valore":50},{"descrizione":"Con un rapido gioco di gambe, Billy altera la percezione della distanza, inducendo l'avversario a colpire troppo corto o troppo lungo.","valore":40},{"descrizione":"Billy incrocia le braccia in una posa bizzarra; subisce il colpo ma lo incanala lateralmente, minimizzando i danni con un sorriso beffardo.","valore":30},{"descrizione":"Billy riesce a schivare l'attacco con un movimento agile e preciso | Billy cerca di schivare l'attacco, senza riuscirci","valore":60}]},{"nome":"Rhino Vercetti","pianoArenaCeleste":0,"vitaIniziale":1100,"destrezza":70,"velocita":45,"riflessi":50,"miniatura":"https://upload.forumfree.net/i/fc9375543/rhino.jpg","movesetOffensivo":[{"descrizione":"Rhino afferra l'avversario per le orecchie e gli scaglia una testata brutale sul setto nasale.","valore":55},{"descrizione":"Un gancio corto e pesantissimo mirato alla mascella, lanciato senza preavviso e con estrema cattiveria.","valore":40},{"descrizione":"Rhino finge un pugno e invece colpisce con la punta del gomito dritto sullo zigomo del nemico.","valore":35},{"descrizione":"Rhino sferra un calcio basso e laterale mirato a far cedere l'articolazione della gamba d'appoggio nemica.","valore":30},{"descrizione":"Rhino sputa per terra ai piedi dell'avversario e gli tira un buffetto sulla guancia, guardandolo con disprezzo.","valore":0}],"movesetDifensivo":[{"descrizione":"Rhino abbassa il mento e flette il collo, incassando il colpo sulla parte superiore del cranio per danneggiare la mano del nemico.","valore":65},{"descrizione":"Rhino intercetta il colpo con un movimento minimo del braccio, contraendo i muscoli come se fossero di pietra.","valore":50},{"descrizione":"Rhino mette una mano sulla spalla del nemico mentre questo attacca, limitando la gittata e la potenza del colpo.","valore":40},{"descrizione":"Rhino accetta di subire l'attacco in pieno petto, ma usa l'impatto per caricare il suo prossimo colpo di risposta.","valore":30},{"descrizione":"Rhino riesce a schivare l'attacco con un movimento agile e preciso | Rhino cerca di schivare l'attacco, senza riuscirci","valore":65}]}];

function avvia(){
  if (!document.getElementById("af-root")){
    console.error("[Arena Celeste] #af-root non trovato nel DOM.");
    return;
  }
  try{
    renderEditorMoveset();
    bind();
    attendiFramework();   // permessi (ri-tenta finché il framework non è pronto)
    initFirebase().catch(e => {
      console.error("[Arena Celeste] Firebase:", e);
      const b = document.getElementById("afSync");
      if (b){
        b.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> firebase ko';
        b.className   = "af-badge err";
        b.title       = e.message;
      }
    });
    render();
    console.log("[Arena Celeste] avviato correttamente.");
  }catch(e){
    console.error("[Arena Celeste] errore in avvio:", e);
    const b = document.getElementById("afSync");
    if (b){
      b.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> errore JS';
      b.className = "af-badge err";
      b.title = e.message;
    }
  }
}

/* Il markup potrebbe non essere ancora nel DOM quando lo script parte. */
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", avvia);
else
  avvia();

})();
