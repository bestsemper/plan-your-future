// HSS (Humanities and Social Sciences) requirement validation for engineering majors
const HSS_ALLOWED_MNEMONICS = new Set([
  'AAS', 'CZ', 'FREN', 'JPTR', 'POTR', 'SPAN',
  'AMEL', 'EAST', 'FRTR', 'KOR', 'PSYC', 'SPTR',
  'AMST', 'ECON', 'GDS', 'LATI', 'RELA', 'SRBC',
  'AMTR', 'EDLF', 'GERM', 'LING', 'RELB', 'STS',
  'ANTH', 'ENAM', 'GETR', 'LNGS', 'RELC', 'SWAG',
  'ARH', 'ENCR', 'GREE', 'MDST', 'RELG', 'SWAH',
  'ARAB', 'ENCW', 'HEBR', 'MEST', 'RELH', 'SWED',
  'ARTH', 'ENEC', 'HIAF', 'PETR', 'RELI', 'TBTN',
  'ARTR', 'ENLS', 'HIEA', 'PERS', 'RELJ', 'TURK',
  'ASL', 'ENGN', 'HIEU', 'PHIL', 'RELS', 'UKR',
  'BULG', 'ENLS', 'HILA', 'PLAD', 'RUSS', 'URDU',
  'CCFA', 'ENLT', 'HIME', 'PLAP', 'RUTR', 'WGS',
  'CCIA', 'ENMC', 'HIND', 'PLCP', 'SANS', 'YIDD',
  'CCLT', 'ENMD', 'HISA', 'PLIR', 'SATR',
  'CCSS', 'ENNC', 'HIST', 'PLPT', 'SCAN',
  'CHIN', 'ENRN', 'HIUS', 'POL', 'SLAV',
  'CHTR', 'ENSP', 'ITAL', 'PORT', 'SLFK',
  'CLAS', 'ENWR', 'ITTR', 'SOC', 'SLTR',
  'CPLT', 'ETP', 'JAPN', 'PSYC',
  'COMM', 'ARCH', 'DISC', 'DRST', 'ECON',
]);

// Courses from specific departments that do NOT count toward HSS
const HSS_BLACKLISTED_COURSES = new Set([
  'ANTH 1090', 'ANTH 3810', 'ANTH 3820', 'ANTH 4991', 'ANTH 4993', 'ANTH 4998', 'ANTH 4999', 'ANTH 5080', 'ANTH 5800', 'ANTH 5870', 'ANTH 5880', 'ANTH 5989',
  'ECON 3710', 'ECON 3720', 'ECON 4010', 'ECON 4350', 'ECON 4710', 'ECON 5090', 'ECON 5100',
  'ENSP 1600',
  'GDS 1100', 'GDS 4951', 'GDS 4952',
  'MDST 3702',
  'PSYC 2005', 'PSYC 2200', 'PSYC 2210', 'PSYC 2220', 'PSYC 3005', 'PSYC 3006', 'PSYC 3210', 'PSYC 3310', 'PSYC 3870', 'PSYC 3590', 'PSYC 4111', 'PSYC 4125', 'PSYC 4200', 'PSYC 4290', 'PSYC 4330', 'PSYC 4500', 'PSYC 4910', 'PSYC 4970', 'PSYC 4930', 'PSYC 4940', 'PSYC 4980', 'PSYC 5200', 'PSYC 5210', 'PSYC 5260', 'PSYC 5330', 'PSYC 5350', 'PSYC 5401',
  'SOC 4800', 'SOC 4810', 'SOC 4820', 'SOC 4970', 'SOC 5100', 'SOC 5110', 'SOC 5120', 'SOC 5595', 'SOC 5596',
  'STS 1800', 'STS 4110', 'STS 4810',
]);

export function isHSSCourse(courseCode: string): boolean {
  const normalized = courseCode.toUpperCase().replace(/\s+/g, ' ').trim();
  
  // Check if it's blacklisted
  if (HSS_BLACKLISTED_COURSES.has(normalized)) {
    return false;
  }
  
  // Check if the subject/mnemonic is in the allowed list
  const match = normalized.match(/^([A-Z]{2,6})\s*(\d{4})/);
  if (!match) {
    return false;
  }
  
  const mnemonic = match[1].toUpperCase();
  return HSS_ALLOWED_MNEMONICS.has(mnemonic);
}
