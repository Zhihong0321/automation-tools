import { OPERATOR_NAV, navHtml } from './nav.ts';

/** Operator view over the broker's live worker registry. */
export function page(): string {
  return String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>Workers · agy-lab</title>
<style>
:root{--bg:#0f1115;--card:#171a20;--ink:#e8eaed;--muted:#9aa3af;--line:#262b33;--ok:#4ade9f;--bad:#ff8b80;--warn:#f0c065;--accent:#7aa2f7;--cool:#c6a5ff}
*{box-sizing:border-box}body{margin:0;padding:28px 20px 64px;background:var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif}.wrap{max-width:1180px;margin:0 auto}h1{font-size:24px;margin:0 0 4px;letter-spacing:-.02em}.sub{color:var(--muted);font-size:13px;margin:0 0 22px}.sitenav{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid var(--line)}.sitenav a{color:var(--muted);font-size:13px;font-weight:550;padding:5px 10px;border:1px solid transparent;border-radius:8px;text-decoration:none}.sitenav a:hover,.sitenav a[aria-current="page"]{color:var(--ink);background:#1e222a;border-color:var(--line)}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}button,input{font:inherit;font-size:13px;border-radius:8px}button{font-weight:550;padding:7px 14px;border:1px solid var(--line);background:#1e222a;color:var(--ink);cursor:pointer}button:hover:not(:disabled){border-color:var(--muted)}button:disabled{opacity:.5;cursor:default}button.primary{background:var(--accent);border-color:var(--accent);color:#0f1115}input{background:#0f1115;color:var(--ink);border:1px solid var(--line);padding:7px 10px}.token{flex:1;min-width:240px}.hint{color:var(--muted);font-size:12px;margin:8px 0 0}.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:650;padding:3px 9px;border-radius:999px;border:1px solid currentColor}.pill:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.online,.busy{color:var(--ok)}.offline,.error{color:var(--bad)}.cooldown,.idle{color:var(--warn)}.unknown{color:var(--muted)}.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px}.metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 15px}.metric strong{display:block;font-size:25px;line-height:1.1}.metric span{display:block;margin-top:7px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 12px}.section-head h2{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0}.updated{color:var(--muted);font:11px ui-monospace,Consolas,monospace}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:820px}th{text-align:left;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:650;padding:9px 10px;border-bottom:1px solid var(--line)}td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}.worker-name{font-weight:650}.mono{font:12px ui-monospace,Consolas,monospace;word-break:break-word}.small{color:var(--muted);font-size:11px;margin-top:4px}.types{color:var(--muted);font-size:11px;max-width:240px}.empty{padding:24px;text-align:center;color:var(--muted)}.queue-row{display:grid;grid-template-columns:130px 1fr auto;gap:14px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}.queue-row:first-child{border-top:0}.queue-type{color:var(--accent);font:650 10px ui-monospace,Consolas,monospace;word-break:break-word}.error-box{display:none;color:var(--bad);background:#28191c;border:1px solid #5c2a30;border-radius:8px;padding:10px 12px;margin-bottom:16px}.error-box.show{display:block}@media(max-width:820px){body{padding:20px 14px 44px}.summary{grid-template-columns:repeat(2,1fr)}.summary .metric:last-child{grid-column:1/-1}.queue-row{grid-template-columns:1fr auto;gap:5px}.queue-type{grid-column:1/-1}}
</style></head><body><div class="wrap">
<h1>Worker control room</h1><p class="sub">Live lanes, claimed work, and queue pressure from the in-memory job broker.</p>
<nav class="sitenav" aria-label="Site">${navHtml(OPERATOR_NAV, '/workers')}</nav>
<div class="card"><div class="row"><input id="token" class="token" type="password" placeholder="LAB_TOKEN" autocomplete="current-password"><button class="primary" id="saveButton">Save and refresh</button><button id="refreshButton">Refresh</button><span id="authState" class="pill unknown">no token</span></div><p class="hint">The token stays in this browser and is sent only to the protected worker snapshot endpoint.</p></div>
<div class="card"><div class="section-head"><h2>Contact research keys</h2><span id="keyStatus" class="updated">not loaded</span></div><p class="hint">Step 1 searches with Tavily (rotates across keys, up to 1,000 req/key/month). Step 2 extracts contacts with official Gemini keys (gemini-3.8-flash, two calls per key). Paste one key per line. Leave a box blank to keep the keys already saved.</p><label class="hint" for="tavilyKeys">Tavily Search API keys (tvly-..., rotates across keys, max 1,000 req/key/month)</label><textarea id="tavilyKeys" rows="3" style="width:100%;margin:6px 0 10px;background:#0f1115;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:12px ui-monospace,Consolas,monospace"></textarea><label class="hint" for="officialKeys">Official Gemini keys, gemini-3.8-flash</label><textarea id="officialKeys" rows="4" style="width:100%;margin:6px 0 10px;background:#0f1115;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:12px ui-monospace,Consolas,monospace"></textarea><div class="row"><button class="primary" id="saveKeys">Save keys</button><button id="clearTavily">Clear Tavily keys</button><button id="clearOfficial">Clear official keys</button></div></div>
<div id="error" class="error-box" role="alert"></div>
<div class="summary" aria-live="polite"><div class="metric"><strong id="mWorkers">—</strong><span>Workers</span></div><div class="metric"><strong id="mOnline">—</strong><span>Online</span></div><div class="metric"><strong id="mBusy">—</strong><span>Busy</span></div><div class="metric"><strong id="mIdle">—</strong><span>Idle</span></div><div class="metric"><strong id="mCooldown">—</strong><span>Quota cooldown</span></div><div class="metric"><strong id="mQueue">—</strong><span>Pending jobs</span></div></div>
<div class="card"><div class="section-head"><h2>Worker lanes</h2><span id="updated" class="updated">not loaded</span></div><div class="table-wrap"><table><thead><tr><th>Worker</th><th>Status</th><th>Current task</th><th>Last seen</th><th>Capabilities</th><th>Totals</th></tr></thead><tbody id="workers"><tr><td colspan="6" class="empty">Enter a LAB_TOKEN to load workers.</td></tr></tbody></table></div></div>
<div class="card"><div class="section-head"><h2>Pending queue</h2><span id="queueNote" class="updated"></span></div><div id="queue"><div class="empty">No queue data yet.</div></div></div>
</div><script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var token=function(){return localStorage.getItem('labToken')||''};
  var ago=function(iso){if(!iso)return 'never';var seconds=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);if(seconds<60)return Math.round(seconds)+'s ago';if(seconds<3600)return Math.round(seconds/60)+'m ago';return Math.round(seconds/3600)+'h ago'};
  var duration=function(iso){if(!iso)return '—';var seconds=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);if(seconds<60)return Math.round(seconds)+'s';if(seconds<3600)return Math.floor(seconds/60)+'m '+Math.floor(seconds%60)+'s';return Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m'};
  var countdown=function(iso){var ms=new Date(iso).getTime()-Date.now();if(!Number.isFinite(ms))return 'reset time unknown';if(ms<=0)return 'reset due — reconnecting';var s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h+'h '+String(m).padStart(2,'0')+'m '+String(s%60).padStart(2,'0')+'s'};
  var tick=function(){Array.prototype.forEach.call(document.querySelectorAll('[data-cooldown-until]'),function(el){el.textContent=countdown(el.getAttribute('data-cooldown-until'))})};
  var payloadSummary=function(payload){if(payload==null)return '';if(typeof payload!=='object')return String(payload).slice(0,160);var keys=Object.keys(payload);return keys.length?'payload: '+keys.slice(0,6).join(', ')+(keys.length>6?' …':''):''};
  var state=function(body){var running={};(body.jobs||[]).forEach(function(job){if(job.status==='running'&&job.worker)running[job.worker]=job});return {workers:(body.workers||[]).map(function(worker){return {worker:worker,job:running[worker.name]||null}}),pending:(body.jobs||[]).filter(function(job){return job.status==='pending'})}};
  var render=function(body){var joined=state(body), workers=joined.workers, counts={online:0,offline:0,cooldown:0,busy:0,idle:0};workers.forEach(function(item){var status=item.worker.status||'offline';if(counts[status]!=null)counts[status]++;if(item.job)counts.busy++;else if(status==='online')counts.idle++});$('mWorkers').textContent=workers.length;$('mOnline').textContent=counts.online;$('mBusy').textContent=counts.busy;$('mIdle').textContent=counts.idle;$('mCooldown').textContent=counts.cooldown;$('mQueue').textContent=joined.pending.length;
    $('workers').innerHTML=workers.length?workers.map(function(item){var w=item.worker,j=item.job,status=w.status||'offline',cooling=status==='cooldown',timer=cooling&&w.cooldownUntil?'<div class="small cooldown">Quota reached · waiting for refresh in <strong class="mono" data-cooldown-until="'+esc(w.cooldownUntil)+'">'+esc(countdown(w.cooldownUntil))+'</strong></div><div class="small">Reset at '+esc(new Date(w.cooldownUntil).toLocaleString())+'</div>':'',task=j?'<span class="mono">'+esc(j.type)+'</span><div class="small">job '+esc(j.id)+' · '+duration(j.startedAt)+'</div><div class="small">'+esc(payloadSummary(j.payload))+'</div>':cooling?'<span class="cooldown">Waiting for quota refresh</span>':'<span class="idle">No claimed job</span>';return '<tr><td><div class="worker-name">'+esc(w.name)+'</div><div class="small">'+esc(w.ip||'IP unavailable')+'</div></td><td><span class="pill '+esc(status)+'">'+(cooling?'quota cooldown':esc(status))+'</span>'+timer+(w.cooldownReason?'<div class="small">'+esc(w.cooldownReason)+'</div>':'')+'</td><td>'+task+'</td><td><span class="mono">'+esc(ago(w.lastSeenAt))+'</span><div class="small">'+esc(w.lastSeenAt||'')+'</div></td><td class="types">'+esc((w.types||[]).join(', ')||'No types reported')+'</td><td class="mono">taken '+esc(w.taken)+'<br>done '+esc(w.done)+'<br>failed '+esc(w.failed)+'</td></tr>'}).join(''):'<tr><td colspan="6" class="empty">No workers have checked in.</td></tr>';
    $('queueNote').textContent=joined.pending.length+' pending';$('queue').innerHTML=joined.pending.length?joined.pending.map(function(job){return '<div class="queue-row"><div class="queue-type">'+esc(job.type)+'</div><div><span class="mono">'+esc(job.id)+'</span><div class="small">created '+esc(ago(job.createdAt))+' · attempts '+esc(job.attempts)+'</div></div><div class="pill idle">pending</div></div>'}).join(''):'<div class="empty">No pending jobs.</div>';
    $('updated').textContent='updated '+new Date().toLocaleTimeString();
    tick();
  };
  var loadKeys=function(){
    if(!token())return;
    fetch('/api/gemini-contact-keys',{headers:{authorization:'Bearer '+token()}})
      .then(function(response){return response.json()})
      .then(function(body){
        if(!body||!body.official)return;
        var tails=function(rows){
          return (rows||[]).map(function(row){
            var extra = row.usedThisMonth!=null ? ' ('+row.usedThisMonth+'/'+row.monthlyLimit+(row.cooling?' cooling':'')+')' : '';
            return row.tail + extra;
          }).join(', ')||'none';
        };
        var tavList = (body.tavily && body.tavily.length) ? body.tavily : (body.grounding || []);
        $('keyStatus').textContent='tavily '+tails(tavList)+' · official '+tails(body.official)+' · step 1 slots '+(body.step1Slots||0)+' · step 2 slots '+(body.step2Slots||0);
      }).catch(function(){});
  };
  var lines=function(id){return $(id).value.split(/\n/).map(function(line){return line.trim()}).filter(Boolean)};
  var saveKeys=function(kind){
    if(!token())return;
    var body={};
    if(kind==='tavily')body.tavily=lines('tavilyKeys');
    if(kind==='official')body.official=lines('officialKeys');
    if(kind==='both'){
      if($('tavilyKeys').value.trim())body.tavily=lines('tavilyKeys');
      if($('officialKeys').value.trim())body.official=lines('officialKeys');
    }
    fetch('/api/gemini-contact-keys',{method:'POST',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(response){return response.json().then(function(payload){return {response:response,payload:payload}})})
      .then(function(result){
        if(!result.response.ok)throw new Error(result.payload.error||'save failed');
        $('tavilyKeys').value='';
        $('officialKeys').value='';
        loadKeys();
      }).catch(function(error){$('error').textContent=error.message;$('error').className='error-box show'});
  };
  var refresh=function(){if(refresh.running)return;refresh.running=true;$('refreshButton').disabled=true;$('saveButton').disabled=true;$('error').className='error-box';fetch('/api/jobs',{headers:{authorization:'Bearer '+token()}}).then(function(response){return response.json().catch(function(){return {error:'invalid response'}}).then(function(body){return {response:response,body:body}})}).then(function(result){if(!result.response.ok){$('authState').className='pill '+(result.response.status===401?'error':'unknown');$('authState').textContent=result.response.status===401?'token rejected':'error';throw new Error(result.body.error||('request failed ('+result.response.status+')'))}$('authState').className='pill online';$('authState').textContent='token ok';render(result.body);loadKeys()}).catch(function(error){$('error').textContent=error.message;$('error').className='error-box show'}).finally(function(){refresh.running=false;$('refreshButton').disabled=false;$('saveButton').disabled=false})};
  $('token').value=token();$('refreshButton').onclick=refresh;$('saveButton').onclick=function(){localStorage.setItem('labToken',$('token').value.trim());refresh()};$('saveKeys').onclick=function(){saveKeys('both')};$('clearTavily').onclick=function(){$('tavilyKeys').value='';saveKeys('tavily')};$('clearOfficial').onclick=function(){$('officialKeys').value='';saveKeys('official')};setInterval(refresh,5000);setInterval(tick,1000);if(token())refresh();
})();
</script></body></html>`;
}
