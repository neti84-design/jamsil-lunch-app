import { SITES, type SiteId } from '../lib/sites';

interface Props {
  value: SiteId;
  onChange: (id: SiteId) => void;
}

/** 오른쪽 위 근무지 바꾸기: 잠실본사 / 영등포맥스 */
export function SiteSwitch({ value, onChange }: Props) {
  return (
    <div className="site-switch" role="radiogroup" aria-label="근무지">
      {(Object.keys(SITES) as SiteId[]).map((id) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {SITES[id].label}
        </button>
      ))}
    </div>
  );
}
