/**
 * Company Validation Service
 * Server-side validators for Indian compliance identifiers.
 * Resolution 4: includes GST_STATE_CODES map and getStateFromGSTIN() helper.
 */

// Full 38-entry GST state code map (01–38 as defined by GST Council)
const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/**
 * Validate GSTIN format.
 * Pattern: 2 digits (state) + 5 uppercase letters + 4 digits + 1 uppercase + 1 digit + 1 uppercase + 1 digit
 * @param {string} gstin
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGSTIN(gstin) {
  if (!gstin) return { valid: false, error: 'GSTIN is required' };
  const g = gstin.trim().toUpperCase();
  const pattern = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/;
  if (!pattern.test(g)) {
    return { valid: false, error: 'Invalid GSTIN format. Expected: 29ABCDE1234F1Z5' };
  }
  const stateCode = g.substring(0, 2);
  if (!GST_STATE_CODES[stateCode]) {
    return { valid: false, error: `Unknown state code ${stateCode} in GSTIN` };
  }
  return { valid: true };
}

/**
 * Validate PAN format.
 * Pattern: 5 uppercase letters + 4 digits + 1 uppercase letter
 * @param {string} pan
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePAN(pan) {
  if (!pan) return { valid: false, error: 'PAN is required' };
  const p = pan.trim().toUpperCase();
  const pattern = /^[A-Z]{5}\d{4}[A-Z]$/;
  if (!pattern.test(p)) {
    return { valid: false, error: 'Invalid PAN format. Expected: ABCDE1234F' };
  }
  return { valid: true };
}

/**
 * Cross-validate: PAN embedded in GSTIN (chars 2-11, 0-indexed) must match company PAN.
 * @param {string} gstin
 * @param {string} pan
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGSTINMatchesPAN(gstin, pan) {
  if (!gstin || !pan) return { valid: true }; // Skip if either is missing
  const g = gstin.trim().toUpperCase();
  const p = pan.trim().toUpperCase();
  const embeddedPAN = g.substring(2, 12); // chars 2–11 are the PAN
  if (embeddedPAN !== p) {
    return {
      valid: false,
      error: `GSTIN mismatch: embedded PAN (${embeddedPAN}) does not match company PAN (${p})`
    };
  }
  return { valid: true };
}

/**
 * Validate TAN format.
 * Pattern: 4 uppercase letters + 5 digits + 1 uppercase letter
 * @param {string} tan
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTAN(tan) {
  if (!tan) return { valid: false, error: 'TAN is required' };
  const t = tan.trim().toUpperCase();
  const pattern = /^[A-Z]{4}\d{5}[A-Z]$/;
  if (!pattern.test(t)) {
    return { valid: false, error: 'Invalid TAN format. Expected: ABCD12345E' };
  }
  return { valid: true };
}

/**
 * Validate FSSAI License Number — must be exactly 14 digits.
 * @param {string} fssai
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFSSAI(fssai) {
  if (!fssai) return { valid: false, error: 'FSSAI number is required' };
  const f = fssai.trim().replace(/\s/g, '');
  if (!/^\d{14}$/.test(f)) {
    return { valid: false, error: 'FSSAI must be exactly 14 digits' };
  }
  return { valid: true };
}

/**
 * Validate UDYAM registration number.
 * Pattern: UDYAM-[2 uppercase letters]-[2 digits]-[7 digits]
 * Example: UDYAM-KA-01-0012345
 * @param {string} udyam
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUDYAM(udyam) {
  if (!udyam) return { valid: false, error: 'UDYAM number is required' };
  const u = udyam.trim().toUpperCase();
  const pattern = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
  if (!pattern.test(u)) {
    return { valid: false, error: 'Invalid UDYAM format. Expected: UDYAM-KA-01-0012345' };
  }
  return { valid: true };
}

/**
 * Validate CIN (Company Identification Number).
 * Pattern: [L/U][5 digits][2 uppercase letters][4 digits][PTC/FTC/GOI/etc 3 letters][6 digits]
 * @param {string} cin
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCIN(cin) {
  if (!cin) return { valid: false, error: 'CIN is required' };
  const c = cin.trim().toUpperCase();
  const pattern = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
  if (!pattern.test(c)) {
    return { valid: false, error: 'Invalid CIN format. Expected: L17110MH1973PLC019786' };
  }
  return { valid: true };
}

/**
 * Validate IEC (Import Export Code) — exactly 10 digits.
 * @param {string} iec
 * @returns {{ valid: boolean, error?: string }}
 */
function validateIEC(iec) {
  if (!iec) return { valid: false, error: 'IEC is required' };
  const i = iec.trim();
  if (!/^\d{10}$/.test(i)) {
    return { valid: false, error: 'IEC must be exactly 10 digits' };
  }
  return { valid: true };
}

/**
 * Extract state name from first two characters of a valid GSTIN.
 * Resolution 4: used by Setup Wizard Step 1 for inline state confirmation.
 * @param {string} gstin
 * @returns {{ stateCode: string, stateName: string } | null}
 */
function getStateFromGSTIN(gstin) {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = gstin.trim().substring(0, 2);
  const stateName = GST_STATE_CODES[stateCode];
  if (!stateName) return null;
  return { stateCode, stateName };
}

/**
 * Validate a license number by its type.
 * Dispatches to the correct type-specific validator.
 * @param {string} licenseType  - one of the 14 allowed types
 * @param {string} value
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLicenseNumber(licenseType, value) {
  switch (licenseType) {
    case 'GSTIN':  return validateGSTIN(value);
    case 'PAN':    return validatePAN(value);
    case 'TAN':    return validateTAN(value);
    case 'FSSAI':  return validateFSSAI(value);
    case 'UDYAM':  return validateUDYAM(value);
    case 'CIN':    return validateCIN(value);
    case 'IEC':    return validateIEC(value);
    // Other license types (TRADE_LICENSE, DRUG_LICENSE, etc.) don't have fixed national patterns
    case 'DRUG_LICENSE':
    case 'TRADE_LICENSE':
    case 'SHOP_ESTABLISHMENT':
    case 'PROFESSIONAL_TAX':
    case 'EPFO':
    case 'ESIC':
    case 'LLPIN':
      if (!value || !value.trim()) {
        return { valid: false, error: 'License number is required' };
      }
      return { valid: true };
    default:
      return { valid: true }; // Unknown types: pass through
  }
}

module.exports = {
  GST_STATE_CODES,
  getStateFromGSTIN,
  validateGSTIN,
  validatePAN,
  validateTAN,
  validateFSSAI,
  validateUDYAM,
  validateCIN,
  validateIEC,
  validateGSTINMatchesPAN,
  validateLicenseNumber,
};
