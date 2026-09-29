import type { FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import './mes-list-filters.css';

type Option = { value: string; label: string };

export function MesListFilters({ label, placeholder, value, appliedValue, status, statuses, onValueChange, onSearch, onStatusChange, onReset }: {
  label: string;
  placeholder: string;
  value: string;
  appliedValue: string;
  status: string;
  statuses: Option[];
  onValueChange: (value: string) => void;
  onSearch: () => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
}) {
  function submit(event: FormEvent) { event.preventDefault(); onSearch(); }
  const canReset = Boolean(value || appliedValue || status !== 'all');
  return <div className="mes-list-filters" role="search" aria-label={`${label}筛选`}>
    <form onSubmit={submit}>
      <div className="mes-filter-search"><Search size={17} aria-hidden="true"/><input aria-label={`搜索${label}`} placeholder={placeholder} value={value} onChange={event => onValueChange(event.target.value)}/></div>
      <button className="button primary" type="submit">搜索</button>
    </form>
    <label className="mes-filter-status"><span>状态</span><select aria-label={`${label}状态`} value={status} onChange={event => onStatusChange(event.target.value)}>{statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {canReset && <button className="mes-filter-reset" type="button" onClick={onReset}><X size={15} aria-hidden="true"/>清除筛选</button>}
  </div>;
}
