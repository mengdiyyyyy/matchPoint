#!/usr/bin/env node
// Bulk-import classmate profiles from .docx files in 同学资料附件/
// Generates ./classmates-pool.json that matchpoint-app.html auto-loads.
//
// Run:  node bulk-import-classmates.js
//
// Notes:
//  - Only "Extracurricular activities" is real signal in the source docs.
//  - Per-sport answers (level / venue / NTRP / pace etc.) are
//    DETERMINISTICALLY synthesized from a hash of (uid + sportKey) so the
//    matching demo behaves naturally across reloads.
//  - Stable seeding means small variation across classmates → some matches
//    and some red-line triggers, which is what we want for a real demo.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SRC_DIR = '/Users/mengdi/Documents/清华MBA/semester4/coffeeChat/resume/同学资料附件';
const OUT_FILE = path.join(__dirname, 'classmates-pool.json');

// ============================================================
// Sport keyword map → SPORTS keys in matchpoint-app.html
// ============================================================
const SPORT_KEYWORDS = {
  badminton:   ['badminton', '羽毛球'],
  tennis:      ['tennis', '网球'],
  basketball:  ['basketball', '篮球'],
  running:     ['running', 'jogging', 'marathon', '跑步', '马拉松'],
  fitness:     ['fitness', 'gym', 'weightlifting', 'workout', '健身'],
  skiing:      ['skiing', 'snowboard', '滑雪'],
  pingpong:    ['ping pong', 'pingpong', 'table tennis', '乒乓'],
  football:    ['football', 'soccer', '足球'],
  swimming:    ['swimming', 'swim', '游泳'],
  cycling:     ['cycling', 'biking', 'cycle', 'bike', '骑行', '单车', '自行车'],
  hiking:      ['hiking', 'trekking', 'mountain climbing', '徒步', '登山'],
  volleyball:  ['volleyball', '排球'],
  pickleball:  ['pickleball', '匹克球'],
  bowling:     ['bowling', '保龄'],
  climbing:    ['rock climbing', 'bouldering', 'climbing', '攀岩', '抱石'],
  frisbee:     ['frisbee', 'ultimate', '飞盘'],
  paddleboard: ['paddle board', 'paddleboard', 'kayak', '桨板', '皮划艇'],
  orienteering:['orienteering', '定向越野'],
  billiards:   ['billiards', 'pool', 'snooker', '台球', '斯诺克'],
  yoga:        ['yoga', 'pilates', '瑜伽', '普拉提'],
};

// ============================================================
// Per-sport answer pools — MUST match SPORT_QS in matchpoint-app.html
// (questions in the same order)
// ============================================================
const ANSWER_POOLS = {
  badminton:[
    {q:'一般在哪里打羽毛球？',pool:['清华大学','朝阳区','海淀区','望京','国贸附近','五道口']},
    {q:'偏好单打还是双打？',pool:['单打','双打','都可以']},
    {q:'水平大概是？',pool:['新手','入门','进阶','高手']},
    {q:'约局一般缺几人？',pool:['缺1人','缺2-3人','看情况']},
  ],
  tennis:[
    {q:'一般在哪里打网球？',pool:['清华西操','朝阳公园','工体','奥森','五棵松']},
    {q:'偏好单打还是双打？',pool:['单打','双打','都可以']},
    {q:'NTRP 水平？',pool:['2.5以下','2.5-3.0','3.0-3.5','3.5-4.0','4.0+']},
    {q:'有固定球场资源吗？',pool:['有','偶尔有','没有']},
  ],
  basketball:[
    {q:'一般在哪里打篮球？',pool:['清华西操','奥森','国贸球场','五道口','望京']},
    {q:'偏好几人制？',pool:['3V3','5V5','半场休闲','都行']},
    {q:'打球强度偏好？',pool:['休闲养生','认真竞技','野球随性']},
  ],
  running:[
    {q:'一般在哪里跑步？',pool:['奥森','清华操场','护城河','朝阳公园','颐和园']},
    {q:'配速大概？',pool:['7分外','6-7分','5-6分','4-5分','按心率']},
    {q:'一般跑多少公里？',pool:['3-5km','5-10km','10-15km','半马+']},
  ],
  fitness:[
    {q:'在哪个区域健身？',pool:['清华附近','望京','三里屯','国贸','海淀']},
    {q:'训练类型偏好？',pool:['力量训练','有氧为主','综合搭配']},
    {q:'需要搭子保护吗？',pool:['需要','不需要','大重量时需要']},
  ],
  skiing:[
    {q:'偏好哪个雪场？',pool:['崇礼系','东北系','新疆系','出境随缘']},
    {q:'雪道难度？',pool:['绿道','蓝道','红道','黑道+']},
    {q:'装备状况？',pool:['全套自有','部分自有','全部租借']},
    {q:'愿意过夜吗？',pool:['是','否','看情况']},
    {q:'愿意拼车吗？',pool:['是','否','看情况']},
  ],
  pingpong:[
    {q:'在哪里打乒乓球？',pool:['清华大学','海淀球馆','望京','国贸']},
    {q:'单打还是双打？',pool:['单打','双打','都可以']},
    {q:'水平？',pool:['新手','入门','进阶','高手']},
    {q:'需要教学局？',pool:['是','否','偶尔']},
  ],
  football:[
    {q:'在哪里踢球？',pool:['清华西操','朝阳公园','奥森','五棵松']},
    {q:'几人制？',pool:['5人制','7人制','11人制','都行']},
    {q:'位置偏好？',pool:['前锋','中场','后卫','门将','随意']},
    {q:'强度偏好？',pool:['养生随意','认真竞技']},
  ],
  swimming:[
    {q:'在哪里游泳？',pool:['清华游泳馆','国家游泳中心','奥体','望京']},
    {q:'偏好泳道？',pool:['慢速道','中速道','快速道']},
    {q:'主要泳姿？',pool:['自由泳','蛙泳','蝶泳','背泳']},
    {q:'游泳目标？',pool:['打卡健身','提升技术','约练进阶']},
  ],
  cycling:[
    {q:'主要骑行区域？',pool:['延庆','妫水河','颐和园','大兴','怀柔']},
    {q:'常规骑行距离？',pool:['30km以内','30-60km','60-100km','100km+']},
    {q:'平均时速？',pool:['<20km/h','20-25km/h','25-30km/h','30+km/h']},
    {q:'装备类型？',pool:['竞技公路车','入门公路车','山地车','折叠车']},
    {q:'爬坡难度接受？',pool:['平路为主','小坡','中等爬坡','挑战爬坡']},
  ],
  hiking:[
    {q:'常去哪些路线？',pool:['妙峰山','灵山','香山','箭扣','长城']},
    {q:'能应对的难度？',pool:['入门级','中级','进阶','挑战级']},
    {q:'一般徒步多少公里？',pool:['5km以内','5-15km','15-25km','25km+']},
    {q:'愿意过夜露营？',pool:['是','否','偶尔']},
    {q:'强度偏好？',pool:['轻松游览','中强度','认真挑战']},
  ],
  volleyball:[
    {q:'在哪里打排球？',pool:['清华大学','海淀公园','朝阳']},
    {q:'几人制？',pool:['沙滩2V2','4V4','6V6','都行']},
    {q:'水平？',pool:['新手','入门','进阶','高手']},
    {q:'强度偏好？',pool:['娱乐','竞技']},
  ],
  pickleball:[
    {q:'在哪里打匹克球？',pool:['朝阳','望京','清华大学','国贸']},
    {q:'单打/双打？',pool:['单打','双打','都可以']},
    {q:'水平？',pool:['新手','入门','进阶','高手']},
    {q:'有固定场地？',pool:['有','没有','偶尔']},
  ],
  bowling:[
    {q:'在哪个区域打保龄球？',pool:['国贸','西单','望京','三里屯']},
    {q:'几人同玩？',pool:['2人','3-4人','5人+','随意']},
    {q:'打几局？',pool:['1-2局','3-4局','5局+','随意']},
    {q:'玩法偏好？',pool:['休闲娱乐','认真比赛']},
  ],
  climbing:[
    {q:'在哪个岩馆？',pool:['Wild Moves','岩时','OnSight','源点']},
    {q:'难度等级？',pool:['V0-V2','V3-V5','V6-V8','V8+']},
    {q:'有保护能力？',pool:['是，已认证','是，自学','没有']},
    {q:'需要教学局？',pool:['是','否','有时候']},
  ],
  frisbee:[
    {q:'在哪里玩飞盘？',pool:['朝阳公园','奥森','清华大学','望京']},
    {q:'几人制？',pool:['4V4','5V5','7V7','随意']},
    {q:'水平？',pool:['新手','入门','进阶','高手']},
    {q:'强度偏好？',pool:['休闲娱乐','认真竞技']},
    {q:'熟悉规则？',pool:['熟悉','基本了解','不太了解']},
  ],
  paddleboard:[
    {q:'在哪里玩桨板？',pool:['昆明湖','密云水库','十三陵','怀柔']},
    {q:'装备状况？',pool:['自有全套','部分自有','全部租借']},
    {q:'水平？',pool:['新手','进阶','高手']},
    {q:'需要教学？',pool:['是','否','有时候']},
  ],
  orienteering:[
    {q:'常去哪些场地？',pool:['奥森','延庆','清华','颐和园']},
    {q:'难度偏好？',pool:['入门白橙','进阶黄绿','高级红蓝','精英棕黑']},
    {q:'一般跑多少公里？',pool:['3km以内','3-5km','5-10km','10km+']},
    {q:'通常几人参加？',pool:['独自','2人','3-5人','团队']},
  ],
  billiards:[
    {q:'在哪个区域打台球？',pool:['三里屯','望京','清华附近','国贸']},
    {q:'偏好台型？',pool:['美式8球','斯诺克','中式8球','都行']},
    {q:'水平？',pool:['新手','入门','进阶','高手']},
    {q:'打几局？',pool:['1-3局','4-6局','7局+','按时间']},
  ],
  yoga:[
    {q:'在哪里上课？',pool:['清华健身房','朝阳瑜伽馆','三里屯','望京']},
    {q:'课程类型？',pool:['哈他瑜伽','流瑜伽','普拉提','热瑜伽']},
    {q:'强度偏好？',pool:['放松级','中等强度','高强度']},
    {q:'新手友好需求？',pool:['我是新手','有基础','进阶练习者']},
  ],
};

const TIME_DAYS = [['周末'],['周中'],['周中','周末']];
const TIME_TIMES = [['上午'],['下午'],['晚上'],['下午','晚上'],['上午','下午','晚上']];

// ============================================================
// HELPERS
// ============================================================
function hash(s) {
  return parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0, 12), 16);
}
function pick(arr, seed) { return arr[seed % arr.length]; }

function extractTextFromDocx(filepath) {
  const tmp = `/tmp/docx_${Math.random().toString(36).slice(2,8)}`;
  fs.mkdirSync(tmp, {recursive: true});
  try {
    execSync(`unzip -o "${filepath}" -d "${tmp}"`, {stdio: 'ignore'});
    const xmlPath = path.join(tmp, 'word/document.xml');
    if (!fs.existsSync(xmlPath)) return '';
    const xml = fs.readFileSync(xmlPath, 'utf8');
    // Strip XML tags but preserve paragraph breaks
    return xml.replace(/<w:p[^>]*>/g, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
              .replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n');
  } catch (e) {
    return '';
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

function detectSports(text) {
  if (!text) return [];
  // Prefer the "Extracurricular activities:" line if present
  const m = text.match(/Extracurricular activities?:?\s*([^\n]{0,400})/i);
  const scope = m ? m[1] : text;
  const lc = scope.toLowerCase();
  const found = [];
  for (const [key, kws] of Object.entries(SPORT_KEYWORDS)) {
    if (kws.some(k => lc.includes(k.toLowerCase()) || scope.includes(k))) {
      found.push(key);
    }
  }
  return found;
}

function extractName(filename) {
  let base = path.basename(filename, path.extname(filename));
  base = base.replace(/^\s*2024[\s_]+THU\s+GMBA\s+Student\s+Profile[_\s]+/i, '')
             .replace(/Class of.*Profile.*$/i, '')
             .replace(/^Student Profile[\s_-]*/i, '')
             .trim();
  const chinese = base.match(/[一-鿿]{2,4}/);
  if (chinese) return chinese[0];
  // Fallback: English name — keep first 2 words
  return base.split(/[\s_]+/).slice(0, 2).join(' ').trim() || base;
}

function buildProfileForSport(uid, sportKey) {
  const qs = ANSWER_POOLS[sportKey];
  if (!qs) return null;
  return {
    key: sportKey,
    answers: qs.map((q, i) => ({
      q: q.q,
      a: pick(q.pool, hash(uid + ':' + sportKey + ':' + i)),
    })),
  };
}

function buildTimePref(uid) {
  return {
    days: pick(TIME_DAYS, hash(uid + ':days')),
    times: pick(TIME_TIMES, hash(uid + ':times')),
  };
}

// ============================================================
// MAIN
// ============================================================
function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SRC_DIR).filter(f => /\.docx?$/i.test(f) && !f.startsWith('~'));
  console.error(`Found ${files.length} document files`);

  const users = [];
  let withSportsCount = 0, noSportsCount = 0;

  for (const filename of files) {
    const fullpath = path.join(SRC_DIR, filename);
    if (!filename.toLowerCase().endsWith('.docx')) {
      console.error(`  skip (non-docx): ${filename}`);
      continue;
    }
    const text = extractTextFromDocx(fullpath);
    const name = extractName(filename);
    const sports = detectSports(text);
    const uid = 'cm_' + crypto.createHash('md5').update(filename).digest('hex').slice(0, 10);

    if (sports.length === 0) {
      noSportsCount++;
      console.error(`  ⚠ no sports detected: ${name} (${filename})`);
      // Still include them with one random "default" sport so demo has them in pool
      const fallback = ['running','fitness','badminton','yoga'][hash(uid) % 4];
      sports.push(fallback);
    } else {
      withSportsCount++;
    }

    const sportObjs = sports.map(k => buildProfileForSport(uid, k)).filter(Boolean);
    users.push({
      uid,
      nickname: name,
      sports: sportObjs,
      timePref: buildTimePref(uid),
      updatedAt: Date.now(),
      _source: filename,
      _detectedSports: sports,
    });
  }

  console.error(`\nResult: ${users.length} users (${withSportsCount} with real sports, ${noSportsCount} with fallback sport)`);
  console.error(`Writing to ${OUT_FILE}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(users, null, 2));
  console.error('Done.');
}

main();
