import { useEffect, useRef, useState } from 'react';
import { http } from './api';

export function HostAddress({token}:{token:string}) {
  const [address,setAddress]=useState('');
  const [message,setMessage]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let active=true;
    const refresh=()=>void http<{public_url:string|null}>('/host-address',token)
      .then(data=>{if(active){setAddress(data.public_url||'');setMessage('');}})
      .catch(()=>{if(active)setAddress('');});
    refresh();
    const timer=window.setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[token]);
  async function copy(android=false) {
    try {
      await navigator.clipboard.writeText(address+(android?'/api/v1':''));
      setMessage(android?'Адрес для Android скопирован':'Адрес скопирован');
    } catch {
      input.current?.focus();input.current?.select();
      setMessage('Скопируйте выделенный адрес вручную'+(android?' и добавьте /api/v1':''));
    }
  }
  return <div className="host-address">
    {address?<><label htmlFor="host-public-address">Адрес CRS</label>
      <input ref={input} id="host-public-address" readOnly value={address}/>
      <button type="button" onClick={()=>void copy()}>Копировать</button>
      <button type="button" onClick={()=>void copy(true)}>Для Android</button></>
      :<span>Внешний адрес сейчас недоступен</span>}
    <span className="host-address-message" role="status">{message}</span>
  </div>;
}
