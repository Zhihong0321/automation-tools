// /email-marketing: lead emails into Smartlead campaigns, and the replies back, on one page.
// Tabs: Overview (mailboxes, totals), Leads (pick and push), Campaigns (write, schedule,
// start), Inbox (read threads, reply). It uses the operator token the other console
// pages keep in localStorage ('labToken').
import { OPERATOR_NAV, navHtml } from './nav.ts';

export function page(): string {
  return String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>Email marketing · agy-lab</title>
<style>
:root{--bg:#0f1115;--card:#171a20;--ink:#e8eaed;--muted:#9aa3af;--line:#262b33;--ok:#4ade9f;--bad:#ff8b80;--warn:#f0c065;--accent:#7aa2f7}
*{box-sizing:border-box}body{margin:0;padding:28px 20px 64px;background:var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1280px;margin:0 auto}h1{font-size:24px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:15px;margin:0 0 10px}h3{font-size:13px;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.sub{color:var(--muted);font-size:13px;margin:0 0 22px}
.sitenav{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid var(--line)}.sitenav a{color:var(--muted);font-size:13px;font-weight:550;padding:5px 10px;border:1px solid transparent;border-radius:8px;text-decoration:none}.sitenav a:hover,.sitenav a[aria-current="page"]{color:var(--ink);background:#1e222a;border-color:var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button,input,select,textarea{font:inherit;font-size:13px;border-radius:8px}
button{font-weight:550;padding:7px 14px;border:1px solid var(--line);background:#1e222a;color:var(--ink);cursor:pointer}button:hover{border-color:var(--muted)}button:disabled{opacity:.45;cursor:default}
button.primary{background:var(--accent);border-color:var(--accent);color:#0f1115}button.danger{color:var(--bad)}button.small{padding:4px 9px;font-size:12px}
input,select,textarea{background:#0f1115;color:var(--ink);border:1px solid var(--line);padding:7px 10px}textarea{width:100%;min-height:150px;resize:vertical;line-height:1.5}
.grow{flex:1;min-width:200px}
.tabs{display:flex;gap:4px;margin-bottom:16px}.tabs button{background:transparent;border-color:transparent;color:var(--muted)}.tabs button[aria-selected="true"]{background:#1e222a;border-color:var(--line);color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.tile{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#13161b}
.tile .name{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.tile .big{font-size:21px;font-weight:700;line-height:1.2;margin-top:4px;font-variant-numeric:tabular-nums}
.check{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.check:last-child{border-bottom:0}.check b{min-width:18px}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-size:11.5px;font-weight:600;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid #1e222a;vertical-align:top}tr.click{cursor:pointer}tr.click:hover td{background:#1a1e25}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted);margin:0 3px 2px 0;white-space:nowrap}.pill.ok{color:var(--ok);border-color:#285c45}.pill.warn{color:var(--warn);border-color:#5c4b25}.pill.bad{color:var(--bad);border-color:#5c2a30}
.muted{color:var(--muted)}.small{font-size:12px}.mono{font:12px ui-monospace,Consolas,monospace}a{color:var(--accent)}
.empty{padding:18px;text-align:center;color:var(--muted)}
.msg{display:none;border-radius:8px;padding:10px 12px;margin-bottom:16px;white-space:pre-wrap}.msg.show{display:block}.msg.error{color:var(--bad);background:#28191c;border:1px solid #5c2a30}.msg.info{color:var(--ok);background:#15241e;border:1px solid #285c45}
.split{display:grid;grid-template-columns:380px 1fr;gap:16px}.list-item{padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer}.list-item:hover,.list-item.on{background:#1a1e25}.list-item .t{font-size:11.5px;color:var(--muted)}
.bubble{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 10px;background:#13161b;white-space:pre-wrap;word-break:break-word}.bubble.in{border-color:#2f4a7a;background:#141a26}.bubble .meta{font-size:11.5px;color:var(--muted);margin-bottom:6px;white-space:normal}
.step{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:#13161b}.step .row{margin-bottom:8px}
.days label{display:inline-flex;gap:4px;align-items:center;margin-right:10px;font-size:13px}
.hint{font-size:12px;color:var(--muted);margin:6px 0 0}.hint code{color:var(--accent)}
[hidden]{display:none!important}
@media(max-width:1000px){.tiles{grid-template-columns:repeat(2,1fr)}.split{grid-template-columns:1fr}}
@media(max-width:600px){body{padding:20px 14px 44px}}
</style></head><body><div class="wrap">
<h1>Email marketing</h1><p class="sub">Every lead with a company name and an email, sent through Smartlead campaigns. Replies come back to the Inbox tab, where you answer them.</p>
<nav class="sitenav" aria-label="Site">${navHtml(OPERATOR_NAV, '/email-marketing')}</nav>
<div class="card" id="tokenCard" hidden><div class="row"><input id="token" class="grow" type="password" placeholder="LAB_TOKEN" autocomplete="current-password"><button class="primary" id="saveToken">Save</button></div></div>
<div id="error" class="msg error" role="alert"></div><div id="info" class="msg info" role="status"></div>
<div class="tabs" role="tablist">
<button role="tab" data-tab="overview" aria-selected="true">Overview</button><button role="tab" data-tab="leads">Leads</button><button role="tab" data-tab="campaigns">Campaigns</button><button role="tab" data-tab="inbox">Inbox</button>
</div>

<section id="tab-overview">
<div class="card"><div class="tiles" id="tiles"></div></div>
<div class="card"><h2>Ready to send?</h2><div id="checks"><div class="empty">Loading…</div></div></div>
<div class="card"><h2>Sending mailboxes</h2><div class="table-wrap" id="mailboxes"></div><p class="hint">Mailboxes are connected in Smartlead itself (Email Accounts → Add account). Warm a new mailbox up for about two weeks before a campaign uses it.</p></div>
</section>

<section id="tab-leads" hidden>
<div class="card">
<div class="row"><input id="leadSearch" class="grow" placeholder="Search company, email or person"><select id="leadSource"><option value="all">All sources</option><option value="research">Contact research</option><option value="website">Website</option><option value="person">Has a person name</option></select>
<select id="leadStatus"><option value="new">Not in a campaign yet</option><option value="pushed">Already in a campaign</option><option value="all">All</option></select><button id="leadGo">Search</button></div>
<div class="row" style="margin-top:12px"><span class="muted" id="leadCount"></span><span class="grow"></span><select id="pushCampaign"><option value="">Choose a campaign…</option></select><button id="pushSelected" disabled>Add selected</button><button id="pushAll" class="primary" disabled>Add all matching</button></div>
</div>
<div class="card"><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="checkAll"></th><th>Company</th><th>Email</th><th>Person</th><th>Source</th><th>Campaigns</th></tr></thead><tbody id="leadRows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody></table></div>
<div class="row" style="margin-top:12px"><button id="leadPrev">Previous</button><button id="leadNext">Next</button><span class="muted small" id="leadPage"></span></div></div>
</section>

<section id="tab-campaigns" hidden>
<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Campaigns</h2><span class="grow"></span><button class="primary" id="newCampaign">New campaign</button></div>
<div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th class="num">Leads</th><th class="num">Sent</th><th class="num">Opened</th><th class="num">Replied</th><th class="num">Bounced</th><th class="num">Interested</th></tr></thead><tbody id="campRows"><tr><td colspan="8" class="empty">Loading…</td></tr></tbody></table></div></div>

<div class="card" id="campDetail" hidden>
<div class="row" style="margin-bottom:6px"><h2 style="margin:0" id="cdName"></h2><span id="cdStatus"></span><span class="grow"></span>
<button id="cdStart" class="primary">Start</button><button id="cdPause">Pause</button><button id="cdStop">Stop</button><button id="cdDelete" class="danger">Delete</button></div>
<p class="muted small" id="cdStats"></p>
<h3>Emails</h3><div id="steps"></div><button id="addStep" class="small">+ Follow-up</button>
<p class="hint">Write plain text. Blank lines make paragraphs. Fields: <code>{{company_name}}</code> <code>{{first_name}}</code> <code>{{category}}</code> <code>{{role}}</code>. Most of these leads are company inboxes with no person name, so lead with <code>{{company_name}}</code>. A follow-up with an empty subject goes as a reply in the same thread. Smartlead stops a lead's sequence once they reply.</p>
<h3>Schedule</h3>
<div class="row"><label class="small muted">Time zone</label><input id="tz" value="Asia/Kuala_Lumpur" style="width:180px"><label class="small muted">From</label><input id="startH" type="time" value="09:00"><label class="small muted">to</label><input id="endH" type="time" value="17:00">
<label class="small muted">Minutes between emails</label><input id="gap" type="number" min="3" value="10" style="width:80px"><label class="small muted">New leads per day</label><input id="perDay" type="number" min="1" value="50" style="width:90px"></div>
<div class="days" id="days" style="margin-top:8px"></div>
<h3>Send from</h3><div id="campBoxes" class="small"></div>
<div class="row" style="margin-top:14px"><button class="primary" id="saveCampaign">Save campaign</button><span class="muted small" id="saveNote"></span></div>
<div id="campExtra">
<h3>Test email</h3><div class="row"><input id="testTo" placeholder="you@yourcompany.com" style="width:260px"><select id="testSeq"></select><button id="sendTest">Send test</button><span class="muted small">Uses the first lead in the campaign to fill the fields.</span></div>
<h3>Leads in this campaign</h3><div class="table-wrap"><table><thead><tr><th>Company</th><th>Email</th><th>Status</th><th>Category</th><th></th></tr></thead><tbody id="campLeads"></tbody></table></div>
<div class="row" style="margin-top:10px"><button id="clPrev" class="small">Previous</button><button id="clNext" class="small">Next</button><span class="muted small" id="clPage"></span></div>
</div>
</div>
</section>

<section id="tab-inbox" hidden>
<div class="card"><div class="row"><select id="inboxCampaign"><option value="">All campaigns</option></select><button id="inboxRefresh">Refresh</button><span class="grow"></span><input id="threadEmail" placeholder="Open any lead's thread by email" style="width:280px"><button id="threadGo">Open</button></div></div>
<div class="split">
<div class="card" style="padding:0"><div id="inboxList"><div class="empty">Loading…</div></div><div class="row" style="padding:10px 12px"><button id="inPrev" class="small">Newer</button><button id="inNext" class="small">Older</button></div></div>
<div class="card" id="thread"><div class="empty">Choose a reply to read the thread.</div></div>
</div>
</section>
</div>
<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var num=function(n){return Number(n||0).toLocaleString()};
  var when=function(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return esc(iso);return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})};
  var token=function(){try{return localStorage.getItem('labToken')||''}catch(e){return ''}};
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var S={status:null,campaigns:[],cats:[],leadOffset:0,leadTotal:0,leadRows:[],picked:{},camp:null,clOffset:0,inOffset:0,threadData:null};

  function show(id,text){var el=$(id);el.textContent=text||'';el.className='msg '+(id==='error'?'error':'info')+(text?' show':'');if(text)window.scrollTo({top:0,behavior:'smooth'})}
  function api(path,opts){
    opts=opts||{};
    var h={authorization:'Bearer '+token()};if(opts.body)h['content-type']='application/json';
    return fetch(path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){
        if(r.status===401){$('tokenCard').hidden=false;throw new Error('Enter the LAB_TOKEN to use this page.')}
        if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j});
    });
  }
  function fail(e){show('error',e.message||String(e))}
  function catName(id){if(id==null)return '';for(var i=0;i<S.cats.length;i++)if(S.cats[i].id==id)return S.cats[i].name;return '#'+id}
  function statusPill(s){s=String(s||'').toUpperCase();var cls=s==='ACTIVE'||s==='START'||s==='INPROGRESS'?'ok':s==='PAUSED'||s==='DRAFTED'||s==='STARTED'?'warn':s==='STOPPED'||s==='BLOCKED'?'bad':'';return '<span class="pill '+cls+'">'+esc(s||'—')+'</span>'}

  // ---- tabs ----
  var tabs=document.querySelectorAll('[data-tab]');
  function openTab(name){
    tabs.forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===name?'true':'false')});
    ['overview','leads','campaigns','inbox'].forEach(function(t){$('tab-'+t).hidden=t!==name});
    try{localStorage.setItem('emTab',name)}catch(e){}
    if(name==='leads'&&!S.leadRows.length)loadLeads();
    if(name==='inbox')loadInbox();
  }
  tabs.forEach(function(b){b.onclick=function(){show('error');show('info');openTab(b.dataset.tab)}});

  // ---- overview ----
  function loadOverview(){
    return Promise.all([api('/api/email-marketing/status'),api('/api/email-marketing/leads?limit=1&status=all'),api('/api/email-marketing/campaigns').catch(function(e){return {campaigns:[],error:e.message}})]).then(function(r){
      var st=r[0],ld=r[1].stats||{},cp=r[2];S.status=st;S.cats=st.categories||[];S.campaigns=cp.campaigns||[];
      var boxes=st.mailboxes||[];
      var tile=function(n,v){return '<div class="tile"><div class="name">'+esc(n)+'</div><div class="big">'+v+'</div></div>'};
      $('tiles').innerHTML=tile('Lead emails',num(ld.emails))+tile('Companies',num(ld.companies))+tile('With a person',num(ld.with_person))+tile('In a campaign',num(ld.in_campaign))+tile('Mailboxes',num(boxes.length))+tile('Campaigns',num(S.campaigns.length));
      var active=S.campaigns.filter(function(c){return c.status==='ACTIVE'}).length;
      var check=function(ok,t,d){return '<div class="check"><b class="'+(ok?'ok':'bad')+'">'+(ok?'✓':'✕')+'</b><div><div>'+t+'</div>'+(d?'<div class="muted small">'+d+'</div>':'')+'</div></div>'};
      $('checks').innerHTML=
        check(st.configured,'Smartlead API key on the hub',st.configured?'':'Set SMARTLEAD_API_KEY on the Railway service.')+
        check(boxes.length>0,boxes.length+' sending mailbox'+(boxes.length===1?'':'es')+' connected in Smartlead',boxes.length?'':'Nothing can send until a mailbox is connected in Smartlead → Email Accounts. Use a separate domain from eternalgy.me so cold email cannot hurt your main inbox.')+
        check(S.campaigns.length>0,S.campaigns.length+' campaign'+(S.campaigns.length===1?'':'s'),S.campaigns.length?'':'Campaigns tab → New campaign.')+
        check((ld.in_campaign||0)>0,num(ld.in_campaign)+' of '+num(ld.eligible)+' lead emails added to a campaign',(ld.in_campaign||0)?'':'Leads tab → choose a campaign → Add.')+
        check(active>0,active+' campaign'+(active===1?'':'s')+' sending',active?'':'Open a campaign and press Start once it has emails, mailboxes and leads.');
      $('mailboxes').innerHTML=boxes.length?'<table><thead><tr><th>Mailbox</th><th>Name</th><th>Type</th><th class="num">Per day</th><th class="num">Sent today</th><th>Warm-up</th><th>Connection</th></tr></thead><tbody>'+boxes.map(function(m){return '<tr><td>'+esc(m.email)+'</td><td>'+esc(m.name)+'</td><td>'+esc(m.type)+'</td><td class="num">'+esc(m.daily_limit)+'</td><td class="num">'+esc(m.sent_today)+'</td><td>'+esc(m.warmup||'—')+(m.reputation?' · '+esc(m.reputation):'')+'</td><td>'+(m.smtp_ok===false||m.imap_ok===false?'<span class="pill bad">failing</span>':'<span class="pill ok">ok</span>')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">No mailbox connected in Smartlead yet.</div>';
      renderCampaigns();fillCampaignSelects();
    });
  }

  // ---- leads ----
  var LIMIT=100;
  function leadQuery(){return 'search='+encodeURIComponent($('leadSearch').value.trim())+'&source='+$('leadSource').value+'&status='+$('leadStatus').value}
  function loadLeads(){
    $('leadRows').innerHTML='<tr><td colspan="6" class="empty">Loading…</td></tr>';
    return api('/api/email-marketing/leads?limit='+LIMIT+'&offset='+S.leadOffset+'&'+leadQuery()).then(function(r){
      S.leadRows=r.rows||[];S.leadTotal=r.total||0;
      $('leadCount').textContent=num(S.leadTotal)+' matching';
      $('leadRows').innerHTML=S.leadRows.length?S.leadRows.map(function(x){
        return '<tr><td><input type="checkbox" data-key="'+esc(x.key)+'"'+(S.picked[x.key]?' checked':'')+'></td><td>'+esc(x.company_name)+(x.category?'<div class="muted small">'+esc(x.category)+'</div>':'')+'</td>'+
          '<td><a href="#" data-thread="'+esc(x.email)+'">'+esc(x.email)+'</a></td><td>'+esc(x.person_name||'')+(x.person_role?'<div class="muted small">'+esc(x.person_role)+'</div>':'')+'</td>'+
          '<td>'+x.sources.map(function(s){return '<span class="pill">'+esc(s)+'</span>'}).join('')+'</td><td>'+(x.campaigns.length?x.campaigns.map(function(c){return '<span class="pill ok">'+esc(c.name||('#'+c.id))+'</span>'}).join(''):'<span class="muted small">none</span>')+'</td></tr>'}).join(''):'<tr><td colspan="6" class="empty">No lead emails match.</td></tr>';
      var end=Math.min(S.leadOffset+LIMIT,S.leadTotal);
      $('leadPage').textContent=S.leadTotal?(S.leadOffset+1)+'–'+end+' of '+num(S.leadTotal):'';
      $('leadPrev').disabled=S.leadOffset===0;$('leadNext').disabled=end>=S.leadTotal;$('checkAll').checked=false;
      syncPush();
    }).catch(fail);
  }
  function pickedKeys(){return Object.keys(S.picked).filter(function(k){return S.picked[k]})}
  function syncPush(){var c=$('pushCampaign').value;var n=pickedKeys().length;$('pushSelected').disabled=!c||!n;$('pushSelected').textContent='Add selected ('+n+')';$('pushAll').disabled=!c||!S.leadTotal;$('pushAll').textContent='Add all '+num(S.leadTotal)+' matching'}
  $('leadRows').addEventListener('change',function(e){var k=e.target.dataset&&e.target.dataset.key;if(k){S.picked[k]=e.target.checked;syncPush()}});
  $('leadRows').addEventListener('click',function(e){var em=e.target.dataset&&e.target.dataset.thread;if(em){e.preventDefault();openTab('inbox');openThread(em)}});
  $('checkAll').onchange=function(){var on=this.checked;S.leadRows.forEach(function(x){S.picked[x.key]=on});document.querySelectorAll('#leadRows input[data-key]').forEach(function(i){i.checked=on});syncPush()};
  $('leadGo').onclick=function(){S.leadOffset=0;loadLeads()};
  $('leadSearch').onkeydown=function(e){if(e.key==='Enter'){S.leadOffset=0;loadLeads()}};
  $('leadSource').onchange=$('leadStatus').onchange=function(){S.leadOffset=0;loadLeads()};
  $('leadPrev').onclick=function(){S.leadOffset=Math.max(0,S.leadOffset-LIMIT);loadLeads()};
  $('leadNext').onclick=function(){S.leadOffset+=LIMIT;loadLeads()};
  $('pushCampaign').onchange=syncPush;
  function pushLeads(body,label){
    var id=$('pushCampaign').value;if(!id)return;
    var name=$('pushCampaign').selectedOptions[0].textContent;
    if(!confirm('Add '+label+' to "'+name+'"?'))return;
    show('error');show('info','Adding '+label+' to Smartlead…');$('pushAll').disabled=$('pushSelected').disabled=true;
    api('/api/email-marketing/campaigns/'+id+'/leads',{method:'POST',body:body}).then(function(r){
      S.picked={};
      show('info','Sent '+num(r.sent)+' to "'+name+'": '+num(r.added)+' added, '+num(r.duplicates)+' already there, '+num(r.in_other_campaign)+' skipped (in another campaign), '+num(r.invalid)+' invalid, '+num(r.blocked)+' blocked or unsubscribed.'+(r.failed?'\n'+num(r.failed)+' failed: '+r.errors.join('; '):''));
      loadLeads();
    }).catch(function(e){fail(e);syncPush()});
  }
  $('pushSelected').onclick=function(){var k=pickedKeys();pushLeads({keys:k},k.length+' selected lead email'+(k.length===1?'':'s'))};
  $('pushAll').onclick=function(){pushLeads({all:true,search:$('leadSearch').value.trim(),source:$('leadSource').value,status:$('leadStatus').value},num(S.leadTotal)+' matching lead emails')};

  // ---- campaigns ----
  function renderCampaigns(){
    $('campRows').innerHTML=S.campaigns.length?S.campaigns.map(function(c){
      var pct=function(n){return c.sent?' <span class="muted small">'+Math.round(n*100/c.sent)+'%</span>':''};
      return '<tr class="click" data-id="'+c.id+'"><td>'+esc(c.name)+'</td><td>'+statusPill(c.status)+'</td><td class="num">'+num(c.leads)+'</td><td class="num">'+num(c.sent)+'</td><td class="num">'+num(c.opened)+pct(c.opened)+'</td><td class="num">'+num(c.replied)+pct(c.replied)+'</td><td class="num">'+num(c.bounced)+'</td><td class="num">'+num(c.interested)+'</td></tr>'}).join(''):'<tr><td colspan="8" class="empty">No campaigns yet.</td></tr>';
  }
  function fillCampaignSelects(){
    var opts=S.campaigns.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+' ('+esc(c.status)+')</option>'}).join('');
    var keep=$('pushCampaign').value,keepIn=$('inboxCampaign').value;
    $('pushCampaign').innerHTML='<option value="">Choose a campaign…</option>'+opts;$('pushCampaign').value=keep;
    $('inboxCampaign').innerHTML='<option value="">All campaigns</option>'+opts;$('inboxCampaign').value=keepIn;syncPush();
  }
  $('campRows').onclick=function(e){var tr=e.target.closest('tr[data-id]');if(tr)openCampaign(Number(tr.dataset.id))};

  function stepHtml(s,i){
    return '<div class="step" data-i="'+i+'"><div class="row"><b class="small">'+(i===0?'Email 1':'Follow-up '+i)+'</b>'+(i>0?'<label class="small muted">wait</label><input type="number" min="1" class="delay" value="'+(s.delay_days||3)+'" style="width:70px"><span class="small muted">days after the previous email</span>':'')+'<span class="grow"></span>'+(i>0?'<button class="small danger rm">Remove</button>':'')+'</div>'+
      '<div class="row"><input class="subj grow" placeholder="'+(i===0?'Subject':'Subject (leave empty to reply in the same thread)')+'" value="'+esc(s.subject||'')+'"></div><textarea class="body" placeholder="Hi {{company_name}} team,">'+esc(s.body||'')+'</textarea></div>';
  }
  function renderSteps(steps){
    $('steps').innerHTML=steps.map(stepHtml).join('');
    $('testSeq').innerHTML=steps.map(function(_,i){return '<option value="'+(i+1)+'">Email '+(i+1)+'</option>'}).join('');
  }
  function readSteps(){return Array.prototype.map.call(document.querySelectorAll('#steps .step'),function(el,i){return {subject:el.querySelector('.subj').value,body:el.querySelector('.body').value,delay_days:i?Number(el.querySelector('.delay').value)||1:0}})}
  $('steps').onclick=function(e){if(e.target.classList.contains('rm')){var st=readSteps();st.splice(Number(e.target.closest('.step').dataset.i),1);renderSteps(st)}};
  $('addStep').onclick=function(){var st=readSteps();st.push({subject:'',body:'',delay_days:3});renderSteps(st)};
  function renderDays(days){$('days').innerHTML=DAYS.map(function(d,i){return '<label><input type="checkbox" value="'+i+'"'+(days.indexOf(i)>=0?' checked':'')+'>'+d+'</label>'}).join('')}
  function renderBoxes(chosen){
    var boxes=(S.status&&S.status.mailboxes)||[];
    $('campBoxes').innerHTML=boxes.length?boxes.map(function(m){return '<label style="display:block"><input type="checkbox" value="'+m.id+'"'+(chosen.indexOf(m.id)>=0?' checked':'')+'> '+esc(m.email)+' <span class="muted">'+esc(m.name||'')+'</span></label>'}).join(''):'<span class="warn">No mailbox connected in Smartlead yet. You can write and save the campaign now and attach mailboxes later.</span>';
  }
  function editorBody(){
    return {name:$('cdName').dataset.name,steps:readSteps(),
      schedule:{timezone:$('tz').value.trim(),days:Array.prototype.map.call(document.querySelectorAll('#days input:checked'),function(i){return Number(i.value)}),start_hour:$('startH').value,end_hour:$('endH').value,min_gap_minutes:Number($('gap').value),max_new_per_day:Number($('perDay').value)},
      mailbox_ids:Array.prototype.map.call(document.querySelectorAll('#campBoxes input:checked'),function(i){return Number(i.value)})};
  }
  $('newCampaign').onclick=function(){
    var name=prompt('Campaign name','Solar for '+new Date().toLocaleDateString(undefined,{month:'short',year:'numeric'}));if(!name)return;
    S.camp={id:null};$('campDetail').hidden=false;$('campExtra').hidden=true;
    $('cdName').textContent=name;$('cdName').dataset.name=name;$('cdStatus').innerHTML=statusPill('NEW');$('cdStats').textContent='Not saved yet.';
    ['cdStart','cdPause','cdStop','cdDelete'].forEach(function(b){$(b).hidden=true});
    renderSteps([{subject:'',body:'',delay_days:0},{subject:'',body:'',delay_days:3}]);renderDays([1,2,3,4,5]);renderBoxes([]);
    $('campDetail').scrollIntoView({behavior:'smooth'});
  };
  function openCampaign(id){
    show('error');$('campDetail').hidden=false;$('cdName').textContent='Loading…';
    return api('/api/email-marketing/campaigns/'+id).then(function(r){
      var c=r.campaign;S.camp={id:id,data:r};S.clOffset=0;
      $('cdName').textContent=c.name;$('cdName').dataset.name=c.name;$('cdStatus').innerHTML=statusPill(c.status);
      $('cdStats').textContent=num(c.leads)+' leads · '+num(c.not_started)+' not started · '+num(c.in_progress)+' in progress · '+num(c.completed)+' done · '+num(c.sent)+' sent · '+num(c.opened)+' opened · '+num(c.replied)+' replied · '+num(c.bounced)+' bounced · '+num(c.unsubscribed)+' unsubscribed';
      ['cdStart','cdPause','cdStop','cdDelete'].forEach(function(b){$(b).hidden=false});
      $('cdStart').textContent=c.status==='PAUSED'?'Resume':'Start';
      renderSteps(r.steps.length?r.steps:[{subject:'',body:'',delay_days:0}]);
      var sc=r.schedule||{};$('tz').value=sc.timezone||'Asia/Kuala_Lumpur';$('startH').value=sc.start_hour||'09:00';$('endH').value=sc.end_hour||'17:00';$('gap').value=sc.min_gap_minutes||10;$('perDay').value=sc.max_new_per_day||50;
      renderDays(sc.days&&sc.days.length?sc.days:[1,2,3,4,5]);renderBoxes((r.mailboxes||[]).map(function(m){return m.id}));
      $('campExtra').hidden=false;loadCampLeads();$('campDetail').scrollIntoView({behavior:'smooth'});
    }).catch(fail);
  }
  $('saveCampaign').onclick=function(){
    var body=editorBody();if(!body.steps[0]||!body.steps[0].subject.trim()||!body.steps[0].body.trim())return show('error','Email 1 needs a subject and a body.');
    $('saveCampaign').disabled=true;$('saveNote').textContent='Saving to Smartlead…';
    var call=S.camp&&S.camp.id?api('/api/email-marketing/campaigns/'+S.camp.id+'/setup',{method:'POST',body:body}):api('/api/email-marketing/campaigns',{method:'POST',body:body});
    call.then(function(r){
      $('saveNote').textContent='';
      if(r.errors&&r.errors.length)show('error','Saved, with problems:\n'+r.errors.join('\n'));else show('info','Campaign saved.');
      return loadOverview().then(function(){return openCampaign(r.id)});
    }).catch(fail).then(function(){$('saveCampaign').disabled=false;$('saveNote').textContent=''});
  };
  function setStatus(st,label,done){
    if(!S.camp||!S.camp.id)return;
    if(!confirm(label+' "'+$('cdName').dataset.name+'"?'))return;
    api('/api/email-marketing/campaigns/'+S.camp.id+'/status',{method:'POST',body:{status:st}}).then(function(){show('info','Campaign '+done+'.');return loadOverview().then(function(){return openCampaign(S.camp.id)})}).catch(fail);
  }
  $('cdStart').onclick=function(){setStatus('START',this.textContent,'started: Smartlead sends inside the schedule')};
  $('cdPause').onclick=function(){setStatus('PAUSED','Pause','paused')};
  $('cdStop').onclick=function(){setStatus('STOPPED','Stop','stopped')};
  $('cdDelete').onclick=function(){
    if(!S.camp||!S.camp.id||!confirm('Delete "'+$('cdName').dataset.name+'" in Smartlead? Its leads and stats there go with it.'))return;
    api('/api/email-marketing/campaigns/'+S.camp.id,{method:'DELETE'}).then(function(){show('info','Campaign deleted.');$('campDetail').hidden=true;S.camp=null;return loadOverview()}).catch(fail);
  };
  $('sendTest').onclick=function(){
    var to=$('testTo').value.trim();if(!to)return;
    api('/api/email-marketing/campaigns/'+S.camp.id+'/test',{method:'POST',body:{email:to,sequence:Number($('testSeq').value)||1}}).then(function(r){show('info','Test email '+$('testSeq').value+' sent to '+r.to+', filled in as '+r.as_lead+'.')}).catch(fail);
  };
  function loadCampLeads(){
    if(!S.camp||!S.camp.id)return;
    $('campLeads').innerHTML='<tr><td colspan="5" class="empty">Loading…</td></tr>';
    api('/api/email-marketing/campaigns/'+S.camp.id+'/leads?limit=50&offset='+S.clOffset).then(function(r){
      $('campLeads').innerHTML=r.rows.length?r.rows.map(function(l){
        var paused=String(l.status).toUpperCase()==='PAUSED';
        return '<tr><td>'+esc(l.company||'')+(l.name?'<div class="muted small">'+esc(l.name)+'</div>':'')+'</td><td><a href="#" data-thread="'+esc(l.email)+'">'+esc(l.email)+'</a></td><td>'+statusPill(l.status)+(l.unsubscribed?'<span class="pill bad">unsubscribed</span>':'')+'</td><td>'+esc(catName(l.category_id))+'</td>'+
          '<td><button class="small" data-lead="'+l.lead_id+'" data-act="'+(paused?'resume':'pause')+'">'+(paused?'Resume':'Pause')+'</button></td></tr>'}).join(''):'<tr><td colspan="5" class="empty">No leads yet. Add them from the Leads tab.</td></tr>';
      var end=Math.min(S.clOffset+50,r.total);$('clPage').textContent=r.total?(S.clOffset+1)+'–'+end+' of '+num(r.total):'';
      $('clPrev').disabled=S.clOffset===0;$('clNext').disabled=end>=r.total;
    }).catch(fail);
  }
  $('campLeads').onclick=function(e){
    var em=e.target.dataset.thread;if(em){e.preventDefault();openTab('inbox');openThread(em,S.camp.id);return}
    var lid=e.target.dataset.lead;if(lid){api('/api/email-marketing/campaigns/'+S.camp.id+'/leads/'+lid+'/'+e.target.dataset.act,{method:'POST',body:{}}).then(loadCampLeads).catch(fail)}
  };
  $('clPrev').onclick=function(){S.clOffset=Math.max(0,S.clOffset-50);loadCampLeads()};
  $('clNext').onclick=function(){S.clOffset+=50;loadCampLeads()};

  // ---- inbox ----
  function loadInbox(){
    $('inboxList').innerHTML='<div class="empty">Loading…</div>';
    var c=$('inboxCampaign').value;
    api('/api/email-marketing/inbox?limit=20&offset='+S.inOffset+(c?'&campaign_id='+c:'')).then(function(r){
      var rows=r.rows||[];
      $('inboxList').innerHTML=rows.length?rows.map(function(m){
        return '<div class="list-item" data-email="'+esc(m.email)+'" data-camp="'+esc(m.campaign_id||'')+'"><div class="row"><b>'+esc(m.company||m.name||m.email)+'</b>'+(m.unread?'<span class="pill warn">unread</span>':'')+(m.category_id?'<span class="pill">'+esc(catName(m.category_id))+'</span>':'')+'</div>'+
          '<div class="t">'+esc(m.email)+' · '+esc(m.campaign_name||'')+' · '+when(m.time)+'</div><div class="small">'+esc(m.preview)+'</div></div>'}).join(''):'<div class="empty">No replies yet.</div>';
      $('inPrev').disabled=S.inOffset===0;$('inNext').disabled=rows.length<20;
    }).catch(function(e){$('inboxList').innerHTML='<div class="empty bad">'+esc(e.message)+'</div>'});
  }
  $('inboxList').onclick=function(e){var it=e.target.closest('.list-item');if(!it)return;document.querySelectorAll('.list-item.on').forEach(function(x){x.classList.remove('on')});it.classList.add('on');openThread(it.dataset.email,Number(it.dataset.camp)||null)};
  $('inboxRefresh').onclick=$('inboxCampaign').onchange=function(){S.inOffset=0;loadInbox()};
  $('inPrev').onclick=function(){S.inOffset=Math.max(0,S.inOffset-20);loadInbox()};
  $('inNext').onclick=function(){S.inOffset+=20;loadInbox()};
  $('threadGo').onclick=function(){var em=$('threadEmail').value.trim();if(em)openThread(em)};
  $('threadEmail').onkeydown=function(e){if(e.key==='Enter')$('threadGo').click()};

  function openThread(email,campaignId){
    $('thread').innerHTML='<div class="empty">Loading the thread with '+esc(email)+'…</div>';
    api('/api/email-marketing/thread?email='+encodeURIComponent(email)+(campaignId?'&campaign_id='+campaignId:'')).then(function(r){
      S.threadData=r;
      if(!r.lead){$('thread').innerHTML='<div class="empty">'+esc(email)+' is not in any Smartlead campaign yet.</div>';return}
      var L=r.lead;
      var head='<h2>'+esc(L.company_name||L.email)+'</h2><p class="muted small">'+esc([L.first_name,L.last_name].filter(Boolean).join(' '))+' '+esc(L.email)+(L.unsubscribed?' · <span class="bad">unsubscribed</span>':'')+'</p>';
      var catOpts=function(sel){return '<option value="">No category</option>'+S.cats.map(function(c){return '<option value="'+c.id+'"'+(c.id==sel?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')};
      $('thread').innerHTML=head+(r.threads.length?r.threads.map(function(t,ti){
        var msgs=t.messages||[];var lastIn=null;for(var i=msgs.length-1;i>=0;i--)if(msgs[i].inbound){lastIn=msgs[i];break}
        var target=lastIn||msgs[msgs.length-1];
        return '<div style="margin-top:14px"><div class="row"><h3 style="margin:0">'+esc(t.campaign_name||('Campaign '+t.campaign_id))+'</h3><span class="grow"></span><select data-cat="'+ti+'">'+catOpts(t.category_id)+'</select></div>'+
          (t.error?'<p class="bad small">'+esc(t.error)+'</p>':'')+
          (msgs.length?msgs.map(function(m){return '<div class="bubble'+(m.inbound?' in':'')+'"><div class="meta">'+(m.inbound?'↙ Reply':'↗ Sent')+(m.seq?' · email '+esc(m.seq):'')+' · '+when(m.time)+(m.from?' · '+esc(m.from):'')+(m.subject?'<br><b>'+esc(m.subject)+'</b>':'')+'</div>'+esc(m.body)+'</div>'}).join(''):'<p class="muted small">Nothing sent yet.</p>')+
          (target&&target.stats_id?'<textarea data-reply="'+ti+'" placeholder="Write your reply…" style="min-height:110px"></textarea><div class="row" style="margin-top:8px"><input data-cc="'+ti+'" placeholder="CC (optional)" class="grow"><button class="primary" data-send="'+ti+'">Send reply</button></div>':'')+'</div>'}).join(''):'<p class="muted">No campaign thread found.</p>');
    }).catch(function(e){$('thread').innerHTML='<div class="empty bad">'+esc(e.message)+'</div>'});
  }
  $('thread').addEventListener('change',function(e){
    var ti=e.target.dataset.cat;if(ti==null||!S.threadData)return;var t=S.threadData.threads[Number(ti)];
    api('/api/email-marketing/campaigns/'+t.campaign_id+'/leads/'+S.threadData.lead.id+'/category',{method:'POST',body:{category_id:e.target.value||null}}).then(function(){show('info','Category saved.')}).catch(fail);
  });
  $('thread').addEventListener('click',function(e){
    var ti=e.target.dataset.send;if(ti==null||!S.threadData)return;
    var t=S.threadData.threads[Number(ti)];var msgs=t.messages||[];var target=null;for(var i=msgs.length-1;i>=0;i--)if(msgs[i].inbound){target=msgs[i];break}target=target||msgs[msgs.length-1];
    var text=document.querySelector('[data-reply="'+ti+'"]').value.trim();if(!text)return;
    e.target.disabled=true;
    api('/api/email-marketing/reply',{method:'POST',body:{campaign_id:t.campaign_id,stats_id:target.stats_id,message_id:target.message_id,time:target.time,original_html:target.body_html,body:text,cc:document.querySelector('[data-cc="'+ti+'"]').value.trim()}}).then(function(){
      show('info','Reply sent to '+S.threadData.lead.email+'.');openThread(S.threadData.lead.email,t.campaign_id);
    }).catch(function(err){e.target.disabled=false;fail(err)});
  });

  // ---- start ----
  $('saveToken').onclick=function(){try{localStorage.setItem('labToken',$('token').value.trim())}catch(e){}$('tokenCard').hidden=true;show('error');start()};
  function start(){
    if(!token()){$('tokenCard').hidden=false;return}
    loadOverview().catch(fail);
    var t='overview';try{t=localStorage.getItem('emTab')||'overview'}catch(e){}
    openTab(t);
  }
  start();
})();
</script>
</body></html>`;
}
