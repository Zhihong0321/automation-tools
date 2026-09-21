import { normalizePhoneNumber } from './phone.ts';
import type { RawCompanyContactRow } from './reportdb.ts';

export interface MasterPersonItem {
  id?: string;
  name: string;
  role: string;
  seniority: string | number | null;
  direct_phone: string | null;
  direct_email: string | null;
  whatsapp_url: string | null;
  profile_url: string | null;
  evidence_url: string | null;
  is_primary: boolean;
}

export interface MasterPhoneItem {
  number: string;
  number_e164: string | null;
  type: string;
  label: string;
  whatsapp_url: string | null;
  dial_url: string | null;
  evidence_url: string | null;
  is_mobile: boolean;
}

export interface MasterEmailItem {
  email: string;
  label: string;
  evidence_url: string | null;
}

export interface CompanyContactGroup {
  company_id: string;
  company_name: string;
  category: string | null;
  address: string | null;
  primary_phone: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  reviews: number | null;
  lead_status: string;
  assigned_to: string | null;
  contact_public_id: string | null;
  contact_status: string | null;
  research_public_id: string | null;
  research_status: string | null;
  gatekeeper_phrase: string | null;
  primary_channel: string | null;
  people: MasterPersonItem[];
  phones: MasterPhoneItem[];
  emails: MasterEmailItem[];
  total_people: number;
  total_phones: number;
  total_emails: number;
}

export interface MasterContactsStats {
  totalCompaniesWithContacts: number;
  totalDecisionMakers: number;
  totalPhones: number;
  totalMobileWhatsapp: number;
  totalEmails: number;
}

export interface MasterContactsResponse {
  groups: CompanyContactGroup[];
  totalCompanies: number;
  stats: MasterContactsStats;
  limit: number;
  offset: number;
}

export function extractCompanyContacts(row: RawCompanyContactRow): CompanyContactGroup {
  const people: MasterPersonItem[] = [];
  const phones: MasterPhoneItem[] = [];
  const emails: MasterEmailItem[] = [];
  const seenPeople = new Set<string>();
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  const crepResult = (row.contact_result || {}) as Record<string, any>;
  const repResult = (row.research_result || {}) as Record<string, any>;
  const cheatSheet = (crepResult.cheat_sheet || {}) as Record<string, any>;

  // 1. Primary Decision Maker from cheat sheet
  const primaryDMName = typeof cheatSheet.primary_decision_maker === 'string' ? cheatSheet.primary_decision_maker.trim() : '';

  // 2. Decision Makers from contact_research
  const dms = Array.isArray(crepResult.decision_makers) ? crepResult.decision_makers : (Array.isArray(crepResult.people) ? crepResult.people : []);
  for (const dm of dms) {
    const name = String(dm.name || dm.person_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenPeople.has(key)) continue;
    seenPeople.add(key);

    const directPhone = dm.direct_phone || dm.phone || dm.mobile || null;
    const directEmail = dm.direct_email || dm.email || null;
    const normPhone = directPhone ? normalizePhoneNumber(String(directPhone)) : null;

    people.push({
      id: dm.id ? String(dm.id) : undefined,
      name,
      role: dm.role || dm.position || 'Key Contact',
      seniority: dm.seniority || null,
      direct_phone: normPhone ? (normPhone.e164 || normPhone.raw) : (directPhone ? String(directPhone) : null),
      direct_email: directEmail ? String(directEmail).trim() : null,
      whatsapp_url: normPhone?.whatsappUrl || (directPhone ? `https://wa.me/${String(directPhone).replace(/[^0-9]/g, '')}` : null),
      profile_url: dm.profile_url || dm.personal_profile_url || dm.linkedin_url || null,
      evidence_url: dm.role_evidence_url || dm.evidence_url || dm.source_url || null,
      is_primary: Boolean(primaryDMName && name.toLowerCase() === primaryDMName.toLowerCase()),
    });
  }

  // 3. People from company_research (fallback or additional)
  const repPeople = Array.isArray(repResult.people) ? repResult.people : [];
  for (const p of repPeople) {
    const name = String(p.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenPeople.has(key)) continue;
    seenPeople.add(key);

    people.push({
      id: p.id ? String(p.id) : undefined,
      name,
      role: p.role || 'Validated Person',
      seniority: p.seniority || null,
      direct_phone: null,
      direct_email: null,
      whatsapp_url: null,
      profile_url: p.personal_profile_url || p.profile_url || null,
      evidence_url: p.evidence_url || p.source_url || null,
      is_primary: Boolean(primaryDMName && name.toLowerCase() === primaryDMName.toLowerCase()),
    });
  }

  // 4. Candidate people from company_research
  const candidates = Array.isArray(repResult.candidate_people) ? repResult.candidate_people : [];
  for (const c of candidates) {
    const name = String(c.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenPeople.has(key)) continue;
    seenPeople.add(key);

    people.push({
      name,
      role: c.role || 'Candidate Contact',
      seniority: null,
      direct_phone: null,
      direct_email: null,
      whatsapp_url: null,
      profile_url: null,
      evidence_url: c.source_url || c.evidence_url || null,
      is_primary: false,
    });
  }

  // Sort people: primary DM first, then seniority score descending, then name
  people.sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    const senA = typeof a.seniority === 'number' ? a.seniority : 0;
    const senB = typeof b.seniority === 'number' ? b.seniority : 0;
    if (senB !== senA) return senB - senA;
    return a.name.localeCompare(b.name);
  });

  // 5. Phone contacts from contact_research
  const phoneList = Array.isArray(crepResult.phone_contacts) ? crepResult.phone_contacts : (Array.isArray(crepResult.contacts) ? crepResult.contacts : []);
  for (const ph of phoneList) {
    const raw = String(ph.number_raw || ph.value_as_published || ph.value || ph.phone || '').trim();
    if (!raw) continue;
    const norm = normalizePhoneNumber(raw);
    const key = norm.digits || raw.toLowerCase();
    if (!key || seenPhones.has(key)) continue;
    seenPhones.add(key);

    phones.push({
      number: norm.raw || raw,
      number_e164: norm.e164 || null,
      type: ph.type || (norm.isMobile ? 'mobile_whatsapp' : 'office'),
      label: ph.label || (norm.isMobile ? 'Mobile / WhatsApp' : 'Office Phone'),
      whatsapp_url: norm.whatsappUrl || ph.whatsapp_url || null,
      dial_url: norm.dialUrl || (norm.e164 ? `tel:${norm.e164}` : `tel:${raw.replace(/[^+\d]/g, '')}`),
      evidence_url: ph.evidence_url || null,
      is_mobile: norm.isMobile,
    });
  }

  // 6. Contacts from company_research
  const repContacts = Array.isArray(repResult.contacts) ? repResult.contacts : [];
  for (const c of repContacts) {
    const val = String(c.value_as_published || c.value || c.normalized_value || '').trim();
    if (!val) continue;
    const type = String(c.type || c.purpose || '').toLowerCase();
    if (type.includes('phone') || /^[+\d\s()-]{6,}$/.test(val)) {
      const norm = normalizePhoneNumber(val);
      const key = norm.digits || val.toLowerCase();
      if (key && !seenPhones.has(key)) {
        seenPhones.add(key);
        phones.push({
          number: norm.raw || val,
          number_e164: norm.e164 || null,
          type: norm.isMobile ? 'mobile_whatsapp' : 'office',
          label: c.purpose || c.label || (norm.isMobile ? 'Mobile / WhatsApp' : 'Direct Line'),
          whatsapp_url: norm.whatsappUrl || null,
          dial_url: norm.dialUrl || (norm.e164 ? `tel:${norm.e164}` : `tel:${val.replace(/[^+\d]/g, '')}`),
          evidence_url: c.evidence_url || null,
          is_mobile: norm.isMobile,
        });
      }
    } else if (type.includes('email') || val.includes('@')) {
      const emailLower = val.toLowerCase();
      if (!seenEmails.has(emailLower)) {
        seenEmails.add(emailLower);
        emails.push({
          email: val,
          label: c.purpose || c.label || 'Company Email',
          evidence_url: c.evidence_url || null,
        });
      }
    }
  }

  // 7. Base company phone from company_data (if not already included)
  if (row.phone && row.phone.trim()) {
    const norm = normalizePhoneNumber(row.phone);
    const key = norm.digits || row.phone.trim().toLowerCase();
    if (key && !seenPhones.has(key)) {
      seenPhones.add(key);
      phones.push({
        number: norm.raw || row.phone,
        number_e164: norm.e164 || null,
        type: norm.isMobile ? 'mobile_whatsapp' : 'switchboard',
        label: norm.isMobile ? 'Mobile / WhatsApp' : 'Google Maps Main Line',
        whatsapp_url: norm.whatsappUrl || null,
        dial_url: norm.dialUrl || (norm.e164 ? `tel:${norm.e164}` : `tel:${row.phone.replace(/[^+\d]/g, '')}`),
        evidence_url: row.maps_url || null,
        is_mobile: norm.isMobile,
      });
    }
  }

  // Sort phones: Mobile/WhatsApp first, then Office/Direct lines
  phones.sort((a, b) => {
    if (a.is_mobile && !b.is_mobile) return -1;
    if (!a.is_mobile && b.is_mobile) return 1;
    return 0;
  });

  // 8. Email contacts from contact_research
  const emailList = Array.isArray(crepResult.email_contacts) ? crepResult.email_contacts : [];
  for (const em of emailList) {
    const emailStr = String(em.email || '').trim();
    if (!emailStr) continue;
    const key = emailStr.toLowerCase();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    emails.push({
      email: emailStr,
      label: em.label || 'Direct Email',
      evidence_url: em.evidence_url || null,
    });
  }

  return {
    company_id: row.id,
    company_name: row.name,
    category: row.category,
    address: row.address,
    primary_phone: row.phone,
    website: row.website,
    maps_url: row.maps_url,
    rating: row.rating,
    reviews: row.reviews,
    lead_status: row.lead_status,
    assigned_to: row.assigned_to,
    contact_public_id: row.contact_public_id,
    contact_status: row.contact_status,
    research_public_id: row.research_public_id,
    research_status: row.research_status,
    gatekeeper_phrase: cheatSheet.gatekeeper_phrase || null,
    primary_channel: cheatSheet.primary_channel || null,
    people,
    phones,
    emails,
    total_people: people.length,
    total_phones: phones.length,
    total_emails: emails.length,
  };
}

export function buildMasterContactsResponse(
  rows: RawCompanyContactRow[],
  options: {
    search?: string | null;
    filter?: string | null;
    assignedTo?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): MasterContactsResponse {
  const limit = Math.min(Math.max(Math.round(options.limit ?? 25), 1), 100);
  const offset = Math.max(Math.round(options.offset ?? 0), 0);
  const query = options.search ? options.search.trim().toLowerCase() : '';
  const filterType = options.filter || 'all';

  // Extract all groups sorted by company name
  let allGroups: CompanyContactGroup[] = rows.map(extractCompanyContacts);
  allGroups.sort((a, b) => a.company_name.localeCompare(b.company_name, undefined, { sensitivity: 'base' }));

  // Filter groups
  if (filterType === 'researched' || filterType === 'researched_only') {
    allGroups = allGroups.filter((g) => Boolean(g.contact_public_id || g.research_public_id));
  } else if (filterType === 'with_decision_makers' || filterType === 'has_decision_makers') {
    allGroups = allGroups.filter((g) => g.total_people > 0);
  } else if (filterType === 'with_mobile' || filterType === 'has_mobile') {
    allGroups = allGroups.filter((g) => g.phones.some((p) => p.is_mobile || p.type === 'mobile_whatsapp'));
  } else if (filterType === 'with_email' || filterType === 'has_email') {
    allGroups = allGroups.filter((g) => g.total_emails > 0);
  }

  // Filter assigned telemarketer
  if (options.assignedTo && options.assignedTo !== 'all') {
    if (options.assignedTo === 'unassigned') {
      allGroups = allGroups.filter((g) => !g.assigned_to);
    } else {
      const assigned = options.assignedTo.trim().toLowerCase();
      allGroups = allGroups.filter((g) => g.assigned_to && g.assigned_to.toLowerCase() === assigned);
    }
  }

  // Apply search query across company and all its contacts/people
  if (query) {
    allGroups = allGroups.filter((g) => {
      if (g.company_name.toLowerCase().includes(query)) return true;
      if (g.category && g.category.toLowerCase().includes(query)) return true;
      if (g.address && g.address.toLowerCase().includes(query)) return true;
      if (g.primary_phone && g.primary_phone.toLowerCase().includes(query)) return true;
      if (g.assigned_to && g.assigned_to.toLowerCase().includes(query)) return true;
      if (g.gatekeeper_phrase && g.gatekeeper_phrase.toLowerCase().includes(query)) return true;
      if (g.people.some((p) => p.name.toLowerCase().includes(query) || (p.role && p.role.toLowerCase().includes(query)) || (p.direct_phone && p.direct_phone.toLowerCase().includes(query)))) return true;
      if (g.phones.some((p) => p.number.toLowerCase().includes(query) || p.label.toLowerCase().includes(query))) return true;
      if (g.emails.some((e) => e.email.toLowerCase().includes(query))) return true;
      return false;
    });
  }

  // Calculate overall statistics for the filtered dataset
  let totalDecisionMakers = 0;
  let totalPhones = 0;
  let totalMobileWhatsapp = 0;
  let totalEmails = 0;

  for (const g of allGroups) {
    totalDecisionMakers += g.total_people;
    totalPhones += g.total_phones;
    totalEmails += g.total_emails;
    for (const ph of g.phones) {
      if (ph.is_mobile || ph.type === 'mobile_whatsapp') totalMobileWhatsapp++;
    }
  }

  const stats: MasterContactsStats = {
    totalCompaniesWithContacts: allGroups.length,
    totalDecisionMakers,
    totalPhones,
    totalMobileWhatsapp,
    totalEmails,
  };

  const paginatedGroups = allGroups.slice(offset, offset + limit);

  return {
    groups: paginatedGroups,
    totalCompanies: allGroups.length,
    stats,
    limit,
    offset,
  };
}

export function generateContactsCsv(groups: CompanyContactGroup[]): string {
  const escapeCsv = (val: unknown) => {
    const s = String(val == null ? '' : val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Company Name',
    'Category',
    'Address',
    'Company Phone',
    'Assigned To',
    'Lead Status',
    'Record Type',
    'Person Name',
    'Role / Title',
    'Seniority',
    'Contact Label',
    'Phone Number',
    'Phone E164',
    'WhatsApp URL',
    'Email',
    'Receptionist / Gatekeeper Script',
    'Evidence Source',
    'Report Link',
  ];

  const lines = [header.join(',')];

  for (const group of groups) {
    const cName = group.company_name;
    const cCat = group.category || '';
    const cAddr = group.address || '';
    const cPhone = group.primary_phone || '';
    const cAssigned = group.assigned_to || '';
    const cStatus = group.lead_status || 'unassigned';
    const reportLink = group.contact_public_id ? `/r/${group.contact_public_id}` : (group.research_public_id ? `/r/${group.research_public_id}` : '');
    const gatekeeper = group.gatekeeper_phrase || '';

    // 1. Decision Makers / People
    for (const p of group.people) {
      lines.push([
        escapeCsv(cName),
        escapeCsv(cCat),
        escapeCsv(cAddr),
        escapeCsv(cPhone),
        escapeCsv(cAssigned),
        escapeCsv(cStatus),
        escapeCsv(p.is_primary ? 'Decision Maker (Target)' : 'Executive / Person'),
        escapeCsv(p.name),
        escapeCsv(p.role),
        escapeCsv(p.seniority ?? ''),
        escapeCsv('Direct Contact'),
        escapeCsv(p.direct_phone || ''),
        escapeCsv(p.direct_phone || ''),
        escapeCsv(p.whatsapp_url || ''),
        escapeCsv(p.direct_email || ''),
        escapeCsv(gatekeeper),
        escapeCsv(p.evidence_url || p.profile_url || ''),
        escapeCsv(reportLink),
      ].join(','));
    }

    // 2. Dialable Phone Routes
    for (const ph of group.phones) {
      lines.push([
        escapeCsv(cName),
        escapeCsv(cCat),
        escapeCsv(cAddr),
        escapeCsv(cPhone),
        escapeCsv(cAssigned),
        escapeCsv(cStatus),
        escapeCsv('Phone Route'),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(ph.label),
        escapeCsv(ph.number),
        escapeCsv(ph.number_e164 || ''),
        escapeCsv(ph.whatsapp_url || ''),
        escapeCsv(''),
        escapeCsv(gatekeeper),
        escapeCsv(ph.evidence_url || ''),
        escapeCsv(reportLink),
      ].join(','));
    }

    // 3. Email Channels
    for (const em of group.emails) {
      lines.push([
        escapeCsv(cName),
        escapeCsv(cCat),
        escapeCsv(cAddr),
        escapeCsv(cPhone),
        escapeCsv(cAssigned),
        escapeCsv(cStatus),
        escapeCsv('Email Channel'),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(em.label),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(em.email),
        escapeCsv(gatekeeper),
        escapeCsv(em.evidence_url || ''),
        escapeCsv(reportLink),
      ].join(','));
    }

    // 4. Fallback if company had no deep people/phones yet
    if (!group.people.length && !group.phones.length && !group.emails.length && group.primary_phone) {
      lines.push([
        escapeCsv(cName),
        escapeCsv(cCat),
        escapeCsv(cAddr),
        escapeCsv(cPhone),
        escapeCsv(cAssigned),
        escapeCsv(cStatus),
        escapeCsv('Company Line'),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv('Main Line'),
        escapeCsv(group.primary_phone),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(''),
        escapeCsv(group.maps_url || ''),
        escapeCsv(reportLink),
      ].join(','));
    }
  }

  return lines.join('\r\n');
}
