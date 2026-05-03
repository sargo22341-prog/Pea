

const defaultHours = {
  timezone: "Europe/Paris",
  city: "Paris",
  openTime: "09:00",
  closeTime: "17:30"
};

export interface MarketCalendar {
  market: "euronext" | "italy" | "xetra" | "madrid" | "london" | "swiss" | "stockholm" | "us" | "toronto" | "seoul" | "tokyo" | "hongkong" | "shanghai" | "shenzhen" | "singapore" | "australia" | "india" | "fallback";
  timezone: string;
  city: string;
  openTime: string;
  closeTime: string;
}


function normalizeMarketInput(symbol?: string, exchange?: string) {
  return `${symbol ?? ""} ${exchange ?? ""}`.toUpperCase();
}

export function getMarketCalendar(symbol?: string, exchange?: string): MarketCalendar {
  const input = normalizeMarketInput(symbol, exchange);
  const rawSymbol = String(symbol ?? "").toUpperCase();

  if (
    input.includes(".PA") ||
    input.includes(".AS") ||
    input.includes(".BR") ||
    input.includes(".LS") ||
    input.includes("EURONEXT") ||
    input.includes("PARIS") ||
    input.includes("AMSTERDAM") ||
    input.includes("BRUSSELS") ||
    input.includes("LISBON")
  ) {
    const timezone = input.includes(".AS") || input.includes("AMSTERDAM")
      ? "Europe/Amsterdam"
      : input.includes(".BR") || input.includes("BRUSSELS")
        ? "Europe/Brussels"
        : input.includes(".LS") || input.includes("LISBON")
          ? "Europe/Lisbon"
          : "Europe/Paris";

    const city = timezone === "Europe/Amsterdam"
      ? "Amsterdam"
      : timezone === "Europe/Brussels"
        ? "Brussels"
        : timezone === "Europe/Lisbon"
          ? "Lisbon"
          : "Paris";

    return {
      market: "euronext",
      timezone,
      city,
      openTime: timezone === "Europe/Lisbon" ? "08:00" : "09:00",
      closeTime: timezone === "Europe/Lisbon" ? "16:30" : "17:30"
    };
  }

  if (input.includes(".MI") || input.includes("MILAN") || input.includes("ITALIANA")) {
    return { market: "italy", timezone: "Europe/Rome", city: "Milan", openTime: "09:00", closeTime: "17:30" };
  }

  if (input.includes(".DE") || input.includes("XETRA") || input.includes("FRANKFURT")) {
    return { market: "xetra", timezone: "Europe/Berlin", city: "Frankfurt", openTime: "09:00", closeTime: "17:30" };
  }

  if (input.includes(".MC") || input.includes("MADRID")) {
    return { market: "madrid", timezone: "Europe/Madrid", city: "Madrid", openTime: "09:00", closeTime: "17:30" };
  }

  if (input.includes(".L") || input.includes("LONDON")) {
    return { market: "london", timezone: "Europe/London", city: "London", openTime: "08:00", closeTime: "16:30" };
  }

  if (input.includes(".SW") || input.includes("SWISS") || input.includes("SIX") || input.includes("ZURICH")) {
    return { market: "swiss", timezone: "Europe/Zurich", city: "Zurich", openTime: "09:00", closeTime: "17:30" };
  }

  if (input.includes(".ST") || input.includes("STOCKHOLM")) {
    return { market: "stockholm", timezone: "Europe/Stockholm", city: "Stockholm", openTime: "09:00", closeTime: "17:30" };
  }

  if (input.includes(".TO") || input.includes("TORONTO")) {
    return { market: "toronto", timezone: "America/Toronto", city: "Toronto", openTime: "09:30", closeTime: "16:00" };
  }

  if (
    input.includes(".KS") ||
    input.includes(".KQ") ||
    input.includes("KSC") ||
    input.includes("KOE") ||
    input.includes("KRX") ||
    input.includes("KOSPI") ||
    input.includes("KOSDAQ") ||
    input.includes("SEOUL")
  ) {
    return { market: "seoul", timezone: "Asia/Seoul", city: "Seoul", openTime: "09:00", closeTime: "15:30" };
  }

  if (
    input.includes(".T") ||
    input.includes("TYO") ||
    input.includes("JPX") ||
    input.includes("TOKYO") ||
    input.includes("JAPAN")
  ) {
    return { market: "tokyo", timezone: "Asia/Tokyo", city: "Tokyo", openTime: "09:00", closeTime: "15:00" };
  }

  if (
    input.includes(".HK") ||
    input.includes("HKG") ||
    input.includes("HKEX") ||
    input.includes("HONG KONG")
  ) {
    return { market: "hongkong", timezone: "Asia/Hong_Kong", city: "Hong Kong", openTime: "09:30", closeTime: "16:00" };
  }

  if (
    input.includes(".SS") ||
    input.includes("SHH") ||
    input.includes("SSE") ||
    input.includes("SHANGHAI")
  ) {
    return { market: "shanghai", timezone: "Asia/Shanghai", city: "Shanghai", openTime: "09:30", closeTime: "15:00" };
  }

  if (
    input.includes(".SZ") ||
    input.includes("SHENZHEN")
  ) {
    return { market: "shenzhen", timezone: "Asia/Shanghai", city: "Shenzhen", openTime: "09:30", closeTime: "15:00" };
  }

  if (
    input.includes(".SI") ||
    input.includes("SES") ||
    input.includes("SGX") ||
    input.includes("SINGAPORE")
  ) {
    return { market: "singapore", timezone: "Asia/Singapore", city: "Singapore", openTime: "09:00", closeTime: "17:00" };
  }

  if (
    input.includes(".AX") ||
    input.includes("ASX") ||
    input.includes("AUSTRALIA") ||
    input.includes("SYDNEY")
  ) {
    return { market: "australia", timezone: "Australia/Sydney", city: "Sydney", openTime: "10:00", closeTime: "16:00" };
  }

  if (
    input.includes(".NS") ||
    input.includes(".BO") ||
    input.includes("NSE") ||
    input.includes("BSE") ||
    input.includes("INDIA") ||
    input.includes("MUMBAI")
  ) {
    return { market: "india", timezone: "Asia/Kolkata", city: "Mumbai", openTime: "09:15", closeTime: "15:30" };
  }

  if (
    !rawSymbol.includes(".") ||
    input.includes("NASDAQ") ||
    input.includes("NYSE") ||
    input.includes("AMEX") ||
    input.includes("NEW YORK") ||
    input.includes("NMS") ||
    input.includes("NYQ") ||
    input.includes("ASE")
  ) {
    return { market: "us", timezone: "America/New_York", city: "New York", openTime: "09:30", closeTime: "16:00" };
  }

  return { market: "fallback", ...defaultHours };
}