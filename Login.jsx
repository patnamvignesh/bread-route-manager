import React,{useState} from 'react';
import { request } from '../api';
export default function Login({onLogin}){
 const [email,setEmail]=useState('manager@bread.local'),[password,setPassword]=useState('Manager123!'),[error,setError]=useState('');
 async function submit(e){e.preventDefault();setError('');try{const d=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('token',d.token);localStorage.setItem('user',JSON.stringify(d.user));onLogin(d.user)}catch(e){setError(e.message)}}
 return <main className="login-wrap"><form className="login-card" onSubmit={submit}><div className="eyebrow">ROCKLAND OPERATIONS</div><h1>Delivery control center</h1><p>Sign in as manager or driver.</p>{error&&<div className="error">{error}</div>}<label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Sign in</button><div className="demo"><b>Manager:</b> manager@bread.local / Manager123!<br/><b>Driver:</b> driver@bread.local / Driver123!</div></form></main>
}
