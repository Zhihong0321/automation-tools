// /email-marketing: the email hub, built as a phone app first (installable, see email-pwa.ts).
// Four tabs: Home (the reply queue, today's sends, autopilot, the last 14 days, campaign
// totals), Inbox (replies waiting, every conversation), Campaigns (campaigns and templates)
// and Leads. A reply, a campaign and a template each open full screen with their action
// bar at the bottom. It uses the operator token the other console pages keep in
// localStorage ('labToken').
import { OPERATOR_NAV, navHtml } from './nav.ts';

export function page(): string {
  return String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F3F5F2" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0F1A24" media="(prefers-color-scheme: dark)">
<title>Email hub</title>
<link rel="manifest" href="/email-marketing/manifest.webmanifest"><link rel="icon" type="image/png" href="/email-marketing/icon-192.png"><link rel="apple-touch-icon" href="/email-marketing/icon-180.png">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Email hub"><meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap">
<style>
:root{
  --paper:#F3F5F2;--surface:#FFFFFF;--sunk:#E8ECE9;--ink:#13212E;--ink2:#3A4A57;--muted:#62717D;--line:#DCE2DF;
  --sun:#FFB81C;--sun-ink:#13212E;--sun-soft:#FFF1CC;--leaf:#1E7F55;--leaf-soft:#DDF1E6;--rose:#B93A33;--rose-soft:#FBE3E0;
  --amber:#8A5800;--amber-soft:#FFF0D1;--sky:#2F5E8C;--sky-soft:#E1ECF6;--bar:#13212E;--on-rose:#FFFFFF;
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --text:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
  --tabs:64px;--top:env(safe-area-inset-top);--bot:env(safe-area-inset-bottom);
}
@media (prefers-color-scheme:dark){:root{
  --paper:#0F1A24;--surface:#162430;--sunk:#1D2D3B;--ink:#E8EEF1;--ink2:#C3CFD8;--muted:#8FA1AE;--line:#26394A;
  --sun-soft:#3A2F12;--leaf:#5BCB94;--leaf-soft:#123326;--rose:#FF8A7E;--rose-soft:#3A1C1B;--amber:#F5C25B;--amber-soft:#33280F;
  --sky:#8DB8E6;--sky-soft:#18293B;--bar:#B9C8D3;--on-rose:#1A0D0C;
}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 var(--text);overscroll-behavior-y:contain}
a{color:var(--sky)}
[hidden]{display:none!important}
.grow{flex:1;min-width:0}.muted{color:var(--muted)}.ok{color:var(--leaf)}.bad{color:var(--rose)}.warn{color:var(--amber)}
:focus-visible{outline:3px solid var(--sky);outline-offset:2px}

/* app bar */
.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:4px;min-height:calc(56px + var(--top));padding:var(--top) 6px 0 16px;background:color-mix(in srgb,var(--paper) 88%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .2s}
.bar.scrolled{border-bottom-color:var(--line)}
.bar h1{font:750 22px/1.1 var(--display);letter-spacing:-.015em;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.focus .bar{padding-left:4px}body.focus .bar h1{font-size:18px;font-weight:700}
.ib{display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;background:none;color:var(--ink);flex:none}
.ib svg{width:22px;height:22px}
.ib:active{background:var(--sunk)}
.pill-btn{min-height:34px;padding:5px 12px;font-size:14px;border-radius:999px;background:var(--sun);color:var(--sun-ink)}
.offline{background:var(--amber-soft);color:var(--amber);font-size:13.5px;text-align:center;padding:6px 16px}

/* bottom tabs */
.tabs{position:fixed;left:0;right:0;bottom:0;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);border-top:1px solid var(--line);padding:6px 4px calc(6px + var(--bot))}
.tabs a{display:flex;flex-direction:column;align-items:center;gap:3px;height:52px;justify-content:center;color:var(--muted);text-decoration:none;font-size:12px;font-weight:650;position:relative}
.tabs .tp{display:grid;place-items:center;width:58px;height:30px;border-radius:999px;transition:background .2s}
.tabs svg{width:22px;height:22px}
.tabs a[aria-current="page"]{color:var(--ink)}
.tabs a[aria-current="page"] .tp{background:var(--sun);color:var(--sun-ink)}
.badge{position:absolute;top:0;left:calc(50% + 8px);min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--rose);color:var(--on-rose);font:750 11px/16px var(--text);text-align:center;border:2px solid var(--surface)}
body.focus .tabs{display:none}

main{max-width:640px;margin:0 auto;padding:4px 16px calc(var(--tabs) + 28px + var(--bot))}
body.focus main{padding-bottom:0}

/* type and blocks */
.sec{margin:0 0 28px}
.sec-h{display:flex;align-items:baseline;gap:10px;margin:0 2px 10px}
.sec-h h2,h2.t{font:700 19px/1.2 var(--display);letter-spacing:-.01em;margin:0;flex:1}
.aside{font-size:13.5px;color:var(--muted);font-weight:500}
h3{font:700 16px/1.3 var(--display);margin:22px 2px 8px}
.hint{font-size:13.5px;color:var(--muted);margin:8px 2px 0;line-height:1.5}
.hint code,code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--sunk);padding:1px 5px;border-radius:5px;color:var(--ink2)}
.empty{padding:28px 16px;text-align:center;color:var(--muted);font-size:15px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px}
.list{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.list>*{border-top:1px solid var(--line)}.list>*:first-child{border-top:0}
.banner{border-radius:14px;padding:12px 14px;font-size:14.5px;margin:0 0 18px;background:var(--rose-soft);color:var(--rose)}

/* controls */
button{font:inherit;font-weight:650;cursor:pointer;border:0;border-radius:12px;min-height:46px;padding:10px 16px;background:var(--sunk);color:var(--ink)}
button:disabled{opacity:.45;cursor:default}
button:not(:disabled):active{transform:scale(.98)}
.primary{background:var(--sun);color:var(--sun-ink)}
.ink{background:var(--ink);color:var(--paper)}
.danger{color:var(--rose)}
.sm{min-height:36px;padding:6px 12px;font-size:14px;border-radius:10px}
.block{width:100%}
.btns{display:flex;flex-wrap:wrap;gap:8px}
input:not([type=checkbox]),select,textarea{font:inherit;font-size:16px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 12px;min-height:46px;width:100%;min-width:0}
input::placeholder,textarea::placeholder{color:var(--muted)}
select{-webkit-appearance:none;appearance:none;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%2362717D' stroke-width='2'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center}
textarea{min-height:180px;line-height:1.55;resize:vertical;display:block}
input[type=checkbox]{width:22px;height:22px;margin:0;accent-color:var(--leaf);flex:none}
label.f{display:block;font-size:13.5px;font-weight:650;color:var(--ink2);margin:14px 2px 6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.chip{display:inline-flex;align-items:center;font-size:12px;font-weight:650;padding:2px 9px;border-radius:999px;background:var(--sunk);color:var(--ink2);white-space:nowrap;line-height:1.6}
.chip.ok{background:var(--leaf-soft);color:var(--leaf)}.chip.warn{background:var(--amber-soft);color:var(--amber)}.chip.bad{background:var(--rose-soft);color:var(--rose)}.chip.blue{background:var(--sky-soft);color:var(--sky)}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.switch{position:relative;display:inline-block;width:56px;height:32px;flex:none}
.switch input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;z-index:1}
.switch span{position:absolute;inset:0;border-radius:16px;background:var(--line);transition:background .2s}
.switch span::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
.switch input:checked+span{background:var(--leaf)}.switch input:checked+span::after{transform:translateX(24px)}
.switch input:focus-visible+span{outline:3px solid var(--sky);outline-offset:2px}
.seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:var(--sunk);border-radius:12px;padding:3px;margin:6px 0 16px}
.seg a{text-align:center;padding:9px 6px;border-radius:9px;font-weight:650;font-size:15px;color:var(--muted);text-decoration:none}
.seg a[aria-current="page"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(19,33,46,.14)}
details.more{background:var(--surface);border:1px solid var(--line);border-radius:16px;margin-bottom:10px}
details.more>summary{list-style:none;display:flex;align-items:center;gap:8px;padding:14px;font-weight:650;cursor:pointer;min-height:54px}
details.more>summary::-webkit-details-marker{display:none}
details.more>summary::after{content:"";flex:none;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);margin:0 4px 4px 6px;transition:transform .2s}
details.more[open]>summary::after{transform:rotate(-135deg);margin-bottom:-4px}
details.more>.in{padding:0 14px 14px}
details.more .list{border-radius:12px}

/* home: the reply queue */
.hero{display:block;position:relative;overflow:hidden;text-decoration:none;color:var(--sun-ink);background:var(--sun);border-radius:24px;padding:18px 18px 16px;margin:6px 0 26px}
.hero::after{content:"";position:absolute;right:-56px;top:-56px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.24);pointer-events:none}
.hero-top{display:flex;align-items:flex-end;gap:12px;position:relative}
.hero-n{font:800 80px/.85 var(--display);letter-spacing:-.045em;font-variant-numeric:tabular-nums}
.hero-w{font:650 21px/1.1 var(--display);max-width:9ch;padding-bottom:4px}
.hero-sub{font-size:14px;margin-top:12px;opacity:.82;position:relative}
.hero-next{margin-top:14px;background:rgba(255,255,255,.6);border-radius:14px;padding:10px 12px;position:relative}
.hero-next b{display:block;font-size:15px}
.hero-next span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px}
.hero-go{display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-weight:700;font-size:16px;padding:13px 16px;border-radius:14px;background:var(--sun-ink);color:var(--sun);position:relative}
.hero-go svg{width:20px;height:20px}
.hero.clear{background:var(--leaf-soft);color:var(--ink)}.hero.clear::after{display:none}
.hero.clear .hero-n{color:var(--leaf)}.hero.clear .hero-go{background:var(--surface);color:var(--ink)}

.meter-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.meter-n{font:800 40px/1 var(--display);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.meter-of{color:var(--muted);font-size:15px}
.meter{height:10px;border-radius:5px;background:var(--sunk);overflow:hidden;margin:12px 0 4px}.meter i{display:block;height:100%;background:var(--sun);border-radius:5px;transition:width .4s}
.strip{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 0 12px}
.strip div{padding:6px 0 2px 10px;border-left:1px solid var(--line)}.strip div:first-child{border-left:0;padding-left:2px}
.strip b{display:block;font:700 21px/1.2 var(--display);font-variant-numeric:tabular-nums}.strip span{font-size:12.5px;color:var(--muted)}

.ap-head{display:flex;gap:14px;align-items:flex-start}
.ap-head .hint{margin-top:4px}
.chart{display:grid;grid-template-columns:repeat(14,1fr);gap:3px;height:128px}
.col{position:relative;height:100%;min-height:0;display:flex;align-items:flex-end;justify-content:center;background:none;padding:0 0 2px;border-radius:7px}
.col .b{width:100%;max-width:16px;background:var(--bar);opacity:.78;border-radius:4px 4px 2px 2px;min-height:2px}
.col.today .b{background:var(--sun);opacity:1}
.col .d{position:absolute;left:50%;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:var(--leaf);box-shadow:0 0 0 2px var(--surface)}
.col.sel{background:var(--sunk)}
.axis{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:6px}
.cap{font-size:14.5px;margin-top:10px;min-height:22px}
.cap .dotk{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--leaf);margin:0 4px 1px 0}

.stats{display:grid;grid-template-columns:1fr 1fr;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.stats div{padding:12px 14px;border-top:1px solid var(--line)}
.stats div:nth-child(-n+2){border-top:0}.stats div:nth-child(even){border-left:1px solid var(--line)}
.stats b{display:block;font:700 22px/1.2 var(--display);font-variant-numeric:tabular-nums}
.stats span{font-size:13px;color:var(--muted)}

.camp{display:block;padding:13px 14px;color:inherit;text-decoration:none}
.camp:active,.conv:active,.rowl:active{background:var(--sunk)}
.camp-top{display:flex;gap:8px;align-items:center}
.camp-name{font-weight:650;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nums{display:grid;grid-template-columns:repeat(4,1fr);margin-top:8px}
.nums b{display:block;font-weight:700;font-variant-numeric:tabular-nums;font-size:16px}.nums span{font-size:12px;color:var(--muted)}
.rowl{display:flex;gap:12px;align-items:center;padding:12px 14px;color:inherit;text-decoration:none;min-height:56px}
.rowl .rt{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rowl .rs{font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rowl .rr{font-size:13px;color:var(--muted);white-space:nowrap;text-align:right}
.check{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:15px}.check:first-child{border-top:0}
.check b{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px}
.check b.ok{background:var(--leaf-soft)}.check b.bad{background:var(--rose-soft)}.check b.warn{background:var(--amber-soft)}

/* inbox */
.conv{display:flex;gap:12px;padding:13px 14px;color:inherit;text-decoration:none}
.av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font:700 17px/1 var(--display);background:var(--sunk);color:var(--ink2);position:relative}
.av.wait{background:var(--sun);color:var(--sun-ink)}
.cb{flex:1;min-width:0}
.ct{display:flex;gap:8px;align-items:baseline}
.ct b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
.ct time{font-size:12.5px;color:var(--muted);white-space:nowrap}
.cs{font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp{font-size:14.5px;margin:3px 0 6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--ink2)}
.searchbar{position:sticky;top:calc(56px + var(--top));z-index:15;background:var(--paper);padding:2px 0 10px;margin-top:-2px}
.searchbar input{border-radius:999px;padding-left:40px;background:var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%2362717D' stroke-width='2'%3E%3Ccircle cx='8' cy='8' r='6'/%3E%3Cpath d='m13 13 4 4'/%3E%3C/svg%3E") no-repeat 14px center}

/* one reply */
.pager{display:flex;align-items:center;gap:6px;margin:4px 0 10px}
.pager span{flex:1;font-size:13.5px;color:var(--muted)}
.lead-h h2{font:750 24px/1.15 var(--display);letter-spacing:-.015em;margin:0 0 4px}
.lead-h p{margin:0;font-size:14px;color:var(--muted);word-break:break-word}
.thread{display:flex;flex-direction:column;gap:10px;margin:16px 0 0}
.bub{max-width:88%;padding:10px 13px;border-radius:18px;white-space:pre-wrap;word-break:break-word;font-size:15px;line-height:1.5}
.bub.in{align-self:flex-start;background:var(--surface);border:1px solid var(--line);border-bottom-left-radius:6px}
.bub.out{align-self:flex-end;background:var(--sky-soft);border-bottom-right-radius:6px}
.bub .meta{display:block;font-size:12.5px;color:var(--muted);margin-bottom:5px;white-space:normal}
.bub.their{max-width:100%;font-size:17px;line-height:1.6;padding:14px 16px;border-color:var(--sun);border-width:2px}
.compose{margin-top:22px}
.compose textarea{min-height:200px;font-size:16.5px;border-radius:16px;padding:14px}
.quick{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:10px -16px 0;padding:0 16px}
.quick::-webkit-scrollbar,.filters::-webkit-scrollbar{display:none}
.quick button{flex:none;min-height:36px;padding:6px 14px;border-radius:999px;font-size:14px;background:var(--surface);border:1px solid var(--line)}
.actbar{position:sticky;bottom:0;z-index:10;margin:20px -16px 0;padding:10px 16px calc(10px + var(--bot));background:color-mix(in srgb,var(--paper) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid var(--line);display:flex;gap:8px;align-items:center}
.actbar .primary{flex:1;min-height:52px;font-size:17px;border-radius:14px}

/* campaigns, templates */
.step{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:10px}
.step-h{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:650;font-size:15px}
.step-h input.delay{width:64px;min-height:38px;padding:6px 8px;text-align:center}
.step .subj{margin-bottom:8px}
.days{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.days label{position:relative}
.days input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0}
.days span{display:block;padding:8px 13px;border-radius:999px;background:var(--sunk);font-weight:650;font-size:14px}
.days input:checked+span{background:var(--ink);color:var(--paper)}
.days input:focus-visible+span{outline:3px solid var(--sky);outline-offset:2px}
.boxes label{display:flex;gap:12px;align-items:center;padding:12px 14px;font-size:15px;word-break:break-all}
.fields{display:flex;flex-wrap:wrap;gap:6px}
.fields button{min-height:34px;padding:5px 10px;font:600 13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;border-radius:8px;background:var(--surface);border:1px solid var(--line)}

/* leads */
.filters{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 8px;padding:0 16px}
.filters select{width:auto;flex:none;min-height:40px;padding:7px 34px 7px 14px;border-radius:999px;font-weight:600;font-size:15px}
.meta-row{display:flex;align-items:center;gap:8px;margin:2px 2px 10px;font-size:14px;color:var(--muted)}
.linkb{background:none;padding:4px 2px;min-height:32px;color:var(--sky);font-size:14px}
.lead{display:flex;gap:12px;padding:12px 14px;align-items:flex-start;cursor:pointer}
.lead input{margin-top:2px}
.lead .lb{flex:1;min-width:0}
.lead .ln{font-weight:650}
.lead .le{font-size:14px;color:var(--ink2);word-break:break-all}
.lead .lm{font-size:12.5px;color:var(--muted)}
.lead .chips{margin-top:6px}
.selall{display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600;padding:0 2px 10px;color:var(--ink2)}
.pushbar{position:sticky;bottom:calc(var(--tabs) + var(--bot));z-index:10;margin:16px -16px 0;padding:10px 16px;background:color-mix(in srgb,var(--paper) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.pushbar button{min-height:50px;border-radius:14px}

/* toast, sheets, gate, pull to refresh */
.toast{position:fixed;left:12px;right:12px;bottom:calc(var(--tabs) + 12px + var(--bot));z-index:40;max-width:560px;margin:0 auto;padding:12px 8px 12px 16px;border-radius:14px;background:var(--ink);color:var(--paper);font-size:14.5px;display:flex;gap:6px;align-items:flex-start;box-shadow:0 10px 30px rgba(0,0,0,.2);white-space:pre-wrap;transform:translateY(16px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:none;pointer-events:auto}
.toast.error{background:var(--rose);color:var(--on-rose)}
.toast span{flex:1;padding-top:3px}
.toast button{min-height:32px;padding:4px 10px;background:none;color:inherit;font-size:20px;line-height:1}
body.focus .toast{bottom:calc(86px + var(--bot))}
.scrim{position:fixed;inset:0;background:rgba(8,16,24,.45);z-index:50}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--surface);border-radius:24px 24px 0 0;padding:8px 16px calc(18px + var(--bot));max-height:88vh;overflow:auto;max-width:640px;margin:0 auto;animation:up .22s ease-out}
@keyframes up{from{transform:translateY(100%)}}
.grab{width:40px;height:5px;border-radius:3px;background:var(--line);margin:4px auto 14px}
.sheet h2{font:700 19px/1.2 var(--display);margin:0 0 10px}
.sheet .item{display:flex;align-items:center;gap:12px;width:100%;justify-content:flex-start;background:none;padding:14px 4px;border-radius:0;border-bottom:1px solid var(--line);font-weight:600;min-height:52px}
.sheet .item svg{width:20px;height:20px;color:var(--muted)}
.sitenav{display:flex;flex-wrap:wrap;gap:6px}
.sitenav a{padding:8px 12px;border-radius:10px;background:var(--sunk);color:var(--ink);text-decoration:none;font-size:14px}
.sitenav a[aria-current="page"]{background:var(--sun);color:var(--sun-ink)}
.gate{position:fixed;inset:0;z-index:60;background:var(--paper);display:flex;flex-direction:column;justify-content:center;padding:24px 24px calc(24px + var(--bot))}
.gate>div{max-width:400px;margin:0 auto;width:100%}
.gate h2{font:800 34px/1.05 var(--display);letter-spacing:-.03em;margin:0 0 8px}
.gate p{color:var(--muted);margin:0 0 18px}
.ptr{position:fixed;top:calc(var(--top) + 8px);left:50%;width:38px;height:38px;margin-left:-19px;border-radius:50%;background:var(--surface);box-shadow:0 2px 10px rgba(0,0,0,.18);display:grid;place-items:center;z-index:30;transform:translateY(-80px);color:var(--ink)}
.ptr svg{width:20px;height:20px}
.ptr.spin{transform:translateY(52px);transition:transform .2s}.ptr.spin svg{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (min-width:900px){main{max-width:720px}.tabs{max-width:720px;margin:0 auto;border:1px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0}}
</style></head><body>
<header class="bar" id="bar">
<button class="ib" id="back" hidden aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
<h1 id="title">Email hub</h1>
<button class="pill-btn" id="install" hidden>Install</button>
<button class="ib" id="menuBtn" aria-label="Menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
</header>
<div class="offline" id="offline" hidden>You are offline. Numbers and replies load when the signal is back.</div>
<div class="ptr" id="ptr" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg></div>

<main>
<section id="v-dashboard">
<a class="hero" href="#replies" id="waitCard">
<div class="hero-top"><span class="hero-n" id="waitN">–</span><span class="hero-w" id="waitWord">replies waiting</span></div>
<div class="hero-sub" id="waitSub">Loading…</div>
<div class="hero-next" id="waitNext" hidden></div>
<span class="hero-go" id="waitGo" hidden><span id="waitGoText">Answer now</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
</a>
<div class="banner" id="sendNote" hidden></div>

<div class="sec">
<div class="sec-h"><h2>Today</h2><span class="aside" id="todayDay"></span></div>
<div class="meter-line"><span class="meter-n" id="mSent">–</span><span class="meter-of" id="mOf"></span></div>
<div class="meter"><i id="mBar" style="width:0"></i></div>
<div class="strip" id="todayStrip"></div>
<details class="more"><summary><span class="grow">Who got an email today</span><span class="aside" id="todayCount"></span></summary><div class="in"><div class="list" id="todayRows"><div class="empty">Loading…</div></div></div></details>
</div>

<div class="sec" id="apCard">
<div class="panel">
<div class="ap-head"><div class="grow"><h2 class="t">Autopilot</h2><p class="hint" id="apState"></p></div><label class="switch" aria-label="Send automatically"><input type="checkbox" id="apOn"><span></span></label></div>
<details class="more" style="border:0;margin:6px -14px -14px;background:none"><summary>Settings and today's batch</summary><div class="in">
<label class="f" for="apCamp">Campaign to feed</label><select id="apCamp"></select>
<div class="three"><div><label class="f" for="apPerDay">New a day</label><input id="apPerDay" type="number" inputmode="numeric" min="1"></div><div><label class="f" for="apStart">Start at</label><input id="apStart" type="number" inputmode="numeric" min="1"></div><div><label class="f" for="apRamp">Ramp days</label><input id="apRamp" type="number" inputmode="numeric" min="0"></div></div>
<div class="btns" style="margin-top:14px"><button class="primary grow" id="apSave">Save</button><button class="grow" id="apPreview">Preview today</button></div>
<button class="sm block" id="apRun" style="margin-top:8px">Add today's batch now</button>
<div id="apOut"></div>
<p class="hint">Each weekday morning (Kuala Lumpur) it adds the day's new leads to the campaign: one email per company, spread across mail hosts with none above half the day, never a do-not-call lead. It stops by itself when the campaign is not started, bounces pass 3%, or leads are still waiting unsent. Follow-ups come on top of the new leads and count toward the mailbox's daily limit.</p>
</div></details>
</div>
</div>

<div class="sec" id="fpCard">
<div class="panel">
<div class="ap-head"><div class="grow"><h2 class="t">Contact forms</h2><p class="hint" id="fpState"></p></div><label class="switch" aria-label="Send through contact forms"><input type="checkbox" id="fpOn"><span></span></label></div>
<div class="btns" style="margin-top:10px;flex-wrap:nowrap;align-items:center"><input id="fpNowN" type="number" inputmode="numeric" min="1" max="500" value="50" aria-label="How many to send now" style="width:90px;flex:none"><button class="primary grow" id="fpNow">Send now</button></div>
<details class="more" style="border:0;margin:6px -14px -14px;background:none"><summary>Settings and the latest sites</summary><div class="in">
<label class="f" for="fpTpl">Message: the first email of this template</label><select id="fpTpl"></select>
<label class="f" for="fpName">Name</label><input id="fpName" autocomplete="off">
<label class="f" for="fpCompany">Company name</label><input id="fpCompany" autocomplete="off">
<label class="f" for="fpPhone">Mobile</label><input id="fpPhone" type="tel" inputmode="tel" autocomplete="off">
<label class="f" for="fpEmail">Email</label><input id="fpEmail" type="email" inputmode="email" autocomplete="off">
<label class="f" for="fpPerDay">Sent a day</label><input id="fpPerDay" type="number" inputmode="numeric" min="1" max="100">
<div class="btns" style="margin-top:14px"><button class="primary grow" id="fpSave">Save</button><button class="grow" id="fpTest">Test one, no send</button></div>
<div id="fpOut"></div>
<div class="list" id="fpRows" style="margin-top:8px"></div>
<p class="hint">Each weekday from 08:00 to 15:00 (Kuala Lumpur) it takes the same commercial and industrial companies as the autopilot above, by their website instead of an email. A PC running the Step 2 Worker checks each site for a contact form with no captcha (Railway reads no site), and the hub sends the first email of the chosen template through it, with the name, company, mobile and email above. Answers come to that email. Each company is tried once, never sent twice, and not emailed after a form send.</p>
</div></details>
</div>
</div>

<div class="sec">
<div class="sec-h"><h2>Last 14 days</h2></div>
<div class="panel"><div class="chart" id="chart"></div><div class="axis" id="axis"></div><div class="cap" id="chartCap"></div></div>
<p class="hint">Bars are emails sent, green dots are days with replies. Tap a day for its numbers. From the Smartlead webhook.</p>
</div>

<div class="sec">
<div class="sec-h"><h2>Campaigns</h2><a class="aside" href="#campaigns">Manage</a></div>
<div class="list" id="campCards"><div class="empty">Loading…</div></div>
<p class="hint">Read is an email that was opened, counted by a hidden image, so it undercounts.</p>
</div>

<div class="sec">
<div class="sec-h"><h2>Leads</h2></div>
<div class="stats" id="leadTiles"></div>
</div>
<div class="sec">
<div class="sec-h"><h2>All sending</h2></div>
<div class="stats" id="sendTiles"></div>
</div>

<details class="more" id="unsubCard"><summary><span class="grow">Unsubscribed and bounced</span><span class="aside" id="unsubCount"></span></summary><div class="in">
<div class="list" id="unsubRows"><div class="empty">Loading…</div></div><p class="hint">These addresses are never emailed again.</p></div></details>
<details class="more"><summary><span class="grow">Setup checks</span><span class="aside" id="checkSum"></span></summary><div class="in"><div id="checks"></div><h3>Sending mailboxes</h3><div class="list" id="mailboxes"></div></div></details>
</section>

<section id="v-inbox" hidden>
<nav class="seg" aria-label="Inbox"><a href="#replies" data-view="replies">Waiting <span id="segN"></span></a><a href="#chats" data-view="chats">All conversations</a></nav>
<div class="searchbar" id="chatTools" hidden><input id="chatSearch" type="search" placeholder="Search company or email" autocomplete="off"></div>
<div class="list" id="convList"><div class="empty">Loading…</div></div>
<p class="hint" id="chatNote" hidden>Only threads where the lead wrote back.</p>
<div id="openAny" hidden><label class="f" for="threadEmail">Open any lead by email</label><div class="btns" style="flex-wrap:nowrap"><input id="threadEmail" type="email" inputmode="email" placeholder="name@company.com"><button id="threadGo">Open</button></div></div>
</section>

<section id="v-reply" hidden>
<div class="pager"><span id="rPos"></span><button class="ib" id="rPrev" aria-label="Previous reply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button class="ib" id="rNext" aria-label="Next reply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button></div>
<div id="rBody"><div class="empty">Loading…</div></div>
</section>

<section id="v-campaigns" hidden>
<nav class="seg" aria-label="Campaigns"><a href="#campaigns" data-view="campaigns">Campaigns</a><a href="#templates" data-view="templates">Templates</a></nav>
<div id="paneCamps">
<button class="primary block" id="newCampaign" style="margin-bottom:14px">New campaign</button>
<div class="list" id="campRows"><div class="empty">Loading…</div></div>
</div>
<div id="paneTpls" hidden>
<details class="more"><summary><span class="grow">Sender</span><span class="aside" id="senderSum"></span></summary><div class="in">
<p class="hint" style="margin:0 0 4px">Typed once. It fills <code>{{sender_name}}</code> <code>{{sender_title}}</code> <code>{{sender_phone}}</code> <code>{{sender_footer}}</code> in any email when a campaign is saved. A campaign saved earlier keeps what it had.</p>
<label class="f" for="sName">Your name</label><input id="sName" autocomplete="name">
<label class="f" for="sTitle">Your title</label><input id="sTitle" placeholder="Business Development Manager">
<label class="f" for="sPhone">Phone</label><input id="sPhone" type="tel" inputmode="tel" autocomplete="tel">
<label class="f" for="sFooter">Footer</label><textarea id="sFooter" style="min-height:100px" placeholder="Company name, registration number, address, and how to opt out"></textarea>
<div class="btns" style="margin-top:12px;align-items:center"><button class="primary" id="saveSender">Save sender</button><span class="aside" id="senderNote"></span></div>
</div></details>
<button class="primary block" id="newTpl" style="margin:6px 0 14px">New template</button>
<div class="list" id="tplRows"><div class="empty">Loading…</div></div>
</div>
</section>

<section id="v-campaign" hidden>
<div class="lead-h" style="display:flex;gap:10px;align-items:flex-start"><h2 class="grow" id="cdName" style="font:750 24px/1.15 var(--display);margin:4px 0 0"></h2><span id="cdStatus" style="padding-top:8px"></span></div>
<div class="btns" style="margin:14px 0"><button id="cdStart" class="ink sm">Start</button><button id="cdPause" class="sm">Pause</button><button id="cdStop" class="sm">Stop</button><span class="grow"></span><button id="cdDelete" class="danger sm">Delete</button></div>
<div class="stats" id="cdStats"></div>
<h3>Emails</h3>
<div class="btns" style="flex-wrap:nowrap;margin-bottom:10px"><select id="tplPick"><option value="">Start from a template…</option></select><button id="tplUse" class="sm" style="min-height:46px">Use</button></div>
<div id="steps"></div>
<div class="btns"><button id="addStep" class="sm grow">Add a follow-up</button><button id="tplFromCamp" class="sm grow">Save as template</button></div>
<p class="hint">Plain text. Blank lines make paragraphs. Fields: <code>{{company_name}}</code> <code>{{first_name}}</code> <code>{{category}}</code> <code>{{role}}</code>, and your <code>{{sender_name}}</code> <code>{{sender_title}}</code> <code>{{sender_phone}}</code> <code>{{sender_footer}}</code> from Templates. Most leads are company inboxes with no person name, so lead with <code>{{company_name}}</code>. An empty follow-up subject replies in the same thread.</p>
<h3>Schedule</h3>
<label class="f" for="tz">Time zone</label><input id="tz" value="Asia/Kuala_Lumpur">
<div class="two"><div><label class="f" for="startH">From</label><input id="startH" type="time" value="09:00"></div><div><label class="f" for="endH">To</label><input id="endH" type="time" value="17:00"></div></div>
<div class="two"><div><label class="f" for="gap">Minutes apart</label><input id="gap" type="number" inputmode="numeric" min="3" value="10"></div><div><label class="f" for="perDay">New per day</label><input id="perDay" type="number" inputmode="numeric" min="1" value="15"></div></div>
<div class="days" id="days"></div>
<h3>Send from</h3><div class="list boxes" id="campBoxes"></div>
<div id="campExtra">
<h3>Test email</h3>
<input id="testTo" type="email" inputmode="email" placeholder="you@yourcompany.com">
<div class="btns" style="flex-wrap:nowrap;margin-top:8px"><select id="testSeq"></select><button id="sendTest" style="flex:none">Send test</button></div>
<h3>Leads in this campaign</h3><div class="list" id="campLeads"></div>
<div class="pager" style="margin-top:10px"><button id="clPrev" class="sm">Previous</button><span id="clPage" style="text-align:center"></span><button id="clNext" class="sm">Next</button></div>
</div>
<div class="actbar"><button class="primary" id="saveCampaign">Save campaign</button><span class="aside" id="saveNote"></span></div>
</section>

<section id="v-template" hidden>
<label class="f" for="tplName" style="margin-top:6px">Template name</label><input id="tplName" placeholder="Solar for homeowners">
<h3>Emails</h3>
<div id="tplSteps"></div><button id="tplAddStep" class="sm block">Add a follow-up</button>
<h3>Insert a field</h3><div id="tplFields" class="fields"></div>
<p class="hint">Tap inside a subject or body, then a field. Lead fields are filled for each lead by Smartlead. Sender fields come from Sender on the Templates tab.</p>
<div id="tplProblems" style="margin-top:14px"></div><div id="tplPreview"></div>
<button id="tplDelete" class="danger block" style="margin-top:20px;background:none">Delete template</button>
<div class="actbar"><button class="primary" id="tplSave">Save template</button><button id="tplCheck">Check</button></div>
</section>

<section id="v-leads" hidden>
<nav class="seg" aria-label="Leads"><a href="#leads" data-view="leads">Email leads</a><a href="#forms" data-view="forms">Contact forms</a></nav>
<div id="paneForms" hidden>
<div class="searchbar"><input id="siteSearch" type="search" placeholder="Search company or website" autocomplete="off"></div>
<div class="filters"><select id="siteFilter" aria-label="Which websites"><option value="waiting">Open form, waiting to send</option><option value="sent">Sent</option><option value="tried">Tried, not sent</option><option value="open">Every open form</option><option value="captcha">Behind a captcha (never sent)</option></select></div>
<div class="meta-row"><span class="grow" id="siteCount"></span></div>
<div class="list" id="siteRows"><div class="empty">Loading…</div></div>
<div class="pager" style="margin-top:12px"><button id="sitePrev" class="sm">Previous</button><span id="sitePage" style="text-align:center"></span><button id="siteNext" class="sm">Next</button></div>
<p class="hint">Malaysian lead websites the PC checked for a contact form. Waiting: an open form (no captcha) at a commercial or industrial company that was not emailed or tried yet; the Contact forms switch on Home sends to these, a few each weekday.</p>
</div>
<div id="paneLeads">
<div class="searchbar"><input id="leadSearch" type="search" placeholder="Search company, email or person" autocomplete="off"></div>
<div class="filters">
<select id="leadStatus" aria-label="Status"><option value="new">Not in a campaign yet</option><option value="pushed">In a campaign</option><option value="replied">Replied</option><option value="stopped">Bounced or unsubscribed</option><option value="all">Any status</option></select>
<select id="leadSource" aria-label="Source"><option value="all">All sources</option><option value="research">Contact research</option><option value="website">Website</option><option value="person">Has a person name</option></select>
<select id="leadHost" aria-label="Mail host" title="Who hosts the email: spread a campaign across hosts so no one provider sees too much"><option value="all">All mail hosts</option></select>
</div>
<div class="meta-row"><span class="grow" id="leadCount"></span><button class="linkb" id="hostCheck">Check mail hosts</button></div>
<p class="hint" id="hostInfo" style="margin:-6px 2px 10px"></p>
<label class="selall"><input type="checkbox" id="checkAll"> Select everyone on this page</label>
<div class="list" id="leadRows"><div class="empty">Loading…</div></div>
<div class="pager" style="margin-top:12px"><button id="leadPrev" class="sm">Previous</button><span id="leadPage" style="text-align:center"></span><button id="leadNext" class="sm">Next</button></div>
<div class="pushbar"><button class="ink block" id="pushOpen">Add leads to a campaign</button></div>
</div>
</section>
</main>

<nav class="tabs" id="tabs" aria-label="Email hub">
<a href="#dashboard" data-view="dashboard"><span class="tp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/></svg></span>Home</a>
<a href="#replies" data-view="replies"><span class="tp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 13.5h5l1.5 3h5l1.5-3h5"/><path d="M5.5 4.5h13l2.5 9V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5z"/></svg></span>Inbox<span class="badge" id="badge" hidden></span></a>
<a href="#campaigns" data-view="campaigns"><span class="tp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/></svg></span>Campaigns</a>
<a href="#leads" data-view="leads"><span class="tp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/></svg></span>Leads</a>
</nav>

<div class="toast" id="toast" role="status" aria-live="polite"><span id="toastText"></span><button id="toastX" aria-label="Dismiss">×</button></div>
<div class="scrim" id="scrim" hidden></div>

<div class="sheet" id="menu" hidden role="dialog" aria-label="Menu"><div class="grab"></div>
<button class="item" id="mRefresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>Refresh</button>
<button class="item" id="mInstall" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Install the app</button>
<p class="hint" id="iosHint" hidden style="margin:12px 4px">To install on iPhone: tap Share, then Add to Home Screen.</p>
<button class="item" id="mToken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/></svg>Change the lab token</button>
<h3>Other pages</h3>
<nav class="sitenav" aria-label="Site">${navHtml(OPERATOR_NAV, '/email-marketing')}</nav>
</div>

<div class="sheet" id="pushSheet" hidden role="dialog" aria-label="Add leads to a campaign"><div class="grab"></div>
<h2>Add leads to a campaign</h2>
<select id="pushCampaign"><option value="">Choose a campaign…</option></select>
<button id="pushSelected" class="block" style="margin-top:12px" disabled>Add selected</button>
<button id="pushAll" class="primary block" style="margin-top:8px" disabled>Add all matching</button>
<p class="hint">Bounced and unsubscribed addresses are always left out.</p>
</div>

<div class="gate" id="gate" hidden><div>
<h2>Email hub</h2><p>Enter the lab token once. This phone keeps it.</p>
<input id="token" type="password" placeholder="LAB_TOKEN" autocomplete="current-password">
<button class="primary block" id="saveToken" style="margin-top:12px">Open the hub</button>
</div></div>

<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var num=function(n){return Number(n||0).toLocaleString()};
  var pct=function(r){return r==null?'—':(r*100).toFixed(r<0.1?1:0)+'%'};
  var when=function(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return esc(iso);return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+', '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})};
  var hm=function(iso){var d=new Date(iso);return isNaN(d)?'':d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})};
  var ago=function(iso){if(!iso)return '';var s=(Date.now()-new Date(iso).getTime())/1000;if(isNaN(s))return '';if(s<3600)return Math.max(1,Math.round(s/60))+'m';if(s<86400)return Math.round(s/3600)+'h';return Math.round(s/86400)+'d'};
  var token=function(){try{return localStorage.getItem('labToken')||''}catch(e){return ''}};
  var plural=function(n,one,many){return num(n)+' '+(n===1?one:(many||one+'s'))};
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var S={status:null,campaigns:[],cats:[],convos:[],queue:[],leadOffset:0,leadTotal:0,leadRows:[],picked:{},camp:null,clOffset:0,reply:null,templates:[],tpl:null,daily:[],loadedAt:0,moves:0};

  // ---- messages ----
  var toastTimer=null;
  function show(kind,text){
    var el=$('toast');
    if(!text){if(el.dataset.kind===kind)el.className='toast';return}
    clearTimeout(toastTimer);el.dataset.kind=kind;$('toastText').textContent=text;el.className='toast show '+kind;
    if(kind==='info')toastTimer=setTimeout(function(){show('info')},4500);
  }
  $('toastX').onclick=function(){$('toast').className='toast'};
  function api(path,opts){
    opts=opts||{};
    var h={authorization:'Bearer '+token()};if(opts.body)h['content-type']='application/json';
    return fetch(path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){
        if(r.status===401){$('gate').hidden=false;throw new Error('Enter the LAB_TOKEN to use this page.')}
        if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j});
    },function(){throw new Error(navigator.onLine?'Could not reach the server. Try again.':'You are offline.')});
  }
  function fail(e){show('error',e.message||String(e))}
  function catName(id){if(id==null)return '';for(var i=0;i<S.cats.length;i++)if(S.cats[i].id==id)return S.cats[i].name;return '#'+id}
  var STATUS={ACTIVE:['ok','Sending'],INPROGRESS:['ok','Sending'],STARTED:['warn','Starting'],PAUSED:['warn','Paused'],DRAFTED:['warn','Draft'],STOPPED:['bad','Stopped'],BLOCKED:['bad','Blocked'],COMPLETED:['','Done'],NEW:['blue','New']};
  function statusPill(s){s=String(s||'').toUpperCase();var m=STATUS[s]||['',s?s.charAt(0)+s.slice(1).toLowerCase():'—'];return '<span class="chip '+m[0]+'">'+esc(m[1])+'</span>'}
  function replyHref(c){return '#reply/'+c.campaign_id+'/'+encodeURIComponent(c.email)}
  function initial(s){var m=String(s||'?').replace(/^(the|syarikat)\s+/i,'').match(/[A-Za-z0-9]/);return m?m[0].toUpperCase():'?'}

  // ---- sheets ----
  var openSheetId=null;
  function openSheet(id){closeSheet();openSheetId=id;$(id).hidden=false;$('scrim').hidden=false}
  function closeSheet(){if(openSheetId)$(openSheetId).hidden=true;openSheetId=null;$('scrim').hidden=true}
  $('scrim').onclick=closeSheet;
  $('menuBtn').onclick=function(){openSheet('menu')};
  $('mRefresh').onclick=function(){closeSheet();refresh()};
  $('mToken').onclick=function(){closeSheet();$('token').value='';$('gate').hidden=false;$('token').focus()};
  $('menu').addEventListener('click',function(e){if(e.target.closest('.sitenav a'))closeSheet()});

  // ---- routing ----
  // A hash name maps to the section that shows it, a section to its bottom tab.
  var SECTION={dashboard:'dashboard',replies:'inbox',chats:'inbox',reply:'reply',campaigns:'campaigns',templates:'campaigns',campaign:'campaign',template:'template',leads:'leads',forms:'leads'};
  var TAB={dashboard:'dashboard',inbox:'replies',reply:'replies',campaigns:'campaigns',campaign:'campaigns',template:'campaigns',leads:'leads'};
  var TITLE={dashboard:'Email hub',inbox:'Inbox',campaigns:'Campaigns',leads:'Leads',reply:'Reply',campaign:'Campaign',template:'Template'};
  var FOCUS={reply:'#replies',campaign:'#campaigns',template:'#templates'};
  function route(soft){
    var h=location.hash.replace(/^#/,'')||'dashboard';var parts=h.split('/');var v=SECTION[parts[0]]?parts[0]:'dashboard';var sec=SECTION[v];
    if(!soft){show('error');show('info');closeSheet()}
    Object.keys(TAB).forEach(function(x){$('v-'+x).hidden=x!==sec});
    document.querySelectorAll('#tabs a').forEach(function(a){if(a.dataset.view===TAB[sec])a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
    document.querySelectorAll('.seg a').forEach(function(a){if(a.dataset.view===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
    var focus=FOCUS[sec];
    document.body.classList.toggle('focus',!!focus);$('back').hidden=!focus;$('back').dataset.href=focus||'';
    if(!soft)$('title').textContent=TITLE[sec];
    S.loadedAt=Date.now();
    if(soft&&focus)return; // never reload an open editor or reply over what is being typed
    if(sec==='dashboard')loadDashboard();
    if(sec==='inbox'){var all=v==='chats';$('chatTools').hidden=!all;$('openAny').hidden=!all;$('chatNote').hidden=!all;loadConvos().then(renderInbox)}
    if(v==='reply')openReply(Number(parts[1])||null,decodeURIComponent(parts.slice(2).join('/')));
    if(v==='campaigns'){$('paneCamps').hidden=false;$('paneTpls').hidden=true;loadStatus().then(renderCampaigns).catch(fail)}
    if(v==='templates'){$('paneCamps').hidden=true;$('paneTpls').hidden=false;loadTemplates()}
    if(v==='campaign'){loadTemplates();(S.status?Promise.resolve():loadStatus()).then(function(){if(parts[1]==='new')newCampaign();else return openCampaign(Number(parts[1]))}).catch(fail)}
    if(v==='template')loadTemplates().then(function(){
      if(parts[1]==='new')return openTemplate(null);
      var t=S.templates.filter(function(x){return x.id===Number(parts[1])})[0];
      if(t)openTemplate(t);else location.hash='#templates';
    });
    if(sec==='leads'){$('paneLeads').hidden=v!=='leads';$('paneForms').hidden=v!=='forms'}
    if(v==='leads'){loadStatus().catch(fail);hostStatus();if(!S.leadRows.length||soft)loadLeads()}
    if(v==='forms')loadSites();
    if(!soft)window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',function(){S.moves++;route()});
  $('back').onclick=function(){if(S.moves>0)history.back();else location.hash=$('back').dataset.href};
  function refresh(){route(true)}

  // ---- home ----
  function cell(label,value,sub){return '<div><b>'+value+'</b><span>'+esc(label)+(sub?', '+sub:'')+'</span></div>'}
  function loadDashboard(){
    return api('/api/email-marketing/dashboard').then(function(d){
      var L=d.leads,G=d.sending;
      setBadge(d.replies.waiting);
      var rw=d.replies.waiting,rt=d.replies.total;
      $('waitN').textContent=num(rw);$('waitWord').textContent=rw===1?'reply waiting':'replies waiting';
      // Nothing waiting but conversations exist: the card opens them, not the empty waiting list.
      $('waitCard').setAttribute('href',rw||!rt?'#replies':'#chats');
      $('waitCard').classList.toggle('clear',!rw);
      $('waitSub').textContent=rw?plural(rt,'conversation')+' in all.'+(d.model?' Drafts are written by '+d.model+'.':''):rt?'All answered. '+plural(rt,'conversation')+' so far.':'No lead has replied yet.';
      $('waitGo').hidden=!rw&&!rt;$('waitGoText').textContent=rw?'Answer now':'Open the conversations';
      if(!rw)$('waitNext').hidden=true;
      $('mSent').textContent=num(G.sent_today);
      $('mOf').textContent=G.daily_capacity?'of '+num(G.daily_capacity)+' the mailboxes can send today':'sent by the mailboxes today';
      $('mBar').style.width=G.daily_capacity?Math.min(100,G.sent_today*100/G.daily_capacity)+'%':'0';
      $('leadTiles').innerHTML=cell('lead emails',num(L.emails),num(L.companies)+' companies')+cell('in a campaign',num(L.in_campaign))+cell('not yet emailed',num(L.not_yet))+cell('replied',num(G.replied));
      $('sendTiles').innerHTML=cell('sent',num(G.sent))+cell('opened',num(G.opened),pct(G.open_rate))+cell('replied',num(G.replied),pct(G.reply_rate))+cell('interested',num(G.interested))+
        cell('bounced',num(G.bounced),pct(G.bounce_rate))+cell('unsubscribed',num(G.unsubscribed))+cell('campaigns',num(G.campaigns),num(G.active)+' sending')+cell('mailboxes',num(G.mailboxes));
      var hot=G.bounce_rate!=null&&G.bounce_rate>0.03;$('sendNote').hidden=!hot;
      $('sendNote').textContent=hot?'Bounce rate is '+pct(G.bounce_rate)+', over 3%. Pause and clean the list before it hurts the mailbox.':'';
      renderChart(d.daily||[]);renderCampTotals(d.campaigns||[]);
    }).then(loadStatus).then(function(){loadToday();loadAutopilot();loadForms();loadUnsub();loadConvos().then(renderWaitNext)}).then(renderChecks).catch(fail);
  }
  function renderWaitNext(){
    var c=S.queue[0];$('waitNext').hidden=!c;if(!c)return;
    $('waitNext').innerHTML='<b>'+esc(c.company||c.email)+' <span class="muted" style="display:inline;font-weight:500">'+ago(c.replied_at)+' ago</span></b><span>'+esc(c.preview||'')+'</span>';
    $('waitCard').setAttribute('href',replyHref(c)); // straight into the first waiting reply
  }
  function renderChart(daily){
    S.daily=daily;var max=Math.max.apply(null,daily.map(function(x){return x.sent}).concat([1]));
    $('chart').innerHTML=daily.map(function(x,i){var h=x.sent*100/max;
      return '<button class="col'+(i===daily.length-1?' today':'')+'" data-i="'+i+'" aria-label="'+esc(dayName(x.day))+': '+x.sent+' sent, '+x.replied+' replied"><span class="b" style="height:'+h+'%"></span>'+(x.replied?'<span class="d" style="bottom:calc('+h+'% + 6px)"></span>':'')+'</button>'}).join('');
    var lab=function(i){return daily[i]?dayName(daily[i].day,true):''};
    $('axis').innerHTML=daily.length?'<span>'+lab(0)+'</span><span>'+lab(7)+'</span><span>Today</span>':'';
    chartCaption(null);
  }
  function dayName(day,short){var d=new Date(day+'T00:00:00');return d.toLocaleDateString(undefined,short?{day:'numeric',month:'short'}:{weekday:'short',day:'numeric',month:'short'})}
  function chartCaption(i){
    var d=S.daily;if(!d.length){$('chartCap').textContent='No sends logged yet.';return}
    document.querySelectorAll('#chart .col').forEach(function(c){c.classList.toggle('sel',Number(c.dataset.i)===i)});
    if(i==null){var s=0,r=0,b=0;d.forEach(function(x){s+=x.sent;r+=x.replied;b+=x.bounced});$('chartCap').innerHTML='<b>'+num(s)+'</b> sent, <span class="dotk"></span><b>'+num(r)+'</b> replied, '+num(b)+' bounced in 14 days';return}
    var x=d[i];$('chartCap').innerHTML='<b>'+esc(dayName(x.day))+'</b>: '+num(x.sent)+' sent, '+num(x.opened)+' read, '+num(x.replied)+' replied'+(x.bounced?', '+num(x.bounced)+' bounced':'');
  }
  $('chart').onclick=function(e){var c=e.target.closest('.col');if(!c)return;var i=Number(c.dataset.i);chartCaption(c.classList.contains('sel')?null:i)};
  function nums(pairs){return '<div class="nums">'+pairs.map(function(p){return '<div><b>'+num(p[1])+'</b><span>'+p[0]+'</span></div>'}).join('')+'</div>'}
  function renderCampTotals(list){
    var tot={sent:0,opened:0,replied:0,bounced:0};
    var rows=list.map(function(c){['sent','opened','replied','bounced'].forEach(function(k){tot[k]+=c[k]||0});
      return '<a class="camp" href="#campaign/'+c.id+'"><div class="camp-top"><span class="camp-name">'+esc(c.name)+'</span>'+statusPill(c.status)+'</div>'+nums([['sent',c.sent],['read',c.opened],['replied',c.replied],['bounced',c.bounced]])+(c.unsubscribed?'<div class="aside" style="margin-top:4px">'+plural(c.unsubscribed,'unsubscribe')+'</div>':'')+'</a>'});
    $('campCards').innerHTML=rows.length?rows.join('')+(rows.length>1?'<div class="camp"><div class="camp-top"><span class="camp-name">All campaigns</span></div>'+nums([['sent',tot.sent],['read',tot.opened],['replied',tot.replied],['bounced',tot.bounced]])+'</div>':''):'<div class="empty">No campaigns yet.<br><a href="#campaigns">Make the first one</a></div>';
  }

  // ---- today, autopilot, unsubscribed ----
  function loadToday(){
    return api('/api/email-marketing/today').then(function(r){
      $('todayDay').textContent=r.day?dayName(r.day):'';
      $('todayStrip').innerHTML=[['read',r.opened],['replied',r.replied],['bounced',r.bounced],['unsubscribed',r.unsubscribed]].map(function(x){return '<div><b>'+num(x[1])+'</b><span>'+x[0]+'</span></div>'}).join('');
      $('todayCount').textContent=num(r.rows.length);
      $('todayRows').innerHTML=r.rows.length?r.rows.map(function(x){return '<div class="rowl"><div class="grow"><div class="rt">'+esc(x.company||x.email)+'</div><div class="rs">'+esc(x.email)+'</div><div class="rs">'+esc([x.mail_host,x.campaign_name].filter(Boolean).join(', '))+'</div></div><div class="rr">'+hm(x.at)+'</div></div>'}).join(''):'<div class="empty">Nothing sent yet today.</div>';
    }).catch(fail);
  }
  function loadUnsub(){
    return api('/api/email-marketing/unsubscribed').then(function(r){
      $('unsubCount').textContent=num(r.unsubscribed+r.bounced);
      $('unsubRows').innerHTML=r.rows.length?r.rows.map(function(x){var k=x.kind==='bounced'?'warn':'bad';return '<div class="rowl"><div class="grow"><div class="rt">'+esc(x.company||x.email)+'</div><div class="rs">'+esc(x.email)+'</div></div><div class="rr"><span class="chip '+k+'">'+esc(x.kind)+'</span><div>'+(x.at?ago(x.at)+' ago':'')+'</div></div></div>'}).join(''):'<div class="empty">Nobody has unsubscribed or bounced yet.</div>';
    }).catch(fail);
  }
  function mixText(mix){return Object.keys(mix||{}).map(function(k){return esc(k)+' '+mix[k]}).join(', ')}
  function apResult(r){
    if(r.reason)return '<p class="hint">'+esc(r.reason)+'</p>';
    return '<p class="hint"><b>'+num(r.picked)+' leads</b> for "'+esc(r.campaign||'')+'": '+mixText(r.mix)+(r.ran?'. Added '+num(r.added)+' to Smartlead.':'. Nothing added yet.')+'</p>'+
      '<div class="list" style="margin-top:8px">'+(r.sample||[]).slice(0,10).map(function(x){return '<div class="rowl" style="min-height:0;padding:9px 12px"><span class="grow rt" style="font-weight:500">'+esc(x.company_name||x.email)+'</span><span class="rr">'+esc(x.mail_host||'')+'</span></div>'}).join('')+((r.sample||[]).length>10?'<div class="rowl" style="min-height:0;padding:9px 12px"><span class="rs">and '+((r.sample||[]).length-10)+' more</span></div>':'')+'</div>';
  }
  function loadAutopilot(){
    return api('/api/email-marketing/autopilot').then(function(r){
      var s=r.settings,box=((S.status&&S.status.mailboxes)||[])[0];
      $('apOn').checked=s.enabled;$('apPerDay').value=s.new_per_day;$('apStart').value=s.ramp_start;$('apRamp').value=s.ramp_days;
      var keep=s.campaign_id||'';
      $('apCamp').innerHTML='<option value="">Choose the campaign to feed…</option>'+(S.campaigns||[]).map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+' ('+esc(c.status)+')</option>'}).join('');$('apCamp').value=String(keep);
      var today=(r.runs||[]).filter(function(x){return x.day===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})})[0];
      $('apState').textContent=(s.enabled?'On. Today\'s target is '+r.today_target+' new leads'+(r.in_window?'.':', checked again in the next weekday window (08:00 to 15:00 KL).'):'Off. Nothing is added until you switch it on.')+
        (today?' Added today: '+today.added+' of '+today.picked+' ('+mixText(today.mix)+').':'')+
        (r.last&&r.last.reason&&!r.last.dry?' Last check: '+r.last.reason:'')+(box?' Mailbox limit: '+num(box.daily_limit)+' a day.':'');
    }).catch(fail);
  }
  function apSettings(){return {enabled:$('apOn').checked,campaign_id:Number($('apCamp').value)||null,new_per_day:Number($('apPerDay').value),ramp_start:Number($('apStart').value),ramp_days:Number($('apRamp').value)}}
  function apSave(){
    var b=apSettings();
    if(b.enabled&&!b.campaign_id){$('apOn').checked=false;$('apCard').querySelector('details').open=true;return show('error','Choose the campaign to feed first.')}
    if(b.enabled&&!confirm('Switch autopilot on? From the next weekday check it adds leads to "'+$('apCamp').selectedOptions[0].textContent+'" and Smartlead sends them.')){$('apOn').checked=false;return}
    api('/api/email-marketing/autopilot',{method:'POST',body:b}).then(function(){show('info',b.enabled?'Autopilot is on.':'Autopilot saved. It is off.');return loadAutopilot()}).catch(function(e){fail(e);loadAutopilot()});
  }
  $('apSave').onclick=apSave;
  $('apOn').onchange=apSave;
  $('apPreview').onclick=function(){
    var id=Number($('apCamp').value);if(!id)return show('error','Choose the campaign to feed first.');
    var b=apSettings();delete b.enabled; // a preview never switches it on or off
    $('apOut').innerHTML='<p class="hint">Picking today\'s leads…</p>';
    api('/api/email-marketing/autopilot',{method:'POST',body:b}).then(function(){return api('/api/email-marketing/autopilot/preview',{method:'POST',body:{}})}).then(function(r){$('apOut').innerHTML=apResult(r)}).catch(function(e){$('apOut').innerHTML='';fail(e)});
  };
  $('apRun').onclick=function(){
    if(!$('apOn').checked)return show('error','Switch autopilot on first.');
    if(!confirm('Add today\'s batch to the campaign now?'))return;
    api('/api/email-marketing/autopilot/run',{method:'POST',body:{}}).then(function(r){$('apOut').innerHTML=apResult(r);return loadAutopilot()}).catch(fail);
  };
  function loadForms(){
    return api('/api/email-marketing/form-autopilot').then(function(r){
      var s=r.settings,c=r.counts||{},checked=0;
      Object.keys(c).forEach(function(k){if(k!=='checking')checked+=c[k]});
      $('fpOn').checked=s.enabled;$('fpPerDay').value=s.per_day;
      $('fpTpl').innerHTML='<option value="">Choose the template…</option>'+(r.templates||[]).map(function(t){return '<option value="'+t.id+'">'+esc(t.name)+'</option>'}).join('');$('fpTpl').value=String(s.template_id||'');
      $('fpName').value=s.sender.name;$('fpCompany').value=s.sender.company;$('fpPhone').value=s.sender.phone;$('fpEmail').value=s.sender.email;
      $('fpState').textContent=(s.enabled?'On. Sent today: '+r.sent_today+' of '+s.per_day+(r.in_window?'.':'; next in the weekday window (08:00 to 15:00 KL).'):'Off. No form is sent until you switch it on.')+
        (checked?' '+num(checked)+' forms tried: '+num((c.sent||0)+(c.submitted_unconfirmed||0))+' sent, '+num(c.captcha||0)+' behind a captcha.':'')+(r.last&&r.last.reason?' Last check: '+r.last.reason:'');
      var lv=r.live;
      $('fpNow').disabled=!!lv;$('fpNow').textContent=lv?'Sending…':'Send now';
      if(lv)$('fpState').textContent='Sending now: '+lv.sent+' of '+lv.target+' sent, '+lv.tried+' forms tried. About half a minute per form. '+$('fpState').textContent;
      clearTimeout(S.fpTimer);if(lv)S.fpTimer=setTimeout(loadForms,15000);
      var sa=(r.scan&&r.scan.all)||{},st=(r.scan&&r.scan.target)||{},total=0,left=0;
      Object.keys(sa).forEach(function(k){total+=sa[k];if(k==='not_checked'||k==='taken')left+=sa[k]});
      $('fpState').textContent+=' Websites checked by the PC: '+num(total-left)+' of '+num(total)+'. Open forms: '+num(sa.bot_can_submit||0)+', of them '+num(st.bot_can_submit||0)+' target companies.';
      $('fpRows').innerHTML=(r.recent||[]).map(function(x){var k=x.sent_at?'ok':x.status==='captcha'?'warn':x.status==='failed'?'bad':'blue';return '<div class="rowl"><div class="grow"><div class="rt">'+esc(x.company_name)+'</div><div class="rs">'+esc(x.form_url||x.website)+'</div><div class="rs">'+esc(x.detail)+'</div></div><div class="rr"><span class="chip '+k+'">'+esc(String(x.status).replace(/_/g,' '))+'</span><div>'+(x.checked_at?ago(x.checked_at)+' ago':'')+'</div></div></div>'}).join('');
    }).catch(fail);
  }
  function fpSave(){
    var b={enabled:$('fpOn').checked,per_day:Number($('fpPerDay').value),template_id:Number($('fpTpl').value)||null,sender:{name:$('fpName').value,company:$('fpCompany').value,phone:$('fpPhone').value,email:$('fpEmail').value}};
    if(b.enabled&&!b.template_id){$('fpOn').checked=false;$('fpCard').querySelector('details').open=true;return show('error','Choose the template for contact forms first.')}
    if(b.enabled&&!confirm('Switch contact forms on? Each weekday it sends the first email of "'+$('fpTpl').selectedOptions[0].textContent+'" through up to '+b.per_day+' company websites, as '+b.sender.name+'.')){$('fpOn').checked=false;return}
    api('/api/email-marketing/form-autopilot',{method:'POST',body:b}).then(function(){show('info',b.enabled?'Contact forms are on.':'Saved. Contact forms are off.');return loadForms()}).catch(function(e){fail(e);loadForms()});
  }
  $('fpNow').onclick=function(){
    var n=Math.round(Number($('fpNowN').value));if(!(n>=1&&n<=500))return show('error','Send 1 to 500 at a time.');
    if(!$('fpTpl').value)return show('error','Choose the template for contact forms first.');
    if(!confirm('Send "'+$('fpTpl').selectedOptions[0].textContent+'" through '+n+' company contact forms now, as '+$('fpName').value+'?'))return;
    $('fpNow').disabled=true;
    api('/api/email-marketing/form-autopilot',{method:'POST',body:{template_id:Number($('fpTpl').value),sender:{name:$('fpName').value,company:$('fpCompany').value,phone:$('fpPhone').value,email:$('fpEmail').value}}})
      .then(function(){return api('/api/email-marketing/form-autopilot/run',{method:'POST',body:{count:n}})})
      .then(function(r){show(r.started?'info':'error',r.started?'Sending '+n+' now. The card shows each one as it goes.':r.reason);return loadForms()})
      .catch(function(e){fail(e);loadForms()});
  };
  $('fpSave').onclick=fpSave;
  $('fpOn').onchange=fpSave;
  $('fpTest').onclick=function(){
    $('fpOut').innerHTML='<p class="hint">Checking sites for an open form, then filling it without sending. This takes a minute or two…</p>';
    api('/api/email-marketing/form-autopilot/test',{method:'POST',body:{}}).then(function(r){
      $('fpOut').innerHTML='<p class="hint"><b>'+esc(r.company_name)+'</b> ('+num(r.checked)+' sites checked): '+esc(String(r.status).replace(/_/g,' '))+'. '+esc(r.detail)+'</p>'+(r.screenshot?'<img src="'+esc(r.screenshot)+'" alt="The filled form" style="width:100%;border-radius:10px;margin-top:8px">':'');
    }).catch(function(e){$('fpOut').innerHTML='';fail(e)});
  };
  // ---- contact-form websites ----
  var SITE={offset:0,timer:null};
  var SITE_WORD={waiting:'waiting to send',sent:'sent',tried:'tried, not sent',open:'open forms',captcha:'behind a captcha'};
  function loadSites(){
    var q=new URLSearchParams({filter:$('siteFilter').value,offset:String(SITE.offset)});
    var s=$('siteSearch').value.trim();if(s)q.set('search',s);
    return api('/api/email-marketing/form-autopilot/sites?'+q.toString()).then(function(r){
      var c=r.counts||{};
      Array.prototype.forEach.call($('siteFilter').options,function(o){o.textContent=o.textContent.replace(/ \([\d,]+\)$/,'')+' ('+num(c[o.value])+')'});
      $('siteCount').textContent=num(r.total)+' '+SITE_WORD[r.filter];
      $('siteRows').innerHTML=r.rows.length?r.rows.map(function(x){
        var st=x.sent_at?['ok','sent']:x.send_status?[x.send_status==='captcha'?'warn':'bad',x.send_status]:x.form==='captcha'?['warn','captcha']:['blue','waiting'];
        var link=x.form_url||x.website;
        return '<div class="rowl"><div class="grow"><div class="rt">'+esc(x.company_name)+'</div><div class="rs">'+esc(x.category||'')+'</div><div class="rs"><a href="'+esc(link)+'" target="_blank" rel="noopener">'+esc(String(link).replace(/^https?:\/\/(www\.)?/,''))+'</a></div>'+(x.send_detail||x.form==='captcha'?'<div class="rs">'+esc(x.send_detail||x.form_detail)+'</div>':'')+'</div><div class="rr"><span class="chip '+st[0]+'">'+esc(String(st[1]).replace(/_/g,' '))+'</span><div>'+((x.tried_at)?ago(x.tried_at)+' ago':'')+'</div></div></div>';
      }).join(''):'<div class="empty">No website here yet.</div>';
      var from=r.total?r.offset+1:0,to=Math.min(r.offset+r.page_size,r.total);
      $('sitePage').textContent=num(from)+'–'+num(to)+' of '+num(r.total);
      $('sitePrev').disabled=r.offset<=0;$('siteNext').disabled=to>=r.total;
    }).catch(fail);
  }
  $('siteFilter').onchange=function(){SITE.offset=0;loadSites()};
  $('siteSearch').oninput=function(){clearTimeout(SITE.timer);SITE.timer=setTimeout(function(){SITE.offset=0;loadSites()},350)};
  $('sitePrev').onclick=function(){SITE.offset=Math.max(0,SITE.offset-50);loadSites();window.scrollTo(0,0)};
  $('siteNext').onclick=function(){SITE.offset+=50;loadSites();window.scrollTo(0,0)};
  function setBadge(n){
    $('badge').hidden=!n;$('badge').textContent=n>99?'99+':String(n);$('segN').textContent=n?'('+n+')':'';
    try{if(n&&navigator.setAppBadge)navigator.setAppBadge(n);else if(navigator.clearAppBadge)navigator.clearAppBadge()}catch(e){}
  }
  function loadStatus(){
    return Promise.all([api('/api/email-marketing/status'),api('/api/email-marketing/campaigns').catch(function(){return {campaigns:[]}})]).then(function(r){
      S.status=r[0];S.cats=r[0].categories||[];S.campaigns=r[1].campaigns||[];fillCampaignSelects();
    });
  }
  function renderChecks(){
    var st=S.status||{},boxes=st.mailboxes||[],w=st.webhook,bad=0;
    var check=function(ok,t,d){if(!ok)bad++;return '<div class="check"><b class="'+(ok?'ok':'bad')+'">'+(ok?'✓':'✕')+'</b><div>'+t+(d?'<div class="aside">'+d+'</div>':'')+'</div></div>'};
    var active=S.campaigns.filter(function(c){return c.status==='ACTIVE'}).length;
    $('checks').innerHTML=check(st.configured,'Smartlead connected')+
      check(boxes.length>0,plural(boxes.length,'sending mailbox','sending mailboxes'),boxes.length?'':'Connect one in Smartlead, Email Accounts.')+
      check(S.campaigns.length>0,plural(S.campaigns.length,'campaign'))+
      check(active>0,num(active)+' sending',active?'':'Open a campaign and press Start.')+
      (w?check(w.ready&&!(w.errors||[]).length,'Webhook on '+num(w.with_webhook)+' of '+num(w.campaigns)+' campaigns',(w.errors||[]).length?esc(w.errors.join('; ')):(w.last_event_at?'Last event '+when(w.last_event_at):'No event yet.')):'');
    $('checkSum').innerHTML=bad?'<span class="bad">'+plural(bad,'problem')+'</span>':'<span class="ok">All good</span>';
    $('mailboxes').innerHTML=boxes.length?boxes.map(function(m){var broken=m.smtp_ok===false||m.imap_ok===false;return '<div class="rowl"><div class="grow"><div class="rt">'+esc(m.email)+'</div><div class="rs">'+esc([m.name,m.type].filter(Boolean).join(', '))+'</div><div class="rs">'+esc(m.sent_today)+' of '+esc(m.daily_limit)+' sent today</div></div><span class="chip '+(broken?'bad':'ok')+'">'+(broken?'failing':'ok')+'</span></div>'}).join(''):'<div class="empty">No mailbox yet.</div>';
  }

  // ---- inbox ----
  function loadConvos(){
    return api('/api/email-marketing/conversations').then(function(r){S.convos=r.rows||[];S.queue=S.convos.filter(function(c){return c.needs_reply});setBadge(r.waiting);return S.convos}).catch(function(e){fail(e);return []});
  }
  function draftPill(c){
    if(c.answered_at&&!c.needs_reply)return '<span class="chip ok">Answered</span>';
    if(c.draft_status==='dismissed')return '<span class="chip">No reply needed</span>';
    if(c.draft_status==='ready')return '<span class="chip blue">Draft ready</span>';
    if(c.draft_status==='drafting')return '<span class="chip warn">Writing…</span>';
    if(c.draft_status==='failed')return '<span class="chip bad">Draft failed</span>';
    return '<span class="chip warn">Waiting</span>';
  }
  function itemHtml(c){
    return '<a class="conv" href="'+replyHref(c)+'"><span class="av'+(c.needs_reply?' wait':'')+'">'+esc(initial(c.company||c.email))+'</span><span class="cb"><span class="ct"><b>'+esc(c.company||c.email)+'</b><time>'+ago(c.replied_at)+'</time></span>'+
      '<span class="cs" style="display:block">'+esc(c.email)+(c.campaign_name?', '+esc(c.campaign_name):'')+'</span><span class="cp">'+esc(c.preview||'')+'</span>'+draftPill(c)+'</span></a>';
  }
  function renderInbox(){
    var all=(location.hash.replace(/^#/,'').split('/')[0])==='chats';
    if(!all){$('convList').innerHTML=S.queue.length?S.queue.map(itemHtml).join(''):'<div class="empty">Nothing waiting. Every reply has an answer.<br><a href="#chats">See all conversations</a></div>';return}
    var q=$('chatSearch').value.trim().toLowerCase();
    var rows=S.convos.filter(function(c){return !q||(c.email+' '+(c.company||'')).toLowerCase().indexOf(q)>=0});
    $('convList').innerHTML=rows.length?rows.map(itemHtml).join(''):'<div class="empty">'+(S.convos.length?'No conversation matches "'+esc(q)+'".':'No lead has replied yet.')+'</div>';
  }
  $('chatSearch').oninput=renderInbox;
  $('threadGo').onclick=function(){var em=$('threadEmail').value.trim().toLowerCase();if(em)location.hash='#reply/0/'+encodeURIComponent(em)};
  $('threadEmail').onkeydown=function(e){if(e.key==='Enter')$('threadGo').click()};

  // ---- one reply ----
  function neighbours(campaignId,email){
    var list=S.queue.length?S.queue:S.convos;var i=-1;
    for(var k=0;k<list.length;k++)if(list[k].email===email&&(!campaignId||list[k].campaign_id===campaignId)){i=k;break}
    return {list:list,i:i};
  }
  function openReply(campaignId,email){
    S.reply={campaignId:campaignId,email:email};
    var go=function(){
      var n=neighbours(campaignId,email);
      $('rPos').textContent=n.i>=0?(n.i+1)+' of '+n.list.length+(S.queue.length?' waiting':''):'';
      $('rPrev').disabled=n.i<=0;$('rNext').disabled=n.i<0||n.i>=n.list.length-1;
      $('rPrev').onclick=function(){if(n.i>0)location.hash=replyHref(n.list[n.i-1])};
      $('rNext').onclick=function(){if(n.i>=0&&n.i<n.list.length-1)location.hash=replyHref(n.list[n.i+1])};
    };
    (S.convos.length?Promise.resolve():loadConvos()).then(go);
    $('rBody').innerHTML='<div class="empty">Loading the conversation with '+esc(email)+'…</div>';
    api('/api/email-marketing/response?email='+encodeURIComponent(email)+(campaignId?'&campaign_id='+campaignId:'')).then(function(r){
      if(S.reply.email!==email)return;
      S.reply.data=r;renderReply();
      if(r.target&&!r.draft&&!r.drafting)writeDraft(null);
      else if(r.drafting||(r.draft&&r.draft.status==='drafting'))setTimeout(function(){if(S.reply&&S.reply.email===email&&!$('v-reply').hidden)openReply(campaignId,email)},4000);
    }).catch(function(e){$('rBody').innerHTML='<div class="empty bad">'+esc(e.message)+'</div>'});
  }
  var QUICK=[['Shorter','Make it shorter'],['In Malay','Write it in Malay'],['In Chinese','Write it in Chinese'],['Ask for the bill','Ask them to send a recent electricity bill'],['Book a call','Suggest a short phone call and ask for a good time']];
  function grow(el){el.style.height='auto';el.style.height=Math.max(200,el.scrollHeight+2)+'px'}
  function renderReply(){
    var r=S.reply.data,L=r.lead,t=r.thread,msgs=t.messages||[],target=r.target,d=r.draft;
    var company=(r.company&&r.company.name)||L.company_name||L.email;
    $('title').textContent=company;
    var earlier=msgs.filter(function(m){return m!==target&&!(target&&m.time===target.time&&m.inbound)});
    var html='<div class="lead-h"><h2>'+esc(company)+'</h2><p>'+esc(L.email)+'</p><p>'+esc([r.company&&r.company.category,t.campaign_name].filter(Boolean).join(', '))+(L.unsubscribed?' <span class="chip bad">Unsubscribed</span>':'')+'</p></div>';
    html+='<div class="thread">';
    if(earlier.length)html+='<details class="more" style="margin:0"><summary><span class="grow">Earlier in the thread</span><span class="aside">'+earlier.length+'</span></summary><div class="in"><div class="thread" style="margin:0">'+earlier.map(function(m){return '<div class="bub '+(m.inbound?'in':'out')+'"><span class="meta">'+(m.inbound?'Them':'Us')+(m.seq?', email '+esc(m.seq):'')+', '+when(m.time)+(m.subject?'<br><b>'+esc(m.subject)+'</b>':'')+'</span>'+esc(m.body)+'</div>'}).join('')+'</div></div></details>';
    if(target)html+='<div class="bub in their"><span class="meta">Their reply, '+when(target.time)+(target.subject?'<br><b>'+esc(target.subject)+'</b>':'')+'</span>'+esc(target.body)+'</div>';
    else html+='<div class="empty">They have not replied in this campaign yet.</div>';
    html+='</div>';
    if(target){
      var sent=d&&d.status==='sent';
      html+='<div class="compose"><div class="sec-h"><h2>'+(sent?'Sent':'Your reply')+'</h2><span class="aside" id="rDraftNote"></span></div>';
      if(sent)html+='<div class="thread" style="margin:0"><div class="bub out"><span class="meta">Sent '+when(d.sent_at)+'</span>'+esc(d.sent_body)+'</div></div>';
      else{
        html+='<textarea id="rText" placeholder="Writing the reply…"'+(d&&d.status==='drafting'?' disabled':'')+'>'+esc(d&&d.draft||'')+'</textarea>'+
          (d&&d.status==='failed'?'<p class="hint bad">The draft failed: '+esc(d.error)+'. Write it yourself or tap Rewrite.</p>':'')+
          (d&&d.status==='dismissed'?'<p class="hint">Marked as needing no reply. You can still send one.</p>':'')+
          '<div class="quick" id="rQuick">'+QUICK.map(function(q){return '<button data-h="'+esc(q[1])+'">'+esc(q[0])+'</button>'}).join('')+'</div>'+
          '<div class="btns" style="flex-wrap:nowrap;margin-top:10px"><input id="rHint" placeholder="Or say how to rewrite it"><button id="rRewrite" style="flex:none">Rewrite</button></div>';
      }
      html+='</div>';
    }
    html+='<details class="more" style="margin-top:18px"><summary><span class="grow">Category</span><span class="aside">'+esc(catName(t.category_id)||'None')+'</span></summary><div class="in"><select id="rCat"><option value="">No category</option>'+S.cats.map(function(c){return '<option value="'+c.id+'"'+(c.id==t.category_id?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')+'</select></div></details>';
    if(target&&!(d&&d.status==='sent'))html+='<div class="actbar"><button class="primary" id="rSend">Approve &amp; send</button><button id="rDismiss">No reply needed</button></div>';
    else html+='<div style="height:calc(24px + var(--bot))"></div>';
    $('rBody').innerHTML=html;
    var note=$('rDraftNote');
    if(note&&d&&d.status!=='sent')note.textContent=d.status==='drafting'?'writing with '+(d.model||r.model||'deepseek')+'…':(d.model?'drafted by '+d.model+', '+ago(d.updated_at)+' ago':'');
    if(note&&!d&&target)note.textContent='writing with '+(r.model||'deepseek')+'…';
    if($('rText')){grow($('rText'));$('rText').oninput=function(){grow(this)}}
    $('rCat').onchange=function(){api('/api/email-marketing/campaigns/'+t.campaign_id+'/leads/'+L.id+'/category',{method:'POST',body:{category_id:this.value||null}}).then(function(){t.category_id=$('rCat').value||null;show('info','Category saved.')}).catch(fail)};
    if($('rRewrite'))$('rRewrite').onclick=function(){writeDraft($('rHint').value.trim()||null)};
    if($('rHint'))$('rHint').onkeydown=function(e){if(e.key==='Enter')writeDraft(this.value.trim()||null)};
    if($('rQuick'))$('rQuick').onclick=function(e){var b=e.target.closest('button');if(b)writeDraft(b.dataset.h)};
    if($('rSend'))$('rSend').onclick=sendReply;
    if($('rDismiss'))$('rDismiss').onclick=dismissReply;
  }
  function writeDraft(hint){
    var R=S.reply,r=R.data;if(!r)return;
    if($('rText')){$('rText').disabled=true;$('rText').value='';$('rText').placeholder='Writing the reply…'}
    if($('rDraftNote'))$('rDraftNote').textContent='writing with '+(r.model||'deepseek')+'…';
    if($('rSend'))$('rSend').disabled=true;
    api('/api/email-marketing/drafts',{method:'POST',body:{email:R.email,campaign_id:r.thread.campaign_id,instruction:hint}}).then(function(x){
      if(S.reply!==R)return;r.draft=x.draft;renderReply();
    }).catch(function(e){if(S.reply!==R)return;fail(e);renderReply()});
  }
  function sendReply(){
    var R=S.reply,r=R.data,d=r.draft,text=$('rText').value.trim();
    if(!text)return show('error','The reply is empty.');
    if(!d)return show('error','Wait for the draft, or tap Rewrite.');
    if(!confirm('Send this reply to '+R.email+'?'))return;
    $('rSend').disabled=true;$('rSend').textContent='Sending…';
    api('/api/email-marketing/drafts/'+d.id+'/send',{method:'POST',body:{body:text}}).then(function(){
      try{navigator.vibrate&&navigator.vibrate(18)}catch(e){}
      show('info','Sent to '+R.email+'.');nextAfter(R);
    }).catch(function(e){fail(e);$('rSend').disabled=false;$('rSend').textContent='Approve & send'});
  }
  function dismissReply(){
    var R=S.reply,d=R.data.draft;if(!d)return show('error','Wait for the draft first.');
    api('/api/email-marketing/drafts/'+d.id+'/dismiss',{method:'POST',body:{}}).then(function(){nextAfter(R)}).catch(fail);
  }
  function nextAfter(R){
    var n=neighbours(R.campaignId||R.data.thread.campaign_id,R.email);
    loadConvos().then(function(){
      var rest=S.queue.filter(function(c){return c.email!==R.email});
      var next=rest[Math.max(0,n.i)]||rest[0];
      if(next)location.hash=replyHref(next);else{show('info','That was the last one. Every reply has an answer.');location.hash='#replies'}
    });
  }

  // ---- campaigns ----
  function renderCampaigns(){
    $('campRows').innerHTML=S.campaigns.length?S.campaigns.map(function(c){return '<a class="camp" href="#campaign/'+c.id+'"><div class="camp-top"><span class="camp-name">'+esc(c.name)+'</span>'+statusPill(c.status)+'</div>'+nums([['leads',c.leads],['sent',c.sent],['replied',c.replied],['bounced',c.bounced]])+'</a>'}).join(''):'<div class="empty">No campaigns yet. Tap New campaign.</div>';
  }
  function fillCampaignSelects(){
    var keep=$('pushCampaign').value;
    $('pushCampaign').innerHTML='<option value="">Choose a campaign…</option>'+S.campaigns.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+' ('+esc(c.status)+')</option>'}).join('');$('pushCampaign').value=keep;syncPush();
  }
  function stepHtml(s,i){
    return '<div class="step" data-i="'+i+'"><div class="step-h">'+(i===0?'Email 1':'Follow-up '+i)+(i>0?'<span class="aside">after</span><input type="number" inputmode="numeric" min="1" class="delay" value="'+(s.delay_days||3)+'" aria-label="Days to wait"><span class="aside">days</span>':'')+'<span class="grow"></span>'+(i>0?'<button class="sm danger rm" style="background:none">Remove</button>':'')+'</div>'+
      '<input class="subj" placeholder="'+(i===0?'Subject':'Subject (empty keeps the same thread)')+'" value="'+esc(s.subject||'')+'"><textarea class="body" style="min-height:170px" placeholder="Hi {{company_name}} team,">'+esc(s.body||'')+'</textarea></div>';
  }
  function renderSteps(steps){$('steps').innerHTML=steps.map(stepHtml).join('');$('testSeq').innerHTML=steps.map(function(_,i){return '<option value="'+(i+1)+'">Email '+(i+1)+'</option>'}).join('')}
  function readSteps(){return Array.prototype.map.call(document.querySelectorAll('#steps .step'),function(el,i){return {subject:el.querySelector('.subj').value,body:el.querySelector('.body').value,delay_days:i?Number(el.querySelector('.delay').value)||1:0}})}
  $('steps').onclick=function(e){if(e.target.classList.contains('rm')){var st=readSteps();st.splice(Number(e.target.closest('.step').dataset.i),1);renderSteps(st)}};
  $('addStep').onclick=function(){var st=readSteps();st.push({subject:'',body:'',delay_days:3});renderSteps(st)};
  function renderDays(days){$('days').innerHTML=DAYS.map(function(d,i){return '<label><input type="checkbox" value="'+i+'"'+(days.indexOf(i)>=0?' checked':'')+'><span>'+d+'</span></label>'}).join('')}
  function renderBoxes(chosen){var boxes=(S.status&&S.status.mailboxes)||[];$('campBoxes').innerHTML=boxes.length?boxes.map(function(m){return '<label><input type="checkbox" value="'+m.id+'"'+(chosen.indexOf(m.id)>=0?' checked':'')+'><span>'+esc(m.email)+'</span></label>'}).join(''):'<div class="empty warn">No mailbox connected in Smartlead yet.</div>'}
  function editorBody(){
    return {name:$('cdName').dataset.name,steps:readSteps(),
      schedule:{timezone:$('tz').value.trim(),days:Array.prototype.map.call(document.querySelectorAll('#days input:checked'),function(i){return Number(i.value)}),start_hour:$('startH').value,end_hour:$('endH').value,min_gap_minutes:Number($('gap').value),max_new_per_day:Number($('perDay').value)},
      mailbox_ids:Array.prototype.map.call(document.querySelectorAll('#campBoxes input:checked'),function(i){return Number(i.value)})};
  }
  $('newCampaign').onclick=function(){
    var name=prompt('Campaign name','Solar for '+new Date().toLocaleDateString(undefined,{month:'short',year:'numeric'}));if(!name)return;
    S.newName=name.trim();location.hash='#campaign/new';
  };
  function newCampaign(){
    var name=S.newName;S.newName=null;
    if(!name){name=prompt('Campaign name','Solar for '+new Date().toLocaleDateString(undefined,{month:'short',year:'numeric'}));if(!name){location.hash='#campaigns';return}name=name.trim()}
    S.camp={id:null};$('campExtra').hidden=true;$('title').textContent='New campaign';
    $('cdName').textContent=name;$('cdName').dataset.name=name;$('cdStatus').innerHTML=statusPill('NEW');$('cdStats').hidden=true;
    ['cdStart','cdPause','cdStop','cdDelete'].forEach(function(b){$(b).hidden=true});
    var boxes=(S.status&&S.status.mailboxes)||[];
    renderSteps([{subject:'',body:'',delay_days:0},{subject:'',body:'',delay_days:3}]);renderDays([1,2,3,4,5]);renderBoxes(boxes.map(function(m){return m.id}));
  }
  function openCampaign(id){
    show('error');$('cdName').textContent='Loading…';$('cdStatus').innerHTML='';$('steps').innerHTML='';
    return api('/api/email-marketing/campaigns/'+id).then(function(r){
      var c=r.campaign;S.camp={id:id,data:r};S.clOffset=0;
      $('title').textContent=c.name;$('cdName').textContent=c.name;$('cdName').dataset.name=c.name;$('cdStatus').innerHTML=statusPill(c.status);
      $('cdStats').hidden=false;
      $('cdStats').innerHTML=cell('leads',num(c.leads),num(c.not_started)+' not started')+cell('sent',num(c.sent))+cell('opened',num(c.opened))+cell('replied',num(c.replied))+cell('bounced',num(c.bounced))+cell('unsubscribed',num(c.unsubscribed));
      ['cdStart','cdPause','cdStop','cdDelete'].forEach(function(b){$(b).hidden=false});
      $('cdStart').textContent=c.status==='PAUSED'?'Resume':'Start';
      renderSteps(r.steps.length?r.steps:[{subject:'',body:'',delay_days:0}]);
      var sc=r.schedule||{};$('tz').value=sc.timezone||'Asia/Kuala_Lumpur';$('startH').value=sc.start_hour||'09:00';$('endH').value=sc.end_hour||'17:00';$('gap').value=sc.min_gap_minutes||10;$('perDay').value=sc.max_new_per_day||15;
      renderDays(sc.days&&sc.days.length?sc.days:[1,2,3,4,5]);renderBoxes((r.mailboxes||[]).map(function(m){return m.id}));
      $('campExtra').hidden=false;loadCampLeads();
    }).catch(fail);
  }
  $('saveCampaign').onclick=function(){
    var body=editorBody();if(!body.steps[0]||!body.steps[0].subject.trim()||!body.steps[0].body.trim())return show('error','Email 1 needs a subject and a body.');
    $('saveCampaign').disabled=true;$('saveNote').textContent='Saving…';
    var isNew=!(S.camp&&S.camp.id);
    var call=isNew?api('/api/email-marketing/campaigns',{method:'POST',body:body}):api('/api/email-marketing/campaigns/'+S.camp.id+'/setup',{method:'POST',body:body});
    call.then(function(r){
      if(r.errors&&r.errors.length)show('error','Saved, with problems:\n'+r.errors.join('\n'));else show('info','Campaign saved.');
      return loadStatus().then(function(){if(isNew)history.replaceState(null,'','#campaign/'+r.id);return openCampaign(r.id)});
    }).catch(fail).then(function(){$('saveCampaign').disabled=false;$('saveNote').textContent=''});
  };
  function setStatus(st,label,done){
    if(!S.camp||!S.camp.id||!confirm(label+' "'+$('cdName').dataset.name+'"?'))return;
    api('/api/email-marketing/campaigns/'+S.camp.id+'/status',{method:'POST',body:{status:st}}).then(function(){show('info','Campaign '+done+'.');return loadStatus().then(function(){return openCampaign(S.camp.id)})}).catch(fail);
  }
  $('cdStart').onclick=function(){setStatus('START',this.textContent,'started: Smartlead sends inside the schedule')};
  $('cdPause').onclick=function(){setStatus('PAUSED','Pause','paused')};
  $('cdStop').onclick=function(){setStatus('STOPPED','Stop','stopped')};
  $('cdDelete').onclick=function(){
    if(!S.camp||!S.camp.id||!confirm('Delete "'+$('cdName').dataset.name+'" in Smartlead? Its leads and stats there go with it.'))return;
    api('/api/email-marketing/campaigns/'+S.camp.id,{method:'DELETE'}).then(function(){show('info','Campaign deleted.');S.camp=null;location.hash='#campaigns'}).catch(fail);
  };
  $('sendTest').onclick=function(){
    var to=$('testTo').value.trim();if(!to)return show('error','Type the address to send the test to.');
    api('/api/email-marketing/campaigns/'+S.camp.id+'/test',{method:'POST',body:{email:to,sequence:Number($('testSeq').value)||1}}).then(function(r){show('info','Test email '+$('testSeq').value+' sent to '+r.to+', filled in as '+r.as_lead+'.')}).catch(fail);
  };
  function loadCampLeads(){
    if(!S.camp||!S.camp.id)return;
    $('campLeads').innerHTML='<div class="empty">Loading…</div>';
    api('/api/email-marketing/campaigns/'+S.camp.id+'/leads?limit=50&offset='+S.clOffset).then(function(r){
      $('campLeads').innerHTML=r.rows.length?r.rows.map(function(l){
        var paused=String(l.status).toUpperCase()==='PAUSED';
        return '<div class="rowl"><a class="grow" style="color:inherit;text-decoration:none" href="#reply/'+S.camp.id+'/'+encodeURIComponent(l.email)+'"><div class="rt">'+esc(l.company||l.email)+'</div><div class="rs">'+esc(l.email)+'</div><div class="chips" style="margin-top:4px">'+statusPill(l.status)+(l.category_id?'<span class="chip">'+esc(catName(l.category_id))+'</span>':'')+'</div></a>'+
          '<button class="sm" data-lead="'+l.lead_id+'" data-act="'+(paused?'resume':'pause')+'">'+(paused?'Resume':'Pause')+'</button></div>'}).join(''):'<div class="empty">No leads yet. Add them from Leads.</div>';
      var end=Math.min(S.clOffset+50,r.total);$('clPage').textContent=r.total?(S.clOffset+1)+'–'+end+' of '+num(r.total):'';
      $('clPrev').disabled=S.clOffset===0;$('clNext').disabled=end>=r.total;
    }).catch(fail);
  }
  $('campLeads').onclick=function(e){var b=e.target.closest('button[data-lead]');if(b)api('/api/email-marketing/campaigns/'+S.camp.id+'/leads/'+b.dataset.lead+'/'+b.dataset.act,{method:'POST',body:{}}).then(loadCampLeads).catch(fail)};
  $('clPrev').onclick=function(){S.clOffset=Math.max(0,S.clOffset-50);loadCampLeads()};
  $('clNext').onclick=function(){S.clOffset+=50;loadCampLeads()};

  // ---- leads ----
  var LIMIT=100;
  function leadQuery(){return 'search='+encodeURIComponent($('leadSearch').value.trim())+'&source='+$('leadSource').value+'&status='+$('leadStatus').value+'&mail_host='+encodeURIComponent($('leadHost').value)}
  function hostOptions(counts){
    var keep=$('leadHost').value,names=Object.keys(counts||{}).sort(function(a,b){return counts[b]-counts[a]}),total=0;
    names.forEach(function(k){total+=counts[k]});
    var label=function(k){return k==='unchecked'?'Not checked yet':k};
    $('leadHost').innerHTML='<option value="all">All mail hosts ('+num(total)+')</option>'+names.map(function(k){return '<option value="'+esc(k)+'">'+esc(label(k))+' ('+num(counts[k])+')</option>'}).join('');
    $('leadHost').value=names.indexOf(keep)>=0?keep:'all';
  }
  function loadLeads(){
    $('leadRows').innerHTML='<div class="empty">Loading…</div>';
    return api('/api/email-marketing/leads?limit='+LIMIT+'&offset='+S.leadOffset+'&'+leadQuery()).then(function(r){
      S.leadRows=r.rows||[];S.leadTotal=r.total||0;hostOptions(r.mail_hosts);
      $('leadCount').textContent=plural(S.leadTotal,'lead email')+' match';
      $('leadRows').innerHTML=S.leadRows.length?S.leadRows.map(function(x){
        var camps=x.campaigns.map(function(c){
          var st=c.bounced_at?['bad','bounced']:c.unsubscribed_at?['bad','unsubscribed']:c.replied_at?['ok','replied']:c.opened_at?['warn','opened']:c.last_event==='EMAIL_SENT'?['','sent']:['','added'];
          return '<span class="chip '+st[0]+'">'+esc(c.name||('#'+c.id))+': '+st[1]+'</span>'}).join('');
        return '<label class="lead"><input type="checkbox" data-key="'+esc(x.key)+'"'+(S.picked[x.key]?' checked':'')+'><span class="lb"><span class="ln" style="display:block">'+esc(x.company_name)+'</span><span class="le" style="display:block">'+esc(x.email)+'</span>'+
          '<span class="lm" style="display:block">'+esc([x.category,x.person_name].filter(Boolean).join(', '))+'</span><span class="chips"><span class="chip blue">'+(x.mail_host?esc(x.mail_host):'Mail host not checked')+'</span>'+camps+'</span></span></label>'}).join(''):'<div class="empty">No lead emails match.</div>';
      var end=Math.min(S.leadOffset+LIMIT,S.leadTotal);
      $('leadPage').textContent=S.leadTotal?(S.leadOffset+1)+'–'+end+' of '+num(S.leadTotal):'';
      $('leadPrev').disabled=S.leadOffset===0;$('leadNext').disabled=end>=S.leadTotal;$('checkAll').checked=false;syncPush();
    }).catch(fail);
  }
  function pickedKeys(){return Object.keys(S.picked).filter(function(k){return S.picked[k]})}
  function syncPush(){
    var c=$('pushCampaign').value;var n=pickedKeys().length;
    $('pushSelected').disabled=!c||!n;$('pushSelected').textContent='Add the '+plural(n,'selected lead','selected leads');
    $('pushAll').disabled=!c||!S.leadTotal;$('pushAll').textContent='Add all '+plural(S.leadTotal,'matching lead','matching leads');
    $('pushOpen').textContent=n?'Add '+num(n)+' selected to a campaign':'Add leads to a campaign';
  }
  $('pushOpen').onclick=function(){openSheet('pushSheet')};
  $('leadRows').addEventListener('change',function(e){var k=e.target.dataset&&e.target.dataset.key;if(k){S.picked[k]=e.target.checked;syncPush()}});
  $('checkAll').onchange=function(){var on=this.checked;S.leadRows.forEach(function(x){S.picked[x.key]=on});document.querySelectorAll('#leadRows input[data-key]').forEach(function(i){i.checked=on});syncPush()};
  var searchTimer=null;
  $('leadSearch').oninput=function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){S.leadOffset=0;loadLeads()},450)};
  $('leadSearch').onkeydown=function(e){if(e.key==='Enter'){clearTimeout(searchTimer);S.leadOffset=0;loadLeads();this.blur()}};
  $('leadSource').onchange=$('leadStatus').onchange=$('leadHost').onchange=function(){S.leadOffset=0;loadLeads()};
  $('leadPrev').onclick=function(){S.leadOffset=Math.max(0,S.leadOffset-LIMIT);loadLeads().then(function(){window.scrollTo(0,0)})};
  $('leadNext').onclick=function(){S.leadOffset+=LIMIT;loadLeads().then(function(){window.scrollTo(0,0)})};
  $('pushCampaign').onchange=syncPush;
  function pushLeads(body,label){
    var id=$('pushCampaign').value;if(!id)return;
    var name=$('pushCampaign').selectedOptions[0].textContent;
    if(!confirm('Add '+label+' to "'+name+'"?'))return;
    closeSheet();show('error');show('info','Adding '+label+' to Smartlead…');$('pushAll').disabled=$('pushSelected').disabled=true;
    api('/api/email-marketing/campaigns/'+id+'/leads',{method:'POST',body:body}).then(function(r){
      S.picked={};
      show('info','Sent '+num(r.sent)+' to "'+name+'": '+num(r.added)+' added, '+num(r.duplicates)+' already there, '+num(r.in_other_campaign)+' in another campaign, '+num(r.invalid)+' invalid, '+num(r.blocked)+' blocked.'+(r.do_not_email?' '+num(r.do_not_email)+' left out: bounced or unsubscribed before.':'')+(r.failed?'\n'+num(r.failed)+' failed: '+r.errors.join('; '):''));
      loadLeads();
    }).catch(function(e){fail(e);syncPush()});
  }
  $('pushSelected').onclick=function(){var k=pickedKeys();pushLeads({keys:k},plural(k.length,'selected lead email'))};
  $('pushAll').onclick=function(){pushLeads({all:true,search:$('leadSearch').value.trim(),source:$('leadSource').value,status:$('leadStatus').value,mail_host:$('leadHost').value},plural(S.leadTotal,'matching lead email'))};

  // ---- templates and sender ----
  var FIELDS={lead:[],sender:[]};
  function fillTemplateSelect(){
    var keep=$('tplPick').value;
    $('tplPick').innerHTML='<option value="">Start from a template…</option>'+(S.templates||[]).map(function(t){return '<option value="'+t.id+'">'+esc(t.name)+'</option>'}).join('');$('tplPick').value=keep;
  }
  function renderFieldChips(){
    $('tplFields').innerHTML=FIELDS.lead.concat(FIELDS.sender).map(function(f){return '<button data-f="'+esc(f)+'">{{'+esc(f)+'}}</button>'}).join('');
  }
  function loadTemplates(){
    return api('/api/email-marketing/templates').then(function(r){
      S.templates=r.templates||[];FIELDS={lead:r.lead_fields||[],sender:r.sender_fields||[]};var s=r.sender||{};
      $('sName').value=s.sender_name||'';$('sTitle').value=s.sender_title||'';$('sPhone').value=s.sender_phone||'';$('sFooter').value=s.sender_footer||'';
      $('senderSum').textContent=s.sender_name||'Not set';
      $('tplRows').innerHTML=S.templates.length?S.templates.map(function(t){return '<a class="rowl" href="#template/'+t.id+'"><div class="grow"><div class="rt">'+esc(t.name)+'</div><div class="rs">'+plural(t.steps.length,'email')+', updated '+when(t.updated_at)+'</div></div></a>'}).join(''):'<div class="empty">No templates yet. Tap New template, write the emails, Save.</div>';
      fillTemplateSelect();renderFieldChips();
    }).catch(fail);
  }
  $('saveSender').onclick=function(){
    api('/api/email-marketing/sender',{method:'POST',body:{sender_name:$('sName').value,sender_title:$('sTitle').value,sender_phone:$('sPhone').value,sender_footer:$('sFooter').value}})
      .then(function(){$('senderNote').textContent='Saved.';$('senderSum').textContent=$('sName').value||'Not set';setTimeout(function(){$('senderNote').textContent=''},3000)}).catch(fail);
  };
  function tplRender(steps){$('tplSteps').innerHTML=steps.map(stepHtml).join('')}
  function tplRead(){return Array.prototype.map.call(document.querySelectorAll('#tplSteps .step'),function(el,i){return {subject:el.querySelector('.subj').value,body:el.querySelector('.body').value,delay_days:i?Number(el.querySelector('.delay').value)||1:0}})}
  function openTemplate(t){
    S.tpl={id:t?t.id:null,last:null};$('tplName').value=t?t.name:'';$('title').textContent=t?t.name:'New template';
    tplRender(t&&t.steps.length?t.steps:[{subject:'',body:'',delay_days:0},{subject:'',body:'',delay_days:3}]);
    $('tplDelete').hidden=!t;$('tplProblems').innerHTML='';$('tplPreview').innerHTML='';
  }
  function showProblems(ps){
    $('tplProblems').innerHTML='<div class="panel">'+((ps&&ps.length)?ps.map(function(p){var bad=p.level==='error';return '<div class="check"><b class="'+(bad?'bad':'warn')+'">'+(bad?'✕':'!')+'</b><span>'+esc(p.text)+'</span></div>'}).join(''):'<div class="check"><b class="ok">✓</b><span>No problems found.</span></div>')+'</div>';
  }
  $('newTpl').onclick=function(){location.hash='#template/new'};
  $('tplSteps').addEventListener('focusin',function(e){if(e.target.matches&&e.target.matches('.subj,.body'))S.tpl.last=e.target});
  $('tplSteps').onclick=function(e){if(e.target.classList.contains('rm')){var st=tplRead();st.splice(Number(e.target.closest('.step').dataset.i),1);tplRender(st)}};
  $('tplAddStep').onclick=function(){var st=tplRead();st.push({subject:'',body:'',delay_days:3});tplRender(st)};
  $('tplFields').addEventListener('mousedown',function(e){e.preventDefault()}); // keep the cursor in the field being typed
  $('tplFields').onclick=function(e){
    var f=e.target.dataset&&e.target.dataset.f;if(!f)return;
    var tag='{{'+f+'}}',el=S.tpl&&S.tpl.last;if(!el||!document.contains(el))el=document.querySelector('#tplSteps .body');if(!el)return;
    var a=el.selectionStart==null?el.value.length:el.selectionStart,b=el.selectionEnd==null?a:el.selectionEnd;
    el.value=el.value.slice(0,a)+tag+el.value.slice(b);el.focus();el.setSelectionRange(a+tag.length,a+tag.length);
  };
  $('tplSave').onclick=function(){
    var name=$('tplName').value.trim();if(!name)return show('error','Give the template a name.');
    api('/api/email-marketing/templates',{method:'POST',body:{id:S.tpl.id,name:name,steps:tplRead()}}).then(function(r){
      S.tpl.id=r.id;$('tplDelete').hidden=false;$('title').textContent=name;history.replaceState(null,'','#template/'+r.id);showProblems(r.problems);
      return loadTemplates().then(function(){show('info','Template saved.')});
    }).catch(fail);
  };
  $('tplCheck').onclick=function(){
    api('/api/email-marketing/templates/check',{method:'POST',body:{steps:tplRead()}}).then(function(r){
      showProblems(r.problems);
      $('tplPreview').innerHTML='<h3>Preview for a company inbox with no person name</h3><div class="thread" style="margin:0">'+r.preview.map(function(s){return '<div class="bub out" style="max-width:100%"><span class="meta"><b>'+esc(s.subject||'(same thread)')+'</b></span>'+esc(s.body)+'</div>'}).join('')+'</div>';
      $('tplProblems').scrollIntoView({behavior:'smooth',block:'start'});
    }).catch(fail);
  };
  $('tplDelete').onclick=function(){
    if(!S.tpl||!S.tpl.id||!confirm('Delete the template "'+$('tplName').value+'"? Campaigns already made from it are not changed.'))return;
    api('/api/email-marketing/templates/'+S.tpl.id,{method:'DELETE'}).then(function(){S.tpl=null;show('info','Template deleted.');location.hash='#templates'}).catch(fail);
  };
  $('tplUse').onclick=function(){
    var id=Number($('tplPick').value);if(!id)return;var t=S.templates.filter(function(x){return x.id===id})[0];if(!t)return;
    var typed=readSteps().some(function(s){return s.subject.trim()||s.body.trim()});
    if(typed&&!confirm('Replace the emails below with the template "'+t.name+'"?'))return;
    renderSteps(t.steps.length?t.steps:[{subject:'',body:'',delay_days:0}]);
  };
  $('tplFromCamp').onclick=function(){
    var steps=readSteps();if(!steps[0]||!steps[0].body.trim())return show('error','Write Email 1 first.');
    var name=prompt('Template name',$('cdName').dataset.name||'');if(!name)return;
    api('/api/email-marketing/templates',{method:'POST',body:{name:name.trim(),steps:steps}}).then(function(r){
      var bad=(r.problems||[]).filter(function(p){return p.level==='error'}).length;
      show('info','Saved as template "'+name.trim()+'".'+(bad?' It has '+plural(bad,'problem')+' to fix before it can be used: open it on the Templates tab and tap Check.':''));return loadTemplates();
    }).catch(fail);
  };

  // ---- mail hosts ----
  var hostTimer=null;
  function hostStatus(){
    return api('/api/email-marketing/mail-hosts').then(function(r){
      var run=r.run;
      $('hostInfo').textContent=run.running?'Checking '+num(run.done)+' of '+num(run.total)+' domains…':num(r.checked)+' of '+num(r.domains)+' domains have a known mail host.'+(run.error?' '+run.error:'');
      $('hostCheck').disabled=!!run.running;
      if(run.running){if(!hostTimer)hostTimer=setInterval(hostStatus,3000)}
      else if(hostTimer){clearInterval(hostTimer);hostTimer=null;loadLeads()}
    }).catch(function(){});
  }
  $('hostCheck').onclick=function(){api('/api/email-marketing/mail-hosts/check',{method:'POST',body:{}}).then(hostStatus).catch(fail)};

  // ---- phone app ----
  if('serviceWorker' in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('/email-marketing-sw.js',{scope:'/email-marketing'}).catch(function(){})});
  var installEvt=null;
  var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  if(!standalone&&/iphone|ipad|ipod/i.test(navigator.userAgent))$('iosHint').hidden=false;
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installEvt=e;$('install').hidden=false;$('mInstall').hidden=false});
  $('install').onclick=$('mInstall').onclick=function(){closeSheet();if(installEvt){installEvt.prompt();installEvt=null}$('install').hidden=$('mInstall').hidden=true};
  window.addEventListener('appinstalled',function(){$('install').hidden=$('mInstall').hidden=true});
  function onlineState(){$('offline').hidden=navigator.onLine!==false}
  window.addEventListener('online',function(){onlineState();refresh()});window.addEventListener('offline',onlineState);onlineState();
  // Back from the background after a minute: fresh numbers.
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&token()&&Date.now()-S.loadedAt>60000)refresh()});
  window.addEventListener('scroll',function(){$('bar').classList.toggle('scrolled',window.scrollY>4)},{passive:true});
  // Pull down at the top of a list to refresh, as in any phone app.
  var ptrY=null,ptrD=0;
  window.addEventListener('touchstart',function(e){ptrD=0;ptrY=window.scrollY<=0&&!openSheetId&&!document.body.classList.contains('focus')&&e.touches.length===1?e.touches[0].clientY:null},{passive:true});
  window.addEventListener('touchmove',function(e){if(ptrY==null)return;ptrD=e.touches[0].clientY-ptrY;if(ptrD>0)$('ptr').style.transform='translateY('+(Math.min(ptrD*0.5,90)-80)+'px) rotate('+(ptrD*2)+'deg)'},{passive:true});
  window.addEventListener('touchend',function(){if(ptrY==null)return;ptrY=null;$('ptr').style.transform='';if(ptrD>130){$('ptr').classList.add('spin');refresh();setTimeout(function(){$('ptr').classList.remove('spin')},900)}ptrD=0});

  // ---- start ----
  $('saveToken').onclick=function(){try{localStorage.setItem('labToken',$('token').value.trim())}catch(e){}$('gate').hidden=true;route()};
  $('token').onkeydown=function(e){if(e.key==='Enter')$('saveToken').click()};
  if(!token())$('gate').hidden=false;
  route();
  setInterval(function(){if(!document.hidden&&token())api('/api/email-marketing/conversations?filter=waiting').then(function(r){setBadge(r.waiting)}).catch(function(){})},120000);
})();
</script>
</body></html>`;
}
