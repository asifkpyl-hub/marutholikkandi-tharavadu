const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
const uuid = () => crypto.randomUUID();
const enc = new TextEncoder();

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt, iterations:210000, hash:"SHA-256"}, key, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}
function bytesToHex(bytes) { return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function hexToBytes(hex) { return new Uint8Array(hex.match(/.{2}/g).map(x=>parseInt(x,16))); }
function b64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
  return `${body}.${sig}`;
}
async function verify(token, secret) {
  try {
    const [body, signature] = token.split(".");
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
    const sig = Uint8Array.from(atob(signature.replaceAll("-","+").replaceAll("_","/") + "==".slice((signature.length+2)%4)), c=>c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replaceAll("-","+").replaceAll("_","/") + "==".slice((body.length+2)%4)));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function cookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  const part = raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return part ? decodeURIComponent(part.slice(name.length+1)) : "";
}
async function auth(req, env) {
  const token = cookie(req, "mt_session");
  if (!token || !env.SESSION_SECRET) return null;
  const payload = await verify(token, env.SESSION_SECRET);
  if (!payload) return null;
  const user = await env.FAMILY_DB.prepare("SELECT id, username, display_name, role, active FROM users WHERE id=?").bind(payload.sub).first();
  return user && user.active ? user : null;
}
function sessionCookie(token, maxAge=28800) {
  return `mt_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
async function body(req) { try { return await req.json(); } catch { return {}; } }
function safeMember(m) {
  return {id:m.id, full_name:m.full_name, gender:m.gender, birth_date:m.birth_date,
    death_date:m.death_date, parent1_id:m.parent1_id, parent2_id:m.parent2_id,
    spouse_name:m.spouse_name, biography:m.biography, photo_url:m.photo_url,
    branch:m.branch};
}
async function audit(env, user, action, memberId=null) {
  await env.FAMILY_DB.prepare("INSERT INTO audit_log(id,user_id,action,member_id) VALUES(?,?,?,?)")
    .bind(uuid(), user?.id || null, action, memberId).run();
}

async function api(req, env, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/health") return json({ok:true, app:"Marutholikkandi Tharavad"});
  if (req.method === "POST" && path === "/api/setup") {
    if (!env.SETUP_KEY || req.headers.get("x-setup-key") !== env.SETUP_KEY) return json({error:"Setup not authorized"}, 403);
    const count = await env.FAMILY_DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    if (count.n) return json({error:"Initial administrator already exists"}, 409);
    const b = await body(req);
    if (!/^[a-zA-Z0-9._-]{4,40}$/.test(b.username || "") || (b.password || "").length < 12 || !(b.display_name || "").trim())
      return json({error:"Use a 4–40 character username, display name, and password of at least 12 characters."}, 400);
    const p = await hashPassword(b.password);
    const id = uuid();
    await env.FAMILY_DB.prepare("INSERT INTO users(id,username,display_name,password_hash,password_salt,role) VALUES(?,?,?,?,?,'admin')")
      .bind(id,b.username.toLowerCase(),b.display_name.trim(),p.hash,p.salt).run();
    await audit(env,{id},"initial_admin_created");
    return json({ok:true,message:"Administrator created. Remove SETUP_KEY after setup."},201);
  }
  if (req.method === "POST" && path === "/api/login") {
    const b = await body(req);
    const user = await env.FAMILY_DB.prepare("SELECT * FROM users WHERE username=? AND active=1").bind((b.username||"").toLowerCase()).first();
    if (!user) return json({error:"Invalid username or password"},401);
    const p = await hashPassword(b.password || "", user.password_salt);
    if (p.hash !== user.password_hash) return json({error:"Invalid username or password"},401);
    const token = await sign({sub:user.id,exp:Date.now()+8*60*60*1000},env.SESSION_SECRET);
    return new Response(JSON.stringify({ok:true,user:{username:user.username,display_name:user.display_name,role:user.role}}),{
      headers:{"content-type":"application/json","set-cookie":sessionCookie(token),"cache-control":"no-store"}
    });
  }
  if (req.method === "POST" && path === "/api/logout")
    return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":sessionCookie("",0)}});
  if (req.method === "GET" && path === "/api/me") {
    const user = await auth(req,env);
    return user ? json({user:{username:user.username,display_name:user.display_name,role:user.role}}) : json({user:null},401);
  }
  if (req.method === "GET" && path === "/api/members") {
    const user = await auth(req,env);
    const rows = user
      ? await env.FAMILY_DB.prepare("SELECT * FROM family_members ORDER BY full_name COLLATE NOCASE").all()
      : await env.FAMILY_DB.prepare("SELECT * FROM family_members WHERE is_public=1 ORDER BY full_name COLLATE NOCASE").all();
    return json({members:(rows.results||[]).map(safeMember)});
  }
  if (path === "/api/members" && req.method === "POST") {
    const user = await auth(req,env); if (!user) return json({error:"Sign in required"},401);
    const b = await body(req);
    if (!(b.full_name||"").trim()) return json({error:"Name is required"},400);
    const id=uuid();
    await env.FAMILY_DB.prepare(`INSERT INTO family_members
      (id,full_name,gender,birth_date,death_date,parent1_id,parent2_id,spouse_name,biography,photo_url,branch,is_public,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,b.full_name.trim(),b.gender||"",b.birth_date||"",b.death_date||"",b.parent1_id||null,b.parent2_id||null,
        b.spouse_name||"",b.biography||"",b.photo_url||"",b.branch||"",user.role==="admin"?(b.is_public===false?0:1):0,user.id).run();
    await audit(env,user,"member_created",id);
    return json({ok:true,id},201);
  }
  const memberMatch = path.match(/^\/api\/members\/([0-9a-f-]+)$/i);
  if (memberMatch && req.method === "PUT") {
    const user=await auth(req,env); if(!user) return json({error:"Sign in required"},401);
    const id=memberMatch[1], b=await body(req);
    if (!(b.full_name||"").trim()) return json({error:"Name is required"},400);
    const existing=await env.FAMILY_DB.prepare("SELECT id FROM family_members WHERE id=?").bind(id).first();
    if(!existing) return json({error:"Member not found"},404);
    await env.FAMILY_DB.prepare(`UPDATE family_members SET full_name=?,gender=?,birth_date=?,death_date=?,parent1_id=?,parent2_id=?,
      spouse_name=?,biography=?,photo_url=?,branch=?,is_public=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(b.full_name.trim(),b.gender||"",b.birth_date||"",b.death_date||"",b.parent1_id||null,b.parent2_id||null,
        b.spouse_name||"",b.biography||"",b.photo_url||"",b.branch||"",user.role==="admin"?(b.is_public===false?0:1):0,id).run();
    await audit(env,user,"member_updated",id); return json({ok:true});
  }
  if (memberMatch && req.method === "DELETE") {
    const user=await auth(req,env); if(!user || user.role!=="admin") return json({error:"Administrator access required"},403);
    await env.FAMILY_DB.prepare("DELETE FROM family_members WHERE id=?").bind(memberMatch[1]).run();
    await audit(env,user,"member_deleted",memberMatch[1]); return json({ok:true});
  }
  if (req.method === "GET" && path === "/api/admin/users") {
    const user=await auth(req,env); if(!user || user.role!=="admin") return json({error:"Administrator access required"},403);
    const rows=await env.FAMILY_DB.prepare("SELECT id,username,display_name,role,active,created_at FROM users ORDER BY created_at").all();
    return json({users:rows.results||[]});
  }
  if (req.method === "POST" && path === "/api/admin/users") {
    const user=await auth(req,env); if(!user || user.role!=="admin") return json({error:"Administrator access required"},403);
    const b=await body(req);
    if(!/^[a-zA-Z0-9._-]{4,40}$/.test(b.username||"") || (b.password||"").length<12 || !(b.display_name||"").trim())
      return json({error:"Username must be 4–40 characters and password at least 12 characters."},400);
    const p=await hashPassword(b.password), id=uuid();
    try {
      await env.FAMILY_DB.prepare("INSERT INTO users(id,username,display_name,password_hash,password_salt,role) VALUES(?,?,?,?,?,'editor')")
        .bind(id,b.username.toLowerCase(),b.display_name.trim(),p.hash,p.salt).run();
    } catch { return json({error:"That username may already exist."},409); }
    await audit(env,user,"editor_created"); return json({ok:true,id},201);
  }
  const userMatch=path.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
  if(userMatch && req.method==="PATCH") {
    const user=await auth(req,env); if(!user || user.role!=="admin") return json({error:"Administrator access required"},403);
    const b=await body(req);
    if(user.id===userMatch[1] && b.active===false) return json({error:"You cannot disable your own account."},400);
    await env.FAMILY_DB.prepare("UPDATE users SET active=? WHERE id=? AND role='editor'")
      .bind(b.active?1:0,userMatch[1]).run();
    await audit(env,user,"editor_access_changed"); return json({ok:true});
  }
  return json({error:"Not found"},404);
}

export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    if(url.pathname.startsWith("/api/")) {
      try { return await api(req,env,url); }
      catch(e) { console.error("API error",e); return json({error:"Server error. Check Worker logs."},500); }
    }
    return env.ASSETS.fetch(req);
  }
};
