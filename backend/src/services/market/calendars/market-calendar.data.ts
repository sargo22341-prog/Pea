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

export type MarketCalendarRule = {
  market: MarketName;
  suffixes?: string[];
  exchangeKeywords?: string[];
  exactExchangeWords?: string[];
};

function sessions(openTime: string, closeTime: string): MarketSession[] {
  return [{ openTime, closeTime }];
}

function market(
  market: MarketName,
  timezone: string,
  city: string,
  marketSessions: MarketSession[],
  dayOverrides?: MarketDayOverride[]
): MarketCalendar {
  return { market, timezone, city, sessions: marketSessions, ...(dayOverrides ? { dayOverrides } : {}) };
}

export const marketCalendars: Record<MarketName, MarketCalendar> = {
  fallback: market("fallback", "Europe/Paris", "Paris", sessions("09:00", "17:30")),
  euronextParis: market("euronextParis", "Europe/Paris", "Paris", sessions("09:00", "17:30")),
  euronextAmsterdam: market("euronextAmsterdam", "Europe/Amsterdam", "Amsterdam", sessions("09:00", "17:30")),
  euronextBrussels: market("euronextBrussels", "Europe/Brussels", "Brussels", sessions("09:00", "17:30")),
  euronextLisbon: market("euronextLisbon", "Europe/Lisbon", "Lisbon", sessions("08:00", "16:30")),
  euronextDublin: market("euronextDublin", "Europe/Dublin", "Dublin", sessions("08:00", "16:30")),
  euronext: market("euronext", "Europe/Paris", "Paris", sessions("09:00", "17:30")),
  italy: market("italy", "Europe/Rome", "Milan", sessions("09:00", "17:30")),
  eurotlx: market("eurotlx", "Europe/Rome", "Milan", sessions("09:00", "17:30")),
  xetra: market("xetra", "Europe/Berlin", "Frankfurt", sessions("09:00", "17:30")),
  frankfurt: market("frankfurt", "Europe/Berlin", "Frankfurt", sessions("08:00", "22:00")),
  stuttgart: market("stuttgart", "Europe/Berlin", "Stuttgart", sessions("08:00", "22:00")),
  munich: market("munich", "Europe/Berlin", "Munich", sessions("08:00", "20:00")),
  berlin: market("berlin", "Europe/Berlin", "Berlin", sessions("08:00", "20:00")),
  dusseldorf: market("dusseldorf", "Europe/Berlin", "Dusseldorf", sessions("08:00", "20:00")),
  hamburg: market("hamburg", "Europe/Berlin", "Hamburg", sessions("08:00", "20:00")),
  hanover: market("hanover", "Europe/Berlin", "Hanover", sessions("08:00", "20:00")),
  bremen: market("bremen", "Europe/Berlin", "Bremen", sessions("08:00", "20:00")),
  madrid: market("madrid", "Europe/Madrid", "Madrid", sessions("09:00", "17:30")),
  london: market("london", "Europe/London", "London", sessions("08:00", "16:30")),
  aquisUk: market("aquisUk", "Europe/London", "London", sessions("08:00", "16:30")),
  cboeUk: market("cboeUk", "Europe/London", "London", sessions("08:00", "16:30")),
  cboeEurope: market("cboeEurope", "Europe/Paris", "Paris", sessions("09:00", "17:30")),
  swiss: market("swiss", "Europe/Zurich", "Zurich", sessions("09:00", "17:30")),
  stockholm: market("stockholm", "Europe/Stockholm", "Stockholm", sessions("09:00", "17:30")),
  copenhagen: market("copenhagen", "Europe/Copenhagen", "Copenhagen", sessions("09:00", "17:00")),
  helsinki: market("helsinki", "Europe/Helsinki", "Helsinki", sessions("10:00", "18:30")),
  oslo: market("oslo", "Europe/Oslo", "Oslo", sessions("09:00", "16:30")),
  vienna: market("vienna", "Europe/Vienna", "Vienna", sessions("09:00", "17:30")),
  warsaw: market("warsaw", "Europe/Warsaw", "Warsaw", sessions("09:00", "17:00")),
  athens: market("athens", "Europe/Athens", "Athens", sessions("10:15", "17:20")),
  prague: market("prague", "Europe/Prague", "Prague", sessions("09:00", "16:20")),
  budapest: market("budapest", "Europe/Budapest", "Budapest", sessions("09:00", "17:00")),
  iceland: market("iceland", "Atlantic/Reykjavik", "Reykjavik", sessions("09:30", "15:30")),
  riga: market("riga", "Europe/Riga", "Riga", sessions("10:00", "16:00")),
  vilnius: market("vilnius", "Europe/Vilnius", "Vilnius", sessions("10:00", "16:00")),
  tallinn: market("tallinn", "Europe/Tallinn", "Tallinn", sessions("10:00", "16:00")),
  romania: market("romania", "Europe/Bucharest", "Bucharest", sessions("10:00", "18:00")),
  bulgaria: market("bulgaria", "Europe/Sofia", "Sofia", sessions("09:30", "16:00")),
  croatia: market("croatia", "Europe/Zagreb", "Zagreb", sessions("09:00", "16:00")),
  tsxventure: market("tsxventure", "America/Toronto", "Toronto", sessions("09:30", "16:00")),
  toronto: market("toronto", "America/Toronto", "Toronto", sessions("09:30", "16:00")),
  cse: market("cse", "America/Toronto", "Toronto", sessions("09:30", "16:00")),
  neo: market("neo", "America/Toronto", "Toronto", sessions("09:30", "16:00")),
  brasil: market("brasil", "America/Sao_Paulo", "Sao Paulo", sessions("10:00", "17:00")),
  mexico: market("mexico", "America/Mexico_City", "Mexico City", sessions("08:30", "15:00")),
  argentina: market("argentina", "America/Argentina/Buenos_Aires", "Buenos Aires", sessions("11:00", "17:00")),
  chile: market("chile", "America/Santiago", "Santiago", sessions("09:30", "16:00")),
  peru: market("peru", "America/Lima", "Lima", sessions("08:30", "15:00")),
  colombia: market("colombia", "America/Bogota", "Bogota", sessions("09:30", "16:00")),
  venezuela: market("venezuela", "America/Caracas", "Caracas", sessions("09:30", "13:00")),
  uruguay: market("uruguay", "America/Montevideo", "Montevideo", sessions("11:00", "17:00")),
  seoul: market("seoul", "Asia/Seoul", "Seoul", sessions("09:00", "15:30")),
  tokyo: market("tokyo", "Asia/Tokyo", "Tokyo", [sessions("09:00", "11:30")[0], sessions("12:30", "15:30")[0]]),
  hongkong: market("hongkong", "Asia/Hong_Kong", "Hong Kong", [sessions("09:30", "12:00")[0], sessions("13:00", "16:00")[0]]),
  shanghai: market("shanghai", "Asia/Shanghai", "Shanghai", [sessions("09:30", "11:30")[0], sessions("13:00", "15:00")[0]]),
  shenzhen: market("shenzhen", "Asia/Shanghai", "Shenzhen", [sessions("09:30", "11:30")[0], sessions("13:00", "15:00")[0]]),
  beijing: market("beijing", "Asia/Shanghai", "Beijing", [sessions("09:30", "11:30")[0], sessions("13:00", "15:00")[0]]),
  taiwan: market("taiwan", "Asia/Taipei", "Taipei", sessions("09:00", "13:30")),
  singapore: market("singapore", "Asia/Singapore", "Singapore", [sessions("09:00", "12:00")[0], sessions("13:00", "17:00")[0]]),
  thailand: market("thailand", "Asia/Bangkok", "Bangkok", [sessions("10:00", "12:30")[0], sessions("14:30", "16:30")[0]]),
  malaysia: market("malaysia", "Asia/Kuala_Lumpur", "Kuala Lumpur", [sessions("09:00", "12:30")[0], sessions("14:30", "16:45")[0]]),
  indonesia: market(
    "indonesia",
    "Asia/Jakarta",
    "Jakarta",
    [sessions("09:00", "12:00")[0], sessions("13:30", "15:50")[0]],
    [{ days: [5], sessions: [sessions("09:00", "11:30")[0], sessions("14:00", "15:50")[0]] }]
  ),
  philippines: market("philippines", "Asia/Manila", "Manila", sessions("09:30", "15:30")),
  vietnam: market("vietnam", "Asia/Ho_Chi_Minh", "Ho Chi Minh", [sessions("09:00", "11:30")[0], sessions("13:00", "15:00")[0]]),
  india: market("india", "Asia/Kolkata", "Mumbai", sessions("09:15", "15:30")),
  saudi: market("saudi", "Asia/Riyadh", "Riyadh", sessions("10:00", "15:00")),
  dubai: market("dubai", "Asia/Dubai", "Dubai", sessions("10:00", "14:45")),
  abuDhabi: market("abuDhabi", "Asia/Dubai", "Abu Dhabi", sessions("10:00", "14:45")),
  qatar: market("qatar", "Asia/Qatar", "Doha", sessions("09:00", "13:00")),
  kuwait: market("kuwait", "Asia/Kuwait", "Kuwait City", sessions("09:00", "12:40")),
  istanbul: market("istanbul", "Europe/Istanbul", "Istanbul", sessions("10:00", "18:00")),
  israel: market("israel", "Asia/Jerusalem", "Tel Aviv", sessions("09:59", "17:25"), [{ days: [5], sessions: sessions("09:59", "13:50") }]),
  southafrica: market("southafrica", "Africa/Johannesburg", "Johannesburg", sessions("09:00", "17:00")),
  egypt: market("egypt", "Africa/Cairo", "Cairo", sessions("10:00", "14:30")),
  morocco: market("morocco", "Africa/Casablanca", "Casablanca", sessions("09:00", "15:30")),
  australia: market("australia", "Australia/Sydney", "Sydney", sessions("10:00", "16:00")),
  cboeAustralia: market("cboeAustralia", "Australia/Sydney", "Sydney", sessions("10:00", "16:00")),
  newzealand: market("newzealand", "Pacific/Auckland", "Wellington", sessions("10:00", "16:45")),
  usOtc: market("usOtc", "America/New_York", "New York", sessions("09:30", "16:00")),
  us: market("us", "America/New_York", "New York", sessions("09:30", "16:00"))
};

export const marketCalendarRules: MarketCalendarRule[] = [
  { market: "euronextParis", suffixes: ["PA"], exchangeKeywords: ["EURONEXT PARIS", "PARIS"] },
  { market: "euronextAmsterdam", suffixes: ["AS"], exchangeKeywords: ["EURONEXT AMSTERDAM", "AMSTERDAM"] },
  { market: "euronextBrussels", suffixes: ["BR"], exchangeKeywords: ["EURONEXT BRUSSELS", "BRUSSELS"] },
  { market: "euronextLisbon", suffixes: ["LS"], exchangeKeywords: ["EURONEXT LISBON", "LISBON"] },
  { market: "euronextDublin", suffixes: ["IR"], exchangeKeywords: ["EURONEXT DUBLIN", "DUBLIN", "IRISH STOCK EXCHANGE"] },
  { market: "euronext", suffixes: ["NX"], exactExchangeWords: ["EURONEXT"] },
  { market: "italy", suffixes: ["MI"], exchangeKeywords: ["BORSA ITALIANA", "MILAN"] },
  { market: "eurotlx", suffixes: ["TI"], exchangeKeywords: ["EUROTLX"] },
  { market: "xetra", suffixes: ["DE"], exchangeKeywords: ["XETRA"] },
  { market: "frankfurt", suffixes: ["F"] },
  { market: "stuttgart", suffixes: ["SG"] },
  { market: "munich", suffixes: ["MU"] },
  { market: "berlin", suffixes: ["BE"] },
  { market: "dusseldorf", suffixes: ["DU"] },
  { market: "hamburg", suffixes: ["HM"] },
  { market: "hanover", suffixes: ["HA"] },
  { market: "bremen", suffixes: ["BM"] },
  { market: "madrid", suffixes: ["MC"], exchangeKeywords: ["MADRID", "BME"] },
  { market: "london", suffixes: ["L", "IL"], exchangeKeywords: ["LSE", "LONDON STOCK EXCHANGE", "LONDON"] },
  { market: "aquisUk", suffixes: ["AQ"], exchangeKeywords: ["AQUIS", "AQUIS UK"] },
  { market: "cboeUk", suffixes: ["XC"], exchangeKeywords: ["CBOE UK"] },
  { market: "cboeEurope", suffixes: ["XD"], exchangeKeywords: ["CBOE EUROPE", "CBOE EU"] },
  { market: "swiss", suffixes: ["SW"], exchangeKeywords: ["SIX", "SWISS"] },
  { market: "stockholm", suffixes: ["ST"] },
  { market: "copenhagen", suffixes: ["CO"] },
  { market: "helsinki", suffixes: ["HE"] },
  { market: "oslo", suffixes: ["OL"] },
  { market: "vienna", suffixes: ["VI"] },
  { market: "warsaw", suffixes: ["WA"] },
  { market: "athens", suffixes: ["AT"] },
  { market: "prague", suffixes: ["PR"] },
  { market: "budapest", suffixes: ["BD"] },
  { market: "iceland", suffixes: ["IC"] },
  { market: "riga", suffixes: ["RG"] },
  { market: "vilnius", suffixes: ["VS"] },
  { market: "tallinn", suffixes: ["TL"] },
  { market: "romania", suffixes: ["RO"], exchangeKeywords: ["BUCHAREST", "BVB", "ROMANIA"] },
  { market: "bulgaria", suffixes: ["SO"], exchangeKeywords: ["SOFIA", "BULGARIA", "BULGARIAN STOCK EXCHANGE"] },
  { market: "croatia", suffixes: ["ZB"], exchangeKeywords: ["ZAGREB", "CROATIA", "ZAGREB STOCK EXCHANGE"] },
  { market: "tsxventure", suffixes: ["V"], exchangeKeywords: ["TSXV", "TSX VENTURE"] },
  { market: "toronto", suffixes: ["TO"], exchangeKeywords: ["TORONTO STOCK EXCHANGE"], exactExchangeWords: ["TSX"] },
  { market: "cse", suffixes: ["CN"], exchangeKeywords: ["CSE", "CANADIAN SECURITIES EXCHANGE"] },
  { market: "neo", suffixes: ["NE"], exchangeKeywords: ["NEO", "CBOE CANADA"] },
  { market: "brasil", suffixes: ["SA"], exchangeKeywords: ["B3", "SAO PAULO", "SÃƒO PAULO"] },
  { market: "mexico", suffixes: ["MX"], exchangeKeywords: ["BMV", "MEXICO"] },
  { market: "argentina", suffixes: ["BA"], exchangeKeywords: ["BYMA", "BUENOS AIRES", "ARGENTINA"] },
  { market: "chile", suffixes: ["SN"], exchangeKeywords: ["SANTIAGO", "CHILE"] },
  { market: "peru", suffixes: ["LIM"], exchangeKeywords: ["LIMA", "PERU"] },
  { market: "colombia", suffixes: ["CL"], exchangeKeywords: ["BVC", "COLOMBIA", "COLOMBIA STOCK EXCHANGE"] },
  { market: "venezuela", suffixes: ["CR"], exchangeKeywords: ["CARACAS", "VENEZUELA"] },
  { market: "uruguay", suffixes: ["UY"], exchangeKeywords: ["URUGUAY", "MONTEVIDEO"] },
  { market: "seoul", suffixes: ["KS", "KQ"], exchangeKeywords: ["KRX", "KOSPI", "KOSDAQ"] },
  { market: "tokyo", suffixes: ["T"], exchangeKeywords: ["TOKYO", "JPX"], exactExchangeWords: ["TSE"] },
  { market: "hongkong", suffixes: ["HK"], exchangeKeywords: ["HKEX", "HONG KONG"] },
  { market: "shanghai", suffixes: ["SS"], exchangeKeywords: ["SSE", "SHANGHAI STOCK EXCHANGE", "SHANGHAI"] },
  { market: "shenzhen", suffixes: ["SZ"], exchangeKeywords: ["SZSE", "SHENZHEN STOCK EXCHANGE", "SHENZHEN"] },
  { market: "beijing", suffixes: ["BJ"], exchangeKeywords: ["BEIJING STOCK EXCHANGE", "BEIJING BSE"] },
  { market: "taiwan", suffixes: ["TWO", "TW"], exchangeKeywords: ["TWSE", "TAIWAN"] },
  { market: "singapore", suffixes: ["SI"], exchangeKeywords: ["SGX", "SINGAPORE"] },
  { market: "thailand", suffixes: ["BK"], exchangeKeywords: ["THAILAND", "BANGKOK"], exactExchangeWords: ["SET"] },
  { market: "malaysia", suffixes: ["KL"], exchangeKeywords: ["BURSA MALAYSIA", "MALAYSIA"] },
  { market: "indonesia", suffixes: ["JK"], exchangeKeywords: ["IDX", "INDONESIA", "JAKARTA"] },
  { market: "philippines", suffixes: ["PS"], exchangeKeywords: ["PSE", "PHILIPPINES", "MANILA"] },
  { market: "vietnam", suffixes: ["VN"], exchangeKeywords: ["HOSE", "HNX", "VIETNAM"] },
  { market: "india", suffixes: ["NS", "BO"], exchangeKeywords: ["NSE", "BSE", "INDIA"] },
  { market: "saudi", suffixes: ["SAU", "SR"], exchangeKeywords: ["SAU", "TADAWUL", "SAUDI", "SAUDI EXCHANGE"] },
  { market: "dubai", suffixes: ["AE"], exchangeKeywords: ["DFM", "DUBAI FINANCIAL MARKET", "DUBAI"] },
  { market: "abuDhabi", suffixes: ["AD", "AB"], exchangeKeywords: ["ADX", "ABU DHABI"] },
  { market: "qatar", suffixes: ["QA"], exchangeKeywords: ["QATAR", "DOHA", "QSE"] },
  { market: "kuwait", suffixes: ["KW"], exchangeKeywords: ["KUWAIT", "BOURSA KUWAIT"] },
  { market: "istanbul", suffixes: ["IS"], exchangeKeywords: ["BORSA ISTANBUL", "ISTANBUL", "BIST"] },
  { market: "israel", suffixes: ["TA"], exchangeKeywords: ["TEL AVIV", "TASE"] },
  { market: "southafrica", suffixes: ["JO"], exchangeKeywords: ["JSE", "JOHANNESBURG"] },
  { market: "egypt", suffixes: ["CA", "EG"], exchangeKeywords: ["EGX", "EGYPT", "CAIRO"] },
  { market: "morocco", suffixes: ["CS"], exchangeKeywords: ["CASABLANCA", "MOROCCO"] },
  { market: "australia", suffixes: ["AX"], exchangeKeywords: ["ASX", "AUSTRALIAN SECURITIES EXCHANGE"] },
  { market: "cboeAustralia", suffixes: ["XA"], exchangeKeywords: ["CBOE AUSTRALIA", "CXA"] },
  { market: "newzealand", suffixes: ["NZ"], exchangeKeywords: ["NZX", "NEW ZEALAND"] },
  { market: "usOtc", suffixes: ["OB", "PK", "OTC"], exchangeKeywords: ["OTC", "OTCBB", "OTCMKTS", "PINK"] }
];

export const usExchangeKeywords = ["NASDAQ", "NYSE", "AMEX", "NYSEARCA", "BATS", "CBOE"];
