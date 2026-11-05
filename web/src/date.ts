// Display dates in Russian order while keeping API dates in ISO format.
export function formatDate(value:string):string {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
export function parseDisplayDate(value:string):string|null {
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if(!match)return null;
  const [,day,month,year]=match;
  const iso=`${year}-${month}-${day}`;
  const date=new Date(iso+'T00:00:00Z');
  return year !== '0000' && !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===iso ? iso : null;
}
export function formatTimestamp(value:string):string {
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  const day=String(date.getDate()).padStart(2,'0'), month=String(date.getMonth()+1).padStart(2,'0');
  const hour=String(date.getHours()).padStart(2,'0'), minute=String(date.getMinutes()).padStart(2,'0');
  return `${day}/${month}/${date.getFullYear()} ${hour}:${minute}`;
}
