export type MarketName =
  | "euronext"
  | "euronextParis"
  | "euronextAmsterdam"
  | "euronextBrussels"
  | "euronextLisbon"
  | "euronextDublin"
  | "italy"
  | "eurotlx"
  | "xetra"
  | "frankfurt"
  | "stuttgart"
  | "munich"
  | "berlin"
  | "dusseldorf"
  | "hamburg"
  | "hanover"
  | "bremen"
  | "madrid"
  | "london"
  | "aquisUk"
  | "cboeUk"
  | "cboeEurope"
  | "swiss"
  | "stockholm"
  | "copenhagen"
  | "helsinki"
  | "oslo"
  | "vienna"
  | "warsaw"
  | "athens"
  | "prague"
  | "budapest"
  | "iceland"
  | "riga"
  | "vilnius"
  | "tallinn"
  | "romania"
  | "bulgaria"
  | "croatia"
  | "us"
  | "usOtc"
  | "toronto"
  | "tsxventure"
  | "cse"
  | "neo"
  | "brasil"
  | "mexico"
  | "argentina"
  | "chile"
  | "peru"
  | "colombia"
  | "venezuela"
  | "uruguay"
  | "seoul"
  | "tokyo"
  | "hongkong"
  | "shanghai"
  | "shenzhen"
  | "beijing"
  | "taiwan"
  | "singapore"
  | "thailand"
  | "malaysia"
  | "indonesia"
  | "philippines"
  | "vietnam"
  | "australia"
  | "cboeAustralia"
  | "newzealand"
  | "india"
  | "southafrica"
  | "egypt"
  | "morocco"
  | "saudi"
  | "dubai"
  | "abuDhabi"
  | "qatar"
  | "kuwait"
  | "istanbul"
  | "israel"
  | "fallback";

export interface MarketSession {
  openTime: string;
  closeTime: string;
}

export interface MarketDayOverride {
  days: number[];
  sessions: MarketSession[];
}

export interface MarketCalendar {
  market: MarketName;
  timezone: string;
  city: string;
  sessions: MarketSession[];
  dayOverrides?: MarketDayOverride[];
}

/** Retourne les sessions actives pour un isoDate local, en tenant compte des dayOverrides. */
export function getSessionsForDate(calendar: Pick<MarketCalendar, "sessions" | "dayOverrides">, isoDate: string): MarketSession[] {
  if (!calendar.dayOverrides?.length) return calendar.sessions;
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon … 5=Fri, 6=Sat
  const override = calendar.dayOverrides.find((o) => o.days.includes(weekday));
  return override ? override.sessions : calendar.sessions;
}

export function getFirstOpenTime(sessions: MarketSession[]) {
  return sessions[0].openTime;
}

export function getFinalCloseTime(sessions: MarketSession[]) {
  return sessions[sessions.length - 1].closeTime;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function isInsideAnySession(localMinutes: number, sessions: MarketSession[]) {
  return sessions.some((session) => localMinutes >= toMinutes(session.openTime) && localMinutes <= toMinutes(session.closeTime));
}

export function isAfterFinalClose(localMinutes: number, sessions: MarketSession[]) {
  return localMinutes > toMinutes(getFinalCloseTime(sessions));
}

const defaultHours: MarketCalendar = {
  market: "fallback",
  timezone: "Europe/Paris",
  city: "Paris",
  sessions: [{ openTime: "09:00", closeTime: "17:30" }]
};

function market(
  market: MarketName,
  timezone: string,
  city: string,
  sessions: MarketSession[],
  dayOverrides?: MarketDayOverride[]
): MarketCalendar {
  return {
    market,
    timezone,
    city,
    sessions,
    ...(dayOverrides ? { dayOverrides } : {})
  };
}

function normalizeMarketInput(symbol?: string, exchange?: string) {
  return `${symbol ?? ""} ${exchange ?? ""}`.trim().toUpperCase();
}

function getYahooSuffix(symbol?: string): string | undefined {
  const raw = String(symbol ?? "").trim().toUpperCase();
  const match = raw.match(/\.([A-Z0-9]+)$/);
  return match?.[1];
}

function hasExchange(input: string, ...keywords: string[]) {
  return keywords.some((keyword) => input.includes(keyword.toUpperCase()));
}

function hasExactExchangeWord(input: string, ...keywords: string[]) {
  return keywords.some((keyword) => {
    const escaped = keyword.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(input);
  });
}

export function getMarketCalendar(symbol?: string, exchange?: string): MarketCalendar {
  const input = normalizeMarketInput(symbol, exchange);
  const suffix = getYahooSuffix(symbol);
  const rawSymbol = String(symbol ?? "").trim().toUpperCase();

  // ===== EUROPE / EURONEXT =====
  if (suffix === "PA" || hasExchange(input, "EURONEXT PARIS", "PARIS")) {
    return market("euronextParis", "Europe/Paris", "Paris", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "AS" || hasExchange(input, "EURONEXT AMSTERDAM", "AMSTERDAM")) {
    return market("euronextAmsterdam", "Europe/Amsterdam", "Amsterdam", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "BR" || hasExchange(input, "EURONEXT BRUSSELS", "BRUSSELS")) {
    return market("euronextBrussels", "Europe/Brussels", "Brussels", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "LS" || hasExchange(input, "EURONEXT LISBON", "LISBON")) {
    return market("euronextLisbon", "Europe/Lisbon", "Lisbon", [{ openTime: "08:00", closeTime: "16:30" }]);
  }

  if (suffix === "IR" || hasExchange(input, "EURONEXT DUBLIN", "DUBLIN", "IRISH STOCK EXCHANGE")) {
    return market("euronextDublin", "Europe/Dublin", "Dublin", [{ openTime: "08:00", closeTime: "16:30" }]);
  }

  if (suffix === "NX" || hasExactExchangeWord(input, "EURONEXT")) {
    return market("euronext", "Europe/Paris", "Paris", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  // ===== ITALY =====
  if (suffix === "MI" || hasExchange(input, "BORSA ITALIANA", "MILAN")) {
    return market("italy", "Europe/Rome", "Milan", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "TI" || hasExchange(input, "EUROTLX")) {
    return market("eurotlx", "Europe/Rome", "Milan", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  // ===== GERMANY =====
  if (suffix === "DE" || hasExchange(input, "XETRA")) {
    return market("xetra", "Europe/Berlin", "Frankfurt", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "F") return market("frankfurt", "Europe/Berlin", "Frankfurt", [{ openTime: "08:00", closeTime: "22:00" }]);
  if (suffix === "SG") return market("stuttgart", "Europe/Berlin", "Stuttgart", [{ openTime: "08:00", closeTime: "22:00" }]);
  if (suffix === "MU") return market("munich", "Europe/Berlin", "Munich", [{ openTime: "08:00", closeTime: "20:00" }]);
  if (suffix === "BE") return market("berlin", "Europe/Berlin", "Berlin", [{ openTime: "08:00", closeTime: "20:00" }]);
  if (suffix === "DU") return market("dusseldorf", "Europe/Berlin", "Dusseldorf", [{ openTime: "08:00", closeTime: "20:00" }]);
  if (suffix === "HM") return market("hamburg", "Europe/Berlin", "Hamburg", [{ openTime: "08:00", closeTime: "20:00" }]);
  if (suffix === "HA") return market("hanover", "Europe/Berlin", "Hanover", [{ openTime: "08:00", closeTime: "20:00" }]);
  if (suffix === "BM") return market("bremen", "Europe/Berlin", "Bremen", [{ openTime: "08:00", closeTime: "20:00" }]);

  // ===== SPAIN / UK / SWITZERLAND =====
  if (suffix === "MC" || hasExchange(input, "MADRID", "BME")) {
    return market("madrid", "Europe/Madrid", "Madrid", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (["L", "IL"].includes(suffix ?? "") || hasExchange(input, "LSE", "LONDON STOCK EXCHANGE", "LONDON")) {
    return market("london", "Europe/London", "London", [{ openTime: "08:00", closeTime: "16:30" }]);
  }

  if (suffix === "AQ" || hasExchange(input, "AQUIS", "AQUIS UK")) {
    return market("aquisUk", "Europe/London", "London", [{ openTime: "08:00", closeTime: "16:30" }]);
  }

  if (suffix === "XC" || hasExchange(input, "CBOE UK")) {
    return market("cboeUk", "Europe/London", "London", [{ openTime: "08:00", closeTime: "16:30" }]);
  }

  if (suffix === "XD" || hasExchange(input, "CBOE EUROPE", "CBOE EU")) {
    return market("cboeEurope", "Europe/Paris", "Paris", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  if (suffix === "SW" || hasExchange(input, "SIX", "SWISS")) {
    return market("swiss", "Europe/Zurich", "Zurich", [{ openTime: "09:00", closeTime: "17:30" }]);
  }

  // ===== NORDICS / CENTRAL EUROPE / BALTICS =====
  if (suffix === "ST") return market("stockholm", "Europe/Stockholm", "Stockholm", [{ openTime: "09:00", closeTime: "17:30" }]);
  if (suffix === "CO") return market("copenhagen", "Europe/Copenhagen", "Copenhagen", [{ openTime: "09:00", closeTime: "17:00" }]);
  if (suffix === "HE") return market("helsinki", "Europe/Helsinki", "Helsinki", [{ openTime: "10:00", closeTime: "18:30" }]);
  if (suffix === "OL") return market("oslo", "Europe/Oslo", "Oslo", [{ openTime: "09:00", closeTime: "16:30" }]);
  if (suffix === "VI") return market("vienna", "Europe/Vienna", "Vienna", [{ openTime: "09:00", closeTime: "17:30" }]);
  if (suffix === "WA") return market("warsaw", "Europe/Warsaw", "Warsaw", [{ openTime: "09:00", closeTime: "17:00" }]);
  if (suffix === "AT") return market("athens", "Europe/Athens", "Athens", [{ openTime: "10:15", closeTime: "17:20" }]);
  if (suffix === "PR") return market("prague", "Europe/Prague", "Prague", [{ openTime: "09:00", closeTime: "16:20" }]);
  if (suffix === "BD") return market("budapest", "Europe/Budapest", "Budapest", [{ openTime: "09:00", closeTime: "17:00" }]);
  if (suffix === "IC") return market("iceland", "Atlantic/Reykjavik", "Reykjavik", [{ openTime: "09:30", closeTime: "15:30" }]);
  if (suffix === "RG") return market("riga", "Europe/Riga", "Riga", [{ openTime: "10:00", closeTime: "16:00" }]);
  if (suffix === "VS") return market("vilnius", "Europe/Vilnius", "Vilnius", [{ openTime: "10:00", closeTime: "16:00" }]);
  if (suffix === "TL") return market("tallinn", "Europe/Tallinn", "Tallinn", [{ openTime: "10:00", closeTime: "16:00" }]);

  if (suffix === "RO" || hasExchange(input, "BUCHAREST", "BVB", "ROMANIA")) {
    return market("romania", "Europe/Bucharest", "Bucharest", [{ openTime: "10:00", closeTime: "18:00" }]);
  }

  if (suffix === "SO" || hasExchange(input, "SOFIA", "BULGARIA", "BULGARIAN STOCK EXCHANGE")) {
    return market("bulgaria", "Europe/Sofia", "Sofia", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "ZB" || hasExchange(input, "ZAGREB", "CROATIA", "ZAGREB STOCK EXCHANGE")) {
    return market("croatia", "Europe/Zagreb", "Zagreb", [{ openTime: "09:00", closeTime: "16:00" }]);
  }

  // ===== AMERICAS =====
  if (suffix === "V" || hasExchange(input, "TSXV", "TSX VENTURE")) {
    return market("tsxventure", "America/Toronto", "Toronto", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "TO" || hasExactExchangeWord(input, "TSX") || hasExchange(input, "TORONTO STOCK EXCHANGE")) {
    return market("toronto", "America/Toronto", "Toronto", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "CN" || hasExchange(input, "CSE", "CANADIAN SECURITIES EXCHANGE")) {
    return market("cse", "America/Toronto", "Toronto", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "NE" || hasExchange(input, "NEO", "CBOE CANADA")) {
    return market("neo", "America/Toronto", "Toronto", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "SA" || hasExchange(input, "B3", "SAO PAULO", "SÃO PAULO")) {
    return market("brasil", "America/Sao_Paulo", "Sao Paulo", [{ openTime: "10:00", closeTime: "17:00" }]);
  }

  if (suffix === "MX" || hasExchange(input, "BMV", "MEXICO")) {
    return market("mexico", "America/Mexico_City", "Mexico City", [{ openTime: "08:30", closeTime: "15:00" }]);
  }

  if (suffix === "BA" || hasExchange(input, "BYMA", "BUENOS AIRES", "ARGENTINA")) {
    return market("argentina", "America/Argentina/Buenos_Aires", "Buenos Aires", [{ openTime: "11:00", closeTime: "17:00" }]);
  }

  if (suffix === "SN" || hasExchange(input, "SANTIAGO", "CHILE")) {
    return market("chile", "America/Santiago", "Santiago", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "LIM" || hasExchange(input, "LIMA", "PERU")) {
    return market("peru", "America/Lima", "Lima", [{ openTime: "08:30", closeTime: "15:00" }]);
  }

  if (suffix === "CL" || hasExchange(input, "BVC", "COLOMBIA", "COLOMBIA STOCK EXCHANGE")) {
    return market("colombia", "America/Bogota", "Bogota", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (suffix === "CR" || hasExchange(input, "CARACAS", "VENEZUELA")) {
    return market("venezuela", "America/Caracas", "Caracas", [{ openTime: "09:30", closeTime: "13:00" }]);
  }

  if (suffix === "UY" || hasExchange(input, "URUGUAY", "MONTEVIDEO")) {
    return market("uruguay", "America/Montevideo", "Montevideo", [{ openTime: "11:00", closeTime: "17:00" }]);
  }

  // ===== ASIA =====
  if (["KS", "KQ"].includes(suffix ?? "") || hasExchange(input, "KRX", "KOSPI", "KOSDAQ")) {
    return market("seoul", "Asia/Seoul", "Seoul", [{ openTime: "09:00", closeTime: "15:30" }]);
  }

  if (suffix === "T" || hasExchange(input, "TOKYO", "JPX") || hasExactExchangeWord(input, "TSE")) {
    return market("tokyo", "Asia/Tokyo", "Tokyo", [
      { openTime: "09:00", closeTime: "11:30" },
      { openTime: "12:30", closeTime: "15:30" }
    ]);
  }

  if (suffix === "HK" || hasExchange(input, "HKEX", "HONG KONG")) {
    return market("hongkong", "Asia/Hong_Kong", "Hong Kong", [
      { openTime: "09:30", closeTime: "12:00" },
      { openTime: "13:00", closeTime: "16:00" }
    ]);
  }

  if (suffix === "SS" || hasExchange(input, "SSE", "SHANGHAI STOCK EXCHANGE", "SHANGHAI")) {
    return market("shanghai", "Asia/Shanghai", "Shanghai", [
      { openTime: "09:30", closeTime: "11:30" },
      { openTime: "13:00", closeTime: "15:00" }
    ]);
  }

  if (suffix === "SZ" || hasExchange(input, "SZSE", "SHENZHEN STOCK EXCHANGE", "SHENZHEN")) {
    return market("shenzhen", "Asia/Shanghai", "Shenzhen", [
      { openTime: "09:30", closeTime: "11:30" },
      { openTime: "13:00", closeTime: "15:00" }
    ]);
  }

  if (suffix === "BJ" || hasExchange(input, "BEIJING STOCK EXCHANGE", "BEIJING BSE")) {
    return market("beijing", "Asia/Shanghai", "Beijing", [
      { openTime: "09:30", closeTime: "11:30" },
      { openTime: "13:00", closeTime: "15:00" }
    ]);
  }

  if (suffix === "TWO" || suffix === "TW" || hasExchange(input, "TWSE", "TAIWAN")) {
    return market("taiwan", "Asia/Taipei", "Taipei", [{ openTime: "09:00", closeTime: "13:30" }]);
  }

  if (suffix === "SI" || hasExchange(input, "SGX", "SINGAPORE")) {
    return market("singapore", "Asia/Singapore", "Singapore", [
      { openTime: "09:00", closeTime: "12:00" },
      { openTime: "13:00", closeTime: "17:00" }
    ]);
  }

  if (suffix === "BK" || hasExchange(input, "THAILAND", "BANGKOK") || hasExactExchangeWord(input, "SET")) {
    return market("thailand", "Asia/Bangkok", "Bangkok", [
      { openTime: "10:00", closeTime: "12:30" },
      { openTime: "14:30", closeTime: "16:30" }
    ]);
  }

  if (suffix === "KL" || hasExchange(input, "BURSA MALAYSIA", "MALAYSIA")) {
    return market("malaysia", "Asia/Kuala_Lumpur", "Kuala Lumpur", [
      { openTime: "09:00", closeTime: "12:30" },
      { openTime: "14:30", closeTime: "16:45" }
    ]);
  }

  if (suffix === "JK" || hasExchange(input, "IDX", "INDONESIA", "JAKARTA")) {
    return market(
      "indonesia",
      "Asia/Jakarta",
      "Jakarta",
      [
        { openTime: "09:00", closeTime: "12:00" },
        { openTime: "13:30", closeTime: "15:50" }
      ],
      [
        {
          days: [5],
          sessions: [
            { openTime: "09:00", closeTime: "11:30" },
            { openTime: "14:00", closeTime: "15:50" }
          ]
        }
      ]
    );
  }

  if (suffix === "PS" || hasExchange(input, "PSE", "PHILIPPINES", "MANILA")) {
    return market("philippines", "Asia/Manila", "Manila", [{ openTime: "09:30", closeTime: "15:30" }]);
  }

  if (suffix === "VN" || hasExchange(input, "HOSE", "HNX", "VIETNAM")) {
    return market("vietnam", "Asia/Ho_Chi_Minh", "Ho Chi Minh", [
      { openTime: "09:00", closeTime: "11:30" },
      { openTime: "13:00", closeTime: "15:00" }
    ]);
  }

  // ===== INDIA =====
  if (["NS", "BO"].includes(suffix ?? "") || hasExchange(input, "NSE", "BSE", "INDIA")) {
    return market("india", "Asia/Kolkata", "Mumbai", [{ openTime: "09:15", closeTime: "15:30" }]);
  }

  // ===== MIDDLE EAST =====
  if (["SAU", "SR"].includes(suffix ?? "") || hasExchange(input, "SAU", "TADAWUL", "SAUDI", "SAUDI EXCHANGE")) {
    return market("saudi", "Asia/Riyadh", "Riyadh", [{ openTime: "10:00", closeTime: "15:00" }]);
  }

  if (suffix === "AE" || hasExchange(input, "DFM", "DUBAI FINANCIAL MARKET", "DUBAI")) {
    return market("dubai", "Asia/Dubai", "Dubai", [{ openTime: "10:00", closeTime: "14:45" }]);
  }

  if (["AD", "AB"].includes(suffix ?? "") || hasExchange(input, "ADX", "ABU DHABI")) {
    return market("abuDhabi", "Asia/Dubai", "Abu Dhabi", [{ openTime: "10:00", closeTime: "14:45" }]);
  }

  if (suffix === "QA" || hasExchange(input, "QATAR", "DOHA", "QSE")) {
    return market("qatar", "Asia/Qatar", "Doha", [{ openTime: "09:00", closeTime: "13:00" }]);
  }

  if (suffix === "KW" || hasExchange(input, "KUWAIT", "BOURSA KUWAIT")) {
    return market("kuwait", "Asia/Kuwait", "Kuwait City", [{ openTime: "09:00", closeTime: "12:40" }]);
  }

  if (suffix === "IS" || hasExchange(input, "BORSA ISTANBUL", "ISTANBUL", "BIST")) {
    return market("istanbul", "Europe/Istanbul", "Istanbul", [{ openTime: "10:00", closeTime: "18:00" }]);
  }

  if (suffix === "TA" || hasExchange(input, "TEL AVIV", "TASE")) {
    return market(
      "israel",
      "Asia/Jerusalem",
      "Tel Aviv",
      [{ openTime: "09:59", closeTime: "17:25" }],
      [{ days: [5], sessions: [{ openTime: "09:59", closeTime: "13:50" }] }]
    );
  }

  // ===== AFRICA =====
  if (suffix === "JO" || hasExchange(input, "JSE", "JOHANNESBURG")) {
    return market("southafrica", "Africa/Johannesburg", "Johannesburg", [{ openTime: "09:00", closeTime: "17:00" }]);
  }

  if (suffix === "CA" || suffix === "EG" || hasExchange(input, "EGX", "EGYPT", "CAIRO")) {
    return market("egypt", "Africa/Cairo", "Cairo", [{ openTime: "10:00", closeTime: "14:30" }]);
  }

  if (suffix === "CS" || hasExchange(input, "CASABLANCA", "MOROCCO")) {
    return market("morocco", "Africa/Casablanca", "Casablanca", [{ openTime: "09:00", closeTime: "15:30" }]);
  }

  // ===== OCEANIA =====
  if (suffix === "AX" || hasExchange(input, "ASX", "AUSTRALIAN SECURITIES EXCHANGE")) {
    return market("australia", "Australia/Sydney", "Sydney", [{ openTime: "10:00", closeTime: "16:00" }]);
  }

  if (suffix === "XA" || hasExchange(input, "CBOE AUSTRALIA", "CXA")) {
    return market("cboeAustralia", "Australia/Sydney", "Sydney", [{ openTime: "10:00", closeTime: "16:00" }]);
  }

  if (suffix === "NZ" || hasExchange(input, "NZX", "NEW ZEALAND")) {
    return market("newzealand", "Pacific/Auckland", "Wellington", [{ openTime: "10:00", closeTime: "16:45" }]);
  }

  // ===== USA =====
  if (["OB", "PK", "OTC"].includes(suffix ?? "") || hasExchange(input, "OTC", "OTCBB", "OTCMKTS", "PINK")) {
    return market("usOtc", "America/New_York", "New York", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  if (!rawSymbol.includes(".") || hasExchange(input, "NASDAQ", "NYSE", "AMEX", "NYSEARCA", "BATS", "CBOE")) {
    return market("us", "America/New_York", "New York", [{ openTime: "09:30", closeTime: "16:00" }]);
  }

  return defaultHours;
}
