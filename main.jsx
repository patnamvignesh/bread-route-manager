import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LogOut, PackageCheck } from 'lucide-react';
import { request } from './api';
import Login from './pages/Login';
import Manager from './pages/Manager';
import Driver from './pages/Driver';
import './styles.css';

function App(){
 const [user,setUser]=useState(()=>JSON.parse(localStorage.getItem('user')||'null'));
 const logout=()=>{localStorage.clear();setUser(null)};
 if(!user) return <Login onLogin={setUser}/>;
 return <><header><div className="brand"><PackageCheck size={24}/> Bread Route Manager</div><div><span>{user.name} · {user.role}</span><button className="ghost" onClick={logout}><LogOut size={16}/> Sign out</button></div></header>{user.role==='MANAGER'?<Manager/>:<Driver user={user}/>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);

if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
