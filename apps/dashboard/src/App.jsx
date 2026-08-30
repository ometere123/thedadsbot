import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {
  AGENT_ORIGIN,BUILT_IN_CHAINS,OPENSEA_FEE_RECIPIENT,agentDrops,agentHealth,
  buildPublicMintPlan,chainName,formatEth,hasInjectedWallet,sendPublicMintPlan,
  shortAddress,walletSnapshot,
} from './lib/engine.js';

const NAV=[
  ['overview','Overview','grid'],['discover','Discover','compass'],['mint','Mint console','bolt'],
  ['wallets','Wallets','wallet'],['automation','Automation','clock'],['activity','Activity','pulse'],
];

function Icon({name,size=18}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'1.7',strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'};
  const paths={
    grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"/></>,
    bolt:<path d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z"/>,
    wallet:<><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v12H6.5A2.5 2.5 0 0 1 4 15.5v-9Z"/><path d="M15 10h6v5h-6a2.5 2.5 0 0 1 0-5Z"/><circle cx="16.5" cy="12.5" r=".5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pulse:<path d="M3 12h4l2-6 4 12 2-6h6"/>,
    shield:<><path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    radio:<><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></>,
    arrow:<><path d="M5 12h14M14 7l5 5-5 5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    lock:<><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    external:<><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
  };
  return <svg {...common}>{paths[name]||paths.grid}</svg>;
}

function BrandMark(){return <div className="brand-mark" aria-hidden="true"><span>D</span><i/></div>;}
function StatusDot({tone='muted'}){return <span className={`status-dot ${tone}`}/>;}
function Pill({children,tone='neutral'}){return <span className={`pill ${tone}`}>{children}</span>;}
function Button({children,variant='primary',className='',...props}){return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;}

function Sidebar({view,onView,agentOnline}){
  return <aside className="sidebar">
    <div className="brand-wrap"><BrandMark/><div className="brand-copy"><strong>TheDadBot</strong><span>mint operations</span></div></div>
    <div className="nav-label">Workspace</div>
    <nav className="nav-list" aria-label="Primary navigation">
      {NAV.map(([id,label,icon],index)=><button key={id} className={`nav-item ${view===id?'active':''}`} onClick={()=>onView(id)}><Icon name={icon}/><span>{label}</span><b>{String(index+1).padStart(2,'0')}</b></button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="trust-card"><div className="trust-icon"><Icon name="shield" size={16}/></div><div><strong>Non-custodial surface</strong><p>No seed phrase. No hosted key import.</p></div></div>
      <div className="agent-mini"><StatusDot tone={agentOnline?'good':'muted'}/><span>{agentOnline?'Local agent online':'Local agent offline'}</span></div>
    </div>
  </aside>;
}

function Topbar({title,account,chainId,agentOnline,onConnect,onAgentCheck}){
  return <header className="topbar">
    <div><p className="kicker">THE DAD BOT / OPERATIONS</p><h1>{title}</h1></div>
    <div className="top-actions">
      <button className="agent-chip" onClick={onAgentCheck}><StatusDot tone={agentOnline?'good':'muted'}/><span>{agentOnline?'Agent online':'Agent offline'}</span></button>
      <Button onClick={onConnect} variant={account?'wallet-connected':'primary'}><Icon name="wallet" size={15}/><span>{account?shortAddress(account):'Connect wallet'}</span>{chainId&&<em>{chainName(chainId)}</em>}</Button>
    </div>
  </header>;
}

function HeroSignal(){
  return <div className="signal-stage" aria-hidden="true">
    <div className="signal-halo h1"/><div className="signal-halo h2"/><div className="signal-halo h3"/>
    <div className="signal-axis x"/><div className="signal-axis y"/><div className="signal-sweep"/>
    <div className="signal-core"><BrandMark/></div>
    <span className="signal-node n1">RPC<br/>quorum</span><span className="signal-node n2">intent<br/>firewall</span><span className="signal-node n3">NFT<br/>proof</span>
  </div>;
}

function Overview({account,chainId,block,agentOnline,onView}){
  return <div className="view-stack">
    <section className="hero-card">
      <div className="hero-copy">
        <div className="micro-row"><Pill tone="lime">security-first execution</Pill><span>One engine · three surfaces</span></div>
        <h2>Move fast.<br/><span>Never sign blind.</span></h2>
        <p>TheDadBot verifies the chain, target, calldata, value and expected NFT outcome before it treats a mint as successful.</p>
        <div className="hero-actions"><Button onClick={()=>onView('mint')}>Open mint console <Icon name="arrow" size={16}/></Button><Button variant="ghost" onClick={()=>onView('discover')}>Explore drops</Button></div>
        <div className="hero-foot"><span><Icon name="lock" size={13}/> Browser keys stay in your wallet</span><span><Icon name="radio" size={13}/> Local automation stays local</span></div>
      </div>
      <HeroSignal/>
    </section>

    <section className="metric-grid">
      <article className="metric-card"><div className="metric-top"><span>Wallet</span><StatusDot tone={account?'good':'muted'}/></div><strong>{account?shortAddress(account):'Not connected'}</strong><p>Injected wallet only in browser mode</p></article>
      <article className="metric-card"><div className="metric-top"><span>Network</span><span className="metric-index">01</span></div><strong>{chainId?chainName(chainId):'Awaiting wallet'}</strong><p>{block?`Live at block ${block.toLocaleString()}`:'Live chain resolves from wallet'}</p></article>
      <article className="metric-card"><div className="metric-top"><span>Local agent</span><StatusDot tone={agentOnline?'good':'muted'}/></div><strong>{agentOnline?'Connected':'Offline'}</strong><p>Discovery, fleets, RPC services and AUTO</p></article>
      <article className="metric-card accent"><div className="metric-top"><span>Safety mode</span><Icon name="shield" size={15}/></div><strong>Fail closed</strong><p>Opaque plans are never promoted to AUTO</p></article>
    </section>

    <section className="overview-grid">
      <article className="surface-card pipeline-card">
        <div className="section-head"><div><p className="eyebrow">EXECUTION PATH</p><h3>Every signature earns its way through.</h3></div><Pill tone="green">shared core</Pill></div>
        <div className="pipeline-rail">
          {[['01','Resolve','Live state'],['02','Verify','Intent'],['03','Simulate','Pending state'],['04','Sign','Locally'],['05','Prove','NFT outcome']].map(([n,a,b],i)=><React.Fragment key={n}><div className="pipeline-step"><b>{n}</b><strong>{a}</strong><span>{b}</span></div>{i<4&&<div className="rail-line"><i/></div>}</React.Fragment>)}
        </div>
      </article>
      <article className="surface-card network-card">
        <div className="section-head"><div><p className="eyebrow">BUILT-IN NETWORKS</p><h3>Portable by design.</h3></div><span className="big-glyph">8</span></div>
        <div className="chain-list">{BUILT_IN_CHAINS.map(([name,id])=><div key={name}><span>{name}</span><code>{id}</code></div>)}</div>
      </article>
    </section>

    <section className="principle-strip"><div><span>01</span><strong>Intent before execution</strong></div><div><span>02</span><strong>Keys stay local</strong></div><div><span>03</span><strong>Receipts need proof</strong></div></section>
  </div>;
}

function Discover({agentOnline,drops,loading,onLoad}){
  const [type,setType]=useState('upcoming');
  const [chain,setChain]=useState('');
  return <div className="view-stack">
    <section className="page-intro"><div><Pill tone="violet">OpenSea discovery</Pill><h2>Find the drop.<br/>Keep execution separate.</h2><p>Discovery flows through your local agent so API credentials never need to live in the hosted browser bundle.</p></div><div className="intro-aside"><Icon name="compass" size={28}/><span>Discovery is information.<br/>It is not transaction authority.</span></div></section>
    <section className="filter-bar">
      <label><span>Feed</span><select value={type} onChange={e=>setType(e.target.value)}><option value="upcoming">Upcoming</option><option value="featured">Featured</option><option value="recently_minted">Recently minted</option></select></label>
      <label className="grow"><span>Chain filter</span><input value={chain} onChange={e=>setChain(e.target.value)} placeholder="base, ethereum, arbitrum…"/></label>
      <Button disabled={!agentOnline||loading} onClick={()=>onLoad({type,chain})}>{loading?'Loading…':'Load drops'} <Icon name="arrow" size={15}/></Button>
    </section>
    {!agentOnline?<section className="empty-panel"><div className="empty-icon"><Icon name="radio" size={24}/></div><h3>Local agent required</h3><p>Start <code>npm run agent</code>. For a hosted Vercel dashboard, add the exact deployment origin to <code>THEDADBOT_DASHBOARD_ORIGINS</code> on your local machine.</p><div className="endpoint"><StatusDot tone="muted"/><span>{AGENT_ORIGIN}</span></div></section>:
      drops.length?<section className="drop-grid">{drops.map((drop,i)=>{const slug=drop.collection_slug||drop.slug||drop.collection?.slug||'';const name=drop.collection_name||drop.name||drop.collection?.name||slug||`Drop ${i+1}`;const dropChain=drop.chain||drop.collection?.chain||'chain';const start=drop.start_time||drop.startTime||drop.stages?.[0]?.startTime;return <article className="drop-card" key={`${slug}-${i}`}><div className="drop-art"><span>{String(name).slice(0,1).toUpperCase()}</span><i>{String(i+1).padStart(2,'0')}</i></div><div className="drop-body"><Pill>{dropChain}</Pill><h3>{name}</h3><p>{slug||'No collection slug returned'}</p><div className="drop-foot"><span>{start?new Date(start).toLocaleString():'Start time unavailable'}</span><Icon name="external" size={14}/></div></div></article>})}</section>:
      <section className="empty-panel compact"><div className="empty-icon"><Icon name="compass" size={24}/></div><h3>Discovery is ready</h3><p>Choose a feed and optional chain filter, then load current drops through your local agent.</p></section>}
  </div>;
}

function PlanReceipt({plan,consoleText}){
  const rows=plan?[
    ['Verification',plan.verification],['Target',plan.to],['NFT',plan.nft],['Value',formatEth(plan.value)],['Quantity',String(plan.quantity)],['Simulation',plan.simulation],
  ]:[['Verification','—'],['Target','—'],['NFT','—'],['Value','—'],['Quantity','—'],['Simulation','—']];
  return <article className="receipt-card">
    <div className="receipt-head"><div><p className="eyebrow">INTENT RECEIPT</p><h3>{plan?plan.stage==='OPEN'?'Ready for review':plan.stage:'No plan built'}</h3></div><Pill tone={plan?'green':'neutral'}>{plan?.verification||'idle'}</Pill></div>
    <div className="receipt-grid">{rows.map(([label,value])=><div key={label}><span>{label}</span><strong title={String(value)}>{String(value)}</strong></div>)}</div>
    {plan&&<div className="time-window"><span>Stage window</span><strong>{new Date(plan.drop.startTime*1000).toLocaleString()} <i>→</i> {plan.drop.endTime?new Date(plan.drop.endTime*1000).toLocaleString():'open'}</strong></div>}
    <div className="terminal"><div className="terminal-head"><span/><span/><span/><b>execution console</b></div><pre>{consoleText||'Connect an injected wallet to begin.'}</pre></div>
  </article>;
}

function MintConsole({account,plan,onPlan,onSend,busy,consoleText}){
  const [nft,setNft]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [fee,setFee]=useState(OPENSEA_FEE_RECIPIENT);
  return <div className="view-stack">
    <section className="page-intro mint-intro"><div><Pill tone="lime">Deterministic SeaDrop</Pill><h2>Plan it. Inspect it.<br/>Then mint it.</h2><p>Public SeaDrop calldata is constructed locally from on-chain state. The browser does not ask an API which contract should receive your ETH.</p></div><div className="verification-stamp"><Icon name="shield" size={24}/><div><strong>DETERMINISTIC</strong><span>browser-native path</span></div></div></section>
    <section className="mint-layout">
      <article className="mint-form surface-card">
        <div className="form-number">01 <span>/ transaction intent</span></div>
        <label className="field"><span>NFT contract</span><input value={nft} onChange={e=>setNft(e.target.value)} spellCheck="false" placeholder="0x…"/></label>
        <div className="field-pair"><label className="field"><span>Quantity</span><input value={quantity} onChange={e=>setQuantity(e.target.value)} type="number" min="1" max="100"/></label><label className="field"><span>Fee recipient</span><input value={fee} onChange={e=>setFee(e.target.value)} spellCheck="false"/></label></div>
        <div className="intent-guard"><div className="guard-icon"><Icon name="lock" size={16}/></div><div><strong>Hosted-key boundary</strong><p>This surface never accepts a private key or seed phrase. Signing stays inside the injected wallet.</p></div></div>
        <div className="mint-actions"><Button variant="ghost" disabled={busy} onClick={()=>onPlan({nftContract:nft,quantity,feeRecipient:fee})}>{busy?'Working…':'Build deterministic plan'}</Button><Button disabled={busy||!plan||plan.stage!=='OPEN'} onClick={onSend}>Mint after review <Icon name="bolt" size={15}/></Button></div>
        {!account&&<p className="form-hint"><StatusDot tone="warm"/> Wallet connection will be requested when you build the plan.</p>}
      </article>
      <PlanReceipt plan={plan} consoleText={consoleText}/>
    </section>
  </div>;
}

function Wallets({account,chainId,onConnect}){
  return <div className="view-stack">
    <section className="page-intro"><div><Pill tone="green">Key boundary</Pill><h2>Two wallet modes.<br/>Neither gives the website your key.</h2><p>Interactive browser signing stays in the injected wallet. Fleet and unattended signing stay in an encrypted file controlled by the local process.</p></div></section>
    <section className="wallet-grid">
      <article className="wallet-mode featured"><div className="mode-index">01</div><div className="mode-icon"><Icon name="wallet" size={24}/></div><Pill tone="lime">browser</Pill><h3>Injected wallet</h3><p>For interactive public SeaDrop execution. MetaMask, Rabby and compatible injected EVM wallets keep the signature inside the extension.</p><div className="wallet-state"><StatusDot tone={account?'good':'muted'}/><div><span>{account?shortAddress(account):'No wallet connected'}</span><small>{chainId?chainName(chainId):'Network resolves after connection'}</small></div></div><Button onClick={onConnect}>{account?'Refresh wallet':'Connect injected wallet'}</Button></article>
      <article className="wallet-mode"><div className="mode-index">02</div><div className="mode-icon"><Icon name="lock" size={24}/></div><Pill>local only</Pill><h3>Encrypted wallet fleet</h3><p>For CLI, VPS and scheduled automation. Vault keys are encrypted with scrypt + AES-256-GCM and are never accepted by the dashboard HTTP API.</p><div className="code-block"><span>create vault</span><code>npm run cli -- vault create wallets.enc.json</code></div><div className="code-block"><span>unlock agent</span><code>THEDADBOT_VAULT=wallets.enc.json npm run agent</code></div></article>
    </section>
    <section className="boundary-card"><Icon name="shield" size={20}/><div><strong>The boundary is intentional.</strong><p>Discovery can be remote information. Signing authority is not. Browser keys stay in the wallet extension; automation keys stay in the local encrypted vault.</p></div></section>
  </div>;
}

function Automation({agentOnline,agent}){
  const modes=[
    ['WATCH','Observe only','No signing. No spend. Use discovery and state inspection without transaction authority.','compass'],
    ['CONFIRM','Prepare, then ask','Build and validate the exact transaction, then require an explicit user signature.','check'],
    ['AUTO','Deterministic only','Requires local agent, unlocked encrypted vault and explicit mint, gas and total-spend ceilings.','bolt'],
  ];
  return <div className="view-stack">
    <section className="page-intro"><div><Pill tone="warm">Bounded automation</Pill><h2>AUTO is a policy.<br/>Not a blind-sign switch.</h2><p>Unattended execution is constrained to independently verifiable plans, fresh live state and explicit maximum exposure.</p></div></section>
    <section className="automation-grid">{modes.map(([name,title,text,icon],i)=><article key={name} className={name==='AUTO'?'auto-card':''}><div className="automation-top"><span>{String(i+1).padStart(2,'0')}</span><Icon name={icon} size={19}/></div><Pill tone={name==='AUTO'?'lime':'neutral'}>{name}</Pill><h3>{title}</h3><p>{text}</p>{name==='AUTO'&&<div className="caps"><span>max mint</span><i/> <span>max gas</span><i/><span>max total</span></div>}</article>)}</section>
    <section className="agent-status-card"><div className="agent-status-head"><div><StatusDot tone={agentOnline?'good':'muted'}/><div><strong>{agentOnline?'Local agent is reachable':'Local agent is offline'}</strong><span>{AGENT_ORIGIN}</span></div></div><Pill tone={agentOnline?'green':'neutral'}>{agentOnline?'healthy':'browser-only'}</Pill></div><pre>{agent?JSON.stringify(agent,null,2):'Browser-only deterministic SeaDrop mode remains available. Start the local agent for discovery, fleet execution and scheduled automation.'}</pre></section>
  </div>;
}

function Activity({items,onClear}){
  return <div className="view-stack">
    <section className="page-intro activity-intro"><div><Pill tone="violet">Local session</Pill><h2>Execution trail.</h2><p>Plans, blocked actions, broadcasts and confirmations recorded by this browser are stored locally on this device.</p></div><Button variant="ghost" onClick={onClear}>Clear local trail</Button></section>
    <section className="activity-card">{items.length?items.map((item,i)=><div className="activity-row" key={`${item.at}-${i}`}><div className="activity-marker"><span/><i/></div><time>{new Date(item.at).toLocaleString()}</time><Pill tone={item.kind==='BLOCKED'?'warm':item.kind==='CONFIRMED'?'green':'neutral'}>{item.kind}</Pill><p>{item.message}</p></div>):<div className="empty-activity"><Icon name="pulse" size={25}/><h3>No activity yet</h3><p>Build a plan, connect a wallet or load discovery data and the local trail will appear here.</p></div>}</section>
  </div>;
}

function Toast({toast,onClose}){
  if(!toast)return null;
  return <div className={`toast ${toast.tone||'neutral'}`} role="status"><StatusDot tone={toast.tone==='error'?'warm':'good'}/><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss">×</button></div>;
}

export default function App(){
  const [view,setView]=useState('overview');
  const [wallet,setWallet]=useState({account:null,chainId:null,block:null});
  const [agent,setAgent]=useState(null);
  const [agentOnline,setAgentOnline]=useState(false);
  const [plan,setPlan]=useState(null);
  const [drops,setDrops]=useState([]);
  const [busy,setBusy]=useState(false);
  const [discoverBusy,setDiscoverBusy]=useState(false);
  const [consoleText,setConsoleText]=useState('Connect an injected wallet to begin.');
  const [toast,setToast]=useState(null);
  const [activity,setActivity]=useState(()=>{try{return JSON.parse(localStorage.getItem('thedadbot.activity')||'[]');}catch{return [];}});

  const title=useMemo(()=>({overview:'Operations overview',discover:'Drop discovery',mint:'Mint console',wallets:'Wallet security',automation:'Automation',activity:'Activity'}[view]||'TheDadBot'),[view]);

  const record=useCallback((kind,message)=>{
    setActivity(current=>{
      const next=[{at:new Date().toISOString(),kind,message},...current].slice(0,100);
      localStorage.setItem('thedadbot.activity',JSON.stringify(next));
      return next;
    });
  },[]);

  const showError=useCallback((error)=>{
    const message=error?.message||String(error);
    setToast({tone:'error',message});
    setConsoleText(`${error?.name||'Error'}: ${message}`);
    record('BLOCKED',message);
  },[record]);

  const refreshWallet=useCallback(async requestAccounts=>{
    try{
      const snapshot=await walletSnapshot({requestAccounts});
      setWallet(snapshot);
      if(snapshot.account)record('WALLET',`${requestAccounts?'Connected':'Detected'} ${snapshot.account} on chain ${snapshot.chainId}`);
      return snapshot;
    }catch(error){if(requestAccounts)showError(error);throw error;}
  },[record,showError]);

  const checkAgent=useCallback(async()=>{
    try{const health=await agentHealth();setAgent(health);setAgentOnline(true);return true;}
    catch{setAgent(null);setAgentOnline(false);return false;}
  },[]);

  useEffect(()=>{
    if(hasInjectedWallet())refreshWallet(false).catch(()=>{});
    checkAgent();
    const interval=setInterval(checkAgent,30000);
    const ethereum=window.ethereum;
    const onAccounts=()=>refreshWallet(false).catch(()=>{});
    const onChain=()=>{setPlan(null);refreshWallet(false).catch(()=>{});};
    ethereum?.on?.('accountsChanged',onAccounts);
    ethereum?.on?.('chainChanged',onChain);
    return ()=>{clearInterval(interval);ethereum?.removeListener?.('accountsChanged',onAccounts);ethereum?.removeListener?.('chainChanged',onChain);};
  },[checkAgent,refreshWallet]);

  const connect=async()=>{await refreshWallet(true);};

  const buildPlan=async input=>{
    setBusy(true);
    try{
      let snapshot=wallet;
      if(!snapshot.account)snapshot=await refreshWallet(true);
      const next=await buildPublicMintPlan({account:snapshot.account,...input});
      setPlan(next);
      setConsoleText(JSON.stringify({...next,value:next.value.toString(),drop:{...next.drop,mintPrice:next.drop.mintPrice.toString()}},null,2));
      record('PLAN',`${next.stage} ${next.quantity} × ${next.nft} for ${next.value} wei`);
      setToast({tone:'ok',message:`Deterministic plan built. Stage: ${next.stage}.`});
    }catch(error){showError(error);}finally{setBusy(false);}
  };

  const sendPlan=async()=>{
    setBusy(true);
    try{
      const result=await sendPublicMintPlan({plan,account:wallet.account,onStatus:setConsoleText});
      setConsoleText(JSON.stringify(result,null,2));
      record('BROADCAST',result.txHash);
      record('CONFIRMED',`${result.txHash}: ${result.proof.minted} NFT transfer(s) proven`);
      setToast({tone:'ok',message:`Confirmed. ${result.proof.minted} NFT mint transfer(s) proven.`});
    }catch(error){showError(error);}finally{setBusy(false);}
  };

  const loadDiscovery=async filters=>{
    setDiscoverBusy(true);
    try{
      const items=await agentDrops(filters);
      setDrops(items);
      record('DISCOVER',`Loaded ${items.length} ${filters.type} drops`);
      setToast({tone:'ok',message:`Loaded ${items.length} drops from the local agent.`});
    }catch(error){showError(error);}finally{setDiscoverBusy(false);}
  };

  const clearActivity=()=>{setActivity([]);localStorage.removeItem('thedadbot.activity');};

  return <div className="app-shell">
    <Sidebar view={view} onView={setView} agentOnline={agentOnline}/>
    <main className="main-shell">
      <Topbar title={title} account={wallet.account} chainId={wallet.chainId} agentOnline={agentOnline} onConnect={connect} onAgentCheck={checkAgent}/>
      <div className="view-frame">
        {view==='overview'&&<Overview account={wallet.account} chainId={wallet.chainId} block={wallet.block} agentOnline={agentOnline} onView={setView}/>} 
        {view==='discover'&&<Discover agentOnline={agentOnline} drops={drops} loading={discoverBusy} onLoad={loadDiscovery}/>} 
        {view==='mint'&&<MintConsole account={wallet.account} plan={plan} onPlan={buildPlan} onSend={sendPlan} busy={busy} consoleText={consoleText}/>} 
        {view==='wallets'&&<Wallets account={wallet.account} chainId={wallet.chainId} onConnect={connect}/>} 
        {view==='automation'&&<Automation agentOnline={agentOnline} agent={agent}/>} 
        {view==='activity'&&<Activity items={activity} onClear={clearActivity}/>} 
      </div>
      <footer className="site-foot"><span>TheDadBot / v1</span><strong>Intent before execution.</strong><span>MIT · open source</span></footer>
    </main>
    <Toast toast={toast} onClose={()=>setToast(null)}/>
  </div>;
}
