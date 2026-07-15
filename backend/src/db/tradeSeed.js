// ============================================================================
// Trade seed data — India (IN).
// This is DATA, not logic — mirrors complianceSeed.js exactly. Adding a new
// guideline means adding an entry here (or POSTing to /api/trade/guidelines),
// never a code change. seedTrade(db) is idempotent: guidelines are keyed by
// their unique `code`; authorities/countries/products are keyed by name/code,
// so admin edits made later via the API are never clobbered on restart.
//
// Scope note: Plant Quarantine, Animal Quarantine and Hazardous Material
// approval are genuinely PRODUCT-specific (depends on what you're importing,
// not just your industry — a furniture manufacturer and a seed importer are
// both "Manufacturing" but need entirely different approvals). There is no
// reliable company-profile signal to gate them as blanket per-company
// guidelines without over- or under-including businesses, so they are seeded
// as trade_authorities + surfaced via trade_products (product search) instead
// of as trade_guidelines here.
// ============================================================================

const GUIDELINES = [
  // ── Universal registration (any business that imports or exports) ────────
  {
    code: 'TRADE_IEC', country: 'IN', category: 'registration',
    title: 'Import Export Code (IEC)',
    description: 'A 10-digit PAN-based registration issued by DGFT — mandatory for any import or export of goods/services (with narrow exemptions).',
    department: 'DGFT', authority_short: 'DGFT',
    official_website: 'https://www.dgft.gov.in',
    fees: '₹500 (application fee)', processing_time: '1–3 working days (online, DSC/Aadhaar based)',
    renewal_requirement: 'No renewal fee, but IEC details must be confirmed/updated online every year between April–June, even if unchanged, or the IEC gets deactivated.',
    penalty_info: 'Deactivated IEC blocks all customs clearance until reactivated by filing the pending annual update.',
    frequency: 'annual', renewal_interval_months: 12,
    ai_explanation: 'Your profile shows you import and/or export, so an IEC is the foundational registration — customs will not clear any shipment without it.',
    faq: [
      { q: 'Do I need a new IEC for every shipment?', a: 'No, one IEC covers all your import/export activity — it does not expire, but must be confirmed annually.' },
      { q: 'Is IEC required for service exports?', a: 'Yes, IEC is required for both goods and services trade, with a few RBI-notified exemptions.' },
    ],
    conditions: [{ attribute: 'trade_active', operator: 'is_true' }],
    documents: ['PAN Card', 'Business Address Proof', 'Bank Account Certificate/Cancelled Cheque'],
  },
  {
    code: 'TRADE_ICEGATE', country: 'IN', category: 'registration',
    title: 'ICEGATE Registration',
    description: 'Registration on the Indian Customs EDI Gateway for electronic filing of Bills of Entry, Shipping Bills, and other customs documents.',
    department: 'CBIC', authority_short: 'ICEGATE',
    official_website: 'https://www.icegate.gov.in',
    fees: 'Free', processing_time: '1–2 working days',
    renewal_requirement: 'None — registration is permanent once approved.',
    penalty_info: 'Without ICEGATE registration, customs filings must go through a licensed customs broker for every transaction.',
    frequency: 'one_time',
    ai_explanation: 'ICEGATE is how your Bills of Entry (import) or Shipping Bills (export) actually get filed electronically with customs.',
    faq: [{ q: 'Can my customs broker file on my behalf without this?', a: 'Yes, a licensed CHA/customs broker can file for you — ICEGATE self-registration is useful if you want to track/file directly.' }],
    conditions: [{ attribute: 'trade_active', operator: 'is_true' }],
    documents: ['IEC Certificate', 'Digital Signature Certificate (Class 3)'],
  },
  {
    code: 'TRADE_CUSTOMS_BASICS', country: 'IN', category: 'registration',
    title: 'Customs Clearance Basics',
    description: 'HSN classification of your goods, applicable customs duty rates, and the Bill of Entry (import) / Shipping Bill (export) filing process.',
    department: 'CBIC', authority_short: 'CBIC',
    official_website: 'https://www.cbic.gov.in',
    fees: 'Duty varies by HSN code', processing_time: 'Varies by port and shipment type',
    renewal_requirement: 'None — this is a one-time process-familiarization item, not a recurring filing.',
    penalty_info: 'Misclassification of HSN code can trigger differential duty demand and penalty under the Customs Act.',
    frequency: 'one_time',
    ai_explanation: 'Every shipment needs the correct HSN classification to determine duty — worth confirming this once for your product range.',
    faq: [{ q: 'Where do I find my product\'s HSN code?', a: 'Check your product catalog — HSN codes are already captured per-product in BizBook, or look up the code on the CBIC customs tariff.' }],
    conditions: [{ attribute: 'trade_active', operator: 'is_true' }],
    documents: ['Product HSN Classification List', 'Commercial Invoice Template'],
  },

  // ── Export-specific ────────────────────────────────────────────────────────
  {
    code: 'TRADE_AD_CODE', country: 'IN', category: 'export',
    title: 'AD Code Registration',
    description: 'Authorized Dealer Code from your bank, registered with customs — required for foreign exchange remittance against export proceeds.',
    department: 'RBI (via Authorized Dealer Bank)', authority_short: 'RBI',
    official_website: 'https://www.rbi.org.in',
    fees: 'Bank-dependent (typically free or nominal)', processing_time: '3–7 working days',
    renewal_requirement: 'None, but must be re-registered at each port/ICEGATE location you export from.',
    penalty_info: 'Export proceeds cannot be repatriated to your bank account without a registered AD Code at that port.',
    frequency: 'one_time',
    ai_explanation: 'Since you export, your bank needs to register its AD Code with customs at your shipping port so your export payment can be received.',
    faq: [{ q: 'Do I need a separate AD Code per port?', a: 'Yes, AD Code registration is location-specific — register at every port/ICD you ship from.' }],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }],
    documents: ['Bank AD Code Letter', 'IEC Certificate', 'GST Certificate'],
  },
  {
    code: 'TRADE_RCMC', country: 'IN', category: 'export',
    title: 'RCMC (Registration-cum-Membership Certificate)',
    description: 'Membership certificate from the relevant Export Promotion Council, required to avail export incentive/benefit schemes.',
    department: 'Export Promotion Council (sector-specific)', authority_short: 'EPC',
    official_website: 'https://www.fieo.org',
    fees: '₹5,000–₹25,000/year depending on council and turnover slab', processing_time: '5–10 working days',
    renewal_requirement: 'Annual renewal with the issuing council.',
    penalty_info: 'Without a valid RCMC, export incentive schemes and duty benefit claims cannot be processed.',
    frequency: 'renewal', renewal_interval_months: 12,
    ai_explanation: 'As a manufacturer/trader that exports goods, RCMC from your sector\'s Export Promotion Council unlocks duty drawback and other export benefit schemes.',
    faq: [{ q: 'Which council do I register with?', a: 'It depends on your product — e.g. APEDA for agri/food, EEPC for engineering goods, or FIEO as the general council if no sector council applies.' }],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }, { attribute: 'goods_trader', operator: 'is_true' }],
    documents: ['IEC Certificate', 'GST Certificate', 'Bank Certificate'],
  },
  {
    code: 'TRADE_EPC', country: 'IN', category: 'export',
    title: 'Export Promotion Council Registration',
    description: 'Sector-specific council registration (e.g. APEDA for food, EEPC for engineering) providing market access support and scheme benefits.',
    department: 'Export Promotion Council (sector-specific)', authority_short: 'EPC',
    official_website: 'https://www.fieo.org',
    fees: 'Council-dependent', processing_time: '5–10 working days',
    renewal_requirement: 'Annual renewal.',
    penalty_info: 'No penalty for non-registration, but you forgo council support, buyer connect programs and benefit schemes.',
    frequency: 'renewal', renewal_interval_months: 12,
    ai_explanation: 'Registering with your sector\'s Export Promotion Council gives you access to export subsidy schemes and international buyer/seller meets.',
    faq: [],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }, { attribute: 'goods_trader', operator: 'is_true' }],
    documents: ['IEC Certificate', 'GST Certificate'],
  },
  {
    code: 'TRADE_LUT', country: 'IN', category: 'export',
    title: 'Letter of Undertaking (LUT)',
    description: 'Filed on the GST portal to export goods/services without paying IGST upfront (zero-rated supply).',
    department: 'GSTN / CBIC', authority_short: 'CBIC',
    official_website: 'https://www.gst.gov.in',
    fees: 'Free', processing_time: 'Instant to 2 working days (online)',
    renewal_requirement: 'Must be filed fresh at the start of every financial year.',
    penalty_info: 'Without a valid LUT, you must pay IGST on exports upfront and claim a refund later — a significant working-capital cost.',
    frequency: 'annual', renewal_interval_months: 12, due_month: 4,
    ai_explanation: 'Since you\'re GST-registered and export, filing an LUT each financial year lets you export without paying IGST upfront and claiming it back.',
    faq: [{ q: 'What if I miss filing LUT?', a: 'You can still export by paying IGST and filing a refund claim, but that ties up working capital until the refund is processed.' }],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }, { attribute: 'gst_registered', operator: 'is_true' }],
    documents: ['GST Certificate', 'IEC Certificate', 'Authorized Signatory KYC'],
  },
  {
    code: 'TRADE_EXPORT_DOCS', country: 'IN', category: 'export',
    title: 'Export Shipment Documentation',
    description: 'The core document set required to ship goods internationally: Commercial Invoice, Packing List, Shipping Bill, and Certificate of Origin.',
    department: 'CBIC / Chamber of Commerce', authority_short: 'CBIC',
    official_website: 'https://www.cbic.gov.in',
    fees: 'Certificate of Origin: ₹200–₹1,000 (Chamber-dependent)', processing_time: 'Same day to 2 working days per shipment',
    renewal_requirement: 'Prepared fresh for every shipment — not a periodic filing.',
    penalty_info: 'Incomplete documentation is the most common reason for shipment delay/rejection at customs or by the buyer\'s bank (for LC-backed shipments).',
    frequency: 'one_time',
    ai_explanation: 'As a goods exporter, every shipment needs this document set — worth having templates ready before your first shipment.',
    faq: [{ q: 'Who issues Certificate of Origin?', a: 'Your local Chamber of Commerce (non-preferential) or DGFT-notified agencies (preferential, for FTA benefit claims).' }],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }, { attribute: 'goods_trader', operator: 'is_true' }],
    documents: ['Commercial Invoice', 'Packing List', 'Shipping Bill', 'Certificate of Origin'],
  },
  {
    code: 'TRADE_DRUG_EXPORT', country: 'IN', category: 'export',
    title: 'Drug Export Permission / NOC',
    description: 'Export of pharmaceuticals requires either a standard export permission (licensed drugs) or a No Objection Certificate for unapproved/banned-in-India drugs manufactured for export.',
    department: 'CDSCO', authority_short: 'CDSCO',
    official_website: 'https://cdsco.gov.in',
    fees: 'Varies by application type', processing_time: '15–30 working days',
    renewal_requirement: 'Per-shipment/per-product NOC — not a recurring renewal.',
    penalty_info: 'Exporting drugs without required NOC/permission can lead to seizure and prosecution under the Drugs & Cosmetics Act.',
    frequency: 'one_time', mandatory: 0,
    ai_explanation: 'As a licensed drug business that exports, unapproved-for-India formulations need a CDSCO NOC before shipment even if approved in the destination country.',
    faq: [],
    conditions: [{ attribute: 'export_enabled', operator: 'is_true' }, { attribute: 'drug_license', operator: 'is_true' }],
    documents: ['Drug Manufacturing/Sale License', 'Product Composition Details', 'Destination Country Approval (if any)'],
  },

  // ── Import-specific ────────────────────────────────────────────────────────
  {
    code: 'TRADE_IMPORT_LICENSE', country: 'IN', category: 'import',
    title: 'Import License (Restricted Items)',
    description: 'Most goods are freely importable against IEC alone; items under the "Restricted" or "Canalised" ITC(HS) categories need a specific DGFT import license.',
    department: 'DGFT', authority_short: 'DGFT',
    official_website: 'https://www.dgft.gov.in',
    fees: 'Application fee varies by item value', processing_time: '15–30 working days',
    renewal_requirement: 'License-specific, typically valid 12–24 months.',
    penalty_info: 'Importing restricted goods without a license can lead to confiscation under the Customs Act and Foreign Trade (Development & Regulation) Act.',
    frequency: 'one_time', mandatory: 0,
    ai_explanation: 'Only relevant if what you import falls under DGFT\'s Restricted or Canalised list — check the ITC(HS) classification for your specific product.',
    faq: [{ q: 'How do I know if my product needs a license?', a: 'Look up your product\'s HSN code against the ITC(HS) Import Policy — most goods are "Free" and need no license.' }],
    conditions: [{ attribute: 'import_enabled', operator: 'is_true' }, { attribute: 'goods_trader', operator: 'is_true' }],
    documents: ['IEC Certificate', 'Product Technical Specification', 'End-Use Certificate (if applicable)'],
  },
  {
    code: 'TRADE_BIS', country: 'IN', category: 'import',
    title: 'BIS Certification (Compulsory Registration Scheme)',
    description: 'Mandatory BIS registration for specified categories of electronics, IT and other notified products before import or manufacture.',
    department: 'Bureau of Indian Standards', authority_short: 'BIS',
    official_website: 'https://www.bis.gov.in',
    fees: '₹10,000–₹2,00,000+ depending on product and lab testing', processing_time: '2–6 months including lab testing',
    renewal_requirement: 'Registration valid 2 years, renewable.',
    penalty_info: 'Import/sale of notified goods without BIS registration is prohibited and can lead to seizure.',
    frequency: 'renewal', renewal_interval_months: 24, mandatory: 0,
    ai_explanation: 'BIS registration only applies if your product category is on BIS\'s notified Compulsory Registration Scheme list (many electronics/IT products are).',
    faq: [{ q: 'How do I check if my product needs BIS?', a: 'Check the CRS notified product list on the BIS website against your product category.' }],
    conditions: [{ attribute: 'import_enabled', operator: 'is_true' }, { attribute: 'is_manufacturer', operator: 'is_true' }],
    documents: ['Product Test Report (BIS-recognized lab)', 'Factory/Import Details', 'Product Manual'],
  },
  {
    code: 'TRADE_FSSAI_IMPORT', country: 'IN', category: 'import',
    title: 'FSSAI Import License',
    description: 'A separate FSSAI license category specifically for importing food products into India, in addition to your regular FSSAI registration.',
    department: 'FSSAI', authority_short: 'FSSAI',
    official_website: 'https://fssai.gov.in',
    fees: '₹7,500/year (Central License)', processing_time: '30–60 working days',
    renewal_requirement: 'Annual renewal, apply 30 days before expiry.',
    penalty_info: 'Imported food without a valid FSSAI import license can be detained/destroyed at port under the Food Safety and Standards Act.',
    frequency: 'renewal', renewal_interval_months: 12,
    ai_explanation: 'Since your business handles food (FSSAI-flagged) and imports, a separate FSSAI import license is required at every port of entry alongside your regular FSSAI registration.',
    faq: [],
    conditions: [{ attribute: 'import_enabled', operator: 'is_true' }, { attribute: 'fssai_required', operator: 'is_true' }],
    documents: ['FSSAI Central License (regular)', 'IEC Certificate', 'Port of Import Details'],
  },
  {
    code: 'TRADE_DRUG_IMPORT', country: 'IN', category: 'import',
    title: 'Drug Import License',
    description: 'CDSCO import license/registration certificate required before importing pharmaceuticals or drug substances into India.',
    department: 'CDSCO', authority_short: 'CDSCO',
    official_website: 'https://cdsco.gov.in',
    fees: 'US $1,500–$3,000 depending on category (registration certificate)', processing_time: '6–9 months',
    renewal_requirement: 'Registration certificate valid 3 years; import license valid 3 years.',
    penalty_info: 'Importing unregistered drugs is an offence under the Drugs & Cosmetics Act with seizure and prosecution risk.',
    frequency: 'renewal', renewal_interval_months: 36,
    ai_explanation: 'As a licensed drug business that imports, both a Registration Certificate (Form 41/COS) and Import License (Form 10) from CDSCO are required.',
    faq: [],
    conditions: [{ attribute: 'import_enabled', operator: 'is_true' }, { attribute: 'drug_license', operator: 'is_true' }],
    documents: ['Drug Manufacturing License (origin country)', 'Free Sale Certificate', 'Product Composition & Specification'],
  },
  {
    code: 'TRADE_CDSCO', country: 'IN', category: 'licensing',
    title: 'CDSCO Registration',
    description: 'The central regulatory registration with the Central Drugs Standard Control Organisation, the umbrella authority for all drug import/export/manufacture approvals.',
    department: 'CDSCO', authority_short: 'CDSCO',
    official_website: 'https://cdsco.gov.in',
    fees: 'Category-dependent', processing_time: 'Varies by application type',
    renewal_requirement: 'Registration-specific; most CDSCO approvals are valid 3 years.',
    penalty_info: 'Trading in pharmaceuticals without CDSCO oversight is an offence under the Drugs & Cosmetics Act.',
    frequency: 'renewal', renewal_interval_months: 36,
    ai_explanation: 'Your business is flagged as drug-licensed and trades internationally, so CDSCO is the primary authority governing your import/export approvals.',
    faq: [],
    conditions: [{ attribute: 'trade_active', operator: 'is_true' }, { attribute: 'drug_license', operator: 'is_true' }],
    documents: ['Drug License Certificate', 'Manufacturing/Import Details'],
  },
];

// Real Indian government/regulatory bodies. Kept broader than the guideline set
// above (e.g. Plant Quarantine, Animal Quarantine) since product search
// (Phase 2) will reference authorities not tied to a blanket company guideline.
const AUTHORITIES = [
  { name: 'Directorate General of Foreign Trade', short_name: 'DGFT', description: 'Issues IEC and administers India\'s foreign trade policy.', website: 'https://www.dgft.gov.in' },
  { name: 'Central Board of Indirect Taxes & Customs', short_name: 'CBIC', description: 'Administers customs duty, clearance and GST at the border.', website: 'https://www.cbic.gov.in' },
  { name: 'Indian Customs EDI Gateway', short_name: 'ICEGATE', description: 'Electronic filing platform for customs documents.', website: 'https://www.icegate.gov.in' },
  { name: 'Bureau of Indian Standards', short_name: 'BIS', description: 'Mandatory product certification for notified categories.', website: 'https://www.bis.gov.in' },
  { name: 'Central Drugs Standard Control Organisation', short_name: 'CDSCO', description: 'Drug import/export/manufacture regulator.', website: 'https://cdsco.gov.in' },
  { name: 'Food Safety and Standards Authority of India', short_name: 'FSSAI', description: 'Food safety regulator, including food import licensing.', website: 'https://fssai.gov.in' },
  { name: 'Directorate of Plant Protection, Quarantine & Storage', short_name: 'Plant Quarantine', description: 'Regulates import of plants, seeds and plant products.', website: 'https://plantquarantine.gov.in' },
  { name: 'Animal Quarantine and Certification Service', short_name: 'AQCS', description: 'Regulates import of animals and animal products.', website: 'https://aqcsindia.dahd.gov.in' },
  { name: 'Reserve Bank of India', short_name: 'RBI', description: 'Forex regulator; governs AD Code and export proceeds remittance.', website: 'https://www.rbi.org.in' },
  { name: 'Federation of Indian Export Organisations', short_name: 'FIEO', description: 'General-purpose Export Promotion Council for sectors without a dedicated council.', website: 'https://www.fieo.org' },
  { name: 'Agricultural & Processed Food Products Export Development Authority', short_name: 'APEDA', description: 'Export Promotion Council for agricultural and processed food products.', website: 'https://apeda.gov.in' },
];

const COUNTRIES = [
  {
    country_code: 'US', country_name: 'United States', region: 'North America',
    requirements: ['FDA registration/prior notice for food, drugs, cosmetics and medical devices', 'Customs bond for formal entries', 'Importer Security Filing (ISF/10+2) before ocean shipment'],
    restricted_products: ['Certain agricultural products (phytosanitary certificate required)', 'Specific chemicals under EPA/TSCA', 'Endangered species products (CITES)'],
    import_duties_notes: 'Duties vary by HTS classification; some goods qualify for preferential rates under applicable trade programs — verify the exact HTS code for your product.',
    standards: ['FDA (food/drugs/devices)', 'FCC (electronics)', 'UL (electrical safety)'],
    shipping_notes: 'Ocean shipments require ISF filed at least 24 hours before vessel loading at origin.',
    official_links: [{ label: 'US Customs & Border Protection', url: 'https://www.cbp.gov' }, { label: 'FDA Import Program', url: 'https://www.fda.gov/industry/importing-fda-regulated-products' }],
  },
  {
    country_code: 'EU', country_name: 'European Union', region: 'Europe',
    requirements: ['CE marking for applicable product categories', 'REACH compliance for chemicals/chemical content', 'EORI number for the EU importer of record'],
    restricted_products: ['Food and plant products (phytosanitary/health certificates)', 'Certain chemicals restricted under REACH', 'Dual-use/strategic goods'],
    import_duties_notes: 'The EU applies a Common External Tariff across all member states — look up the applicable TARIC code for your product.',
    standards: ['CE marking', 'EN harmonized standards', 'RoHS (electronics)'],
    shipping_notes: 'A single customs declaration at the port of entry clears goods for free circulation across the entire EU single market.',
    official_links: [{ label: 'EU Trade Helpdesk', url: 'https://trade.ec.europa.eu/access-to-markets' }, { label: 'TARIC Consultation', url: 'https://ec.europa.eu/taxation_customs/dds2/taric' }],
  },
  {
    country_code: 'AE', country_name: 'Middle East (GCC)', region: 'Middle East',
    requirements: ['Certificate of Origin, often Chamber-attested/legalized', 'Halal certification for food products', 'GCC conformity marking for notified electronics/products'],
    restricted_products: ['Alcohol and pork products (restricted/prohibited in several GCC states)', 'Certain publications and media', 'Products requiring specific import permits (pharma, telecom equipment)'],
    import_duties_notes: 'GCC states apply a Common External Tariff of roughly 5% on most goods under the GCC Customs Union, with exemptions in free zones.',
    standards: ['GSO (GCC Standardization Organization) technical regulations', 'Halal certification schemes'],
    shipping_notes: 'Documents frequently need attestation from the destination country\'s embassy/consulate in India before shipment.',
    official_links: [{ label: 'GCC Standardization Organization', url: 'https://www.gso.org.sa' }],
  },
  {
    country_code: 'AU', country_name: 'Australia', region: 'Oceania',
    requirements: ['Biosecurity import permit for food, plant and animal products', 'Australian labelling compliance', 'Import declaration via the Integrated Cargo System'],
    restricted_products: ['Strict biosecurity restrictions on food, plants, seeds and wood packaging', 'Untreated wood packaging (must meet ISPM 15)'],
    import_duties_notes: 'Goods and Services Tax (10%) applies on most imports in addition to any applicable customs duty.',
    standards: ['ACMA (telecommunications)', 'ABCB (building products)', 'Biosecurity import conditions (BICON)'],
    shipping_notes: 'Wood packaging material must be treated and certified to ISPM 15 standard or shipments face quarantine action.',
    official_links: [{ label: 'Australian Border Force', url: 'https://www.abf.gov.au' }, { label: 'BICON Import Conditions', url: 'https://bicon.agriculture.gov.au' }],
  },
  {
    country_code: 'SG', country_name: 'Singapore', region: 'Southeast Asia',
    requirements: ['Customs import permit filed via TradeNet', 'Singapore Standards (SS) certification for regulated goods', 'Controlled goods require additional permits (e.g. food, pharma, chemicals)'],
    restricted_products: ['Chewing gum (restricted)', 'Certain publications and media', 'Controlled drugs and specific chemicals'],
    import_duties_notes: 'Most goods enter largely duty-free; Goods and Services Tax (9%) applies on most imports.',
    standards: ['Enterprise Singapore product safety standards', 'SS (Singapore Standards) certification for regulated categories'],
    shipping_notes: 'Efficient port infrastructure — most cargo clears via the TradeNet electronic system within hours of arrival.',
    official_links: [{ label: 'Singapore Customs', url: 'https://www.customs.gov.sg' }, { label: 'TradeNet', url: 'https://www.tradenet.gov.sg' }],
  },
];

function seedTrade(db) {
  // 1. Authorities (keyed by short_name).
  const findAuth = db.prepare('SELECT id FROM trade_authorities WHERE short_name = ?');
  const insAuth = db.prepare('INSERT INTO trade_authorities (name, short_name, description, website, country) VALUES (?, ?, ?, ?, ?)');
  const authIdByShortName = {};
  let authoritiesCreated = 0;
  for (const a of AUTHORITIES) {
    let row = findAuth.get(a.short_name);
    if (!row) {
      const info = insAuth.run(a.name, a.short_name, a.description, a.website, 'IN');
      authIdByShortName[a.short_name] = info.lastInsertRowid;
      authoritiesCreated++;
    } else {
      authIdByShortName[a.short_name] = row.id;
    }
  }

  // 2. Countries (keyed by country_code).
  const findCountry = db.prepare('SELECT id FROM trade_countries WHERE country_code = ?');
  const insCountry = db.prepare(`
    INSERT INTO trade_countries (country_code, country_name, region, requirements_json, restricted_products_json,
      import_duties_notes, standards_json, shipping_notes, official_links_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let countriesCreated = 0;
  for (const c of COUNTRIES) {
    if (findCountry.get(c.country_code)) continue;
    insCountry.run(c.country_code, c.country_name, c.region, JSON.stringify(c.requirements),
      JSON.stringify(c.restricted_products), c.import_duties_notes, JSON.stringify(c.standards),
      c.shipping_notes, JSON.stringify(c.official_links));
    countriesCreated++;
  }

  // 3. Guidelines (+ conditions + documents), only when first created.
  const findGuideline = db.prepare('SELECT id FROM trade_guidelines WHERE code = ?');
  const insGuideline = db.prepare(`
    INSERT INTO trade_guidelines
      (code, country, category, title, description, department, authority_id, official_website,
       fees, processing_time, renewal_requirement, penalty_info, faq_json, ai_explanation,
       frequency, renewal_interval_months, mandatory, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const insCond = db.prepare('INSERT INTO trade_rule_conditions (guideline_id, attribute, operator, value) VALUES (?, ?, ?, ?)');
  const insDoc = db.prepare('INSERT INTO trade_documents (guideline_id, doc_name, is_required) VALUES (?, ?, 1)');

  let guidelinesCreated = 0;
  for (const g of GUIDELINES) {
    if (findGuideline.get(g.code)) continue;
    const info = insGuideline.run(
      g.code, g.country || 'IN', g.category, g.title, g.description || null,
      g.department || null, authIdByShortName[g.authority_short] || null, g.official_website || null,
      g.fees || null, g.processing_time || null, g.renewal_requirement || null, g.penalty_info || null,
      g.faq ? JSON.stringify(g.faq) : null, g.ai_explanation || null,
      g.frequency || 'one_time', g.renewal_interval_months || null,
      g.mandatory != null ? g.mandatory : 1
    );
    const guidelineId = info.lastInsertRowid;
    for (const c of (g.conditions || [])) insCond.run(guidelineId, c.attribute, c.operator, c.value ?? null);
    for (const d of (g.documents || [])) insDoc.run(guidelineId, d);
    guidelinesCreated++;
  }

  return {
    authorities: authoritiesCreated, countries: countriesCreated,
    guidelinesCreated, guidelinesTotal: GUIDELINES.length,
    products: 0, // seeded in Phase 2
  };
}

module.exports = { seedTrade, GUIDELINES, AUTHORITIES, COUNTRIES };
