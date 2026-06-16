import { useState, useEffect, useRef, useCallback } from "react";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwtjTq25C0pURGGNsPMJ76iAbpzM3R9awJmswQUsQb1NrEG790gZc-_gsvPoXOTcCab/exec";

const LOOKER_STUDIO_URL =
  "https://datastudio.google.com/reporting/c1d52161-5387-4f00-bcda-b70b54116fc5/page/p_h1rlukz72d";

// ── QUIZ_SETS ─────────────────────────────────────────────
const QUIZ_SETS = [
  { id:"EQ-BASIC5", name:"สมการ ป.6 เข้า ม.1 สมการ เงิน คน สัตว์", total:10, passingScore:8, timeLimit:30*60 },
  { id:"EQ-BASIC4", name:"สมการ ป.6 เข้า ม.1 สมการ ไม่มีโจทย์", total:10, passingScore:8, timeLimit:30*60 },
  { id:"EQ-BASIC3", name:"สมการ ป.6 เข้า ม.1 สมการ เศษส่วน", total:10, passingScore:8, timeLimit:30*60 },
  { id:"EQ-BASIC2", name:"สมการ ป.6 เข้า ม.1 สมการ วงเล็บ", total:10, passingScore:8, timeLimit:30*60 },
  { id:"EQ-BASIC1", name:"สมการ ป.6 เข้า ม.1 สมการ ย้ายห่าง", total:10, passingScore:8, timeLimit:30*60 },
  { id:"SPR-164", name:"Pre Test สายปัญญารังสิต ม.1 2564", total:20, passingScore:16, timeLimit:60*60 },
  { id:"SPR-166", name:"Pre Test สายปัญญารังสิต ม.1 2566", total:20, passingScore:16, timeLimit:60*60 },
  { id:"SKR-166", name:"Pre Test สวนกุหลาบรังสิต ม.1 2566", total:40, passingScore:32, timeLimit:120*60 },
  { id:"SPR-266", name:"ทบทวน Pre Test สายปัญญารังสิต ม.1 2566", total:10, passingScore:8, timeLimit:30*60 },
  { id:"JP-165", name:"Pre Test จุฬาภรณ์ ม.1 2565", total:27, passingScore:36, timeLimit:90*60 },
  { id:"FT-BASIC1", name:"ตัวประกอบ ป.6 เข้า ม.1 ตัวประกอบ ตัวประกอบ + จำนวนเฉพาะ", total:10, passingScore:8, timeLimit:30*60 },
  { id:"FT-BASIC2", name:"ตัวประกอบ ป.6 เข้า ม.1 ตัวประกอบ ห.ร.ม. ไม่มีโจทย์", total:10, passingScore:8, timeLimit:30*60 },
  { id:"FT-BASIC3", name:"ตัวประกอบ ป.6 เข้า ม.1 ตัวประกอบ แบ่งของ + สี่เหลี่ยม 2 อัน", total:10, passingScore:8, timeLimit:30*60 },
  { id:"FR-BASIC1", name:"เศษส่วน ป.6 เข้า ม.1 โจทย์ยอดนิยม เศษส่วน", total:10, passingScore:8, timeLimit:30*60 },
  { id:"SKR-166-BB", name:"Pre Test สวนกุหลาบรังสิต ม.1 2566 สำหรับบาร์บี้", total:20, passingScore:16, timeLimit:60*60 },
];

const DEFAULT_THEME = {
  logoEmoji:"⚔", themeColor:"#d4af37", fontSize:"22px",
  bgColor:"#0d0803", bgImageUrl:"",
};

function getSetFromUrl() {
  try { return new URLSearchParams(window.location.search).get("set") || null; }
  catch { return null; }
}

async function apiGet(params: any) {
  const query = new URLSearchParams(
    Object.entries(params).reduce((acc,[k,v]) => { acc[k]=String(v); return acc; }, {})
  );
  const res = await fetch(`${APPS_SCRIPT_URL}?${query}`);
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, { method:"POST", body:JSON.stringify(body) });
  return res.json();
}

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function selectQuestions(questions, count) {
  const groups={};
  questions.forEach(q=>{if(!groups[q.groupId])groups[q.groupId]=[];groups[q.groupId].push(q);});
  return shuffle(Object.values(groups).map((g: any)=>g[Math.floor(Math.random()*g.length)])).slice(0,count);
}

function orderQuestions(questions, count) {
  const groups = {};
  const groupOrder = [];
  questions.forEach(q => {
    if (!groups[q.groupId]) { groups[q.groupId] = []; groupOrder.push(q.groupId); }
    groups[q.groupId].push(q);
  });
  return groupOrder.map(gid => { const g = groups[gid]; return g[Math.floor(Math.random()*g.length)]; }).slice(0, count);
}

function formatTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
}

function buildTheme(cfg) {
  if(!cfg) return DEFAULT_THEME;
  return {...DEFAULT_THEME,...cfg};
}

function calcTotalScore(results) {
  return results.reduce((sum, r) => sum + (r.isCorrect ? (r.question.points ?? 1) : 0), 0);
}

function calcMaxScore(questions) {
  return questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
}

function normalizeNumber(str) {
  if(!str && str!==0) return null;
  const s = String(str).trim().replace(/,/g,".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function checkTextAnswer(userInput, correctAnswer) {
  const u = normalizeNumber(userInput);
  const c = normalizeNumber(correctAnswer);
  if(u !== null && c !== null) return u === c;
  return String(userInput).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
}

// ── getFastImageUrl (same as Apps Script) ────────────────
function getFastImageUrl(fileId) {
  if (!fileId) return "";
  let id = String(fileId).trim();
  if (id.includes("/d/")) id = id.split("/d/")[1].split("/")[0];
  else if (id.includes("id=")) id = id.split("id=")[1].split("&")[0];
  return `https://lh3.googleusercontent.com/d/${id}`;
}

// ── Particles ─────────────────────────────────────────────
function Particles({ color }) {
  const pts = useRef([...Array(18)].map(()=>({
    w:Math.random()*2.5+0.5, l:Math.random()*100, t:Math.random()*100,
    d:Math.random()*8+6, delay:Math.random()*6,
  }))).current;
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      {pts.map((p,i)=>(
        <div key={i} style={{
          position:"absolute",width:p.w+"px",height:p.w+"px",
          borderRadius:"50%",background:color+"55",
          left:p.l+"%",top:p.t+"%",
          animation:`pfloat ${p.d}s ease-in-out ${p.delay}s infinite`,
        }}/>
      ))}
    </div>
  );
}

function TimerBar({ timeLeft, totalTime, color }) {
  const pct=(timeLeft/totalTime)*100;
  const c=pct>50?color:pct>20?"#e67e22":"#e74c3c";
  return (
    <div style={{width:"100%",height:"5px",background:"rgba(255,255,255,0.08)",borderRadius:"3px",overflow:"hidden"}}>
      <div style={{height:"100%",width:pct+"%",background:c,borderRadius:"3px",
        transition:"width 1s linear,background .5s",boxShadow:`0 0 6px ${c}`}}/>
    </div>
  );
}

function Spinner({ color }) {
  return (
    <div style={{textAlign:"center",padding:"40px 0"}}>
      <div style={{width:"36px",height:"36px",borderRadius:"50%",margin:"0 auto 14px",
        border:`3px solid ${color}33`,borderTopColor:color,animation:"pspin .8s linear infinite"}}/>
      <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"12px"}}>กำลังโหลด...</p>
    </div>
  );
}

// ── CHARACTER POPUP ───────────────────────────────────────
// แสดงรูปตัวละคร + ข้อความ พร้อม animation เด้งขึ้นมา
// status: "pass" | "fail" | "perfect"
function CharacterPopup({ charData, status, onClose, tc }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // เด้งขึ้นมาหลัง 300ms (ให้ result render ก่อน)
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => onClose(), 400);
  };

  if (!charData) return null;

  let imageId = "";
  let message = "";
  if (status === "perfect") {
    imageId = charData.perfectImageId || charData.passImageId || "";
    message = charData.perfectMsg || charData.passMsg || "เยี่ยมมาก! ได้เต็มทุกข้อ! 🌟";
  } else if (status === "pass") {
    imageId = charData.passImageId || "";
    message = charData.passMsg || "ผ่านแล้ว! ยอดเยี่ยม! 🎉";
  } else {
    imageId = charData.failImageId || "";
    message = charData.failMsg || "ยังไม่ผ่าน สู้ต่อไปนะ! 💪";
  }

  const imageUrl = getFastImageUrl(imageId);

  // สีตาม status
  const statusColor = status === "perfect" ? "#f1c40f"
    : status === "pass" ? "#27ae60"
    : "#e74c3c";

  const statusGlow = status === "perfect" ? "rgba(241,196,15,0.6)"
    : status === "pass" ? "rgba(39,174,96,0.5)"
    : "rgba(231,76,60,0.4)";

  return (
    <div
      onClick={handleClose}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,0.75)",
        backdropFilter:"blur(4px)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"20px",
        opacity: visible && !closing ? 1 : 0,
        transition:"opacity 0.4s ease",
        cursor:"pointer",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth:"360px", width:"100%",
          background:"linear-gradient(160deg,rgba(20,12,5,.98),rgba(38,22,8,.98))",
          border:`2px solid ${statusColor}66`,
          borderRadius:"20px",
          padding:"28px 24px 24px",
          boxShadow:`0 0 60px ${statusGlow}, 0 20px 60px rgba(0,0,0,.9)`,
          position:"relative",
          transform: visible && !closing ? "translateY(0) scale(1)" : "translateY(60px) scale(0.85)",
          opacity: visible && !closing ? 1 : 0,
          transition:"transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease",
          textAlign:"center",
          cursor:"default",
        }}
      >
        {/* ปุ่มปิด */}
        <button
          onClick={handleClose}
          style={{
            position:"absolute", top:"12px", right:"14px",
            background:"none", border:"none",
            color:"#6b5a3e", fontSize:"20px",
            cursor:"pointer", lineHeight:1, padding:"4px",
          }}
        >×</button>

        {/* Status badge */}
        <div style={{
          display:"inline-block",
          background:`linear-gradient(135deg,${statusColor}33,${statusColor}11)`,
          border:`1px solid ${statusColor}66`,
          borderRadius:"20px", padding:"4px 16px",
          fontSize:"12px", color:statusColor,
          fontFamily:"'Cinzel',serif", fontWeight:700,
          marginBottom:"16px",
          boxShadow:`0 0 12px ${statusColor}44`,
        }}>
          {status === "perfect" ? "★ ได้เต็ม!" : status === "pass" ? "✓ ผ่านแล้ว!" : "✗ ยังไม่ผ่าน"}
        </div>

        {/* รูปตัวละคร */}
        {imageUrl && (
          <div style={{
            margin:"0 auto 16px",
            width:"200px", height:"200px",
            borderRadius:"16px",
            overflow:"hidden",
            border:`2px solid ${statusColor}44`,
            boxShadow:`0 0 30px ${statusColor}33`,
            background:"rgba(0,0,0,0.3)",
          }}>
            <img
              src={imageUrl}
              alt="character"
              style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}}
              onError={e => { (e.target as any).style.display="none"; }}
            />
          </div>
        )}

        {/* ข้อความ */}
        <p style={{
          color:"#f5e6c8",
          fontFamily:"'Sarabun',sans-serif",
          fontSize:"18px",
          lineHeight:1.6,
          margin:"0 0 20px",
          textShadow:`0 0 10px ${statusColor}44`,
        }}>
          {message}
        </p>

        {/* ปุ่มปิด */}
        <button
          onClick={handleClose}
          style={{
            width:"100%", padding:"12px",
            background:`linear-gradient(135deg,${statusColor}33,${statusColor}11)`,
            border:`1px solid ${statusColor}55`,
            borderRadius:"10px",
            color:statusColor,
            fontFamily:"'Cinzel',serif", fontSize:"14px",
            cursor:"pointer",
          }}
        >
          ดูผลลัพธ์
        </button>
      </div>
    </div>
  );
}

// ── SET SELECT ────────────────────────────────────────────
function SetSelectScreen({ onSelect, theme }) {
  const [search, setSearch] = useState("");
  const filtered = QUIZ_SETS.filter(s=>s.name.includes(search)||s.id.includes(search));
  const tc = theme.themeColor;
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{maxWidth:"560px",width:"100%",
        background:"linear-gradient(160deg,rgba(20,12,5,.97),rgba(38,22,8,.97))",
        border:`2px solid ${tc}55`,borderRadius:"16px",padding:"32px 28px",
        boxShadow:"0 20px 60px rgba(0,0,0,.8)",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:"24px"}}>
          <div style={{fontSize:"44px",marginBottom:"8px"}}>{theme.logoEmoji}</div>
          <h1 style={{fontFamily:"'Cinzel Decorative',serif",color:tc,fontSize:theme.fontSize,
            margin:"0 0 4px",textShadow:`0 0 20px ${tc}44`}}>ลุยโจทย์</h1>
          <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"11px",margin:0}}>
            Admin — เลือกชุดข้อสอบ
          </p>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
          style={{width:"100%",boxSizing:"border-box",background:`${tc}11`,border:`1px solid ${tc}44`,
            borderRadius:"8px",padding:"10px 14px",color:"#f5e6c8",
            fontFamily:"'Sarabun',sans-serif",fontSize:"15px",outline:"none",marginBottom:"14px"}}/>
        <div style={{display:"flex",flexDirection:"column",gap:"8px",maxHeight:"400px",overflowY:"auto"}}>
          {filtered.map(set=>(
            <button key={set.id} onClick={()=>onSelect(set)} style={{
              background:`${tc}08`,border:`1px solid ${tc}33`,borderRadius:"10px",
              padding:"13px 16px",cursor:"pointer",textAlign:"left",
              display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all .2s"}}>
              <div>
                <div style={{color:"#f5e6c8",fontFamily:"'Sarabun',sans-serif",fontSize:"15px",fontWeight:600}}>
                  {set.name}
                </div>
                <div style={{color:"#6b5a3e",fontSize:"12px",fontFamily:"'Cinzel',serif",marginTop:"2px"}}>
                  {set.id} · {set.total}ข้อ · {set.timeLimit/60}นาที · ผ่าน {set.passingScore} คะแนน
                </div>
                <div style={{color:"#3a6a3a",fontSize:"11px",fontFamily:"'Courier New',monospace",marginTop:"3px"}}>
                  ?set={set.id}
                </div>
              </div>
              <span style={{color:tc,fontSize:"22px"}}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────
function LoginScreen({ set, onConfirm, onBack, isDirectLink, theme }) {
  const [sid, setSid] = useState("");
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const tc = theme.themeColor;

  const lookup = async () => {
    if(!sid.trim()) return;
    setLoading(true); setError(""); setStudent(null);
    try {
      const data = await apiGet({ action:"getStudent", studentId:sid.trim() });
      if(data.error) setError(data.error);
      else setStudent(data.student);
    } catch { setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่"); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{maxWidth:"460px",width:"100%",
        background:"linear-gradient(160deg,rgba(20,12,5,.97),rgba(38,22,8,.97))",
        border:`2px solid ${tc}55`,borderRadius:"16px",padding:"32px 28px",
        boxShadow:"0 20px 60px rgba(0,0,0,.8)",position:"relative",zIndex:1}}>
        {!isDirectLink && (
          <button onClick={onBack} style={{background:"none",border:"none",color:"#6b5a3e",
            fontFamily:"'Cinzel',serif",fontSize:"12px",cursor:"pointer",marginBottom:"16px",padding:0}}>
            ← เปลี่ยนชุดข้อสอบ
          </button>
        )}
        <div style={{textAlign:"center",marginBottom:"24px"}}>
          <div style={{fontSize:"44px",marginBottom:"8px"}}>{theme.logoEmoji}</div>
          <h1 style={{fontFamily:"'Cinzel Decorative',serif",color:tc,fontSize:theme.fontSize,
            margin:"0 0 4px",textShadow:`0 0 20px ${tc}44`}}>ลุยโจทย์</h1>
          <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"12px",margin:0}}>
            {set.id} · {set.total}ข้อ · ผ่าน {set.passingScore} คะแนน · {set.timeLimit/60}นาที
          </p>
        </div>
        <label style={{display:"block",color:"#8b7355",fontSize:"11px",
          fontFamily:"'Cinzel',serif",letterSpacing:"1px",marginBottom:"6px"}}>รหัสนักเรียน</label>
        <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
          <input value={sid}
            onChange={e=>{setSid(e.target.value);setStudent(null);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&lookup()}
            placeholder="เช่น 691009" maxLength={10}
            style={{flex:1,background:`${tc}11`,border:`1px solid ${tc}44`,borderRadius:"8px",
              padding:"11px 14px",color:"#f5e6c8",fontFamily:"'Sarabun',sans-serif",
              fontSize:"16px",outline:"none",boxSizing:"border-box"}}/>
          <button onClick={lookup} disabled={!sid.trim()||loading} style={{
            padding:"0 18px",background:`${tc}22`,border:`1px solid ${tc}66`,
            borderRadius:"8px",color:tc,fontFamily:"'Cinzel',serif",fontSize:"13px",
            cursor:sid.trim()&&!loading?"pointer":"not-allowed",whiteSpace:"nowrap"}}>
            {loading?"...":"ค้นหา"}
          </button>
        </div>
        {loading && <Spinner color={tc}/>}
        {error && (
          <div style={{background:"rgba(231,76,60,.1)",border:"1px solid rgba(231,76,60,.4)",
            borderRadius:"10px",padding:"14px",marginBottom:"16px",textAlign:"center",
            color:"#e74c3c",fontFamily:"'Sarabun',sans-serif",fontSize:"14px"}}>{error}</div>
        )}
        {student && !loading && (
          <div style={{background:"rgba(39,174,96,.08)",border:"2px solid rgba(39,174,96,.4)",
            borderRadius:"12px",padding:"20px",marginBottom:"8px"}}>
            <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"11px",
              textAlign:"center",marginBottom:"12px"}}>พบข้อมูลนักเรียน</p>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"28px",fontWeight:900,fontFamily:"'Cinzel',serif",color:tc}}>
                {student.nickname}
              </div>
              <div style={{color:"#f5e6c8",fontFamily:"'Sarabun',sans-serif",fontSize:"16px",marginTop:"4px"}}>
                {student.firstName} {student.lastName}
              </div>
            </div>
            <div style={{marginTop:"16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              <button onClick={()=>{setStudent(null);setSid("");}} style={{
                background:`${tc}11`,border:`1px solid ${tc}44`,borderRadius:"10px",
                padding:"12px",color:tc,fontFamily:"'Cinzel',serif",fontSize:"14px",cursor:"pointer"}}>
                ไม่ใช่ฉัน
              </button>
              <button onClick={()=>onConfirm(student)} style={{
                background:"linear-gradient(135deg,#1a4a1a,#27ae60,#1a4a1a)",border:"none",
                borderRadius:"10px",padding:"12px",color:"#fff",
                fontFamily:"'Cinzel',serif",fontSize:"14px",fontWeight:700,cursor:"pointer"}}>
                ใช่ คือฉัน! ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MC CHOICES ────────────────────────────────────────────
function McChoices({ shuffled, selNow, onSelect, tc }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
      {shuffled.map((choice,si)=>{
        const sel=selNow===si;
        return (
          <button key={si} onClick={()=>onSelect(si)} style={{
            background:sel?`${tc}22`:"rgba(255,255,255,.02)",
            border:sel?`2px solid ${tc}`:`1px solid ${tc}22`,
            borderRadius:"10px",padding:"13px 16px",
            color:sel?"#f5e6c8":"#a89070",
            fontFamily:"'Sarabun',sans-serif",fontSize:"16px",
            cursor:"pointer",textAlign:"left",
            display:"flex",alignItems:"center",gap:"12px",
            transition:"all .15s",boxShadow:sel?`0 3px 14px ${tc}33`:"none"}}>
            <span style={{width:"28px",height:"28px",borderRadius:"50%",flexShrink:0,
              background:sel?tc:`${tc}11`,border:sel?"none":`1px solid ${tc}33`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:"12px",fontWeight:700,fontFamily:"'Cinzel',serif",
              color:sel?"#1a0e00":"#8b7355"}}>
              {["ก","ข","ค","ง"][si]}
            </span>
            {choice.text}
          </button>
        );
      })}
    </div>
  );
}

// ── TEXT INPUT ────────────────────────────────────────────
function TextInput({ value, onChange, tc }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        <span style={{background:`${tc}22`,border:`1px solid ${tc}55`,borderRadius:"20px",
          padding:"3px 12px",fontSize:"11px",color:tc,fontFamily:"'Cinzel',serif"}}>
          อัตนัย — พิมพ์คำตอบ
        </span>
      </div>
      <div style={{position:"relative"}}>
        <input type="text" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)}
          placeholder="พิมพ์คำตอบที่นี่ เช่น 7.5"
          style={{width:"100%",boxSizing:"border-box",
            background:value?`${tc}11`:"rgba(255,255,255,.03)",
            border:value?`2px solid ${tc}`:`1px solid ${tc}33`,
            borderRadius:"12px",padding:"18px 20px",color:"#f5e6c8",
            fontFamily:"'Sarabun',sans-serif",fontSize:"22px",outline:"none",
            textAlign:"center",letterSpacing:"2px",transition:"all .2s",
            boxShadow:value?`0 0 20px ${tc}22`:"none"}}/>
        {value && (
          <button onClick={()=>onChange("")} style={{
            position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",color:"#6b5a3e",
            fontSize:"18px",cursor:"pointer",padding:"4px",lineHeight:1}}>×</button>
        )}
      </div>
      <p style={{color:"#6b5a3e",fontSize:"12px",fontFamily:"'Cinzel',serif",
        textAlign:"center",margin:0}}>
        ใช้ . หรือ , เป็นทศนิยมได้ · กด Enter เพื่อไปข้อถัดไป
      </p>
    </div>
  );
}

function PointsBadge({ points, tc }) {
  if(!points || points === 1) return null;
  return (
    <span style={{
      background:`linear-gradient(135deg,${tc}33,${tc}11)`,
      border:`1px solid ${tc}66`,borderRadius:"20px",
      padding:"3px 12px",fontSize:"12px",color:tc,
      fontFamily:"'Cinzel',serif",fontWeight:700,
      boxShadow:`0 0 8px ${tc}33`,
    }}>
      ★ {points} คะแนน
    </span>
  );
}

// ── QUIZ SCREEN ───────────────────────────────────────────
function QuizScreen({ set, student, questions, onFinish, theme }) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(set.timeLimit);
  const timerRef = useRef(null);
  const tc = theme.themeColor;
  const maxScore = calcMaxScore(questions);

  const [allShuffled] = useState(()=>
    questions.map(q=>
      q.questionType==="text" ? []
      : shuffle(q.choices.map((c,i)=>({text:c,origIndex:i})))
    )
  );

  const finish = useCallback((timeUp=false)=>{
    clearInterval(timerRef.current);
    const timeUsed = set.timeLimit - timeLeft;
    const results = questions.map((q,qi)=>{
      const shuffled = allShuffled[qi];
      const ans = answers[qi] ?? null;
      if(q.questionType==="text"){
        const isCorrect = ans!==null && ans!=="" && checkTextAnswer(ans, q.correctTextAnswer);
        return { question:q, selectedOrigIndex:null, userTextAnswer:ans, isCorrect, shuffledChoices:[] };
      } else {
        const oi = ans!==null ? shuffled[ans].origIndex : null;
        return { question:q, selectedOrigIndex:oi, isCorrect:oi===q.answer, shuffledChoices:shuffled };
      }
    });
    onFinish({ results, timeUsed, timeUp, student, set, maxScore });
  },[answers, timeLeft]);

  useEffect(()=>{
    timerRef.current = setInterval(()=>{
      setTimeLeft(t=>{ if(t<=1){ clearInterval(timerRef.current); finish(true); return 0; } return t-1; });
    },1000);
    return ()=>clearInterval(timerRef.current);
  },[finish]);

  useEffect(()=>{
    if(questions[current]?.questionType==="text"){
      setTimeout(() => (document.querySelector("input[inputmode='decimal']") as any)?.focus(), 100);
    }
  },[current]);

  const q = questions[current];
  const shuffled = allShuffled[current];
  const selNow = answers[current] ?? (q.questionType==="text" ? "" : null);
  const answered = Object.keys(answers).filter(k=>answers[k]!==null&&answers[k]!=="").length;

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",
      padding:"12px",maxWidth:"720px",margin:"0 auto",position:"relative",zIndex:1}}>
      {/* Header */}
      <div style={{background:"rgba(15,8,2,.92)",border:`1px solid ${tc}44`,
        borderRadius:"12px",padding:"10px 14px",marginBottom:"12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
          <span style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"12px"}}>
            {student.nickname} · ข้อ <b style={{color:tc}}>{current+1}</b>/{questions.length}
            <span style={{color:tc,marginLeft:"8px",fontSize:"11px"}}>
              ({answered}/{questions.length} ข้อ)
            </span>
          </span>
          <span style={{fontFamily:"'Courier New',monospace",fontSize:"22px",fontWeight:700,
            color:timeLeft<60?"#e74c3c":timeLeft<180?"#e67e22":tc,
            textShadow:timeLeft<60?"0 0 10px rgba(231,76,60,.7)":"none"}}>
            ⏱ {formatTime(timeLeft)}
          </span>
        </div>
        <TimerBar timeLeft={timeLeft} totalTime={set.timeLimit} color={tc}/>
        <div style={{display:"flex",gap:"3px",marginTop:"8px",flexWrap:"wrap"}}>
          {questions.map((qs,i)=>{
            const isAnswered = answers[i]!==undefined&&answers[i]!==null&&answers[i]!=="";
            const isText = qs.questionType==="text";
            const pts = qs.points ?? 1;
            return (
              <div key={i} onClick={()=>setCurrent(i)} title={`ข้อ ${i+1} (${pts} คะแนน)`} style={{
                minWidth:"24px",height:"24px",borderRadius:"5px",cursor:"pointer",padding:"0 3px",
                background:i===current?tc:isAnswered?tc+"55":"rgba(255,255,255,.06)",
                border:i===current?`2px solid ${tc}`:`1px solid ${tc}33`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"9px",fontWeight:700,color:i===current?"#1a0e00":"#8b7355",
                transition:"all .15s",gap:"1px",
              }}>
                {isText?"✏":i+1}
                {pts>1&&<span style={{fontSize:"8px",color:i===current?"#1a0e00":tc}}>×{pts}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Question Card */}
      <div style={{flex:1,background:"linear-gradient(160deg,rgba(20,12,5,.97),rgba(38,22,8,.97))",
        border:`2px solid ${tc}55`,borderRadius:"16px",padding:"20px",marginBottom:"12px",
        boxShadow:"0 10px 40px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap"}}>
          <PointsBadge points={q.points} tc={tc}/>
          {q.isRare && (
            <span style={{background:"linear-gradient(135deg,#1a0a2e,#4a0080)",
              border:"1px solid #9b59b6",borderRadius:"20px",padding:"3px 12px",
              fontSize:"11px",color:"#d7bde2",fontFamily:"'Cinzel',serif",
              boxShadow:"0 0 10px rgba(155,89,182,.5)"}}>✦ โจทย์หายาก</span>
          )}
        </div>
        <div style={{background:`${tc}08`,border:`1px solid ${tc}22`,borderRadius:"12px",
          padding:"10px",marginBottom:"16px",minHeight:"220px",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          {q.imageUrl ? (
            <img src={q.imageUrl} alt="โจทย์" style={{
              width:"100%",maxHeight:"400px",objectFit:"contain",borderRadius:"8px",display:"block"}}/>
          ) : q.setText ? (
            <p style={{color:"#f5e6c8",fontFamily:"'Sarabun',sans-serif",
              fontSize:"18px",textAlign:"center",margin:0,lineHeight:1.6}}>{q.setText}</p>
          ) : (
            <p style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"13px",
              textAlign:"center",margin:0}}>ข้อที่ {current+1}</p>
          )}
        </div>
        {q.questionType==="text" ? (
          <div onKeyDown={e=>e.key==="Enter"&&current<questions.length-1&&setCurrent(c=>c+1)}>
            <TextInput value={selNow||""} onChange={val=>setAnswers(a=>({...a,[current]:val}))} tc={tc}/>
          </div>
        ) : (
          <McChoices shuffled={shuffled} selNow={selNow}
            onSelect={si=>setAnswers(a=>({...a,[current]:si}))} tc={tc}/>
        )}
      </div>

      {/* Navigation */}
      <div style={{display:"flex",gap:"8px"}}>
        <button onClick={()=>setCurrent(c=>c-1)} disabled={current===0} style={{
          flex:1,padding:"12px",background:`${tc}11`,border:`1px solid ${tc}44`,
          borderRadius:"10px",color:tc,fontFamily:"'Cinzel',serif",fontSize:"14px",
          cursor:current===0?"not-allowed":"pointer",opacity:current===0?.35:1}}>
          ← ก่อนหน้า
        </button>
        {current<questions.length-1 ? (
          <button onClick={()=>setCurrent(c=>c+1)} style={{
            flex:2,padding:"12px",background:`linear-gradient(135deg,#6b4f10,${tc},#6b4f10)`,
            border:"none",borderRadius:"10px",color:"#1a0e00",
            fontFamily:"'Cinzel',serif",fontSize:"15px",fontWeight:700,cursor:"pointer"}}>
            ถัดไป →
          </button>
        ) : (
          <button onClick={()=>finish(false)} style={{
            flex:2,padding:"12px",border:"none",borderRadius:"10px",
            background:answered===questions.length
              ?"linear-gradient(135deg,#1a4a1a,#27ae60,#1a4a1a)"
              :`linear-gradient(135deg,#6b4f10,${tc},#6b4f10)`,
            color:answered===questions.length?"#fff":"#1a0e00",
            fontFamily:"'Cinzel',serif",fontSize:"15px",fontWeight:700,cursor:"pointer"}}>
            {answered<questions.length?`ส่ง (${answered}/${questions.length})`:"✓ ส่งคำตอบ"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── RESULT SCREEN ─────────────────────────────────────────
function ResultScreen({ data, onRetry, onHome, isDirectLink, theme }) {
  const { results, timeUsed, timeUp, student, set, maxScore } = data;
  const totalScore = calcTotalScore(results);
  const passed = totalScore >= set.passingScore;
  const isPerfect = totalScore === maxScore && maxScore > 0;
  const rareOK = results.filter(r=>r.question.isRare && r.isCorrect);
  const correctCount = results.filter(r=>r.isCorrect).length;
  const tc = theme.themeColor;

  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(true);
  const [saveErr, setSaveErr] = useState(false);

  // ── Character state ──────────────────────────────
  const [charData, setCharData] = useState(null);
  const [showChar, setShowChar] = useState(false);
  const charStatus = isPerfect ? "perfect" : passed ? "pass" : "fail";

  useEffect(()=>{
    (async()=>{
      try {
        // บันทึกผล
        await apiPost({
          action:"saveResult", studentId:student.id,
          studentName:`${student.firstName} ${student.lastName}`,
          studentNickname:student.nickname, setName:set.id,
          score:`${totalScore}/${maxScore}`,
          correctCount:`${correctCount}/${results.length}`,
          passed:passed?"ผ่าน":"ไม่ผ่าน", timeUsed,
          correctIds:results.filter(r=>r.isCorrect).map(r=>r.question.id).join(","),
          wrongIds:results.filter(r=>!r.isCorrect).map(r=>r.question.id).join(","),
        });
        for(const r of rareOK){
          if(r.question.seriesId)
            await apiPost({ action:"saveRareProgress", studentId:student.id,
              seriesId:r.question.seriesId, questionId:r.question.id });
        }
      } catch { setSaveErr(true); }
      setSaving(false);

      // โหลด character data
      try {
        const charRes = await apiGet({ action:"getCharacter", setId:set.id });
        if(charRes.character) {
          setCharData(charRes.character);
          setShowChar(true); // เด้งขึ้นมาหลังโหลดเสร็จ
        }
      } catch {
        // ถ้าไม่มี character config ก็ไม่แสดง
      }
    })();
  },[]);

  const scorePct = maxScore > 0 ? (totalScore/maxScore)*100 : 0;
  const passingPct = maxScore > 0 ? (set.passingScore/maxScore)*100 : 0;

  return (
    <>
      {/* Character Popup */}
      {showChar && charData && (
        <CharacterPopup
          charData={charData}
          status={charStatus}
          onClose={()=>setShowChar(false)}
          tc={tc}
        />
      )}

      <div style={{minHeight:"100vh",overflowY:"auto",padding:"20px",
        display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{maxWidth:"560px",width:"100%",marginTop:"20px",marginBottom:"40px",
          background:"linear-gradient(160deg,rgba(20,12,5,.97),rgba(38,22,8,.97))",
          border:`2px solid ${passed?"rgba(39,174,96,.5)":"rgba(231,76,60,.4)"}`,
          borderRadius:"16px",padding:"32px 28px",
          boxShadow:"0 20px 60px rgba(0,0,0,.8)",position:"relative",zIndex:1}}>

          <div style={{textAlign:"center",marginBottom:"24px"}}>
            <div style={{fontSize:"56px",marginBottom:"6px"}}>
              {isPerfect ? "🌟" : passed ? "🎉" : "😤"}
            </div>
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"26px",fontWeight:700,
              color:isPerfect?"#f1c40f":passed?"#27ae60":"#e74c3c",
              textShadow:`0 0 20px ${isPerfect?"rgba(241,196,15,.5)":passed?"rgba(39,174,96,.5)":"rgba(231,76,60,.4)"}`}}>
              {isPerfect ? "เต็มทุกข้อ!" : passed ? "ผ่านแล้ว!" : "ยังไม่ผ่าน"}
            </div>
            {timeUp&&<div style={{color:"#e67e22",fontSize:"12px",fontFamily:"'Cinzel',serif",marginTop:"2px"}}>⏱ หมดเวลา</div>}

            <div style={{fontSize:"60px",fontWeight:900,fontFamily:"'Cinzel',serif",
              color:isPerfect?"#f1c40f":passed?"#27ae60":"#e74c3c",lineHeight:1,marginTop:"12px"}}>
              {totalScore}
              <span style={{fontSize:"28px",color:"#6b5a3e"}}>/{maxScore}</span>
            </div>
            <div style={{color:"#8b7355",fontFamily:"'Cinzel',serif",fontSize:"12px",marginTop:"4px"}}>
              คะแนน · ผ่านที่ {set.passingScore} คะแนน
            </div>

            {/* Score bar */}
            <div style={{marginTop:"12px",position:"relative"}}>
              <div style={{width:"100%",height:"10px",background:"rgba(255,255,255,.08)",
                borderRadius:"5px",overflow:"visible",position:"relative"}}>
                <div style={{height:"100%",width:scorePct+"%",
                  background:`linear-gradient(90deg,${isPerfect?"#f1c40f":passed?"#27ae60":"#e74c3c"},${isPerfect?"#f39c12":passed?"#2ecc71":"#e74c3c"})`,
                  borderRadius:"5px",transition:"width .8s ease",
                  boxShadow:`0 0 8px ${isPerfect?"rgba(241,196,15,.6)":passed?"rgba(39,174,96,.6)":"rgba(231,76,60,.5)"}`}}/>
                <div style={{position:"absolute",top:"-4px",left:passingPct+"%",
                  width:"2px",height:"18px",background:"#f5e6c8",borderRadius:"1px",
                  transform:"translateX(-50%)"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                <span style={{color:"#6b5a3e",fontSize:"10px",fontFamily:"'Cinzel',serif"}}>0</span>
                <span style={{color:"#f5e6c8",fontSize:"10px",fontFamily:"'Cinzel',serif",
                  position:"absolute",left:passingPct+"%",transform:"translateX(-50%)",marginTop:"0"}}>
                  เกณฑ์ {set.passingScore}
                </span>
                <span style={{color:"#6b5a3e",fontSize:"10px",fontFamily:"'Cinzel',serif"}}>{maxScore}</span>
              </div>
            </div>

            <div style={{color:"#8b7355",fontFamily:"'Sarabun',sans-serif",fontSize:"13px",marginTop:"12px"}}>
              {student.nickname} · {set.id} · ใช้เวลา {formatTime(timeUsed)}
            </div>
            <div style={{marginTop:"6px",fontSize:"11px",fontFamily:"'Cinzel',serif",
              color:saving?"#6b5a3e":saveErr?"#e74c3c":"rgba(39,174,96,.7)"}}>
              {saving?"⏳ กำลังบันทึก...":saveErr?"✗ บันทึกไม่สำเร็จ":"✓ บันทึกแล้ว"}
            </div>
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"16px"}}>
            {[
              ["✓ ข้อถูก",`${correctCount}/${results.length}`,"#27ae60"],
              ["★ คะแนน",`${totalScore}/${maxScore}`,tc],
              ["⏱ เวลา",formatTime(timeUsed),"#a89070"],
              ["✦ หายาก",`${rareOK.length} ข้อ`,"#9b59b6"],
            ].map(([k,v,c])=>(
              <div key={k} style={{background:"rgba(255,255,255,.02)",
                border:"1px solid rgba(212,175,55,.12)",borderRadius:"10px",
                padding:"12px",textAlign:"center"}}>
                <div style={{color:"#6b5a3e",fontSize:"11px",fontFamily:"'Cinzel',serif",marginBottom:"4px"}}>{k}</div>
                <div style={{color:c,fontSize:"20px",fontWeight:700,fontFamily:"'Cinzel',serif"}}>{v}</div>
              </div>
            ))}
          </div>

          {rareOK.length>0&&(
            <div style={{background:"rgba(74,0,128,.2)",border:"1px solid rgba(155,89,182,.5)",
              borderRadius:"10px",padding:"12px 16px",marginBottom:"16px",
              display:"flex",alignItems:"center",gap:"10px"}}>
              <span style={{fontSize:"18px"}}>✦</span>
              <div>
                <div style={{color:"#d7bde2",fontFamily:"'Cinzel',serif",fontSize:"13px",fontWeight:700}}>
                  โจทย์หายากผ่าน {rareOK.length} ข้อ!
                </div>
                <div style={{color:"#7d3c98",fontSize:"11px",fontFamily:"'Sarabun',sans-serif"}}>
                  ความสำเร็จถูกบันทึกแล้ว
                </div>
              </div>
            </div>
          )}

          {/* ปุ่มดูเฉลย */}
          <div style={{marginBottom:"16px"}}>
            <button type="button" onClick={()=>setShowDetail(d=>!d)} style={{
              width:"100%",padding:"13px",
              background:showDetail?"rgba(212,175,55,.15)":"rgba(212,175,55,.06)",
              border:`1px solid ${tc}55`,borderRadius:"10px",color:tc,
              fontFamily:"'Cinzel',serif",fontSize:"14px",cursor:"pointer"}}>
              {showDetail?"▲ ซ่อนเฉลย":"▼ ดูเฉลยทุกข้อ"}
            </button>
          </div>

          {showDetail&&(
            <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"20px"}}>
              {results.map((r,i)=>{
                const pts = r.question.points ?? 1;
                let correctText, selectedText;
                if(r.question.questionType==="text"){
                  correctText = String(r.question.correctTextAnswer ?? "-");
                  selectedText = r.userTextAnswer || "ไม่ได้ตอบ";
                } else {
                  correctText = r.shuffledChoices.find(c=>c.origIndex===r.question.answer)?.text ?? "-";
                  selectedText = r.selectedOrigIndex!==null
                    ? r.shuffledChoices.find(c=>c.origIndex===r.selectedOrigIndex)?.text ?? "-"
                    : "ไม่ได้ตอบ";
                }
                return (
                  <div key={i} style={{
                    background:r.isCorrect?"rgba(39,174,96,.07)":"rgba(231,76,60,.07)",
                    border:`1px solid ${r.isCorrect?"rgba(39,174,96,.3)":"rgba(231,76,60,.3)"}`,
                    borderRadius:"10px",padding:"14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:"12px",
                        color:r.isCorrect?"#27ae60":"#e74c3c"}}>
                        {r.isCorrect?"✓":"✗"} ข้อ {i+1}
                      </span>
                      <span style={{
                        background:r.isCorrect?"rgba(39,174,96,.2)":"rgba(231,76,60,.15)",
                        border:`1px solid ${r.isCorrect?"rgba(39,174,96,.4)":"rgba(231,76,60,.3)"}`,
                        borderRadius:"12px",padding:"1px 8px",fontSize:"11px",
                        color:r.isCorrect?"#27ae60":"#e74c3c",fontFamily:"'Cinzel',serif",fontWeight:700}}>
                        {r.isCorrect?"+":"-"}{pts} คะแนน
                      </span>
                      {r.question.questionType==="text"&&(
                        <span style={{background:`${tc}22`,border:`1px solid ${tc}44`,
                          borderRadius:"10px",padding:"1px 8px",fontSize:"10px",color:tc}}>✏ อัตนัย</span>
                      )}
                      {r.question.isRare&&(
                        <span style={{color:"#9b59b6",fontSize:"11px"}}>✦ หายาก</span>
                      )}
                    </div>
                    <div style={{fontFamily:"'Sarabun',sans-serif",fontSize:"14px",
                      color:"#c0a878",marginBottom:"8px",lineHeight:1.6}}>
                      {r.isCorrect
                        ? <span>✓ ตอบถูก: <span style={{color:"#27ae60",fontWeight:600}}>{correctText}</span></span>
                        : <span>
                            คุณตอบ: <span style={{color:"#e74c3c"}}>{selectedText}</span>
                            {" · "}เฉลย: <span style={{color:"#27ae60",fontWeight:600}}>{correctText}</span>
                          </span>
                      }
                    </div>
                    <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                      {r.question.linkText&&(
                        <a href={r.question.linkText} target="_blank" rel="noreferrer" style={{
                          fontSize:"12px",color:tc,textDecoration:"none",
                          padding:"4px 12px",border:`1px solid ${tc}55`,
                          borderRadius:"20px",fontFamily:"'Cinzel',serif"}}>📄 เฉลยเขียน</a>
                      )}
                      {r.question.linkVideo&&(
                        <a href={r.question.linkVideo} target="_blank" rel="noreferrer" style={{
                          fontSize:"12px",color:"#e74c3c",textDecoration:"none",
                          padding:"4px 12px",border:"1px solid rgba(231,76,60,.4)",
                          borderRadius:"20px",fontFamily:"'Cinzel',serif"}}>▶ เฉลยวิดีโอ</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ปุ่มหลัก: หน้าหลัก / ทำใหม่ ── */}
          <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
            {!isDirectLink&&(
              <button type="button" onClick={onHome} style={{
                flex:1,padding:"13px",background:"rgba(212,175,55,.06)",
                border:`1px solid ${tc}44`,borderRadius:"10px",color:tc,
                fontFamily:"'Cinzel',serif",fontSize:"14px",cursor:"pointer"}}>
                หน้าหลัก
              </button>
            )}
            <button type="button" onClick={onRetry} style={{
              flex:2,padding:"13px",
              background:`linear-gradient(135deg,#6b4f10,${tc},#6b4f10)`,
              border:"none",borderRadius:"10px",color:"#1a0e00",
              fontFamily:"'Cinzel',serif",fontSize:"15px",fontWeight:700,cursor:"pointer",
              boxShadow:`0 4px 20px ${tc}33`}}>
              ทำใหม่
            </button>
          </div>

          {/* ── ปุ่ม Looker Studio (ด้านล่างสุด แยกต่างหาก) ── */}
          <a
            href={LOOKER_STUDIO_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:"10px",
              width:"100%",
              padding:"13px",
              boxSizing:"border-box",
              background:"linear-gradient(135deg,rgba(66,133,244,.15),rgba(66,133,244,.05))",
              border:"1px solid rgba(66,133,244,.4)",
              borderRadius:"10px",
              color:"#7ab3f5",
              fontFamily:"'Cinzel',serif",
              fontSize:"14px",
              fontWeight:600,
              textDecoration:"none",
              transition:"all .2s",
              boxShadow:"0 2px 12px rgba(66,133,244,.15)",
            }}
          >
            {/* Looker Studio icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#7ab3f5" strokeWidth="1.5"/>
              <path d="M8 12 Q12 6 16 12 Q12 18 8 12Z" fill="#7ab3f5" opacity="0.7"/>
              <circle cx="12" cy="12" r="2.5" fill="#7ab3f5"/>
            </svg>
            ดูรายงานผลใน Looker Studio
          </a>

        </div>
      </div>
    </>
  );
}

// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("init");
  const [selectedSet, setSet] = useState(null);
  const [student, setStudent] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [resultData, setResult] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [isDirectLink] = useState(()=>!!getSetFromUrl());

  useEffect(()=>{
    const setId = getSetFromUrl();
    if(setId){
      const found = QUIZ_SETS.find(s=>s.id===setId);
      if(found){
        setSet(found);
        apiGet({ action:"getConfig", setId }).then(d=>{ if(d.config) setTheme(buildTheme(d.config)); });
        setScreen("login");
      } else setScreen("setSelect");
    } else setScreen("setSelect");
  },[]);

  useEffect(()=>{
    if(screen!=="loading"||!selectedSet||!student) return;
    setLoadError("");
    Promise.all([
      apiGet({ action:"getQuestions", setName:selectedSet.id }),
      apiGet({ action:"getConfig", setId:selectedSet.id }),
    ]).then(([qData,cfgData])=>{
      if(!qData.questions?.length){ setLoadError("ไม่พบข้อสอบในชุด "+selectedSet.id); return; }
      const cfg = buildTheme(cfgData.config);
      const shouldShuffle = cfgData.config?.shuffleQuestions !== false;
      setQuestions(
        shouldShuffle
          ? selectQuestions(qData.questions, selectedSet.total)
          : orderQuestions(qData.questions, selectedSet.total)
      );
      setTheme(cfg);
      setScreen("quiz");
    }).catch(()=>setLoadError("โหลดข้อสอบไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ"));
  },[screen]);

  const goRetry = ()=>{ setQuestions([]); setResult(null); setScreen("loading"); };
  const goHome = ()=>{
    setResult(null); setQuestions([]);
    if(isDirectLink){ setStudent(null); setScreen("login"); }
    else { setSet(null); setStudent(null); setScreen("setSelect"); }
  };

  const tc = theme.themeColor;
  const bg = theme.bgImageUrl
    ? `url(${theme.bgImageUrl}) center/cover fixed, ${theme.bgColor}`
    : `radial-gradient(ellipse at 20% 50%,rgba(55,32,8,.45) 0%,transparent 60%),${theme.bgColor}`;

  if(screen==="init") return <div style={{minHeight:"100vh",background:theme.bgColor}}/>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700&family=Sarabun:wght@400;600&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:${theme.bgColor};}
        @keyframes pfloat{0%,100%{transform:translateY(0)scale(1);opacity:.3}50%{transform:translateY(-18px)scale(1.2);opacity:.65}}
        @keyframes pspin{to{transform:rotate(360deg)}}
        input:focus{border-color:${tc}99!important;box-shadow:0 0 0 2px ${tc}22;}
        button:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px);}
        button{transition:all .18s;}
        a:hover{opacity:.8;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-thumb{background:${tc}44;border-radius:3px;}
      `}</style>
      <div style={{minHeight:"100vh",fontFamily:"'Sarabun',sans-serif",background:bg}}>
        <Particles color={tc}/>
        {screen==="setSelect"&&(
          <SetSelectScreen onSelect={s=>{
            setSet(s);
            apiGet({ action:"getConfig", setId:s.id }).then(d=>{ if(d.config) setTheme(buildTheme(d.config)); });
            setScreen("login");
          }} theme={theme}/>
        )}
        {screen==="login"&&selectedSet&&(
          <LoginScreen set={selectedSet} theme={theme} isDirectLink={isDirectLink}
            onConfirm={st=>{setStudent(st);setScreen("loading");}}
            onBack={()=>{setSet(null);setScreen("setSelect");}}/>
        )}
        {screen==="loading"&&(
          loadError
            ? <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
                <div style={{maxWidth:"400px",width:"100%",
                  background:"linear-gradient(160deg,rgba(20,12,5,.97),rgba(38,22,8,.97))",
                  border:`2px solid ${tc}55`,borderRadius:"16px",padding:"32px",
                  boxShadow:"0 20px 60px rgba(0,0,0,.8)",textAlign:"center",position:"relative",zIndex:1}}>
                  <p style={{color:"#e74c3c",fontFamily:"'Sarabun',sans-serif",marginBottom:"20px"}}>⚠ {loadError}</p>
                  <button onClick={goHome} style={{width:"100%",padding:"12px",background:`${tc}11`,
                    border:`1px solid ${tc}44`,borderRadius:"10px",color:tc,
                    fontFamily:"'Cinzel',serif",fontSize:"14px",cursor:"pointer"}}>กลับหน้าหลัก</button>
                </div>
              </div>
            : <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Spinner color={tc}/>
              </div>
        )}
        {screen==="quiz"&&selectedSet&&student&&questions.length>0&&(
          <QuizScreen set={selectedSet} student={student} questions={questions}
            onFinish={d=>{setResult(d);setScreen("result");}} theme={theme}/>
        )}
        {screen==="result"&&resultData&&(
          <ResultScreen data={resultData} onRetry={goRetry} onHome={goHome}
            isDirectLink={isDirectLink} theme={theme}/>
        )}
      </div>
    </>
  );
}
