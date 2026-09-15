// ============================================================
// APPS SCRIPT v7 — Patch 3.0 Boss Mode + Patch 4.0 Artifacts
// ============================================================

const SPREADSHEET_ID = "1TdOOHQ4g_maj7pkwFS_5GyUusMg99oFoZxV16mKvVFA";

// ============================================================
// CACHE HELPERS — ใช้ CacheService ลด Sheets read
// TTL: 300 วินาที (5 นาที) สำหรับข้อมูลที่ไม่ค่อยเปลี่ยน
// ============================================================
const CACHE_TTL = 300;

function cacheGet(key) {
  try {
    const val = CacheService.getScriptCache().get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

function cacheSet(key, value) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), CACHE_TTL);
  } catch {}
}

function cacheRemove(key) {
  try { CacheService.getScriptCache().remove(key); } catch {}
}

// ล้าง cache ทั้งหมดที่เกี่ยวกับ Sheets (เรียกหลัง saveResult หรือแก้ข้อมูล)
function clearAllCache() {
  const keys = ["quizSets", "itemLibrary"];
  CacheService.getScriptCache().removeAll(keys);
}

// ============================================================
// ROUTER
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  try {
    // ── เดิม ──────────────────────────────────────────────
    if (action === "getQuestions")       return getQuestions(e.parameter.setName);
    if (action === "getStudent")         return getStudent(e.parameter.studentId);
    if (action === "getRareProgress")    return getRareProgress(e.parameter.studentId);
    if (action === "getConfig")          return getConfig(e.parameter.setId);
    if (action === "getCharacter")       return getCharacter(e.parameter.setId);
    if (action === "getChallengeConfig") return getChallengeConfig(e.parameter.setId);
    if (action === "getQuizSets")        return getQuizSets();
    if (action === "ping")               return ok({ pong: true });

    // ── Patch 3.0 Boss ────────────────────────────────────
    if (action === "getActiveBoss")      return getActiveBoss(e.parameter.bossName);
    if (action === "getBossLeaderboard") return getBossLeaderboard(e.parameter.bossName);
    if (action === "getPlayerStats")     return getPlayerStats(e.parameter.studentId);

    // ── Bundle (โหลดทุกอย่างใน 1 call) ──────────────────
    if (action === "getChallengeBundle") return getChallengeBundle(e.parameter.setId, e.parameter.studentId);

    // ── Patch 4.0 Artifacts / Shop ─────────────────────────
    if (action === "getPlayerInventory")   return getPlayerInventory(e.parameter.studentId);
    if (action === "getItemLibrary")       return getItemLibrary();
    if (action === "getUnlockConditions")  return getUnlockConditions(e.parameter.studentId);
    if (action === "getShopBundle")        return getShopBundle(e.parameter.studentId);

    return ok({ error: "Unknown action: " + action });
  } catch(err) { return ok({ error: err.message }); }
}

// ============================================================
// doPost — ทุก action ในนี้ "เขียน" ข้อมูลลง Sheet
// ครอบด้วย LockService ทั้งหมดจุดเดียว กันข้อมูลชนกันตอนมีคน
// เขียนพร้อมกัน (เช่น ตีบอสพร้อมกันหลายคน, ซื้อของพร้อมกัน,
// ส่งผลสอบพร้อมกันตอนหมดเวลาคาบเรียน)
//
// ใช้ Script Lock เดียวครอบทั้งฟังก์ชัน เพื่อไม่ให้ซับซ้อนเรื่อง
// lock ซ้อนกัน (เช่น claimArtifact เรียก grantArtifact ข้างใน)
// รอคิวได้สูงสุด 10 วินาที ถ้ายังไม่ว่างจะแจ้ง error กลับไปแทน
// การรอเงียบๆ จนกว่า Apps Script จะ timeout เอง
// ============================================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return ok({ error: "ระบบกำลังประมวลผลคำขออื่นอยู่ กรุณาลองใหม่อีกครั้ง" });
  }

  try {
    const data = JSON.parse(e.postData.contents);
    // ── เดิม ──────────────────────────────────────────────
    if (data.action === "saveResult")        return saveResult(data);
    if (data.action === "saveRareProgress")  return saveRareProgressSingle(data);

    // ── Patch 3.0 Boss ────────────────────────────────────
    if (data.action === "saveBossDamage")    return saveBossDamage(data);
    // หมายเหตุ: รางวัลบอสแจกอัตโนมัติผ่าน _processBossRewards() ตอนบอสตาย
    // ไม่ต้องมี action แยกสำหรับ claim boss reward

    // ── Patch 4.0 Artifacts / Shop ─────────────────────────
    if (data.action === "buyArtifact")       return buyArtifact(data);
    if (data.action === "upgradeArtifact")   return upgradeArtifact(data);
    if (data.action === "grantArtifact")     return grantArtifact(data); // ระบบแจก (boss/admin)
    if (data.action === "claimArtifact")     return claimArtifact(data); // ผู้เล่นกดรับเอง
    if (data.action === "setCompanion")      return setCompanion(data);  // ตั้งคู่หู

    return ok({ error: "Unknown action: " + data.action });
  } catch(err) {
    return ok({ error: err.message });
  } finally {
    lock.releaseLock(); // ปล่อย lock เสมอ ไม่ว่าจะสำเร็จหรือ error (เรียกได้เพราะมั่นใจว่าถือ lock อยู่จริง)
  }
}

// ============================================================
// PATCH 3.0 — BOSS MODE
// ============================================================

// ── ดึงบอสที่ Active อยู่ตอนนี้ ──────────────────────────────
//
// Sheet "Boss":
// A: Name  B: GifUrl  C: HP Max  D: DEF  E: HP คงเหลือ
// F: Regen G: Status  H: Reward_Top1  I: Reward_Top2
// J: Reward_Top3  K: Reward_Top4  L: Reward_Top5
// M: Reward_Last  N: Reward_Most  O: ArtifactReward
// P: ArtifactRecipient (Top1/Last/Most/All)
//
// ── ดึงบอสตามชื่อ (ถ้าไม่ส่งชื่อ → ดึงตัวแรกที่ Active) ──
function getActiveBoss(bossName) {
  const sheet = getSheet("Boss");
  const rows  = sheet.getDataRange().getValues().slice(1);
  const row   = bossName
    ? rows.find(r =>
        String(r[0]).trim() === String(bossName).trim() &&
        String(r[6]).trim().toLowerCase() === "active")
    : rows.find(r => String(r[6]).trim().toLowerCase() === "active");
  if (!row) return ok({ boss: null });

  return ok({
    boss: {
      name:        String(row[0]),
      gifUrl:      row[1] ? getFastImageUrl(String(row[1])) : "",
      hpMax:       Number(row[2]) || 0,
      def:         Number(row[3]) || 0,
      hpCurrent:   Number(row[4]) || 0,
      regen:       Number(row[5]) || 0,
      status:      String(row[6]),
      rewards: {
        top1: Number(row[7])  || 0,
        top2: Number(row[8])  || 0,
        top3: Number(row[9])  || 0,
        top4: Number(row[10]) || 0,
        top5: Number(row[11]) || 0,
        last: Number(row[12]) || 0,
        most: Number(row[13]) || 0,
      },
      artifactReward:     row[14] ? String(row[14]).trim() : "",
      artifactRecipient:  row[15] ? String(row[15]).trim() : "",
    }
  });
}

// ── บันทึก Damage ──────────────────────────────────────────
//
// Sheet "BossDamageLog":
// A: Timestamp  B: BossName  C: StudentID  D: Nickname
// E: Damage     F: QuestionID  G: SetName
//
// คำนวณใน Sheet:
// - HP คงเหลือใน Boss = C(HP Max) - SUM ของ damage ทั้งหมดต่อบอสนั้น + regen
// - ดูจาก BossDamageLog โดยใช้ SUMIF
//
function saveBossDamage(data) {
  // data = { bossName, studentId, nickname, damage, questionId, setName }

  // 1. บันทึก damage log
  const logSheet = getOrCreateSheet("BossDamageLog", [
    "Timestamp","BossName","StudentID","Nickname","Damage","QuestionID","SetName"
  ]);
  logSheet.appendRow([
    new Date(),
    data.bossName    || "",
    data.studentId   || "",
    data.nickname    || "",
    data.damage      || 0,
    data.questionId  || "",
    data.setName     || "",
  ]);

  // 2. คำนวณ HP ปัจจุบันของบอส (จาก Sheet Boss)
  const bossSheet = getSheet("Boss");
  const bossRows  = bossSheet.getDataRange().getValues();
  let bossRowIdx  = -1;
  for (let i = 1; i < bossRows.length; i++) {
    if (String(bossRows[i][0]).trim() === String(data.bossName).trim()) {
      bossRowIdx = i; break;
    }
  }

  if (bossRowIdx === -1) return ok({ success: false, error: "ไม่พบบอส" });

  const hpMax     = Number(bossRows[bossRowIdx][2]) || 0;
  const currentHp = Number(bossRows[bossRowIdx][4]) || 0;
  const newHp     = Math.max(0, currentHp - (data.damage || 0));

  // อัปเดต HP คงเหลือใน Sheet Boss (column E = index 4 → col 5)
  bossSheet.getRange(bossRowIdx + 1, 5).setValue(newHp);

  // 3. เช็คว่าบอสตายไหม
  if (newHp <= 0) {
    bossSheet.getRange(bossRowIdx + 1, 7).setValue("Dead");
    // แจกรางวัล
    _processBossRewards(data.bossName, bossRows[bossRowIdx]);
    return ok({ success: true, bossDefeated: true, newHp: 0 });
  }

  return ok({ success: true, bossDefeated: false, newHp });
}

// ── คำนวณและแจกรางวัลเมื่อบอสตาย ──────────────────────────
function _processBossRewards(bossName, bossRow) {
  const rewards = {
    top1: Number(bossRow[7])  || 0,
    top2: Number(bossRow[8])  || 0,
    top3: Number(bossRow[9])  || 0,
    top4: Number(bossRow[10]) || 0,
    top5: Number(bossRow[11]) || 0,
    last: Number(bossRow[12]) || 0,
    most: Number(bossRow[13]) || 0,
  };
  const artifactReward    = bossRow[14] ? String(bossRow[14]).trim() : "";
  const artifactRecipient = bossRow[15] ? String(bossRow[15]).trim() : "";

  // ดึง damage log ของบอสนี้
  const logSheet = getSheet("BossDamageLog");
  const logRows  = logSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]).trim() === String(bossName).trim());

  if (!logRows.length) return;

  // สรุป damage รวมต่อนักเรียน
  const totalDmg = {}; // { studentId: { total, nickname } }
  logRows.forEach(r => {
    const sid = String(r[2]);
    if (!totalDmg[sid]) totalDmg[sid] = { total: 0, nickname: String(r[3]) };
    totalDmg[sid].total += Number(r[4]) || 0;
  });

  // Top 5 damage รวม
  const sorted = Object.entries(totalDmg)
    .sort((a,b) => b[1].total - a[1].total);

  const topKeys = ["top1","top2","top3","top4","top5"];
  sorted.slice(0, 5).forEach(([sid, info], idx) => {
    _addGold(sid, rewards[topKeys[idx]] || 0, `Boss Kill Top${idx+1}: ${bossName}`);
  });

  // Last hit (คนปิดเกม = คนสุดท้ายใน log)
  const lastRow = logRows[logRows.length - 1];
  const lastSid = String(lastRow[2]);
  _addGold(lastSid, rewards.last, `Boss Kill Last Hit: ${bossName}`);

  // Most damage ใน 1 ครั้ง
  const mostHit = logRows.reduce((max, r) =>
    Number(r[4]) > Number(max[4]) ? r : max, logRows[0]);
  const mostSid = String(mostHit[2]);
  _addGold(mostSid, rewards.most, `Boss Kill Most Damage: ${bossName}`);

  // Artifact reward
  if (artifactReward) {
    let recipients = [];
    if (artifactRecipient === "Top1")   recipients = sorted.slice(0,1).map(([sid])=>sid);
    else if (artifactRecipient === "Last")  recipients = [lastSid];
    else if (artifactRecipient === "Most")  recipients = [mostSid];
    else if (artifactRecipient === "All")   recipients = sorted.map(([sid])=>sid);

    recipients.forEach(sid => {
      grantArtifact({ studentId: sid, artifactId: artifactReward, source: "BossReward:" + bossName });
    });
  }

  // บันทึก reward log
  sorted.slice(0, 5).forEach(([sid, info], idx) => {
    _logReward(bossName, sid, info.nickname, `Top${idx+1}`, rewards[topKeys[idx]] || 0);
  });
  _logReward(bossName, lastSid, lastRow[3], "Last", rewards.last);
  _logReward(bossName, mostSid, mostHit[3], "Most", rewards.most);
}

function _logReward(bossName, studentId, nickname, rewardType, gold) {
  const sheet = getOrCreateSheet("BossRewardLog", [
    "Timestamp","BossName","StudentID","Nickname","RewardType","GoldAmount"
  ]);
  sheet.appendRow([new Date(), bossName, studentId, nickname, rewardType, gold]);
}

// ── leaderboard damage รวมของบอสนี้ ──────────────────────
function getBossLeaderboard(bossName) {
  if (!bossName) return ok({ leaderboard: [] });
  const logSheet = getSheet("BossDamageLog");
  const logRows  = logSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]).trim() === String(bossName).trim());

  const totalDmg = {};
  const maxHit   = {};
  logRows.forEach(r => {
    const sid  = String(r[2]);
    const dmg  = Number(r[4]) || 0;
    const nick = String(r[3]);
    if (!totalDmg[sid]) totalDmg[sid] = { total: 0, max: 0, nickname: nick, hits: 0 };
    totalDmg[sid].total += dmg;
    totalDmg[sid].hits  += 1;
    if (dmg > totalDmg[sid].max) totalDmg[sid].max = dmg;
  });

  const leaderboard = Object.entries(totalDmg)
    .map(([sid, d]) => ({ studentId: sid, ...d }))
    .sort((a,b) => b.total - a.total);

  return ok({ leaderboard });
}

// ── Boss Regen (รันโดย Time Trigger ทุกวัน 00:00) ─────────
function dailyBossRegen() {
  const sheet = getSheet("Boss");
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const status = String(rows[i][6]).trim().toLowerCase();
    if (status !== "active") continue;
    const hpMax    = Number(rows[i][2]) || 0;
    const hpCur    = Number(rows[i][4]) || 0;
    const regen    = Number(rows[i][5]) || 0;
    const newHp    = Math.min(hpMax, hpCur + regen);
    sheet.getRange(i + 1, 5).setValue(newHp);
  }
  Logger.log("Boss regen done: " + new Date());
}

// ============================================================
// PATCH 4.0 — ARTIFACTS
// ============================================================

// ── Item Library ──────────────────────────────────────────
//
// Sheet "Item_Library":
// A: ArtifactID  B: Name  C: MaxLevel  D: IsSpecial (TRUE/FALSE)
// E: Description  F: CanBuy (TRUE/FALSE)
// G: UnlockCondition (PASS:SET1,SET2 หรือเว้นว่าง)
//
// Per-level data (Level 1-4, แต่ละ level ใช้ 7 columns):
// H: Lv1_HP  I: Lv1_ATK  J: Lv1_DEF  K: Lv1_SPD
// L: Lv1_Question  M: Lv1_Cost  N: Lv1_ImageId
// O: Lv2_HP  P: Lv2_ATK  ...  (ต่อไปเรื่อยๆ)
//
function getItemLibrary() {
  const cached = cacheGet("itemLibrary");
  if (cached) return ok(cached);
  const sheet = getSheet("Item_Library");
  const rows  = sheet.getDataRange().getValues().slice(1);

  const items = rows
    .filter(r => r[0])
    .map(r => {
      const maxLv   = parseInt(r[2]) || 1;
      const isSpec  = r[3] === true || r[3] === "TRUE";
      const levels  = [];
      for (let lv = 0; lv < maxLv; lv++) {
        const base = 7 + lv * 7; // H=7, O=14, V=21, ...
        levels.push({
          level:    lv + 1,
          hp:       Number(r[base])   || 0,
          atk:      Number(r[base+1]) || 0,
          def:      Number(r[base+2]) || 0,
          spd:      Number(r[base+3]) || 0,
          question: Number(r[base+4]) || 0,
          cost:     Number(r[base+5]) || 0,
          imageUrl: r[base+6] ? getFastImageUrl(String(r[base+6])) : "",
        });
      }
      return {
        artifactId:        String(r[0]),
        name:              String(r[1]),
        maxLevel:          maxLv,
        isSpecial:         isSpec,
        description:       r[4]  ? String(r[4])  : "",
        canBuy:            r[5]  !== false && r[5] !== "FALSE",
        unlockCondition:   r[6]  ? String(r[6])  : "",
        levels,
      };
    });

  const result = { items };
  cacheSet("itemLibrary", result);
  return ok(result);
}
//
// Sheet "Player_Inventory":
// A: StudentID  B: ArtifactID  C: ArtifactName  D: Level
// E: HP bonus  F: ATK bonus  G: DEF bonus  H: SPD bonus
// I: Question bonus  (คำนวณจาก Item_Library ตาม Level)
//
function getPlayerInventory(studentId) {
  const invSheet  = getSheet("Player_Inventory");
  const invRows   = invSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() === String(studentId).trim());

  const inventory = invRows.map(r => ({
    studentId:    String(r[0]),
    artifactId:   String(r[1]),
    artifactName: String(r[2]),
    level:        Number(r[3]) || 1,
    bonuses: {
      hp:       Number(r[4]) || 0,
      atk:      Number(r[5]) || 0,
      def:      Number(r[6]) || 0,
      spd:      Number(r[7]) || 0,
      question: Number(r[8]) || 0,
    }
  }));

  return ok({ inventory });
}

// ── ซื้อ Artifact ─────────────────────────────────────────
// data = { studentId, artifactId }
function buyArtifact(data) {
  // 1. เช็คว่ามี item นี้ในคลังไหม
  const libSheet = getSheet("Item_Library");
  const libRows  = libSheet.getDataRange().getValues().slice(1);
  const item     = libRows.find(r => String(r[0]).trim() === String(data.artifactId).trim());
  if (!item) return ok({ success: false, error: "ไม่พบ Artifact นี้" });

  const canBuy = item[5] !== false && item[5] !== "FALSE";
  if (!canBuy) return ok({ success: false, error: "Artifact นี้ไม่สามารถซื้อได้" });

  const lv1Bonuses = _getArtifactBonuses(item, 1);
  const cost = lv1Bonuses.cost; // ✅ แก้บั๊ก: เดิมอ่าน item[7] (HP) ผิด ต้องเป็น cost ของ Lv.1

  // 2. เช็ค gold
  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues();
  let statsRowIdx  = -1;
  for (let i = 1; i < statsRows.length; i++) {
    if (String(statsRows[i][1]).trim() === String(data.studentId).trim()) {
      statsRowIdx = i; break;
    }
  }
  if (statsRowIdx === -1) return ok({ success: false, error: "ไม่พบนักเรียน" });

  const currentGold = Number(statsRows[statsRowIdx][3]) || 0;
  if (currentGold < cost) return ok({ success: false, error: "Gold ไม่พอ" });

  // 3. เช็คว่ามี Artifact นี้อยู่แล้วไหม
  const invSheet = getSheet("Player_Inventory");
  const invRows  = invSheet.getDataRange().getValues().slice(1);
  const existing = invRows.find(r =>
    String(r[0]).trim() === String(data.studentId).trim() &&
    String(r[1]).trim() === String(data.artifactId).trim()
  );

  if (existing) {
    // มีอยู่แล้ว → แปลงเป็น Gold 300
    statsSheet.getRange(statsRowIdx + 1, 4).setValue(currentGold + 300);
    _logGoldTransaction(data.studentId, 300, "Duplicate Artifact → Gold: " + data.artifactId);
    return ok({ success: true, duplicate: true, goldReceived: 300 });
  }

  // 4. หัก Gold + เพิ่ม Inventory
  statsSheet.getRange(statsRowIdx + 1, 4).setValue(currentGold - cost);

  invSheet.appendRow([
    data.studentId,
    item[0], // ArtifactID
    item[1], // Name
    1,       // Level
    lv1Bonuses.hp,
    lv1Bonuses.atk,
    lv1Bonuses.def,
    lv1Bonuses.spd,
    lv1Bonuses.question,
  ]);

  _logGoldTransaction(data.studentId, -cost, "Buy Artifact: " + item[1]);
  _updatePlayerStats(data.studentId);

  return ok({ success: true, duplicate: false, goldSpent: cost });
}

// ── อัพเกรด Artifact ──────────────────────────────────────
// data = { studentId, artifactId }
function upgradeArtifact(data) {
  const invSheet = getSheet("Player_Inventory");
  const invRows  = invSheet.getDataRange().getValues();
  let invRowIdx  = -1;

  for (let i = 1; i < invRows.length; i++) {
    if (String(invRows[i][0]).trim() === String(data.studentId).trim() &&
        String(invRows[i][1]).trim() === String(data.artifactId).trim()) {
      invRowIdx = i; break;
    }
  }
  if (invRowIdx === -1) return ok({ success: false, error: "ไม่มี Artifact นี้" });

  const currentLv = Number(invRows[invRowIdx][3]) || 1;

  // ดึงข้อมูล Item Library
  const libSheet = getSheet("Item_Library");
  const libRows  = libSheet.getDataRange().getValues().slice(1);
  const item     = libRows.find(r => String(r[0]).trim() === String(data.artifactId).trim());
  if (!item) return ok({ success: false, error: "ไม่พบ Artifact ในคลัง" });

  const maxLv  = parseInt(item[2]) || 1;
  const isSpec = item[3] === true || item[3] === "TRUE";

  if (isSpec) return ok({ success: false, error: "Artifact พิเศษ อัพเกรดไม่ได้" });
  if (currentLv >= maxLv) return ok({ success: false, error: "Artifact อยู่ Level สูงสุดแล้ว" });

  const nextLv      = currentLv + 1;
  const nextBonuses = _getArtifactBonuses(item, nextLv);
  const upgradeCost = nextBonuses.cost;

  // เช็ค Gold
  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues();
  let statsRowIdx  = -1;
  for (let i = 1; i < statsRows.length; i++) {
    if (String(statsRows[i][1]).trim() === String(data.studentId).trim()) {
      statsRowIdx = i; break;
    }
  }
  if (statsRowIdx === -1) return ok({ success: false, error: "ไม่พบนักเรียน" });

  const currentGold = Number(statsRows[statsRowIdx][3]) || 0;
  if (currentGold < upgradeCost) return ok({ success: false, error: "Gold ไม่พอ" });

  // หัก Gold + อัพ Level + อัพ bonuses
  statsSheet.getRange(statsRowIdx + 1, 4).setValue(currentGold - upgradeCost);
  invSheet.getRange(invRowIdx + 1, 4).setValue(nextLv);
  invSheet.getRange(invRowIdx + 1, 5).setValue(nextBonuses.hp);
  invSheet.getRange(invRowIdx + 1, 6).setValue(nextBonuses.atk);
  invSheet.getRange(invRowIdx + 1, 7).setValue(nextBonuses.def);
  invSheet.getRange(invRowIdx + 1, 8).setValue(nextBonuses.spd);
  invSheet.getRange(invRowIdx + 1, 9).setValue(nextBonuses.question);

  _logGoldTransaction(data.studentId, -upgradeCost, `Upgrade ${item[1]} Lv${currentLv}→${nextLv}`);
  _updatePlayerStats(data.studentId);

  return ok({ success: true, newLevel: nextLv, goldSpent: upgradeCost });
}

// ── แจก Artifact (รางวัล/ระบบ/Admin) ─────────────────────
// data = { studentId, artifactId, source }
function grantArtifact(data) {
  const libSheet = getSheet("Item_Library");
  const libRows  = libSheet.getDataRange().getValues().slice(1);
  const item     = libRows.find(r => String(r[0]).trim() === String(data.artifactId).trim());
  if (!item) return ok({ success: false, error: "ไม่พบ Artifact" });

  // เช็คว่ามีอยู่แล้วไหม
  const invSheet = getSheet("Player_Inventory");
  const invRows  = invSheet.getDataRange().getValues().slice(1);
  const existing = invRows.find(r =>
    String(r[0]).trim() === String(data.studentId).trim() &&
    String(r[1]).trim() === String(data.artifactId).trim()
  );

  if (existing) {
    // แปลงเป็น Gold 300
    _addGold(data.studentId, 300, "Duplicate Grant → Gold: " + item[1]);
    return ok({ success: true, duplicate: true, goldReceived: 300 });
  }

  const isSpec  = item[3] === true || item[3] === "TRUE";
  const maxLv   = isSpec ? parseInt(item[2]) || 1 : 1;
  const bonuses = _getArtifactBonuses(item, maxLv);

  invSheet.appendRow([
    data.studentId,
    item[0], item[1],
    maxLv,   // Special = Lv.Max ทันที
    bonuses.hp, bonuses.atk, bonuses.def, bonuses.spd, bonuses.question,
  ]);

  _updatePlayerStats(data.studentId);
  return ok({ success: true, duplicate: false });
}

// ── เช็คเงื่อนไข Unlock Artifact อัตโนมัติ ────────────────
// เช็คว่านักเรียนมีสิทธิ์ได้ Artifact จากการผ่านข้อสอบครบไหม
// ── เช็คเงื่อนไข PASS: ทั้งหมด — ไม่แจกอัตโนมัติ แค่บอกว่าใครมีสิทธิ์รับ ──
// ใช้ในหน้า Shop: แสดงเงื่อนไข + ปุ่ม "รับ" ถ้าเงื่อนไขครบ
function getUnlockConditions(studentId) {
  const libSheet     = getSheet("Item_Library");
  const libRows      = libSheet.getDataRange().getValues().slice(1);
  const invSheet     = getSheet("Player_Inventory");
  const invRows      = invSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() === String(studentId).trim());
  const ownedIds     = new Set(invRows.map(r => String(r[1]).trim()));

  const resultsSheet = getSheet("QuizResults");
  const resultsRows  = resultsSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]).trim() === String(studentId).trim() && r[7] === "ผ่าน");
  const passedSets   = new Set(resultsRows.map(r => String(r[4]).trim()));

  const conditions = libRows
    .filter(item => item[0] && item[6] && String(item[6]).trim().startsWith("PASS:"))
    .filter(item => !ownedIds.has(String(item[0]).trim())) // ไม่แสดงถ้ามีแล้ว
    .map(item => {
      const conditionRaw = String(item[6]).trim().replace("PASS:", "");
      const required     = conditionRaw.split(",").map(s => s.trim()).filter(Boolean);
      const met           = required.every(s => passedSets.has(s));
      return {
        artifactId:   String(item[0]),
        name:         String(item[1]),
        conditionText: "ผ่าน: " + required.join(", "),
        required,
        met,
      };
    });

  return ok({ conditions });
}

// ── รับ Artifact จากเงื่อนไขที่ปลดล็อกแล้ว (ปุ่ม "รับ" ในร้านค้า) ──
// data = { studentId, artifactId }
function claimArtifact(data) {
  const libSheet = getSheet("Item_Library");
  const libRows  = libSheet.getDataRange().getValues().slice(1);
  const item     = libRows.find(r => String(r[0]).trim() === String(data.artifactId).trim());
  if (!item) return ok({ success: false, error: "ไม่พบ Artifact นี้" });

  const conditionRaw = item[6] ? String(item[6]).trim() : "";
  if (!conditionRaw.startsWith("PASS:")) {
    return ok({ success: false, error: "Artifact นี้ไม่มีเงื่อนไขให้กดรับ" });
  }

  // ตรวจสอบเงื่อนไขซ้ำอีกครั้งฝั่ง Server กันโกง
  const required     = conditionRaw.replace("PASS:", "").split(",").map(s => s.trim()).filter(Boolean);
  const resultsSheet = getSheet("QuizResults");
  const resultsRows  = resultsSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]).trim() === String(data.studentId).trim() && r[7] === "ผ่าน");
  const passedSets   = new Set(resultsRows.map(r => String(r[4]).trim()));
  const allPassed    = required.every(s => passedSets.has(s));

  if (!allPassed) return ok({ success: false, error: "เงื่อนไขยังไม่ครบ" });

  // เงื่อนไขครบ → แจก (grantArtifact จัดการเรื่องซ้ำ → Gold 300 ให้เอง)
  return grantArtifact({ studentId: data.studentId, artifactId: data.artifactId, source: "ClaimShop" });
}

// ── ตั้งค่า Artifact คู่หู (Companion) ──────────────────────
// data = { studentId, artifactId }  — ส่ง artifactId ว่าง "" เพื่อยกเลิกคู่หู
//
// เพิ่ม Column N ใน Sheet "Player_Stats": CompanionArtifactId
//
function setCompanion(data) {
  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < statsRows.length; i++) {
    if (String(statsRows[i][1]).trim() === String(data.studentId).trim()) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return ok({ success: false, error: "ไม่พบนักเรียน" });

  // ถ้าระบุ artifactId ต้องเช็คว่าผู้เล่นมี Artifact นี้จริง
  if (data.artifactId) {
    const invSheet = getSheet("Player_Inventory");
    const invRows  = invSheet.getDataRange().getValues().slice(1);
    const owns = invRows.some(r =>
      String(r[0]).trim() === String(data.studentId).trim() &&
      String(r[1]).trim() === String(data.artifactId).trim()
    );
    if (!owns) return ok({ success: false, error: "คุณไม่มี Artifact นี้" });
  }

  statsSheet.getRange(rowIdx + 1, 14).setValue(data.artifactId || ""); // Column N (index 13 → col 14)
  return ok({ success: true, companionArtifactId: data.artifactId || "" });
}

// ============================================================
// SHOP BUNDLE — โหลดทุกอย่างที่หน้า Shop ต้องใช้ใน 1 call
// ============================================================
// ⚡ Optimized: อ่านแต่ละ Sheet แค่ครั้งเดียว (เดิมอ่าน Item_Library
// และ Player_Inventory ซ้ำ 2 รอบผ่าน wrapper function คนละตัว)
// และคำนวณ object ตรงๆ แทนการยิง JSON.stringify/parse ผ่าน ContentService
function getShopBundle(studentId) {
  // 1. Item_Library — ใช้ cache เดิมถ้ามี ไม่งั้นอ่านจาก Sheet ครั้งเดียว
  let library = cacheGet("itemLibrary")?.items;
  if (!library) {
    const libSheet = getSheet("Item_Library");
    const libRows  = libSheet.getDataRange().getValues().slice(1);
    library = libRows
      .filter(r => r[0])
      .map(r => {
        const maxLv  = parseInt(r[2]) || 1;
        const isSpec = r[3] === true || r[3] === "TRUE";
        const levels = [];
        for (let lv = 0; lv < maxLv; lv++) {
          const base = 7 + lv * 7;
          levels.push({
            level: lv + 1,
            hp: Number(r[base]) || 0, atk: Number(r[base+1]) || 0,
            def: Number(r[base+2]) || 0, spd: Number(r[base+3]) || 0,
            question: Number(r[base+4]) || 0, cost: Number(r[base+5]) || 0,
            imageUrl: r[base+6] ? getFastImageUrl(String(r[base+6])) : "",
          });
        }
        return {
          artifactId: String(r[0]), name: String(r[1]), maxLevel: maxLv,
          isSpecial: isSpec, description: r[4] ? String(r[4]) : "",
          canBuy: r[5] !== false && r[5] !== "FALSE",
          unlockCondition: r[6] ? String(r[6]) : "",
          levels,
        };
      });
    cacheSet("itemLibrary", { items: library });
  }

  // 2. Player_Inventory — อ่านครั้งเดียว ใช้ร่วมกันทั้ง inventory + ownedIds
  const invSheet = getSheet("Player_Inventory");
  const invRowsAll = invSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() === String(studentId).trim());
  const inventory = invRowsAll.map(r => ({
    studentId: String(r[0]), artifactId: String(r[1]), artifactName: String(r[2]),
    level: Number(r[3]) || 1,
    bonuses: {
      hp: Number(r[4]) || 0, atk: Number(r[5]) || 0, def: Number(r[6]) || 0,
      spd: Number(r[7]) || 0, question: Number(r[8]) || 0,
    }
  }));
  const ownedIds = new Set(inventory.map(i => i.artifactId));

  // 3. Player_Stats
  const statsSheet = getSheet("Player_Stats");
  const statsRow = statsSheet.getDataRange().getValues().slice(1)
    .find(r => String(r[1]).trim() === String(studentId).trim());
  const stats = statsRow ? {
    studentId: String(statsRow[1]), exp: Number(statsRow[2]) || 0, gold: Number(statsRow[3]) || 0,
    base: { hp: Number(statsRow[4]) || 1, atk: Number(statsRow[5]) || 1, def: Number(statsRow[6]) || 1, spd: Number(statsRow[7]) || 1 },
    effective: {
      hp: Number(statsRow[8]) || 1, atk: Number(statsRow[9]) || 1,
      def: Number(statsRow[10]) || 1, spd: Number(statsRow[11]) || 1,
      question: Number(statsRow[12]) || 0,
    },
    companionArtifactId: statsRow[13] ? String(statsRow[13]).trim() : "",
  } : null;

  // 4. QuizResults — เฉพาะที่ต้องใช้เช็คเงื่อนไข PASS:
  const resultsSheet = getSheet("QuizResults");
  const passedSets = new Set(
    resultsSheet.getDataRange().getValues().slice(1)
      .filter(r => String(r[1]).trim() === String(studentId).trim() && r[7] === "ผ่าน")
      .map(r => String(r[4]).trim())
  );

  // 5. คำนวณ conditions จาก library ที่มีอยู่แล้ว (ไม่อ่าน Sheet ซ้ำ)
  const conditions = library
    .filter(item => item.unlockCondition && item.unlockCondition.startsWith("PASS:"))
    .filter(item => !ownedIds.has(item.artifactId))
    .map(item => {
      const required = item.unlockCondition.replace("PASS:", "").split(",").map(s => s.trim()).filter(Boolean);
      return {
        artifactId: item.artifactId, name: item.name,
        conditionText: "ผ่าน: " + required.join(", "),
        required, met: required.every(s => passedSets.has(s)),
      };
    });

  return ok({ library, inventory, stats, conditions });
}


// ── Player Stats ──────────────────────────────────────────
//
// Sheet "Player_Stats":
// A: ลำดับ  B: StudentID  C: EXP  D: Gold
// E: HP base  F: ATK base  G: DEF base  H: SPD base
// I: HP สุทธิ  J: ATK สุทธิ  K: DEF สุทธิ  L: SPD สุทธิ
// M: Question bonus รวม (จาก Artifacts)
// N: CompanionArtifactId ← ใหม่! Patch 4.0 (ArtifactID ที่ตั้งเป็นคู่หู)
// (I-L คำนวณจาก base + sum ของ Inventory bonus)
//
function getPlayerStats(studentId) {
  const sheet = getSheet("Player_Stats");
  const rows  = sheet.getDataRange().getValues().slice(1);
  const row   = rows.find(r => String(r[1]).trim() === String(studentId).trim());
  if (!row) return ok({ stats: null });

  return ok({
    stats: {
      studentId: String(row[1]),
      exp:       Number(row[2]) || 0,
      gold:      Number(row[3]) || 0,
      base: {
        hp:  Number(row[4]) || 1,
        atk: Number(row[5]) || 1,
        def: Number(row[6]) || 1,
        spd: Number(row[7]) || 1,
      },
      effective: {
        hp:       Number(row[8])  || 1,
        atk:      Number(row[9])  || 1,
        def:      Number(row[10]) || 1,
        spd:      Number(row[11]) || 1,
        question: Number(row[12]) || 0,
      },
      companionArtifactId: row[13] ? String(row[13]).trim() : "",
    }
  });
}

// ── อัพเดท effective stats ของนักเรียน (รวม Artifact bonus) ─
function _updatePlayerStats(studentId) {
  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues();
  let statsRowIdx  = -1;
  for (let i = 1; i < statsRows.length; i++) {
    if (String(statsRows[i][1]).trim() === String(studentId).trim()) {
      statsRowIdx = i; break;
    }
  }
  if (statsRowIdx === -1) return;

  // รวม bonus จาก Inventory
  const invSheet = getSheet("Player_Inventory");
  const invRows  = invSheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() === String(studentId).trim());

  let totalHp = 0, totalAtk = 0, totalDef = 0, totalSpd = 0, totalQ = 0;
  invRows.forEach(r => {
    totalHp  += Number(r[4]) || 0;
    totalAtk += Number(r[5]) || 0;
    totalDef += Number(r[6]) || 0;
    totalSpd += Number(r[7]) || 0;
    totalQ   += Number(r[8]) || 0;
  });

  const baseHp  = Number(statsRows[statsRowIdx][4]) || 1;
  const baseAtk = Number(statsRows[statsRowIdx][5]) || 1;
  const baseDef = Number(statsRows[statsRowIdx][6]) || 1;
  const baseSpd = Number(statsRows[statsRowIdx][7]) || 1;

  // อัพ effective stats (col I-M = 9-13)
  statsSheet.getRange(statsRowIdx + 1, 9).setValue(baseHp  + totalHp);
  statsSheet.getRange(statsRowIdx + 1, 10).setValue(baseAtk + totalAtk);
  statsSheet.getRange(statsRowIdx + 1, 11).setValue(baseDef + totalDef);
  statsSheet.getRange(statsRowIdx + 1, 12).setValue(baseSpd + totalSpd);
  statsSheet.getRange(statsRowIdx + 1, 13).setValue(totalQ);
}

// ── Gold helpers ──────────────────────────────────────────
function _addGold(studentId, amount, reason) {
  const sheet = getSheet("Player_Stats");
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === String(studentId).trim()) {
      const cur = Number(rows[i][3]) || 0;
      sheet.getRange(i + 1, 4).setValue(cur + amount);
      _logGoldTransaction(studentId, amount, reason);
      return;
    }
  }
}

function _logGoldTransaction(studentId, amount, reason) {
  const sheet = getOrCreateSheet("GoldLog", [
    "Timestamp","StudentID","Amount","Reason","Balance"
  ]);
  // หา balance ปัจจุบัน
  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues().slice(1);
  const row        = statsRows.find(r => String(r[1]).trim() === String(studentId).trim());
  const balance    = row ? Number(row[3]) || 0 : 0;
  sheet.appendRow([new Date(), studentId, amount, reason, balance]);
}

// ── ดึง bonus ของ Artifact ตาม Level ──────────────────────
function _getArtifactBonuses(itemRow, level) {
  // itemRow คือ array ของ row ใน Item_Library
  // Level data เริ่มที่ index 7 (col H) ทุก 7 cols
  const base = 7 + (level - 1) * 7;
  return {
    hp:       Number(itemRow[base])   || 0,
    atk:      Number(itemRow[base+1]) || 0,
    def:      Number(itemRow[base+2]) || 0,
    spd:      Number(itemRow[base+3]) || 0,
    question: Number(itemRow[base+4]) || 0,
    cost:     Number(itemRow[base+5]) || 0,
    imageUrl: itemRow[base+6] ? getFastImageUrl(String(itemRow[base+6])) : "",
  };
}

// ============================================================
// EXISTING FUNCTIONS (คงเดิม)
// ============================================================

function getQuestions(setName) {
  const cacheKey = "questions_" + (setName || "all");
  const cached = cacheGet(cacheKey);
  if (cached) return ok(cached);
  const sheet = getSheet("QuestionBank");
  const rows  = sheet.getDataRange().getValues().slice(1);
  const questions = rows
    .filter(r => r[0] && (!setName || r[2] === setName))
    .map(r => {
      const qType = r[14] ? String(r[14]).trim().toLowerCase() : "mc";
      const isText = qType === "text";
      const pts = r[15] ? parseFloat(r[15]) : 1;
      return {
        id:                String(r[0]),
        groupId:           String(r[1]),
        setName:           String(r[2]),
        setText:           r[3]  ? String(r[3])  : "",
        imageId:           r[4]  ? String(r[4])  : "",
        imageUrl:          r[4]  ? getFastImageUrl(String(r[4])) : "",
        choices:           isText ? [] : [String(r[5]),String(r[6]),String(r[7]),String(r[8])],
        answer:            isText ? -1 : parseInt(r[9]) - 1,
        correctTextAnswer: isText ? String(r[9]) : "",
        questionType:      isText ? "text" : "mc",
        isRare:            r[10] === true || r[10] === "TRUE" || r[10] === "true",
        seriesId:          r[11] ? String(r[11]) : "",
        linkText:          r[12] ? String(r[12]) : "",
        linkVideo:         r[13] ? String(r[13]) : "",
        points:            isNaN(pts) ? 1 : pts,
        solutionText:      r[16] ? String(r[16]) : "",
      };
    });
  const result = { questions };
  cacheSet(cacheKey, result);
  return ok(result);
}

function getStudent(studentId) {
  const sheet = getSheet("Identity");
  const rows  = sheet.getDataRange().getValues().slice(1);
  const row   = rows.find(r =>
    String(r[1]).trim().replace(/\s/g,"") === String(studentId).trim().replace(/\s/g,"")
  );
  if (!row) return ok({ error: "ไม่พบรหัสนักเรียน" });
  return ok({
    student: {
      rank: row[0], id: String(row[1]), fullName: String(row[2]),
      firstName: String(row[3]), lastName: String(row[4]),
      nickname: String(row[5]), title: row[6] ? String(row[6]) : "",
    }
  });
}

function getConfig(setId) {
  const cacheKey = "config_" + setId;
  const cached = cacheGet(cacheKey);
  if (cached) return ok(cached);

  try {
    const sheet = getSheet("QuizConfig");
    const rows  = sheet.getDataRange().getValues().slice(1);
    const row   = rows.find(r => String(r[0]).trim() === String(setId).trim());
    if (!row) return ok({ config: null });
    const bgImageId = row[5] ? String(row[5]).trim() : "";
    const result = {
      config: {
        logoEmoji:        row[1] ? String(row[1]) : "⚔",
        themeColor:       row[2] ? String(row[2]) : "#d4af37",
        fontSize:         row[3] ? String(row[3]) : "22px",
        bgColor:          row[4] ? String(row[4]) : "#0d0803",
        bgImageUrl:       bgImageId ? getFastImageUrl(bgImageId) : "",
        shuffleQuestions: row[6] !== false && row[6] !== "FALSE",
      }
    };
    cacheSet(cacheKey, result);
    return ok(result);
  } catch { return ok({ config: null }); }
}

function getCharacter(setId) {
  try {
    const sheet = getSheet("CharacterConfig");
    const rows  = sheet.getDataRange().getValues().slice(1);
    const row   = rows.find(r => String(r[0]).trim() === String(setId).trim());
    if (!row) return ok({ character: null });
    return ok({
      character: {
        setId: String(row[0]),
        passImageId:    row[1] ? String(row[1]).trim() : "",
        failImageId:    row[2] ? String(row[2]).trim() : "",
        perfectImageId: row[3] ? String(row[3]).trim() : "",
        passMsg:    row[4] ? String(row[4]) : "ผ่านแล้ว! 🎉",
        failMsg:    row[5] ? String(row[5]) : "สู้ต่อไปนะ! 💪",
        perfectMsg: row[6] ? String(row[6]) : "เต็มทุกข้อ! 🌟",
      }
    });
  } catch { return ok({ character: null }); }
}

function getChallengeConfig(setId) {
  try {
    const sheet = getSheet("QuizConfig");
    const rows  = sheet.getDataRange().getValues().slice(1);
    const row   = rows.find(r => String(r[0]).trim() === String(setId).trim());
    if (!row) return ok({ challengeConfig: null });
    const rawSets     = row[7] ? String(row[7]) : "";
    const challengeSets = rawSets.split(",").map(s=>s.trim()).filter(Boolean);
    const maxQ        = row[8]  ? parseInt(row[8])  : 0;
    const lives       = row[9]  ? parseInt(row[9])  : 3;
    const name        = row[10] ? String(row[10])   : "";
    const logoEmoji = row[11] ? String(row[11]).trim() : "";
const logoImageId = row[12] ? String(row[12]).trim() : "";
const bossName    = row[17] ? String(row[17]).trim() : "";

return ok({
  challengeConfig: {
    setId: String(row[0]), challengeSets,
    maxQuestions: isNaN(maxQ) ? 0 : maxQ,
    lives: isNaN(lives) ? 3 : lives,
    challengeName: name || String(row[0]),
    logoEmoji, logoImageId,
    logoImageUrl: logoImageId ? getFastImageUrl(logoImageId) : "",
    bossName,
      }
    });
  } catch { return ok({ challengeConfig: null }); }
}

function getQuizSets() {
  // ── Cache hit ──────────────────────────────────────────
  const cached = cacheGet("quizSets");
  if (cached) return ok(cached);

  try {
    const sheet = getSheet("QuizConfig");
    const rows  = sheet.getDataRange().getValues().slice(1);
    const sets  = rows
      .filter(r => {
        const setId        = String(r[0]).trim();
        const challengeSets = r[7] ? String(r[7]).trim() : "";
        return setId && !setId.startsWith("CHALL-") && !challengeSets;
      })
      .map(r => ({
        id:           String(r[0]).trim(),
        name:         r[13] ? String(r[13]).trim() : String(r[0]).trim(),
        total:        r[14] ? parseInt(r[14]) : 10,
        passingScore: r[15] ? parseInt(r[15]) : 8,
        timeLimit:    (r[16] ? parseInt(r[16]) : 30) * 60,
      }));
    const result = { sets };
    cacheSet("quizSets", result); // cache 5 นาที
    return ok(result);
  } catch(err) { return ok({ sets: [], error: err.message }); }
}

function saveResult(data) {
  const sheet = getOrCreateSheet("QuizResults", [
    "Timestamp","StudentID","ชื่อ-นามสกุล","ชื่อเล่น",
    "ชุดข้อสอบ","คะแนน","จำนวนข้อถูก","ผ่าน/ไม่ผ่าน",
    "เวลาที่ใช้(วินาที)","QuestionID ที่ถูก","QuestionID ที่ผิด"
  ]);
  sheet.appendRow([
    new Date(),
    data.studentId       || "", data.studentName     || "",
    data.studentNickname || "", data.setName         || "",
    data.score           || "", data.correctCount    || "",
    data.passed          || "", data.timeUsed        || 0,
    data.correctIds      || "", data.wrongIds        || "",
  ]);

  // หมายเหตุ: ไม่ auto-grant Artifact จากเงื่อนไข PASS: อีกต่อไป
  // นักเรียนต้องไปกดรับเองที่หน้าร้านค้า (Shop) หลังผ่านเงื่อนไขครบ
  // ดู getUnlockConditions() และ claimArtifact() ด้านล่าง

  return ok({ success: true });
}

function saveRareProgressSingle(data) {
  const sheet = getOrCreateSheet("RareProgress",["StudentID","SeriesID","QuestionIDs","Completed"]);
  const rows  = sheet.getDataRange().getValues();
  let found   = false;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0])===String(data.studentId) && String(rows[i][1])===String(data.seriesId)) {
      const existing = rows[i][2] ? rows[i][2].toString().split(",").filter(Boolean) : [];
      if (!existing.includes(data.questionId)) existing.push(data.questionId);
      const completed = isSeriesCompleted(data.seriesId, existing);
      sheet.getRange(i+1,3).setValue(existing.join(","));
      sheet.getRange(i+1,4).setValue(completed);
      found = true; break;
    }
  }
  if (!found) {
    const completed = isSeriesCompleted(data.seriesId,[data.questionId]);
    sheet.appendRow([data.studentId, data.seriesId, data.questionId, completed]);
  }
  return ok({ success: true });
}

function getRareProgress(studentId) {
  try {
    const sheet    = getSheet("RareProgress");
    const rows     = sheet.getDataRange().getValues().slice(1);
    const progress = rows
      .filter(r => String(r[0])===String(studentId))
      .map(r => ({
        seriesId:    String(r[1]),
        questionIds: r[2] ? r[2].toString().split(",").filter(Boolean) : [],
        completed:   r[3]===true||r[3]==="TRUE",
      }));
    return ok({ progress });
  } catch { return ok({ progress:[] }); }
}

// ============================================================
// HELPERS
// ============================================================
function isSeriesCompleted(seriesId, doneIds) {
  try {
    const sheet = getSheet("QuestionBank");
    const rows  = sheet.getDataRange().getValues().slice(1);
    const total = rows.filter(r =>
      String(r[11])===String(seriesId) &&
      (r[10]===true||r[10]==="TRUE"||r[10]==="true")
    ).length;
    return doneIds.length >= total && total > 0;
  } catch { return false; }
}

function getFastImageUrl(fileId) {
  if (!fileId) return "";
  let id = fileId.trim();
  if (id.includes("/d/"))      id = id.split("/d/")[1].split("/")[0];
  else if (id.includes("id=")) id = id.split("id=")[1].split("&")[0];
  return `https://lh3.googleusercontent.com/d/${id}`;
}

// ── เปิด Spreadsheet แค่ครั้งเดียวต่อ request แล้ว cache ไว้ใช้ซ้ำ ──
// เดิม: getSheet() เรียก SpreadsheetApp.openById() ทุกครั้งที่ถูกเรียก
// ทำให้ 1 request ที่ต้องอ่านหลาย Sheet (เช่น getShopBundle) เปิดซ้ำ 5-6 รอบ
// รอบละ ~100-300ms → ตอนนี้เปิดครั้งเดียวแล้วใช้ร่วมกันทั้ง request
let _cachedSpreadsheet = null;
function getSpreadsheet() {
  if (!_cachedSpreadsheet) _cachedSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _cachedSpreadsheet;
}

function getSheet(name) {
  const s = getSpreadsheet().getSheetByName(name);
  if (!s) throw new Error(`ไม่พบ Sheet ชื่อ "${name}"`);
  return s;
}

function getOrCreateSheet(name, headers) {
  const ss = getSpreadsheet();
  let s    = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); }
  return s;
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TRIGGERS — ตั้งใน Apps Script > Triggers
// ============================================================
// dailyBossRegen → Time-based → Day timer → Midnight (00:00)
// keepAlive      → Time-based → Minutes timer → Every 5 minutes

// ── Keep-Alive: ป้องกัน Cold Start ──────────────────────────
function keepAlive() {
  Logger.log("alive: " + new Date());
}

// ============================================================
// BUNDLE — โหลดทุกอย่างใน 1 call (เร็วกว่าเรียกแยก 4-5 ครั้ง)
// ============================================================
function getChallengeBundle(setId, studentId) {
  // 1. Challenge Config
  const cfgRaw = getChallengeConfig(setId);
  const cfgData = JSON.parse(cfgRaw.getContent());
  const cc = cfgData.challengeConfig;
  if (!cc) return ok({ error: "ไม่พบ Challenge Config สำหรับ " + setId });

  // 2. Boss (ถ้ามี bossName)
  let boss = null;
  if (cc.bossName) {
    try {
      const bossRaw = getActiveBoss(cc.bossName);
      boss = JSON.parse(bossRaw.getContent()).boss || null;
    } catch(e) { /* ไม่มีบอส ก็เล่น Challenge ปกติ */ }
  }

  // 3. PlayerStats
let playerStats = null;
if (studentId) {
  try {
    const statsResult = getPlayerStats(studentId);
    const statsContent = statsResult.getContent();
    const statsData = JSON.parse(statsContent);
    playerStats = statsData.stats || null;
    Logger.log("playerStats loaded: " + JSON.stringify(playerStats?.effective));
  } catch(e) {
    Logger.log("playerStats error: " + e.message);
  }
}

  // 4. Questions (ดึงทุก Set พร้อมกัน)
  const setIds = cc.challengeSets || [];
  const allQuestions = [];
  setIds.forEach(sid => {
    try {
      const qRaw = getQuestions(sid);
      const qData = JSON.parse(qRaw.getContent());
      (qData.questions || []).forEach(q => allQuestions.push(q));
    } catch(e) {}
  });

  return ok({
    challengeConfig: cc,
    boss:            boss,
    playerStats:     playerStats,
    questions:       allQuestions,
  });
}

// ============================================================
// TEST FUNCTIONS
// ============================================================
function testShopBundle() {
  const r = getShopBundle("691009");
  Logger.log(r.getContent());
}
function testUnlockConditions() {
  const r = getUnlockConditions("691009");
  Logger.log(r.getContent());
}
function testBossSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Boss");
  const rows  = sheet.getDataRange().getValues();
  Logger.log("จำนวนแถว: " + rows.length);
  Logger.log("Header: " + JSON.stringify(rows[0]));
  if (rows.length > 1) Logger.log("แถวที่ 2: " + JSON.stringify(rows[1]));
}
