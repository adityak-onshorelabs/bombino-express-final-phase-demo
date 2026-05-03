/**
 * One-off generator: builds itdCountryData.ts and itdCurrencyData.ts
 * from datasets/country-codes CSV + client/src/lib/countryData.ts order.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function loadCsvMap(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idxIso = header.indexOf("ISO3166-1-Alpha-2");
  const idxDial = header.indexOf("Dial");
  const idxCur = header.indexOf("ISO4217-currency_alphabetic_code");
  if (idxIso < 0 || idxDial < 0 || idxCur < 0) {
    throw new Error("Unexpected CSV header");
  }
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const iso = (cols[idxIso] ?? "").trim();
    if (!iso || iso.length !== 2) continue;
    const dial = (cols[idxDial] ?? "").trim();
    let currency = (cols[idxCur] ?? "").trim();
    if (currency === "NaN" || currency === "") currency = "";
    map.set(iso, { dial, currency });
  }
  return map;
}

function extractCountryList(tsPath) {
  const src = fs.readFileSync(tsPath, "utf8");
  const m = src.match(/export const COUNTRY_LIST:[^[]*\[([\s\S]*?)\];/);
  if (!m) throw new Error("COUNTRY_LIST not found");
  const body = m[1];
  const re = /\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]*)"\s*\}/g;
  const list = [];
  let match;
  while ((match = re.exec(body))) {
    list.push({ code: match[1], name: match[2] });
  }
  return list;
}

function dialToDialCode(dialRaw) {
  const d = String(dialRaw ?? "").trim();
  if (!d) return "";
  // CSV sometimes has multiple codes separated by commas
  const first = d.split(/[,;]/)[0].trim();
  if (!first) return "";
  if (first.startsWith("+")) return first;
  return `+${first}`;
}

/** Override ITD-specific codes not in standard ISO CSV */
const EXTRA = {
  XB: { dial: "+599", currency: "USD" },
  XC: { dial: "+599", currency: "ANG" },
  XN: { dial: "+869", currency: "USD" },
  XY: { dial: "+590", currency: "EUR" },
  XE: { dial: "+599", currency: "USD" },
  XM: { dial: "+721", currency: "ANG" },
  XS: { dial: "+252", currency: "USD" },
  nan: { dial: "+264", currency: "NAD" },
};

function main() {
  const csvPath = path.join(root, "tmp-country-codes.csv");
  const countryTs = path.join(root, "client/src/lib/countryData.ts");
  const csvMap = loadCsvMap(csvPath);
  const countries = extractCountryList(countryTs);
  if (countries.length !== 234) {
    console.warn(`Expected 234 countries, got ${countries.length}`);
  }

  const itdCountries = [];
  const currencyCodes = new Set();

  for (const { code, name } of countries) {
    let dial = "";
    let currency = null;
    const extra = EXTRA[code];
    if (extra) {
      dial = extra.dial;
      currency = extra.currency;
    } else {
      const row = csvMap.get(code);
      if (row) {
        dial = dialToDialCode(row.dial);
        const rawCur = (row.currency || "").trim();
        if (rawCur.includes(",")) {
          currency = rawCur.split(",")[0].trim() || null;
        } else {
          currency = rawCur || null;
        }
      }
    }
    if (currency) currencyCodes.add(currency);
    itdCountries.push({
      code,
      name,
      dialCode: dial,
      currencyCode: currency,
    });
  }

  const sortedCurrencies = [...currencyCodes].sort();

  const fmtCountry = itdCountries
    .map(
      (c) =>
        `  { code: "${c.code}", name: ${JSON.stringify(c.name)}, dialCode: ${JSON.stringify(c.dialCode)}, currencyCode: ${c.currencyCode === null ? "null" : JSON.stringify(c.currencyCode)} },`
    )
    .join("\n");

  const currencyNames = {
    AFN: "Afghani",
    ALL: "Lek",
    DZD: "Algerian Dinar",
    USD: "US Dollar",
    EUR: "Euro",
    AOA: "Kwanza",
    XCD: "East Caribbean Dollar",
    ARS: "Argentine Peso",
    AMD: "Armenian Dram",
    AWG: "Aruban Florin",
    AUD: "Australian Dollar",
    AZN: "Azerbaijan Manat",
    BSD: "Bahamian Dollar",
    BHD: "Bahraini Dinar",
    BDT: "Taka",
    BBD: "Barbados Dollar",
    BYN: "Belarusian Ruble",
    BZD: "Belize Dollar",
    XOF: "CFA Franc BCEAO",
    BMD: "Bermudian Dollar",
    BTN: "Ngultrum",
    INR: "Indian Rupee",
    BOB: "Boliviano",
    BAM: "Convertible Mark",
    BWP: "Pula",
    NOK: "Norwegian Krone",
    BRL: "Brazilian Real",
    BND: "Brunei Dollar",
    BGN: "Bulgarian Lev",
    BIF: "Burundi Franc",
    CVE: "Cabo Verde Escudo",
    KHR: "Riel",
    XAF: "CFA Franc BEAC",
    CAD: "Canadian Dollar",
    KYD: "Cayman Islands Dollar",
    CLP: "Chilean Peso",
    CNY: "Yuan Renminbi",
    COP: "Colombian Peso",
    KMF: "Comorian Franc",
    CDF: "Congolese Franc",
    NZD: "New Zealand Dollar",
    CRC: "Costa Rican Colon",
    HRK: "Kuna",
    CUP: "Cuban Peso",
    ANG: "Netherlands Antillean Guilder",
    CZK: "Czech Koruna",
    DKK: "Danish Krone",
    DJF: "Djibouti Franc",
    DOP: "Dominican Peso",
    EGP: "Egyptian Pound",
    SVC: "El Salvador Colon",
    ERN: "Nakfa",
    ETB: "Ethiopian Birr",
    FKP: "Falkland Islands Pound",
    FJD: "Fiji Dollar",
    XPF: "CFP Franc",
    GMD: "Dalasi",
    GEL: "Lari",
    GHS: "Ghana Cedi",
    GIP: "Gibraltar Pound",
    GTQ: "Quetzal",
    GBP: "Pound Sterling",
    GNF: "Guinean Franc",
    GYD: "Guyana Dollar",
    HTG: "Gourde",
    HNL: "Lempira",
    HKD: "Hong Kong Dollar",
    HUF: "Forint",
    ISK: "Iceland Krona",
    IDR: "Rupiah",
    IRR: "Iranian Rial",
    IQD: "Iraqi Dinar",
    ILS: "New Israeli Sheqel",
    JMD: "Jamaican Dollar",
    JPY: "Yen",
    JOD: "Jordanian Dinar",
    KZT: "Tenge",
    KES: "Kenyan Shilling",
    KPW: "North Korean Won",
    KRW: "Won",
    KWD: "Kuwaiti Dinar",
    KGS: "Som",
    LAK: "Lao Kip",
    LBP: "Lebanese Pound",
    LSL: "Loti",
    LRD: "Liberian Dollar",
    LYD: "Libyan Dinar",
    CHF: "Swiss Franc",
    MOP: "Pataca",
    MGA: "Malagasy Ariary",
    MWK: "Malawi Kwacha",
    MYR: "Malaysian Ringgit",
    MVR: "Rufiyaa",
    MRU: "Ouguiya",
    MUR: "Mauritius Rupee",
    MXN: "Mexican Peso",
    MDL: "Moldovan Leu",
    MNT: "Tugrik",
    MAD: "Moroccan Dirham",
    MZN: "Mozambique Metical",
    MMK: "Kyat",
    NAD: "Namibia Dollar",
    NPR: "Nepalese Rupee",
    NIO: "Cordoba Oro",
    NGN: "Naira",
    OMR: "Rial Omani",
    PKR: "Pakistan Rupee",
    PAB: "Balboa",
    PGK: "Kina",
    PYG: "Guarani",
    PEN: "Sol",
    PHP: "Philippine Peso",
    PLN: "Zloty",
    QAR: "Qatari Rial",
    RON: "Romanian Leu",
    RUB: "Russian Ruble",
    RWF: "Rwanda Franc",
    SHP: "Saint Helena Pound",
    WST: "Tala",
    STN: "Dobra",
    SAR: "Saudi Riyal",
    RSD: "Serbian Dinar",
    SCR: "Seychelles Rupee",
    SLL: "Leone",
    SGD: "Singapore Dollar",
    SBD: "Solomon Islands Dollar",
    SOS: "Somali Shilling",
    ZAR: "Rand",
    SSP: "South Sudanese Pound",
    LKR: "Sri Lanka Rupee",
    SDG: "Sudanese Pound",
    SRD: "Suriname Dollar",
    SZL: "Lilangeni",
    SEK: "Swedish Krona",
    SYP: "Syrian Pound",
    TWD: "New Taiwan Dollar",
    TJS: "Somoni",
    TZS: "Tanzanian Shilling",
    THB: "Baht",
    TOP: "Pa’anga",
    TTD: "Trinidad and Tobago Dollar",
    TND: "Tunisian Dinar",
    TRY: "Turkish Lira",
    TMT: "Turkmenistan New Manat",
    UGX: "Uganda Shilling",
    UAH: "Hryvnia",
    AED: "UAE Dirham",
    UYU: "Peso Uruguayo",
    UZS: "Uzbekistan Sum",
    VUV: "Vatu",
    VES: "Bolívar Soberano",
    VND: "Dong",
    YER: "Yemeni Rial",
    ZMW: "Zambian Kwacha",
    ZWL: "Zimbabwe Dollar",
    SSP: "South Sudanese Pound",
    MRU: "Ouguiya",
    STN: "Dobra",
    VES: "Bolívar Soberano",
    BOV: "Mvdol",
    CHE: "WIR Euro",
    CHW: "WIR Franc",
    COU: "Unidad de Valor Real",
    MXV: "Mexican Unidad de Inversion (UDI)",
    USN: "US Dollar (Next day)",
    UYI: "Uruguay Peso en Unidades Indexadas (UI)",
    UYW: "Unidad Previsional",
    ZWG: "Zimbabwe Gold",
  };

  const curLines = sortedCurrencies.map((code) => {
    const name = currencyNames[code] ?? code;
    return `  { code: "${code}", name: ${JSON.stringify(name)} },`;
  });

  const countryTsOut = `export interface ITDCountry {
  code: string;
  name: string;
  dialCode: string;
  currencyCode: string | null;
}

export const ITD_COUNTRY_LIST: ITDCountry[] = [
${fmtCountry}
];

export const ITD_COUNTRY_MAP: Record<string, ITDCountry> = Object.fromEntries(
  ITD_COUNTRY_LIST.map((c) => [c.code, c])
);

export function getDestinationCurrency(code: string): string | null {
  return ITD_COUNTRY_MAP[code]?.currencyCode ?? null;
}

/** Title-case ALL CAPS country names from ITD list for display. */
export function formatCountryDisplay(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[\\s,]+)([a-z])/g, (_m, sep, letter) => sep + letter.toUpperCase());
}
`;

  const currencyTsOut = `export interface ITDCurrency {
  code: string;
  name: string;
}

export const ITD_CURRENCY_LIST: ITDCurrency[] = [
${curLines.join("\n")}
];

export const ITD_CURRENCY_MAP: Record<string, ITDCurrency> = Object.fromEntries(
  ITD_CURRENCY_LIST.map((c) => [c.code, c])
);

export function getCurrencyDisplay(code: string): string {
  const c = ITD_CURRENCY_MAP[code];
  return c ? \`\${c.code} — \${c.name}\` : code;
}
`;

  fs.writeFileSync(path.join(root, "client/src/lib/itdCountryData.ts"), countryTsOut);
  fs.writeFileSync(path.join(root, "client/src/lib/itdCurrencyData.ts"), currencyTsOut);
  console.log(
    `Wrote itdCountryData.ts (${itdCountries.length} countries), itdCurrencyData.ts (${sortedCurrencies.length} currencies)`
  );
}

main();
