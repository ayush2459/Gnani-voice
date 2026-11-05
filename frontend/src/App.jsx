import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";
import "./theme.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function apiRequest(path, options = {}) {
 const response = await fetch(`${API_BASE}${path}`, {
  ...options,
  headers: { "Content-Type": "application/json", ...(options.headers || {}) },
 });
 if (!response.ok) {
  const body = await response.json().catch(() => ({}));
  throw new Error(body.detail || `Request failed (${response.status})`);
 }
 return response.json();
}
function toUiCase(row) {
 const context = row.context || {};
 const statuses = { detected:"In progress", reconciling:"In progress", needs_customer:"Needs customer", resolved:"Resolved", escalated:"Escalated" };
 return {
  id:row.external_transaction_id, dbId:row.id,
  order:row.order_reference || "Order pending",
  customer:context.customer_name || row.customer_reference || "Customer",
  email:context.customer_email || "Not provided",
  amount:Number(context.amount || 0),
  issue:row.description || row.failure_type.replaceAll("_"," "),
  payment:context.payment_status || "Unknown",
  orderState:context.order_status || "Unknown",
  path:context.recovery_path || "Pending assessment",
  status:statuses[row.status] || row.status, rawStatus:row.status,
  age:new Date(row.created_at).toLocaleString(), owner:"RescueFlow",
  priority:row.severity==="high"?"High":"Normal",
  address:context.delivery_address || "Not provided",
  event:row.failure_type, created:new Date(row.created_at).toLocaleString(),
  note:row.description || "Recovery case received from backend."
 };
}
function toUiEvent(row) {
 return {time:new Date(row.created_at).toLocaleTimeString(),title:row.event_type.replaceAll("_"," "),detail:row.message,kind:row.event_type.includes("failed")?"danger":"info"};
}

const seedCases = [
  { id:"RF-2048", order:"ORD-78241", customer:"Aarav Mehta", email:"aarav.m@example.com", amount:2499, issue:"Address not serviceable", payment:"Paid", orderState:"Not created", path:"Voice-assisted", status:"Needs customer", age:"2m", owner:"RescueFlow AI", priority:"High", address:"14, Green Park Extension, New Delhi", event:"payment.succeeded", created:"Today, 10:42 AM", note:"Payment captured successfully, but order creation was blocked by address validation." },
  { id:"RF-2047", order:"ORD-78239", customer:"Mira Kapoor", email:"mira.k@example.com", amount:1899, issue:"Order creation timeout", payment:"Paid", orderState:"Created", path:"Auto recovery", status:"Resolved", age:"8m", owner:"RescueFlow AI", priority:"Normal", address:"B-12, Indiranagar, Bengaluru", event:"order.create.timeout", created:"Today, 10:35 AM", note:"Order state reconciled after a delayed response. No duplicate order was created." },
  { id:"RF-2046", order:"ORD-78236", customer:"Kabir Shah", email:"kabir.s@example.com", amount:799, issue:"Item unavailable", payment:"Authorized", orderState:"Not created", path:"Human escalation", status:"Escalated", age:"14m", owner:"Support · Priya", priority:"High", address:"22, Baner Road, Pune", event:"inventory.unavailable", created:"Today, 10:21 AM", note:"No approved substitute was available. Customer requested support." },
  { id:"RF-2045", order:"ORD-78231", customer:"Ananya Rao", email:"ananya.r@example.com", amount:3299, issue:"Payment status uncertain", payment:"Verifying", orderState:"Not created", path:"Reconciliation", status:"In progress", age:"19m", owner:"RescueFlow AI", priority:"Normal", address:"6, Jubilee Hills, Hyderabad", event:"payment.webhook.delayed", created:"Today, 10:16 AM", note:"Waiting for source-of-truth payment confirmation before taking action." },
  { id:"RF-2044", order:"ORD-78228", customer:"Dev Malhotra", email:"dev.m@example.com", amount:1299, issue:"Delivery slot unavailable", payment:"Paid", orderState:"Not created", path:"Voice-assisted", status:"Needs customer", age:"26m", owner:"RescueFlow AI", priority:"Normal", address:"9, Salt Lake, Kolkata", event:"delivery.slot.unavailable", created:"Today, 10:09 AM", note:"Customer needs to select a valid delivery window." }
];
const initialEvents = [
  {time:"10:42:08", title:"Payment captured", detail:"₹2,499 confirmed by payment ledger.", kind:"success"},
  {time:"10:42:09", title:"Order creation failed", detail:"Address validation returned: service area not supported.", kind:"danger"},
  {time:"10:42:10", title:"Recovery case created", detail:"Event RF-EVT-8831 accepted and deduplicated.", kind:"info"},
  {time:"10:42:11", title:"Source-of-truth reconciliation", detail:"Payment = paid · Order = absent · No retry charge permitted.", kind:"success"},
  {time:"10:42:12", title:"Policy selected voice-assisted recovery", detail:"A customer choice is required to proceed safely.", kind:"warning"}
];
const nav = [{id:"overview",label:"Overview",icon:"▦"},{id:"commerce",label:"Store & checkout",icon:"🛍"},{id:"inbox",label:"Recovery inbox",icon:"▤",count:"5"},{id:"voice",label:"Voice sessions",icon:"◉"},{id:"policies",label:"Recovery policies",icon:"⌘"},{id:"analytics",label:"Analytics",icon:"▥"},{id:"audit",label:"Audit trail",icon:"≋"}];
const statusClass = s => s.toLowerCase().replaceAll(" ","-");
const money = n => "₹"+Number(n).toLocaleString("en-IN");
function Icon({children}){return <span className="nav-icon" aria-hidden="true">{children}</span>}
function Badge({children,tone}){return <span className={"badge "+(tone||statusClass(children))}>{children}</span>}
function Button({children,onClick,kind="primary",disabled=false}){return <button className={"btn "+kind} disabled={disabled} onClick={onClick}>{children}</button>}

function CommerceStore({onComplete,notify}){
 const [products,setProducts]=useState([]),[cart,setCart]=useState({}),[name,setName]=useState("Demo Customer"),[email,setEmail]=useState("customer@example.test"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(null);
 const [session]=useState(()=>{const key="rescueflow_customer_session";let value=localStorage.getItem(key);if(!value){value="rf-web-"+(crypto.randomUUID?.()||Date.now());localStorage.setItem(key,value)}return value});
 useEffect(()=>{apiRequest("/store/products").then(setProducts).catch(e=>setError(e.message))},[]);
 const items=products.filter(p=>(cart[p.id]||0)>0);
 const total=items.reduce((sum,p)=>sum+p.price_paise*cart[p.id],0);
 const qty=(id,delta)=>setCart(prev=>({...prev,[id]:Math.max(0,Math.min(10,(prev[id]||0)+delta))}));
 const checkout=async()=>{
  if(!items.length||busy)return;
  setBusy(true);setError("");setSuccess(null);
  try{
   const order=await apiRequest("/store/checkout/order",{method:"POST",body:JSON.stringify({customer_name:name,customer_email:email,customer_session:session,items:items.map(p=>({product_id:p.id,quantity:cart[p.id]}))})});
   if(!window.Razorpay){
    await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://checkout.razorpay.com/v1/checkout.js";script.onload=resolve;script.onerror=()=>reject(new Error("Razorpay Checkout could not be loaded."));document.body.appendChild(script)});
   }
   const gateway=new window.Razorpay({key:order.key_id,amount:order.amount,currency:order.currency,name:"RescueFlow Demo Store",description:"Razorpay Test Mode order",order_id:order.razorpay_order_id,prefill:{name,email},theme:{color:"#91a88b"},modal:{ondismiss:()=>{setBusy(false);setError("Checkout closed. The order remains payment-pending; check Orders before retrying.")}},handler:async response=>{
    try{
     const verified=await apiRequest("/store/checkout/verify",{method:"POST",body:JSON.stringify({order_id:order.order_id,customer_session:session,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature})});
     setSuccess({orderId:verified.order_id,caseId:verified.recovery_case_id,message:verified.message});
     setCart({});
     onComplete?.(verified);
    }catch(e){setError(e.message+" Do not pay again until the order status has been reconciled.");}
    finally{setBusy(false)}
   }});
   gateway.on("payment.failed",event=>{setError(event?.error?.description||"Test payment failed. Check order status before retrying.");setBusy(false)});
   gateway.open();
  }catch(e){setError(e.message);setBusy(false)}
 };
 return <div className="commerce-page">
  <div className="page-heading"><div><div className="eyebrow">RESCUFLOW TEST COMMERCE / RAZORPAY TEST MODE</div><h1>Store & checkout</h1><p>Create a real provider-side test order, complete test checkout, then observe the post-payment fulfillment failure in the recovery inbox.</p></div><Badge tone="verified">Test environment</Badge></div>
  {error&&<div className="api-warning">{error}</div>}
  {success&&<div className="commerce-success"><b>Payment verified by Razorpay Test Mode</b><p>Order {success.orderId} was persisted. A simulated carrier allocation failure was recorded and a recovery case was opened.</p><Button onClick={()=>onComplete?.(success)}>Open recovery case →</Button></div>}
  <div className="commerce-layout"><section className="commerce-catalog"><div className="panel-head"><div><h2>Demo product catalog</h2><p>Inventory and prices are loaded from PostgreSQL.</p></div></div><div className="commerce-products">{products.map(p=><article className="commerce-product" key={p.id}><img src={p.image_url} alt={p.name} onError={e=>{e.currentTarget.style.display="none"}}/><div className="commerce-product-copy"><b>{p.name}</b><p>{p.description}</p><div><strong>{money(p.price_paise/100)}</strong><small>{p.stock_quantity} in stock</small></div></div><div className="commerce-qty"><button onClick={()=>qty(p.id,-1)} disabled={!cart[p.id]}>−</button><span>{cart[p.id]||0}</span><button onClick={()=>qty(p.id,1)} disabled={(cart[p.id]||0)>=Math.min(10,p.stock_quantity)}>＋</button></div></article>)}</div></section>
  <aside className="panel commerce-checkout"><div className="panel-head"><div><h2>Checkout</h2><p>{items.reduce((n,p)=>n+cart[p.id],0)} items in your cart</p></div></div><label>Customer name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><div className="commerce-cart">{items.map(p=><div key={p.id}><span>{p.name} × {cart[p.id]}</span><b>{money(p.price_paise*cart[p.id]/100)}</b></div>)}{!items.length&&<p>Your cart is empty. Add a product to begin.</p>}</div><div className="commerce-total"><span>Total</span><b>{money(total/100)}</b></div><Button block onClick={checkout} disabled={!items.length||busy||!name.trim()||!email.includes("@")}>{busy?"Opening secure checkout…":"Pay securely with Razorpay →"}</Button><div className="commerce-security">🔒 Card details are entered only in Razorpay Checkout. RescueFlow never receives or stores card number, CVV, PIN or OTP.</div><div className="commerce-demo-note"><b>Post-payment scenario</b><p>After the test payment is verified, RescueFlow records an intentional demo shipment allocation timeout. No real carrier is contacted and no parcel is shipped.</p></div></aside></div>
 </div>
}

function App(){
 const [page,setPage]=useState("overview"),[cases,setCases]=useState([]),[selected,setSelected]=useState(null),[search,setSearch]=useState(""),[filter,setFilter]=useState("All cases"),[toast,setToast]=useState(""),[events,setEvents]=useState([]),[voiceState,setVoiceState]=useState("Ready"),[transcript,setTranscript]=useState([]),[choice,setChoice]=useState(""),[confirmed,setConfirmed]=useState(false),[policies,setPolicies]=useState([{name:"Payment succeeded · Order missing",action:"Reconcile → create order",enabled:true,retries:1,confirm:true},{name:"Address not serviceable",action:"Offer approved address / support",enabled:true,retries:0,confirm:true},{name:"Inventory unavailable",action:"Offer substitute or escalate",enabled:true,retries:0,confirm:true},{name:"Payment status uncertain",action:"Read payment ledger only",enabled:true,retries:2,confirm:false}]),[showEvent,setShowEvent]=useState(false),[eventType,setEventType]=useState("Address not serviceable");
 const notify=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2600)};
 const [apiState,setApiState]=useState("connecting"),[apiError,setApiError]=useState("");
 const [intake,setIntake]=useState({customer:"",email:"",order:"",payment:"paid",orderState:"not_created",issue:"Address not serviceable",amount:"",address:"",description:"",choice:""});
 const setIntakeField=(field,value)=>setIntake(current=>({...current,[field]:value}));
 const loadCases=useCallback(async()=>{
  try {
   setApiState("loading");
   const rows=await apiRequest("/cases");
   const mapped=rows.map(toUiCase);
   setCases(mapped);
   setSelected(current=>current?(mapped.find(c=>c.dbId===current.dbId)||mapped[0]||null):(mapped[0]||null));
   setApiState("online"); setApiError("");
  } catch(error){setApiState("offline");setApiError(error.message);}
 },[]);
 useEffect(()=>{loadCases();},[loadCases]);
 const loadCaseEvents=useCallback(async(caseId)=>{
  if(!caseId)return;
  try {const rows=await apiRequest(`/cases/${caseId}/events`);setEvents(rows.map(toUiEvent));}
  catch(error){setApiError(error.message);}
 },[]);
 useEffect(()=>{if(selected?.dbId)loadCaseEvents(selected.dbId);},[selected?.dbId,loadCaseEvents]);
 const filtered=useMemo(()=>cases.filter(c=>(filter==="All cases"||c.status===filter)&&[c.id,c.order,c.customer,c.issue].join(" ").toLowerCase().includes(search.toLowerCase())),[cases,filter,search]);
 const selectCase=c=>{setSelected(c);setPage("case");setChoice("");setConfirmed(false)};
 const addTimeline=(title,detail,kind="info")=>setEvents(e=>[...e,{time:new Date().toLocaleTimeString("en-GB",{hour12:false}),title,detail,kind}]);
 const demoOrders = [
  {customer:"Aarav Mehta",email:"aarav.m@example.test",amount:2499,issue:"Address not serviceable",payment:"paid",order:"not_created",severity:"high",address:"14, Green Park Extension, New Delhi",choice:"Alternate serviceable address or support",description:"Payment was captured, but order creation stopped because the delivery address is outside the service area."},
  {customer:"Mira Kapoor",email:"mira.k@example.test",amount:1899,issue:"Order creation timeout",payment:"paid",order:"unknown",severity:"medium",address:"B-12, Indiranagar, Bengaluru",choice:"No customer action until order lookup completes",description:"Order creation timed out after payment. Reconcile the order ledger before any retry to avoid a duplicate."},
  {customer:"Kabir Shah",email:"kabir.s@example.test",amount:799,issue:"Item unavailable",payment:"authorized",order:"not_created",severity:"high",address:"22, Baner Road, Pune",choice:"Approved substitute or human support",description:"Inventory reservation failed after payment authorization. Do not capture again or substitute without approval."},
  {customer:"Ananya Rao",email:"ananya.r@example.test",amount:3299,issue:"Payment status uncertain",payment:"unknown",order:"not_created",severity:"medium",address:"6, Jubilee Hills, Hyderabad",choice:"Wait for payment source-of-truth confirmation",description:"Payment webhook is delayed. Check the payment provider before creating an order or initiating a refund."},
  {customer:"Dev Malhotra",email:"dev.m@example.test",amount:1299,issue:"Delivery slot unavailable",payment:"paid",order:"not_created",severity:"medium",address:"9, Salt Lake, Kolkata",choice:"Choose another available delivery slot",description:"Payment succeeded, but the selected delivery slot is no longer available. Ask the customer to choose a valid slot."}
 ];
 const createDemoBatch=async()=>{
  const failureMap={"Address not serviceable":"address_not_serviceable","Payment status uncertain":"payment_status_uncertain","Item unavailable":"inventory_unavailable","Delivery slot unavailable":"delivery_slot_unavailable","Order creation timeout":"order_creation_timeout"};
  const created=[];
  try {
   for(let index=0;index<demoOrders.length;index++){
    const demo=index===0?{...demoOrders[index],customer:intake.customer||demoOrders[index].customer,email:intake.email||demoOrders[index].email,amount:Number(intake.amount)||demoOrders[index].amount,issue:intake.issue||demoOrders[index].issue,payment:intake.payment||demoOrders[index].payment,order:intake.orderState||demoOrders[index].order,address:intake.address||demoOrders[index].address,choice:intake.choice||demoOrders[index].choice,description:intake.description||demoOrders[index].description}:demoOrders[index];
    const now=Date.now()+index;
    const row=await apiRequest("/cases",{method:"POST",body:JSON.stringify({
     external_transaction_id:"RF-DEMO-"+(index+1)+"-"+now,
     customer_reference:"DEMO-CUSTOMER-"+(index+1),
     order_reference:index===0?(intake.order||"ORD-DEMO-78241"):"ORD-DEMO-"+String(78241+index),
     payment_reference:"PAY-DEMO-"+(index+1),
     failure_type:failureMap[demo.issue]||"order_creation_failed",
     severity:demo.severity,
     description:demo.description,
     context:{synthetic:true,demo_order:true,demo_index:index+1,customer_name:demo.customer,customer_email:demo.email,amount:demo.amount,payment_status:demo.payment,order_status:demo.order,recovery_path:"Pending assessment",delivery_address:demo.address,customer_choice_needed:demo.choice,never_retry_payment:true}
    })});
    created.push(row);
   }
   await loadCases();
   setShowEvent(false);
   setSelected(toUiCase(created[0]));
   setPage("case");
   await loadCaseEvents(created[0].id);
   notify("5 synthetic demo orders saved to PostgreSQL.");
  } catch(error){
   await loadCases();
   notify("Demo batch stopped: "+error.message+". Earlier saved cases remain; nothing was retried.");
  }
 };
 const reconcile=async()=>{
  if(!selected?.dbId)return;
  await loadCaseEvents(selected.dbId);
  notify("Persisted case history refreshed. External payment/order checks are not connected.");
 };
 const resolve=()=>{
  notify("Recovery execution is disabled until payment and order adapters verify the final state.");
 };
 const escalate=()=>{
  notify("Escalation endpoint is not implemented; no handoff has been recorded.");
 };
 const startVoice=()=>{setPage("voice");setVoiceState("Connected (demo)");setTranscript([{speaker:"RescueFlow",text:"Hi Aarav. Your payment of ₹2,499 went through, but we couldn't create the order because this address is outside our delivery area."},{speaker:"Customer",text:"Can I use another address?"},{speaker:"RescueFlow",text:"Yes. I can try another serviceable address, or connect you to support for a refund review. Which would you prefer?"}]);};
 const togglePolicy=i=>setPolicies(prev=>prev.map((p,j)=>j===i?{...p,enabled:!p.enabled}:p));
 const pageTitle=page==="case"?"Transaction details":nav.find(n=>n.id===page)?.label||"Overview";
 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark"><span>↗</span></div><div><b>RescueFlow</b><small>TRANSACTION RECOVERY</small></div></div>
   <div className="workspace"><div className="workspace-dot">●</div><div><b>Commerce workspace</b><small>Demo environment</small></div><span className="chevron">⌄</span></div>
   <div className="nav-caption">WORKSPACE</div>
   <nav>{nav.map(n=><button key={n.id} onClick={()=>setPage(n.id)} className={"nav-link "+(page===n.id?"active":"")}><Icon>{n.icon}</Icon>{n.label}{n.count&&<span className="nav-count">{n.count}</span>}</button>)}</nav>
   <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><b>Need a hand?</b><p>Explore the recovery playbook or get help from your team.</p><button onClick={()=>notify("Help center is available in the full deployment.")}>Open help center ↗</button></div><div className="profile"><div className="avatar">US</div><div><b>Operations admin</b><small>Operations admin</small></div><button aria-label="Profile menu" onClick={()=>notify("Profile settings · demo")}>•••</button></div></div>
  </aside>
  <main className="main">
   <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>{pageTitle}</b></div><div className="top-actions"><span className="environment"><i/> {apiState==="online"?"API connected":apiState==="offline"?"API offline":"Connecting…"}</span><button className="icon-btn" aria-label="Notifications" onClick={()=>notify("You're all caught up.")}>♧<i className="notification-dot"/></button><div className="top-avatar">US</div></div></header>
   <div className="content">
    {page==="commerce"&&<CommerceStore notify={notify} onComplete={()=>{loadCases();notify("Payment verified. Refreshing recovery inbox.");setPage("inbox")}}/>}\n    {page==="overview"&&<><div className="page-heading"><div><div className="eyebrow">TUESDAY, NOVEMBER 3, 2026 <span className="live-dot"/> LIVE DEMO</div><h1>Welcome to RescueFlow <span className="wave">✦</span></h1><p>Here’s what’s happening across your transaction recovery workflows.</p></div><Button onClick={()=>setPage("commerce")}>＋ Create test order</Button></div>
     <div className="metric-grid">{[{label:"Detected cases",value:cases.length,delta:"+12.8%",note:"vs. previous period",icon:"◈",color:"blue"},{label:"Verified recoveries",value:cases.filter(c=>c.status==="Resolved").length,delta:"↑ 8.4%",note:"of eligible cases",icon:"✓",color:"green"},{label:"Recovery rate",value:"72.4%",delta:"+4.2%",note:"verified only",icon:"↗",color:"purple"},{label:"Median resolution",value:"3m 42s",delta:"−18%",note:"time to resolution",icon:"◷",color:"orange"}].map(m=><div className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><div className={"metric-icon "+m.color}>{m.icon}</div></div><div className="metric-value">{m.value}</div><div className="metric-foot"><b className={m.color}>{m.delta}</b><span>{m.note}</span></div></div>)}</div>
     <div className="overview-grid"><section className="panel trend-panel"><div className="panel-head"><div><h2>Recovery performance</h2><p>Verified cases over the last 7 days</p></div><select aria-label="Chart period"><option>Last 7 days</option><option>Last 30 days</option></select></div><div className="chart-legend"><span><i className="legend-blue"/>Detected</span><span><i className="legend-green"/>Recovered</span><b>72.4% <small>recovery rate</small></b></div><div className="chart"><div className="y-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 700 205" preserveAspectRatio="none" role="img" aria-label="Detected and recovered cases trend"><defs><linearGradient id="blueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b5c8ad" stopOpacity=".24"/><stop offset="100%" stopColor="#b5c8ad" stopOpacity="0"/></linearGradient></defs><path d="M0 150 C55 135 65 92 115 112 S175 65 225 90 S285 54 335 72 S390 25 445 58 S510 50 555 37 S625 30 700 14 L700 205 L0 205Z" fill="url(#blueFill)"/><path d="M0 150 C55 135 65 92 115 112 S175 65 225 90 S285 54 335 72 S390 25 445 58 S510 50 555 37 S625 30 700 14" fill="none" stroke="#8fa58b" strokeWidth="3" strokeLinecap="round"/><path d="M0 177 C55 168 65 138 115 151 S175 116 225 137 S285 105 335 122 S390 80 445 109 S510 99 555 85 S625 82 700 63" fill="none" stroke="#89ad94" strokeWidth="3" strokeLinecap="round"/></svg><div className="x-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div></section>
      <section className="panel issue-panel"><div className="panel-head"><div><h2>Cases by issue</h2><p>Where recovery is needed</p></div><button className="dots" onClick={()=>setPage("analytics")}>•••</button></div><div className="donut-wrap"><div className="donut"><div><b>128</b><small>Total cases</small></div></div><div className="issue-legend"><div><i className="c1"/>Address validation <b>38%</b></div><div><i className="c2"/>Payment uncertainty <b>26%</b></div><div><i className="c3"/>Inventory issue <b>21%</b></div><div><i className="c4"/>Other <b>15%</b></div></div></div></section></div>
     <section className="panel recent-panel"><div className="panel-head"><div><h2>Recent recovery cases</h2><p>Monitor the latest exceptions and outcomes</p></div><button className="text-link" onClick={()=>setPage("inbox")}>View all cases <span>→</span></button></div><CaseTable rows={cases.slice(0,4)} onSelect={selectCase}/>{apiState==="offline"&&<div className="api-warning">Backend unavailable: {apiError}. Start FastAPI and refresh.</div>}{apiState==="online"&&!cases.length&&<div className="api-warning">No recovery cases in PostgreSQL. Use Store & checkout to create a Razorpay test order and trigger a shipment recovery incident.</div>}</section>
     <div className="trust-note"><span>✦</span><div><b>Safety-first recovery</b><p>RescueFlow verifies backend state before resolving a case. Demo metrics and seeded transactions are synthetic.</p></div><button onClick={()=>setPage("policies")}>Review policies →</button></div>
    </>}
    {page==="inbox"&&<><div className="page-heading"><div><div className="eyebrow">OPERATIONS</div><h1>Recovery inbox</h1><p>Find, triage, and resolve transaction exceptions.</p></div><Button onClick={()=>setShowEvent(true)}>＋ Create 5 demo orders</Button></div><section className="panel inbox-panel"><div className="inbox-toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cases, orders, customers…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All cases</option>{["Needs customer","Resolved","Escalated","In progress"].map(x=><option key={x}>{x}</option>)}</select><button className="filter-btn" onClick={()=>{setFilter("All cases");setSearch("")}}>↻ Reset</button></div><CaseTable rows={filtered} onSelect={selectCase}/>{apiState==="offline"&&<div className="api-warning">Backend unavailable: {apiError}</div>}<div className="table-footer">Showing {filtered.length} of {cases.length} cases <span>Updated just now</span></div></section></>}
    {page==="case"&&!selected&&<section className="panel"><div className="empty-state"><b>No recovery case selected</b><p>Create a synthetic case or choose one from the inbox.</p><Button onClick={()=>setPage("inbox")}>Go to inbox</Button></div></section>}
    {page==="case"&&selected&&<><div className="case-back"><button onClick={()=>setPage("inbox")}>← Back to inbox</button><span>Case ID: {selected.id}</span></div><div className="page-heading case-heading"><div><div className="eyebrow">TRANSACTION RECOVERY <Badge tone={statusClass(selected.status)}>{selected.status}</Badge></div><h1>{selected.issue}</h1><p>{selected.order} <span className="dot-sep">·</span> {selected.customer} <span className="dot-sep">·</span> Created {selected.created}</p></div><div className="heading-actions"><Button kind="secondary" onClick={reconcile}>↻ Reconcile</Button><Button onClick={startVoice}>◉ Start voice session</Button></div></div>
      <div className="case-layout"><div className="case-main"><section className="panel facts-panel"><div className="panel-head"><div><h2>Source-of-truth facts</h2><p>Verified against connected services</p></div><Badge tone="verified">● Reconciled</Badge></div><div className="facts-grid"><Fact label="Payment state" value={selected.payment} good={selected.payment==="Paid"}/><Fact label="Order state" value={selected.orderState} good={selected.orderState==="Created"}/><Fact label="Transaction amount" value={money(selected.amount)}/><Fact label="Recovery path" value={selected.path}/><Fact label="Customer" value={selected.customer}/><Fact label="Delivery address" value={selected.address}/></div><div className="safe-banner"><span>✓</span><div><b>Payment is safe — no second charge will be made.</b><p>The event is not treated as the source of truth. Current payment and order state were checked before recovery.</p></div></div></section>
       <section className="panel timeline-panel"><div className="panel-head"><div><h2>Case timeline</h2><p>Event history and recovery actions</p></div><button className="text-link" onClick={()=>setPage("audit")}>View audit trail →</button></div><div className="timeline">{events.map((e,i)=><div className="timeline-row" key={i}><div className={"timeline-icon "+e.kind}>{e.kind==="success"?"✓":e.kind==="danger"?"×":e.kind==="warning"?"!":"·"}</div><div className="timeline-content"><b>{e.title}</b><p>{e.detail}</p></div><time>{e.time}</time></div>)}</div></section>
       <section className="panel recovery-panel"><div className="panel-head"><div><h2>Recovery action</h2><p>Only backend-approved actions are available.</p></div><Badge tone="needs-customer">Customer choice</Badge></div><div className="choice-list">{["Try another serviceable address","Connect me to support / refund review"].map(c=><label className={"choice "+(choice===c?"selected":"")} key={c}><input type="radio" name="recoveryChoice" value={c} checked={choice===c} onChange={()=>{setChoice(c);setConfirmed(false)}}/><span className="radio-ui"/><span><b>{c}</b><small>{c.startsWith("Try")?"Validate address before creating the order.":"Create a support handoff; no automatic refund is issued."}</small></span></label>)}</div>{choice&&<label className="confirm-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this customer-approved choice.</label>}<div className="action-row"><Button kind="secondary" onClick={escalate}>Escalate to human</Button><Button onClick={resolve} disabled={!choice||!confirmed}>Execute & verify →</Button></div><p className="fine-print">Execution is simulated in this demo. A real deployment must validate the choice and verify final state through the backend.</p></section></div>
       <aside className="case-side"><section className="panel side-card"><div className="side-title"><span className="side-symbol">✧</span><div><b>Policy decision</b><small>Deterministic rules engine</small></div></div><div className="policy-callout"><Badge tone="needs-customer">Voice-assisted</Badge><p>Customer input is required because the delivery address is not serviceable.</p></div><div className="side-detail"><span>Selected rule</span><b>Address not serviceable</b></div><div className="side-detail"><span>Allowed actions</span><b>Alternate address · Support handoff</b></div><div className="side-detail"><span>Retry limit</span><b>0 automatic retries</b></div><div className="side-detail"><span>Confirmation</span><b>Required before write</b></div></section><section className="panel side-card"><div className="panel-head"><h2>Customer</h2><button className="dots" onClick={()=>notify("Customer details are masked in demo.")}>•••</button></div><div className="customer-line"><div className="avatar customer-avatar">{selected.customer.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><div><b>{selected.customer}</b><small>{selected.email}</small></div></div><div className="side-detail"><span>Contact preference</span><b>Voice · Consent recorded</b></div><button className="outline-full" onClick={startVoice}>◉ Open voice session</button></section><section className="privacy-card"><span>♧</span><div><b>Privacy by design</b><p>Payment credentials are never stored. Sensitive values are redacted from audit logs.</p></div></section></aside></div></>}
    {page==="voice"&&<><div className="page-heading"><div><div className="eyebrow">CUSTOMER CONVERSATION</div><h1>Voice session</h1><p>Case {selected.id} <span className="dot-sep">·</span> {selected.customer}</p></div><div className="heading-actions"><Badge tone={voiceState.startsWith("Connected")?"verified":"neutral"}>{voiceState}</Badge><Button kind="secondary" onClick={()=>{setVoiceState("Ended");notify("Session ended");}}>■ End session</Button><Button kind="secondary" onClick={escalate}>⇢ Transfer</Button></div></div><div className="voice-layout"><section className="panel voice-stage"><div className="voice-topline"><span className="voice-live"><i/> DEMO SESSION</span><span>00:01:42</span></div><div className="voice-orb"><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><div className="orb-core">◉</div></div><h2>{voiceState==="Ended"?"Session ended":"RescueFlow voice assistant"}</h2><p>{voiceState==="Ended"?"Conversation saved to the case timeline.":"Speaking only when a customer decision is needed."}</p><div className="waveform">{Array.from({length:42},(_,i)=><i key={i} style={{height:(8+Math.abs(Math.sin(i*1.73))*31)+"px"}}/>)}</div><div className="voice-controls"><button onClick={()=>notify("Microphone muted in demo mode.")}>♩<small>Mute</small></button><button onClick={()=>notify("Keypad is unavailable in demo mode.")}>▦<small>Keypad</small></button><button className="hangup" onClick={()=>{setVoiceState("Ended");notify("Session ended");}}>☎<small>End call</small></button></div><div className="demo-disclaimer">Demo transcript only · No live call or audio stream is connected.</div></section><section className="panel transcript-panel"><div className="panel-head"><div><h2>Conversation transcript</h2><p>Speaker-labelled · demo content</p></div><Badge tone="neutral">English</Badge></div><div className="transcript">{transcript.length?transcript.map((t,i)=><div className={"utterance "+(t.speaker==="Customer"?"customer-utterance":"")} key={i}><span>{t.speaker==="Customer"?"AM":"✦"}</span><div><b>{t.speaker}</b><p>{t.text}</p><small>{i===0?"10:42:18":i===1?"10:42:31":"10:42:38"}</small></div></div>):<div className="empty-state"><span>◉</span><b>No transcript yet</b><p>Start a demo conversation to see the transcript.</p><Button onClick={startVoice}>Load demo conversation</Button></div>}</div><div className="intent-box"><div><span>DETECTED INTENT</span><b>Choose alternate delivery option</b></div><Badge tone="verified">0.96 confidence</Badge></div><div className="confirmed-fields"><b>Confirmed fields</b><p><span>✓</span> Payment amount · ₹2,499 <span className="field-pending">○</span> Alternate address · Pending</p></div></section></div></>}
    {page==="policies"&&<><div className="page-heading"><div><div className="eyebrow">SAFETY & CONTROL</div><h1>Recovery policies</h1><p>Configure deterministic rules that decide what RescueFlow is allowed to do.</p></div><Button onClick={()=>notify("Policy editor is available in the connected backend.")}>＋ New policy</Button></div><div className="policy-banner"><span>⚑</span><div><b>Policy engine governs every write action.</b><p>AI can interpret customer language, but it cannot independently authorize financial or order changes.</p></div></div><section className="panel policies-panel"><div className="panel-head"><div><h2>Active policy rules</h2><p>Changes should be audited and reviewed before deployment.</p></div><Badge tone="verified">{policies.filter(p=>p.enabled).length} enabled</Badge></div>{policies.map((p,i)=><div className="policy-row" key={p.name}><div className="policy-number">{String(i+1).padStart(2,"0")}</div><div className="policy-info"><b>{p.name}</b><p>{p.action}</p><div className="policy-tags"><span>Retry limit: {p.retries}</span><span>{p.confirm?"Confirmation required":"Read-only"}</span></div></div><button className={"switch "+(p.enabled?"on":"")} role="switch" aria-checked={p.enabled} onClick={()=>togglePolicy(i)}><i/></button></div>)}</section><div className="policy-footnote">Policy changes are local to this prototype and are not persisted to a production service.</div></>}
    {page==="analytics"&&<><div className="page-heading"><div><div className="eyebrow">MEASURE WHAT MATTERS</div><h1>Recovery analytics</h1><p>Understand outcomes, customer experience, and operational efficiency.</p></div><Button kind="secondary" onClick={()=>notify("Demo report prepared (synthetic data).")}>⇩ Export report</Button></div><div className="metric-grid analytics-metrics">{[{label:"Eligible cases",value:"94",note:"Can be safely recovered",icon:"◈",color:"blue"},{label:"Verified recovery rate",value:"72.4%",note:"Backend-confirmed outcomes",icon:"✓",color:"green"},{label:"Voice completion",value:"81.6%",note:"Customer sessions completed",icon:"◉",color:"purple"},{label:"Human handoff rate",value:"11.2%",note:"Escalated with context",icon:"⇢",color:"orange"}].map(m=><div className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><div className={"metric-icon "+m.color}>{m.icon}</div></div><div className="metric-value">{m.value}</div><div className="metric-foot"><span>{m.note}</span></div></div>)}</div><div className="overview-grid"><section className="panel"><div className="panel-head"><div><h2>Resolution time by path</h2><p>Median time · minutes</p></div></div><div className="bar-chart">{[["Auto recovery",2.1],["Voice-assisted",4.8],["Human handoff",12.6],["Reconciliation",3.4]].map(([name,val])=><div className="bar-row" key={name}><span>{name}</span><div className="bar-track"><i style={{width:(val/13*100)+"%"}}/></div><b>{val}m</b></div>)}</div></section><section className="panel"><div className="panel-head"><div><h2>Quality & safety</h2><p>Demo acceptance checks</p></div></div><div className="quality-list">{[["Incorrect success claims","0","Target: 0"],["Duplicate write actions","0","Target: 0"],["Confirmed consequential choices","100%","Required"],["Verified final state","100%","Before resolution"]].map(x=><div key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></div>)}</div></section></div><div className="synthetic-note">ⓘ All analytics shown here are illustrative, seeded demo data—not production outcomes.</div></>}
    {page==="audit"&&<><div className="page-heading"><div><div className="eyebrow">TRACEABILITY</div><h1>Audit trail</h1><p>A clear record of event ingestion, policy decisions, and recovery actions.</p></div><Button kind="secondary" onClick={()=>notify("Audit export is simulated.")}>⇩ Export log</Button></div><section className="panel audit-panel"><div className="inbox-toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search audit events…"/></div><Badge tone="neutral">Redacted view</Badge></div><div className="audit-list">{events.filter(e=>(e.title+" "+e.detail).toLowerCase().includes(search.toLowerCase())).map((e,i)=><div className="audit-row" key={i}><div className={"audit-mark "+e.kind}>{e.kind==="success"?"✓":e.kind==="danger"?"×":"·"}</div><div><b>{e.title}</b><p>{e.detail}</p><small>CASE {selected.id} · actor: RescueFlow policy engine</small></div><time>{e.time}</time></div>)}</div><div className="audit-footer">Sensitive customer and payment values are masked. Correlation IDs are retained for traceability.</div></section></>}
   </div>
  </main>
  {toast&&<div className="toast"><span>✓</span>{toast}</div>}
 </div>
}
function Fact({label,value,good}){return <div className="fact"><span>{label}</span><b>{value}{good&&<i>✓</i>}</b></div>}
function CaseTable({rows,onSelect}){return <div className="table-wrap"><table><thead><tr><th>CASE / ORDER</th><th>CUSTOMER</th><th>ISSUE TYPE</th><th>PAYMENT</th><th>RECOVERY PATH</th><th>STATUS</th><th>AGE</th><th></th></tr></thead><tbody>{rows.map(c=><tr key={c.id} onClick={()=>onSelect(c)}><td><b className="case-id">{c.id}</b><small>{c.order}</small></td><td><b>{c.customer}</b><small>{c.email}</small></td><td>{c.issue}</td><td><Badge tone={c.payment==="Paid"?"verified":"neutral"}>{c.payment}</Badge></td><td>{c.path}</td><td><Badge tone={statusClass(c.status)}>{c.status}</Badge></td><td>{c.age}</td><td><button className="row-arrow" aria-label={"Open "+c.id} onClick={e=>{e.stopPropagation();onSelect(c)}}>→</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty-table">No cases match your search.</div>}</div>}
export default App;
