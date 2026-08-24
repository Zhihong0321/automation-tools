// Public OpenAPI contract for business discovery, company dossiers and VIP briefs.
// Keep this focused on requester-facing endpoints; the operational gateway and
// worker routes remain documented in /docs but are not part of this product API.

export const document = {
  openapi: '3.1.0',
  info: {
    title: 'EE Business Intelligence API',
    version: '1.0.0',
    description: 'Asynchronous Google Maps business discovery, evidence-guarded company research and public-professional VIP briefs, with durable public report links.',
  },
  servers: [{ url: 'https://ee-auto.up.railway.app', description: 'Production' }],
  tags: [
    { name: 'Business search', description: 'Discover and persist a ranked business list from Google Maps.' },
    { name: 'Company research', description: 'Enrich one persisted company through the four-round research workflow.' },
    { name: 'Person research', description: 'Create a public-professional VIP brief from a validated person in a completed company report.' },
    { name: 'Published reports', description: 'Read final public output using an opaque report identifier.' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/reports': {
      get: {
        operationId: 'listReports',
        tags: ['Published reports'],
        summary: 'Browse the combined report library',
        description: 'Returns business searches and company research reports newest first. This is the data source for the end-user research workspace.',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['business_search', 'company_research', 'person_research'] } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/ReportStatus' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 40 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          '200': { description: 'Combined report library', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReportListResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '503': { $ref: '#/components/responses/Unavailable' },
        },
      },
    },
    '/api/business-search': {
      post: {
        operationId: 'createBusinessSearch',
        tags: ['Business search'],
        summary: 'Start a business-list search',
        description: 'Search by business keyword, location, or both. Returns immediately with a durable report id. Poll api_url until status is completed, partial, or failed.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BusinessSearchRequest' }, examples: { solarKualaLumpur: { value: { keyword: 'solar installer', place: 'Kuala Lumpur', max: 40, requesterId: 'crm-42' } }, locationOnly: { value: { place: 'Petaling Jaya', max: 25, requesterId: 'crm-42' } } } } } },
        responses: {
          '202': { description: 'Search accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptedReport' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '503': { $ref: '#/components/responses/Unavailable' },
        },
      },
    },
    '/api/business-search/{reportId}': {
      get: {
        operationId: 'getBusinessSearch',
        tags: ['Business search'],
        summary: 'Poll a business-list report',
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: {
          '200': { description: 'Current report state and discovered companies', content: { 'application/json': { schema: { $ref: '#/components/schemas/BusinessSearchResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/company-research': {
      post: {
        operationId: 'createCompanyResearch',
        tags: ['Company research'],
        summary: 'Start deep research for one company',
        description: 'companyId must be the numeric id returned in data.companies[] by a completed business search.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CompanyResearchRequest' }, examples: { persistedCompany: { value: { companyId: '69', requesterId: 'crm-42' } } } } } },
        responses: {
          '202': { description: 'Research accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptedReport' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { description: 'The company id is not present in the persisted company table', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/company-research/{reportId}': {
      get: {
        operationId: 'getCompanyResearch',
        tags: ['Company research'],
        summary: 'Poll a company research report',
        description: 'Authenticated response includes canonical English final output, final_cn when the zh-CN translation is ready, validated ledger, raw round artifacts and round statuses for benchmarking.',
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: {
          '200': { description: 'Current research state', content: { 'application/json': { schema: { $ref: '#/components/schemas/CompanyResearchResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/person-research': {
      post: {
        operationId: 'createPersonResearch',
        tags: ['Person research'],
        summary: 'Start a public-professional VIP brief',
        description: 'Starts from a validated person in a completed company-research report. Optional email and mobile resolvers are used only during the live identifier-assisted discovery pass via Gemini/AGY, then discarded. They are not persisted in the report request, audit record, or published output. One brief per person per source report: if a brief already exists — including the automatic P01 one — the existing report is returned with 200 instead of a second run being started.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PersonResearchRequest' } } } },
        responses: {
          '200': { description: 'A brief for this person already exists; the existing report is returned', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptedReport' } } } },
          '202': { description: 'VIP brief accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptedReport' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/person-research/{reportId}': {
      get: {
        operationId: 'getPersonResearch', tags: ['Person research'], summary: 'Poll a VIP brief',
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: { '200': { description: 'Current VIP brief state', content: { 'application/json': { schema: { $ref: '#/components/schemas/PersonResearchResponse' } } } }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/public/reports/{reportId}': {
      get: {
        security: [],
        operationId: 'getPublishedReportJson',
        tags: ['Published reports'],
        summary: 'Read final public report JSON',
        description: 'No bearer token. Returns the public report envelope and final output only; raw research rounds are never exposed.',
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: {
          '200': { description: 'Published final report', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicReportResponse' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/r/{reportId}': {
      get: {
        security: [],
        operationId: 'viewPublishedReport',
        tags: ['Published reports'],
        summary: 'Open the mobile report page',
        parameters: [{ $ref: '#/components/parameters/ReportId' }],
        responses: {
          '200': { description: 'Mobile-first HTML report', content: { 'text/html': { schema: { type: 'string' } } } },
          '404': { description: 'Report page not found' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'LAB_TOKEN', description: 'Send the EE Auto service token. Never place it in a public report URL.' },
    },
    parameters: {
      ReportId: { name: 'reportId', in: 'path', required: true, description: 'Opaque 20-character id returned as report.id', schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{20}$' }, example: 'AbCdEfGhIjKlMnOpQrSt' },
    },
    responses: {
      BadRequest: { description: 'Invalid request body', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Missing or invalid bearer token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Report not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unavailable: { description: 'Report database is unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      ReportStatus: { type: 'string', enum: ['queued', 'running', 'completed', 'partial', 'failed'], description: 'completed and partial contain publishable output; partial means at least one research round or validation step had a gap.' },
      ReportEnvelope: {
        type: 'object', required: ['id', 'type', 'status', 'title', 'created_at', 'updated_at', 'view_url', 'api_url'],
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z0-9_-]{20}$' },
          type: { type: 'string', enum: ['business_search', 'company_research', 'person_research'] },
          status: { $ref: '#/components/schemas/ReportStatus' },
          title: { type: 'string' },
          version: { type: 'integer', minimum: 1, description: 'Which research pass this is on the same company. 1 is the first; re-researching the same company produces V2, V3, ... and never overwrites an earlier dossier. Always 1 for a business search.' },
          created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
          completed_at: { type: ['string', 'null'], format: 'date-time' }, view_url: { type: 'string', format: 'uri' }, api_url: { type: 'string', format: 'uri' },
          error: { type: ['string', 'null'], description: 'Failure detail or partial-run warning.' },
        },
      },
      ReportListItem: { allOf: [{ $ref: '#/components/schemas/ReportEnvelope' }, { type: 'object', properties: { preview: { type: 'object', additionalProperties: true } } }] },
      ReportListResponse: { type: 'object', required: ['reports', 'total', 'limit', 'offset'], properties: { reports: { type: 'array', items: { $ref: '#/components/schemas/ReportListItem' } }, total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } },
      AcceptedReport: { type: 'object', required: ['report'], properties: { report: { $ref: '#/components/schemas/ReportEnvelope' } } },
      BusinessSearchRequest: {
        type: 'object', additionalProperties: false,
        anyOf: [{ required: ['keyword'] }, { required: ['place'] }, { required: ['location'] }],
        properties: {
          keyword: { type: 'string', minLength: 1, description: 'Business category, service or keyword. Optional when place/location is supplied.' },
          place: { type: 'string', minLength: 1, description: 'City, district, state or country. Optional when keyword is supplied.' },
          location: { type: 'string', minLength: 1, description: 'Alias for place.' },
          max: { type: 'integer', minimum: 1, maximum: 300, default: 100 },
          requesterId: { type: 'string', description: 'Optional caller-owned correlation id. userId is accepted as an alias.' },
          userId: { type: 'string', description: 'Alias for requesterId.' },
          timeoutMs: { type: 'integer', minimum: 1, default: 600000, description: 'Worker deadline; this does not make the POST synchronous.' },
        },
      },
      CompanyResearchRequest: {
        type: 'object', required: ['companyId'], additionalProperties: false,
        description: 'Researching a company that already has a dossier is allowed and produces the next version (V2, V3, ...) rather than returning the old one. A run still in flight is joined, not duplicated. Once the people audit identifies P01, a separate person_research report starts automatically in parallel with the remaining company rounds and translation. It uses the identical current VIP pipeline as POST /api/person-research: Gemini/AGY primary discovery, capability-gated Facebook/Instagram/Threads and xAI/X scouts, independent audit, and validated synthesis.',
        properties: {
          companyId: { type: 'string', pattern: '^\\d+$', description: 'Persisted company id from data.companies[].id. company_id is accepted as an alias.' },
          requesterId: { type: 'string', description: 'Optional caller-owned correlation id. userId is accepted as an alias.' },
        },
      },
      PersonResearchRequest: {
        type: 'object', additionalProperties: false,
        anyOf: [
          { required: ['companyResearchId', 'personId'] },
          { required: ['companyResearchId', 'person_id'] },
          { required: ['company_research_id', 'personId'] },
          { required: ['company_research_id', 'person_id'] },
        ],
        properties: {
          companyResearchId: { type: 'string', pattern: '^[A-Za-z0-9_-]{20}$', description: 'Completed company-research report id. company_research_id is accepted as an alias.' },
          company_research_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{20}$', description: 'Alias for companyResearchId.' },
          personId: { type: 'string', minLength: 1, description: 'Validated person id from final.people[].id. person_id is accepted as an alias.' },
          person_id: { type: 'string', minLength: 1, description: 'Alias for personId.' },
          email: { type: 'string', format: 'email', description: 'Optional caller-supplied identity resolver. Used only for the live discovery pass; never persisted or published.' },
          mobile: { type: 'string', pattern: '^[+()\\d.\\s-]{7,32}$', description: 'Optional caller-supplied mobile resolver. It must contain 7–15 digits and may include formatting. Used only for the live discovery pass; never persisted or published.' },
          mobileNumber: { type: 'string', pattern: '^[+()\\d.\\s-]{7,32}$', description: 'Alias for mobile.' },
          phone: { type: 'string', pattern: '^[+()\\d.\\s-]{7,32}$', description: 'Alias for mobile.' },
          requesterId: { type: 'string' }, userId: { type: 'string' },
        },
      },
      Company: {
        type: 'object', required: ['id', 'name'],
        properties: {
          id: { type: 'string', description: 'Use this value as companyId for deep research.' }, place_id: { type: ['string', 'null'] }, name: { type: 'string' },
          rating: { type: ['number', 'string', 'null'] }, reviews: { type: ['integer', 'null'] }, category: { type: ['string', 'null'] }, address: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] }, website: { type: ['string', 'null'], format: 'uri' }, maps_url: { type: ['string', 'null'], format: 'uri' },
          source: { type: ['string', 'null'] }, first_seen_at: { type: ['string', 'null'], format: 'date-time' }, last_seen_at: { type: ['string', 'null'], format: 'date-time' }, rank: { type: ['integer', 'null'] },
        },
      },
      BusinessSearchResponse: {
        type: 'object', required: ['report', 'data'], properties: {
          report: { $ref: '#/components/schemas/ReportEnvelope' },
          data: { type: 'object', required: ['companies'], properties: { report: { type: 'object', additionalProperties: true }, search: { type: ['object', 'null'], additionalProperties: true }, companies: { type: 'array', items: { $ref: '#/components/schemas/Company' } } } },
          research_run: { type: 'null' },
        },
      },
      FinalCompanyReport: {
        type: 'object',
        properties: {
          entity: { type: 'object', additionalProperties: true }, summary: { type: ['string', 'null'] }, contacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
          people: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'People whose current role has direct evidence.' },
          candidate_people: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Named public-source leads that require direct current-role verification; they are not eligible for automatic VIP research.' },
          signals: { type: 'array', items: { type: 'object', additionalProperties: true } },
          outreach_angles: { type: 'array', items: { type: 'string' } }, conflicts_and_unknowns: { type: 'array', items: { type: 'object', additionalProperties: true } },
          auto_person_research: { type: ['object', 'null'], additionalProperties: true, description: 'Separate automatically triggered P01 VIP report reference. The child uses the same current VIP pipeline as POST /api/person-research.' },
          synthesis_mode: { type: 'string', enum: ['gemini_validated', 'validated_ledger_fallback'] },
        }, additionalProperties: true,
      },
      FinalPersonReport: {
        type: 'object', properties: {
          person: { type: 'object', additionalProperties: true }, summary: { type: ['string', 'null'] },
          contacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
          facts: { type: 'array', items: { type: 'object', additionalProperties: true } }, signals: { type: 'array', items: { type: 'object', additionalProperties: true } },
          research_angles: { type: 'array', items: { type: 'string' } },
          synthesis_mode: { type: 'string', enum: ['chatgpt_validated', 'validated_ledger_fallback'] },
        }, additionalProperties: true,
      },
      ResearchRun: {
        type: ['object', 'null'], description: 'Authenticated benchmark record. Round artifacts may be null until that round is saved.',
        properties: {
          report_id: { type: 'string' },
          round01: { type: ['object', 'null'], additionalProperties: true, description: 'Gemini discovery.' },
          round02: { type: ['object', 'null'], additionalProperties: true, description: 'Three split ChatGPT audits: contacts, people, signals.' },
          round03: { type: ['object', 'null'], additionalProperties: true, description: 'Facebook evidence from the read-only fb-recon crawler on the home worker. access_mode is live_facebook_pages or no_live_access; rows carry the facebook.com URL each field was read from. Status is skipped when no worker is claiming fb.company.' },
          round04: { type: ['object', 'null'], additionalProperties: true, description: 'Gemini synthesis, rejected and replaced by the ledger if it invents a row or a URL.' },
          validated_ledger: { type: ['object', 'null'], additionalProperties: true }, final_report: { oneOf: [{ $ref: '#/components/schemas/FinalCompanyReport' }, { type: 'null' }] },
          round_status: { type: 'object', additionalProperties: { type: 'string' } }, engine_metadata: { type: 'object', additionalProperties: true },
          started_at: { type: ['string', 'null'], format: 'date-time' }, completed_at: { type: ['string', 'null'], format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
        },
      },
      PersonResearchRun: {
        type: ['object', 'null'], description: 'Authenticated VIP-brief audit record. It retains validated public-professional evidence plus primary discovery, Facebook/Instagram/Threads scout, xAI/X scout, independent-audit, and synthesis metadata; it never retains caller-supplied email or mobile resolvers. Social lanes are capability-gated and may report unavailable when their worker is offline.',
        properties: {
          report_id: { type: 'string' }, discovery: { type: ['object', 'null'], additionalProperties: true }, synthesis: { type: ['object', 'null'], additionalProperties: true },
          validated_ledger: { oneOf: [{ $ref: '#/components/schemas/FinalPersonReport' }, { type: 'null' }] }, final_report: { oneOf: [{ $ref: '#/components/schemas/FinalPersonReport' }, { type: 'null' }] },
          run_status: { type: 'object', additionalProperties: true }, engine_metadata: { type: 'object', additionalProperties: true },
          started_at: { type: ['string', 'null'], format: 'date-time' }, completed_at: { type: ['string', 'null'], format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
        },
      },
      CompanyResearchResponse: {
        type: 'object', required: ['report', 'data'], properties: {
          report: { $ref: '#/components/schemas/ReportEnvelope' },
          data: { type: 'object', properties: { report: { type: 'object', additionalProperties: true }, final: { oneOf: [{ $ref: '#/components/schemas/FinalCompanyReport' }, { type: 'null' }] }, final_cn: { oneOf: [{ $ref: '#/components/schemas/FinalCompanyReport' }, { type: 'null' }], description: 'Simplified Chinese translation of final. Source URLs, IDs and published contact values are unchanged.' }, translation: { type: ['object', 'null'], additionalProperties: true } } },
          research_run: { $ref: '#/components/schemas/ResearchRun' },
        },
      },
      PersonResearchResponse: {
        type: 'object', required: ['report', 'data'], properties: {
          report: { $ref: '#/components/schemas/ReportEnvelope' },
          data: { type: 'object', properties: { report: { $ref: '#/components/schemas/ReportEnvelope' }, final: { oneOf: [{ $ref: '#/components/schemas/FinalPersonReport' }, { type: 'null' }] } } },
          research_run: { $ref: '#/components/schemas/PersonResearchRun' },
        },
      },
      PublicSearchReportResponse: { type: 'object', required: ['report', 'companies'], properties: { report: { type: 'object', additionalProperties: true }, search: { type: ['object', 'null'], additionalProperties: true }, companies: { type: 'array', items: { $ref: '#/components/schemas/Company' } } } },
      PublicCompanyReportResponse: { type: 'object', required: ['report', 'final'], properties: { report: { type: 'object', additionalProperties: true }, final: { oneOf: [{ $ref: '#/components/schemas/FinalCompanyReport' }, { type: 'null' }] }, final_cn: { oneOf: [{ $ref: '#/components/schemas/FinalCompanyReport' }, { type: 'null' }] }, translation: { type: ['object', 'null'], additionalProperties: true } } },
      PublicPersonReportResponse: { type: 'object', required: ['report', 'final'], properties: { report: { type: 'object', additionalProperties: true }, final: { oneOf: [{ $ref: '#/components/schemas/FinalPersonReport' }, { type: 'null' }] } } },
      PublicReportResponse: { oneOf: [{ $ref: '#/components/schemas/PublicSearchReportResponse' }, { $ref: '#/components/schemas/PublicCompanyReportResponse' }, { $ref: '#/components/schemas/PublicPersonReportResponse' }] },
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' }, companyId: { type: 'string' } } },
    },
  },
} as const;
