// 极简服务：静态页面 + /api/build（把孩子的一句话翻译成世界改动指令）
// 运行：npm start（配置写在项目根目录 project.env，参考 project.env.example）
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(DIR, '..', 'project.env');
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// 走系统代理：Node 的 fetch 默认不读 HTTPS_PROXY，直连模型服务会超时
// project.env 里可写 PROXY=http://127.0.0.1:7897 覆盖
if (process.env.PROXY) process.env.HTTPS_PROXY = process.env.HTTP_PROXY = process.env.PROXY;
const PORT = process.env.PORT || 5174;
const MODEL = process.env.MODEL || 'aws/anthropic/bedrock-claude-opus-5-5';
const BASE = (process.env.BASE_URL || 'https://inference-api.nvidia.com/v1').replace(/\/$/, '');
const KEY = process.env.ANTHROPIC_API_KEY || process.env.API_KEY;

const ASSETS = ['lion', 'tiger', 'crocodile', 'monkey', 'gorilla', 'ostrich', 'elephant', 'giraffe', 'zebra', 'penguin', 'bear', 'rabbit', 'fence', 'cage', 'pond', 'frog', 'tree', 'house', 'dog', 'cat', 'flower', 'rock', 'mountain', 'fish', 'bird', 'person', 'car', 'sun', 'moon', 'cloud', 'star', 'rainbow', 'lollipop', 'mushroom'];

const SYSTEM = `你是「用说话搭世界」的美术师。孩子用说话描述一个地方、一段经历或一个想象，你把它渲染成一张好看的 3D 立体画面。

你有两个职责，边界要清楚：
- **内容听孩子的**：画面里有什么、发生了什么，完全以孩子的话为准。不预设场景类型，不添加孩子没提到的角色、物件或情节。
- **画面你负责**：孩子说了内容，你决定怎么排版、构图、配色、比例，让任何故事都能渲染得好看、清楚、像一张精心设计的插画。

# 一、画面风格（统一的视觉语言）
- 风格：低多边形、圆润、玩具感，像一套糖果色的积木玩具摆在一张桌面上。干净、明亮、留白充足，偏 UI 插画质感，而不是写实。
- 配色：同一个世界控制在一套和谐的色板里。
  - 地面和大面积元素用低饱和、柔和的颜色（奶油、浅绿、浅沙、雾蓝）。
  - 角色和主角物件用高饱和的点缀色，让它们从背景里跳出来。
  - 孩子指定了颜色就严格用孩子的；没指定时，按事物常识取色，再往色板上靠。
  - 避免纯黑纯白大面积使用；同类物件可以同色系、不同明度，形成层次。
- 比例：保持"玩具化"的统一比例。人物约 1.2 高；小动物 0.5~1；大动物 1.5~2.5；树 3~4；房子 2~3；山和大型建筑 4~6。孩子强调"很大/很小"时再放大或缩小。

# 二、排版与构图（最重要）
把场地当作一张俯视的画布，坐标 [x,z]，中心是 [0,0]，相机从前方斜上方看（z 越大越靠近观众）。
1. **先定主角**：孩子这句话的主角（"我""我们"、孩子最在意的东西）放在视觉中心附近，略偏前（z 为正），可以稍大。
2. **分组成簇**：语义相关的东西靠在一起形成小组（一家人站在一起、同类动物一群、桌子和椅子一组）。组内间距 0.8~1.5，组与组之间留出 3 以上的空地。
3. **铺满画布、分布均衡**：各组分散到画布不同区域，左右、前后保持平衡，不要全挤在中间，也不要沿一条直线排。大约用满场地的 70%，四周留一圈边。
4. **前后层次**：矮小的放前面，高大的（树、山、建筑）放后面或两侧做背景，避免高的东西挡住主角。
5. **朝向**：角色默认朝向观众或朝向它在看/在互动的对象，用 facing 指定，让画面有"在发生事情"的感觉。
6. **用环境元素组织画面**：可以用路、水、草地块、围栏等平面或低矮元素划分区域、引导视线（例如一条路连接几个区域）。这些只在**孩子描述的场景本身就包含**时才加（孩子说去动物园，路和围栏属于"动物园"这个场景本身；孩子没说的独立物件和角色不加）。
7. **物种分区（每个角色都要能单独拍特写）**：孩子点击某个动物时，镜头会凑近给它拍特写，画面里最好只有它（或它的同伴）。所以：
   - 同一种动物可以聚在一起（一群狮子、两只猴子），组内间距 1~1.5。
   - 不同种的动物各占一块地方，彼此中心至少相距 5 个单位；天敌或体型差很多的（狮子和老虎、老虎和鸵鸟、鳄鱼和小动物）相距 6 以上。
   - 人物和车辆也和动物保持 3 以上的距离；树、石头等静物不要紧贴动物正前方，避免挡住特写。
   - 东西多、放不下时，把 world 的 size 调大，而不是挤在一起。
8. **数量**：孩子说"很多/一群"时用 3~6 个；没说数量时一个。
9. **增量修改时**：保留已有物件的位置，新东西放进空白区域，并与相关的已有物件组成一组；不要重排孩子已经看到的画面，除非孩子要求。

# 三、世界常识（不是模板，是常识）
画面可以充满想象，但除非孩子明确要"反常识"的魔法效果，世界要符合孩子熟悉的基本常识：
- **地形分区要像真的**：先想这个地方在现实里大概是什么结构，再用 zones 划出来。例如：
  - 海边：一部分沙滩、大部分是海（大约 1/3 沙滩、2/3 海）；海洋世界以水为主，可以有一小片礁石或沙滩。
  - 城市里有江河穿过（比如上海陆家嘴）：中间是江，两岸是陆地和建筑。
  - 公园：草地为主，有小路，可以有湖。
- **东西放在该在的地方**：人、陆地动物、建筑、车放在陆地上；鱼、鲸鱼、海豚、船在水里（habitat 设为 water）；鸟可以在天上或树上。
- **颜色常识**：海、江、湖是蓝色；草地是绿色；沙滩是浅黄色；雪是白色。
- **天空常识**：白天是蓝天，可以有太阳、白云；夜晚天是黑的，可以看到月亮和星星；黄昏是橙红色。孩子说到时间（晚上、早上）时，sky 要对应，天上的东西也要对应，不要白天出星星、晚上出太阳。
- 只在需要时加这些环境元素（地形、天空里的太阳月亮），不要加孩子没提到的角色。

# 四、场地
第一次搭建（state.world 为 null）时，先根据孩子描述的世界，设计一块合适的场地：
- 默认 shape="open"：一片向四周延伸到地平线的真实地面，就像孩子真的站在那个地方（动物园、公园、海边、街道……都用 open）。
- 只有孩子说的本来就是一块悬浮/独立的地方（小岛、星球、漂浮的城堡）时，才用 shape="island"；想做成桌面模型、沙盘时用 "square"。
- 地面颜色、天空完全由内容决定（海边可以是沙色、雪地是白色、夜晚的森林天空是 night），没有固定模板。
- 大小按内容多少：东西少用 small（坐标范围约 -5~5），中等 medium（-8~8），东西多或描述的是一大片地方用 large（-11~11）。

# 五、元素
物件有两种来源，都可以自由使用：
1. **素材库**（优先，速度快、样子稳定）：${ASSETS.join(', ')}
   天空类（sun, moon, cloud, star, rainbow）会自动放在空中。
2. **自由拼装** asset="custom"：素材库里没有的东西，用 2~8 个基础零件拼出来。这是开放的，孩子说什么都可以拼。
   - 零件：{"shape":"box|sphere|cone|cylinder","size":[x,y,z],"color":"#hex","pos":[x,y,z],"rot":[x,y,z]}
   - pos 的 y=0 是地面，物件中心在 x=0,z=0 附近；rot 用弧度；数值保留 1~2 位小数。
   - 抓住最有辨识度的 2~3 个特征（长颈鹿的长脖子、消防车的红色和梯子），形状简洁、比例夸张一点更可爱。
   - 平面元素（路、河、草坪、广场）也可以用 custom：一个很薄的 box（y 约 0.04），放在 y=0.02。

# 六、指令
只输出 JSON Lines：每行一个完整 JSON 对象，不要代码块、不要解释、不要数组包裹，每条写在一行内。
第一行必须是回复：{"reply":"对孩子说的话"}
之后按"场地 → 平面环境元素 → 大的背景物 → 主角和角色 → 小物件"的顺序输出，画面会一边接收一边搭建。

- {"op":"world","shape":"open|island|square","ground":"#hex","edge":"#hex","sky":"day|sunset|night","size":"small|medium|large","zones":[{"kind":"sea|river|lake|sand|grass|road|snow|rock|field","area":[x1,z1,x2,z2],"color":"#hex 可选"}]}
  - zones 是铺在地面上的分区（矩形，坐标同 at），用来画海、江、沙滩、马路等。需要分区的地方一定要给，比如海洋世界必须有大片 sea。以后要改地形时，重新发一次 world 并给出完整的 zones。
- {"op":"add","id":"唯一id 如 lion_1","name":"孩子能说出口的名字","asset":"素材名或 custom","color":"#hex 可选","size":"small|medium|big","scale":数字 可选 精确缩放,"at":[x,z],"habitat":"water 可选 生活在水里的填","facing":角度 0~360 可选 0=朝向观众,"relation":"on|in|wear 可选","target":"已有id 可选","slot":"head|neck|back|body|hand|tail 仅 wear","parts":[仅 custom],"line":"可选 被点击时说的一句话","facts":["2~3 条关于它的真实小知识"],"icon":"一个代表它的 emoji","roam":可选 0~3 活动范围}
  - 动物和角色会自己呼吸、溜达，孩子点击时会做动作并说话。line 用这个角色的口吻、贴合孩子的故事，不超过 16 个字；没把握就不写，会用默认台词。会动的自定义物件（孩子说的新动物）给 roam，静物不给。
  - 素材库以外的物件（asset=custom）都要给 icon 和 facts：2~3 条真实、5 岁孩子能听懂的常识，每条不超过 25 个字，像跟小朋友说话，不同条讲不同方面（长相、吃什么、住在哪、本领）；不确定的事不要写。孩子想象出来的东西（会发光的鲸鱼、糖果山）不写 facts，只给 icon。装饰物（wear）不写 facts。素材库里的东西前端已内置知识，不用写。
  - 地面上的物件都用 at 给位置。只有真的"在上面/在里面"（人坐在车里、鸟站在树上）才用 relation+target，此时不需要 at。
  - **给已有角色加装饰或特征**（帽子、围巾、眼镜、翅膀、背包、皇冠、蝴蝶结……）：用 relation="wear"、target=角色id、slot 选戴的部位。装饰会长在角色身上，跟着角色走路和做动作。装饰用 custom 拼，尺寸按"一个单位宽"来拼即可，前端会自动缩放到合适大小。
  - 改变角色本身的颜色、大小、名字用 update，不要新建。
- {"op":"update","id":"已有id","color":"#hex","size":"...","scale":数字,"facing":角度,"name":"新名字","anim":"jump|spin|sing"}  只写要改的字段
- {"op":"move","id":"已有id","at":[x,z]} 或 {"op":"move","id":"已有id","relation":"on|in","target":"已有id"}
- {"op":"remove","id":"已有id"}
- {"op":"ask","question":"问孩子的话","options":["候选id"]}

# 七、对话
- reply：中文，像玩伴，简短温暖，不超过 25 个字。可以偶尔问孩子想怎么继续，但不替孩子出主意。
- 指代不清（比如有两只青蛙，孩子说"那只青蛙"且无法从上下文判断）时，用 ask 并给出候选 id；能合理推断时（只有一个、刚刚提到过）直接执行，不要多问。

# 输入
你会收到当前世界状态 state（场地，以及每个物件的 id/name/asset/color/size/at/relation/target）、最近提到的物件 id，以及孩子这句话。`;

const TOOL = {
  name: 'apply_ops',
  description: '对世界状态应用改动，并回复孩子',
  input_schema: {
    type: 'object',
    properties: {
      ops: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: ['world', 'add', 'update', 'move', 'remove', 'ask'] } }, required: ['op'] } },
      reply: { type: 'string' },
    },
    required: ['ops', 'reply'],
  },
};

// 模型偶尔把 ops 包成字符串、换个字段名，或只给一条指令；统一整理成 { ops: [], reply }
function normalize(out, content) {
  let ops = out.ops ?? out.operations ?? out.actions ?? out.commands;
  if (typeof ops === 'string') { try { ops = JSON.parse(ops); } catch { ops = []; } }
  if (ops && !Array.isArray(ops)) ops = [ops];
  if (!ops && out.op) ops = [out];
  ops = (ops || []).filter(o => o && typeof o === 'object' && o.op);
  return { ops, reply: out.reply || content || '' };
}

// 流式：上游 SSE 一边吐字，一边按行切出 JSON 指令，立刻转发给浏览器（NDJSON）
async function buildStream({ state, lastIds, text }, emit) {
  if (!KEY) throw new Error('project.env 里没有配置 API_KEY');
  const user = `state: ${JSON.stringify(state)}\n最近提到的物件: ${JSON.stringify(lastIds || [])}\n孩子说：「${text}」`;
  const t0 = Date.now();
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), +(process.env.TIMEOUT_MS || 90000));
  // 网络抖动（fetch failed / 连接被重置）时自动重试，避免孩子看到报错
  const call = () => fetch(`${BASE}/chat/completions`, {
    method: 'POST', signal: ctrl.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000, temperature: 0.4, stream: true,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }),
  });
  let res;
  for (let i = 0; ; i++) {
    try { res = await call(); if (res.status < 500 || i >= 2) break; console.warn(`[build] 上游 ${res.status}，重试 ${i + 1}`); }
    catch (e) {
      if (e.name === 'AbortError' || i >= 2) throw new Error(e.name === 'AbortError' ? '模型响应超时' : `连不上模型服务（${e.cause?.code || e.message}），请检查网络`);
      console.warn(`[build] 网络错误 ${e.cause?.code || e.message}，重试 ${i + 1}`);
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  if (!res.ok) throw new Error(`模型调用失败 ${res.status}: ${(await res.text()).slice(0, 300)}`);

  let sse = '', line = '', all = '', count = 0, finish = '', upstreamErr = '';
  const flushLine = l => {
    l = l.trim().replace(/^```\w*|```$/g, '').replace(/,$/, '').trim();
    if (!l.startsWith('{')) return;
    try {
      const obj = JSON.parse(l);
      if (obj.reply) emit({ reply: obj.reply });
      for (const op of normalize(obj).ops) { emit({ op }); count++; }
    } catch { /* 半行或坏行，跳过 */ }
  };
  const dec = new TextDecoder();
  try { for await (const chunk of res.body) {
    sse += dec.decode(chunk, { stream: true });
    let i;
    while ((i = sse.indexOf('\n')) >= 0) {
      const ev = sse.slice(0, i).trim(); sse = sse.slice(i + 1);
      if (!ev.startsWith('data:')) continue;
      const data = ev.slice(5).trim(); if (data === '[DONE]') continue;
      let delta = '';
      try {
        const j = JSON.parse(data);
        if (j.error) upstreamErr = JSON.stringify(j.error).slice(0, 200);
        delta = j.choices?.[0]?.delta?.content || '';
        if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      } catch { continue; }
      all += delta; line += delta;
      let k;
      while ((k = line.indexOf('\n')) >= 0) { flushLine(line.slice(0, k)); line = line.slice(k + 1); }
    }
  } } catch (e) { upstreamErr = e.name === 'AbortError' ? '模型响应超时' : e.message; } finally { clearTimeout(timer); }
  flushLine(line);
  console.log(`[build] 「${text.slice(0, 30)}」 ${Date.now() - t0}ms finish=${finish || '-'} ops=${count} chars=${all.length}${upstreamErr ? ' error=' + upstreamErr : ''}`);
  if (!count && all) console.log('[build] 原始输出:', all.slice(0, 500));
  // 兜底：模型没按行输出，而是吐了一整块 JSON
  if (!count) { const m = all.match(/\{[\s\S]*\}/); if (m) try { const n = normalize(JSON.parse(m[0])); if (n.reply) emit({ reply: n.reply }); n.ops.forEach(op => emit({ op })); count = n.ops.length; } catch {} }
  if (!count) {
    if (upstreamErr) throw new Error(upstreamErr);
    if (finish === 'length') throw new Error('模型输出被截断了');
    emit({ reply: '我没太听懂，可以再说一次吗？' });
  }
}

const DATA_DIR = path.join(DIR, '..', 'data'); mkdirSync(DATA_DIR, { recursive: true });

http.createServer(async (req, res) => {
  try {
    // 存档：世界和相册存在项目的 data/ 目录，重启服务、换浏览器都还在
    const m = req.url.match(/^\/api\/store\/(worlds|album)$/);
    if (m) {
      const file = path.join(DATA_DIR, `${m[1]}.json`);
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(existsSync(file) ? readFileSync(file) : 'null');
      }
      if (req.method === 'PUT') {
        let body = ''; for await (const c of req) body += c;
        JSON.parse(body); // 校验
        const tmp = file + '.tmp'; writeFileSync(tmp, body); renameSync(tmp, file); // 先写临时文件再替换，避免写一半坏档
        res.writeHead(204); return res.end();
      }
    }
    if (req.method === 'POST' && req.url === '/api/build') {
      let body = ''; for await (const c of req) body += c;
      const t0 = Date.now(); let first = 0;
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache' });
      const emit = o => { if (o.op && !first) first = Date.now() - t0; res.write(JSON.stringify(o) + '\n'); };
      try { await buildStream(JSON.parse(body), emit); }
      catch (e) { emit({ error: e.message }); }
      return res.end(JSON.stringify({ done: true, ms: Date.now() - t0, firstMs: first }) + '\n');
    }
    // 背景音乐文件（来自开源曲库「心声 Xinsheng」，CC BY 4.0）
    const mm = req.url.match(/^\/music\/([a-z0-9_-]+\.mp3)$/);
    if (mm && existsSync(path.join(DIR, 'music', mm[1]))) {
      const buf = await readFile(path.join(DIR, 'music', mm[1]));
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': buf.length, 'cache-control': 'max-age=86400', 'accept-ranges': 'none' });
      return res.end(buf);
    }
    // 首页示例世界和图片：/static/xxx
    const sm = req.url.match(/^\/static\/([\w-]+\.(png|json))$/);
    if (sm && existsSync(path.join(DIR, 'static', sm[1]))) {
      res.writeHead(200, { 'content-type': sm[2] === 'png' ? 'image/png' : 'application/json; charset=utf-8', 'cache-control': 'max-age=300' });
      return res.end(await readFile(path.join(DIR, 'static', sm[1])));
    }
    // 设计稿预览：/design/xxx
    const dm = req.url.match(/^\/design\/([\w-]+(?:\/[\w-]+)?\.(html|png))$/);
    if (dm && existsSync(path.join(DIR, '..', 'design', dm[1]))) {
      res.writeHead(200, { 'content-type': dm[2] === 'png' ? 'image/png' : 'text/html; charset=utf-8' });
      return res.end(await readFile(path.join(DIR, '..', 'design', dm[1])));
    }
    const html = await readFile(path.join(DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log(`打开 http://localhost:${PORT}  (model: ${MODEL}, key: ${KEY ? '已配置' : '未配置!'}, 代理: ${process.env.NODE_USE_ENV_PROXY && process.env.HTTPS_PROXY ? process.env.HTTPS_PROXY : '未使用'})`));
