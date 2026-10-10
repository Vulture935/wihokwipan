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
    if (action === "checkResultSaved")   return checkResultSaved(e.parameter.attemptId);

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
    if (action === "getGachaInfo")         return getGachaInfo(e.parameter.studentId);

    // ── Patch 5.0 Castle Mode ───────────────────────────────
    if (action === "getCastleList")        return getCastleList(e.parameter.studentId);
    if (action === "getCastleAttackBundle") return getCastleAttackBundle(e.parameter.targetOwnerId, e.parameter.attackerId);
    if (action === "getMyCastle")          return getMyCastle(e.parameter.studentId);
    if (action === "getCastleLeaderboard") return getCastleLeaderboard(e.parameter.studentId);

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
    if (data.action === "gachaDraw")         return gachaDraw(data);     // สุ่มกาชา

    // ── Patch 5.0 Castle Mode ───────────────────────────────
    if (data.action === "saveCastleAttack")  return saveCastleAttack(data);

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
  // data = { bossName, studentId, nickname, damage, questionId, setName, attemptId }

  // ⚡ กันบันทึกซ้ำจาก retry: ถ้า Client ส่ง attemptId มา เช็คก่อนว่า
  // เคยบันทึกรหัสนี้ไปแล้วหรือยัง (เช่น response หลุดหลังจาก Server
  // ประมวลผลสำเร็จไปแล้ว แล้ว Client เข้าใจว่า fail เลย retry ซ้ำ)
  // ต้อง Lock ที่ doPost ครอบอยู่แล้ว ทำให้เช็ค-แล้ว-เขียน ปลอดภัยจาก race
  if (data.attemptId && _isDuplicateBossAttempt(data.attemptId)) {
    return ok({ success: true, duplicate: true });
  }

  // 1. บันทึก damage log เสมอ (เพื่อสถิติ ไม่ว่าบอสจะตายไปแล้วหรือไม่)
  const logSheet = getOrCreateSheet("BossDamageLog", [
    "Timestamp","BossName","StudentID","Nickname","Damage","QuestionID","SetName","AttemptId"
  ]);
  logSheet.appendRow([
    new Date(),
    data.bossName    || "",
    data.studentId   || "",
    data.nickname    || "",
    data.damage      || 0,
    data.questionId  || "",
    data.setName     || "",
    data.attemptId   || "",
  ]);

  // 2. หาแถวบอส
  const bossSheet = getSheet("Boss");
  const bossRows  = bossSheet.getDataRange().getValues();
  let bossRowIdx  = -1;
  for (let i = 1; i < bossRows.length; i++) {
    if (String(bossRows[i][0]).trim() === String(data.bossName).trim()) {
      bossRowIdx = i; break;
    }
  }

  if (bossRowIdx === -1) return ok({ success: false, error: "ไม่พบบอส" });

  // ⚠️ กันแจกรางวัลซ้ำ: ถ้าบอสตายไปแล้ว ไม่คำนวณ/หัก HP/แจกรางวัลซ้ำอีก
  // (เดิม bug: ถ้า HP เหลือ 0 อยู่แล้ว newHp จะยังคง ≤0 ทุกครั้ง
  // ทำให้ _processBossRewards ถูกเรียกซ้ำทุกครั้งที่มีคนส่ง damage เข้ามาเพิ่ม
  // หลังบอสตายไปแล้ว — แก้โดยเช็ค Status ก่อนเสมอ)
  const currentStatus = String(bossRows[bossRowIdx][6]).trim().toLowerCase();
  if (currentStatus !== "active") {
    return ok({ success: true, bossDefeated: true, newHp: 0, alreadyDead: true });
  }

  const hpMax     = Number(bossRows[bossRowIdx][2]) || 0;
  const currentHp = Number(bossRows[bossRowIdx][4]) || 0;
  const newHp     = Math.max(0, currentHp - (data.damage || 0));

  // อัปเดต HP คงเหลือใน Sheet Boss (column E = index 4 → col 5)
  bossSheet.getRange(bossRowIdx + 1, 5).setValue(newHp);

  // 3. เช็คว่าบอสตายไหม
  if (newHp <= 0) {
    bossSheet.getRange(bossRowIdx + 1, 7).setValue("Dead");
    // แจกรางวัล (รันครั้งเดียวแน่นอน เพราะ Status ถูกเช็คกันไว้ที่ต้นฟังก์ชันแล้ว
    // และ Lock ที่ doPost รับประกันว่า request อื่นจะไม่มาแทรกระหว่างนี้)
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
// ── เช็คว่า attemptId นี้เคยถูกบันทึกไปแล้วหรือยัง (กัน retry ซ้ำ) ──
function _isDuplicateBossAttempt(attemptId) {
  const sheet = getSheet("BossDamageLog");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7] || "").trim() === String(attemptId).trim()) return true;
  }
  return false;
}

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

// ============================================================
// ผีเสื้อ → Gold — แปลงจำนวนผีเสื้อรวม (Identity col J) เป็น Gold
// ============================================================
// เพิ่ม Column O ใน Player_Stats ชื่อ "LastButterflySync" (ใส่ 0 ทุกแถวตอนเริ่ม)
// ระบบจะแปลงเฉพาะผีเสื้อที่ "เพิ่มขึ้นใหม่" เท่านั้น ไม่แปลงซ้ำของเดิม
//
// วิธีใช้: รันเองได้ หรือตั้ง Trigger รายวัน (Time-driven → Day timer)
// ============================================================
// ============================================================
// ระบบกาชา (Gacha) — สุ่ม Artifact ด้วย Gold
// ============================================================
// Sheet ใหม่ "Gacha_Pool":
// A: ArtifactID (ต้องตรงกับ Item_Library)
// B: Weight (น้ำหนักการสุ่ม ยิ่งสูงยิ่งออกง่าย)
// C: IsRare (TRUE/FALSE — ใช้กำหนดระบบการันตี)
// D: Active (TRUE/FALSE — เปิด/ปิดชั่วคราวได้)
//
// เพิ่ม Column P ใน Player_Stats ชื่อ "GachaPityCounter" (เริ่มที่ 0)
//
// กติกา:
// - สุ่มทีละ 1 ครั้ง ราคา GACHA_COST ต่อครั้ง
// - ได้ของซ้ำ → แปลงเป็น Gold 300 (ใช้ grantArtifact เดิม)
// - สุ่มครบ 10 ครั้งติดต่อกันโดยไม่ได้ของหายาก → การันตีของหายาก 1 ชิ้น
//   ในครั้งที่ 10 พอดี โดยพยายามเลี่ยงของหายากที่มีอยู่แล้ว
//   (เว้นแต่มีของหายากครบทุกชิ้นในสระแล้ว ถึงจะยอมให้ซ้ำ)
// - นับใหม่ (reset) ทุกครั้งที่ได้ของหายาก ไม่ว่าจะสุ่มได้เองหรือการันตี
// ============================================================

const GACHA_COST          = 1000; // Gold ต่อการสุ่ม 1 ครั้ง — แก้ได้ตามต้องการ
const GACHA_PITY_THRESHOLD = 10; // สุ่มครบกี่ครั้งถึงการันตีของหายาก

// ── ดึงข้อมูลกาชา (รายการ pool + สถานะ pity ของผู้เล่น) ──────
function getGachaInfo(studentId) {
  const poolSheet = getSheet("Gacha_Pool");
  const poolRows  = poolSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (r[3] === true || r[3] === "TRUE"));

  const libSheet = getSheet("Item_Library");
  const libRows  = libSheet.getDataRange().getValues().slice(1);
  const libMap = {};
  libRows.forEach(r => { libMap[String(r[0]).trim()] = r; });

  const pool = poolRows.map(r => {
    const artifactId = String(r[0]).trim();
    const libRow = libMap[artifactId];
    const name    = libRow ? String(libRow[1]) : artifactId;
    const imageId = libRow ? libRow[13] : ""; // Lv1 ImageID
    return {
      artifactId,
      name,
      isRare:   r[2] === true || r[2] === "TRUE",
      imageUrl: imageId ? getFastImageUrl(String(imageId)) : "",
    };
  });

  const statsSheet = getSheet("Player_Stats");
  const statsRow = statsSheet.getDataRange().getValues().slice(1)
    .find(r => String(r[1]).trim() === String(studentId).trim());

  const gold        = statsRow ? Number(statsRow[3])  || 0 : 0;
  const pityCounter = statsRow ? Number(statsRow[15]) || 0 : 0; // column P

  return ok({
    pool,
    cost: GACHA_COST,
    pityThreshold: GACHA_PITY_THRESHOLD,
    pityCounter,
    pullsUntilGuarantee: Math.max(0, GACHA_PITY_THRESHOLD - pityCounter),
    gold,
  });
}

// ── สุ่มกาชา 1 ครั้ง ──────────────────────────────────────
// data = { studentId }
function gachaDraw(data) {
  const studentId = data.studentId;

  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues();
  let statsRowIdx = -1;
  for (let i = 1; i < statsRows.length; i++) {
    if (String(statsRows[i][1]).trim() === String(studentId).trim()) { statsRowIdx = i; break; }
  }
  if (statsRowIdx === -1) return ok({ success: false, error: "ไม่พบนักเรียน" });

  const currentGold = Number(statsRows[statsRowIdx][3]) || 0;
  if (currentGold < GACHA_COST) return ok({ success: false, error: "Gold ไม่พอ" });

  // หัก Gold ก่อนเสมอ ไม่ว่าผลจะออกมาเป็นอะไร
  statsSheet.getRange(statsRowIdx + 1, 4).setValue(currentGold - GACHA_COST);
  _logGoldTransaction(studentId, -GACHA_COST, "Gacha Draw");

  // โหลด pool ที่เปิดใช้งานอยู่
  const poolSheet = getSheet("Gacha_Pool");
  const poolRows  = poolSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (r[3] === true || r[3] === "TRUE"));
  if (poolRows.length === 0) return ok({ success: false, error: "ยังไม่มีของในกาชา" });

  // เช็คว่าผู้เล่นมี Artifact อะไรอยู่แล้วบ้าง (สำหรับระบบการันตี)
  const invSheet = getSheet("Player_Inventory");
  const ownedIds = new Set(
    invSheet.getDataRange().getValues().slice(1)
      .filter(r => String(r[0]).trim() === String(studentId).trim())
      .map(r => String(r[1]).trim())
  );

  const pityCounter = (Number(statsRows[statsRowIdx][15]) || 0) + 1;
  const forcePity    = pityCounter >= GACHA_PITY_THRESHOLD;

  let chosenId = null;
  let pityTriggered = false;

  if (forcePity) {
    const rarePool = poolRows.filter(r => r[2] === true || r[2] === "TRUE");
    if (rarePool.length > 0) {
      // เลี่ยงของหายากที่มีอยู่แล้วก่อน ถ้ามีครบทุกชิ้นแล้วค่อยยอมให้ซ้ำ
      const unownedRare = rarePool.filter(r => !ownedIds.has(String(r[0]).trim()));
      const targetPool  = unownedRare.length > 0 ? unownedRare : rarePool;
      chosenId = _weightedPick(targetPool);
      pityTriggered = true;
    }
  }

  if (!chosenId) {
    chosenId = _weightedPick(poolRows); // สุ่มปกติตามน้ำหนักทั้ง pool
  }

  const chosenRow    = poolRows.find(r => String(r[0]).trim() === chosenId);
  const isRareResult = !!chosenRow && (chosenRow[2] === true || chosenRow[2] === "TRUE");

  // รีเซ็ต pity ถ้าได้ของหายาก ไม่ว่าจะสุ่มได้เองหรือถูกการันตี
  const newPityCounter = isRareResult ? 0 : pityCounter;
  statsSheet.getRange(statsRowIdx + 1, 16).setValue(newPityCounter); // column P

  // แจกของ — grantArtifact จัดการเรื่องซ้ำ → Gold 300 ให้เองอยู่แล้ว
  const grantRaw    = grantArtifact({ studentId, artifactId: chosenId, source: "Gacha" });
  const grantResult = JSON.parse(grantRaw.getContent());

  const libRow = getSheet("Item_Library").getDataRange().getValues().slice(1)
    .find(r => String(r[0]).trim() === chosenId);
  const name     = libRow ? String(libRow[1]) : chosenId;
  const imageId  = libRow ? libRow[13] : "";
  const imageUrl = imageId ? getFastImageUrl(String(imageId)) : "";

  return ok({
    success: true,
    artifactId: chosenId,
    name,
    imageUrl,
    isRare: isRareResult,
    duplicate: grantResult.duplicate || false,
    goldReceived: grantResult.duplicate ? 300 : 0,
    pityTriggered,
    pityCounter: newPityCounter,
    pullsUntilGuarantee: Math.max(0, GACHA_PITY_THRESHOLD - newPityCounter),
    goldSpent: GACHA_COST,
    goldRemaining: currentGold - GACHA_COST + (grantResult.duplicate ? 300 : 0),
  });
}

// ── สุ่มแบบถ่วงน้ำหนัก (weighted random) จาก array ของแถว Sheet ──
function _weightedPick(rows) {
  const totalWeight = rows.reduce((sum, r) => sum + (Number(r[1]) || 1), 0);
  let rand = Math.random() * totalWeight;
  for (const r of rows) {
    const w = Number(r[1]) || 1;
    if (rand < w) return String(r[0]).trim();
    rand -= w;
  }
  return String(rows[rows.length - 1][0]).trim(); // กันพลาดจาก floating point
}

const GOLD_PER_BUTTERFLY = 100;



function syncButterflyGold() {
  const identitySheet = getSheet("Identity");
  const statsSheet    = getSheet("Player_Stats");

  const identityRows = identitySheet.getDataRange().getValues().slice(1);
  const statsRows     = statsSheet.getDataRange().getValues();

  let updated = 0;
  identityRows.forEach(idRow => {
    const studentId      = String(idRow[1]).trim(); // Identity column B
    const butterflyTotal = Number(idRow[9]) || 0;     // Identity column J

    for (let i = 1; i < statsRows.length; i++) {
      if (String(statsRows[i][1]).trim() !== studentId) continue;

      const lastSynced     = Number(statsRows[i][14]) || 0; // Player_Stats column O (index 14)
      const newButterflies = butterflyTotal - lastSynced;

      if (newButterflies > 0) {
        const goldToAdd = newButterflies * GOLD_PER_BUTTERFLY;
        _addGold(studentId, goldToAdd, `ผีเสื้อ +${newButterflies} ตัว → Gold`);
        statsSheet.getRange(i + 1, 15).setValue(butterflyTotal); // อัปเดต column O
        updated++;
      }
      break;
    }
  });

  Logger.log(`syncButterflyGold เสร็จ: อัปเดต ${updated} คน`);
  return { updated };
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
    "เวลาที่ใช้(วินาที)","QuestionID ที่ถูก","QuestionID ที่ผิด","AttemptID",
    "QuestionID ที่ไม่ได้ตอบ","เวลาจริง(วินาที)"
  ]);
  // sheet นี้มีอยู่แล้วตั้งแต่ก่อนมีคอลัมใหม่ → getOrCreateSheet จะไม่ย้อนไป
  // เพิ่มหัวตารางให้ (สร้างหัวตารางเฉพาะตอนสร้างชีทใหม่เท่านั้น) จึงต้อง
  // เช็คเติมหัวตารางคอลัม L/M/N เองแบบ defensive ถ้ายังว่างอยู่
  const ATTEMPT_COL = 12;
  const BLANK_COL   = 13; // QuestionID ที่ไม่ได้ตอบ (ส่วนย่อยของ "ที่ผิด")
  const RAWTIME_COL = 14; // เวลาจริงที่ผ่านไป ไม่ตัดตามเวลาที่กำหนด
  try {
    [[ATTEMPT_COL, "AttemptID"],
     [BLANK_COL,   "QuestionID ที่ไม่ได้ตอบ"],
     [RAWTIME_COL, "เวลาจริง(วินาที)"]].forEach(function (pair) {
      const col = pair[0], label = pair[1];
      if (sheet.getLastColumn() < col || !String(sheet.getRange(1, col).getValue()).trim()) {
        sheet.getRange(1, col).setValue(label);
      }
    });
  } catch (hdrErr) { Logger.log("saveResult header backfill error: " + hdrErr.message); }

  // ⚡ กันบันทึกผลสอบซ้ำ: ถ้า Client แนบ attemptId มา (สร้างครั้งเดียวตอนเริ่ม
  // บันทึกผล ใช้ซ้ำได้ถ้าต้อง retry) และแถวนี้เคยถูกบันทึกไปแล้วจริง (เช่น
  // ตอนแรก Apps Script บันทึกสำเร็จ แต่ Client timeout ก่อนได้รับคำตอบ แล้ว
  // Client ลองส่งซ้ำ) ให้ถือว่าสำเร็จโดยไม่ append แถวซ้ำอีก
  if (data.attemptId && _isDuplicateResultAttempt(sheet, data.attemptId)) {
    return ok({ success: true, duplicate: true });
  }

  sheet.appendRow([
    new Date(),
    data.studentId       || "", data.studentName     || "",
    data.studentNickname || "", data.setName         || "",
    data.score           || "", data.correctCount    || "",
    data.passed          || "", data.timeUsed        || 0,
    data.correctIds      || "", data.wrongIds        || "",
    data.attemptId       || "",
    data.blankIds        || "",
    (data.timeUsedRaw !== undefined && data.timeUsedRaw !== null)
      ? data.timeUsedRaw : (data.timeUsed || 0),
  ]);

  // ── AUTO ACHIEVEMENT COLUMNS (v10) ─────────────────────────
  // เช็คว่าชุดข้อสอบนี้เคยมีคอลัมความสำเร็จหรือยัง ถ้ายังไม่มี (ชุดใหม่)
  // จะสร้างคอลัมให้เองทั้งใน Rosy Maple Moth/Purple Emperor, Paper Kite
  // Butterfly และ Identity (ดูฟังก์ชัน ensureAchievementColumns ด้านล่าง)
  // ครอบ try/catch กันไว้ — ถ้าจุดนี้พลาดต้องไม่ทำให้บันทึกผลสอบล้มเหลว
  //
  // ⚡ Perf (v11.1): เดิมฟังก์ชันนี้สแกนหัวตารางของ 4 ชีทจริงทุกครั้งที่มีคน
  // สอบเสร็จ 1 คน ทั้งที่คอลัมของแต่ละชุดข้อสอบจะถูกสร้างแค่ "ครั้งแรก"
  // ครั้งเดียวตลอดไป — เวลาที่เสียไปกับการสแกนซ้ำๆ นี้ทั้งหมดเกิดขึ้น
  // "ขณะถือ Script Lock อยู่" (ดู doPost) ยิ่งมีคนส่งคำตอบพร้อมกันเยอะ
  // (ท้ายคาบเรียน) ยิ่งต่อคิวนานขึ้นเป็นทวีคูณ จึงเก็บผลเช็คไว้ใน
  // Script Properties (คงอยู่ถาวรข้ามการรันทุกครั้ง ต่างจาก CacheService
  // ที่หมดอายุ) กันไว้ไม่ให้ต้องสแกนซ้ำเมื่อเคยยืนยันแล้วว่าชุดนี้มีคอลัม
  // ครบแล้วจริง — ลดเวลาที่ถือ Lock ต่อ request ลงได้มากในกรณีทั่วไป
  try {
    if (data.setName) {
      const setName = String(data.setName).trim();
      if (!_isAchColumnsVerified(setName)) {
        ensureAchievementColumns(setName);
        _markAchColumnsVerified(setName);
      }
    }
  } catch (achErr) {
    Logger.log("ensureAchievementColumns error: " + achErr.message);
  }

  // หมายเหตุ: ไม่ auto-grant Artifact จากเงื่อนไข PASS: อีกต่อไป
  // นักเรียนต้องไปกดรับเองที่หน้าร้านค้า (Shop) หลังผ่านเงื่อนไขครบ
  // ดู getUnlockConditions() และ claimArtifact() ด้านล่าง

  return ok({ success: true });
}

// ── เช็คว่า attemptId นี้เคยถูกบันทึกผลสอบไปแล้วหรือยัง (กัน retry ซ้ำ) ──
// เช็คย้อนหลังแค่ N แถวล่าสุดพอ (ไม่ scan ทั้งชีท เพราะ QuizResults ยาวขึ้น
// เรื่อยๆ ตามจำนวนการสอบสะสมทั้งหมด — attemptId ที่จะซ้ำกันได้มีแค่ของ
// การสอบรอบล่าสุดที่เพิ่งเกิด retry เท่านั้น ไม่มีทางไปซ้ำกับของเก่ามากๆ)
function _isDuplicateResultAttempt(sheet, attemptId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ATTEMPT_COL = 12; // คอลัม L
  const scanRows  = Math.min(500, lastRow - 1);
  const startRow  = lastRow - scanRows + 1;
  const vals = sheet.getRange(startRow, ATTEMPT_COL, scanRows, 1).getValues();
  return vals.some(r => String(r[0]).trim() === String(attemptId).trim());
}

// ── เช็คสถานะว่าผลสอบที่ attemptId นี้ถูกบันทึกลง Sheet จริงหรือยัง ──
// ใช้โดย Client หลัง saveResult ล้มเหลว/timeout เพื่อยืนยันสถานะจริงก่อน
// จะฟันธงว่า "บันทึกไม่สำเร็จ" (กันกรณี Apps Script บันทึกสำเร็จแล้วจริงๆ
// แค่ Client/Proxy รอคำตอบไม่ทันเพราะช้าเกิน timeout)
function checkResultSaved(attemptId) {
  if (!attemptId) return ok({ saved: false });
  let sheet;
  try { sheet = getSheet("QuizResults"); } catch { return ok({ saved: false }); }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ok({ saved: false });
  const ATTEMPT_COL = 12;
  const scanRows  = Math.min(500, lastRow - 1);
  const startRow  = lastRow - scanRows + 1;
  const vals = sheet.getRange(startRow, ATTEMPT_COL, scanRows, 1).getValues();
  const saved = vals.some(r => String(r[0]).trim() === String(attemptId).trim());
  return ok({ saved });
}

// ============================================================
// AUTO ACHIEVEMENT COLUMN SYSTEM (v10)
// ============================================================
// ปัญหาเดิม: ทุกครั้งที่เพิ่มชุดข้อสอบใหม่ ต้องไปเพิ่มคอลัมมือใน 4 จุด
//   1) Rosy Maple Moth (ถ้าเป็นข้อสอบ "แยกเรื่อง")
//      หรือ Purple Emperor (ถ้าเป็นข้อสอบ "คละ")
//   2) Paper Kite Butterfly (เงื่อนไขขั้นสูง: ผ่าน>=3 ครั้ง และเต็ม>=1 ครั้ง)
//   3-4) Identity: คอลัมคู่ "<SetID>" (ตราสัญลักษณ์/เฟือง) และ
//        "<SetID> WWW" (ผีเสื้อทับตรา)
//
// วิธีแก้: ทุกครั้งที่ saveResult() ถูกเรียก จะเช็คก่อนว่าคอลัมของชุดนี้
// มีอยู่แล้วหรือยัง (เช็คจากหัวตารางของ Rosy Maple Moth/Purple Emperor)
// ถ้ายังไม่มี → แปลว่าเป็นชุดใหม่ → สร้างคอลัมทั้ง 4 จุดให้เองทันที
// โดยใช้ "สูตร" แบบเดียวกับที่มีอยู่เดิมทุกประการ (ไม่ใช่ค่าที่คำนวณตายตัว)
// ดังนั้น:
//   - ค่าย้อนหลัง (backfill) ถูกต้องเองทันทีที่สร้างคอลัม เพราะสูตรจะไป
//     COUNTIFS ทั้งประวัติ QuizResults ที่มีอยู่แล้วโดยอัตโนมัติ
//   - ถ้าครูพิมพ์ค่าทับมือในเซลล์เก่าๆ (ข้อมูลเก่ามากๆ) จะทำงานเหมือนเดิม
//     ทุกประการ เพราะเป็นพฤติกรรมปกติของสูตรใน Sheets (ไม่มี flag กันเขียนทับ
//     ตามที่คุยกันไว้)
//
// สิ่งที่ต้องมี (ครั้งเดียว ไม่ต้องทำซ้ำ): เพิ่มคอลัมใหม่ชื่อ "ประเภทข้อสอบ"
// ใน QuizConfig (แถวหัวตาราง คอลัม S = คอลัมที่ 19) ใส่ค่าเป็น "แยกเรื่อง"
// หรือ "คละ" ทุกครั้งที่เพิ่มชุดข้อสอบใหม่ — นี่คือจุดเดียวที่ยังต้องทำมือ
// (แทนที่การ "เลือกว่าจะไปเพิ่มคอลัมที่ชีทไหน" แบบเดิม)
// ============================================================

const EXAM_TYPE_COL = 19; // QuizConfig คอลัม S = "ประเภทข้อสอบ"
const QUIZCONFIG_TOTAL_COL = 15; // QuizConfig คอลัม O = "Total" (คะแนนเต็ม)

const ACHIEVEMENT_BADGE_MAP = {
  "แยกเรื่อง": {
    sheet:   "Rosy Maple Moth",
    passValue: 0.5,
    passUrl: "https://i.postimg.cc/HnjFhfvz/53.png",
    gearUrl: "https://i.postimg.cc/PJc0s2BC/54.png",
  },
  "คละ": {
    sheet:   "Purple Emperor",
    passValue: 1,
    passUrl: "https://i.postimg.cc/J4QQ6B9y/hx-mla-m-n-(1).png",
    gearUrl: "https://i.postimg.cc/PJc0s2BC/54.png",
  },
};
const PAPER_KITE_SHEET_NAME  = "Paper Kite Butterfly";
const BUTTERFLY_OVERLAY_URL  = "https://i.postimg.cc/qM08cPL9/ta-rang-t-wser-mc-laph-rn-2569-(1).png";
const ACH_COLS_VERIFIED_PROP = "achColsVerifiedSets"; // Script Properties key

// ── เช็ค/จำว่าชุดข้อสอบนี้เคยยืนยันแล้วว่าคอลัมความสำเร็จครบทั้ง 4 จุด
// (ดูคอมเมนต์ perf ใน saveResult()) — เก็บเป็น JSON array ของชื่อชุดข้อสอบ
// ใน Script Properties เดียว (ค่าเล็กมาก ไม่มีปัญหาเรื่องขนาด/โควตา)
function _isAchColumnsVerified(setName) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ACH_COLS_VERIFIED_PROP);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.indexOf(setName) !== -1;
  } catch (e) { return false; } // เช็คพลาด → ถือว่ายังไม่ยืนยัน ไปสแกนใหม่เพื่อความชัวร์
}
function _markAchColumnsVerified(setName) {
  try {
    const props = PropertiesService.getScriptProperties();
    const raw   = props.getProperty(ACH_COLS_VERIFIED_PROP);
    const list  = raw ? JSON.parse(raw) : [];
    if (list.indexOf(setName) === -1) {
      list.push(setName);
      props.setProperty(ACH_COLS_VERIFIED_PROP, JSON.stringify(list));
    }
  } catch (e) { Logger.log("_markAchColumnsVerified error: " + e.message); }
}

// ── จุดเริ่มต้น: เรียกทุกครั้งจาก saveResult() ──────────────
// เช็คทั้ง 4 จุด (species sheet, Paper Kite Butterfly, Identity ฐาน,
// Identity WWW) แยกจากกันอิสระ — ไม่ใช่ all-or-nothing แล้ว ดังนั้นถ้าเจอ
// ชุดที่มีคอลัมใน Rosy Maple Moth/Purple Emperor อยู่แล้ว แต่ขาดใน
// Paper Kite Butterfly และ/หรือ Identity (ข้อมูลเก่าที่เพิ่มไม่ครบทุกจุด)
// จะตรวจเจอและเติมเฉพาะจุดที่ขาดให้ โดยไม่ไปยุ่งจุดที่มีอยู่แล้ว
function ensureAchievementColumns(setName) {
  if (!setName) return;

  const rosySheet      = getSheet("Rosy Maple Moth");
  const purpleSheet    = getSheet("Purple Emperor");
  const paperKiteSheet = getSheet(PAPER_KITE_SHEET_NAME);
  const identitySheet  = getSheet("Identity");

  // 1) หาคอลัมเดิม (ถ้ามี) ในแต่ละจุด แยกกันอิสระ
  let speciesSheet = null;
  let speciesCol   = findColumnByHeader(rosySheet, setName);
  if (speciesCol) {
    speciesSheet = rosySheet;
  } else {
    speciesCol = findColumnByHeader(purpleSheet, setName);
    if (speciesCol) speciesSheet = purpleSheet;
  }
  let paperKiteCol      = findColumnByHeader(paperKiteSheet, setName);
  const identityBaseCol = findColumnByHeader(identitySheet, setName);
  const identityWWWCol  = findColumnByHeader(identitySheet, setName + " WWW");

  if (speciesSheet && paperKiteCol && identityBaseCol && identityWWWCol) {
    return; // มีครบทั้ง 4 จุดแล้ว — ไม่ต้องทำอะไร (เคสปกติ 99% ของการทำข้อสอบ)
  }

  // 2) อ่าน QuizConfig เอาคะแนนเต็ม (Total) เสมอ + ประเภทข้อสอบ (ใช้เฉพาะตอน
  //    ยังไม่มีคอลัมใน species sheet เลย — ถ้ามีคอลัมเดิมอยู่แล้วจะยึดตาม
  //    ชีทที่มีคอลัมจริงเป็นหลัก ไม่ยึดตามช่อง "ประเภทข้อสอบ" เพื่อกันขัดแย้งกับ
  //    ของจริงที่มีอยู่)
  const cfgSheet = getSheet("QuizConfig");
  const cfgRows  = cfgSheet.getDataRange().getValues();
  let examTypeRaw = null, totalScore = null;
  for (let i = 1; i < cfgRows.length; i++) {
    if (String(cfgRows[i][0]).trim() === setName) {
      examTypeRaw = cfgRows[i][EXAM_TYPE_COL - 1];
      totalScore  = cfgRows[i][QUIZCONFIG_TOTAL_COL - 1];
      break;
    }
  }

  if (!speciesSheet) {
    const examType = examTypeRaw ? String(examTypeRaw).trim() : "";
    const badgeGuess = ACHIEVEMENT_BADGE_MAP[examType];
    if (!badgeGuess) {
      // ชุดใหม่จริง แต่ยังไม่ได้ตั้ง "ประเภทข้อสอบ" ใน QuizConfig (หรือไม่ใช่
      // ชุดข้อสอบปกติ เช่น CHALL-... ของโหมดบอส) — ข้ามไปเงียบๆ ไม่ทำให้
      // saveResult ล้ม รอตั้งค่าแล้วรัน runEnsureAchievementColumnsForAllSets()
      Logger.log(`ensureAchievementColumns: ชุด "${setName}" ไม่มีคอลัมใน Rosy Maple Moth/Purple Emperor เลย และไม่พบ "ประเภทข้อสอบ" ที่ถูกต้องใน QuizConfig (ต้องเป็น "แยกเรื่อง" หรือ "คละ") — ข้ามการสร้างคอลัมอัตโนมัติ`);
      return;
    }
    speciesSheet = badgeGuess.sheet === "Rosy Maple Moth" ? rosySheet : purpleSheet;
  }

  // ยึดประเภทตาม species sheet ที่ใช้จริง (ของเดิมถ้ามี ของที่เพิ่งเลือกถ้าไม่มี)
  const resolvedExamType = speciesSheet.getName() === "Rosy Maple Moth" ? "แยกเรื่อง" : "คละ";
  const badge = ACHIEVEMENT_BADGE_MAP[resolvedExamType];
  const fullScoreText = totalScore ? `${totalScore}/${totalScore}` : null;
  const createdParts = [];

  // 3) เติมคอลัมใน species sheet ถ้ายังไม่มี
  if (!speciesCol) {
    speciesCol = addAchievementFormulaColumn(speciesSheet, setName, (r) =>
      `=value(IF(COUNTIFS(QuizResults!$B:$B, $B${r},QuizResults!$E:$E, "${setName}", QuizResults!$H:$H, "ผ่าน") > 0, "${badge.passValue}", ""))`
    );
    extendSpeciesTotalFormula(speciesSheet);
    createdParts.push(speciesSheet.getName());
  }

  // 4) เติมคอลัมใน Paper Kite Butterfly ถ้ายังไม่มี (ต้องรู้คะแนนเต็มก่อน)
  if (!paperKiteCol) {
    if (fullScoreText) {
      paperKiteCol = addAchievementFormulaColumn(paperKiteSheet, setName, (r) =>
        `=IF(AND(COUNTIFS(QuizResults!$B:$B, $B${r}, QuizResults!$E:$E, "${setName}", QuizResults!$H:$H, "ผ่าน") >= 3, COUNTIFS(QuizResults!$B:$B, $B${r}, QuizResults!$E:$E, "${setName}", QuizResults!$F:$F, "${fullScoreText}") >= 1), ${badge.passValue}, "")`
      );
      extendSpeciesTotalFormula(paperKiteSheet);
      createdParts.push("Paper Kite Butterfly");
    } else {
      Logger.log(`ensureAchievementColumns: ไม่พบคะแนนเต็ม (Total) ของชุด "${setName}" ใน QuizConfig — สร้างคอลัม Paper Kite Butterfly ไม่ได้ กรุณาเพิ่ม Total แล้วรัน runEnsureAchievementColumnsForAllSets() ใหม่`);
    }
  }

  // 5) เติมคอลัมใน Identity — ฐานกับ WWW เช็คและเติมแยกกันอิสระ
  if (!identityBaseCol || !identityWWWCol) {
    addIdentityAchievementColumnsIfMissing(
      identitySheet, setName, badge, speciesCol, paperKiteCol, identityBaseCol, identityWWWCol
    );
    createdParts.push("Identity");
  }

  if (createdParts.length > 0) {
    Logger.log(`ensureAchievementColumns: ชุด "${setName}" (ประเภท: ${resolvedExamType}) — เติมคอลัมที่ขาดให้แล้วในจุด: ${createdParts.join(", ")}${createdParts.includes("Identity") ? " — เหลือแค่ไปเพิ่ม Widget รูปภาพใน Looker Studio ชี้ไปที่คอลัม \"" + setName + " WWW\" ด้วยมือ (ถ้ายังไม่เคยเพิ่ม)" : ""}`);
  }
}

// ── หา index คอลัมจากชื่อหัวตาราง (เทียบแบบ trim ตรงตัว) คืน null ถ้าไม่เจอ ──
function findColumnByHeader(sheet, headerName) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerName) return i + 1;
  }
  return null;
}

// ── เพิ่มคอลัมใหม่ที่ท้ายชีท พร้อมใส่สูตรทุกแถวทีเดียว คืนค่าเลขคอลัมที่เพิ่ม ──
function addAchievementFormulaColumn(sheet, setName, formulaForRow) {
  const newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol).setValue(setName); // หัวตาราง
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const formulas = [];
  for (let r = 2; r <= lastRow; r++) formulas.push([formulaForRow(r)]);
  if (formulas.length > 0) {
    sheet.getRange(2, newCol, formulas.length, 1).setFormulas(formulas);
  }
  return newCol;
}

// ── เขียนสูตร SUM ในคอลัม I ("รวม" ของแต่ละสายพันธุ์) ใหม่ทุกแถว
//    ให้ครอบคลุมถึงคอลัมล่าสุด (กันปัญหาคอลัมใหม่ตกหล่นจากผลรวม) ──
function extendSpeciesTotalFormula(sheet) {
  const lastCol = sheet.getLastColumn();
  const lastColLetter = columnIndexToLetter(lastCol);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const formulas = [];
  for (let r = 2; r <= lastRow; r++) formulas.push([`=sum(J${r}:${lastColLetter}${r})`]);
  sheet.getRange(2, 9, formulas.length, 1).setFormulas(formulas); // คอลัม I = index 9
}

function columnIndexToLetter(col) {
  let letter = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ── เติมคอลัม Identity เฉพาะจุดที่ขาด (ฐาน และ/หรือ WWW แยกกันอิสระ) ──
// identityBaseCol / identityWWWCol ที่ส่งเข้ามาไม่ null แปลว่ามีอยู่แล้ว
// จะไม่แตะคอลัมนั้นเลย เติมเฉพาะที่เป็น null เท่านั้น
function addIdentityAchievementColumnsIfMissing(
  identitySheet, setName, badge, speciesCol, paperKiteCol, identityBaseCol, identityWWWCol
) {
  const speciesColLetter   = speciesCol   ? columnIndexToLetter(speciesCol)   : null;
  const paperKiteColLetter = paperKiteCol ? columnIndexToLetter(paperKiteCol) : null;
  const lastRow = Math.max(identitySheet.getLastRow(), 2);

  if (!identityBaseCol && speciesColLetter) {
    const newCol = identitySheet.getLastColumn() + 1;
    identitySheet.getRange(1, newCol).setValue(setName);
    const formulas = [];
    for (let r = 2; r <= lastRow; r++) {
      formulas.push([`=if('${badge.sheet}'!${speciesColLetter}${r}=${badge.passValue},"${badge.passUrl}","${badge.gearUrl}")`]);
    }
    identitySheet.getRange(2, newCol, formulas.length, 1).setFormulas(formulas);
  }

  if (!identityWWWCol) {
    const newCol = identitySheet.getLastColumn() + 1;
    identitySheet.getRange(1, newCol).setValue(setName + " WWW");
    const formulas = [];
    for (let r = 2; r <= lastRow; r++) {
      formulas.push([
        paperKiteColLetter
          ? `=if('${PAPER_KITE_SHEET_NAME}'!${paperKiteColLetter}${r}=${badge.passValue},"${BUTTERFLY_OVERLAY_URL}","")`
          : ""
      ]);
    }
    identitySheet.getRange(2, newCol, formulas.length, 1).setFormulas(formulas);
  }
}

// ── รันมือได้จาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) ──────
// ใช้ทดสอบ/ตรวจสอบชุดข้อสอบใหม่ทุกชุดใน QuizConfig โดยไม่ต้องรอให้มีคน
// ทำข้อสอบจริงก่อน — ปลอดภัย เพราะชุดที่มีคอลัมอยู่แล้วจะถูกข้ามอัตโนมัติ
// (ดู "เช็คว่ามีคอลัมอยู่แล้วหรือยัง" ใน ensureAchievementColumns)
function runEnsureAchievementColumnsForAllSets() {
  const cfgSheet = getSheet("QuizConfig");
  const cfgRows  = cfgSheet.getDataRange().getValues();
  let processed = 0;
  for (let i = 1; i < cfgRows.length; i++) {
    const setName = String(cfgRows[i][0] || "").trim();
    if (!setName) continue;
    ensureAchievementColumns(setName);
    processed++;
  }
  Logger.log(`runEnsureAchievementColumnsForAllSets: เช็คครบ ${processed} ชุดใน QuizConfig — ชุดที่มีคอลัมอยู่แล้วถูกข้ามอัตโนมัติ ดู log แต่ละบรรทัดด้านบนว่าชุดไหนสร้างใหม่ / ชุดไหนขาด "ประเภทข้อสอบ"`);
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
// dailyBossRegen     → Time-based → Day timer → Midnight (00:00)
// keepAlive          → Time-based → Minutes timer → Every 5 minutes
// castleWeeklyReset  → ตั้งอัตโนมัติให้เองถ้ารัน installCastleWeeklyTrigger()
//                      ครั้งเดียวจาก Editor (ดูท้ายไฟล์ Patch 5.0)
//                      หรือจะตั้งมือก็ได้: Time-based → Week timer →
//                      Every Monday → 12am-1am

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

// ── Admin: เสก Artifact ให้นักเรียนโดยตรง (แก้ studentId/artifactId แล้ว Run) ──
// ── Admin: เพิ่มผีเสื้อให้นักเรียนหลายคนพร้อมกัน (แก้ค่าด้านล่างแล้ว Run) ──
function adminGiveButterflies() {
  // ═══════════════ แก้ค่าตรงนี้ก่อน Run ═══════════════
  const studentIds  = ["6910009", "6913333", "6916666"]; // รหัสนักเรียน ใส่ได้หลายคน
  const sheetName   = "Monarch";                          // ชื่อ Sheet ผีเสื้อ
  const idColumn    = "B";                                // Column ที่เก็บ StudentID
  const countColumn = "C";                                // Column ที่เก็บจำนวนผีเสื้อ
  const amountToAdd = 1;                                  // จำนวนที่จะเพิ่มให้แต่ละคน
  // ══════════════════════════════════════════════════

  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) { Logger.log("❌ ไม่พบ Sheet ชื่อ: " + sheetName); return; }

  const idColIdx    = _colLetterToIndex(idColumn);
  const countColIdx = _colLetterToIndex(countColumn);
  const data = sheet.getDataRange().getValues();

  let updated = 0;
  const notFound = [];

  studentIds.forEach(sid => {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idColIdx]).trim() === String(sid).trim()) {
        const current = Number(data[i][countColIdx]) || 0;
        const newCount = current + amountToAdd;
        sheet.getRange(i + 1, countColIdx + 1).setValue(newCount);
        Logger.log(`✓ ${sid}: ${current} → ${newCount}`);
        updated++; found = true;
        break;
      }
    }
    if (!found) notFound.push(sid);
  });

  Logger.log(`\nเสร็จสิ้น: อัปเดต ${updated}/${studentIds.length} คน`);
  if (notFound.length > 0) {
    Logger.log("⚠️ ไม่พบรหัสเหล่านี้ใน Sheet \"" + sheetName + "\": " + notFound.join(", "));
  }
}

// แปลงตัวอักษร column (เช่น "B", "AA") เป็น index แบบ 0-based
function _colLetterToIndex(letter) {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col - 1;
}

function adminGiveArtifact() {
  const result = grantArtifact({
    studentId: "6910009",
    artifactId: "ART001",
    source: "Admin เสกให้"
  });
  Logger.log(result.getContent());
}

function testShopBundle() {
  const r = getShopBundle("6910009");
  Logger.log(r.getContent());
}
function testUnlockConditions() {
  const r = getUnlockConditions("6910009");
  Logger.log(r.getContent());
}
function testBossSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Boss");
  const rows  = sheet.getDataRange().getValues();
  Logger.log("จำนวนแถว: " + rows.length);
  Logger.log("Header: " + JSON.stringify(rows[0]));
  if (rows.length > 1) Logger.log("แถวที่ 2: " + JSON.stringify(rows[1]));
}


// ============================================================
// PATCH 5.0 — CASTLE MODE (ปราสาท)
// ============================================================
// แนวคิด: นักเรียนที่ Rank (ระดับ 1-7 จาก Identity คอลัม I) >= 4 จะมี
// "ปราสาท" ของตัวเองในแต่ละสัปดาห์ ให้คนอื่นมาโจมตีได้ (ตอบคำถามถูก =
// ดาเมจ เหมือนตีบอส) ถ้ารอดจนจบสัปดาห์ (HP > 0) เจ้าของได้ Gold
// ไม่จำกัดจำนวนครั้งที่โจมตีได้ (ใครจะมาตีกี่ครั้งก็ได้ ไม่มีเพดาน)
//
// HP/DEF/Regen ของปราสาท มาจาก effective stat จริงของเจ้าของ (Player_Stats
// เดิม) แต่ "สแนปช็อต" ไว้ตอนต้นสัปดาห์ (ไม่อ่านสดทุกครั้ง) กันไม่ให้การซื้อ
// Artifact ระหว่างสัปดาห์ไปเปลี่ยนกติกากลางเกมที่กำลังแข่งกันอยู่:
//   - HP  1 หน่วย  = CASTLE_HP_PER_STAT   เลือดปราสาท (ค่าเริ่มต้น 50)
//   - DEF 1 หน่วย  = CASTLE_DEF_PER_STAT  เกราะปราสาท (ค่าเริ่มต้น 1)
//   - SPD 1 หน่วย  = CASTLE_REGEN_PER_SPD เลือดฟื้นต่อวัน (ค่าเริ่มต้น 20)
//     เลือดที่ฟื้นมาฝ่ายโจมตียังคงได้รางวัลตามปกติถ้าตีเข้า และฝ่ายรับก็
//     รอรับรางวัลจาก HP ที่เหลืออยู่ตอนจบสัปดาห์เหมือนเดิมทุกประการ —
//     ฟื้นแค่ไม่เกิน HpMax เท่านั้น (เหมือนระบบ regen ของ Boss ที่มีอยู่แล้ว)
//
// กลไกรางวัล Gold — ออกแบบให้ Gold ที่แจกออกไปของปราสาทหนึ่งหลัง "รวมกัน
// แล้วเท่ากับ RewardPool เสมอ" ไม่ว่าจะมีกี่คนมาตีกี่ครั้ง:
//   - แต่ละปราสาทมี RewardPool = CASTLE_GOLD_PER_LEVEL * Level
//   - ทุกครั้งที่ตีทะลุเกราะ ผู้โจมตีได้ Gold ทันที
//     = (HP ที่เสียไปจริงครั้งนั้น / HpMax) * RewardPool
//   - จบสัปดาห์ ถ้าปราสาทยัง Active (ไม่ล่มก่อน) HP ที่เหลืออยู่จะถูก
//     แปลงเป็น Gold ให้เจ้าของ = (HpCurrent / HpMax) * RewardPool
//
// โจทย์การโจมตี — ดึงจาก "คลังโจทย์หายาก" (QuestionBank ที่ isRare=true)
// เท่านั้น ไม่ใช่โจทย์ทั่วไป ตามที่ตกลงกันว่าโจทย์ปราสาทจะมาจาก Artifact
// ทั้งหมด (ครูจะแจก Artifact + โจทย์หายากใหม่ให้ตอนถึง Rank 4 เอง)
//
// รางวัลรายสัปดาห์ (ผีเสื้อ Yellow Swallowtail เหมือนระบบ Top5/Last/Most
// ของ Boss) — เขียนสะสมลงคอลัม J ของชีท "Yellow Swallowtail" (ชีทนี้เตรียม
// คอลัม J-U ว่างไว้อยู่แล้วสำหรับงานแบบนี้โดยเฉพาะ ไม่ชนกับข้อมูลเดิม):
//   อันดับรวม (ดาเมจสะสมทั้งสัปดาห์) 1=2, 2=1.5, 3=1.5, 4=1, 5=1
//   มากสุด (ดาเมจครั้งเดียวสูงสุดในสัปดาห์) = 1
//   ปิดเกม (ทำลายปราสาทได้มากที่สุดในสัปดาห์ — ถ้าเสมอกันได้ทุกคนที่เสมอ) = 1
//   ⚠️ "อันดับรวม/มากสุด/ปิดเกม" เป็นการตีความของผม (ยังไม่ได้ยืนยันกับ
//   ผู้ใช้ 100%) แก้ได้ที่ฟังก์ชัน _settleCastleWeeklyLeaderboardRewards()
//
// Sheet ใหม่ (สร้างอัตโนมัติตอนเรียกใช้ครั้งแรก เหมือน Sheet อื่นๆ):
//   "Castle": WeekId, OwnerStudentId, OwnerNickname, Level, HpMax,
//             HpCurrent, Def, Regen, RewardPool, Status, CreatedAt, SettledAt
//   "CastleAttackLog": Timestamp, WeekId, AttackerStudentId,
//             AttackerNickname, TargetOwnerId, Damage, Penetrated,
//             GoldEarned, AttemptId
//   "CastleRewardLog": Timestamp, WeekId, StudentID, Nickname,
//             RewardType, ButterflyAmount  (กันแจกรางวัลรายสัปดาห์ซ้ำ)
//
// ⚙️ ตั้งค่าครั้งเดียว: เปิด Apps Script Editor เลือกฟังก์ชัน
// installCastleTriggers() แล้วกด Run — จะตั้ง trigger 2 ตัว:
//   1) castleWeeklyReset  → ทุกวันจันทร์เที่ยงคืน (ปิดสัปดาห์เก่า + เปิดใหม่)
//   2) castleDailyRegen   → ทุกวันเที่ยงคืน (ฟื้นเลือดปราสาทตาม SPD)
// แล้วรัน castleWeeklyReset() ให้ทันที 1 ครั้งเพื่อเปิดปราสาทรอบแรกเลย
// ============================================================

const CASTLE_GOLD_PER_LEVEL       = 200; // Gold pool ต่อ 1 Level ของปราสาท
const CASTLE_MIN_RANK             = 4;   // ต้อง Rank (Identity คอลัม I) >= เท่านี้ถึงมีปราสาท
const CASTLE_QUESTIONS_PER_ATTACK = 5;   // จำนวนคำถามต่อการโจมตี 1 ครั้ง
const CASTLE_HP_PER_STAT          = 50;  // HP effective 1 หน่วย = เลือดปราสาทกี่หน่วย
const CASTLE_DEF_PER_STAT         = 1;   // DEF effective 1 หน่วย = เกราะปราสาทกี่หน่วย
const CASTLE_REGEN_PER_SPD        = 20;  // SPD effective 1 หน่วย = เลือดฟื้น/วันกี่หน่วย
const CASTLE_ARTIFACT_LEVEL_BONUS = 100; // Artifact ที่เจ้าของถือ 1 Level (ร่างเดียว = Level 1) = RewardPool +100

const YELLOW_SWALLOWTAIL_SHEET = "Yellow Swallowtail";
const YELLOW_SWALLOWTAIL_COL   = 13; // คอลัม M — คอลัมว่างที่ผู้ใช้ระบุให้ใช้
const CASTLE_WEEKLY_REWARDS = {
  top1: 2, top2: 1.5, top3: 1.5, top4: 1, top5: 1, most: 1, finisher: 1,
};

const CASTLE_SHEET_HEADERS = [
  "WeekId","OwnerStudentId","OwnerNickname","Level",
  "HpMax","HpCurrent","Def","Regen","RewardPool","Status","CreatedAt","SettledAt"
];
// ดัชนีคอลัม (0-based ใน array ที่ได้จาก getValues()) ของ Castle sheet
// เขียนเป็นค่าคงที่ไว้ตรงนี้ที่เดียว กันสับสน/พลาดตอนแก้โค้ดจุดอื่น
const CASTLE_COL = {
  WEEK_ID: 0, OWNER_ID: 1, OWNER_NICK: 2, LEVEL: 3,
  HP_MAX: 4, HP_CUR: 5, DEF: 6, REGEN: 7, REWARD_POOL: 8,
  STATUS: 9, CREATED_AT: 10, SETTLED_AT: 11,
};

// ── หา "รหัสสัปดาห์" จากวันจันทร์ต้นสัปดาห์ (กันปัญหาเลขสัปดาห์ ISO
//    ที่ขึ้นกับ locale — ใช้วันที่ตรงๆ อ่านง่ายกว่า เช่น "2026-09-21") ──
function getWeekStartId(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=อาทิตย์ ... 1=จันทร์ ... 6=เสาร์
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}
function getCurrentWeekId() { return getWeekStartId(new Date()); }

// ⚠️ BUG ที่เจอจากการทดสอบจริง: Google Sheets แปลงสตริง "2026-09-21" ที่
// เขียนลงเซลล์อัตโนมัติให้กลายเป็น Date object เอง (พฤติกรรม auto-detect
// ของ Sheets ไม่ใช่แค่ตอนพิมพ์มือ แต่เกิดตอนเขียนผ่าน Apps Script ด้วย ถ้า
// เซลล์นั้นเป็นฟอร์แมต Automatic) ผลคือพอ getValues() อ่านกลับมา ได้ Date
// object ไม่ใช่ string เดิม แล้วเทียบ String(cellValue) === weekId ไม่ตรง
// กันเลย ทำให้หาปราสาทที่เพิ่งสร้างไม่เจอ (getMyCastle/getCastleAttackBundle
// error "ไม่พบปราสาทนี้ในสัปดาห์นี้" ทั้งที่ในชีตมีแถวอยู่จริง)
// แก้โดย normalize ค่าที่อ่านจากชีตให้กลับเป็น "yyyy-MM-dd" เสมอ ไม่ว่า
// จะเก็บเป็น Date หรือ string ก็ตาม — ใช้แทน String(...).trim() ทุกจุดที่
// เทียบ WeekId จากข้อมูลในชีต
function _normalizeWeekId(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

// ── หาแถว Castle ของเจ้าของคนหนึ่งในสัปดาห์ที่ระบุ คืน {rowIdx, row} หรือ null
//    (rowIdx เป็น index ใน array ที่ได้จาก getValues(), แถวจริงในชีท = rowIdx+1) ──
function _findCastleRow(sheet, weekId, ownerId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (_normalizeWeekId(rows[i][CASTLE_COL.WEEK_ID]) === weekId &&
        String(rows[i][CASTLE_COL.OWNER_ID]).trim() === String(ownerId).trim()) {
      return { rowIdx: i, row: rows[i] };
    }
  }
  return null;
}

function _castleRowToObj(row) {
  return {
    ownerStudentId: String(row[CASTLE_COL.OWNER_ID]),
    ownerNickname:  String(row[CASTLE_COL.OWNER_NICK]),
    level:      Number(row[CASTLE_COL.LEVEL])       || 0,
    hpMax:      Number(row[CASTLE_COL.HP_MAX])       || 0,
    hpCurrent:  Number(row[CASTLE_COL.HP_CUR])       || 0,
    def:        Number(row[CASTLE_COL.DEF])          || 0,
    regen:      Number(row[CASTLE_COL.REGEN])        || 0,
    rewardPool: Number(row[CASTLE_COL.REWARD_POOL])  || 0,
    status:     String(row[CASTLE_COL.STATUS]),
  };
}

// ── รายชื่อปราสาทที่เปิดอยู่ในสัปดาห์นี้ (ให้หน้าเลือกเป้าหมายโจมตี) ──
function getCastleList(studentId) {
  const sheet = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const weekId = getCurrentWeekId();
  const rows = sheet.getDataRange().getValues().slice(1);
  const castles = rows
    .filter(r => _normalizeWeekId(r[CASTLE_COL.WEEK_ID]) === weekId)
    .map(r => ({
      ..._castleRowToObj(r),
      isOwn: studentId ? String(r[CASTLE_COL.OWNER_ID]).trim() === String(studentId).trim() : false,
    }))
    .sort((a, b) => b.level - a.level || b.hpCurrent - a.hpCurrent);
  return ok({ weekId, castles });
}

// ── โหลดข้อมูลปราสาทเป้าหมาย + คำถามสำหรับโจมตี 1 ครั้ง (รวม 1 call) ──
// โจทย์ดึงจาก QuestionBank เฉพาะที่ isRare=true เท่านั้น (โจทย์หายาก
// สายเดียวกับที่ปลดล็อค Artifact) ไม่ใช่โจทย์ทั่วไป
function getCastleAttackBundle(targetOwnerId, attackerId) {
  if (!targetOwnerId) return ok({ error: "ไม่ระบุเป้าหมาย" });
  if (attackerId && String(attackerId).trim() === String(targetOwnerId).trim()) {
    return ok({ error: "โจมตีปราสาทตัวเองไม่ได้" });
  }
  const sheet  = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const weekId = getCurrentWeekId();
  const found  = _findCastleRow(sheet, weekId, targetOwnerId);
  if (!found) return ok({ error: "ไม่พบปราสาทนี้ในสัปดาห์นี้ (อาจยังไม่เปิด หรือเจ้าของ Rank ไม่ถึง)" });

  const castle = _castleRowToObj(found.row);
  if (castle.status !== "Active") {
    return ok({ castle, questions: [], error: "ปราสาทนี้พังไปแล้วในสัปดาห์นี้" });
  }

  let attackerStats = null;
  if (attackerId) {
    try { attackerStats = JSON.parse(getPlayerStats(attackerId).getContent()).stats || null; }
    catch (e) {}
  }

  // โจทย์ของปราสาท = มาจาก Artifact ที่ "เจ้าของปราสาท" ครอบครองทั้งหมด
  // (ไม่ใช่ Artifact ของผู้โจมตี) — เช็คก่อนว่าเจ้าของถือ Artifact อะไรบ้าง
  // ใน Player_Inventory แล้วเอา ArtifactID เหล่านั้นไปจับคู่กับ SeriesID
  // ในชีต QuestionBank (เฉพาะแถวที่ isRare = TRUE) รวมทุก Artifact ที่มี
  // เป็น pool เดียวกัน
  //
  // ⚠️ ข้อสมมติที่ยังไม่ได้ยืนยัน 100%: ArtifactID กับ SeriesID เป็น
  // ค่าเดียวกันเป๊ะๆ (เช่น Artifact "WW001" ↔ โจทย์ที่ตั้ง SeriesID = "WW001")
  // ตอนสร้างชุดโจทย์ Rare จริงในอนาคต ต้องตั้ง SeriesID ให้ตรงกับ ArtifactID
  // ของไอเทมนั้น ถ้าจะใช้คนละชื่อ/คนละ mapping บอกได้เลย แก้จุดเดียวตรงนี้
  let ownedSeriesIds = [];
  try {
    const inv = JSON.parse(getPlayerInventory(targetOwnerId).getContent());
    ownedSeriesIds = (inv.inventory || []).map(i => String(i.artifactId).trim()).filter(Boolean);
  } catch (e) {}

  let rarePool = [];
  if (ownedSeriesIds.length) {
    try {
      const ownedSet = new Set(ownedSeriesIds);
      const allData  = JSON.parse(getQuestions().getContent()); // ไม่ระบุ setName = ทุกชุด
      rarePool = (allData.questions || [])
        .filter(q => q.isRare && ownedSet.has(String(q.seriesId).trim()));
    } catch (e) {}
  }
  const pool = shuffle_(rarePool).slice(0, CASTLE_QUESTIONS_PER_ATTACK);
  if (!pool.length) {
    return ok({
      castle, questions: [],
      error: "เจ้าของปราสาทนี้ยังไม่มีโจทย์จาก Artifact ที่ครอบครองมากพอสำหรับป้องกันปราสาท กรุณาติดต่อครู",
    });
  }

  return ok({ castle, questions: pool, playerStats: attackerStats });
}

// ── ปราสาทของตัวเอง + log การถูกโจมตีล่าสุด (ให้เจ้าของดูสถานะได้) ──
function getMyCastle(studentId) {
  if (!studentId) return ok({ castle: null, attacks: [] });
  const sheet  = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const weekId = getCurrentWeekId();
  const found  = _findCastleRow(sheet, weekId, studentId);
  const castle = found ? _castleRowToObj(found.row) : null;

  let attacks = [];
  try {
    const logSheet = getSheet("CastleAttackLog");
    attacks = logSheet.getDataRange().getValues().slice(1)
      .filter(r => _normalizeWeekId(r[1]) === weekId && String(r[4]).trim() === String(studentId).trim())
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 20)
      .map(r => ({
        timestamp: r[0], attackerNickname: String(r[3]),
        damage: Number(r[5]) || 0, penetrated: r[6] === true || r[6] === "TRUE",
        goldEarned: Number(r[7]) || 0,
      }));
  } catch (e) { /* ยังไม่มี log ก็ไม่เป็นไร */ }

  return ok({ weekId, castle, attacks });
}

// ── กระดานอันดับสัปดาห์นี้ + ประวัติรางวัลผีเสื้อที่แจกไปแล้ว (หน้า
//    Leaderboard/History ฝั่ง React) — อ่านอย่างเดียว ไม่แตะ log การเขียน
//    ใดๆ ใช้ข้อมูลจาก CastleAttackLog + CastleRewardLog ที่มีอยู่แล้ว
function getCastleLeaderboard(studentId) {
  const weekId = getCurrentWeekId();

  // 1) อันดับดาเมจรวมของสัปดาห์นี้ (รวมทุกปราสาทที่แต่ละคนไปตี) — โชว์
  //    บรรยากาศการแข่งขันสดๆ เท่านั้น ไม่ใช่ตัวตัดสินรางวัลจริง (รางวัล
  //    จริงคิดแยกรายปราสาทตอนปิดสัปดาห์ ดู _settleCastleWeeklyLeaderboardRewards)
  let liveTopAttackers = [];
  let myWeeklyDamage = 0;
  try {
    const logRows = getSheet("CastleAttackLog").getDataRange().getValues().slice(1)
      .filter(r => _normalizeWeekId(r[1]) === weekId && (r[6] === true || r[6] === "TRUE"));
    const totals = {}; // { studentId: { nickname, totalDamage, castlesAttacked:Set } }
    logRows.forEach(r => {
      const sid = String(r[2]);
      if (!totals[sid]) totals[sid] = { nickname: String(r[3]), totalDamage: 0, castlesAttacked: new Set() };
      totals[sid].totalDamage += Number(r[5]) || 0;
      totals[sid].castlesAttacked.add(String(r[4]));
    });
    liveTopAttackers = Object.entries(totals)
      .map(([sid, t]) => ({
        studentId: sid, nickname: t.nickname,
        totalDamage: t.totalDamage, castlesAttacked: t.castlesAttacked.size,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage)
      .slice(0, 10);
    if (studentId && totals[String(studentId)]) {
      myWeeklyDamage = totals[String(studentId)].totalDamage;
    }
  } catch (e) { /* ยังไม่มี log ก็ไม่เป็นไร */ }

  // 2) ประวัติรางวัลผีเสื้อ Yellow Swallowtail ที่แจกไปแล้ว (ล่าสุดก่อน)
  let recentRewards = [];
  try {
    recentRewards = getSheet("CastleRewardLog").getDataRange().getValues().slice(1)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 50)
      .map(r => ({
        timestamp: r[0], weekId: String(r[1]), ownerStudentId: String(r[2]),
        studentId: String(r[3]), nickname: String(r[4]),
        rewardType: String(r[5]), butterflyAmount: Number(r[6]) || 0,
      }));
  } catch (e) { /* ยังไม่เคยปิดสัปดาห์แรกก็ไม่เป็นไร */ }

  return ok({ weekId, liveTopAttackers, myWeeklyDamage, recentRewards });
}

// ── บันทึกผลการโจมตี 1 ครั้ง ──────────────────────────────────
// data = { attackerId, attackerNickname, targetOwnerId, correctCount, attemptId }
function saveCastleAttack(data) {
  if (data.attackerId && data.targetOwnerId &&
      String(data.attackerId).trim() === String(data.targetOwnerId).trim()) {
    return ok({ success: false, error: "โจมตีปราสาทตัวเองไม่ได้" });
  }

  const logSheet = getOrCreateSheet("CastleAttackLog", [
    "Timestamp","WeekId","AttackerStudentId","AttackerNickname",
    "TargetOwnerId","Damage","Penetrated","GoldEarned","AttemptId"
  ]);
  logSheet.getRange("B:B").setNumberFormat("@"); // กัน WeekId ถูกแปลงเป็น Date

  // ⚡ กันบันทึกซ้ำจาก retry (เหมือนระบบตีบอส — client อาจ retry ตอน
  // response หลุดหลังจาก server ประมวลผลสำเร็จไปแล้ว)
  if (data.attemptId) {
    const dup = logSheet.getDataRange().getValues().slice(1)
      .some(r => String(r[8]).trim() === String(data.attemptId).trim());
    if (dup) return ok({ success: true, duplicate: true });
  }

  const castleSheet = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const weekId = getCurrentWeekId();
  const found  = _findCastleRow(castleSheet, weekId, data.targetOwnerId);
  if (!found) return ok({ success: false, error: "ไม่พบปราสาทเป้าหมายในสัปดาห์นี้" });

  const row    = found.row;
  const status = String(row[CASTLE_COL.STATUS]).trim();
  if (status !== "Active") {
    return ok({ success: false, error: "ปราสาทนี้พังไปแล้ว โจมตีซ้ำไม่ได้", alreadyFallen: true });
  }

  const hpMax      = Number(row[CASTLE_COL.HP_MAX])      || 0;
  const hpCurrent  = Number(row[CASTLE_COL.HP_CUR])      || 0;
  const def        = Number(row[CASTLE_COL.DEF])         || 0;
  const rewardPool = Number(row[CASTLE_COL.REWARD_POOL]) || 0;

  let attackerStats = null;
  try { attackerStats = JSON.parse(getPlayerStats(data.attackerId).getContent()).stats || null; }
  catch (e) {}
  const atk = attackerStats?.effective?.atk ?? 1;

  const rawDamage  = (Number(data.correctCount) || 0) + atk;
  const penetrated = rawDamage > def;

  let goldEarned = 0, newHp = hpCurrent, newStatus = status, hpLost = 0;
  if (penetrated) {
    hpLost = Math.min(rawDamage, hpCurrent); // กันคำนวณเกิน HP ที่เหลือจริง (ทำให้ pool เกินได้)
    newHp = Math.max(0, hpCurrent - hpLost);
    goldEarned = hpMax > 0 ? Math.round((hpLost / hpMax) * rewardPool) : 0;
    if (newHp <= 0) newStatus = "Fallen";

    castleSheet.getRange(found.rowIdx + 1, CASTLE_COL.HP_CUR + 1).setValue(newHp);
    castleSheet.getRange(found.rowIdx + 1, CASTLE_COL.STATUS + 1).setValue(newStatus);
    if (goldEarned > 0) {
      _addGold(data.attackerId, goldEarned, `โจมตีปราสาทของ ${row[CASTLE_COL.OWNER_NICK]} +${goldEarned} Gold`);
    }
  }

  logSheet.appendRow([
    new Date(), weekId, data.attackerId || "", data.attackerNickname || "",
    data.targetOwnerId || "", hpLost, penetrated, goldEarned, data.attemptId || "",
  ]);

  return ok({
    success: true, penetrated, damage: hpLost,
    goldEarned, newHp, castleFallen: newStatus === "Fallen",
  });
}

// ── ฟื้นเลือดปราสาทตาม Regen (รันทุกวันผ่าน Trigger) ─────────────
// ฟื้นได้ไม่เกิน HpMax เหมือนระบบ regen ของ Boss ที่มีอยู่แล้ว
// เฉพาะปราสาทของสัปดาห์ปัจจุบันที่ยัง Active เท่านั้น (พังไปแล้วไม่ฟื้น)
function castleDailyRegen() {
  const castleSheet = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const weekId = getCurrentWeekId();
  const rows = castleSheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < rows.length; i++) {
    if (_normalizeWeekId(rows[i][CASTLE_COL.WEEK_ID]) !== weekId) continue;
    if (String(rows[i][CASTLE_COL.STATUS]).trim() !== "Active") continue;
    const hpMax = Number(rows[i][CASTLE_COL.HP_MAX]) || 0;
    const hpCur = Number(rows[i][CASTLE_COL.HP_CUR]) || 0;
    const regen = Number(rows[i][CASTLE_COL.REGEN])  || 0;
    if (regen <= 0 || hpCur >= hpMax) continue;
    const newHp = Math.min(hpMax, hpCur + regen);
    castleSheet.getRange(i + 1, CASTLE_COL.HP_CUR + 1).setValue(newHp);
    updated++;
  }
  Logger.log(`castleDailyRegen: ฟื้นเลือดปราสาท ${updated} หลัง (สัปดาห์ ${weekId})`);
}

// ── เขียนผีเสื้อ Yellow Swallowtail สะสมให้นักเรียน (คอลัม J) ────
function _awardYellowSwallowtail(studentId, amount, reason) {
  if (!studentId || !amount) return;
  const sheet = getSheet(YELLOW_SWALLOWTAIL_SHEET);
  const header = sheet.getRange(1, YELLOW_SWALLOWTAIL_COL).getValue();
  if (!header) sheet.getRange(1, YELLOW_SWALLOWTAIL_COL).setValue("Castle Mode");

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === String(studentId).trim()) { // คอลัม B = รหัส
      const cur = Number(rows[i][YELLOW_SWALLOWTAIL_COL - 1]) || 0;
      sheet.getRange(i + 1, YELLOW_SWALLOWTAIL_COL).setValue(cur + amount);
      return;
    }
  }
  Logger.log(`_awardYellowSwallowtail: ไม่พบรหัส ${studentId} ใน Sheet "${YELLOW_SWALLOWTAIL_SHEET}" (${reason})`);
}

// ── แจกรางวัลรายสัปดาห์ (ผีเสื้อ Yellow Swallowtail) ให้ฝ่ายโจมตี ──
// "1 ปราสาท เหมือน บอส 1 ตัว" → แจกแยกเป็นรายปราสาท ไม่รวมดาเมจข้าม
// ปราสาทกัน (คนที่ไปตีหลายปราสาทในสัปดาห์เดียว นับดาเมจแยกของแต่ละ
// ปราสาท ไม่บวกรวมกันเป็นก้อนเดียว) — รันครั้งเดียวต่อสัปดาห์ (กันซ้ำ
// ผ่าน CastleRewardLog) เรียกจาก castleWeeklyReset() หลังปิดสัปดาห์นั้นเสร็จ
//
// ต่อ "1 ปราสาท" (เหมือน _processBossRewards ของบอส แต่ scope แคบลง
// เหลือแค่ log ของปราสาทนั้นๆ):
//   - "อันดับ 1-5" = จัดอันดับผู้โจมตีตามผลรวมดาเมจที่ตีทะลุเกราะปราสาท
//     นั้นได้ในสัปดาห์นี้ (เฉพาะปราสาทนั้นปราสาทเดียว)
//   - "มากสุด" = ดาเมจครั้งเดียวที่สูงที่สุดที่มีคนตีปราสาทนั้นได้ในสัปดาห์นี้
//   - "ปิดเกม" = แจกเฉพาะปราสาทที่ล่มจริง (Fallen) ในสัปดาห์นี้ ให้คนที่
//     ตีไม้สุดท้ายที่ทะลุเกราะปราสาทนั้น (ปราสาทที่รอดจนจบสัปดาห์ไม่มี
//     "ปิดเกม" แจก เหมือนบอสที่ไม่ตายก็ไม่มี Last Hit)
function _settleCastleWeeklyLeaderboardRewards(weekId) {
  const rewardLogSheet = getOrCreateSheet("CastleRewardLog", [
    "Timestamp","WeekId","OwnerStudentId","StudentID","Nickname","RewardType","ButterflyAmount"
  ]);
  rewardLogSheet.getRange("B:B").setNumberFormat("@"); // กัน WeekId ถูกแปลงเป็น Date
  const already = rewardLogSheet.getDataRange().getValues().slice(1)
    .some(r => _normalizeWeekId(r[1]) === weekId);
  if (already) return; // กันแจกซ้ำถ้ารันซ้ำ

  let allLogRows;
  try {
    allLogRows = getSheet("CastleAttackLog").getDataRange().getValues().slice(1)
      .filter(r => _normalizeWeekId(r[1]) === weekId && (r[6] === true || r[6] === "TRUE"));
  } catch (e) { return; }
  if (!allLogRows.length) return; // สัปดาห์นี้ไม่มีใครตีทะลุเกราะเลย ไม่มีอะไรให้แจก

  // จัดกลุ่ม log ตามปราสาทเป้าหมาย (TargetOwnerId) — 1 กลุ่ม = 1 ปราสาท
  const byCastle = {}; // { ownerId: [logRow, ...] }
  allLogRows.forEach(r => {
    const ownerId = String(r[4]).trim();
    if (!byCastle[ownerId]) byCastle[ownerId] = [];
    byCastle[ownerId].push(r);
  });

  // เช็คว่าปราสาทไหน Fallen จริงในสัปดาห์นี้บ้าง (ไว้ตัดสิน "ปิดเกม")
  const castleSheet = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  const fallenOwnerIds = new Set(
    castleSheet.getDataRange().getValues().slice(1)
      .filter(r => _normalizeWeekId(r[CASTLE_COL.WEEK_ID]) === weekId &&
                   String(r[CASTLE_COL.STATUS]).trim() === "Fallen")
      .map(r => String(r[CASTLE_COL.OWNER_ID]).trim())
  );

  const topKeys = ["top1", "top2", "top3", "top4", "top5"];

  Object.entries(byCastle).forEach(([ownerId, logRows]) => {
    // 1) อันดับ 1-5 (ผลรวมดาเมจต่อผู้โจมตี เฉพาะปราสาทนี้)
    const totalDmg = {};
    logRows.forEach(r => {
      const sid = String(r[2]);
      if (!totalDmg[sid]) totalDmg[sid] = { total: 0, nickname: String(r[3]) };
      totalDmg[sid].total += Number(r[5]) || 0;
    });
    const sorted = Object.entries(totalDmg).sort((a, b) => b[1].total - a[1].total);
    sorted.slice(0, 5).forEach(([sid, info], idx) => {
      const amt = CASTLE_WEEKLY_REWARDS[topKeys[idx]];
      _awardYellowSwallowtail(sid, amt, `Castle(${ownerId}) ${topKeys[idx]}: ${weekId}`);
      rewardLogSheet.appendRow([new Date(), weekId, ownerId, sid, info.nickname, topKeys[idx], amt]);
    });

    // 2) มากสุด (ดาเมจครั้งเดียวสูงสุด เฉพาะปราสาทนี้)
    const mostHit = logRows.reduce((max, r) => (Number(r[5]) > Number(max[5]) ? r : max), logRows[0]);
    const mostSid = String(mostHit[2]);
    _awardYellowSwallowtail(mostSid, CASTLE_WEEKLY_REWARDS.most, `Castle(${ownerId}) Most Damage: ${weekId}`);
    rewardLogSheet.appendRow([new Date(), weekId, ownerId, mostSid, String(mostHit[3]), "most", CASTLE_WEEKLY_REWARDS.most]);

    // 3) ปิดเกม (เฉพาะปราสาทที่ Fallen จริง — คนตีไม้สุดท้ายที่ทะลุเกราะ)
    if (fallenOwnerIds.has(ownerId)) {
      const sortedByTime = [...logRows].sort((a, b) => new Date(a[0]) - new Date(b[0]));
      const finisher = sortedByTime[sortedByTime.length - 1];
      const fsid = String(finisher[2]);
      _awardYellowSwallowtail(fsid, CASTLE_WEEKLY_REWARDS.finisher, `Castle(${ownerId}) Finisher: ${weekId}`);
      rewardLogSheet.appendRow([new Date(), weekId, ownerId, fsid, String(finisher[3]), "finisher", CASTLE_WEEKLY_REWARDS.finisher]);
    }
  });

  Logger.log(`_settleCastleWeeklyLeaderboardRewards: แจกรางวัลรายสัปดาห์ Yellow Swallowtail ของสัปดาห์ ${weekId} เรียบร้อย (${Object.keys(byCastle).length} ปราสาท)`);
}

// ── ตัดรอบสัปดาห์: จ่ายรางวัลคนรอด + แจกผีเสื้อรายสัปดาห์ + เปิดปราสาทใหม่ ──
// เขียนให้รันซ้ำได้อย่างปลอดภัย (idempotent):
//   - สัปดาห์ที่จ่ายรางวัลไปแล้ว (มี SettledAt) จะไม่จ่ายซ้ำ
//   - ปราสาทที่เปิดไปแล้วของสัปดาห์นี้ (มีแถวอยู่แล้ว) จะไม่สร้างซ้ำ
//   - รางวัลรายสัปดาห์กันซ้ำผ่าน CastleRewardLog (ดูฟังก์ชันด้านบน)
// เรียกเองได้ตลอดเวลาโดยไม่พัง ไม่จำเป็นต้องรอ trigger เท่านั้น
function castleWeeklyReset() {
  const castleSheet = getOrCreateSheet("Castle", CASTLE_SHEET_HEADERS);
  // กันไม่ให้ Sheets auto-convert WeekId ("yyyy-MM-dd") เป็น Date ตอนเขียน
  // แถวใหม่ (ดูคอมเมนต์ที่ _normalizeWeekId ด้านบนสำหรับรายละเอียดบั๊กนี้)
  castleSheet.getRange("A:A").setNumberFormat("@");
  const weekId = getCurrentWeekId();
  const rows = castleSheet.getDataRange().getValues();

  // 1) จ่ายรางวัลของปราสาทสัปดาห์ก่อนๆ ที่ยัง "Active" (แปลว่ารอดจนจบ
  //    สัปดาห์นั้นโดยไม่มีใครทำลายได้) และยังไม่เคยจ่าย (SettledAt ว่าง)
  const settledWeekIds = new Set();
  for (let i = 1; i < rows.length; i++) {
    const rWeekId   = _normalizeWeekId(rows[i][CASTLE_COL.WEEK_ID]);
    const settledAt = rows[i][CASTLE_COL.SETTLED_AT];
    if (rWeekId === weekId || settledAt) continue; // สัปดาห์นี้เอง หรือจ่ายไปแล้ว ข้าม
    const status      = String(rows[i][CASTLE_COL.STATUS]).trim();
    const hpMax        = Number(rows[i][CASTLE_COL.HP_MAX])       || 0;
    const hpCurrent     = Number(rows[i][CASTLE_COL.HP_CUR])      || 0;
    const rewardPool    = Number(rows[i][CASTLE_COL.REWARD_POOL]) || 0;
    const ownerId       = String(rows[i][CASTLE_COL.OWNER_ID]).trim();

    if (status === "Active" && hpCurrent > 0) {
      const goldEarned = hpMax > 0 ? Math.round((hpCurrent / hpMax) * rewardPool) : 0;
      if (goldEarned > 0) _addGold(ownerId, goldEarned, `ปราสาทรอดจบสัปดาห์ +${goldEarned} Gold`);
      castleSheet.getRange(i + 1, CASTLE_COL.STATUS + 1).setValue("Survived");
    }
    castleSheet.getRange(i + 1, CASTLE_COL.SETTLED_AT + 1).setValue(new Date()); // กันประมวลผลซ้ำ
    settledWeekIds.add(rWeekId);
  }

  // 1.5) แจกผีเสื้อรายสัปดาห์ให้ทุกสัปดาห์ที่เพิ่งปิดรอบไป (กันซ้ำในตัวเองอยู่แล้ว)
  settledWeekIds.forEach(wId => _settleCastleWeeklyLeaderboardRewards(wId));

  // 2) เปิดปราสาทใหม่ของสัปดาห์นี้ ให้ทุกคนที่ Rank >= CASTLE_MIN_RANK
  //    (ข้ามคนที่มีปราสาทของสัปดาห์นี้อยู่แล้ว กันสร้างซ้ำถ้ารันซ้ำ)
  const existingThisWeek = new Set(
    castleSheet.getDataRange().getValues().slice(1)
      .filter(r => _normalizeWeekId(r[CASTLE_COL.WEEK_ID]) === weekId)
      .map(r => String(r[CASTLE_COL.OWNER_ID]).trim())
  );

  const identitySheet = getSheet("Identity");
  const idRows = identitySheet.getDataRange().getValues().slice(1);
  const eligible = idRows.filter(r => (Number(r[8]) || 0) >= CASTLE_MIN_RANK);

  const statsSheet = getSheet("Player_Stats");
  const statsRows  = statsSheet.getDataRange().getValues().slice(1);
  const statsMap = {};
  statsRows.forEach(r => { statsMap[String(r[1]).trim()] = r; });

  // รวม Level ของทุก Artifact ที่แต่ละคนถือ (อ่านทีเดียวทั้งชีต แทนที่จะ
  // เรียก getPlayerInventory() ซ้ำในลูป — เร็วกว่ามากถ้ามีคนเข้าเงื่อนไขเยอะ)
  // ⚠️ Artifact ที่มีร่างเดียว (ไม่เคยอัปเลเวล) ให้นับเป็น Level 1
  const invSheet = getSheet("Player_Inventory");
  const invRows  = invSheet.getDataRange().getValues().slice(1);
  const artifactLevelMap = {}; // { studentId: ผลรวม Level ของทุก Artifact }
  invRows.forEach(r => {
    const sid = String(r[0]).trim();
    if (!sid) return;
    const lv = Number(r[3]) || 1; // คอลัม D = Level, ว่าง/parse ไม่ได้ → นับ 1
    artifactLevelMap[sid] = (artifactLevelMap[sid] || 0) + lv;
  });

  let created = 0;
  eligible.forEach(idRow => {
    const ownerId = String(idRow[1]).trim();
    if (!ownerId || existingThisWeek.has(ownerId)) return;
    const statsRow = statsMap[ownerId];
    const effHp  = statsRow ? (Number(statsRow[8])  || 1) : 1; // effective HP  (Player_Stats คอลัม I)
    const effDef = statsRow ? (Number(statsRow[10]) || 1) : 1; // effective DEF (Player_Stats คอลัม K)
    const effSpd = statsRow ? (Number(statsRow[11]) || 1) : 1; // effective SPD (Player_Stats คอลัม L)
    const level  = Number(idRow[8]) || CASTLE_MIN_RANK;

    const hpMax = effHp  * CASTLE_HP_PER_STAT;
    const def   = effDef * CASTLE_DEF_PER_STAT;
    const regen = effSpd * CASTLE_REGEN_PER_SPD;

    // RewardPool = 200×Level(ปราสาท) + (ผลรวม Level ของทุก Artifact ที่ถือ)×100
    const artifactLevelSum = artifactLevelMap[ownerId] || 0;
    const rewardPool = CASTLE_GOLD_PER_LEVEL * level + artifactLevelSum * CASTLE_ARTIFACT_LEVEL_BONUS;

    castleSheet.appendRow([
      weekId, ownerId, String(idRow[5]).trim(), level,
      hpMax, hpMax, def, regen, rewardPool,
      "Active", new Date(), "",
    ]);
    created++;
  });

  Logger.log(`castleWeeklyReset: สัปดาห์ ${weekId} — เปิดปราสาทใหม่ ${created} หลัง (มีอยู่แล้ว ${existingThisWeek.size} หลัง), ปิดรางวัลสัปดาห์เก่าไป ${settledWeekIds.size} สัปดาห์`);
}

// ── รันครั้งเดียวจาก Apps Script Editor เพื่อตั้ง Trigger อัตโนมัติทั้ง 2 ตัว ──
function installCastleTriggers() {
  // ลบ trigger เดิมของฟังก์ชันพวกนี้ก่อน กันสร้างซ้ำถ้ารันมากกว่า 1 ครั้ง
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "castleWeeklyReset" || fn === "castleDailyRegen") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("castleWeeklyReset")
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(0).create();
  ScriptApp.newTrigger("castleDailyRegen")
    .timeBased().everyDays(1).atHour(0).create();

  Logger.log("ตั้ง Trigger castleWeeklyReset (ทุกวันจันทร์เที่ยงคืน) และ castleDailyRegen (ทุกวันเที่ยงคืน) เรียบร้อย — กำลังรันครั้งแรกทันทีเพื่อเปิดปราสาทรอบแรก...");
  castleWeeklyReset(); // รันทันที 1 ครั้ง เปิดปราสาทรอบแรกโดยไม่ต้องรอถึงวันจันทร์
}

// ใช้ shuffle ภายใน Apps Script เอง (ของเดิม shuffle() อยู่ฝั่ง frontend เท่านั้น)
function shuffle_(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
