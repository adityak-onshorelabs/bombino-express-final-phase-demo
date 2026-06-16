import { useCallback, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type LookupStatus = "idle" | "loading" | "ok" | "none" | "needsCountry";

interface PostalLookupResponse {
  found: boolean;
  city: string;
  state: string;
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

function normalizeCodeForCountry(country: string, code: string): string | null {
  if (country === "IN") {
    const trimmed = code.trim();
    return /^\d{6}$/.test(trimmed) ? trimmed : null;
  }
  if (country === "US") {
    return normalizeUSZip(code);
  }
  const trimmed = code.trim();
  return trimmed.length >= 3 ? trimmed : null;
}

export function usePincodeLookup(): {
  status: LookupStatus;
  hint: string | undefined;
  lookup: (
    code: string,
    country: string,
    onFill: (result: { city: string; state: string }) => void
  ) => Promise<void>;
} {
  const [status, setStatus] = useState<LookupStatus>("idle");
  const lastLookupKeyRef = useRef<string | null>(null);

  const hint = useMemo((): string | undefined => {
    switch (status) {
      case "loading":
        return "Looking up city…";
      case "ok":
        return "City and State auto-filled — edit if needed.";
      case "none":
        return "No match found — enter city manually.";
      case "needsCountry":
        return "Select a country to auto-fill.";
      default:
        return undefined;
    }
  }, [status]);

  const lookup = useCallback(
    async (
      code: string,
      country: string,
      onFill: (result: { city: string; state: string }) => void
    ): Promise<void> => {
      if (!country?.trim()) {
        setStatus("needsCountry");
        return;
      }

      const countryNorm = country.trim().toUpperCase();
      const normalized = normalizeCodeForCountry(countryNorm, code);

      if (!normalized) {
        setStatus("idle");
        return;
      }

      const lookupKey = `${countryNorm}:${normalized}`;
      if (lookupKey === lastLookupKeyRef.current) {
        return;
      }

      setStatus("loading");

      try {
        const res = await apiRequest(
          "GET",
          `/api/postal-lookup?country=${encodeURIComponent(countryNorm)}&code=${encodeURIComponent(normalized)}`
        );
        const data = (await res.json()) as PostalLookupResponse;

        if (data.found) {
          onFill({ city: data.city, state: data.state });
          lastLookupKeyRef.current = lookupKey;
          setStatus("ok");
        } else {
          setStatus("none");
        }
      } catch {
        setStatus("none");
      }
    },
    []
  );

  return { status, hint, lookup };
}
