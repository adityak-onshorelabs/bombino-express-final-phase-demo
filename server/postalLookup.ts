import redisClient from "./redisClient.js";

const INDIA_PINCODE_URL = "https://api.postalpincode.in/pincode";
const US_ZIP_URL = "https://api.zippopotam.us/us";
const UPSTREAM_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface PostalLookupResult {
  found: boolean;
  city: string;
  state: string;
}

const NOT_FOUND: PostalLookupResult = { found: false, city: "", state: "" };

interface IndiaPostOffice {
  District?: string;
  State?: string;
}

interface IndiaPostalResponse {
  Status?: string;
  PostOffice?: IndiaPostOffice[];
}

interface ZippopotamPlace {
  "place name"?: string;
  "state abbreviation"?: string;
}

interface ZippopotamResponse {
  places?: ZippopotamPlace[];
}

function normalizeUSZip(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  let candidate: string;
  if (trimmed.includes("-")) {
    candidate = trimmed.split("-")[0] ?? "";
  } else {
    const digits = trimmed.match(/\d+/);
    candidate = digits ? digits[0].slice(0, 5) : trimmed;
  }

  return /^\d{5}$/.test(candidate) ? candidate : null;
}

function cacheKey(country: string, code: string): string {
  return `postal:${country}:${code}`;
}

async function readCache(key: string): Promise<PostalLookupResult | null> {
  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as PostalLookupResult;
    if (
      typeof parsed.found === "boolean" &&
      typeof parsed.city === "string" &&
      typeof parsed.state === "string"
    ) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn("[postalLookup] Redis read failed:", err);
    return null;
  }
}

async function writeCache(key: string, result: PostalLookupResult): Promise<void> {
  if (!result.found) return;
  try {
    await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch (err) {
    console.warn("[postalLookup] Redis write failed:", err);
  }
}

async function fetchIndiaFromUpstream(code: string): Promise<PostalLookupResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${INDIA_PINCODE_URL}/${code}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[postalLookup] upstream HTTP ${res.status}`);
      return NOT_FOUND;
    }

    const body = (await res.json()) as IndiaPostalResponse[];
    const first = body?.[0];
    if (
      first?.Status !== "Success" ||
      !Array.isArray(first.PostOffice) ||
      first.PostOffice.length === 0
    ) {
      return NOT_FOUND;
    }

    const office = first.PostOffice[0];
    const city = office.District?.trim() ?? "";
    const state = office.State?.trim() ?? "";

    if (!city || !state) {
      return NOT_FOUND;
    }

    return { found: true, city, state };
  } catch (err) {
    console.warn("[postalLookup] upstream fetch failed:", err);
    return NOT_FOUND;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function lookupIndia(code: string): Promise<PostalLookupResult> {
  if (!/^\d{6}$/.test(code)) {
    return NOT_FOUND;
  }

  const key = cacheKey("IN", code);
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const result = await fetchIndiaFromUpstream(code);
  await writeCache(key, result);
  return result;
}

async function fetchUSFromUpstream(code: string): Promise<PostalLookupResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${US_ZIP_URL}/${code}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[postalLookup] US upstream HTTP ${res.status}`);
      return NOT_FOUND;
    }

    const data = (await res.json()) as ZippopotamResponse;
    if (!Array.isArray(data.places) || data.places.length === 0) {
      return NOT_FOUND;
    }

    const place = data.places[0];
    const city = place["place name"]?.trim() ?? "";
    const state = place["state abbreviation"]?.trim() ?? "";

    if (!city || !state) {
      return NOT_FOUND;
    }

    return { found: true, city, state };
  } catch (err) {
    console.warn("[postalLookup] US upstream fetch failed:", err);
    return NOT_FOUND;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function lookupUS(code: string): Promise<PostalLookupResult> {
  const normalized = normalizeUSZip(code);
  if (!normalized) {
    return NOT_FOUND;
  }

  const key = cacheKey("US", normalized);
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const result = await fetchUSFromUpstream(normalized);
  await writeCache(key, result);
  return result;
}

export async function lookupPostal(
  country: string,
  code: string
): Promise<PostalLookupResult> {
  try {
    const countryNorm = country.trim().toUpperCase();
    const codeNorm = code.trim();

    if (countryNorm === "IN") {
      return await lookupIndia(codeNorm);
    }

    if (countryNorm === "US") {
      return await lookupUS(codeNorm);
    }

    return NOT_FOUND;
  } catch (err) {
    console.warn("[postalLookup] lookupPostal failed:", err);
    return NOT_FOUND;
  }
}
