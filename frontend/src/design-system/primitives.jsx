import React,{forwardRef,useId} from 'react';
const cx=(...s)=>s.filter(Boolean).join(' ');
export const Button=forwardRef(function Button({variant='primary',size='md',loading=false,disabled=false,type='button',children,className='',...props},ref){
 return <button {...props} ref={ref} type={type} className={cx('ri-button','ri-button-'+variant,'ri-button-'+size,className)} disabled={disabled||loading} aria-busy={loading||undefined}>
  {loading&&<span className="ri-spinner" aria-hidden="true"/>}{children}
 </button>;
});
function field(Control,{label,description,error,id,className='','aria-describedby':extra,...props},ref,generated){
 const key=id||generated,described=[extra,description&&key+'-description',error&&key+'-error'].filter(Boolean).join(' ')||undefined;
 return <div className={cx('ri-field',error&&'ri-field-error',className)}>
  {label&&<label htmlFor={key}>{label}{props.required&&<span aria-hidden="true"> *</span>}</label>}
  <Control {...props} id={key} ref={ref} className="ri-control" aria-invalid={error?true:props['aria-invalid']} aria-describedby={described}/>
  {description&&<p id={key+'-description'} className="ri-field-description">{description}</p>}
  {error&&<p id={key+'-error'} className="ri-field-message" role="alert">{error}</p>}
 </div>;
}
export const Input=forwardRef(function Input(props,ref){return field('input',{type:'text',...props},ref,useId());});
export const Select=forwardRef(function Select(props,ref){return field('select',props,ref,useId());});
export const Search=forwardRef(function Search({label='Tìm kiếm',...props},ref){return <Input {...props} ref={ref} type="search" label={label}/>;});
export function Card({as:Tag='section',children,className='',...props}){return <Tag {...props} className={cx('ri-card',className)}>{children}</Tag>;}
export function Badge({variant='neutral',children,className='',...props}){return <span {...props} className={cx('ri-badge','ri-badge-'+variant,className)}>{children}</span>;}
export function Skeleton({label='Đang tải nội dung',lines=3}){
 return <div className="ri-skeleton" role="status" aria-busy="true"><span className="ri-sr-only">{label}</span>
  {Array.from({length:Math.min(10,Math.max(1,lines))},(_,i)=><span key={i} className="ri-skeleton-line" aria-hidden="true"/>)}
 </div>;
}
export function EmptyState({title='Chưa có nội dung',description,action}){return <div className="ri-empty"><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
export function ErrorState({title='Không thể tải nội dung',message,onRetry,retryLabel='Thử lại',reference}){
 return <div className="ri-error" role="alert"><h3>{title}</h3>{message&&<p>{message}</p>}{reference&&<p>Mã tham chiếu: <code>{reference}</code></p>}
  {onRetry&&<Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>}
 </div>;
}
export function Toast({tone='info',title,children,onDismiss}){
 return <div className={cx('ri-toast','ri-badge-'+tone)} role={['danger','error'].includes(tone)?'alert':'status'} aria-atomic="true">
  <div><strong>{title}</strong>{children&&<p>{children}</p>}</div>
  {onDismiss&&<Button variant="ghost" size="sm" aria-label="Đóng thông báo" onClick={onDismiss}>×</Button>}
 </div>;
}
export function Table({caption,columns,rows=[],rowKey='id',empty='Chưa có nội dung'}){
 const id=useId();
 return <div className="ri-table-region" role="region" aria-labelledby={id} tabIndex={0}><table className="ri-table">
  <caption id={id}>{caption}</caption><thead><tr>{columns.map(c=><th scope="col" key={c.key} className={c.numeric?'ri-numeric':undefined}>{c.label}</th>)}</tr></thead>
  <tbody>{rows.map((row,i)=><tr key={typeof rowKey==='function'?rowKey(row):row[rowKey]??i}>{columns.map(c=><td key={c.key} className={c.numeric?'ri-numeric':undefined}>{c.render?c.render(row[c.key],row):row[c.key]??'—'}</td>)}</tr>)}
   {!rows.length&&<tr><td colSpan={Math.max(1,columns.length)}><EmptyState title={empty}/></td></tr>}
  </tbody></table></div>;
}
