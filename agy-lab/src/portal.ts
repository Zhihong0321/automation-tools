// End-user business-intelligence workspace.
//
// The shell is public, but it contains no credential. Users enter a scoped
// PORTAL_TOKEN which is kept by eeKey (see tokenstore.ts) and sent only as a
// bearer header. Entered once, it survives new tabs and browser restarts -- the
// portal and every report page read the same store, so nobody is asked twice.
// The same page also accepts LAB_TOKEN for owner testing.
import { TOKEN_STORE_JS } from './tokenstore.ts';

export function page(): string {
  return String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#151515"><title>EE Business Intelligence</title>
<style>
:root{--paper:#f3f0e8;--sheet:#fbfaf6;--ink:#151515;--muted:#6c6a64;--faint:#9b988f;--line:#cbc6ba;--soft:#e6e1d6;--accent:#2759ff;--accent-dark:#1741d0;--ok:#15785a;--warn:#a36b00;--bad:#9e382f;--display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:Inter,"Helvetica Neue",Arial,sans-serif;--mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}html{background:var(--paper);scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}button,input,select{font:inherit}button,a{-webkit-tap-highlight-color:transparent}.hidden{display:none!important}
.app{min-height:100vh}.mast{height:68px;background:var(--ink);color:var(--sheet)}.mast-inner{height:100%;max-width:1180px;margin:auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:inherit;padding:0;font:750 11px/1 var(--sans);letter-spacing:.13em;text-transform:uppercase;cursor:pointer}.mark{display:grid;place-items:center;width:30px;height:30px;background:var(--sheet);color:var(--ink);font:850 10px/1 var(--sans)}.desktop-nav{display:flex;align-items:center;gap:6px}.nav-button{border:0;background:transparent;color:#aaa79f;min-height:42px;padding:0 14px;font:700 10px/1 var(--sans);text-transform:uppercase;letter-spacing:.11em;cursor:pointer}.nav-button.active{color:#fff}.access{display:flex;align-items:center;gap:9px;margin-left:16px;padding-left:18px;border-left:1px solid #3b3b38;color:#c9c6be;font:600 10px/1 var(--mono);text-transform:uppercase}.access-dot{width:7px;height:7px;border-radius:50%;background:#50d09d}.signout{border:0;background:transparent;color:#85837d;padding:8px;cursor:pointer;font:600 10px/1 var(--mono)}
.content{max-width:1180px;margin:auto;padding:0 28px 96px}.view{display:none}.view.active{display:block}.hero{position:relative;margin:0 -28px;padding:64px max(28px,calc((100vw - 1180px)/2 + 28px)) 118px;background:var(--ink);color:var(--sheet);overflow:hidden}.hero:after{content:"EE / FIELD INTELLIGENCE";position:absolute;right:30px;bottom:23px;color:#41413e;font:600 9px/1 var(--mono);letter-spacing:.16em}.eyebrow{display:flex;align-items:center;gap:10px;color:#91a8ff;font:700 10px/1 var(--sans);letter-spacing:.17em;text-transform:uppercase}.eyebrow:before{content:"";width:30px;height:2px;background:var(--accent)}.hero h1{max-width:820px;margin:18px 0 18px;font:400 clamp(48px,7vw,86px)/.92 var(--display);letter-spacing:-.055em;text-wrap:balance}.hero p{max-width:610px;margin:0;color:#aaa9a4;font-size:15px;line-height:1.65}.search-sheet{position:relative;margin:-72px 0 0;background:var(--sheet);border:1px solid var(--ink);padding:28px;box-shadow:0 18px 50px rgba(20,20,20,.09)}.search-grid{display:grid;grid-template-columns:1.3fr 1fr 110px auto;align-items:end;gap:18px}.field label{display:block;margin:0 0 8px;font:750 9px/1 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}.input{width:100%;height:49px;border:0;border-bottom:1px solid var(--ink);border-radius:0;background:transparent;color:var(--ink);padding:0 2px;font-size:16px;outline:none}.input:focus{border-bottom:2px solid var(--accent)}.input::placeholder{color:#aaa69d}.select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 14px) 21px,calc(100% - 9px) 21px;background-size:5px 5px;background-repeat:no-repeat}.primary{height:49px;border:1px solid var(--accent);background:var(--accent);color:#fff;padding:0 24px;font:800 10px/1 var(--sans);letter-spacing:.11em;text-transform:uppercase;cursor:pointer;white-space:nowrap}.primary:hover{background:var(--accent-dark)}.primary:disabled{opacity:.48;cursor:wait}.form-note{margin:15px 0 0;color:var(--muted);font-size:11px}
.workspace{padding-top:44px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:18px}.section-head h2{margin:0;font:400 clamp(28px,4vw,42px)/1 var(--display);letter-spacing:-.035em}.section-note{max-width:420px;text-align:right;color:var(--muted);font-size:12px}.rule{border-top:1px solid var(--ink)}
.jobs{border-top:1px solid var(--ink);margin-bottom:50px}.job{display:grid;grid-template-columns:125px minmax(0,1fr) auto;gap:20px;align-items:center;min-height:84px;border-bottom:1px solid var(--line)}.job-type{font:700 9px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}.job-title{font-weight:650;letter-spacing:-.015em}.job-meta{margin-top:5px;font:500 10px/1.4 var(--mono);color:var(--muted);text-transform:uppercase}.job-action{display:flex;align-items:center;gap:12px}.pulse{width:7px;height:7px;border-radius:50%;background:#d29a27;box-shadow:0 0 0 5px rgba(210,154,39,.12);animation:pulse 1.8s infinite}.pulse.done{background:var(--ok);box-shadow:none;animation:none}.pulse.bad{background:var(--bad);box-shadow:none;animation:none}@keyframes pulse{50%{opacity:.38}}.text-action{display:inline-flex;align-items:center;gap:5px;border:0;border-bottom:1px solid currentColor;background:transparent;color:var(--ink);padding:8px 0;text-decoration:none;font:750 10px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.text-action span{color:var(--accent)}
.result-summary{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-bottom:26px}.metric{padding:20px 18px 18px 0;min-width:0}.metric+.metric{border-left:1px solid var(--line);padding-left:18px}.metric strong{display:block;overflow:hidden;text-overflow:ellipsis;font:400 34px/1 var(--display);letter-spacing:-.04em}.metric span{display:block;margin-top:8px;color:var(--muted);font:750 8px/1.2 var(--sans);letter-spacing:.13em;text-transform:uppercase}.company-list{border-top:1px solid var(--ink)}.company{display:grid;grid-template-columns:50px minmax(180px,.9fr) minmax(230px,1fr) minmax(270px,1fr);gap:20px;align-items:start;padding:25px 0;border-bottom:1px solid var(--line)}.number{font:550 11px/1 var(--mono);color:var(--accent)}.company h3{margin:0;font-size:17px;line-height:1.2;letter-spacing:-.02em}.meta{margin-top:6px;color:var(--muted);font-size:11px}.address{color:var(--muted);font-size:12.5px}.company-contact{display:grid;gap:13px}.phone{font:500 14px/1.2 var(--mono)}.company-actions{display:flex;align-items:center;gap:13px;flex-wrap:wrap}.research{min-height:41px;border:1px solid var(--ink);background:var(--ink);color:#fff;padding:0 14px;font:750 9px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.research:hover{background:var(--accent);border-color:var(--accent)}.research:disabled{opacity:.42;cursor:wait}.source-link{color:var(--ink);text-decoration:none;border-bottom:1px solid currentColor;padding:6px 0;font:700 9px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase}.source-link:after{content:" ↗";color:var(--accent)}
.library-hero{padding:64px 0 38px;border-bottom:1px solid var(--ink)}.library-hero h1{margin:12px 0 14px;font:400 clamp(45px,7vw,78px)/.92 var(--display);letter-spacing:-.05em}.library-hero p{max-width:600px;color:var(--muted)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:25px 0 34px}.filter{min-height:38px;padding:0 14px;border:1px solid var(--line);background:transparent;color:var(--muted);font:700 9px/1 var(--sans);text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.filter.active{background:var(--ink);border-color:var(--ink);color:#fff}.report-list{border-top:1px solid var(--ink)}.report{display:grid;grid-template-columns:130px minmax(0,1fr) 190px auto;gap:22px;padding:27px 0;border-bottom:1px solid var(--line);align-items:start}.report-kind{font:700 9px/1.3 var(--sans);color:var(--accent);letter-spacing:.12em;text-transform:uppercase}.report-date{display:block;margin-top:8px;color:var(--faint);font:500 9px/1 var(--mono)}.report h3{margin:0;font-size:18px;line-height:1.2;letter-spacing:-.02em}.report-summary{margin:8px 0 0;max-width:650px;color:var(--muted);font-size:12.5px}.report-stats{font:500 10px/1.65 var(--mono);color:var(--muted);text-transform:uppercase}.status{display:inline-flex;align-items:center;gap:7px;font:700 9px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase}.status:before{content:"";width:7px;height:7px;border-radius:50%;background:#d29a27}.status.completed:before,.status.partial:before{background:var(--ok)}.status.failed:before{background:var(--bad)}.empty{padding:62px 20px;text-align:center;color:var(--muted);border-bottom:1px solid var(--line)}
.mobile-nav{display:none}.gate{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(18,18,18,.92);padding:20px}.gate-panel{width:min(440px,100%);background:var(--sheet);border:1px solid #fff;padding:34px}.gate-mark{display:grid;place-items:center;width:34px;height:34px;background:var(--ink);color:#fff;font:800 10px/1 var(--sans)}.gate h1{margin:32px 0 12px;font:400 42px/.95 var(--display);letter-spacing:-.045em}.gate p{color:var(--muted);font-size:13px}.gate-form{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:24px}.gate input{height:48px;min-width:0;border:1px solid var(--ink);border-radius:0;background:#fff;padding:0 13px}.gate button{height:48px}.gate-error{min-height:20px;margin:10px 0 0;color:var(--bad)!important;font-size:11px!important}.toast{position:fixed;z-index:60;right:20px;bottom:20px;max-width:380px;background:var(--ink);color:#fff;padding:14px 17px;font-size:12px;box-shadow:0 15px 45px rgba(0,0,0,.2);transform:translateY(140%);transition:transform .24s}.toast.show{transform:translateY(0)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media(max-width:820px){body{padding-bottom:72px}.mast{height:60px}.mast-inner{padding:0 18px}.desktop-nav{display:none}.content{padding:0 18px 44px}.hero{margin:0 -18px;padding:30px 18px 84px}.hero:after{right:18px}.hero h1{margin:14px 0 14px;font-size:clamp(34px,9.6vw,50px)}.hero p{font-size:13.5px}.search-sheet{margin-top:-58px;padding:22px 18px}.search-grid{grid-template-columns:1fr 1fr;gap:18px 14px}.field.keyword{grid-column:1/-1}.search-grid .primary{grid-column:1/-1}.workspace{padding-top:36px}.section-head{display:block}.section-note{text-align:left;margin-top:8px}.job{grid-template-columns:1fr auto;gap:8px 12px;padding:18px 0}.job-type{grid-column:1/-1}.job-action{justify-self:end}.result-summary{grid-template-columns:repeat(2,1fr)}.metric:nth-child(3){border-left:0;border-top:1px solid var(--line);padding-left:0}.metric:nth-child(4){border-top:1px solid var(--line)}.metric strong{font-size:31px}.company{grid-template-columns:35px 1fr;gap:14px 10px;padding:23px 0}.address,.company-contact{grid-column:2}.company-actions{gap:12px}.research{min-height:46px}.library-hero{padding:44px 0 30px}.library-hero h1{font-size:54px}.report{grid-template-columns:1fr auto;gap:12px;padding:23px 0}.report-kind{grid-column:1/-1}.report-stats{grid-column:1}.report>.text-action{grid-column:2;grid-row:2;align-self:end}.mobile-nav{position:fixed;z-index:35;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(3,1fr);height:68px;padding-bottom:env(safe-area-inset-bottom);background:var(--ink);border-top:1px solid #343431}.mobile-tab{border:0;background:transparent;color:#8f8d87;font:700 9px/1 var(--sans);letter-spacing:.11em;text-transform:uppercase}.mobile-tab.active{color:#fff}.mobile-tab span{display:block;width:5px;height:5px;margin:0 auto 8px;border-radius:50%;background:transparent}.mobile-tab.active span{background:var(--accent)}.toast{left:14px;right:14px;bottom:82px;max-width:none}.gate-panel{padding:28px 22px}.gate-form{grid-template-columns:1fr}.gate-form button{width:100%}}
.company-actions .research{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-color:var(--accent);background:var(--accent);padding:0 17px;font-weight:800;font-size:10px;letter-spacing:.1em;text-decoration:none}.company-actions .research:hover{background:var(--accent-dark);border-color:var(--accent-dark)}.company-actions .research:disabled{opacity:.54}.company-actions .research:before{content:"Direct ";color:#cfd9ff}.company-actions .view-report:before{content:none}.company-actions .view-report{background:var(--ink);border-color:var(--ink)}.company-actions .view-report:hover{background:var(--accent-dark);border-color:var(--accent-dark)}
.ads-grid{grid-template-columns:1.4fr 1fr 1fr auto}.company-grid{grid-template-columns:1.3fr 1fr auto}
.report-actions{display:grid;gap:11px;justify-items:end}.people-panel{grid-column:1/-1;margin-top:14px;padding-top:16px;border-top:1px solid var(--soft)}.people-head{margin:0 0 4px;color:var(--muted);font:750 9px/1.3 var(--sans);letter-spacing:.13em;text-transform:uppercase}.people-head+.person-row{border-top:0}.person-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:16px;align-items:start;padding:13px 0;border-bottom:1px solid var(--soft)}.person-row:last-child{border-bottom:0}.person-rank{font:550 10px/1.6 var(--mono);color:var(--accent)}.person-name{font-weight:650;letter-spacing:-.015em}.person-role{margin-top:3px;color:var(--muted);font-size:12.5px}.person-note{display:inline-block;margin-top:5px;color:var(--faint);font:500 9px/1.4 var(--mono);text-transform:uppercase;text-decoration:none}a.person-note{color:var(--muted);border-bottom:1px solid currentColor}
.vip{display:inline-flex;align-items:center;gap:6px;min-height:38px;border:1px solid var(--ink);background:transparent;color:var(--ink);padding:0 13px;font:750 9px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;white-space:nowrap;text-decoration:none;cursor:pointer}.vip:hover{background:var(--ink);color:#fff}.vip:disabled{opacity:.45;cursor:wait}
@media(max-width:820px){.ads-grid{grid-template-columns:1fr}.company-grid{grid-template-columns:1fr}.report-actions{grid-column:2;grid-row:2;align-self:end;gap:9px}.person-row{grid-template-columns:30px minmax(0,1fr);gap:8px 12px}.person-row .vip{grid-column:2;justify-self:start;min-height:44px}}
.chooser{position:relative;margin:-72px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--ink);border:1px solid var(--ink);box-shadow:0 18px 50px rgba(20,20,20,.09)}.choice{display:flex;flex-direction:column;align-items:flex-start;gap:11px;min-height:212px;margin:0;border:0;background:var(--sheet);color:var(--ink);padding:28px 24px 24px;text-align:left;cursor:pointer;transition:background .18s,color .18s}.choice:hover,.choice:focus-visible{background:var(--ink);color:var(--sheet);outline:0}.choice-no{font:550 10px/1 var(--mono);color:var(--accent);letter-spacing:.1em}.choice h2{margin:0;font:400 30px/1.02 var(--display);letter-spacing:-.04em}.choice-copy{margin:0;color:var(--muted);font-size:12.5px;line-height:1.55}.choice:hover .choice-copy,.choice:focus-visible .choice-copy{color:#a9a7a4}.choice-go{margin-top:auto;padding-top:14px;font:800 9px/1 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}.choice:hover .choice-go,.choice:focus-visible .choice-go{color:#91a8ff}.sheet-head{display:flex;align-items:center;gap:16px;margin:-4px 0 24px;padding-bottom:13px;border-bottom:1px solid var(--soft)}.back{border:0;background:transparent;color:var(--muted);padding:6px 0;font:750 9px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.back:hover{color:var(--accent)}.sheet-title{font:750 9px/1 var(--sans);letter-spacing:.13em;text-transform:uppercase}@media(max-width:820px){.chooser{grid-template-columns:1fr;margin-top:-58px}.choice{min-height:0;padding:22px 18px 20px}.choice h2{font-size:27px}.choice-go{padding-top:11px}}
a.nav-button{display:inline-flex;align-items:center;text-decoration:none}.gate-help{margin:16px 0 0;font-size:11px}.gate-help a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line)}.gate-help a:hover{color:var(--accent);border-color:var(--accent)}a.mobile-tab{display:grid;place-content:center;text-decoration:none}
.text-action.danger{color:var(--bad)}.text-action.danger span{color:var(--bad)}.text-action.danger:disabled{opacity:.45;cursor:wait}
.library-tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:25px 0 0}.library-tools .primary{height:42px}.retry-note{color:var(--muted);font:600 11px/1.4 var(--mono)}
.lead-row{display:grid;grid-template-columns:32px minmax(200px,1.2fr) minmax(180px,1fr) minmax(170px,.9fr) auto;gap:18px;align-items:start;padding:22px 0;border-bottom:1px solid var(--line);transition:background .15s}
.lead-row.has-contact-research{background:#e8f5e9;margin:0 -14px;padding:22px 14px;border:1px solid #c8e6c9;border-left:5px solid #2e7d32;border-radius:6px;box-shadow:0 1px 4px rgba(46,125,50,.1)}
.lead-row.contact-running{background:#fffdf0;margin:0 -14px;padding:22px 14px;border-left:4px solid var(--warn);border-radius:5px}
.lead-row.is-hidden{background:#fbfbfb;opacity:.9}
.contact-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;background:#e6f7ef;border:1px solid #b7ebd3;border-radius:4px;font:700 11px/1.3 var(--sans);color:var(--ok);margin-top:6px;white-space:nowrap}
.contact-pill.running{background:#fff8e6;border-color:#f5d085;color:var(--warn)}
.contact-pill strong{color:var(--ok);font-weight:800}
.company.has-contact-research{background:#e8f5e9;margin:0 -14px;padding:25px 14px;border:1px solid #c8e6c9;border-left:5px solid #2e7d32;border-radius:5px}
.vip.contact-vip{background:#0a6b47;color:#fff;border-color:#0a6b47;font-weight:750}
.vip.contact-vip:hover{background:#085739;border-color:#085739}
.result-summary.lead-summary-grid{grid-template-columns:repeat(6,1fr)}
.lead-check{width:18px;height:18px;margin-top:3px;cursor:pointer;accent-color:var(--accent)}
.branch-tag{display:inline-block;padding:2px 6px;margin-left:6px;font:600 9px/1 var(--mono);background:var(--soft);color:var(--muted);border-radius:3px;text-transform:uppercase}
.status-select{height:34px;padding:0 8px;font:700 9px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);background:var(--sheet);border-radius:3px;cursor:pointer}
.status-select.unassigned{color:var(--muted);border-color:var(--line)}
.status-select.assigned{color:var(--accent);border-color:var(--accent)}
.status-select.contacted{color:var(--warn);border-color:var(--warn)}
.status-select.interested{color:var(--ok);border-color:var(--ok);background:#ecfdf5}
.status-select.not_interested{color:var(--bad);border-color:var(--bad)}
.status-select.do_not_call{color:#fff;background:var(--bad);border-color:var(--bad)}
.tele-select{height:34px;padding:0 8px;font:600 11px/1 var(--sans);border:1px solid var(--line);background:var(--sheet);border-radius:3px;cursor:pointer;max-width:180px}
.district-card{border:1px solid var(--line);background:var(--sheet);margin-bottom:14px;border-radius:6px;overflow:hidden;transition:border-color .15s}
.district-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;user-select:none;background:var(--sheet)}
.district-head:hover{background:#f4f5f7}
.district-title{display:flex;align-items:center;gap:12px}
.district-title h3{margin:0;font-size:18px;font-weight:700;letter-spacing:-.015em}
.district-badge{font:650 10px/1 var(--mono);background:#e0e7ff;color:var(--accent);padding:3px 8px;border-radius:4px;text-transform:uppercase}
.district-chevron{font-size:14px;color:var(--muted);transition:transform .2s}
.district-card.expanded .district-chevron{transform:rotate(180deg)}
.district-body{display:none;padding:12px 18px 20px;border-top:1px solid var(--soft);background:#fafbfc}
.district-card.expanded .district-body{display:block}
.town-block{margin-top:14px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:6px}
.town-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}
.town-title{font-size:15px;font-weight:700;color:var(--ink)}
.town-scan-btn{height:28px;padding:0 10px;font:700 9.5px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;background:var(--soft);color:var(--ink);border:1px solid var(--line);border-radius:4px;cursor:pointer}
.town-scan-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.taman-grid{display:flex;flex-wrap:wrap;gap:8px}
.taman-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 11px;background:#f8f9fa;border:1px solid var(--line);border-radius:4px;font-size:12.5px;color:var(--ink)}
.taman-pill.scanned{border-color:var(--ok);background:#f4fbf7}
.taman-pill.scanning{border-color:var(--warn);background:#fffdf0}
.taman-pip{width:7px;height:7px;border-radius:50%;background:#b4b2ac;flex-shrink:0}
.taman-pip.scanned{background:var(--ok)}
.taman-pip.scanning{background:var(--warn);animation:pulse 1.8s infinite}
.taman-name{font-weight:550}
.taman-link{color:var(--ok);font:600 11px/1 var(--mono);text-decoration:none}
.taman-link:hover{text-decoration:underline}
.taman-scan-action{border:0;background:var(--ink);color:#fff;font:700 9px/1 var(--sans);letter-spacing:.05em;text-transform:uppercase;padding:4px 8px;border-radius:3px;cursor:pointer}
.taman-scan-action:hover{background:var(--accent)}
.taman-scan-action:disabled{opacity:.5;cursor:wait}
@media(max-width:820px){
  .result-summary.lead-summary-grid{grid-template-columns:repeat(2,1fr)}
  .lead-row{grid-template-columns:26px 1fr;gap:12px 10px;padding:18px 0}
  .lead-row.has-contact-research{margin:0 -8px;padding:18px 8px}
  .lead-row>div:nth-child(3),.lead-row>div:nth-child(4),.lead-row>div:nth-child(5){grid-column:2}
}
.agent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
.agent-card{background:#fff;border:1px solid var(--line);border-radius:6px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);position:relative}
.agent-card.inactive{opacity:.65;background:#fdfdfd}
.agent-card-head{display:flex;align-items:start;justify-content:space-between;gap:10px}
.agent-avatar{width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex-shrink:0}
.agent-meta-block{flex:1;min-width:0}
.agent-name{margin:0;font-size:17px;font-weight:700;color:var(--ink);letter-spacing:-.015em;display:flex;align-items:center;gap:8px}
.agent-contact-line{margin-top:4px;font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:10px}
.agent-notes-box{font-size:12px;color:var(--muted);background:#f8f9fa;border:1px solid var(--soft);border-radius:4px;padding:6px 10px;line-height:1.4}
.agent-metrics-row{display:grid;grid-template-columns:repeat(4,1fr);background:#fafbfc;border:1px solid var(--soft);border-radius:4px;text-align:center;padding:8px 4px}
.agent-metric-item{padding:2px 4px}
.agent-metric-item+.agent-metric-item{border-left:1px solid var(--soft)}
.agent-metric-num{font:700 15px/1 var(--mono);color:var(--ink)}
.agent-metric-lbl{margin-top:4px;font:700 7.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.agent-actions-row{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid var(--soft);flex-wrap:wrap}
.contact-group-card{background:#fff;border:1px solid var(--line);border-radius:6px;padding:20px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.03);display:flex;flex-direction:column;gap:16px}
.contact-group-card:hover{border-color:#b4b2ac}
.contact-group-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--soft);padding-bottom:14px}
.contact-group-title{font-size:18px;font-weight:700;color:var(--ink);margin:0 0 4px}
.contact-group-meta{font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.contact-pill-tag{font:700 10.5px/1 var(--sans);letter-spacing:.04em;padding:4px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px}
.contact-pill-tag.dm{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}
.contact-pill-tag.mobile{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
.contact-pill-tag.phone{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}
.contact-subhead{font:700 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;display:flex;align-items:center;gap:8px}
.contact-person-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.contact-person-box{background:#f9fafb;border:1px solid var(--line);border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.contact-person-box.primary-person{background:#f0f7ff;border-color:#93c5fd}
.contact-person-name{font-size:14px;font-weight:700;color:var(--ink);display:flex;align-items:center;justify-content:space-between;gap:6px}
.contact-person-role{font-size:12px;color:var(--muted);font-weight:500}
.contact-phone-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.contact-phone-box{background:#f9fafb;border:1px solid var(--line);border-radius:5px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.contact-phone-box.mobile-box{background:#f0fdf4;border-color:#bbf7d0}
.contact-phone-val{font:700 13.5px/1 var(--mono);color:var(--ink)}
.contact-person-table{width:100%;border-collapse:collapse;font-size:13.5px}
.contact-person-table th{text-align:left;font:750 9px/1.2 var(--sans);letter-spacing:.11em;text-transform:uppercase;color:var(--muted);padding:0 12px 10px;border-bottom:1px solid var(--ink);white-space:nowrap}
.contact-person-table td{padding:13px 12px;border-bottom:1px solid var(--soft);vertical-align:top}
.contact-person-table tr:last-child td{border-bottom:0}
.contact-person-table tr.primary-person td{background:#f0f7ff}
.contact-person-table .person-name{font-weight:700;color:var(--ink);letter-spacing:-.01em}
.contact-person-table .person-name.unnamed{font-weight:500;color:var(--muted);font-style:italic}
.contact-person-table .person-position{color:var(--ink)}
.contact-person-table .person-contact{display:flex;flex-direction:column;gap:6px}
.contact-person-table .person-source{font-size:12px;color:var(--muted);word-break:break-word}
.contact-person-table .person-source a{color:var(--accent);text-decoration:none;border-bottom:1px solid currentColor}
.contact-empty-people{padding:18px 4px;color:var(--muted);font-size:13px}
@media(max-width:820px){
  .contact-person-table thead{display:none}
  .contact-person-table,.contact-person-table tbody,.contact-person-table tr,.contact-person-table th,.contact-person-table td{display:block;width:100%}
  .contact-person-table tr{padding:14px 0;border-bottom:1px solid var(--line)}
  .contact-person-table tr:last-child{border-bottom:0}
  .contact-person-table td{padding:5px 0;border:0}
  .contact-person-table td:before{content:attr(data-label);display:block;margin-bottom:3px;font:750 8px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .contact-person-table tr.primary-person td{background:transparent}
  .contact-person-table tr.primary-person{background:#f0f7ff;margin:0 -12px;padding:14px 12px}
}
.contact-action-btn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;font:700 9.5px/1 var(--sans);letter-spacing:.04em;text-transform:uppercase;border-radius:3px;text-decoration:none;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink);transition:all .15s}
.contact-action-btn:hover{background:var(--soft)}
.contact-action-btn.call-btn{background:#0a6b47;color:#fff;border-color:#0a6b47}
.contact-action-btn.call-btn:hover{background:#085438}
.contact-action-btn.wa-btn{background:#25d366;color:#fff;border-color:#25d366}
.contact-action-btn.wa-btn:hover{background:#20ba5a}
.contact-action-btn.copy-btn{background:#f3f4f6;color:var(--ink)}
.contact-cheatsheet-box{background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:10px 14px;font-size:12px;color:#92400e;line-height:1.45}
</style></head><body>
<div id="accessGate" class="gate"><div class="gate-panel"><div class="gate-mark">EE</div><h1>Private intelligence workspace.</h1><p>Enter the access key supplied by the workspace owner. You enter it once: it stays in this browser and is never added to a report link.</p><form class="gate-form" onsubmit="connect(event)"><input id="accessKey" type="password" autocomplete="current-password" placeholder="Workspace access key" aria-label="Workspace access key"><button id="connectButton" class="primary" type="submit">Enter</button></form><p id="gateError" class="gate-error" role="alert"></p><p class="gate-help"><a href="/guide" target="_blank" rel="noopener">New here? Read the guide first ↗ · 新手指南</a></p></div></div>
<div id="portalApp" class="app" aria-hidden="true" inert>
  <header class="mast"><div class="mast-inner"><button type="button" class="brand" aria-label="Home" onclick="switchView('discover')"><span class="mark">EE</span><span>Business intelligence</span></button><nav class="desktop-nav" aria-label="Workspace"><button class="nav-button active" data-view="discover" onclick="switchView('discover')">Home</button><button class="nav-button" data-view="telemarketing" onclick="switchView('telemarketing')">Telemarketing</button><button class="nav-button" data-view="leads" onclick="switchView('leads')">Leads Master</button><button class="nav-button" data-view="contacts" onclick="switchView('contacts')">Contacts Master</button><button class="nav-button" data-view="agents" onclick="switchView('agents')">Telemarketers</button><button class="nav-button" data-view="library" onclick="switchView('library')">Reports</button><a class="nav-button" href="/guide" target="_blank" rel="noopener">Guide</a><span class="access"><span class="access-dot"></span>Connected</span><button class="signout" onclick="disconnect()">Sign out</button></nav><button class="signout" onclick="disconnect()">Exit</button></div></header>
  <main class="content">
    <section id="discoverView" class="view active">
      <div class="hero"><div class="eyebrow" id="heroEyebrow">Live market discovery</div><h1 id="heroTitle">Find the companies worth knowing.</h1><p id="heroCopy">Pick one. Nothing is researched until you say so.</p></div>
      <div id="chooser" class="chooser" role="group" aria-label="Choose a tool"><button type="button" class="choice" data-mode="market" onclick="choose('market')"><span class="choice-no">01</span><h2>Business list</h2><p class="choice-copy">Scan a market on Google Maps. A ranked list of businesses with phones, websites, and deep research one click from every row.</p><span class="choice-go">Open →</span></button><button type="button" class="choice" data-mode="company" onclick="choose('company')"><span class="choice-no">02</span><h2>Company research</h2><p class="choice-copy">You already know the name. Confirm the Maps listing, then run the evidence-guarded dossier on that one company.</p><span class="choice-go">Open →</span></button><button type="button" class="choice" data-mode="adsmarket" onclick="choose('adsmarket')"><span class="choice-no">03</span><h2>Ads market research</h2><p class="choice-copy">Give a product keyword. Every live Facebook ad in that market, rolled up into who is advertising, what they offer, and where the gaps are.</p><span class="choice-go">Open \u2192</span></button><button type="button" class="choice" data-choice="reports" onclick="choose('reports')"><span class="choice-no">04</span><h2>Completed report</h2><p class="choice-copy">Every business list, company dossier, VIP brief and ads capture, on permanent links that keep refreshing while a run is live.</p><span class="choice-go">Open →</span></button></div>
      <form id="searchForm" class="search-sheet hidden" onsubmit="startSearch(event)"><div class="sheet-head"><button type="button" class="back" onclick="goHome()">← All tools</button><span class="sheet-title" id="sheetTitle">Business list</span></div><div class="search-grid" id="marketGrid"><div class="field keyword"><label for="keyword">Business or service <span>(optional)</span></label><input class="input" id="keyword" placeholder="e.g. solar installer"></div><div class="field"><label for="place">Location <span>(optional)</span></label><input class="input" id="place" placeholder="e.g. Kuala Lumpur"></div><div class="field"><label for="maxResults">Results</label><select class="input select" id="maxResults"><option value="200" selected>200</option><option value="400">400</option><option value="600">600</option></select></div><button id="searchButton" class="primary" type="submit">Search market</button></div><div class="search-grid company-grid hidden" id="companyGrid"><div class="field keyword"><label for="companyName">Company name</label><input class="input" id="companyName" placeholder="e.g. Solarvest Holdings Berhad"></div><div class="field"><label for="companyPlace">Location <span>(optional, narrows the match)</span></label><input class="input" id="companyPlace" placeholder="e.g. Petaling Jaya"></div><button id="lookupButton" class="primary" type="submit">Find company</button></div><div class="search-grid ads-grid hidden" id="adsGrid"><div class="field keyword"><label for="adsKeyword">Product keyword</label><input class="input" id="adsKeyword" placeholder="e.g. solar panel"></div><div class="field"><label for="adsCountry">Country</label><select class="input select" id="adsCountry"><option value="Malaysia" selected>Malaysia</option><option value="Singapore">Singapore</option><option value="Indonesia">Indonesia</option><option value="Thailand">Thailand</option><option value="Philippines">Philippines</option><option value="Vietnam">Vietnam</option></select></div><div class="field"><label for="adsPages">Depth</label><select class="input select" id="adsPages"><option value="8">Up to 240 ads</option><option value="12" selected>Up to 360 ads</option><option value="20">Up to 600 ads</option></select></div><button id="adsButton" class="primary" type="submit">Research market</button></div><p class="form-note" id="formNote">Enter a business, a location, or both. A stable report link is created immediately.</p></form>
      <div class="workspace">
        <section id="activeSection" class="hidden"><div class="section-head"><h2>Active work</h2><span class="section-note">Research continues in the background. You may switch views safely.</span></div><div id="jobs" class="jobs"></div></section>
        <section id="searchOutput" class="hidden"><div class="section-head"><h2 id="resultTitle">Search results</h2><span id="resultNote" class="section-note"></span></div><div id="resultSummary" class="result-summary"></div><div id="companies" class="company-list"></div></section>
        <section id="discoverEmpty"><div class="empty">Your latest business list will appear here.</div></section>
      </div>
    </section>
    <section id="telemarketingView" class="view">
      <div class="library-hero">
        <div class="eyebrow">Territory Coverage & Market Scans</div>
        <h1>Telemarketing Lead Map.</h1>
        <p>Systematically blanket commercial zones and neighborhoods across Johor. Drill down by District, Town, and Taman to dispatch Google Maps business market scans.</p>
      </div>
      <div class="result-summary" style="margin-top:24px;">
        <div class="metric"><strong id="teleDistrictsCount">10</strong><span>Districts</span></div>
        <div class="metric"><strong id="teleTownsCount">70</strong><span>Towns & Zones</span></div>
        <div class="metric"><strong id="teleTamansCount">771</strong><span>Total Tamans</span></div>
        <div class="metric"><strong id="teleScannedCount" style="color:var(--ok);">0</strong><span>Tamans Scanned</span></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:24px 0 20px;padding:16px 20px;background:#f8f9fa;border:1px solid var(--line);border-radius:6px;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;flex:1;min-width:280px;">
          <div style="display:flex;flex-direction:column;gap:3px;">
            <span style="font:var(--micro);text-transform:uppercase;color:var(--muted);letter-spacing:var(--track)">State</span>
            <select class="input select" id="teleStateSelect" onchange="loadTelemarketingView()" style="height:38px;font-size:13px;font-weight:600;min-width:110px;">
              <option value="johor" selected>Johor</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <span style="font:var(--micro);text-transform:uppercase;color:var(--muted);letter-spacing:var(--track)">Search Term / Category</span>
            <input class="input" id="teleCategory" value="business" placeholder="e.g. business, cafe, clinic, contractor" style="height:38px;font-size:13.5px;max-width:240px;" title="Keyword prepended to search, e.g. 'business in Ros Merah, Johor Jaya'">
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <span style="font:var(--micro);text-transform:uppercase;color:var(--muted);letter-spacing:var(--track)">Max Results</span>
            <select class="input select" id="teleMaxResults" style="height:38px;font-size:13px;width:110px;">
              <option value="200" selected>200 leads</option>
              <option value="400">400 leads</option>
              <option value="600">600 leads</option>
              <option value="100">100 leads</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:180px;">
            <span style="font:var(--micro);text-transform:uppercase;color:var(--muted);letter-spacing:var(--track)">Filter Territory</span>
            <input class="input" id="teleFilterInput" oninput="filterTerritoryCards()" placeholder="Search town or taman (e.g. Ros Merah, Austin)..." style="height:38px;font-size:13.5px;">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <button class="filter" type="button" onclick="expandAllDistricts(true)">Expand All</button>
          <button class="filter" type="button" onclick="expandAllDistricts(false)">Collapse All</button>
          <button class="primary" type="button" onclick="loadTelemarketingView()" style="height:38px;padding:0 14px;">Refresh</button>
        </div>
      </div>
      <div id="teleTerritoryContainer">
        <div class="empty">Loading Johor territory directory…</div>
      </div>
    </section>
    <section id="leadsView" class="view">
      <div class="library-hero">
        <div class="eyebrow">Master Company Directory & Lead Distribution</div>
        <h1>Leads master list.</h1>
        <p>Deduplicated master list of all discovered companies. Assign leads to telemarketers, track contact outcomes, and inspect deep research dossiers.</p>
      </div>
      <div id="leadsSummary" class="result-summary lead-summary-grid" style="margin-top:24px;">
        <div class="metric"><strong id="statTotal">0</strong><span>Total Companies</span></div>
        <div class="metric"><strong id="statUnassigned" style="color:var(--accent);">0</strong><span>Unassigned Leads</span></div>
        <div class="metric"><strong id="statAssigned">0</strong><span>Assigned</span></div>
        <div class="metric"><strong id="statContacted" style="color:var(--ok);">0</strong><span>Contacted / Won</span></div>
        <div class="metric" onclick="switchView('contacts')" style="cursor:pointer;" title="View Contacts Master list"><strong id="statContacts" style="color:var(--ok);">0</strong><span>Contacts Found →</span></div>
        <div class="metric" onclick="setLeadStatusFilter('hidden')" style="cursor:pointer;" title="View hidden companies"><strong id="statHidden" style="color:var(--muted);">0</strong><span>Hidden Leads</span></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:24px 0 16px;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;flex:1;min-width:280px;">
          <input class="input" id="leadSearch" placeholder="Search company, phone, location, category…" style="max-width:320px;height:40px;font-size:14px;" onkeydown="if(event.key==='Enter')applyLeadFilter()">
          <button class="primary" type="button" onclick="applyLeadFilter()" style="height:40px;padding:0 16px;">Search</button>
          <select class="input select" id="leadTeleFilter" onchange="applyLeadFilter()" style="max-width:180px;height:40px;font-size:13px;">
            <option value="all">All Telemarketers</option>
            <option value="unassigned">Unassigned Only</option>
          </select>
          <select class="input select" id="leadResearchFilter" onchange="applyLeadFilter()" style="max-width:190px;height:40px;font-size:13px;">
            <option value="all">All Research</option>
            <option value="contacts_found">📞 Contacts Found (Highlighted)</option>
            <option value="no_contacts">No Contact Research</option>
            <option value="researched">Dossier Ready</option>
            <option value="unresearched">No Dossier</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="filter" type="button" onclick="switchView('contacts')">Contacts Master →</button>
          <button class="filter" type="button" onclick="switchView('agents')">Manage Agents →</button>
          <button class="filter" type="button" onclick="runDedupAction()" title="Merge duplicate branches and duplicate phone contacts">Run Dedup</button>
          <button class="filter" type="button" onclick="exportLeadsCsv()">Export CSV</button>
          <button class="filter" type="button" id="btnQueueContacts" onclick="queueContactAll(this)" style="color:var(--ok);border-color:var(--ok);background:#ecfdf5;" title="Queue contact research for every company on this page that has none yet">Contacts ⚡ Queue all</button>
        </div>
      </div>
      <div class="filters" role="group" aria-label="Lead status" style="margin:16px 0 20px;">
        <button class="filter active" data-lead-status="all" onclick="setLeadStatusFilter('all')">All (<span id="countAll">0</span>)</button>
        <button class="filter" data-lead-status="unassigned" onclick="setLeadStatusFilter('unassigned')">Unassigned (<span id="countUnassigned">0</span>)</button>
        <button class="filter" data-lead-status="assigned" onclick="setLeadStatusFilter('assigned')">Assigned (<span id="countAssigned">0</span>)</button>
        <button class="filter" data-lead-status="contacted" onclick="setLeadStatusFilter('contacted')">Contacted (<span id="countContacted">0</span>)</button>
        <button class="filter" data-lead-status="interested" onclick="setLeadStatusFilter('interested')">Interested (<span id="countInterested">0</span>)</button>
        <button class="filter" data-lead-status="not_interested" onclick="setLeadStatusFilter('not_interested')">Not Interested (<span id="countNotInterested">0</span>)</button>
        <button class="filter" data-lead-status="do_not_call" onclick="setLeadStatusFilter('do_not_call')">DNC (<span id="countDnc">0</span>)</button>
        <button class="filter" data-lead-status="hidden" onclick="setLeadStatusFilter('hidden')">🚫 Hidden (<span id="countHidden">0</span>)</button>
      </div>
      <div id="bulkBar" class="search-sheet hidden" style="margin:0 0 20px;padding:16px 20px;box-shadow:none;border-color:var(--accent);background:#f0f4ff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <strong style="font-size:13px;color:var(--ink);"><span id="bulkCount">0</span> selected</strong>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="selectAllPage" onchange="toggleSelectAllPage(this.checked)"> Select all on this page
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <select class="input select" id="bulkAssignSelect" style="height:38px;font-size:13px;background-color:#fff;min-width:180px;">
            <option value="">Choose telemarketer...</option>
          </select>
          <button class="primary" type="button" onclick="bulkAssignSelected()" style="height:38px;padding:0 16px;">Assign Selected</button>
          <button class="filter" type="button" onclick="bulkUnassignSelected()" style="height:38px;">Unassign</button>
          <button class="filter" id="btnBulkHide" type="button" onclick="bulkHideSelected(true)" style="height:38px;color:var(--muted);" title="Hide selected companies from master list">🚫 Hide Selected</button>
          <button class="filter" id="btnBulkUnhide" type="button" onclick="bulkHideSelected(false)" style="height:38px;color:var(--ok);border-color:var(--ok);background:#ecfdf5;" title="Unhide and restore selected companies">👁️ Unhide Selected</button>
        </div>
      </div>
      <div id="leadTableWrapper" class="company-list">
        <div class="empty">Loading company master list…</div>
      </div>
      <div id="leadPagination" style="display:flex;align-items:center;justify-content:space-between;padding:24px 0 32px;border-top:1px solid var(--line);margin-top:20px;">
        <span id="pageInfo" style="font:500 12px/1 var(--mono);color:var(--muted);">Showing 0 of 0</span>
        <div style="display:flex;gap:8px;">
          <button id="btnPrevLeads" class="filter" type="button" onclick="prevLeadsPage()" disabled>&larr; Previous</button>
          <button id="btnNextLeads" class="filter" type="button" onclick="nextLeadsPage()" disabled>Next &rarr;</button>
        </div>
      </div>
    </section>
    <section id="contactsView" class="view">
      <div class="library-hero">
        <div class="eyebrow">People, grouped by company</div>
        <h1>Contacts master list.</h1>
        <p>Every named person we have found, listed under their company — name, position, contact details, and the source of that information.</p>
      </div>
      <div id="contactsSummary" class="result-summary lead-summary-grid" style="margin-top:24px;">
        <div class="metric"><strong id="statContactsTotalCompanies">0</strong><span>Companies with People</span></div>
        <div class="metric"><strong id="statContactsTotalDMs" style="color:var(--accent);">0</strong><span>People</span></div>
        <div class="metric"><strong id="statContactsTotalPhones" style="color:var(--ok);">0</strong><span>Direct Phones</span></div>
        <div class="metric"><strong id="statContactsTotalMobile" style="color:var(--ok);">0</strong><span>WhatsApp / Mobile</span></div>
        <div class="metric"><strong id="statContactsTotalEmails">0</strong><span>Direct Emails</span></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:24px 0 16px;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;flex:1;min-width:280px;">
          <input class="input" id="contactsSearch" placeholder="Search person name, title, company, phone, email..." style="max-width:320px;height:40px;font-size:14px;" onkeydown="if(event.key==='Enter')applyContactsFilter()">
          <button class="primary" type="button" onclick="applyContactsFilter()" style="height:40px;padding:0 16px;">Search</button>
          <select class="input select" id="contactsTypeFilter" onchange="applyContactsFilter()" style="max-width:200px;height:40px;font-size:13px;">
            <option value="all" selected>All contacts</option>
            <option value="has_decision_makers">Named people only</option>
            <option value="has_mobile">💬 Has WhatsApp / Mobile</option>
            <option value="has_email">✉️ Has Direct Email</option>
            <option value="researched_only">⚡ Researched Only</option>
          </select>
          <select class="input select" id="contactsTeleFilter" onchange="applyContactsFilter()" style="max-width:180px;height:40px;font-size:13px;">
            <option value="all">All Telemarketers</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="filter" type="button" onclick="loadContactsView()">Refresh</button>
          <button class="filter" type="button" onclick="exportContactsCsv()">Export Contacts CSV</button>
        </div>
      </div>
      <div id="contactsContainer" class="company-list">
        <div class="empty">Loading contacts master list…</div>
      </div>
      <div id="contactsPagination" style="display:flex;align-items:center;justify-content:space-between;padding:24px 0 32px;border-top:1px solid var(--line);margin-top:20px;">
        <span id="contactsPageInfo" style="font:500 12px/1 var(--mono);color:var(--muted);">Showing 0 of 0 companies</span>
        <div style="display:flex;gap:8px;">
          <button id="btnPrevContacts" class="filter" type="button" onclick="prevContactsPage()" disabled>&larr; Previous</button>
          <button id="btnNextContacts" class="filter" type="button" onclick="nextContactsPage()" disabled>Next &rarr;</button>
        </div>
      </div>
    </section>
    <section id="agentsView" class="view">
      <div class="library-hero">
        <div class="eyebrow">Telemarketer Team & Lead Allocation</div>
        <h1>Manage Telemarketers.</h1>
        <p>Register telemarketer agents, track active assignments, monitor calling conversion rates, and manage individual queues.</p>
      </div>
      <div class="result-summary" style="margin-top:24px;">
        <div class="metric"><strong id="agentsTotalCount">0</strong><span>Total Agents</span></div>
        <div class="metric"><strong id="agentsActiveCount" style="color:var(--ok);">0</strong><span>Active Agents</span></div>
        <div class="metric"><strong id="agentsTotalLeadsCount">0</strong><span>Leads Assigned</span></div>
        <div class="metric"><strong id="agentsContactedCount" style="color:var(--warn);">0</strong><span>Contacted Leads</span></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:24px 0 20px;padding:16px 20px;background:#f8f9fa;border:1px solid var(--line);border-radius:6px;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;flex:1;min-width:280px;">
          <input class="input" id="agentFilterInput" oninput="filterAgents()" placeholder="Search agents by name, phone, or notes..." style="height:38px;font-size:13.5px;max-width:320px;">
          <select class="input select" id="agentStatusFilter" onchange="filterAgents()" style="height:38px;font-size:13px;width:130px;">
            <option value="all" selected>All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <select class="input select" id="agentRoleFilter" onchange="filterAgents()" style="height:38px;font-size:13px;width:190px;" title="Filter by access tag imported from atap.solar">
            <option value="all" selected>All Access Tags</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="primary" type="button" onclick="toggleCreateAgentForm(true)" style="height:38px;padding:0 14px;">+ New Telemarketer</button>
          <button class="filter" type="button" id="importAgentsBtn" onclick="importAgentsFromAtap(this)" style="height:38px;padding:0 14px;" title="Pull sales agents from calculator.atap.solar into the roster">⤓ Import from atap.solar</button>
          <button class="filter" type="button" onclick="loadAgentsView()" style="height:38px;padding:0 14px;">Refresh</button>
        </div>
      </div>

      <form id="agentFormSheet" class="search-sheet hidden" onsubmit="saveAgentForm(event)" style="margin:0 0 24px;border-radius:6px;">
        <div class="sheet-head" style="margin-bottom:16px;">
          <span class="sheet-title" id="agentFormTitle">Create New Telemarketer</span>
          <button type="button" class="back" onclick="toggleCreateAgentForm(false)">Cancel ✕</button>
        </div>
        <input type="hidden" id="agentFormId" value="">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;">
          <div class="field">
            <label for="agentFormName">Agent Name *</label>
            <input class="input" id="agentFormName" placeholder="e.g. Sarah Tan, John Lee" required>
          </div>
          <div class="field">
            <label for="agentFormPhone">Phone / WhatsApp</label>
            <input class="input" id="agentFormPhone" placeholder="e.g. +6012-3456789">
          </div>
          <div class="field">
            <label for="agentFormEmail">Email Address</label>
            <input class="input" id="agentFormEmail" type="email" placeholder="e.g. sarah@company.com">
          </div>
          <div class="field">
            <label for="agentFormStatus">Account Status</label>
            <select class="input select" id="agentFormStatus">
              <option value="true" selected>Active (Can Receive Leads)</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top:16px;">
          <label for="agentFormNotes">Focus Notes / Territory Specialization</label>
          <input class="input" id="agentFormNotes" placeholder="e.g. Specializes in Johor Bahru cafes & F&B leads">
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;align-items:center;">
          <button class="primary" type="submit" id="agentFormSubmitBtn">Save Telemarketer</button>
          <button class="filter" type="button" onclick="toggleCreateAgentForm(false)">Cancel</button>
        </div>
      </form>

      <div id="agentsContainer" class="agent-grid">
        <div class="empty">Loading telemarketers roster…</div>
      </div>
    </section>
    <section id="libraryView" class="view"><div class="library-hero"><div class="eyebrow">Persistent knowledge base</div><h1>Research library.</h1><p>Browse every market scan, company dossier and VIP brief in one place. Completed public reports keep the same permanent link.</p><div class="library-tools"><button id="retryFailedButton" class="primary" type="button" onclick="retryFailedReports(this)">Re-run all failed reports</button><span id="retryFailedNote" class="retry-note" role="status" aria-live="polite"></span></div></div><div class="filters" role="group" aria-label="Report type"><button class="filter active" data-filter="all" onclick="setFilter('all')">All reports</button><button class="filter" data-filter="company_research" onclick="setFilter('company_research')">Company research</button><button class="filter" data-filter="contact_research" onclick="setFilter('contact_research')">Contacts</button><button class="filter" data-filter="person_research" onclick="setFilter('person_research')">VIP briefs</button><button class="filter" data-filter="ads_research" onclick="setFilter('ads_research')">Ads</button><button class="filter" data-filter="ads_market" onclick="setFilter('ads_market')">Ads market</button><button class="filter" data-filter="business_search" onclick="setFilter('business_search')">Business lists</button></div><div id="reportList" class="report-list"><div class="empty">Loading research library…</div></div></section>
  </main>
  <nav class="mobile-nav" aria-label="Workspace"><button class="mobile-tab active" data-view="discover" onclick="switchView('discover')"><span></span>Home</button><button class="mobile-tab" data-view="telemarketing" onclick="switchView('telemarketing')"><span></span>Map</button><button class="mobile-tab" data-view="leads" onclick="switchView('leads')"><span></span>Leads</button><button class="mobile-tab" data-view="contacts" onclick="switchView('contacts')"><span></span>Contacts</button><button class="mobile-tab" data-view="agents" onclick="switchView('agents')"><span></span>Agents</button><button class="mobile-tab" data-view="library" onclick="switchView('library')"><span></span>Reports</button><a class="mobile-tab" href="/guide" target="_blank" rel="noopener"><span></span>Guide</a></nav>
</div><div id="toast" class="toast" role="status"></div>
<script>
'use strict';
${TOKEN_STORE_JS}
var state={token:'',jobs:{},reports:[],filter:'all',mode:'market',toastTimer:null};
var terminal=['completed','partial','failed'];
function el(id){return document.getElementById(id)}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function attr(value){return esc(value)}
function safeId(value){return /^[A-Za-z0-9_-]{20}$/.test(String(value==null?'':value))?String(value):''}
function safeUrl(value){try{var u=new URL(String(value));return u.protocol==='https:'||u.protocol==='http:'?u.href:''}catch(e){return ''}}
function date(value){try{return new Intl.DateTimeFormat('en',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value))}catch(e){return 'Undated'}}
function showToast(message){var node=el('toast');node.textContent=message;node.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(function(){node.classList.remove('show')},3600)}
function copyText(text,label){if(!text)return;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){showToast('Copied: '+(label||text))}).catch(function(){fallbackCopy(text,label)})}else{fallbackCopy(text,label)}}
function fallbackCopy(text,label){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showToast('Copied: '+(label||text))}catch(e){showToast('Failed to copy')}finally{document.body.removeChild(ta)}}
async function api(path,options){options=options||{};var headers=Object.assign({'Authorization':'Bearer '+state.token},options.headers||{});if(options.body)headers['Content-Type']='application/json';var response=await fetch(path,Object.assign({},options,{headers:headers}));var text=await response.text();var body={};try{body=text?JSON.parse(text):{}}catch(e){body={error:text||'Invalid server response'}}if(!response.ok){var message=typeof body.error==='string'?body.error:(body.error&&body.error.message)||('Request failed: '+response.status);var error=new Error(message);error.status=response.status;throw error}return body}
async function connect(event){if(event)event.preventDefault();var key=el('accessKey').value.trim();if(!key)return;state.token=key;el('connectButton').disabled=true;el('gateError').textContent='';try{await api('/api/reports?limit=1');eeKey.save(key);el('accessGate').classList.add('hidden');el('portalApp').removeAttribute('inert');el('portalApp').setAttribute('aria-hidden','false');await loadLibrary();showToast('Workspace connected')}catch(error){state.token='';el('gateError').textContent=error.status===401?'Access key not accepted.':error.message}finally{el('connectButton').disabled=false}}
function disconnect(){eeKey.clear();state.token='';location.reload()}
function authLost(error){if(error&&error.status===401){eeKey.clear();state.token='';el('accessGate').classList.remove('hidden');el('gateError').textContent='Your access expired. Enter the workspace key again.';return true}return false}
function switchView(name){document.querySelectorAll('.view').forEach(function(node){node.classList.toggle('active',node.id===name+'View')});document.querySelectorAll('[data-view]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-view')===name)});if(name==='library')loadLibrary();else if(name==='leads')loadLeadsView();else if(name==='contacts')loadContactsView();else if(name==='telemarketing')loadTelemarketingView();else if(name==='agents')loadAgentsView();else goHome();window.scrollTo({top:0,behavior:'smooth'})}
function upsertJob(report,kind){state.jobs[report.id]=Object.assign({},state.jobs[report.id]||{},{report:report,kind:kind});renderJobs()}
function renderJobs(){var values=Object.keys(state.jobs).map(function(key){return state.jobs[key]});el('activeSection').classList.toggle('hidden',values.length===0);el('jobs').innerHTML=values.map(function(job){var r=job.report;var done=terminal.indexOf(r.status)>=0;var pulse=r.status==='failed'?'bad':done?'done':'';var label=job.kind==='search'?'Market scan':job.kind==='lookup'?'Company lookup':job.kind==='vip'?'VIP brief':job.kind==='ads'?'Ads':job.kind==='contact'?'Contact research':'Company research';var open=safeUrl(r.view_url);return '<article class="job"><div class="job-type">'+label+'</div><div><div class="job-title">'+esc(r.title)+'</div><div class="job-meta">'+esc(r.status)+' · '+esc(r.id)+'</div></div><div class="job-action"><span class="pulse '+pulse+'"></span>'+(open?'<a class="text-action" target="_blank" rel="noopener" href="'+attr(open)+'">View <span>↗</span></a>':'')+'</div></article>'}).join('')}
function poll(report,kind){upsertJob(report,kind);if(terminal.indexOf(report.status)>=0)return;setTimeout(async function(){try{var body=await api(report.api_url);upsertJob(body.report,kind);if(terminal.indexOf(body.report.status)<0){poll(body.report,kind);return}await loadLibrary();if((kind==='search'||kind==='lookup')&&body.report.status!=='failed'){renderSearch(body,kind)}if(kind==='deep'){showToast(body.report.status==='failed'?'Company research failed':'Company dossier is ready')}if(kind==='vip'){showToast(body.report.status==='failed'?'VIP brief failed':'VIP brief is ready')}if(kind==='adsmarket'){showToast(body.report.status==='failed'?'Ads market research failed':'Ads market report is ready')}if(kind==='contact'){showToast(body.report.status==='failed'?'Contact research failed':'Contact details are ready')}if(body.report.status==='failed')showToast(body.report.error||'Research failed')}catch(error){if(!authLost(error)){showToast(error.message);if(error.status===404){forgetReport(report.id)}else{poll(report,kind)}}}},5000)}
var HOME={eyebrow:'Live market discovery',title:'Find the companies worth knowing.',copy:'Pick one. Nothing is researched until you say so.'};
function choose(choice){if(choice==='reports')return switchView('library');el('chooser').classList.add('hidden');el('searchForm').classList.remove('hidden');el('discoverEmpty').classList.add('hidden');setMode(choice)}
function goHome(){el('searchForm').classList.add('hidden');el('chooser').classList.remove('hidden');el('heroEyebrow').textContent=HOME.eyebrow;el('heroTitle').textContent=HOME.title;el('heroCopy').textContent=HOME.copy;window.scrollTo({top:0,behavior:'smooth'})}
var MODES={market:{eyebrow:'Market discovery',title:'Build a business list.',copy:'Scan a market from the residential Google Maps scout. Every business comes back with its contact points and a deep-research button.',sheet:'Business list',note:'Enter a business, a location, or both. A stable report link is created immediately.',focus:'keyword'},company:{eyebrow:'One company, four rounds',title:'Research one company.',copy:'The name is matched on Google Maps first. You pick the right listing, and only then does research start.',sheet:'Company research',note:'The name is looked up on Google Maps and the matches come back for you to confirm. Nothing is researched until you pick one.',focus:'companyName'},adsmarket:{eyebrow:'Every advertiser in one market',title:'See what the market is advertising.',copy:'One product keyword returns every live Facebook ad in that market \u2014 who is running them, what they offer, how long each has survived, and what nobody is saying.',sheet:'Ads market research',note:'The Facebook Ad Library carries no spend or impression data, so advertisers are ranked by ad count, distinct creatives and how long an ad has run.',focus:'adsKeyword'}};
function setMode(mode){state.mode=mode;document.querySelectorAll('[data-mode]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-mode')===mode)});el('marketGrid').classList.toggle('hidden',mode!=='market');el('companyGrid').classList.toggle('hidden',mode!=='company');el('adsGrid').classList.toggle('hidden',mode!=='adsmarket');var m=MODES[mode]||MODES.market;el('heroEyebrow').textContent=m.eyebrow;el('heroTitle').textContent=m.title;el('heroCopy').textContent=m.copy;el('sheetTitle').textContent=m.sheet;el('formNote').textContent=m.note;setTimeout(function(){var node=el(m.focus);if(node)node.focus()},40)}
async function startLookup(){var name=el('companyName').value.trim();if(!name){showToast('Enter the company name.');el('companyName').focus();return}var place=el('companyPlace').value.trim();var button=el('lookupButton');button.disabled=true;button.textContent='Looking up…';try{var body=await api('/api/business-search',{method:'POST',body:JSON.stringify({keyword:name,place:place||undefined,max:10,requesterId:'portal:company-lookup'})});el('discoverEmpty').classList.add('hidden');upsertJob(body.report,'lookup');poll(body.report,'lookup');showToast('Looking up '+name+' on Google Maps')}catch(error){if(!authLost(error))showToast(error.message)}finally{button.disabled=false;button.textContent='Find company'}}
async function startAdsMarket(){var keyword=el('adsKeyword').value.trim();if(!keyword){showToast('Enter a product keyword.');el('adsKeyword').focus();return}var button=el('adsButton');button.disabled=true;button.textContent='Starting\u2026';try{var body=await api('/api/ads-market',{method:'POST',body:JSON.stringify({keyword:keyword,country:el('adsCountry').value,pages:Number(el('adsPages').value),requesterId:'portal'})});el('discoverEmpty').classList.add('hidden');upsertJob(body.report,'adsmarket');poll(body.report,'adsmarket');showToast('Ads market research started')}catch(error){if(!authLost(error))showToast(error.message)}finally{button.disabled=false;button.textContent='Research market'}}
async function startSearch(event){event.preventDefault();if(state.mode==='adsmarket')return startAdsMarket();if(state.mode==='company')return startLookup();var keyword=el('keyword').value.trim();var place=el('place').value.trim();if(!keyword&&!place){showToast('Enter a business, a location, or both.');el('keyword').focus();return}var button=el('searchButton');button.disabled=true;button.textContent='Starting…';try{var body=await api('/api/business-search',{method:'POST',body:JSON.stringify({keyword:keyword||undefined,place:place||undefined,max:Number(el('maxResults').value),requesterId:'portal'})});el('discoverEmpty').classList.add('hidden');upsertJob(body.report,'search');poll(body.report,'search');showToast('Market search started')}catch(error){if(!authLost(error))showToast(error.message)}finally{button.disabled=false;button.textContent='Search market'}}
function renderSearch(body,kind){var lookup=kind==='lookup';var companies=(body.data&&body.data.companies)||[];var report=body.report||{};var request=(body.data&&body.data.report&&body.data.report.request)||{};el('searchOutput').classList.remove('hidden');el('discoverEmpty').classList.add('hidden');el('resultTitle').textContent=lookup?'Which one is yours?':(report.title||'Business list');el('resultNote').textContent=lookup?(companies.length+' Google Maps matches · pick the right listing to start deep research on it'):(companies.length+' businesses · use Direct Deep Research to investigate any company');var phones=companies.filter(function(c){return c.phone}).length;var sites=companies.filter(function(c){return c.website}).length;el('resultSummary').innerHTML=metric(companies.length,'Businesses')+metric(phones,'Phone contacts')+metric(sites,'Websites')+metric(report.status==='partial'?'Partial':'Ready','Report status');el('companies').innerHTML=companies.length?companies.map(companyRow).join(''):'<div class="empty">No businesses returned.</div>';setTimeout(function(){el('searchOutput').scrollIntoView({behavior:'smooth',block:'start'})},120)}
function metric(value,label){return '<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>'}
function companyRow(company,index){var website=safeUrl(company.website);var maps=safeUrl(company.maps_url||company.mapsUrl);var phone=company.phone||'';var rating=company.rating?(' · ★ '+company.rating+(company.reviews?' / '+company.reviews+' reviews':'')):'';var hasContact=Boolean(company.contact_public_id&&(company.contact_status==='completed'||company.contact_status==='partial'));var contactPhones=Number(company.contact_phones_count)||0;var contactDMs=Number(company.contact_decision_makers_count)||0;var contactPill=hasContact?('<div class="contact-pill">📞 <strong>'+contactPhones+' Contact Number'+(contactPhones===1?'':'s')+' Found</strong>'+(contactDMs>0?(' · '+contactDMs+' Leader'+(contactDMs===1?'':'s')):'')+'</div>'):'';var contactAction=hasContact?('<a class="research view-report" style="background:#0a6b47;border-color:#0a6b47" target="_blank" rel="noopener" href="/r/'+attr(company.contact_public_id)+'">Contacts ('+contactPhones+' phones) ↗</a>'):('<button class="research" style="background:#0a6b47;border-color:#0a6b47" data-company="'+attr(company.id)+'" data-name="'+attr(company.name||'Company')+'" aria-label="Start contact research for '+attr(company.name||'Company')+'" onclick="startContact(this)">Contacts ⚡</button>');var rerunAction=hasContact?('<button class="research" data-company="'+attr(company.id)+'" data-name="'+attr(company.name||'Company')+'" data-previous-report="'+attr(company.contact_public_id)+'" onclick="rerunOriginalContact(this)">Rerun original contacts ↻</button>'):'';return '<article class="company'+(hasContact?' has-contact-research':'')+'"><div class="number">'+String(company.rank||index+1).padStart(2,'0')+'</div><div><h3>'+esc(company.name||'Unnamed business')+'</h3><div class="meta">'+esc(company.category||'Business')+esc(rating)+'</div>'+contactPill+'</div><div class="address">'+esc(company.address||'Address not published')+'</div><div class="company-contact"><div class="phone">'+esc(phone||'Phone not published')+'</div><div class="company-actions"><button class="research" data-company="'+attr(company.id)+'" data-name="'+attr(company.name||'Company')+'" aria-label="Start deep research for '+attr(company.name||'Company')+'" onclick="startResearch(this)">Deep research →</button>'+contactAction+rerunAction+'<button class="research" data-company="'+attr(company.id)+'" data-name="'+attr(company.name||'Company')+'" onclick="startParallelContact(this)">Parallel contacts ↗</button>'+(phone?'<a class="source-link" href="tel:'+attr(String(phone).replace(/[^+\d]/g,''))+'">Call</a>':'')+(website?'<a class="source-link" target="_blank" rel="noopener" href="'+attr(website)+'">Website</a>':'')+(maps?'<a class="source-link" target="_blank" rel="noopener" href="'+attr(maps)+'">Maps</a>':'')+'</div></div></article>'}
async function startResearch(button){var companyId=button.getAttribute('data-company')||'';var name=button.getAttribute('data-name')||'Company';if(!companyId)return;button.disabled=true;button.textContent='Starting…';try{var body=await api('/api/company-research',{method:'POST',body:JSON.stringify({companyId:companyId,requesterId:'portal'})});var view=safeUrl(body.report&&body.report.view_url);if(view){button.outerHTML='<a class="research view-report" target="_blank" rel="noopener" href="'+attr(view)+'" aria-label="Open research report for '+attr(name)+'">Open report <span>↗</span></a>'}else{button.textContent='Research underway'}upsertJob(body.report,'deep');poll(body.report,'deep');showToast('Deep research started for '+name+'. Open report any time to follow progress.')}catch(error){button.disabled=false;button.textContent='Deep research →';if(!authLost(error))showToast(error.message)}}
async function startContact(button,quiet){var compareToReportId=button.getAttribute('data-previous-report')||null;var originalLabel=button.textContent;var companyId=button.getAttribute('data-company')||'';var name=button.getAttribute('data-name')||'Company';if(!companyId)return false;button.disabled=true;button.textContent='Starting…';try{var body=await api('/api/contact-research',{method:'POST',body:JSON.stringify({companyId:companyId,requesterId:'portal',compareToReportId:compareToReportId||null})});var view=safeUrl(body.report&&body.report.view_url);if(view){button.outerHTML='<a class="research view-report" target="_blank" rel="noopener" href="'+attr(view)+'" aria-label="Open contact report for '+attr(name)+'">'+(compareToReportId?'Open new original report':'Open contacts')+' <span>↗</span></a>'}else{button.textContent='Contacts underway'}upsertJob(body.report,'contact');poll(body.report,'contact');if(!quiet)showToast('Contact research started for '+name+'. Open report any time to follow progress.');return true}catch(error){button.disabled=false;button.textContent=originalLabel;var lost=authLost(error);if(!quiet&&!lost)showToast(error.message);return false}}
async function startParallelContact(button){var companyId=button.getAttribute('data-company')||'';var name=button.getAttribute('data-name')||'Company';if(!companyId)return;button.disabled=true;button.textContent='Starting…';try{var body=await api('/api/parallel-contact-research',{method:'POST',body:JSON.stringify({companyId:companyId,requesterId:'portal'})});var view=safeUrl(body.report&&body.report.view_url);if(view){button.outerHTML='<a class="research view-report" target="_blank" rel="noopener" href="'+attr(view)+'">Open Parallel contacts ↗</a>'}else{button.textContent='Parallel underway'}upsertJob(body.report,'contact');poll(body.report,'contact');showToast('Parallel contact research started for '+name)}catch(error){button.disabled=false;button.textContent='Parallel contacts ↗';if(!authLost(error))showToast(error.message)}}
function rerunOriginalContact(button){return startContact(button,false)}
// One click queues contact research for every row on the current page.
//
// It walks the live DOM rather than leadState.leads so it can reuse
// startContact and get the same row-swap, job registration and poll per
// company — a second code path would drift from what a single click does.
// The walk is sequential on purpose: 30 parallel POSTs would race the
// per-company dedupe on /api/contact-research and let two versions of the
// same company's report through. Rows are already deduped server-side, so
// re-running after a failure only links reports that are already going.
async function queueContactAll(button){var pending=[].slice.call(document.querySelectorAll('#leadTableWrapper button[onclick*="startContact"]'));if(!pending.length){showToast('Nothing to queue — every company on this page already has contact research.');return}if(!window.confirm('Queue contact research for all '+pending.length+' companies on this page?\n\nThey run through the queue one after another.'))return;var was=button.textContent;button.disabled=true;var queued=0,failed=0,i=0;for(;i<pending.length;i++){if(!state.token)break;button.textContent='Queueing '+(i+1)+'/'+pending.length+'…';if(await startContact(pending[i],true))queued++;else failed++}var stopped=!state.token&&i<pending.length;if(stopped)failed+=pending.length-i;button.disabled=false;button.textContent=was;showToast(stopped?('Access expired — '+queued+' queued, '+(pending.length-queued)+' not attempted. Sign in and queue again.'):(failed?(queued+' queued · '+failed+' failed — reload and queue again; reports already running are only linked, never restarted'):(queued+' queued for contact research')))}
// One map from report type to the Active-work label, shared by every caller that
// starts a poll. Inlined ternaries in three places were three chances to disagree
// about what an ads_market row is called.
function kindFor(report){return report.type==='business_search'?'search':report.type==='person_research'?'vip':report.type==='ads_research'?'ads':report.type==='ads_market'?'adsmarket':report.type==='contact_research'?'contact':'deep'}
async function loadLibrary(){if(!state.token)return;var path='/api/reports?limit=100';if(state.filter!=='all')path+='&type='+encodeURIComponent(state.filter);try{var body=await api(path);state.reports=body.reports||[];renderLibrary();state.reports.forEach(function(report){if(terminal.indexOf(report.status)<0&&!state.jobs[report.id])poll(report,kindFor(report))});if(el('telemarketingView').classList.contains('active'))await loadTelemarketingView()}catch(error){if(!authLost(error))showToast(error.message)}}
function setFilter(filter){state.filter=filter;document.querySelectorAll('[data-filter]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-filter')===filter)});loadLibrary()}
function renderLibrary(){var list=state.reports;el('reportList').innerHTML=list.length?list.map(reportRow).join(''):'<div class="empty">No reports in this view yet.</div>'}
async function retryFailedReports(button){if(!state.token)return;button.disabled=true;var note=el('retryFailedNote');note.textContent='Finding failed reports…';try{var failed=[],offset=0,total=0;do{var page=await api('/api/reports?status=failed&limit=100&offset='+offset);failed=failed.concat(page.reports||[]);total=page.total||0;offset+=100}while(offset<total);if(!failed.length){note.textContent='No failed reports to re-run.';return}if(!window.confirm('Re-run all '+failed.length+' failed reports? They will queue with their original inputs and keep their report links.')){note.textContent='';return}var queued=0,errors=[];for(var i=0;i<failed.length;i++){if(!state.token)break;note.textContent='Queueing '+(i+1)+' of '+failed.length+'…';try{var body=await api('/api/reports/'+encodeURIComponent(failed[i].id)+'/retry',{method:'POST'});queued++;if(body.report)poll(body.report,kindFor(body.report))}catch(error){errors.push((failed[i].title||failed[i].id)+': '+error.message);if(authLost(error))break}}await loadLibrary();note.textContent=queued+' queued'+(errors.length?' · '+errors.length+' could not be queued':'')+(state.token?'':' · access expired');if(errors.length)showToast(errors[0]+(errors.length>1?' (and '+(errors.length-1)+' more)':''))}catch(error){note.textContent='Could not load failed reports: '+error.message;if(!authLost(error))showToast(error.message)}finally{button.disabled=false}}
function reportRow(report){var deep=report.type==='company_research';var vip=report.type==='person_research';var contact=report.type==='contact_research';var ready=deep&&(report.status==='completed'||report.status==='partial');var preview=report.preview||{};var view=safeUrl(report.view_url);var summary=deep?(preview.summary||'Company intelligence report'):vip?(preview.summary||'Public-professional VIP brief'):contact?(preview.cheat_sheet&&preview.cheat_sheet.primary_decision_maker?'Target: '+preview.cheat_sheet.primary_decision_maker:'Telemarketing contact intelligence'):(preview.keyword?('Market scan for '+preview.keyword+(preview.place?' in '+preview.place:'')):'Business discovery report');var stats=deep?((preview.contacts||0)+' contacts<br>'+(preview.people||0)+' people<br>'+(preview.signals||0)+' signals'):vip?((preview.facts||0)+' facts<br>'+(preview.signals||0)+' signals'):contact?((preview.decision_makers||0)+' leaders<br>'+(preview.phones||0)+' phones<br>'+(preview.emails||0)+' emails'):((preview.companies==null?'—':preview.companies)+' companies');return '<article class="report"><div class="report-kind">'+(deep?'Company dossier':vip?'VIP brief':contact?'Contact research':'Business list')+'<span class="report-date">'+date(report.created_at)+'</span></div><div><h3>'+esc(report.title)+'</h3><p class="report-summary">'+esc(summary)+'</p>'+(report.type==='business_search'&&report.status==='partial'&&report.error?'<p class="report-summary" style="color:var(--bad)">Save issue: '+esc(report.error)+'</p>':'')+'</div><div class="report-stats"><span class="status '+attr(report.status)+'">'+esc(report.status)+'</span><br>'+stats+'</div><div class="report-actions">'+(view?'<a class="text-action" target="_blank" rel="noopener" href="'+attr(view)+'">Open report <span>↗</span></a>':'')+(deep&&ready?'<button class="text-action" data-report="'+attr(report.id)+'" aria-expanded="false" onclick="togglePeople(this)">People <span>+</span></button>':'')+(deep&&ready?'<button class="text-action" data-report="'+attr(report.id)+'" data-company="'+attr(report.company_id||'')+'" data-name="'+attr(companyName(report))+'" onclick="startAds(this)">Ads research <span>\u2192</span></button>':'')+(report.status==='failed'?'<button class="text-action" data-report="'+attr(report.id)+'" data-title="'+attr(report.title||'Report')+'" aria-label="Re-run report '+attr(report.title||'')+'" onclick="retryReport(this)">Re-run <span>\u21bb</span></button>':'')+(report.repairable?'<button class="text-action" data-report="'+attr(report.id)+'" onclick="repairReport(this)">Repair save <span>↻</span></button>':'')+'<button class="text-action danger" data-report="'+attr(report.id)+'" data-title="'+attr(report.title||'Report')+'" aria-label="Delete report '+attr(report.title||'')+'" onclick="deleteReport(this)">Delete <span>\u00d7</span></button>'+'</div>'+(deep&&ready?'<div class="people-panel hidden" id="people-'+attr(report.id)+'"></div>':'')+'</article>'}
async function togglePeople(button){var id=button.getAttribute('data-report')||'';var panel=el('people-'+id);if(!panel)return;var open=panel.classList.contains('hidden');panel.classList.toggle('hidden',!open);button.setAttribute('aria-expanded',open?'true':'false');button.innerHTML='People <span>'+(open?'\u2212':'+')+'</span>';if(!open||panel.getAttribute('data-loaded')==='1')return;panel.innerHTML='<div class="empty">Loading people\u2026</div>';try{var body=await api('/api/company-research/'+encodeURIComponent(id));panel.innerHTML=peopleHtml(id,(body.data&&body.data.final)||{});panel.setAttribute('data-loaded','1')}catch(error){panel.innerHTML='<div class="empty">'+esc(error.message)+'</div>';if(authLost(error))panel.classList.add('hidden')}}
function peopleHtml(reportId,final){var people=final.people||[];var candidates=final.candidate_people||[];var auto=final.auto_person_research||{};var autoReport=safeId(auto.report_id);var autoPerson=String(auto.person_id==null?'':auto.person_id);var out='';if(people.length){out+='<p class="people-head">Validated people \u00b7 start a VIP brief</p>'+people.map(function(row,i){var pid=String(row.id==null?'':row.id);var role=row.role||row.current_role||row.position||'Role not stated';var evidence=safeUrl(row.role_url||row.role_evidence_url||row.evidence_url);var action;if(pid&&pid===autoPerson&&autoReport){action='<a class="vip" target="_blank" rel="noopener" href="/r/'+attr(autoReport)+'">Open brief <span>\u2197</span></a>'}else if(pid){action='<button class="vip" data-report="'+attr(reportId)+'" data-person="'+attr(pid)+'" aria-label="Start a VIP brief for '+attr(row.name||'this person')+'" onclick="startVip(this)">VIP brief \u2192</button>'}else{action='<span class="person-note">No id \u00b7 cannot be researched</span>'}return '<div class="person-row"><div class="person-rank">P'+String(i+1).padStart(2,'0')+'</div><div><div class="person-name">'+esc(row.name||'Unnamed')+'</div><div class="person-role">'+esc(role)+'</div>'+(evidence?'<a class="person-note" target="_blank" rel="noopener" href="'+attr(evidence)+'">Role evidence \u2197</a>':'<span class="person-note">Role evidence not linked</span>')+'</div>'+action+'</div>'}).join('')}
if(candidates.length){out+='<p class="people-head">Leads to verify \u00b7 role not yet evidenced</p>'+candidates.map(function(row){var source=safeUrl(row.source_url);return '<div class="person-row"><div class="person-rank">\u2014</div><div><div class="person-name">'+esc(row.name||'Unnamed')+'</div><div class="person-role">'+esc(row.role||row.current_role||row.position||'Role not stated')+'</div>'+'<span class="person-note">Named by '+esc(row.source_name||'a public source')+' \u00b7 confirm the role before a brief</span></div>'+(source?'<a class="vip" target="_blank" rel="noopener" href="'+attr(source)+'">Source <span>\u2197</span></a>':'')+'</div>'}).join('')}
return out||'<div class="empty">This dossier validated no people.</div>'}
function companyName(report){var t=String(report.title||'');return t.replace(/\s+intelligence report$/i,'').replace(/\s+ads$/i,'').trim()||t}
async function startAds(button){var name=button.getAttribute('data-name')||'';var companyId=button.getAttribute('data-company')||'';if(!name)return;var markup=button.innerHTML;button.disabled=true;button.textContent='Starting\u2026';try{var body=await api('/api/ads-research',{method:'POST',body:JSON.stringify({name:name,companyId:companyId||undefined,requesterId:'portal'})});var view=safeUrl(body.report&&body.report.view_url);if(view){button.outerHTML='<a class="text-action" target="_blank" rel="noopener" href="'+attr(view)+'">Open ads <span>\u2197</span></a>'}else{button.textContent='Ads underway'}if(body.report)poll(body.report,'ads')}catch(error){button.disabled=false;button.innerHTML=markup;if(!authLost(error))showToast(error.message)}}
async function startVip(button){var reportId=button.getAttribute('data-report')||'';var personId=button.getAttribute('data-person')||'';if(!reportId||!personId)return;button.disabled=true;button.textContent='Starting\u2026';try{var body=await api('/api/person-research',{method:'POST',body:JSON.stringify({companyResearchId:reportId,personId:personId,requesterId:'portal'})});var view=safeUrl(body.report&&body.report.view_url);if(view){button.outerHTML='<a class="vip" target="_blank" rel="noopener" href="'+attr(view)+'">Open brief <span>\u2197</span></a>'}else{button.textContent='Brief underway'}upsertJob(body.report,'vip');poll(body.report,'vip');showToast('VIP brief started. Follow it in Active work.')}catch(error){button.disabled=false;button.textContent='VIP brief \u2192';if(!authLost(error))showToast(error.message)}}
function forgetReport(id){delete state.jobs[id];renderJobs();state.reports=state.reports.filter(function(r){return r.id!==id});renderLibrary()}
async function deleteReport(button){var id=button.getAttribute('data-report')||'';var title=button.getAttribute('data-title')||'this report';if(!id)return;if(!window.confirm('Delete "'+title+'" permanently?\n\nThe report link stops working and its research data and run trail are removed. A run still going is deleted too. This cannot be undone.'))return;button.disabled=true;button.textContent='Deleting…';try{await api('/api/reports/'+encodeURIComponent(id),{method:'DELETE'});forgetReport(id);showToast('Report deleted')}catch(error){if(error.status===404){forgetReport(id);showToast('Report was already deleted');return}button.disabled=false;button.innerHTML='Delete <span>×</span>';if(!authLost(error))showToast(error.message)}}
// One failed row, re-run in place. No confirm: it is one report, it keeps its
// link, and Delete two buttons away is the destructive one. On success the
// library reload flips the row out of failed; the button state is rebuilt
// with the HTML, so only the error path has to put the label back.
async function retryReport(button){var id=button.getAttribute('data-report')||'';var title=button.getAttribute('data-title')||'this report';if(!id)return;button.disabled=true;button.textContent='Queueing…';try{var body=await api('/api/reports/'+encodeURIComponent(id)+'/retry',{method:'POST'});if(body.report)poll(body.report,kindFor(body.report));await loadLibrary();showToast('Re-run queued for "'+title+'" — same report link, follow it in Active work.')}catch(error){button.disabled=false;button.innerHTML='Re-run <span>↻</span>';if(!authLost(error))showToast(error.message)}}
async function repairReport(button){var id=button.getAttribute('data-report')||'';if(!id)return;button.disabled=true;button.textContent='Repairing…';try{var body=await api('/api/reports/'+encodeURIComponent(id)+'/repair',{method:'POST'});await loadLibrary();showToast('Saved '+(body.saved&&body.saved.linked||0)+' businesses from the existing report. No new scan was needed.')}catch(error){button.disabled=false;button.innerHTML='Repair save <span>↻</span>';if(!authLost(error))showToast('Repair failed: '+error.message)}}
var leadState={leads:[],selected:{},telemarketers:[],statusFilter:'all',search:'',teleFilter:'all',researchFilter:'all',page:0,limit:30,total:0};
async function loadLeadsView(){if(!state.token)return;await loadTelemarketers();await loadLeads()}
async function loadTelemarketers(){try{var body=await api('/api/telemarketers');leadState.telemarketers=(body.agents||[]).filter(function(a){return a.active});renderTelemarketerSelectors()}catch(err){if(!authLost(err))showToast('Failed to load telemarketers: '+err.message)}}
function agentValue(a){return a.uid?'uid:'+a.uid:a.name}
function agentLabel(a){return a.uid?a.name+' ('+a.uid+')':a.name}
function renderTelemarketerSelectors(){var filterSelect=el('leadTeleFilter');var bulkSelect=el('bulkAssignSelect');if(filterSelect){var cur=filterSelect.value;var opts='<option value="all">All Telemarketers</option><option value="unassigned">Unassigned Only</option>';leadState.telemarketers.forEach(function(a){opts+='<option value="'+attr(agentValue(a))+'">'+esc(agentLabel(a))+'</option>'});filterSelect.innerHTML=opts;filterSelect.value=cur||'all'}if(bulkSelect){var bOpts='<option value="">Choose telemarketer...</option>';leadState.telemarketers.forEach(function(a){bOpts+='<option value="'+attr(agentValue(a))+'">'+esc(agentLabel(a))+'</option>'});bulkSelect.innerHTML=bOpts}}
async function loadLeads(){if(!state.token)return;var wrapper=el('leadTableWrapper');if(!wrapper)return;var q='/api/leads?limit='+leadState.limit+'&offset='+(leadState.page*leadState.limit);if(leadState.statusFilter!=='all')q+='&status='+encodeURIComponent(leadState.statusFilter);if(leadState.search)q+='&search='+encodeURIComponent(leadState.search);if(leadState.teleFilter!=='all')q+='&assignedTo='+encodeURIComponent(leadState.teleFilter);if(leadState.researchFilter!=='all')q+='&researchStatus='+encodeURIComponent(leadState.researchFilter);wrapper.innerHTML='<div class="empty">Loading company master list…</div>';try{var body=await api(q);leadState.leads=body.leads||[];leadState.total=body.total||0;renderLeadsSummary(body.stats||{});renderLeads(body.leads||[]);renderLeadsPagination(body.total||0)}catch(err){wrapper.innerHTML='<div class="empty error">'+esc(err.message)+'</div>';if(!authLost(err))showToast(err.message)}}
function renderLeadsSummary(stats){var sTotal=el('statTotal');var sUnassigned=el('statUnassigned');var sAssigned=el('statAssigned');var sContacted=el('statContacted');var sContacts=el('statContacts');var sHidden=el('statHidden');if(sTotal)sTotal.textContent=stats.total||0;if(sUnassigned)sUnassigned.textContent=stats.unassigned||0;if(sAssigned)sAssigned.textContent=stats.assigned||0;if(sContacted)sContacted.textContent=(stats.contacted||0)+(stats.interested||0);if(sContacts)sContacts.textContent=stats.contacts_found||0;if(sHidden)sHidden.textContent=stats.hidden||0;var cAll=el('countAll');var cUn=el('countUnassigned');var cAss=el('countAssigned');var cCon=el('countContacted');var cInt=el('countInterested');var cNot=el('countNotInterested');var cDnc=el('countDnc');var cHid=el('countHidden');if(cAll)cAll.textContent=stats.total||0;if(cUn)cUn.textContent=stats.unassigned||0;if(cAss)cAss.textContent=stats.assigned||0;if(cCon)cCon.textContent=stats.contacted||0;if(cInt)cInt.textContent=stats.interested||0;if(cNot)cNot.textContent=stats.not_interested||0;if(cDnc)cDnc.textContent=stats.do_not_call||0;if(cHid)cHid.textContent=stats.hidden||0}
function setLeadStatusFilter(status){leadState.statusFilter=status;leadState.page=0;document.querySelectorAll('[data-lead-status]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-lead-status')===status)});loadLeads()}
function applyLeadFilter(){var searchInput=el('leadSearch');var teleSelect=el('leadTeleFilter');var researchSelect=el('leadResearchFilter');leadState.search=searchInput?searchInput.value.trim():'';leadState.teleFilter=teleSelect?teleSelect.value:'all';leadState.researchFilter=researchSelect?researchSelect.value:'all';leadState.page=0;loadLeads()}
function prevLeadsPage(){if(leadState.page>0){leadState.page--;loadLeads()}}
function nextLeadsPage(){if((leadState.page+1)*leadState.limit<leadState.total){leadState.page++;loadLeads()}}
function renderLeadsPagination(total){var start=leadState.page*leadState.limit+(total>0?1:0);var end=Math.min((leadState.page+1)*leadState.limit,total);var pageInfo=el('pageInfo');var btnPrev=el('btnPrevLeads');var btnNext=el('btnNextLeads');if(pageInfo)pageInfo.textContent='Showing '+start+'–'+end+' of '+total+' companies';if(btnPrev)btnPrev.disabled=leadState.page===0;if(btnNext)btnNext.disabled=end>=total}
function updateBulkBar(){var keys=Object.keys(leadState.selected).filter(function(k){return leadState.selected[k]});var bulkBar=el('bulkBar');var bulkCount=el('bulkCount');if(bulkBar)bulkBar.classList.toggle('hidden',keys.length===0);if(bulkCount)bulkCount.textContent=keys.length}
function toggleSelectLead(id,checked){leadState.selected[id]=checked;updateBulkBar()}
function toggleSelectAllPage(checked){leadState.leads.forEach(function(lead){leadState.selected[lead.id]=checked;var cb=el('leadCheck-'+lead.id);if(cb)cb.checked=checked});updateBulkBar()}
async function bulkAssignSelected(){var keys=Object.keys(leadState.selected).filter(function(k){return leadState.selected[k]});var bulkSelect=el('bulkAssignSelect');var tele=bulkSelect?bulkSelect.value.trim():'';if(!keys.length){showToast('No companies selected.');return}if(!tele){showToast('Choose a telemarketer to assign to.');return}try{var res=await api('/api/leads/assign',{method:'POST',body:JSON.stringify({companyIds:keys,assignedTo:tele})});showToast('Assigned '+(res.updated||keys.length)+' companies to '+tele);leadState.selected={};updateBulkBar();var allCb=el('selectAllPage');if(allCb)allCb.checked=false;await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to assign: '+err.message)}}
async function bulkUnassignSelected(){var keys=Object.keys(leadState.selected).filter(function(k){return leadState.selected[k]});if(!keys.length){showToast('No companies selected.');return}if(!window.confirm('Unassign '+keys.length+' selected companies?'))return;try{var res=await api('/api/leads/unassign',{method:'POST',body:JSON.stringify({companyIds:keys})});showToast('Unassigned '+(res.updated||keys.length)+' companies');leadState.selected={};updateBulkBar();var allCb=el('selectAllPage');if(allCb)allCb.checked=false;await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to unassign: '+err.message)}}
async function toggleHideLead(companyId,hide){try{await api('/api/leads/'+encodeURIComponent(companyId),{method:'PATCH',body:JSON.stringify({isHidden:hide})});showToast(hide?'Company marked as hidden':'Company restored to active list');await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to update lead: '+err.message)}}
async function bulkHideSelected(hide){var keys=Object.keys(leadState.selected).filter(function(k){return leadState.selected[k]});if(!keys.length){showToast('No companies selected.');return}var actionName=hide?'Hide':'Unhide';if(!window.confirm(actionName+' '+keys.length+' selected companies?'))return;try{var res=await api('/api/leads/hide',{method:'POST',body:JSON.stringify({companyIds:keys,hide:hide})});showToast((hide?'Hidden ':'Restored ')+(res.updated||keys.length)+' companies');leadState.selected={};updateBulkBar();var allCb=el('selectAllPage');if(allCb)allCb.checked=false;await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to update companies: '+err.message)}}
async function updateLeadStatus(companyId,selectEl){var status=selectEl.value;selectEl.className='status-select '+status;try{await api('/api/leads/'+encodeURIComponent(companyId),{method:'PATCH',body:JSON.stringify({leadStatus:status})});showToast('Status updated to '+status)}catch(err){if(!authLost(err))showToast('Failed to update status: '+err.message)}}
async function updateLeadAssignee(companyId,selectEl){var assignee=selectEl.value.trim();try{await api('/api/leads/'+encodeURIComponent(companyId),{method:'PATCH',body:JSON.stringify({assignedTo:assignee||null,leadStatus:assignee?'assigned':'unassigned'})});showToast(assignee?'Assigned to '+assignee:'Lead unassigned');await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to update assignment: '+err.message)}}
async function editLeadNotes(companyId,currentNotes){var note=window.prompt('Lead notes / telemarketer feedback:',currentNotes||'');if(note==null)return;try{await api('/api/leads/'+encodeURIComponent(companyId),{method:'PATCH',body:JSON.stringify({notes:note.trim()})});showToast('Notes saved');await loadLeads()}catch(err){if(!authLost(err))showToast('Failed to save notes: '+err.message)}}
function promptLeadNotes(btn){var id=btn.getAttribute('data-id');var notes=btn.getAttribute('data-notes')||'';return editLeadNotes(id,notes)}
function promptAddTelemarketer(){switchView('agents');toggleCreateAgentForm(true)}
var contactsState={groups:[],telemarketers:[],search:'',typeFilter:'all',teleFilter:'all',page:0,limit:20,total:0,stats:null};
async function loadContactsView(){if(!state.token)return;await loadContactsTelemarketers();await loadContacts()}
async function loadContactsTelemarketers(){try{var body=await api('/api/telemarketers');contactsState.telemarketers=body.telemarketers||[];var sel=el('contactsTeleFilter');if(sel){var cur=sel.value;var opts='<option value="all">All Telemarketers</option>';contactsState.telemarketers.forEach(function(t){opts+='<option value="'+attr(t)+'">'+esc(t)+'</option>'});sel.innerHTML=opts;sel.value=cur||'all'}}catch(err){}}
async function loadContacts(){if(!state.token)return;var cont=el('contactsContainer');if(cont&&!contactsState.groups.length)cont.innerHTML='<div class="empty">Loading contacts master list…</div>';var q='/api/contacts?limit='+contactsState.limit+'&offset='+(contactsState.page*contactsState.limit);if(contactsState.typeFilter!=='all')q+='&filter='+encodeURIComponent(contactsState.typeFilter);if(contactsState.search)q+='&search='+encodeURIComponent(contactsState.search);if(contactsState.teleFilter!=='all')q+='&assignedTo='+encodeURIComponent(contactsState.teleFilter);try{var res=await api(q);contactsState.groups=res.groups||[];contactsState.total=res.totalCompanies||res.total||0;contactsState.stats=res.stats||{};renderContactsSummary(res.stats||{});renderContactsCards(contactsState.groups);renderContactsPagination(contactsState.total)}catch(err){if(cont)cont.innerHTML='<div class="empty error">'+esc(err.message)+'</div>';if(!authLost(err))showToast('Failed to load contacts: '+err.message)}}
function renderContactsSummary(stats){var cEl=el('statContactsTotalCompanies');var dEl=el('statContactsTotalDMs');var pEl=el('statContactsTotalPhones');var mEl=el('statContactsTotalMobile');var eEl=el('statContactsTotalEmails');if(cEl)cEl.textContent=stats.totalCompaniesWithContacts||0;if(dEl)dEl.textContent=stats.totalDecisionMakers||0;if(pEl)pEl.textContent=stats.totalPhones||stats.totalDialablePhones||0;if(mEl)mEl.textContent=stats.totalMobileWhatsapp||stats.totalMobilePhones||0;if(eEl)eEl.textContent=stats.totalEmails||stats.totalDirectEmails||0}
function applyContactsFilter(){var sInput=el('contactsSearch');var tSel=el('contactsTypeFilter');var teleSel=el('contactsTeleFilter');contactsState.search=sInput?sInput.value.trim():'';contactsState.typeFilter=tSel?tSel.value:'all';contactsState.teleFilter=teleSel?teleSel.value:'all';contactsState.page=0;loadContacts()}
function prevContactsPage(){if(contactsState.page>0){contactsState.page--;loadContacts()}}
function nextContactsPage(){if((contactsState.page+1)*contactsState.limit<contactsState.total){contactsState.page++;loadContacts()}}
function renderContactsPagination(total){var start=contactsState.page*contactsState.limit+(total>0?1:0);var end=Math.min((contactsState.page+1)*contactsState.limit,total);var pInfo=el('contactsPageInfo');var btnPrev=el('btnPrevContacts');var btnNext=el('btnNextContacts');if(pInfo)pInfo.textContent='Showing '+start+'–'+end+' of '+total+' companies';if(btnPrev)btnPrev.disabled=contactsState.page===0;if(btnNext)btnNext.disabled=end>=total}
function exportContactsCsv(){var q='/api/contacts/export?token='+encodeURIComponent(state.token);if(contactsState.typeFilter!=='all')q+='&filter='+encodeURIComponent(contactsState.typeFilter);if(contactsState.search)q+='&search='+encodeURIComponent(contactsState.search);if(contactsState.teleFilter!=='all')q+='&assignedTo='+encodeURIComponent(contactsState.teleFilter);window.open(q,'_blank')}
function renderContactsCards(groups){
var cont=el('contactsContainer');
if(!cont)return;
if(!groups||!groups.length){
  cont.innerHTML='<div class="empty">No people found in this view. Run contact or company research, or switch the filter to All Companies with Contacts.</div>';
  return;
}
function contactCell(p, companyPhone, companyName){
  var bits=[];
  var dPhone=p.direct_phone||p.directPhone||'';
  var dEmail=p.direct_email||p.directEmail||'';
  var wa=p.whatsapp_url||p.whatsappUrl||'';
  if(dPhone){
    var digits=String(dPhone).replace(/\D/g,'');
    var waHref=safeUrl(wa)||(digits?('https://wa.me/'+digits):'');
    bits.push('<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span class="contact-phone-val">'+esc(dPhone)+'</span><a class="contact-action-btn call-btn" href="tel:'+attr(digits)+'">Call</a>'+(waHref?'<a class="contact-action-btn wa-btn" target="_blank" rel="noopener" href="'+attr(waHref)+'">WhatsApp</a>':'')+'<button class="contact-action-btn copy-btn" type="button" onclick="copyText(\''+attr(dPhone)+'\', \''+attr(p.name)+' Phone\')">Copy</button></div>');
  }
  if(dEmail){
    bits.push('<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><a class="source-link" href="mailto:'+attr(dEmail)+'">'+esc(dEmail)+'</a><button class="contact-action-btn copy-btn" type="button" onclick="copyText(\''+attr(dEmail)+'\', \''+attr(p.name)+' Email\')">Copy</button></div>');
  }
  if(!dPhone && !dEmail && companyPhone){
    var cDigits=String(companyPhone).replace(/\D/g,'');
    bits.push('<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span class="meta">Company line</span><span class="contact-phone-val">'+esc(companyPhone)+'</span><a class="contact-action-btn call-btn" href="tel:'+attr(cDigits)+'">Call</a><button class="contact-action-btn copy-btn" type="button" onclick="copyText(\''+attr(companyPhone)+'\', \''+attr(companyName)+' Phone\')">Copy</button></div>');
  }
  return bits.length?bits.join(''):'<span class="meta">No contact published</span>';
}
function sourceCell(p){
  var label=p.source||'';
  var url=safeUrl(p.evidence_url||p.evidenceUrl||p.profile_url||p.profileUrl||'');
  if(url) return '<a class="person-source" target="_blank" rel="noopener" href="'+attr(url)+'">'+(esc(label||'View source'))+' ↗</a>';
  return label?'<span class="person-source">'+esc(label)+'</span>':'<span class="meta">Source not linked</span>';
}
cont.innerHTML=groups.map(function(grp){
  var cId=grp.company_id||(grp.company&&grp.company.id)||'';
  var cName=grp.company_name||(grp.company&&grp.company.name)||'Company';
  var cAddress=grp.address||(grp.company&&grp.company.address)||'';
  var cCategory=grp.category||(grp.company&&grp.company.category)||'Business';
  var cRating=grp.rating!=null?grp.rating:(grp.company&&grp.company.rating);
  var cReviews=grp.reviews!=null?grp.reviews:(grp.company&&grp.company.reviews);
  var website=safeUrl(grp.website||(grp.company&&grp.company.website));
  var maps=safeUrl(grp.maps_url||(grp.company&&grp.company.mapsUrl));
  var cAssigned=grp.assigned_to||(grp.company&&grp.company.assignedTo)||'';
  var cStatus=grp.lead_status||(grp.company&&grp.company.leadStatus)||'unassigned';
  var contactPid=grp.contact_public_id||(grp.reports&&grp.reports.contactPublicId)||'';
  var researchPid=grp.research_public_id||(grp.reports&&grp.reports.researchPublicId)||'';
  var people=grp.people||grp.decisionMakers||[];
  var phones=grp.phones||[];
  var emails=grp.emails||[];
  var companyPhone=grp.primary_phone||(grp.company&&grp.company.phone)||'';
  if(!people.length){
    phones.forEach(function(ph){
      people.push({name:'',role:ph.label||'Company line',direct_phone:ph.number_e164||ph.number||ph.phone||'',whatsapp_url:ph.whatsapp_url||'',evidence_url:ph.evidence_url||maps,source:ph.label||'Google Maps',unnamed:true,is_primary:false});
    });
    emails.forEach(function(em){
      people.push({name:'',role:em.label||'Company email',direct_email:em.email||'',evidence_url:em.evidence_url||'',source:em.label||'Company email',unnamed:true,is_primary:false});
    });
    if(!people.length && companyPhone){
      people.push({name:'',role:'Company line',direct_phone:companyPhone,evidence_url:maps,source:'Google Maps',unnamed:true,is_primary:false});
    }
  }
  var rating=cRating?(' · ★ '+cRating+(cReviews?' / '+cReviews:'')):'';
  var reportLinks='';
  if(contactPid) reportLinks+='<a class="vip contact-vip" target="_blank" rel="noopener" href="/r/'+attr(contactPid)+'">Contacts dossier ↗</a>';
  if(researchPid) reportLinks+='<a class="vip" target="_blank" rel="noopener" href="/r/'+attr(researchPid)+'">Company dossier ↗</a>';
  var assignedBadge=cAssigned?('<span class="contact-pill-tag phone">'+esc(cAssigned)+'</span>'):'<span class="meta">(Unassigned)</span>';
  var statusBadge=cStatus?('<span class="status '+attr(cStatus)+'">'+esc(String(cStatus).replace('_',' '))+'</span>'):'';
  var peopleHtml;
  if(!people.length){
    peopleHtml='<div class="contact-empty-people">No named person for this company yet.</div>';
  } else {
    peopleHtml='<table class="contact-person-table"><thead><tr><th>Name</th><th>Position</th><th>Contact info</th><th>Source</th></tr></thead><tbody>'+people.map(function(p){
      var unnamed=Boolean(p.unnamed)||!String(p.name||'').trim();
      var isPri=!unnamed&&Boolean(p.is_primary||p.isPrimary);
      var role=p.role||p.position||p.current_role||(unnamed?'Company line':'Role not stated');
      var badge=isPri?' <span class="contact-pill-tag dm">Target</span>':'';
      var nameHtml=unnamed?'<div class="person-name unnamed">Not identified</div>':'<div class="person-name">'+esc(p.name)+badge+'</div>';
      return '<tr class="'+(isPri?'primary-person':'')+'"><td data-label="Name">'+nameHtml+'</td><td data-label="Position" class="person-position">'+esc(role)+'</td><td data-label="Contact info" class="person-contact">'+contactCell(p, unnamed?'':companyPhone, cName)+'</td><td data-label="Source">'+sourceCell(p)+'</td></tr>';
    }).join('')+'</tbody></table>';
  }
  var namedCount=people.filter(function(p){return String(p.name||'').trim()&&!p.unnamed}).length;
  var contactBadge=namedCount?('<span class="contact-pill-tag dm">'+namedCount+' '+(namedCount===1?'person':'people')+'</span>'):(people.length?('<span class="contact-pill-tag phone">'+people.length+' company line'+(people.length===1?'':'s')+'</span>'):'');
  return '<article class="contact-group-card" id="contactGroup-'+attr(cId)+'"><div class="contact-group-head"><div style="flex:1;min-width:0;"><h3 class="contact-group-title">'+esc(cName)+'</h3><div class="contact-group-meta"><span>'+esc(cCategory)+rating+'</span><span>·</span><span>'+esc(cAddress||'Address not published')+'</span></div><div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">'+assignedBadge+statusBadge+contactBadge+'</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">'+reportLinks+(website?'<a class="source-link" target="_blank" rel="noopener" href="'+attr(website)+'">Web</a>':'')+(maps?'<a class="source-link" target="_blank" rel="noopener" href="'+attr(maps)+'">Maps</a>':'')+'</div></div>'+peopleHtml+'</article>';
}).join('');
}
var agentState={agents:[],filter:'',statusFilter:'all',roleFilter:'all'};
// Imported agents carry their atap.solar access tags in the notes line
// "Imported from calculator.atap.solar · roles: sales, team-jb". Parsing the
// tags back out of the notes keeps this a pure client-side filter -- no schema
// change, and manually created agents without the marker simply never match.
function agentRoleTags(agent){
  var m=/roles:\s*(.+)$/i.exec(String(agent.notes||''));
  if(!m)return[];
  return m[1].split(',').map(function(t){return t.trim().toLowerCase()}).filter(Boolean);
}
// One click syncs the whole sales roster from calculator.atap.solar. Existing
// Imported telemarketers are matched by their Atap user UID.
async function importAgentsFromAtap(button){
  if(!window.confirm('Import sales agents from calculator.atap.solar as telemarketers using their Atap user UID?'))return;
  var was=button.textContent;
  button.disabled=true;button.textContent='Importing…';
  try{
    var res=await api('/api/telemarketers/import',{method:'POST',body:JSON.stringify({})});
    showToast('Imported '+res.imported+' sales agent'+(res.imported===1?'':'s')+' ('+res.created+' new · '+res.updated+' updated · '+res.skipped+' non-sales skipped)');
    await loadAgentsView();
  }catch(err){
    if(!authLost(err))showToast('Import failed: '+err.message);
  }finally{
    button.disabled=false;button.textContent=was;
  }
}
async function loadAgentsView(){
  if(!state.token)return;
  var cont=el('agentsContainer');
  if(cont&&!agentState.agents.length)cont.innerHTML='<div class="empty">Loading telemarketers roster…</div>';
  try{
    var res=await api('/api/telemarketers');
    agentState.agents=res.agents||[];
    renderAgentRoleFilter();
    renderAgentsSummary(agentState.agents);
    renderAgents();
  }catch(err){
    if(cont)cont.innerHTML='<div class="empty error">'+esc(err.message)+'</div>';
    if(!authLost(err))showToast('Failed to load telemarketers: '+err.message);
  }
}
function renderAgentsSummary(agents){
  var total=agents.length;
  var active=agents.filter(function(a){return a.active}).length;
  var totalLeads=agents.reduce(function(acc,a){return acc+(a.total_assigned||0)},0);
  var contacted=agents.reduce(function(acc,a){return acc+(a.contacted_count||0)},0);
  var tEl=el('agentsTotalCount');var aEl=el('agentsActiveCount');
  var lEl=el('agentsTotalLeadsCount');var cEl=el('agentsContactedCount');
  if(tEl)tEl.textContent=total;
  if(aEl)aEl.textContent=active;
  if(lEl)lEl.textContent=totalLeads;
  if(cEl)cEl.textContent=contacted;
}
// Rebuild the tag dropdown from the live roster on every load, preserving the
// current selection when the chosen tag still exists.
function renderAgentRoleFilter(){
  var sel=el('agentRoleFilter');
  if(!sel)return;
  var tags={};
  agentState.agents.forEach(function(a){agentRoleTags(a).forEach(function(t){tags[t]=true})});
  var curated=Object.keys(tags).sort();
  var cur=sel.value||'all';
  var html='<option value="all">All Access Tags</option>'+curated.map(function(t){
    return '<option value="'+attr(t)+'">'+esc(t)+'</option>';
  }).join('');
  sel.innerHTML=html;
  sel.value=curated.indexOf(cur)>=0?cur:'all';
}
function filterAgents(){
  var input=el('agentFilterInput');
  var sel=el('agentStatusFilter');
  var roleSel=el('agentRoleFilter');
  agentState.filter=input?input.value.trim().toLowerCase():'';
  agentState.statusFilter=sel?sel.value:'all';
  agentState.roleFilter=roleSel?roleSel.value:'all';
  renderAgents();
}
function renderAgents(){
  var cont=el('agentsContainer');
  if(!cont)return;
  var list=agentState.agents||[];
  var f=agentState.filter;
  var sf=agentState.statusFilter;
  var rf=agentState.roleFilter;
  if(sf==='active')list=list.filter(function(a){return a.active});
  else if(sf==='inactive')list=list.filter(function(a){return !a.active});
  if(rf&&rf!=='all')list=list.filter(function(a){return agentRoleTags(a).indexOf(rf)>=0});
  if(f){
    list=list.filter(function(a){
      if(a.name.toLowerCase().indexOf(f)>=0)return true;
      if(a.phone&&a.phone.toLowerCase().indexOf(f)>=0)return true;
      if(a.email&&a.email.toLowerCase().indexOf(f)>=0)return true;
      if(a.notes&&a.notes.toLowerCase().indexOf(f)>=0)return true;
      if(a.uid&&a.uid.toLowerCase().indexOf(f)>=0)return true;
      return false;
    });
  }
  if(!list.length){
    cont.innerHTML='<div class="empty">No telemarketers found matching filter.</div>';
    return;
  }
  cont.innerHTML=list.map(function(agent){
    var initials=agent.name.split(/\s+/).map(function(w){return w[0]}).slice(0,2).join('').toUpperCase()||'TM';
    var statusBadge=agent.active?'<span class="status completed">Active</span>':'<span class="status" style="color:var(--muted)">Inactive</span>';
    var phoneLink=agent.phone?('<a class="source-link" href="tel:'+attr(agent.phone.replace(/[^+\d]/g,''))+'">'+esc(agent.phone)+'</a>'):'<span class="meta">No phone</span>';
    var emailLink=agent.email?('<a class="source-link" href="mailto:'+attr(agent.email)+'">'+esc(agent.email)+'</a>'):'';
    var waLink='';
    if(agent.phone){
      var digits=agent.phone.replace(/\D/g,'');
      if(digits)waLink='<a class="source-link" target="_blank" rel="noopener" href="https://wa.me/'+attr(digits)+'">WhatsApp</a>';
    }
    return '<article class="agent-card '+(agent.active?'':'inactive')+'" id="agentCard-'+attr(agent.id)+'">'
      +'<div class="agent-card-head">'
      +'<div style="display:flex;gap:12px;align-items:start;flex:1;min-width:0;">'
      +'<div class="agent-avatar">'+esc(initials)+'</div>'
      +'<div class="agent-meta-block">'
      +'<div class="agent-name"><span>'+esc(agent.name)+'</span> '+statusBadge+'</div>'
      +(agent.uid?'<div class="meta">UID: '+esc(agent.uid)+'</div>':'')
      +'<div class="agent-contact-line">'+phoneLink+(emailLink?' · '+emailLink:'')+(waLink?' · '+waLink:'')+'</div>'
      +'</div>'
      +'</div>'
      +'</div>'
      +(agent.notes?('<div class="agent-notes-box">'+esc(agent.notes)+'</div>'):'')
      +'<div class="agent-metrics-row">'
      +'<div class="agent-metric-item"><div class="agent-metric-num">'+(agent.total_assigned||0)+'</div><div class="agent-metric-lbl">Assigned</div></div>'
      +'<div class="agent-metric-item"><div class="agent-metric-num" style="color:var(--warn);">'+(agent.contacted_count||0)+'</div><div class="agent-metric-lbl">Contacted</div></div>'
      +'<div class="agent-metric-item"><div class="agent-metric-num" style="color:var(--ok);">'+(agent.interested_count||0)+'</div><div class="agent-metric-lbl">Interested</div></div>'
      +'<div class="agent-metric-item"><div class="agent-metric-num" style="color:var(--bad);">'+((agent.not_interested_count||0)+(agent.dnc_count||0))+'</div><div class="agent-metric-lbl">Lost/DNC</div></div>'
      +'</div>'
      +'<div class="agent-actions-row">'
      +'<button class="primary" type="button" style="height:32px;padding:0 10px;font-size:9.5px;" data-name="'+attr(agent.name)+'" onclick="viewAgentLeads(this.getAttribute(\'data-name\'))">View Leads ('+(agent.total_assigned||0)+') →</button>'
      +'<button class="filter" type="button" style="height:32px;padding:0 8px;font-size:9px;" data-id="'+attr(agent.id)+'" onclick="editAgent(Number(this.getAttribute(\'data-id\')))">Edit</button>'
      +'<button class="filter" type="button" style="height:32px;padding:0 8px;font-size:9px;" data-id="'+attr(agent.id)+'" data-active="'+(agent.active?'false':'true')+'" onclick="toggleAgentActive(Number(this.getAttribute(\'data-id\')),this.getAttribute(\'data-active\')===\'true\')">'+(agent.active?'Deactivate':'Activate')+'</button>'
      +'<button class="text-action danger" type="button" style="padding:0;font-size:9px;margin-left:auto;" data-id="'+attr(agent.id)+'" data-name="'+attr(agent.name)+'" data-count="'+(agent.total_assigned||0)+'" onclick="deleteAgentPrompt(this)">Delete ×</button>'
      +'</div>'
      +'</article>';
  }).join('');
}
function viewAgentLeads(agentName){
  leadState.teleFilter=agentName;
  var sel=el('leadTeleFilter');
  if(sel)sel.value=agentName;
  switchView('leads');
}
function toggleCreateAgentForm(show){
  var sheet=el('agentFormSheet');
  if(!sheet)return;
  if(show===undefined)show=sheet.classList.contains('hidden');
  sheet.classList.toggle('hidden',!show);
  if(show){
    el('agentFormTitle').textContent='Create New Telemarketer';
    el('agentFormSubmitBtn').textContent='Save Telemarketer';
    el('agentFormId').value='';
    el('agentFormName').value='';
    el('agentFormPhone').value='';
    el('agentFormEmail').value='';
    el('agentFormNotes').value='';
    el('agentFormStatus').value='true';
    el('agentFormName').focus();
    sheet.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function editAgent(agentId){
  var agent=(agentState.agents||[]).find(function(a){return a.id===agentId});
  if(!agent)return;
  toggleCreateAgentForm(true);
  el('agentFormTitle').textContent='Edit Telemarketer: '+agent.name;
  el('agentFormSubmitBtn').textContent='Update Telemarketer';
  el('agentFormId').value=String(agent.id);
  el('agentFormName').value=agent.name||'';
  el('agentFormPhone').value=agent.phone||'';
  el('agentFormEmail').value=agent.email||'';
  el('agentFormNotes').value=agent.notes||'';
  el('agentFormStatus').value=String(agent.active);
}
async function saveAgentForm(event){
  event.preventDefault();
  var id=el('agentFormId').value;
  var name=el('agentFormName').value.trim();
  var phone=el('agentFormPhone').value.trim();
  var email=el('agentFormEmail').value.trim();
  var notes=el('agentFormNotes').value.trim();
  var active=el('agentFormStatus').value==='true';
  if(!name){showToast('Agent name is required');return}
  var btn=el('agentFormSubmitBtn');
  btn.disabled=true;
  try{
    if(id){
      await api('/api/telemarketers/'+encodeURIComponent(id),{
        method:'PATCH',
        body:JSON.stringify({name:name,phone:phone||null,email:email||null,notes:notes||null,active:active})
      });
      showToast('Updated '+name);
    }else{
      await api('/api/telemarketers',{
        method:'POST',
        body:JSON.stringify({name:name,phone:phone||null,email:email||null,notes:notes||null,active:active})
      });
      showToast('Created telemarketer agent '+name);
    }
    toggleCreateAgentForm(false);
    await loadAgentsView();
    await loadTelemarketers();
  }catch(err){
    if(!authLost(err))showToast('Failed to save agent: '+err.message);
  }finally{
    btn.disabled=false;
  }
}
async function toggleAgentActive(id,newActive){
  try{
    await api('/api/telemarketers/'+encodeURIComponent(id),{
      method:'PATCH',
      body:JSON.stringify({active:newActive})
    });
    showToast(newActive?'Agent activated':'Agent deactivated');
    await loadAgentsView();
    await loadTelemarketers();
  }catch(err){
    if(!authLost(err))showToast('Failed to toggle agent status: '+err.message);
  }
}
async function deleteAgentPrompt(btn){
  var id=btn.getAttribute('data-id');
  var name=btn.getAttribute('data-name');
  var count=Number(btn.getAttribute('data-count'))||0;
  var msg='Delete telemarketer '+name+'?';
  if(count>0){
    msg+='\n\nThis will unassign '+count+' leads currently allocated to this agent back to unassigned leads pool.';
  }
  if(!window.confirm(msg))return;
  try{
    await api('/api/telemarketers/'+encodeURIComponent(id)+'?unassign=true',{
      method:'DELETE'
    });
    showToast('Deleted agent '+name);
    await loadAgentsView();
    await loadTelemarketers();
  }catch(err){
    if(!authLost(err))showToast('Failed to delete agent: '+err.message);
  }
}
async function runDedupAction(){if(!window.confirm('Run deduplication pass across company registry?\n\nThis merges duplicate company branches and duplicate phone contacts into their canonical primary record.'))return;try{var res=await api('/api/leads/dedup',{method:'POST'});showToast('Dedup completed: '+(res.merged||0)+' duplicates consolidated');await loadLeads()}catch(err){if(!authLost(err))showToast('Dedup failed: '+err.message)}}
function exportLeadsCsv(){var q='/api/leads/export?token='+encodeURIComponent(state.token);if(leadState.statusFilter!=='all')q+='&status='+encodeURIComponent(leadState.statusFilter);if(leadState.search)q+='&search='+encodeURIComponent(leadState.search);if(leadState.teleFilter!=='all')q+='&assignedTo='+encodeURIComponent(leadState.teleFilter);if(leadState.researchFilter!=='all')q+='&researchStatus='+encodeURIComponent(leadState.researchFilter);window.open(q,'_blank')}
function renderLeads(leads){var wrapper=el('leadTableWrapper');if(!wrapper)return;if(!leads.length){wrapper.innerHTML='<div class="empty">No companies found matching the filter.</div>';return}wrapper.innerHTML=leads.map(function(lead){var checked=Boolean(leadState.selected[lead.id]);var phone=lead.phone||'';var website=safeUrl(lead.website);var maps=safeUrl(lead.maps_url);var rating=lead.rating?(' · ★ '+lead.rating+(lead.reviews?' / '+lead.reviews:'')):'';var branchBadge=lead.branch_count>0?(' <span class="branch-tag" title="'+lead.branch_count+' branches consolidated">'+lead.branch_count+' branch'+(lead.branch_count>1?'es':'')+'</span>'):'';var isHidden=Boolean(lead.is_hidden||leadState.statusFilter==='hidden');var hasContact=Boolean((lead.contact_public_id&&(lead.contact_status==='completed'||lead.contact_status==='partial'))||(lead.research_public_id&&(lead.research_status==='completed'||lead.research_status==='partial'))||Number(lead.contact_phones_count)>0||Number(lead.contact_decision_makers_count)>0);var isContactRunning=Boolean(lead.contact_status==='running'||lead.contact_status==='queued');var contactPhones=Number(lead.contact_phones_count)||0;var contactDMs=Number(lead.contact_decision_makers_count)||0;var contactPill='';if(hasContact){contactPill='<div class="contact-pill" title="'+contactPhones+' phone route'+(contactPhones===1?'':'s')+' and '+contactDMs+' decision maker'+(contactDMs===1?'':'s')+' identified">📞 <strong>'+contactPhones+' Contact Number'+(contactPhones===1?'':'s')+' Found</strong>'+(contactDMs>0?(' · 👤 '+contactDMs+' Leader'+(contactDMs===1?'':'s')):'')+'</div>'}else if(isContactRunning){contactPill='<div class="contact-pill running">⏳ Contact research in progress…</div>'}var contactControl='';if(lead.contact_public_id){contactControl='<a class="vip contact-vip" target="_blank" rel="noopener" href="/r/'+attr(lead.contact_public_id)+'">📞 Contacts ('+contactPhones+' phones) ↗</a>'}else{contactControl='<button class="research" style="background:#0a6b47;border-color:#0a6b47;min-height:36px;" data-company="'+attr(lead.id)+'" data-name="'+attr(lead.name)+'" onclick="startContact(this)">Contacts ⚡</button>'}var rerunActionLead=lead.contact_public_id&&(lead.contact_status==='completed'||lead.contact_status==='partial')?('<button class="research" data-company="'+attr(lead.id)+'" data-name="'+attr(lead.name)+'" data-previous-report="'+attr(lead.contact_public_id)+'" onclick="rerunOriginalContact(this)">Rerun original contacts ↻</button>'):'';var dossierControl='';if(lead.research_public_id){dossierControl='<a class="vip" target="_blank" rel="noopener" href="/r/'+attr(lead.research_public_id)+'">Dossier V'+(lead.research_version||1)+' ↗</a>'}else{dossierControl='<button class="research" data-company="'+attr(lead.id)+'" data-name="'+attr(lead.name)+'" onclick="startResearch(this)">Research →</button>'}var teleOpts='<option value="">(Unassigned)</option>';leadState.telemarketers.forEach(function(a){var value=agentValue(a);var sel=(a.uid?lead.telemarketer_uid===a.uid:lead.assigned_to===a.name)?' selected':'';teleOpts+='<option value="'+attr(value)+'"'+sel+'>'+esc(agentLabel(a))+'</option>'});var statuses=['unassigned','assigned','contacted','interested','not_interested','do_not_call'];var statusOpts=statuses.map(function(s){var sel=(lead.lead_status===s)?' selected':'';var lbl=s==='do_not_call'?'DNC':s.replace('_',' ');return '<option value="'+s+'"'+sel+'>'+lbl+'</option>'}).join('');var notesSnippet=lead.lead_notes?(esc(lead.lead_notes.slice(0,60))+(lead.lead_notes.length>60?'…':'')):'Add notes';var hideBtn=isHidden?'<button class="filter" type="button" style="min-height:30px;padding:0 8px;font-size:9px;white-space:nowrap;border-color:var(--ok);color:var(--ok);background:#ecfdf5;" title="Restore company to active list" onclick="toggleHideLead(\''+attr(lead.id)+'\', false)">👁️ Unhide</button>':'<button class="filter" type="button" style="min-height:30px;padding:0 8px;font-size:9px;white-space:nowrap;color:var(--muted);" title="Hide company from master list" onclick="toggleHideLead(\''+attr(lead.id)+'\', true)">🚫 Hide</button>';var rowClasses='lead-row'+(hasContact?' has-contact-research':'')+(isContactRunning?' contact-running':'')+(isHidden?' is-hidden':'');return '<article class="'+rowClasses+'">'+'<div><input type="checkbox" id="leadCheck-'+attr(lead.id)+'" class="lead-check" '+(checked?'checked ':'')+'onchange="toggleSelectLead(\''+attr(lead.id)+'\', this.checked)"></div>'+'<div>'+'<h3>'+esc(lead.name)+branchBadge+'</h3>'+'<div class="meta">'+esc(lead.category||'Business')+esc(rating)+'</div>'+'<div class="address" style="margin-top:4px;">'+esc(lead.address||'Address not published')+'</div>'+contactPill+'</div>'+'<div class="company-contact">'+'<div class="phone">'+(phone?('<a class="source-link" href="tel:'+attr(phone.replace(/[^+\d]/g,''))+'" style="font-size:13px;">'+esc(phone)+'</a>'):'<span class="meta">No phone</span>')+'</div>'+'<div class="actions" style="display:flex;gap:8px;margin-top:4px;">'+(website?('<a class="source-link" target="_blank" rel="noopener" href="'+attr(website)+'">Web</a>'):'')+(maps?('<a class="source-link" target="_blank" rel="noopener" href="'+attr(maps)+'">Maps</a>'):'')+'</div>'+'<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;">'+contactControl+rerunActionLead+'<button class="research" data-company="'+attr(lead.id)+'" data-name="'+attr(lead.name)+'" onclick="startParallelContact(this)">Parallel contacts ↗</button>'+dossierControl+'</div>'+'</div>'+'<div style="display:grid;gap:8px;">'+'<div>'+'<label style="display:block;font:700 8px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Assigned to</label>'+'<select class="tele-select" onchange="updateLeadAssignee(\''+attr(lead.id)+'\', this)">'+teleOpts+'</select>'+'</div>'+'<div>'+'<label style="display:block;font:700 8px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Status</label>'+'<select class="status-select '+attr(lead.lead_status||'unassigned')+'" onchange="updateLeadStatus(\''+attr(lead.id)+'\', this)">'+statusOpts+'</select>'+'</div>'+'</div>'+'<div style="display:grid;gap:6px;align-content:start;">'+'<div style="display:flex;gap:6px;align-items:center;">'+'<button class="filter" type="button" style="min-height:30px;padding:0 8px;font-size:9px;white-space:nowrap;" data-id="'+attr(lead.id)+'" data-notes="'+attr(lead.lead_notes||'')+'" onclick="promptLeadNotes(this)">📝 '+(lead.lead_notes?'Notes':'+ Note')+'</button>'+hideBtn+'</div>'+(lead.lead_notes?('<span style="font-size:11px;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+attr(lead.lead_notes)+'">'+notesSnippet+'</span>'):'')+'</div>'+'</article>'}).join('')}
var teleState={data:null,expanded:{},filter:'',queueingTown:false};
async function loadTelemarketingView(){
  if(!state.token)return;
  var cont=el('teleTerritoryContainer');
  if(cont&&!teleState.data)cont.innerHTML='<div class="empty">Loading Johor territory directory…</div>';
  var stateVal=el('teleStateSelect')?el('teleStateSelect').value:'johor';
  try{
    var body=await api('/api/territories?state='+encodeURIComponent(stateVal));
    teleState.data=body;
    renderTeleSummary(body.stats||{});
    renderTerritoryCards();
  }catch(err){
    if(cont)cont.innerHTML='<div class="empty error">'+esc(err.message)+'</div>';
    if(!authLost(err))showToast('Failed to load territories: '+err.message);
  }
}
function renderTeleSummary(stats){
  var d=el('teleDistrictsCount');var tw=el('teleTownsCount');var tm=el('teleTamansCount');var sc=el('teleScannedCount');
  if(d)d.textContent=stats.totalDistricts||10;
  if(tw)tw.textContent=stats.totalTowns||70;
  if(tm)tm.textContent=stats.totalTamans||771;
  if(sc)sc.textContent=(stats.scannedTamans||0)+' ('+(stats.totalLeads||0)+' businesses found · '+(stats.totalContacts||0)+' with phone)';
}
function expandAllDistricts(expand){
  if(!teleState.data||!teleState.data.districts)return;
  teleState.data.districts.forEach(function(d){teleState.expanded[d.id]=expand});
  renderTerritoryCards();
}
function filterTerritoryCards(){
  var input=el('teleFilterInput');
  teleState.filter=input?input.value.trim().toLowerCase():'';
  if(teleState.filter&&teleState.data&&teleState.data.districts){
    teleState.data.districts.forEach(function(d){teleState.expanded[d.id]=true});
  }
  renderTerritoryCards();
}
function toggleDistrict(id){
  teleState.expanded[id]=!teleState.expanded[id];
  var card=el('distCard-'+id);
  if(card)card.classList.toggle('expanded',teleState.expanded[id]);
}
function toggleDistrictCard(headEl){
  var card=headEl.closest('.district-card');
  if(card){
    var id=card.getAttribute('data-dist-id');
    if(id){
      teleState.expanded[id]=!teleState.expanded[id];
      card.classList.toggle('expanded',Boolean(teleState.expanded[id]));
    }
  }
}
function renderTerritoryCards(){
  var cont=el('teleTerritoryContainer');
  if(!cont||!teleState.data)return;
  var districts=teleState.data.districts||[];
  var f=teleState.filter;
  var html='';
  districts.forEach(function(d){
    var filteredTowns=d.towns;
    if(f){
      filteredTowns=d.towns.filter(function(t){
        if(t.name.toLowerCase().indexOf(f)>=0)return true;
        return t.tamans.some(function(tm){return tm.name.toLowerCase().indexOf(f)>=0});
      });
      if(!filteredTowns.length&&d.name.toLowerCase().indexOf(f)<0)return;
    }
    var isExpanded=f?true:!!teleState.expanded[d.id];
    var scannedRatio=(d.scannedTamans||0)+'/'+(d.totalTamans||d.towns.reduce(function(a,t){return a+t.tamans.length},0))+' scanned';
    html+='<div class="district-card '+(isExpanded?'expanded':'')+'" id="distCard-'+attr(d.id)+'" data-dist-id="'+attr(d.id)+'">';
    html+='<div class="district-head" onclick="toggleDistrictCard(this)">';
    html+='<div class="district-title"><h3>'+esc(d.num)+'. Daerah '+esc(d.name)+'</h3><span class="district-badge">'+esc(scannedRatio)+'</span></div>';
    html+='<span class="district-chevron">&#9660;</span></div>';
    html+='<div class="district-body">';
    var townsToRender=f&&filteredTowns.length?filteredTowns:d.towns;
    townsToRender.forEach(function(t){
      var filteredTamans=t.tamans;
      if(f&&t.name.toLowerCase().indexOf(f)<0){
        filteredTamans=t.tamans.filter(function(tm){return tm.name.toLowerCase().indexOf(f)>=0});
      }
      var tScan=t.scan;
      var tScanned=tScan&&(tScan.status==='completed'||(tScan.status==='partial'&&tScan.count>0));
      var tScanning=tScan&&terminal.indexOf(tScan.status)<0;
      html+='<div class="town-block"><div class="town-head">';
      html+='<div style="display:flex;align-items:center;gap:10px;"><div class="town-title">'+esc(t.name)+'</div>';
      if(tScanned){html+='<a class="taman-link" target="_blank" rel="noopener" href="/r/'+attr(tScan.publicId)+'">&#9679; '+esc(tScan.count)+(tScan.status==='partial'?' businesses · partial':' leads')+'<span title="Leads where a phone number was found"> · '+esc(tScan.contacts)+' contacts</span> &#8599;</a>'}
      else if(tScanning){html+='<span style="font-size:11px;color:var(--warn);">&#9679; Scanning...</span>'}
      html+='</div>';
      html+='<button class="town-scan-btn" type="button" data-town="'+attr(t.id)+'" onclick="queueWholeTownFromBtn(this)">&#9889; Scan Whole Town</button>';
      html+='</div>';
      html+='<div class="taman-grid">';
      filteredTamans.forEach(function(tm){
        var scan=tm.scan;
        var isScanned=scan&&(scan.status==='completed'||(scan.status==='partial'&&scan.count>0));
        var isScanning=scan&&terminal.indexOf(scan.status)<0;
        var pillClass=isScanned?'scanned':isScanning?'scanning':'';
        var pipClass=isScanned?'scanned':isScanning?'scanning':'';
        html+='<div class="taman-pill '+pillClass+'">';
        html+='<span class="taman-pip '+pipClass+'"></span>';
        html+='<span class="taman-name">'+esc(tm.name)+'</span>';
        if(isScanned){
          html+='<a class="taman-link" target="_blank" rel="noopener" href="/r/'+attr(scan.publicId)+'" title="Open search report">'+esc(scan.count)+(scan.status==='partial'?' businesses · partial':' leads')+'<span title="Leads where a phone number was found"> · '+esc(scan.contacts)+' contacts</span> &#8599;</a>';
          html+='<button class="taman-scan-action" style="background:transparent;color:var(--muted);border:1px solid var(--line);" type="button" data-place="'+attr(tm.queryPlace)+'" data-name="'+attr(tm.name)+'" onclick="queueTerritoryFromBtn(this)" title="Re-scan market">&#8635;</button>';
        }else if(isScanning){
          html+='<span style="font-size:11px;color:var(--warn);">Scanning...</span>';
        }else{
          html+='<button class="taman-scan-action" type="button" data-place="'+attr(tm.queryPlace)+'" data-name="'+attr(tm.name)+'" onclick="queueTerritoryFromBtn(this)">&#9889; Scan</button>';
        }
        html+='</div>';
      });
      html+='</div></div>';
    });
    html+='</div></div>';
  });
  cont.innerHTML=html||'<div class="empty">No territories matching filter.</div>';
}
function queueTerritoryFromBtn(btn){
  var p=btn.getAttribute('data-place');
  var n=btn.getAttribute('data-name');
  return queueTerritoryScan(btn,p,n);
}
async function queueWholeTownFromBtn(btn){
  if(teleState.queueingTown||!teleState.data)return;
  var townId=btn.getAttribute('data-town');
  var town=null;
  (teleState.data.districts||[]).some(function(d){town=(d.towns||[]).find(function(t){return t.id===townId})||null;return !!town});
  if(!town)return;
  var pending=town.tamans.filter(function(tm){var scan=tm.scan;return !scan||((scan.status!=='queued'&&scan.status!=='running')&&(Number(scan.count)||0)===0)});
  if(!pending.length){showToast('Every taman in '+town.name+' has leads or is already scanning.');return}
  var catInput=el('teleCategory');
  var keyword=catInput?catInput.value.trim():'business';
  var maxInput=el('teleMaxResults');
  var maxCount=maxInput?Number(maxInput.value)||200:200;
  teleState.queueingTown=true;
  btn.disabled=true;
  var queued=0,failed=0;
  try{
    for(var i=0;i<pending.length;i++){
      if(!state.token)break;
      btn.textContent='Queueing '+(i+1)+'/'+pending.length+'…';
      var tm=pending[i];
      try{
        var body=await api('/api/business-search',{method:'POST',body:JSON.stringify({keyword:keyword||undefined,place:tm.queryPlace,max:maxCount,requesterId:'telemarketing:'+tm.name})});
        queued++;
        if(body.report)poll(body.report,'search');
      }catch(err){
        failed++;
        if(authLost(err))break;
      }
    }
    await loadTelemarketingView();
    showToast(queued+' taman scans queued for '+town.name+(failed?' · '+failed+' failed to queue':'')+(state.token?'':' · access expired'));
  }finally{teleState.queueingTown=false;btn.disabled=false}
}
async function queueTerritoryScan(btn,targetPlace,label){
  var catInput=el('teleCategory');
  var keyword=catInput?catInput.value.trim():'business';
  var maxInput=el('teleMaxResults');
  var maxCount=maxInput?Number(maxInput.value)||200:200;
  var origText=btn.textContent;
  btn.disabled=true;
  btn.textContent='Queueing\u2026';
  try{
    var body=await api('/api/business-search',{
      method:'POST',
      body:JSON.stringify({keyword:keyword||undefined,place:targetPlace,max:maxCount,requesterId:'telemarketing:'+label})
    });
    showToast('Queued search for '+keyword+' in '+label);
    upsertJob(body.report,'search');
    poll(body.report,'search');
    btn.textContent='Scanning\u2026';
    var pNode=btn.closest&&btn.closest('.taman-pill');
    if(pNode){
      pNode.className='taman-pill scanning';
      var pip=pNode.querySelector('.taman-pip');
      if(pip)pip.className='taman-pip scanning';
    }
  }catch(err){
    btn.disabled=false;
    btn.textContent=origText;
    if(!authLost(err))showToast('Failed to queue scan: '+err.message);
  }
}
(function boot(){var saved=eeKey.read();if(saved){el('accessKey').value=saved;connect()}else{setTimeout(function(){el('accessKey').focus()},80)}})();
</script></body></html>`;
}
