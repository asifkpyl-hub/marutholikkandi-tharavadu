const $=id=>document.getElementById(id);
let members=[], currentUser=null, activeTab="members";
async function api(path,opts={}) {
  const res=await fetch(path,{...opts,headers:{"content-type":"application/json",...(opts.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Request failed");
  return data;
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function memberCard(m,admin=false){
  const dates=[m.birth_date&&`ജനനം: ${esc(m.birth_date)}`,m.death_date&&`മരണം: ${esc(m.death_date)}`].filter(Boolean).join(" · ");
  return `<article class="member">${m.photo_url?`<img src="${esc(m.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:""}
  <h3>${esc(m.full_name)}</h3><div class="meta">${dates}${m.branch?`<br>ശാഖ: ${esc(m.branch)}`:""}${m.spouse_name?`<br>പങ്കാളി: ${esc(m.spouse_name)}`:""}</div>
  ${m.biography?`<p>${esc(m.biography)}</p>`:""}${admin?`<button class="outline" onclick="editMember('${m.id}')">തിരുത്തുക</button> <button class="outline" onclick="deleteMember('${m.id}')">നീക്കം</button>`:""}</article>`;
}
function render(){
 const q=$("search").value.trim().toLocaleLowerCase();
 const list=members.filter(m=>m.full_name.toLocaleLowerCase().includes(q)||String(m.branch||"").toLocaleLowerCase().includes(q));
 $("count").textContent=`${list.length} അംഗങ്ങൾ`;
 const groups={}; for(const m of list){const k=m.branch||"കുടുംബാംഗങ്ങൾ";(groups[k]??=[]).push(m);}
 $("tree").innerHTML=Object.entries(groups).map(([k,arr])=>`<h2 class="branch-title">${esc(k)}</h2><div class="member-grid">${arr.map(m=>memberCard(m)).join("")}</div>`).join("")||"<p>കുടുംബാംഗങ്ങളുടെ വിവരങ്ങൾ ലഭ്യമല്ല.</p>";
 if(currentUser?.role==="admin") $("adminMembers").innerHTML=members.map(m=>`<div class="admin-row"><span>${esc(m.full_name)} ${m.is_public===false?"(private)":""}</span><span><button class="outline" onclick="editMember('${m.id}')">Edit</button><button class="outline" onclick="deleteMember('${m.id}')">Delete</button></span></div>`).join("");
 fillParents();
}
async function loadMembers(){const d=await api("/api/members");members=d.members||[];render();}
function fillParents(){for(const id of ["parent1_id","parent2_id"]){const el=$(id),old=el.value;el.innerHTML='<option value="">തിരഞ്ഞെടുക്കുക</option>'+members.map(m=>`<option value="${m.id}">${esc(m.full_name)}</option>`).join("");el.value=old;}}
function clearForm(){ $("memberForm").reset();$("memberId").value="";$("formTitle").textContent="പുതിയ അംഗത്തെ ചേർക്കുക";}
window.editMember=id=>{const m=members.find(x=>x.id===id);if(!m)return; $("memberId").value=id;for(const k of ["full_name","gender","birth_date","death_date","parent1_id","parent2_id","spouse_name","branch","biography","photo_url"])$(k).value=m[k]||"";$("is_public").checked=m.is_public!==false;$("formTitle").textContent="അംഗത്തിന്റെ വിവരങ്ങൾ തിരുത്തുക";$("memberForm").scrollIntoView({behavior:"smooth"});};
window.deleteMember=async id=>{if(!confirm("ഈ അംഗത്തെ നീക്കം ചെയ്യണോ?"))return;try{await api("/api/members/"+id,{method:"DELETE"});await loadMembers();}catch(e){alert(e.message)}};
$("memberForm").onsubmit=async e=>{e.preventDefault();const b={};for(const k of ["full_name","gender","birth_date","death_date","parent1_id","parent2_id","spouse_name","branch","biography","photo_url"])b[k]=$(k).value;b.is_public=$("is_public").checked;try{const id=$("memberId").value;await api(id?"/api/members/"+id:"/api/members",{method:id?"PUT":"POST",body:JSON.stringify(b)});$("formMsg").textContent="സേവ് ചെയ്തു";clearForm();await loadMembers();}catch(err){$("formMsg").textContent=err.message;}};
$("clearForm").onclick=clearForm;
$("adminOpen").onclick=()=>{if(currentUser){$("adminPanel").classList.toggle("hidden");$("adminPanel").scrollIntoView({behavior:"smooth"});}else $("loginDialog").showModal();};
$("closeLogin").onclick=()=>$("loginDialog").close();
$("loginForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("loginUser").value,password:$("loginPass").value})});currentUser=d.user;$("loginDialog").close();await showAdmin();}catch(err){$("loginMsg").textContent=err.message;}};
async function showAdmin(){ $("adminPanel").classList.remove("hidden");$("who").textContent=`${currentUser.display_name} · ${currentUser.role}`;$("adminOpen").textContent="അഡ്മിൻ പാനൽ";await loadMembers();if(currentUser.role==="admin")await loadEditors();else $("editorsTab").classList.add("hidden");$("adminPanel").scrollIntoView({behavior:"smooth"});}
$("logout").onclick=async()=>{await api("/api/logout",{method:"POST"});currentUser=null;$("adminPanel").classList.add("hidden");$("adminOpen").textContent="അഡ്മിൻ ലോഗിൻ";await loadMembers();};
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));$("membersTab").classList.toggle("hidden",activeTab!=="members");$("editorsTab").classList.toggle("hidden",activeTab!=="editors");});
async function loadEditors(){const d=await api("/api/admin/users");$("editorList").innerHTML=d.users.map(u=>`<div class="admin-row"><span>${esc(u.display_name)} · ${esc(u.username)} · ${u.role} · ${u.active?"Active":"Disabled"}</span>${u.role==="editor"?`<button class="outline" onclick="toggleEditor('${u.id}',${u.active?0:1})">${u.active?"Disable":"Enable"}</button>`:""}</div>`).join("");}
window.toggleEditor=async(id,active)=>{await api("/api/admin/users/"+id,{method:"PATCH",body:JSON.stringify({active})});await loadEditors();};
$("editorForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/users",{method:"POST",body:JSON.stringify({username:$("editor_username").value,display_name:$("editor_name").value,password:$("editor_password").value})});$("editorMsg").textContent="എഡിറ്റർ സൃഷ്ടിച്ചു. Login വിവരങ്ങൾ സുരക്ഷിതമായി കൈമാറുക.";$("editorForm").reset();await loadEditors();}catch(err){$("editorMsg").textContent=err.message;}};
$("search").oninput=render;
$("downloadAll").onclick=()=>window.print();
(async()=>{try{await loadMembers();const me=await api("/api/me");currentUser=me.user;if(currentUser)await showAdmin();}catch(e){/* public visitor */}})();
