export type CrCrumb = {label:string; onSelect?:()=>void};

export function CrBreadcrumbs({items}:{items:CrCrumb[]}) {
  return <nav aria-label="Путь в приложении" className="crs-breadcrumbs">
    <ol>{items.map((item,index)=>(
      <li key={index}>
        {index>0 && <span className="crs-breadcrumb-separator" aria-hidden="true">/</span>}
        {item.onSelect ? <button type="button" onClick={item.onSelect}>{item.label}</button> : <span aria-current="page">{item.label}</span>}
      </li>
    ))}</ol>
  </nav>;
}
