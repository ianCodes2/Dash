/* Apply Kit — field vocabulary and matching rules. */
(() => {
  "use strict";
  if (window.ApplyKitRules) return;

  const SENSITIVE_KEYS = new Set([
    "dateOfBirth",
    "ssn",
    "gender",
    "raceEthnicity",
    "veteranStatus",
    "disabilityStatus",
    "desiredSalary",
    "currentSalary"
  ]);

  const SKIP_TYPES = new Set([
    "password",
    "search",
    "hidden",
    "file",
    "checkbox",
    "submit",
    "button",
    "reset",
    "image",
    "color",
    "range"
  ]);

  const SKIP_TEXT_RE = /\b(password|username|user name|search|captcha|one ?time|otp|verification code|security code|cvv|cvc|card number|credit card|routing number|account number|promo code|referral code|participant code)\b/i;
  const YES_NO_EXPLAIN_RE = /\b(explain|describe|details|if so|if yes|comments?|additional information)\b/i;

  const SIGNAL_WEIGHTS = {
    label: 100,
    aria: 100,
    placeholder: 70,
    name: 88,
    id: 76,
    title: 56,
    automation: 82,
    nearby: 42,
    section: 24
  };

  const AUTOCOMPLETE_MAP = {
    "given-name": "firstName",
    "additional-name": "middleName",
    "family-name": "lastName",
    name: "fullName",
    nickname: "preferredName",
    email: "email",
    tel: "phone",
    "tel-country-code": "phoneCountry",
    "street-address": "address1",
    "address-line1": "address1",
    "address-line2": "address2",
    "address-level2": "city",
    "address-level1": "state",
    "postal-code": "postalCode",
    country: "country",
    "country-name": "country",
    organization: "currentCompany",
    "organization-title": "currentTitle",
    url: "portfolio",
    bday: "dateOfBirth",
    sex: "gender"
  };

  const RULES = [
    {
      key: "firstName",
      terms: ["first name", "given name", "forename"],
      veto: /\b(last|family|surname|middle)\b/i
    },
    {
      key: "middleName",
      terms: ["middle name", "middle initial"]
    },
    {
      key: "lastName",
      terms: ["last name", "family name", "surname"],
      veto: /\b(first|given|middle)\b/i
    },
    {
      key: "fullName",
      terms: ["full name", "legal name", "your name"],
      exact: ["name"]
    },
    {
      key: "preferredName",
      terms: ["preferred name", "nickname", "goes by"]
    },
    {
      key: "pronouns",
      terms: ["preferred pronouns", "pronouns"]
    },
    {
      key: "email",
      terms: ["email address", "email", "e mail"],
      types: ["email"],
      priority: 4
    },
    {
      key: "phone",
      terms: ["phone number", "telephone", "mobile", "cell", "phone"],
      types: ["tel"],
      veto: /\b(country code|dialing code|extension|ext)\b/i
    },
    {
      key: "phoneCountry",
      terms: ["phone country code", "country code", "dialing code", "phone code"],
      priority: 14
    },
    {
      key: "address1",
      terms: ["address line 1", "address 1", "street address", "street", "address"],
      veto: /\b(email|e mail|web|url|ip)\b/i
    },
    {
      key: "address2",
      terms: ["address line 2", "address 2", "apartment", "apt", "suite", "unit"]
    },
    {
      key: "city",
      terms: ["city", "town", "municipality"]
    },
    {
      key: "state",
      terms: ["state province", "state", "province", "region"]
    },
    {
      key: "postalCode",
      terms: ["zip code", "postal code", "postcode", "zip"]
    },
    {
      key: "country",
      terms: ["country of residence", "country"],
      veto: /\b(code|phone|dial)\b/i
    },
    {
      key: "fullAddress",
      terms: ["full address", "complete address", "mailing address"],
      priority: 10
    },
    {
      key: "cityState",
      terms: ["city state", "city and state"],
      priority: 12
    },
    {
      key: "linkedin",
      terms: ["linkedin", "linked in"],
      priority: 8
    },
    {
      key: "github",
      terms: ["github", "git hub"],
      priority: 8
    },
    {
      key: "portfolio",
      terms: ["personal website", "portfolio", "website", "web site", "homepage", "url"]
    },
    {
      key: "currentCompany",
      terms: ["current company", "current employer", "employer", "company", "organization"],
      veto: /\b(previous|prior|past)\b/i
    },
    {
      key: "currentTitle",
      terms: ["current job title", "current title", "job title", "current position", "position", "occupation", "role", "title"],
      veto: /\b(previous|prior|past|applied|application|applying|desired|interested)\b/i
    },
    {
      key: "previousCompany",
      terms: ["previous company", "previous employer", "prior company", "past company", "previous organization"],
      requires: /\b(previous|prior|past)\b/i
    },
    {
      key: "previousTitle",
      terms: ["previous job title", "previous title", "prior title", "past title"],
      requires: /\b(previous|prior|past)\b/i
    },
    {
      key: "currentStartDate",
      terms: ["start date", "start"],
      veto: /\b(available|earliest|when can|graduation|previous|prior|past)\b/i
    },
    {
      key: "currentEndDate",
      terms: ["end date", "end"],
      veto: /\b(previous|prior|past)\b/i
    },
    {
      key: "previousStartDate",
      terms: ["start date", "start", "from"],
      requires: /\b(previous|prior|past)\b/i
    },
    {
      key: "previousEndDate",
      terms: ["end date", "end", "to"],
      requires: /\b(previous|prior|past)\b/i
    },
    {
      key: "currentStartDate",
      terms: ["from"],
      requires: /\b(work|employment|experience|job|position)\b/i
    },
    {
      key: "currentEndDate",
      terms: ["to"],
      requires: /\b(work|employment|experience|job|position)\b/i
    },
    {
      key: "currentLocation",
      terms: ["job location", "work location", "location", "city state"]
    },
    {
      key: "currentDescription",
      terms: ["role summary", "job description", "responsibilities", "description", "what you did"]
    },
    {
      key: "school",
      terms: ["school name", "university", "college", "institution", "school"]
    },
    {
      key: "degree",
      terms: ["highest degree", "education level", "degree type", "degree"]
    },
    {
      key: "major",
      terms: ["field of study", "area of study", "discipline", "major"]
    },
    {
      key: "graduationDate",
      terms: ["graduation date", "graduation year", "date graduated", "graduated"]
    },
    {
      key: "gpa",
      terms: ["grade point average", "gpa"]
    },
    {
      key: "workAuthorization",
      terms: ["authorized to work", "authorised to work", "legally authorized", "work authorization", "work authorisation", "eligible to work", "right to work"],
      kinds: ["select", "radio", "text"],
      veto: YES_NO_EXPLAIN_RE
    },
    {
      key: "requireSponsorship",
      terms: ["require sponsorship", "need sponsorship", "visa sponsorship", "sponsorship"],
      kinds: ["select", "radio", "text"],
      veto: YES_NO_EXPLAIN_RE
    },
    {
      key: "willingToRelocate",
      terms: ["willing to relocate", "relocate", "relocation"],
      kinds: ["select", "radio", "text"],
      veto: YES_NO_EXPLAIN_RE
    },
    {
      key: "availableStartDate",
      terms: ["available start date", "available to start", "when can you start", "earliest start", "start availability", "availability"]
    },
    {
      key: "noticePeriod",
      terms: ["notice period", "notice"]
    },
    {
      key: "summary",
      terms: ["professional summary", "about you", "summary", "bio"]
    },
    {
      key: "coverLetter",
      terms: ["cover letter", "covering letter"]
    },
    {
      key: "whyCompany",
      terms: ["why this company", "why do you want to work", "why are you interested", "why us"]
    },
    {
      key: "strengths",
      terms: ["strengths", "strength"]
    },
    {
      key: "weaknesses",
      terms: ["weaknesses", "weakness"]
    },
    {
      key: "dateOfBirth",
      terms: ["date of birth", "birth date", "birthdate", "birthday", "dob"],
      types: ["date"],
      priority: 10
    },
    {
      key: "ssn",
      terms: ["social security number", "social security", "ssn", "sin number"],
      priority: 10
    },
    {
      key: "gender",
      terms: ["gender", "sex"]
    },
    {
      key: "raceEthnicity",
      terms: ["race ethnicity", "race", "ethnicity"]
    },
    {
      key: "veteranStatus",
      terms: ["protected veteran", "veteran status", "veteran"]
    },
    {
      key: "disabilityStatus",
      terms: ["disability status", "disability", "disabled"]
    },
    {
      key: "desiredSalary",
      terms: ["desired salary", "expected salary", "salary expectation", "salary expectations", "salary requirement", "salary requirements", "desired compensation", "expected compensation", "compensation expectation", "compensation expectations", "expected pay", "desired pay", "pay expectation", "pay expectations"],
      exact: ["salary"],
      kinds: ["text", "select", "radio"],
      veto: /\b(current|present)\b/i
    },
    {
      key: "currentSalary",
      terms: ["current salary", "current compensation"],
      kinds: ["text", "select", "radio"]
    }
  ];

  const STATE_ALIASES = {
    al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
    co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
    hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
    ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
    ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
    mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
    nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
    ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
    sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont",
    va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
    dc: "district of columbia"
  };

  const COUNTRY_ALIASES = {
    us: ["united states", "united states of america", "usa", "u s a", "america"],
    uk: ["united kingdom", "great britain", "britain", "england", "scotland", "wales"],
    uae: ["united arab emirates", "u a e"],
    pr: ["puerto rico"],
    ca: ["canada"],
    mx: ["mexico"],
    in: ["india"],
    au: ["australia"],
    nz: ["new zealand"],
    de: ["germany"],
    fr: ["france"],
    es: ["spain"],
    ie: ["ireland"],
    nl: ["netherlands"],
    sg: ["singapore"],
    jp: ["japan"],
    kr: ["south korea", "republic of korea"],
    ph: ["philippines"],
    br: ["brazil"]
  };

  function simpleNormalize(value) {
    return String(value ?? "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAliases(value, key) {
    const normalized = simpleNormalize(value);
    const out = new Set([normalized]);
    if (!normalized) return [];

    if (key === "state") {
      for (const [abbr, name] of Object.entries(STATE_ALIASES)) {
        if (normalized === abbr || normalized === name) {
          out.add(abbr);
          out.add(name);
        }
      }
    }

    if (key === "country") {
      for (const [abbr, names] of Object.entries(COUNTRY_ALIASES)) {
        if (normalized === abbr || names.includes(normalized)) {
          out.add(abbr);
          for (const name of names) out.add(name);
        }
      }
    }

    return [...out].filter(Boolean);
  }

  window.ApplyKitRules = {
    SENSITIVE_KEYS,
    SKIP_TYPES,
    SKIP_TEXT_RE,
    YES_NO_EXPLAIN_RE,
    SIGNAL_WEIGHTS,
    AUTOCOMPLETE_MAP,
    RULES,
    STATE_ALIASES,
    COUNTRY_ALIASES,
    simpleNormalize,
    getAliases
  };
})();
